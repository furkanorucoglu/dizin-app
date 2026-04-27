from dataclasses import dataclass

import pytest

from dizinapp.mapper import (
    build_global_map,
    assign_pages_for_entry,
    trim_range_to_name_pages,
    dedupe_page_refs,
)


@dataclass
class FakePdf:
    """A stub Pdf-like object exposing only `pages_containing`."""
    name_to_pages: dict[str, set[int]]

    def pages_containing(self, term: str, case_sensitive: bool = False) -> set[int]:
        if case_sensitive:
            return self.name_to_pages.get(term, set())
        for k, v in self.name_to_pages.items():
            if k.lower() == term.lower():
                return set(v)
        return set()


# ──────────────────────────────────────────────
# build_global_map
# ──────────────────────────────────────────────


class TestBuildGlobalMap:
    def test_single_anchor_identity(self):
        m = build_global_map([(1, 1)], 5)
        assert m == {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}

    def test_two_anchors_linear_interpolation(self):
        # EN 1 -> TR 1, EN 11 -> TR 21 → ratio 2x
        m = build_global_map([(1, 1), (11, 21)], 11)
        assert m[1] == 1
        assert m[6] == 11
        assert m[11] == 21

    def test_handles_pages_before_first_anchor(self):
        m = build_global_map([(3, 5)], 5)
        assert m[1] == 3
        assert m[2] == 4
        assert m[3] == 5

    def test_extrapolation_after_last_anchor(self):
        m = build_global_map([(1, 1), (5, 7)], 8)
        assert m[6] == 8
        assert m[7] == 9
        assert m[8] == 10

    def test_unsorted_anchors_handled(self):
        a = build_global_map([(5, 7), (1, 1)], 5)
        b = build_global_map([(1, 1), (5, 7)], 5)
        assert a == b


# ──────────────────────────────────────────────
# assign_pages_for_entry
# ──────────────────────────────────────────────


class TestAssignPagesForEntry:
    def test_no_aliases_uses_global_map(self):
        en_pdf = FakePdf({})
        tr_pdf = FakePdf({})
        gm = {97: 103, 99: 105}
        result = assign_pages_for_entry([97, 99], [], gm, en_pdf, tr_pdf)
        assert result == {97: 103, 99: 105}

    def test_basic_proper_noun_match(self):
        """Hebb on EN 97, 99 → matched on TR 103, 105."""
        en_pdf = FakePdf({"Hebb": {97, 99}})
        tr_pdf = FakePdf({"Hebb": {103, 105}})
        gm = {97: 103, 98: 104, 99: 105}
        result = assign_pages_for_entry([97, 99], ["Hebb"], gm, en_pdf, tr_pdf)
        assert result == {97: 103, 99: 105}

    def test_collapse_falls_back_to_global(self):
        """If the DP would collapse most EN pages onto a tiny TR set, fallback."""
        en_pdf = FakePdf({"Hebb": {1, 2, 3, 4, 5}})
        tr_pdf = FakePdf({"Hebb": {1}})  # only one TR page has the name
        gm = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}
        result = assign_pages_for_entry(
            [1, 2, 3, 4, 5], ["Hebb"], gm, en_pdf, tr_pdf,
        )
        assert result == {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}

    def test_no_tr_pages_with_name_falls_back(self):
        en_pdf = FakePdf({"Hebb": {97}})
        tr_pdf = FakePdf({"Hebb": set()})
        gm = {97: 103}
        result = assign_pages_for_entry([97], ["Hebb"], gm, en_pdf, tr_pdf)
        assert result == {97: 103}

    def test_monotonic_ordering_preserved(self):
        en_pdf = FakePdf({"X": {10, 20}})
        tr_pdf = FakePdf({"X": {12, 22}})
        gm = {10: 12, 15: 17, 20: 22}
        result = assign_pages_for_entry([10, 20], ["X"], gm, en_pdf, tr_pdf)
        assert result[10] <= result[20]


# ──────────────────────────────────────────────
# trim_range_to_name_pages
# ──────────────────────────────────────────────


class TestTrimRange:
    def test_trims_when_end_missing(self):
        # Range 249-251, but only 249, 250 have the name → trim to 249-250
        # Actually if 251 missing, trim end → 250
        s, e = trim_range_to_name_pages(249, 251, {249, 250})
        assert (s, e) == (249, 250)

    def test_no_trim_needed(self):
        s, e = trim_range_to_name_pages(249, 250, {249, 250})
        assert (s, e) == (249, 250)

    def test_single_page_unchanged(self):
        s, e = trim_range_to_name_pages(249, 249, set())
        assert (s, e) == (249, 249)

    def test_does_not_collapse_below_start(self):
        s, e = trim_range_to_name_pages(249, 252, set())
        assert s == 249 and e == 249


# ──────────────────────────────────────────────
# dedupe_page_refs
# ──────────────────────────────────────────────


class TestDedupePageRefs:
    @dataclass
    class Ref:
        start: int
        end: int
        italic: bool = False

    def test_drops_exact_duplicates(self):
        refs = [self.Ref(212, 212), self.Ref(212, 212)]
        kept = dedupe_page_refs(refs)
        assert len(kept) == 1

    def test_keeps_italic_alongside_regular(self):
        refs = [self.Ref(212, 212, italic=False), self.Ref(212, 212, italic=True)]
        kept = dedupe_page_refs(refs)
        assert len(kept) == 2
