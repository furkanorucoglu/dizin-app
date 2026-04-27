from dizinapp.pdf_extractor import Pdf, extract_pages, detect_front_matter_offset


class TestExtractPages:
    def test_extracts_per_page(self, en_pdf_path):
        pages = extract_pages(en_pdf_path)
        assert len(pages) == 6
        assert "Hebb" in pages[4]
        assert "Penfield" in pages[5]


class TestOffsetDetection:
    def test_detects_preface_offset(self, en_pdf_path):
        pages = extract_pages(en_pdf_path)
        # 'Preface' is on physical page 3 → offset 2
        assert detect_front_matter_offset(pages) == 2


class TestPdfClass:
    def test_printed_pages_after_offset(self, en_pdf_path):
        pdf = Pdf.load(en_pdf_path)
        # Preface is on physical 3 → printed page 1
        assert "Preface" in pdf.printed_pages[1]
        # Chapter 2 is physical 5 → printed 3
        assert "Penfield" in pdf.printed_pages[3]

    def test_pages_containing_returns_printed_numbers(self, en_pdf_path):
        pdf = Pdf.load(en_pdf_path)
        hebb_pages = pdf.pages_containing("Hebb")
        # "Hebb" appears on physical pages 4 and 6 → printed 2 and 4
        assert hebb_pages == {2, 4}

    def test_case_insensitive_search(self, en_pdf_path):
        pdf = Pdf.load(en_pdf_path)
        assert pdf.pages_containing("hebb") == pdf.pages_containing("Hebb")

    def test_empty_term_returns_empty(self, en_pdf_path):
        pdf = Pdf.load(en_pdf_path)
        assert pdf.pages_containing("") == set()
