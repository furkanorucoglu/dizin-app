"""Tests for the format-preserving docx writer."""
from __future__ import annotations

import zipfile
from pathlib import Path

from dizinapp.index_parser import parse_index_docx
from dizinapp.docx_writer import apply_translations, write_docx


def _read_document_xml(docx_path: Path) -> str:
    with zipfile.ZipFile(docx_path) as z:
        return z.read("word/document.xml").decode("utf-8")


class TestDocxWriter:
    def test_replaces_single_page_number(self, index_docx_path, tmp_path):
        paragraphs, tree, zin = parse_index_docx(index_docx_path)
        try:
            hebb_para = next(p for p in paragraphs if "Hebb" in p.headword)
            translations = {}
            for ref in hebb_para.page_refs:
                # Pretend we mapped 2→5 and 4→9
                if ref.start == 2:
                    translations[id(ref)] = (5, 5)
                elif ref.start == 4:
                    translations[id(ref)] = (9, 9)
            apply_translations(hebb_para, translations)

            out = tmp_path / "out.docx"
            write_docx(index_docx_path, out, tree)
        finally:
            zin.close()

        xml = _read_document_xml(out)
        assert ", 5, 9" in xml or ",5,9" in xml or "Hebb, Donald, 5, 9" in xml

    def test_replaces_range(self, index_docx_path, tmp_path):
        paragraphs, tree, zin = parse_index_docx(index_docx_path)
        try:
            molaison = next(p for p in paragraphs if "Molaison" in p.headword)
            translations = {}
            for ref in molaison.page_refs:
                translations[id(ref)] = (10, 12)
            apply_translations(molaison, translations)
            out = tmp_path / "out.docx"
            write_docx(index_docx_path, out, tree)
        finally:
            zin.close()

        xml = _read_document_xml(out)
        assert "10-12" in xml

    def test_other_zip_entries_unchanged(self, index_docx_path, tmp_path):
        paragraphs, tree, zin = parse_index_docx(index_docx_path)
        try:
            out = tmp_path / "out.docx"
            write_docx(index_docx_path, out, tree)
        finally:
            zin.close()

        with zipfile.ZipFile(index_docx_path) as zin1, zipfile.ZipFile(out) as zin2:
            for name in zin1.namelist():
                if name == "word/document.xml":
                    continue
                assert zin1.read(name) == zin2.read(name)
