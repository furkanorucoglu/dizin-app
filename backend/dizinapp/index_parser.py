"""DOCX index parsing — preserves run-level formatting (italic, bold, smart quotes).

Implements PROJE_PLANI.md §5.4.

Strategy: parse `word/document.xml` with lxml, walking <w:p> paragraphs and their
<w:r> runs. Each run's element reference is retained so we can later mutate
text in-place (replacing page numbers) without disturbing the surrounding XML.
"""
from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NSMAP = {"w": W_NS}


def _qn(tag: str) -> str:
    return f"{{{W_NS}}}{tag}"


@dataclass
class IndexRun:
    """A single <w:r> run within a paragraph, plus a live element reference."""
    text: str
    italic: bool
    bold: bool
    element: etree._Element  # the <w:r> element (live reference)
    text_elements: list[etree._Element] = field(default_factory=list)  # <w:t> children

    def set_text(self, new_text: str) -> None:
        """Replace the run's text by writing into the first <w:t>, removing extras."""
        if not self.text_elements:
            return
        first = self.text_elements[0]
        first.text = new_text
        first.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        for extra in self.text_elements[1:]:
            parent = extra.getparent()
            if parent is not None:
                parent.remove(extra)
        self.text_elements = [first]
        self.text = new_text


@dataclass
class PageRef:
    """A page reference inside a paragraph (a single number or a range)."""
    start: int
    end: int                  # equals `start` if a single page
    italic: bool
    char_start: int           # offset in the paragraph's concatenated text
    char_end: int             # exclusive
    raw: str                  # original text (e.g. "212" or "215-220")


@dataclass
class IndexParagraph:
    """One paragraph from the index, parsed into runs and detected page refs."""
    paragraph_index: int
    runs: list[IndexRun]
    element: etree._Element
    headword: str = ""
    page_refs: list[PageRef] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "".join(r.text for r in self.runs)


# A page reference token in the text: a number, optionally a range "212-215" or
# "212–215" (en-dash). May be preceded by italic markers — italics are detected
# via run formatting rather than text patterns.
_PAGE_RANGE_RE = re.compile(r"\b(\d{1,4})\s*[-–—]\s*(\d{1,4})\b")
_PAGE_SINGLE_RE = re.compile(r"\b(\d{1,4})\b")


def _extract_run_info(r_elem: etree._Element) -> IndexRun:
    rpr = r_elem.find(_qn("rPr"))
    italic = False
    bold = False
    if rpr is not None:
        i_elem = rpr.find(_qn("i"))
        if i_elem is not None and i_elem.get(_qn("val"), "true") not in ("false", "0"):
            italic = True
        b_elem = rpr.find(_qn("b"))
        if b_elem is not None and b_elem.get(_qn("val"), "true") not in ("false", "0"):
            bold = True
    text_elements = list(r_elem.findall(_qn("t")))
    text = "".join(t.text or "" for t in text_elements)
    return IndexRun(
        text=text,
        italic=italic,
        bold=bold,
        element=r_elem,
        text_elements=text_elements,
    )


def _detect_headword(full_text: str) -> str:
    """Headword = text before the first page-number occurrence, trimmed."""
    m = _PAGE_SINGLE_RE.search(full_text)
    if not m:
        return full_text.strip().rstrip(",")
    head = full_text[: m.start()].strip()
    return head.rstrip(",").strip()


def _char_to_run_index(runs: list[IndexRun]) -> list[tuple[int, int]]:
    """Return list of (start_char, end_char) offsets per run in concatenated text."""
    out: list[tuple[int, int]] = []
    cur = 0
    for r in runs:
        n = len(r.text)
        out.append((cur, cur + n))
        cur += n
    return out


def _is_pageref_italic(start: int, end: int, runs: list[IndexRun],
                      ranges: list[tuple[int, int]]) -> bool:
    """A page ref is considered italic if any covering run is italic."""
    for r, (rs, re_) in zip(runs, ranges):
        if rs < end and re_ > start and r.italic:
            return True
    return False


def _detect_page_refs(full_text: str, runs: list[IndexRun]) -> list[PageRef]:
    run_ranges = _char_to_run_index(runs)
    refs: list[PageRef] = []
    consumed = [False] * len(full_text)

    # Scan ranges first so '212-215' isn't split into two singles.
    for m in _PAGE_RANGE_RE.finditer(full_text):
        start_p = int(m.group(1))
        end_p = int(m.group(2))
        if end_p < start_p:
            continue
        italic = _is_pageref_italic(m.start(), m.end(), runs, run_ranges)
        refs.append(PageRef(
            start=start_p, end=end_p, italic=italic,
            char_start=m.start(), char_end=m.end(), raw=m.group(0),
        ))
        for i in range(m.start(), m.end()):
            consumed[i] = True

    # Singles next.
    for m in _PAGE_SINGLE_RE.finditer(full_text):
        if any(consumed[i] for i in range(m.start(), m.end())):
            continue
        n = int(m.group(1))
        italic = _is_pageref_italic(m.start(), m.end(), runs, run_ranges)
        refs.append(PageRef(
            start=n, end=n, italic=italic,
            char_start=m.start(), char_end=m.end(), raw=m.group(0),
        ))

    refs.sort(key=lambda r: r.char_start)
    return refs


def parse_index_docx(docx_path: str | Path) -> tuple[list[IndexParagraph], etree._ElementTree, zipfile.ZipFile]:
    """Parse the index docx.

    Returns (paragraphs, parsed_tree, source_zip_handle).
    The caller is responsible for closing the zip handle.
    """
    z = zipfile.ZipFile(str(docx_path), "r")
    xml_bytes = z.read("word/document.xml")
    tree = etree.fromstring(xml_bytes)

    paragraphs: list[IndexParagraph] = []
    for idx, p_elem in enumerate(tree.iter(_qn("p"))):
        run_elements = list(p_elem.iter(_qn("r")))
        runs = [_extract_run_info(r) for r in run_elements]
        if not runs and not (p_elem.text or "").strip():
            paragraphs.append(IndexParagraph(
                paragraph_index=idx, runs=[], element=p_elem,
                headword="", page_refs=[],
            ))
            continue
        full_text = "".join(r.text for r in runs)
        headword = _detect_headword(full_text)
        page_refs = _detect_page_refs(full_text, runs)
        paragraphs.append(IndexParagraph(
            paragraph_index=idx, runs=runs, element=p_elem,
            headword=headword, page_refs=page_refs,
        ))

    return paragraphs, tree, z


def iter_pageref_pages(ref: PageRef) -> Iterator[int]:
    """Yield each integer page covered by a PageRef (inclusive)."""
    for n in range(ref.start, ref.end + 1):
        yield n
