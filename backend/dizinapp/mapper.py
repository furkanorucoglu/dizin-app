"""Page-mapping algorithms.

Implements PROJE_PLANI.md §5.2 (anchors), §5.3 (global map),
§5.5 (proper-noun monotone DP), §5.7 (range trimming).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .pdf_extractor import Pdf


# ──────────────────────────────────────────────────────────────
# §5.2 Chapter anchor detection
# ──────────────────────────────────────────────────────────────

_CHAPTER_HEAD_RE = re.compile(
    r"^\s*(Chapter|CHAPTER|Bölüm|BÖLÜM)\s+([0-9IVX]+)\b",
    re.M,
)


def _detect_chapter_starts(pages: dict[int, str]) -> list[int]:
    """Find printed pages that look like chapter starts.

    Heuristic: page text begins with "Chapter N" / "Bölüm N", or contains
    such a heading near the top, AND the page has relatively short content
    (typical for chapter-opening pages).
    """
    starts: list[int] = []
    seen_chapters: set[str] = set()
    for printed in sorted(pages.keys()):
        text = pages[printed]
        if not text:
            continue
        head = "\n".join(text.splitlines()[:5])
        m = _CHAPTER_HEAD_RE.search(head)
        if m:
            chap_id = m.group(2).upper()
            if chap_id in seen_chapters:
                continue
            seen_chapters.add(chap_id)
            starts.append(printed)
    return starts


def find_chapter_anchors(en_pdf: Pdf, tr_pdf: Pdf) -> list[tuple[int, int]]:
    """Detect chapter-aligned anchors as (en_printed, tr_printed) pairs.

    If chapter counts disagree, falls back to a single (1, 1) anchor.
    Caller may prepend / replace with manual anchors.
    """
    en_starts = _detect_chapter_starts(en_pdf.printed_pages)
    tr_starts = _detect_chapter_starts(tr_pdf.printed_pages)

    if en_starts and tr_starts and len(en_starts) == len(tr_starts):
        anchors = list(zip(en_starts, tr_starts))
        if anchors[0][0] > 1:
            anchors.insert(0, (1, 1))
        return anchors

    return [(1, 1)]


# ──────────────────────────────────────────────────────────────
# §5.3 Global page map (linear interpolation between anchors)
# ──────────────────────────────────────────────────────────────


def build_global_map(
    anchors: list[tuple[int, int]],
    total_en_pages: int,
) -> dict[int, int]:
    """For each EN printed page in [1, total_en_pages] return a TR estimate."""
    if not anchors:
        return {p: p for p in range(1, total_en_pages + 1)}

    anchors = sorted(set(anchors))
    M: dict[int, int] = {}

    # Pages before the first anchor: shift uniformly.
    first_en, first_tr = anchors[0]
    delta = first_tr - first_en
    for en in range(1, first_en):
        M[en] = max(1, en + delta)

    for i in range(len(anchors) - 1):
        e1, t1 = anchors[i]
        e2, t2 = anchors[i + 1]
        span_en = e2 - e1
        if span_en <= 0:
            M[e1] = t1
            continue
        for en in range(e1, e2):
            ratio = (en - e1) / span_en
            M[en] = round(t1 + ratio * (t2 - t1))

    # Tail past the last anchor: linear continuation.
    last_en, last_tr = anchors[-1]
    for en in range(last_en, total_en_pages + 1):
        M[en] = last_tr + (en - last_en)

    return M


# ──────────────────────────────────────────────────────────────
# §5.5 Proper-noun based monotone DP
# ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class _DPState:
    last_tr: int
    cost: float
    assigns: tuple  # tuple of (en, tr) pairs


_DP_TOLERANCE = 4         # how far from global_map a TR page may be picked
_REUSE_PENALTY = 1.5      # penalty for reusing a TR page already assigned


def assign_pages_for_entry(
    en_pages_sorted: list[int],
    aliases: list[str],
    global_map: dict[int, int],
    en_pdf: Pdf,
    tr_pdf: Pdf,
    *,
    tolerance: int = _DP_TOLERANCE,
) -> dict[int, int]:
    """Translate the EN page list of a single index entry to TR pages.

    Strategy (PROJE_PLANI §5.5):
      • If aliases empty → use global map only.
      • Else find pages-with-name in both PDFs.
      • DP over EN pages, choosing a TR page that (a) preserves monotonicity,
        (b) is within `tolerance` of global_map[en], (c) prefers TR pages
        actually containing the name when the EN page does.
      • If the DP "collapses" (most EN pages assigned to a tiny set of TR
        pages — a sign of translation rephrasing), fall back to the global map.
    """
    if not en_pages_sorted:
        return {}

    if not aliases:
        return {p: global_map.get(p, p) for p in en_pages_sorted}

    en_with: set[int] = set()
    tr_with: set[int] = set()
    for name in aliases:
        en_with |= en_pdf.pages_containing(name)
        tr_with |= tr_pdf.pages_containing(name)

    if not tr_with:
        return {p: global_map.get(p, p) for p in en_pages_sorted}

    # Initial state: last_tr = 0, cost = 0, no assignments yet.
    states: dict[int, tuple[float, tuple]] = {0: (0.0, ())}

    for en_p in en_pages_sorted:
        global_tr = global_map.get(en_p, en_p)
        new_states: dict[int, tuple[float, tuple]] = {}

        for last_tr, (cost, assigns) in states.items():
            if en_p in en_with:
                candidates = sorted(p for p in tr_with if p >= last_tr)
                # Restrict to ±tolerance of the global estimate.
                candidates = [p for p in candidates if abs(p - global_tr) <= tolerance]

                # If nothing valid, allow the global estimate itself.
                if not candidates:
                    fallback_tr = max(global_tr, last_tr)
                    candidates = [fallback_tr]

                used_pages = {t for _, t in assigns}
                for tr_p in candidates:
                    reuse_pen = _REUSE_PENALTY if tr_p in used_pages else 0.0
                    new_cost = cost + abs(tr_p - global_tr) + reuse_pen
                    cur = new_states.get(tr_p)
                    if cur is None or cur[0] > new_cost:
                        new_states[tr_p] = (new_cost, assigns + ((en_p, tr_p),))
            else:
                tr_p = max(global_tr, last_tr)
                new_cost = cost + abs(tr_p - global_tr)
                cur = new_states.get(tr_p)
                if cur is None or cur[0] > new_cost:
                    new_states[tr_p] = (new_cost, assigns + ((en_p, tr_p),))

        if not new_states:
            return {p: global_map.get(p, p) for p in en_pages_sorted}
        states = new_states

    best_cost, best_assigns = min(states.values(), key=lambda x: x[0])
    result = dict(best_assigns)

    if len(en_pages_sorted) > 2:
        distinct = len(set(result.values()))
        if distinct * 2 < len(en_pages_sorted):
            return {p: global_map.get(p, p) for p in en_pages_sorted}

    return result


# ──────────────────────────────────────────────────────────────
# §5.7 Range trimming and dedup helpers
# ──────────────────────────────────────────────────────────────


def trim_range_to_name_pages(
    start: int,
    end: int,
    tr_with_name: set[int],
) -> tuple[int, int]:
    """Trim trailing pages of a range that don't actually contain the name."""
    if end <= start:
        return start, end
    while end > start and end not in tr_with_name:
        end -= 1
    return start, end


def dedupe_page_refs(refs):
    """Remove duplicate pages within an entry, keeping italic/non-italic separate.

    Italic page numbers (often figure references) and regular numbers may
    legitimately point to the same page; collapsing them would lose meaning.
    """
    seen_regular: set[int] = set()
    seen_italic: set[int] = set()
    kept = []
    for ref in refs:
        pool = seen_italic if ref.italic else seen_regular
        pages = set(range(ref.start, ref.end + 1))
        if pages.issubset(pool):
            continue
        pool |= pages
        kept.append(ref)
    return kept
