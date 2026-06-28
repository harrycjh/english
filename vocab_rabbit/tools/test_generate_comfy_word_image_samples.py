#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("generate_comfy_word_image_samples.py")
SPEC = importlib.util.spec_from_file_location("generate_comfy_word_image_samples", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FamilyPromptTests(unittest.TestCase):
    def test_every_family_word_has_a_dedicated_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        family_ids = {word["id"] for word in words if word.get("category") == "家人和朋友"}

        self.assertEqual(family_ids, set(MODULE.FAMILY_SCENES))

    def test_title_miss_and_verb_miss_have_distinct_scenes(self) -> None:
        words = {word["id"]: word for word in MODULE.load_words(include_approved=True)}

        title_prompt = MODULE.build_prompt(words["ket_miss_n"])
        verb_prompt = MODULE.build_prompt(words["ket_miss_v"])

        self.assertIn("woman teacher", title_prompt)
        self.assertIn("bus pulling away", verb_prompt)
        self.assertNotEqual(title_prompt, verb_prompt)

    def test_parent_terms_use_a_clear_family_relationship(self) -> None:
        words = {word["id"]: word for word in MODULE.load_words(include_approved=True)}

        self.assertIn("mother hugging her child", MODULE.build_prompt(words["ket_mum_n_br_eng"]))
        self.assertIn("father hugging his child", MODULE.build_prompt(words["ket_dad_n"]))

    def test_fallback_prompt_uses_category_context_to_disambiguate_words(self) -> None:
        words = {word["id"]: word for word in MODULE.load_words(include_approved=True)}

        self.assertIn(
            "animals and insects",
            MODULE.build_prompt(words["ket_bear_n"]),
        )

    def test_animal_body_parts_are_the_clear_subject(self) -> None:
        words = {word["id"]: word for word in MODULE.load_words(include_approved=True)}

        self.assertIn(
            "long curved tail is clearly visible",
            MODULE.build_prompt(words["ket_tail_n"]),
        )
        self.assertIn(
            "one fully spread feathered wing",
            MODULE.build_prompt(words["ket_wing_n"]),
        )

    def test_every_color_word_has_a_dedicated_visual_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        color_ids = {word["id"] for word in words if word.get("category") == "颜色"}

        self.assertEqual(color_ids, set(MODULE.COLOR_SCENES))
        self.assertIn(
            "orange-colored objects",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_orange_adj_n")),
        )
        self.assertIn(
            "washed-out pale pink scarf",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_pale_adj")),
        )
        self.assertIn(
            "two blue umbrellas",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_dark_adj")),
        )

    def test_every_weather_word_has_a_dedicated_visual_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        weather_ids = {word["id"] for word in words if word.get("category") == "天气"}

        self.assertEqual(weather_ids, set(MODULE.WEATHER_SCENES))
        self.assertIn(
            "dripping with water",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_wet_adj")),
        )

    def test_every_electronics_word_has_a_dedicated_visual_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        electronics_ids = {
            word["id"]
            for word in words
            if word.get("category") == "家用电器和电子设备"
        }

        self.assertEqual(electronics_ids, set(MODULE.ELECTRONICS_SCENES))
        self.assertIn(
            "music notes",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_cd_n")),
        )
        self.assertIn(
            "film reel",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_dvd_n")),
        )


if __name__ == "__main__":
    unittest.main()
