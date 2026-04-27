"""dizinapp - PDF index page-number translator (EN -> TR)."""

__version__ = "0.1.0"

from .pdf_extractor import Pdf, extract_pages, detect_front_matter_offset
from .index_parser import parse_index_docx, IndexParagraph, IndexRun
from .proper_nouns import proper_noun_aliases, is_proper_noun
from .mapper import (
    find_chapter_anchors,
    build_global_map,
    assign_pages_for_entry,
    trim_range_to_name_pages,
)

__all__ = [
    "Pdf",
    "extract_pages",
    "detect_front_matter_offset",
    "parse_index_docx",
    "IndexParagraph",
    "IndexRun",
    "proper_noun_aliases",
    "is_proper_noun",
    "find_chapter_anchors",
    "build_global_map",
    "assign_pages_for_entry",
    "trim_range_to_name_pages",
]
