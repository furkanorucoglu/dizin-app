"""Background tasks: analyze and process.

These run via FastAPI's BackgroundTasks (in-process). For multi-worker
deployment, swap to Celery later (Phase 7).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlmodel import select

from dizinapp.docx_writer import apply_translations, write_docx
from dizinapp.index_parser import iter_pageref_pages, parse_index_docx
from dizinapp.mapper import (
    assign_pages_for_entry,
    build_global_map,
    find_chapter_anchors,
    trim_range_to_name_pages,
)
from dizinapp.pdf_extractor import Pdf
from dizinapp.proper_nouns import proper_noun_aliases

from .index_autocorrect import (
    AutoCheckIssue,
    autocorrect_translated_refs,
    write_autocheck_report,
)
from .db import session_scope
from .models import Anchor, IndexEntry, Project, ProgressEvent
from .storage import output_path
from .ws import get_broker


def _publish(project_id: str, phase: str, progress: float, message: str | None = None) -> None:
    event = {
        "phase": phase,
        "progress": round(progress, 3),
        "message": message,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    with session_scope() as s:
        s.add(ProgressEvent(
            project_id=project_id, phase=phase, progress=progress, message=message,
        ))
        s.commit()
    try:
        get_broker().publish_threadsafe(project_id, event)
    except RuntimeError:
        # No running loop in this thread — skip live broadcast (DB still has it)
        pass


def _set_status(project_id: str, status: str, detail: str | None = None) -> None:
    with session_scope() as s:
        proj = s.get(Project, project_id)
        if proj:
            proj.status = status
            proj.status_detail = detail
            proj.updated_at = datetime.now(timezone.utc)
            s.add(proj)
            s.commit()


# ──────────────────────────────────────────────────────────────
# analyze: extract pages, detect offsets, propose anchors
# ──────────────────────────────────────────────────────────────


def run_analyze(project_id: str) -> None:
    try:
        _set_status(project_id, "analyzing")
        _publish(project_id, "analyze", 0.05, "Loading project")

        with session_scope() as s:
            proj = s.get(Project, project_id)
            if not proj:
                return
            en_path = proj.en_pdf_path
            tr_path = proj.tr_pdf_path
            en_offset_override = proj.en_offset
            tr_offset_override = proj.tr_offset

        if not en_path or not tr_path:
            _set_status(project_id, "error", "Missing EN or TR PDF")
            _publish(project_id, "error", 1.0, "Missing EN or TR PDF")
            return

        _publish(project_id, "analyze", 0.2, "Extracting EN PDF")
        en_pdf = Pdf.load(en_path, offset=en_offset_override)
        _publish(project_id, "analyze", 0.5, "Extracting TR PDF")
        tr_pdf = Pdf.load(tr_path, offset=tr_offset_override)

        _publish(project_id, "analyze", 0.8, "Detecting chapter anchors")
        anchors = find_chapter_anchors(en_pdf, tr_pdf)

        with session_scope() as s:
            # Persist detected offsets and anchors (replacing any existing auto ones)
            proj = s.get(Project, project_id)
            if proj:
                proj.en_offset = en_pdf.offset
                proj.tr_offset = tr_pdf.offset
                s.add(proj)

            existing = s.exec(
                select(Anchor).where(Anchor.project_id == project_id)
            ).all()
            for a in existing:
                if a.auto_detected and not a.confirmed:
                    s.delete(a)
            for i, (en, tr) in enumerate(anchors):
                s.add(Anchor(
                    project_id=project_id, en_page=en, tr_page=tr,
                    auto_detected=True, confirmed=False, order_index=i,
                ))
            s.commit()

        _set_status(project_id, "ready")
        _publish(project_id, "analyze", 1.0, "Analysis complete")
    except Exception as e:
        _set_status(project_id, "error", str(e))
        _publish(project_id, "error", 1.0, f"Analyze failed: {e}")
        raise


# ──────────────────────────────────────────────────────────────
# process: run the full mapping and write output docx + entries
# ──────────────────────────────────────────────────────────────


def _confidence(aliases: list[str], en_pages: list[int], tr_pages: list[int]) -> str:
    if not aliases:
        return "medium"
    if not tr_pages:
        return "low"
    return "high"


def _refs_to_json(refs) -> list[dict[str, Any]]:
    return [
        {"start": r.start, "end": r.end, "italic": r.italic, "raw": r.raw}
        for r in refs
    ]


def run_process(project_id: str) -> None:
    try:
        _set_status(project_id, "processing")
        _publish(project_id, "process", 0.0, "Loading project")

        with session_scope() as s:
            proj = s.get(Project, project_id)
            if not proj or not (proj.en_pdf_path and proj.tr_pdf_path and proj.index_docx_path):
                _set_status(project_id, "error", "Missing files")
                _publish(project_id, "error", 1.0, "Missing files")
                return

            anchor_rows = s.exec(
                select(Anchor).where(Anchor.project_id == project_id).order_by(Anchor.order_index)
            ).all()
            anchors = [(a.en_page, a.tr_page) for a in anchor_rows] or [(1, 1)]

            en_path = proj.en_pdf_path
            tr_path = proj.tr_pdf_path
            index_path = proj.index_docx_path
            en_offset = proj.en_offset
            tr_offset = proj.tr_offset

            # Wipe prior entries on re-run
            old_entries = s.exec(
                select(IndexEntry).where(IndexEntry.project_id == project_id)
            ).all()
            for e in old_entries:
                s.delete(e)
            s.commit()

        _publish(project_id, "process", 0.1, "Loading PDFs")
        en_pdf = Pdf.load(en_path, offset=en_offset)
        tr_pdf = Pdf.load(tr_path, offset=tr_offset)

        _publish(project_id, "process", 0.3, "Parsing index")
        paragraphs, tree, zin = parse_index_docx(index_path)

        try:
            global_map = build_global_map(anchors, en_pdf.total_printed_pages)
            total = max(1, len([p for p in paragraphs if p.page_refs]))
            done = 0

            auto_check_issues: list[AutoCheckIssue] = []
            checked_entries = 0

            with session_scope() as s:
                for para in paragraphs:
                    if not para.page_refs:
                        continue
                    aliases = proper_noun_aliases(para.headword)
                    original_refs_json = _refs_to_json(para.page_refs)
                    en_pages = sorted({p for ref in para.page_refs for p in iter_pageref_pages(ref)})
                    page_map = assign_pages_for_entry(
                        en_pages, aliases, global_map, en_pdf, tr_pdf,
                    )

                    tr_with: set[int] = set()
                    if aliases:
                        for name in aliases:
                            tr_with |= tr_pdf.pages_containing(name)

                    translations: dict[int, tuple[int, int]] = {}
                    translated_refs = []
                    for ref in para.page_refs:
                        new_start = page_map.get(ref.start, ref.start)
                        new_end = page_map.get(ref.end, ref.end)
                        if new_end < new_start:
                            new_end = new_start
                        if aliases and tr_with and new_end > new_start:
                            new_start, new_end = trim_range_to_name_pages(
                                new_start, new_end, tr_with,
                            )
                        translations[id(ref)] = (new_start, new_end)

                    auto_check = autocorrect_translated_refs(
                        headword=para.headword,
                        aliases=aliases,
                        page_refs=para.page_refs,
                        initial_translations=translations,
                        tr_pdf=tr_pdf,
                        search_window=3,
                    )
                    translations = auto_check.translations
                    translated_refs = auto_check.translated_refs
                    auto_check_issues.extend(auto_check.issues)
                    checked_entries += 1

                    apply_translations(para, translations)

                    s.add(IndexEntry(
                        project_id=project_id,
                        paragraph_index=para.paragraph_index,
                        headword=para.headword,
                        aliases=list(aliases),
                        is_proper_noun=bool(aliases),
                        original_pages=original_refs_json,
                        translated_pages=translated_refs,
                        confidence=_confidence(aliases, en_pages, sorted(tr_with)),
                        manually_edited=False,
                        raw_text=para.text,
                    ))

                    done += 1
                    if done % 25 == 0 or done == total:
                        progress = 0.3 + 0.6 * (done / total)
                        _publish(project_id, "process", progress, f"{done}/{total} entries")
                s.commit()

            report_out = output_path(project_id, "auto_check_report.json")
            write_autocheck_report(
                output_file=report_out,
                project_id=project_id,
                total_entries=total,
                checked_entries=checked_entries,
                issues=auto_check_issues,
            )

            _publish(project_id, "process", 0.95, "Writing output docx")
            out = output_path(project_id, "output.docx")
            write_docx(index_path, out, tree)
        finally:
            zin.close()

        _set_status(project_id, "done", f"Processing complete. Auto-check corrected {len(auto_check_issues)} page refs.")
        _publish(project_id, "done", 1.0, f"Processing complete. Auto-check corrected {len(auto_check_issues)} page refs.")
    except Exception as e:
        _set_status(project_id, "error", str(e))
        _publish(project_id, "error", 1.0, f"Process failed: {e}")
        raise
