"""Index entry listing + manual override + export."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select, func

from ..auth import CurrentUser, get_current_user
from ..db import get_session
from ..models import IndexEntry, Project
from ..storage import output_path


router = APIRouter(prefix="/api/projects", tags=["entries"])


class PageRefOut(BaseModel):
    start: int
    end: int
    italic: bool = False
    raw: str | None = None


class EntryOut(BaseModel):
    id: int
    paragraph_index: int
    headword: str
    aliases: list[str]
    is_proper_noun: bool
    original_pages: list[PageRefOut]
    translated_pages: list[PageRefOut]
    confidence: str
    manually_edited: bool
    raw_text: str | None


class EntriesPage(BaseModel):
    total: int
    items: list[EntryOut]
    offset: int
    limit: int


class EntryUpdate(BaseModel):
    translated_pages: list[PageRefOut]


def _to_out(e: IndexEntry) -> EntryOut:
    return EntryOut(
        id=e.id,
        paragraph_index=e.paragraph_index,
        headword=e.headword,
        aliases=list(e.aliases or []),
        is_proper_noun=e.is_proper_noun,
        original_pages=[PageRefOut(**p) for p in (e.original_pages or [])],
        translated_pages=[PageRefOut(**p) for p in (e.translated_pages or [])],
        confidence=e.confidence,
        manually_edited=e.manually_edited,
        raw_text=e.raw_text,
    )


def _get_owned_project(session: Session, project_id: str, user: CurrentUser) -> Project:
    p = session.get(Project, project_id)
    if not p or p.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.get("/{project_id}/entries", response_model=EntriesPage)
def list_entries(
    project_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    q: str | None = Query(None, description="case-insensitive headword filter"),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> EntriesPage:
    _get_owned_project(session, project_id, user)

    base = select(IndexEntry).where(IndexEntry.project_id == project_id)
    count_base = select(func.count()).select_from(IndexEntry).where(IndexEntry.project_id == project_id)
    if q:
        like = f"%{q.lower()}%"
        base = base.where(func.lower(IndexEntry.headword).like(like))
        count_base = count_base.where(func.lower(IndexEntry.headword).like(like))

    total = session.exec(count_base).one()
    rows = session.exec(
        base.order_by(IndexEntry.paragraph_index).offset(offset).limit(limit)
    ).all()
    return EntriesPage(
        total=total,
        items=[_to_out(e) for e in rows],
        offset=offset,
        limit=limit,
    )


@router.patch("/{project_id}/entries/{entry_id}", response_model=EntryOut)
def update_entry(
    project_id: str,
    entry_id: int,
    body: EntryUpdate,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> EntryOut:
    _get_owned_project(session, project_id, user)
    entry = session.get(IndexEntry, entry_id)
    if not entry or entry.project_id != project_id:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.translated_pages = [p.model_dump() for p in body.translated_pages]
    entry.manually_edited = True
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return _to_out(entry)




def _project_entries(session: Session, project_id: str) -> list[IndexEntry]:
    return session.exec(
        select(IndexEntry)
        .where(IndexEntry.project_id == project_id)
        .order_by(IndexEntry.paragraph_index)
    ).all()


def _download_filename(title: str | None, suffix: str, ext: str) -> str:
    import re

    base = (title or "dizin").strip() or "dizin"
    base = re.sub(r"[^\w\-.ğüşöçıİĞÜŞÖÇ]+", "_", base, flags=re.UNICODE).strip("_")
    return f"{base}_{suffix}.{ext}"


def _attachment_headers(filename: str) -> dict[str, str]:
    from urllib.parse import quote

    return {
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
        "Cache-Control": "no-store",
    }


@router.get("/{project_id}/entries/export/pdf")
def export_entries_pdf(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    """Download the final corrected Turkish index as PDF."""
    from dizinapp.report import generate_index_pdf

    proj = _get_owned_project(session, project_id, user)
    entries = _project_entries(session, project_id)
    pdf_bytes = generate_index_pdf(proj.title, entries)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers=_attachment_headers(_download_filename(proj.title, "dizin", "pdf")),
    )


@router.get("/{project_id}/entries/export/docx")
def export_entries_docx(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    """Download the final corrected Turkish index as Word DOCX."""
    from dizinapp.report import generate_index_docx

    proj = _get_owned_project(session, project_id, user)
    entries = _project_entries(session, project_id)
    docx_bytes = generate_index_docx(proj.title, entries)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=_attachment_headers(_download_filename(proj.title, "dizin", "docx")),
    )


@router.get("/{project_id}/entries/export/comparison-pdf")
def export_entries_comparison_pdf(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    """Download side-by-side comparison: first uploaded index vs final corrected index."""
    from dizinapp.report import generate_comparison_pdf

    proj = _get_owned_project(session, project_id, user)
    entries = _project_entries(session, project_id)
    pdf_bytes = generate_comparison_pdf(proj.title, entries)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers=_attachment_headers(_download_filename(proj.title, "karsilastirma", "pdf")),
    )


# Backward-compatible legacy endpoints. Older frontend builds may still call these.
@router.get("/{project_id}/export.pdf")
def export_pdf(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    return export_entries_pdf(project_id=project_id, user=user, session=session)


@router.get("/{project_id}/export.docx")
def export_docx(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    return export_entries_docx(project_id=project_id, user=user, session=session)


@router.get("/{project_id}/export-comparison.pdf")
def export_comparison_pdf(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    return export_entries_comparison_pdf(project_id=project_id, user=user, session=session)
