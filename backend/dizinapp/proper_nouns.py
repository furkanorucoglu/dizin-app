"""Proper-noun and alias detection for index entries.

Implements PROJE_PLANI.md §5.6.
"""
from __future__ import annotations

import re
import unicodedata


_LOWER_CONNECTORS = {"de", "van", "von", "der", "den", "le", "la", "du", "el", "da", "di"}


def is_proper_noun(word: str) -> bool:
    """A word is treated as a proper noun if its first letter is uppercase
    (after stripping whitespace and punctuation) and it is not a connector."""
    if not word:
        return False
    stripped = word.strip().strip(".,;:'\"()[]{}")
    if not stripped:
        return False
    if stripped.lower() in _LOWER_CONNECTORS:
        return False
    first = stripped[0]
    return first.isalpha() and first.isupper()


def proper_noun_aliases(headword: str) -> list[str]:
    """Extract aliases from an index headword.

    Examples:
        'Molaison, Henry (HM)' -> ['Molaison', 'Henry', 'HM']
        'Penfield, Wilder' -> ['Penfield', 'Wilder']
        'open-ended questions' -> []  (not a proper noun)
        'Hebb' -> ['Hebb']
    """
    if not headword:
        return []

    headword = unicodedata.normalize("NFC", headword)

    paren_match = re.search(r"\(([^)]+)\)", headword)
    base = re.sub(r"\([^)]*\)", "", headword).strip().rstrip(",")

    parts = [p.strip() for p in re.split(r",", base) if p.strip()]
    if not parts:
        return []

    surname = parts[0].strip()
    if not is_proper_noun(surname):
        return []

    aliases: list[str] = [surname]

    if len(parts) > 1:
        firstname_tokens = parts[1].split()
        if firstname_tokens:
            first = firstname_tokens[0].strip(".,")
            if is_proper_noun(first) and first.lower() != surname.lower():
                aliases.append(first)

    if paren_match:
        abbr = paren_match.group(1).strip()
        if re.match(r"^[A-Z]{2,}$", abbr) or re.match(r"^[A-Z]\.?[A-Z]\.?$", abbr):
            cleaned = abbr.replace(".", "")
            if cleaned and cleaned not in aliases:
                aliases.append(cleaned)

    seen: set[str] = set()
    deduped: list[str] = []
    for a in aliases:
        key = a.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(a)
    return deduped
