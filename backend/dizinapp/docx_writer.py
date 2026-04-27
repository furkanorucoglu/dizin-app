"""Format-preserving DOCX writer.

Strategy: re-use the original `word/document.xml` parsed via lxml, mutate the
text content of <w:t> nodes covering page-number tokens, then re-zip the
.docx with all other parts unchanged. This preserves run-level formatting
(italic, bold, smart-quotes, fonts, paragraph styles, etc.) byte-for-byte
outside the page-number tokens themselves.
"""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

from lxml import etree

from .index_parser import IndexParagraph, IndexRun, PageRef


def _format_page_ref(start: int, end: int) -> str:
    if end == start:
        return str(start)
    return f"{start}-{end}"


def _replace_text_in_range(
    paragraph: IndexParagraph,
    char_start: int,
    char_end: int,
    new_text: str,
) -> None:
    """Replace paragraph text in [char_start, char_end) with `new_text`.

    The replacement is constrained to the span and respects run boundaries:
      • If the span fits inside one run, edit that run's text only.
      • If the span crosses runs, write `new_text` into the first affected
        run and clear (or trim) the rest of the span in subsequent runs.
        This rarely happens for page numbers but is handled defensively.
    """
    cur = 0
    runs = paragraph.runs
    affected: list[tuple[IndexRun, int, int]] = []

    for r in runs:
        rs, re_ = cur, cur + len(r.text)
        if re_ > char_start and rs < char_end:
            local_start = max(0, char_start - rs)
            local_end = min(len(r.text), char_end - rs)
            affected.append((r, local_start, local_end))
        cur = re_

    if not affected:
        return

    first_run, first_lo, first_hi = affected[0]
    if len(affected) == 1:
        new_run_text = (
            first_run.text[:first_lo] + new_text + first_run.text[first_hi:]
        )
        first_run.set_text(new_run_text)
        return

    # Multi-run span: write the full replacement into the first run, drop the
    # consumed portions in later runs while keeping any trailing text intact.
    first_run.set_text(first_run.text[:first_lo] + new_text)
    for r, lo, hi in affected[1:-1]:
        r.set_text(r.text[:lo] + r.text[hi:])
    last_run, last_lo, last_hi = affected[-1]
    last_run.set_text(last_run.text[:last_lo] + last_run.text[last_hi:])


def apply_translations(
    paragraph: IndexParagraph,
    translations: dict[int, tuple[int, int]],
) -> None:
    """Mutate paragraph runs to replace each PageRef with its translated form.

    `translations` maps the original `id(page_ref)` (Python object id) to a
    `(new_start, new_end)` tuple. We work right-to-left so earlier offsets
    remain valid as we splice text in.
    """
    refs_with_new = []
    for ref in paragraph.page_refs:
        if id(ref) in translations:
            refs_with_new.append((ref, translations[id(ref)]))

    refs_with_new.sort(key=lambda x: x[0].char_start, reverse=True)

    for ref, (new_start, new_end) in refs_with_new:
        new_text = _format_page_ref(new_start, new_end)
        _replace_text_in_range(
            paragraph,
            ref.char_start,
            ref.char_end,
            new_text,
        )


def write_docx(
    source_path: str | Path,
    out_path: str | Path,
    document_tree: etree._Element,
) -> None:
    """Write a new docx by copying `source_path` and replacing
    `word/document.xml` with the serialized `document_tree`.
    """
    source_path = Path(source_path)
    out_path = Path(out_path)

    new_xml = etree.tostring(
        document_tree,
        xml_declaration=True,
        encoding="UTF-8",
        standalone=True,
    )

    with zipfile.ZipFile(source_path, "r") as zin:
        with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == "word/document.xml":
                    zout.writestr(item, new_xml)
                else:
                    zout.writestr(item, zin.read(item.filename))
