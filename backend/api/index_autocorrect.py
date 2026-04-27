"""Conservative automatic page validation/correction for generated index entries.

This module performs a second-pass check after EN→TR page mapping.
For each generated TR page/range it searches the TR PDF for the index headword
(or proper-noun aliases). If the generated page does not contain the term but a
nearby page does, the page is shifted to the closest nearby hit.

The correction is intentionally conservative:
- very short/generic terms are skipped,
- pages are corrected only within a small ±window,
- ranges are kept at the same width to avoid unexpectedly rewriting one index
  reference into multiple references.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


@dataclass
class AutoCheckIssue:
    headword: str
    raw_ref: str
    old_start: int
    old_end: int
    new_start: int
    new_end: int
    reason: str
    nearby_hits: list[int] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "headword": self.headword,
            "raw_ref": self.raw_ref,
            "old_start": self.old_start,
            "old_end": self.old_end,
            "new_start": self.new_start,
            "new_end": self.new_end,
            "reason": self.reason,
            "nearby_hits": self.nearby_hits,
        }


@dataclass
class AutoCheckResult:
    translations: dict[int, tuple[int, int]]
    translated_refs: list[dict[str, Any]]
    issues: list[AutoCheckIssue]

    @property
    def corrected_count(self) -> int:
        return len(self.issues)


_TURKISH_TRANSLATION = str.maketrans({
    "ç": "c", "Ç": "c",
    "ğ": "g", "Ğ": "g",
    "ı": "i", "I": "i",
    "İ": "i", "i": "i",
    "ö": "o", "Ö": "o",
    "ş": "s", "Ş": "s",
    "ü": "u", "Ü": "u",
})


def normalize_text(value: str) -> str:
    """Normalize Turkish/English text for safer PDF text matching."""
    value = value.translate(_TURKISH_TRANSLATION).lower()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _clean_search_term(term: str) -> str:
    """Remove cross-reference markers and parenthetical explanations."""
    term = re.sub(r"\(.*?\)", " ", term or "")
    term = re.sub(r"\bbkz\.?\b", " ", term, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", term).strip(" ,;:.\t\n")


def _search_terms(headword: str, aliases: Iterable[str] | None) -> list[str]:
    candidates: list[str] = []
    for term in [headword, *(aliases or [])]:
        cleaned = _clean_search_term(term)
        normalized = normalize_text(cleaned)
        # Very short terms create too many false positives in full book text.
        if len(normalized) >= 4 and cleaned not in candidates:
            candidates.append(cleaned)
    return candidates


def _safe_pages_containing(pdf: Any, term: str) -> set[int]:
    """Call Pdf.pages_containing defensively and normalize its result."""
    try:
        pages = pdf.pages_containing(term)
    except Exception:
        return set()
    try:
        return {int(p) for p in pages if int(p) > 0}
    except Exception:
        return set()


def find_term_pages(pdf: Any, headword: str, aliases: Iterable[str] | None = None) -> set[int]:
    """Find logical/printed PDF pages containing headword or aliases."""
    pages: set[int] = set()
    for term in _search_terms(headword, aliases):
        pages |= _safe_pages_containing(pdf, term)
    return pages


def _format_ref(start: int, end: int) -> str:
    return f"{start}-{end}" if start != end else str(start)


def _nearby_hits(hits: set[int], start: int, end: int, window: int) -> list[int]:
    lo = min(start, end) - window
    hi = max(start, end) + window
    return sorted(p for p in hits if lo <= p <= hi)


def _correct_single_page(page: int, hits: set[int], window: int) -> tuple[int, list[int], str | None]:
    """Correct one generated page if a nearby hit is more plausible."""
    if not hits:
        return page, [], None
    if page in hits:
        return page, [page], None

    candidates = _nearby_hits(hits, page, page, window)
    if not candidates:
        return page, [], None

    best = min(candidates, key=lambda p: (abs(p - page), p))
    if best != page:
        return best, candidates, "mapped page did not contain term; nearby page matched"
    return page, candidates, None


def _correct_range(start: int, end: int, hits: set[int], window: int) -> tuple[int, int, list[int], str | None]:
    """Correct a page range while preserving its width.

    If any matched page already falls inside the generated range, the range is
    accepted. If not, it searches nearby pages and shifts the whole range so the
    closest matched page falls inside the corrected range.
    """
    if end < start:
        end = start

    if not hits:
        return start, end, [], None

    current_range = set(range(start, end + 1))
    inside = sorted(hits & current_range)
    if inside:
        return start, end, inside, None

    candidates = _nearby_hits(hits, start, end, window)
    if not candidates:
        return start, end, [], None

    width = end - start
    midpoint = (start + end) / 2
    best = min(candidates, key=lambda p: (abs(p - midpoint), p))

    # Preserve range width. For a 34-35 range and best hit 35, keep 35-36.
    new_start = max(1, best)
    new_end = new_start + width
    return new_start, new_end, candidates, "mapped range did not contain term; nearby range matched"


def autocorrect_translated_refs(
    *,
    headword: str,
    aliases: Iterable[str] | None,
    page_refs: Iterable[Any],
    initial_translations: dict[int, tuple[int, int]],
    tr_pdf: Any,
    search_window: int = 3,
) -> AutoCheckResult:
    """Validate and conservatively correct translated page refs.

    Parameters
    ----------
    headword:
        The visible index term.
    aliases:
        Proper noun aliases, when available.
    page_refs:
        Original PageRef-like objects. Each must expose start/end/italic/raw.
    initial_translations:
        Mapping from id(ref) to generated (start, end) TR pages.
    tr_pdf:
        Loaded Turkish Pdf object.
    search_window:
        Maximum page distance for auto correction. Use 2-3 for safe correction.
    """
    hits = find_term_pages(tr_pdf, headword, aliases)
    translations: dict[int, tuple[int, int]] = {}
    translated_refs: list[dict[str, Any]] = []
    issues: list[AutoCheckIssue] = []

    for ref in page_refs:
        old_start, old_end = initial_translations[id(ref)]
        if old_end < old_start:
            old_end = old_start

        if old_start == old_end:
            new_page, nearby, reason = _correct_single_page(old_start, hits, search_window)
            new_start, new_end = new_page, new_page
        else:
            new_start, new_end, nearby, reason = _correct_range(old_start, old_end, hits, search_window)

        if new_end < new_start:
            new_end = new_start

        translations[id(ref)] = (new_start, new_end)
        translated_refs.append({
            "start": new_start,
            "end": new_end,
            "italic": getattr(ref, "italic", False),
            "raw": _format_ref(new_start, new_end),
            "auto_checked": bool(hits),
            "auto_corrected": (new_start, new_end) != (old_start, old_end),
        })

        if reason and (new_start, new_end) != (old_start, old_end):
            issues.append(AutoCheckIssue(
                headword=headword,
                raw_ref=str(getattr(ref, "raw", _format_ref(old_start, old_end))),
                old_start=old_start,
                old_end=old_end,
                new_start=new_start,
                new_end=new_end,
                reason=reason,
                nearby_hits=nearby,
            ))

    return AutoCheckResult(
        translations=translations,
        translated_refs=translated_refs,
        issues=issues,
    )


def write_autocheck_report(
    *,
    output_file: str | Path,
    project_id: str,
    total_entries: int,
    checked_entries: int,
    issues: list[AutoCheckIssue],
) -> None:
    """Write a JSON report for debugging/review."""
    payload = {
        "project_id": project_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "strategy": "term-search-near-generated-page",
        "search_window": 3,
        "total_entries": total_entries,
        "checked_entries": checked_entries,
        "corrected_refs": len(issues),
        "issues": [issue.as_dict() for issue in issues],
    }
    Path(output_file).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
