"""End-to-end CLI test: running the full pipeline on synthesized fixtures."""
from __future__ import annotations

import zipfile
from pathlib import Path

from dizinapp.cli import main


def _read_document_xml(docx_path: Path) -> str:
    with zipfile.ZipFile(docx_path) as z:
        return z.read("word/document.xml").decode("utf-8")


class TestCliEndToEnd:
    def test_runs_and_writes_output(self, tmp_path, en_pdf_path, tr_pdf_path, index_docx_path):
        output = tmp_path / "out.docx"
        rc = main([
            str(en_pdf_path),
            str(tr_pdf_path),
            str(index_docx_path),
            "-o", str(output),
        ])
        assert rc == 0
        assert output.exists()
        # Output is a valid zip with document.xml
        xml = _read_document_xml(output)
        assert "<w:document" in xml

    def test_preserves_italic_marker(self, tmp_path, en_pdf_path, tr_pdf_path, index_docx_path):
        output = tmp_path / "out.docx"
        main([
            str(en_pdf_path), str(tr_pdf_path), str(index_docx_path),
            "-o", str(output),
        ])
        xml = _read_document_xml(output)
        # Italic run must still be present
        assert "<w:i/>" in xml

    def test_headword_text_unchanged(self, tmp_path, en_pdf_path, tr_pdf_path, index_docx_path):
        output = tmp_path / "out.docx"
        main([
            str(en_pdf_path), str(tr_pdf_path), str(index_docx_path),
            "-o", str(output),
        ])
        xml = _read_document_xml(output)
        # Headwords should survive the rewrite untouched
        assert "Hebb" in xml
        assert "Penfield" in xml
        assert "Molaison" in xml
        # Non-proper-noun entry preserved
        assert "open-ended questions" in xml
