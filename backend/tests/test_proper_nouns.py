from dizinapp.proper_nouns import is_proper_noun, proper_noun_aliases


class TestIsProperNoun:
    def test_capitalized_word(self):
        assert is_proper_noun("Hebb")

    def test_lowercase_word(self):
        assert not is_proper_noun("memory")

    def test_connector_lowercase(self):
        assert not is_proper_noun("van")
        assert not is_proper_noun("de")

    def test_empty(self):
        assert not is_proper_noun("")
        assert not is_proper_noun("   ")

    def test_punctuation_stripped(self):
        assert is_proper_noun("Hebb,")


class TestProperNounAliases:
    def test_simple_surname_only(self):
        assert proper_noun_aliases("Hebb") == ["Hebb"]

    def test_surname_firstname(self):
        assert proper_noun_aliases("Penfield, Wilder") == ["Penfield", "Wilder"]

    def test_with_abbreviation(self):
        assert proper_noun_aliases("Molaison, Henry (HM)") == [
            "Molaison", "Henry", "HM",
        ]

    def test_non_proper_noun(self):
        assert proper_noun_aliases("open-ended questions") == []

    def test_empty_string(self):
        assert proper_noun_aliases("") == []

    def test_dotted_initials(self):
        # "J.K." style abbreviations
        assert "JK" in proper_noun_aliases("Rowling, Joanne (J.K.)")

    def test_dedup_when_first_equals_surname(self):
        result = proper_noun_aliases("Smith, Smith")
        assert result.count("Smith") == 1
