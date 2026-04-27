"""PDF text extraction (per-page) and front-matter offset detection.

Implements PROJE_PLANI.md §5.1.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader


_HYPHEN_AT_LINE_END = re.compile(r"-\n")
_SOFT_HYPHEN = "­"


def _clean_page_text(text: str) -> str:
    """Join hyphenated line breaks and strip soft hyphens, then NFC-normalize."""
    if not text:
        return ""
    text = _HYPHEN_AT_LINE_END.sub("", text)
    text = text.replace(_SOFT_HYPHEN, "")
    return unicodedata.normalize("NFC", text)


def extract_pages(pdf_path: str | Path) -> dict[int, str]:
    """Extract text for each physical page (1-indexed)."""
    reader = PdfReader(str(pdf_path))
    pages: dict[int, str] = {}
    for i, page in enumerate(reader.pages, start=1):
        try:
            raw = page.extract_text() or ""
        except Exception:
            raw = ""
        pages[i] = _clean_page_text(raw)
    return pages


_PREFACE_RE = re.compile(r"^\s*(Preface|Önsöz|Foreword|Giriş)\s*$", re.M | re.I)
_CHAPTER_ONE_RE = re.compile(r"^\s*(Chapter\s+1|Bölüm\s+1|1\.\s*Bölüm)\b", re.M | re.I)
_BARE_ONE_RE = re.compile(r"^\s*1\s*$", re.M)


def detect_front_matter_offset(pages: dict[int, str]) -> int:
    """Find the physical page number where printed page 1 begins.

    Returns offset such that: printed_page = physical_page - offset.
    Strategy:
      1. Look for "Preface" / "Önsöz" / "Foreword" alone on a line.
      2. Otherwise look for "Chapter 1" / "Bölüm 1" headings.
      3. Otherwise look for a page whose only content is "1".
    """
    candidates: list[int] = []
    for phys in sorted(pages.keys()):
        text = pages[phys]
        if not text.strip():
            continue
        if _PREFACE_RE.search(text):
            return phys - 1
        if _CHAPTER_ONE_RE.search(text):
            candidates.append(phys)

    if candidates:
        return candidates[0] - 1

    # Fallback: bare '1' on a page
    for phys in sorted(pages.keys()):
        if _BARE_ONE_RE.search(pages[phys]):
            return phys - 1

    raise ValueError(
        "Front matter offset could not be auto-detected; "
        "please supply --offset manually."
    )


@dataclass
class Pdf:
    """A PDF together with its detected (or supplied) front-matter offset.

    `offset` maps physical → printed: printed = physical - offset.
    Example: if Preface (printed page 1) is at physical page 9, offset = 8.
    """
    physical_pages: dict[int, str]
    offset: int = 0
    path: str | None = None
    _printed_cache: dict[int, str] = field(default=None, init=False, repr=False)

    @classmethod
    def load(cls, path: str | Path, offset: int | None = None) -> "Pdf":
        pages = extract_pages(path)
        if offset is None:
            try:
                offset = detect_front_matter_offset(pages)
            except ValueError:
                offset = 0
        return cls(physical_pages=pages, offset=offset, path=str(path))

    @property
    def printed_pages(self) -> dict[int, str]:
        if self._printed_cache is None:
            cache: dict[int, str] = {}
            for phys, text in self.physical_pages.items():
                printed = phys - self.offset
                if printed >= 1:
                    cache[printed] = text
            self._printed_cache = cache
        return self._printed_cache

    @property
    def total_printed_pages(self) -> int:
        if not self.printed_pages:
            return 0
        return max(self.printed_pages.keys())

    def pages_containing(self, term: str, case_sensitive: bool = False) -> set[int]:
        """Return set of printed page numbers whose text contains `term`."""
        if not term:
            return set()
        haystack_pages = self.printed_pages
        if case_sensitive:
            return {p for p, t in haystack_pages.items() if term in t}
        needle = term.lower()
        return {p for p, t in haystack_pages.items() if needle in t.lower()}
