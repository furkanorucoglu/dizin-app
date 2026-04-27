"""Shared test fixtures: programmatically built tiny PDFs and a tiny index docx.

We build fixtures in code so the test suite is self-contained. Once real
golden-master files (DIZIN_TR.docx etc.) are dropped into tests/fixtures/,
add a `test_golden_master.py` integration test that compares against them.
"""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest


FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ──────────────────────────────────────────────────────────────
# Tiny PDF builder using reportlab (dev-only optional dep).
# ──────────────────────────────────────────────────────────────


def _make_pdf(pages: list[str], path: Path) -> Path:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4

    path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    for text in pages:
        y = height - 60
        for line in text.splitlines() or [""]:
            c.drawString(60, y, line)
            y -= 14
        c.showPage()
    c.save()
    return path


# ──────────────────────────────────────────────────────────────
# Tiny DOCX builder.
# ──────────────────────────────────────────────────────────────


_DOCX_CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""

_DOCX_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""


def _build_paragraphs_xml(paragraphs: list[list[tuple[str, dict]]]) -> str:
    """Each paragraph is a list of (text, props) where props may include
    italic=True, bold=True."""
    out: list[str] = []
    for runs in paragraphs:
        out.append("<w:p>")
        for text, props in runs:
            rpr_parts = []
            if props.get("italic"):
                rpr_parts.append("<w:i/>")
            if props.get("bold"):
                rpr_parts.append("<w:b/>")
            rpr = f"<w:rPr>{''.join(rpr_parts)}</w:rPr>" if rpr_parts else ""
            safe = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
            out.append(
                f'<w:r>{rpr}<w:t xml:space="preserve">{safe}</w:t></w:r>'
            )
        out.append("</w:p>")
    return "".join(out)


def make_docx(paragraphs: list[list[tuple[str, dict]]], path: Path) -> Path:
    body = _build_paragraphs_xml(paragraphs)
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body>"
        "</w:document>"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", _DOCX_CONTENT_TYPES)
        z.writestr("_rels/.rels", _DOCX_RELS)
        z.writestr("word/document.xml", document_xml)
    return path


# ──────────────────────────────────────────────────────────────
# Pytest fixtures
# ──────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def en_pdf_path(tmp_path_factory) -> Path:
    """Tiny EN PDF with 6 pages: 2 pages front-matter, then 'Preface', then
    chapters where 'Hebb' and 'Penfield' are mentioned at known printed pages."""
    pages = [
        "TITLE PAGE",
        "Copyright info",
        "Preface",
        "Chapter 1\n\nHebb wrote about cell assemblies.",
        "Chapter 2\n\nPenfield mapped the cortex.",
        "Chapter 3\n\nHebb again, with Penfield collaborating.",
    ]
    path = tmp_path_factory.mktemp("data") / "en.pdf"
    return _make_pdf(pages, path)


@pytest.fixture(scope="session")
def tr_pdf_path(tmp_path_factory) -> Path:
    """Tiny TR PDF with similar structure but slightly shifted page counts."""
    pages = [
        "BAS LIK SAYFA",
        "Telif",
        "Önsöz",
        "Bölüm 1\n\nHebb hücre topluluklarını yazdı.",
        "Ek bilgi sayfası",  # extra page in translation
        "Bölüm 2\n\nPenfield korteksi haritalandı.",
        "Bölüm 3\n\nHebb tekrar, Penfield ile birlikte.",
    ]
    path = tmp_path_factory.mktemp("data") / "tr.pdf"
    return _make_pdf(pages, path)


@pytest.fixture(scope="session")
def index_docx_path(tmp_path_factory) -> Path:
    """A small index covering Hebb and Penfield with English page numbers."""
    paragraphs = [
        # Hebb on EN printed pages 2, 4
        [("Hebb, Donald, 2, 4", {})],
        # Penfield on EN printed pages 3, 4
        [("Penfield, Wilder, 3, 4", {})],
        # An entry with italic page (figure reference)
        [("open-ended questions, ", {}), ("3", {"italic": True})],
        # An entry with a range
        [("Molaison, Henry (HM), 2-4", {})],
    ]
    path = tmp_path_factory.mktemp("data") / "index.docx"
    return make_docx(paragraphs, path)
