import unittest

from extract_raz_books import (
    accept_sentence,
    audit_sentences,
    collect_sentences,
    split_sentences,
)


class SplitSentencesTest(unittest.TestCase):
    def test_keeps_titles_with_their_names(self):
        self.assertEqual(
            split_sentences("Dr. Wong smiled. Then he waved."),
            ["Dr. Wong smiled.", "Then he waved."],
        )

    def test_keeps_initialisms_with_their_following_words(self):
        self.assertEqual(
            split_sentences("The ship joined the U.S. Navy. It sailed."),
            ["The ship joined the U.S. Navy.", "It sailed."],
        )

    def test_splits_after_a_lowercase_time_abbreviation(self):
        self.assertEqual(
            split_sentences("It’s 2 a.m. Time to get up."),
            ["It’s 2 a.m.", "Time to get up."],
        )

    def test_still_splits_regular_sentence_endings(self):
        self.assertEqual(
            split_sentences("The rabbit ran. Mia followed! Did they stop? Yes."),
            ["The rabbit ran.", "Mia followed!", "Did they stop?", "Yes."],
        )

    def test_keeps_lowercase_dialogue_tags_with_the_quote(self):
        self.assertEqual(
            split_sentences("“Let’s do that again!” the kids say."),
            ["“Let’s do that again!” the kids say."],
        )

    def test_keeps_lowercase_continuations_after_punctuation_inside_a_title(self):
        self.assertEqual(
            split_sentences("Mia found a box with Double It! written on the side."),
            ["Mia found a box with Double It! written on the side."],
        )


class CollectSentencesTest(unittest.TestCase):
    def test_separates_material_list_fragments_from_the_next_instruction(self):
        book = {
            "pages": [{
                "page": 12,
                "kind": "story",
                "text": "\n".join([
                    "You will need:",
                    "• a very long string",
                    "Step 1: Cut off a 4-foot piece of string.",
                ]),
            }],
        }

        self.assertEqual(
            collect_sentences(book),
            [{"page": 12, "text": "Step 1: Cut off a 4-foot piece of string."}],
        )

    def test_rejects_a_lowercase_list_fragment_even_if_it_borrows_later_punctuation(self):
        self.assertIsNone(
            accept_sentence(
                "a very long string Step 1: Cut off a 4-foot piece of string."
            )
        )

    def test_audit_reports_lowercase_fragments_in_an_existing_sentence_pool(self):
        pool = {
            "books": [{
                "id": "K10",
                "sentences": [{
                    "page": 12,
                    "text": "a very long string Step 1: Cut off a piece of string.",
                }],
            }],
        }

        self.assertEqual(audit_sentences(pool)[0][0], "小写清单碎片")

    def test_does_not_glue_an_unpunctuated_heading_to_the_next_sentence(self):
        book = {
            "pages": [{
                "page": 7,
                "kind": "story",
                "text": "\n".join([
                    "Different Forms of Water",
                    "Most of the water we see is a liquid.",
                    "Liquid water takes the shape of its container.",
                ]),
            }],
        }

        self.assertEqual(
            collect_sentences(book),
            [
                {"page": 7, "text": "Most of the water we see is a liquid."},
                {"page": 7, "text": "Liquid water takes the shape of its container."},
            ],
        )


if __name__ == "__main__":
    unittest.main()
