"""dizinapp CLI — translate an English book index to Turkish page numbers.

Usage:
    python -m dizinapp.cli en.pdf tr.pdf index.docx -o output.docx
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .pdf_extractor import Pdf
from .index_parser import parse_index_docx, iter_pageref_pages
from .proper_nouns import proper_noun_aliases
from .mapper import (
    find_chapter_anchors,
    build_global_map,
    assign_pages_for_entry,
    trim_range_to_name_pages,
)
from .docx_writer import apply_translations, write_docx


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="dizinapp",
        description="Translate an English book index's page numbers to "
                    "match a Turkish translation, preserving formatting.",
    )
    p.add_argument("en_pdf", help="Original English PDF")
    p.add_argument("tr_pdf", help="Turkish translation PDF")
    p.add_argument("index_docx", help="Source index .docx (English page numbers)")
    p.add_argument("-o", "--output", required=True, help="Output .docx path")
    p.add_argument("--en-offset", type=int, default=None,
                   help="Front-matter offset for EN PDF (printed = physical - offset)")
    p.add_argument("--tr-offset", type=int, default=None,
                   help="Front-matter offset for TR PDF")
    p.add_argument("--anchors", type=str, default=None,
                   help="Path to JSON file with manual anchors: "
                        "[[en_page, tr_page], ...]")
    p.add_argument("--verbose", "-v", action="store_true")
    return p


def _load_anchors(path: str | None) -> list[tuple[int, int]] | None:
    if not path:
        return None
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return [(int(a), int(b)) for a, b in data]


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)

    if args.verbose:
        print(f"Loading EN PDF: {args.en_pdf}", file=sys.stderr)
    en_pdf = Pdf.load(args.en_pdf, offset=args.en_offset)

    if args.verbose:
        print(f"Loading TR PDF: {args.tr_pdf}", file=sys.stderr)
    tr_pdf = Pdf.load(args.tr_pdf, offset=args.tr_offset)

    if args.verbose:
        print(f"  EN offset={en_pdf.offset}, total printed pages={en_pdf.total_printed_pages}",
              file=sys.stderr)
        print(f"  TR offset={tr_pdf.offset}, total printed pages={tr_pdf.total_printed_pages}",
              file=sys.stderr)

    manual_anchors = _load_anchors(args.anchors)
    anchors = manual_anchors or find_chapter_anchors(en_pdf, tr_pdf)
    if args.verbose:
        print(f"Anchors: {anchors}", file=sys.stderr)

    total_en = en_pdf.total_printed_pages
    global_map = build_global_map(anchors, total_en)

    paragraphs, tree, zin = parse_index_docx(args.index_docx)
    try:
        for para in paragraphs:
            if not para.page_refs:
                continue

            aliases = proper_noun_aliases(para.headword)
            en_pages = sorted({p for ref in para.page_refs for p in iter_pageref_pages(ref)})
            page_map = assign_pages_for_entry(
                en_pages, aliases, global_map, en_pdf, tr_pdf,
            )

            tr_with_name: set[int] = set()
            if aliases:
                for name in aliases:
                    tr_with_name |= tr_pdf.pages_containing(name)

            translations: dict[int, tuple[int, int]] = {}
            for ref in para.page_refs:
                new_start = page_map.get(ref.start, ref.start)
                new_end = page_map.get(ref.end, ref.end)
                if new_end < new_start:
                    new_end = new_start
                if aliases and tr_with_name and new_end > new_start:
                    new_start, new_end = trim_range_to_name_pages(
                        new_start, new_end, tr_with_name,
                    )
                translations[id(ref)] = (new_start, new_end)

            apply_translations(para, translations)

        write_docx(args.index_docx, args.output, tree)
    finally:
        zin.close()

    if args.verbose:
        print(f"Wrote {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
