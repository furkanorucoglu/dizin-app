from dizinapp.index_parser import parse_index_docx


class TestParseIndexDocx:
    def test_parses_paragraphs_and_pages(self, index_docx_path):
        paragraphs, tree, zin = parse_index_docx(index_docx_path)
        try:
            non_empty = [p for p in paragraphs if p.runs]
            assert len(non_empty) == 4

            hebb = non_empty[0]
            assert hebb.headword.startswith("Hebb")
            pages = sorted(p for ref in hebb.page_refs for p in range(ref.start, ref.end + 1))
            assert pages == [2, 4]

            penfield = non_empty[1]
            assert penfield.headword.startswith("Penfield")
            pages = sorted(p for ref in penfield.page_refs for p in range(ref.start, ref.end + 1))
            assert pages == [3, 4]
        finally:
            zin.close()

    def test_italic_run_detected(self, index_docx_path):
        paragraphs, tree, zin = parse_index_docx(index_docx_path)
        try:
            non_empty = [p for p in paragraphs if p.runs]
            italic_para = non_empty[2]  # "open-ended questions, " then italic "3"
            assert any(r.italic for r in italic_para.runs)
            italic_refs = [ref for ref in italic_para.page_refs if ref.italic]
            assert len(italic_refs) == 1
            assert italic_refs[0].start == 3
        finally:
            zin.close()

    def test_range_parsed_as_single_ref(self, index_docx_path):
        paragraphs, tree, zin = parse_index_docx(index_docx_path)
        try:
            non_empty = [p for p in paragraphs if p.runs]
            molaison = non_empty[3]
            assert len(molaison.page_refs) == 1
            assert molaison.page_refs[0].start == 2
            assert molaison.page_refs[0].end == 4
        finally:
            zin.close()
