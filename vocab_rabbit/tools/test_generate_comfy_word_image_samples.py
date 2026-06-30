#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("generate_comfy_word_image_samples.py")
SPEC = importlib.util.spec_from_file_location("generate_comfy_word_image_samples", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FamilyPromptTests(unittest.TestCase):
    def test_generator_exposes_deterministic_word_selection(self) -> None:
        self.assertTrue(callable(getattr(MODULE, "select_words", None)))
        self.assertTrue(callable(getattr(MODULE, "load_processed_ids", None)))

    def test_select_words_excludes_accepted_ids_and_sorts_by_word_id(self) -> None:
        words = [
            {"id": "ket_c", "category": "食物和饮料"},
            {"id": "ket_a", "category": "食物和饮料"},
            {"id": "ket_b", "category": "天气"},
            {"id": "ket_d", "category": "食物和饮料"},
        ]

        selected = MODULE.select_words(
            words,
            accepted_ids={"ket_c"},
            category="食物和饮料",
            offset=1,
            limit=1,
        )

        self.assertEqual([word["id"] for word in selected], ["ket_d"])

    def test_load_processed_ids_includes_accepted_images_and_rejected_reviews(self) -> None:
        import tempfile

        loader = getattr(MODULE, "load_processed_ids", None)
        self.assertTrue(callable(loader))
        with tempfile.TemporaryDirectory() as temporary_directory:
            manifest_path = Path(temporary_directory) / "manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "images": [{"wordId": "ket_a", "status": "accepted"}],
                        "reviews": [{"wordId": "ket_b", "status": "REJECT"}],
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(loader(manifest_path), {"ket_a", "ket_b"})

    def test_workflow_template_is_bundled_with_the_project(self) -> None:
        self.assertTrue(MODULE.WORKFLOW_TEMPLATE_PATH.is_relative_to(MODULE.PROJECT_ROOT))
        self.assertTrue(MODULE.WORKFLOW_TEMPLATE_PATH.exists())

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

    def test_prompt_explicitly_forbids_displaying_the_concept_name(self) -> None:
        words = {word["id"]: word for word in MODULE.load_words(include_approved=True)}

        self.assertIn(
            "Never display the concept name",
            MODULE.build_prompt(words["ket_deliver_v"]),
        )

    def test_remaining_common_action_words_use_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        remaining_action_words = [
            word
            for word in words
            if word.get("category") == "常用动作动词"
            and word["id"] >= "ket_guess_what_v"
        ]

        self.assertTrue(remaining_action_words)
        for word in remaining_action_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
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

    def test_every_identity_word_has_a_dedicated_visual_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        identity_ids = {
            word["id"]
            for word in words
            if word.get("category") == "人物身份和称呼"
        }

        self.assertEqual(identity_ids, set(MODULE.IDENTITY_SCENES))
        self.assertIn(
            "pointing to themselves",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_name_n")),
        )

    def test_every_month_and_weekday_has_a_text_free_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        calendar_ids = {
            word["id"]
            for word in words
            if word.get("category") == "月份和星期"
        }

        self.assertEqual(calendar_ids, set(MODULE.CALENDAR_SCENES))
        for word in words:
            if word["id"] in calendar_ids:
                prompt = MODULE.build_prompt(word).lower()
                self.assertNotIn("calendar", prompt)
                self.assertIn("no writing", prompt)

    def test_number_scenes_use_quantities_instead_of_written_digits(self) -> None:
        words = MODULE.load_words(include_approved=True)
        number_ids = {
            word["id"]
            for word in words
            if word.get("category") == "数字和顺序词"
        }

        self.assertEqual(number_ids, set(MODULE.NUMBER_SCENES))
        for word in words:
            if word["id"] in number_ids:
                self.assertIn("no written numbers", MODULE.build_prompt(word))

    def test_every_countryside_place_has_a_dedicated_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        place_ids = {
            word["id"]
            for word in words
            if word.get("category") == "乡村和自然地点"
        }

        self.assertEqual(place_ids, set(MODULE.NATURAL_PLACE_SCENES))
        self.assertIn(
            "small woodland",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_wood_n")),
        )

    def test_building_words_follow_their_place_meanings(self) -> None:
        words = MODULE.load_words(include_approved=True)
        building_ids = {
            word["id"]
            for word in words
            if word.get("category") == "建筑和公共地点"
        }

        self.assertEqual(building_ids, set(MODULE.BUILDING_SCENES))
        self.assertIn(
            "city block",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_block_n")),
        )
        self.assertIn(
            "elevator",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_lift_n")),
        )
        self.assertIn(
            "plain residential",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_block_n")),
        )
        self.assertIn(
            "no sign above",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_exit_n")),
        )
        self.assertIn(
            "completely blank facade",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_police_station_n")),
        )

    def test_city_words_have_distinct_text_free_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        city_ids = {
            word["id"]
            for word in words
            if word.get("category") == "城镇街道和城市"
        }

        self.assertEqual(city_ids, set(MODULE.CITY_SCENES))
        self.assertIn(
            "central plaza",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_city_centre_n")),
        )
        self.assertIn(
            "center of a circle",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_centre_center_n")),
        )
        self.assertIn(
            "no hanging tags",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_market_n")),
        )
        self.assertIn(
            "plain homes only",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_town_n")),
        )

    def test_natural_world_words_have_dedicated_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        nature_ids = {
            word["id"]
            for word in words
            if word.get("category") == "自然世界"
        }

        self.assertEqual(nature_ids, set(MODULE.NATURE_SCENES))
        for word_id in ("ket_north_n_adj_adv", "ket_south_n_adj_adv", "ket_east_n_adj_adv", "ket_west_n_adj_adv"):
            word = next(word for word in words if word["id"] == word_id)
            self.assertIn("no letters", MODULE.build_prompt(word))
            self.assertIn("without a compass", MODULE.build_prompt(word))
        self.assertIn(
            "no map outline",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_country_n")),
        )

    def test_current_preview_words_have_clear_text_free_scenes(self) -> None:
        words = {word["id"]: word for word in MODULE.load_words(include_approved=True)}

        ambulance_prompt = MODULE.build_prompt(words["ket_ambulance_n"])
        bad_prompt = MODULE.build_prompt(words["ket_bad_adj"])

        self.assertIn("white emergency ambulance", ambulance_prompt)
        self.assertIn("completely blank vehicle", ambulance_prompt)
        self.assertIn("paramedics pushing an empty stretcher", ambulance_prompt)
        self.assertIn("fresh apple beside a visibly rotten apple", bad_prompt)

    def test_every_work_word_has_a_dedicated_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        work_ids = {
            word["id"]
            for word in words
            if word.get("category") == "工作和职业"
        }
        work_scenes = getattr(MODULE, "WORK_SCENES", {})

        self.assertEqual(work_ids, set(work_scenes))
        self.assertIn(
            "small shop exchanging goods",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_business_n")),
        )
        self.assertIn(
            "coins after completing a repair",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_earn_v")),
        )
        self.assertIn(
            "three stages of one person's working life",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_career_n")),
        )
        self.assertIn(
            "same female doctor shown at three clear career stages",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_career_n")),
        )
        self.assertIn(
            "no frames, boards, papers, signs, or screens",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_department_n")),
        )
        self.assertIn(
            "three open work areas with no walls",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_department_n")),
        )
        self.assertIn(
            "placing a pile of coins into the repair worker's open hand",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_earn_v")),
        )
        self.assertIn(
            "one clearly visible adult writer seated at a desk",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_writer_n")),
        )

    def test_every_clothing_word_has_a_dedicated_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        clothing_ids = {
            word["id"]
            for word in words
            if word.get("category") == "衣服和配饰"
        }
        clothing_scenes = getattr(MODULE, "CLOTHING_SCENES", {})

        self.assertEqual(clothing_ids, set(clothing_scenes))
        self.assertIn(
            "small coin purse",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_purse_n")),
        )
        self.assertIn(
            "open bifold wallet",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_wallet_n")),
        )
        self.assertIn(
            "already wearing",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_wear_v")),
        )
        self.assertIn(
            "complete plain football kit",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_kit_n")),
        )
        self.assertIn(
            "front surface completely blank and undecorated",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_backpack_n")),
        )
        self.assertIn(
            "no straps, patches, tags, buckles, or marks",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_boot_n")),
        )
        self.assertIn(
            "one single plain yellow rubber rain boot",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_boot_n")),
        )
        self.assertIn(
            "straight handle visibly connected to the canopy",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_umbrella_n")),
        )

    def test_every_house_word_has_a_dedicated_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        house_ids = {
            word["id"]
            for word in words
            if word.get("category") == "房子和家具"
        }
        house_scenes = getattr(MODULE, "HOUSE_SCENES", {})

        self.assertEqual(house_ids, set(house_scenes))
        self.assertIn(
            "exterior of one detached house",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_house_n")),
        )
        self.assertIn(
            "family relaxing together inside",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_home_n_adv")),
        )
        self.assertIn(
            "traveler temporarily staying",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_stay_v")),
        )
        self.assertIn(
            "porcelain kitchen sink",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_sink_n")),
        )
        self.assertIn(
            "no tonearm or turntable",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_dvd_player_n")),
        )

    def test_every_sport_word_has_a_dedicated_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        sport_ids = {
            word["id"]
            for word in words
            if word.get("category") == "运动和比赛"
        }
        sport_scenes = getattr(MODULE, "SPORT_SCENES", {})

        self.assertEqual(sport_ids, set(sport_scenes))
        self.assertIn(
            "wooden baseball bat",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_bat_n")),
        )
        self.assertIn(
            "two opposing teams facing each other",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_v_versus_prep")),
        )
        self.assertIn(
            "several runners competing side by side",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_race_n_v")),
        )
        self.assertIn(
            "throwing a basketball backward over one shoulder with eyes closed",
            MODULE.build_prompt(next(word for word in words if word["id"] == "ket_luck_n")),
        )


if __name__ == "__main__":
    unittest.main()
