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

    def test_first_common_adjective_batch_uses_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        first_batch = [
            word
            for word in words
            if word.get("category") == "常见形容词"
            and word["id"] <= "ket_fresh_adj"
        ]

        self.assertEqual(len(first_batch), 30)
        for word in first_batch:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_second_common_adjective_batch_uses_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        second_batch = [
            word
            for word in words
            if word.get("category") == "常见形容词"
            and "ket_frightened_adj" <= word["id"] <= "ket_national_adj"
        ]

        self.assertEqual(len(second_batch), 30)
        for word in second_batch:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_third_common_adjective_batch_uses_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        third_batch = [
            word
            for word in words
            if word.get("category") == "常见形容词"
            and "ket_natural_not_artificial_adj" <= word["id"] <= "ket_smart_stylish_adj"
        ]

        self.assertEqual(len(third_batch), 30)
        for word in third_batch:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_final_common_adjective_batch_uses_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        final_batch = [
            word
            for word in words
            if word.get("category") == "常见形容词"
            and "ket_spare_adj" <= word["id"] <= "ket_worst_adj"
        ]

        self.assertEqual(len(final_batch), 22)
        for word in final_batch:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_first_feeling_batch_uses_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        first_batch_ids = {
            "ket_able_adj", "ket_afraid_adj", "ket_alone_adj_adv", "ket_amazing_adj",
            "ket_angry_adj", "ket_beautiful_adj", "ket_better_adj_adv", "ket_big_adj",
            "ket_bored_adj", "ket_boring_adj", "ket_brave_adj", "ket_brilliant_adj",
            "ket_busy_adj", "ket_careful_adj", "ket_clear_adj", "ket_clever_adj",
            "ket_cool_adj_exclam", "ket_different_adj", "ket_difficult_adj",
            "ket_excellent_adj", "ket_excited_adj", "ket_famous_adj", "ket_fast_adj_adv",
            "ket_favourite_adj", "ket_fine_adj", "ket_free_adj_adv", "ket_funny_adj",
            "ket_good_adj", "ket_great_adj", "ket_happy_adj",
        }
        first_batch = [word for word in words if word["id"] in first_batch_ids]

        self.assertEqual(len(first_batch), 30)
        for word in first_batch:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_feeling_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        feeling_words = [word for word in words if word.get("category") == "感受和性格"]

        self.assertEqual(len(feeling_words), 70)
        for word in feeling_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_first_body_health_batch_uses_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        first_batch_ids = {
            "ket_accident_n", "ket_appointment_n", "ket_arm_n", "ket_baby_n",
            "ket_back_n_adv_adj", "ket_beard_n", "ket_blood_n", "ket_body_n",
            "ket_brain_n", "ket_break_n_v", "ket_check_v", "ket_clean_adj_v",
            "ket_cold_adj_n", "ket_comb_n", "ket_cut_v", "ket_danger_n",
            "ket_dangerous_adj", "ket_dead_adj", "ket_dentist_n", "ket_die_v",
            "ket_doctor_n", "ket_dr_n", "ket_ear_n", "ket_exercise_n_v",
            "ket_eye_n", "ket_face_n", "ket_fall_n_v", "ket_feel_v",
            "ket_finger_n", "ket_fit_adj",
        }
        first_batch = [word for word in words if word["id"] in first_batch_ids]

        self.assertEqual(len(first_batch), 30)
        for word in first_batch:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_body_health_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        body_words = [
            word for word in words if word.get("category") == "身体、健康和锻炼"
        ]

        self.assertEqual(len(body_words), 66)
        for word in body_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_first_school_batch_uses_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        first_batch = [
            word
            for word in words
            if word.get("category") == "学校和学习"
            and "ket_advanced_adj" <= word["id"] <= "ket_mark_n"
        ]

        self.assertEqual(len(first_batch), 30)
        for word in first_batch:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_school_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        school_words = [word for word in words if word.get("category") == "学校和学习"]

        self.assertEqual(len(school_words), 64)
        for word in school_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_first_entertainment_batch_uses_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        first_batch = [
            word
            for word in words
            if word.get("category") == "娱乐和表演"
            and "ket_act_v" <= word["id"] <= "ket_instrument_n"
        ]

        self.assertEqual(len(first_batch), 30)
        for word in first_batch:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_entertainment_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        entertainment_words = [
            word for word in words if word.get("category") == "娱乐和表演"
        ]

        self.assertEqual(len(entertainment_words), 63)
        for word in entertainment_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_first_transport_batch_uses_specific_scenes(self) -> None:
        words = MODULE.load_words(include_approved=True)
        first_batch = [
            word
            for word in words
            if word.get("category") == "出行和交通"
            and "ket_aeroplane_n" <= word["id"] <= "ket_plane_n"
        ]

        self.assertEqual(len(first_batch), 30)
        for word in first_batch:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_transport_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        transport_words = [word for word in words if word.get("category") == "出行和交通"]

        self.assertEqual(len(transport_words), 60)
        for word in transport_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_digital_communication_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        digital_words = [
            word for word in words if word.get("category") == "通讯、网络和数码"
        ]

        self.assertEqual(len(digital_words), 38)
        for word in digital_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_shopping_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        shopping_words = [word for word in words if word.get("category") == "购物买东西"]

        self.assertEqual(len(shopping_words), 34)
        for word in shopping_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_document_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        document_words = [
            word for word in words if word.get("category") == "书本、证件和文字"
        ]

        self.assertEqual(len(document_words), 40)
        for word in document_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_hobby_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        hobby_words = [word for word in words if word.get("category") == "爱好和休闲"]

        self.assertEqual(len(hobby_words), 28)
        for word in hobby_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_manner_and_degree_adverb_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        adverb_words = [
            word for word in words if word.get("category") == "方式和程度副词"
        ]

        self.assertEqual(len(adverb_words), 58)
        for word in adverb_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_preposition_and_direction_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        direction_words = [
            word for word in words if word.get("category") == "介词和方向词"
        ]

        self.assertEqual(len(direction_words), 55)
        for word in direction_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_person_and_reference_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        reference_words = [
            word for word in words if word.get("category") == "人称和指代词"
        ]

        self.assertEqual(len(reference_words), 50)
        for word in reference_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_time_and_date_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        time_words = [word for word in words if word.get("category") == "时间和日期"]

        self.assertEqual(len(time_words), 47)
        for word in time_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_other_common_word_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        common_words = [word for word in words if word.get("category") == "其他常用词"]

        self.assertEqual(len(common_words), 30)
        for word in common_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_abstract_concept_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        concept_words = [
            word for word in words if word.get("category") == "抽象概念和想法"
        ]

        self.assertEqual(len(concept_words), 28)
        for word in concept_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_exclamation_and_response_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        response_words = [
            word for word in words if word.get("category") == "感叹词和回应语"
        ]

        self.assertEqual(len(response_words), 24)
        for word in response_words:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_common_phrasal_verb_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        phrasal_verbs = [
            word for word in words if word.get("category") == "常用短语动词"
        ]

        self.assertEqual(len(phrasal_verbs), 20)
        for word in phrasal_verbs:
            with self.subTest(word_id=word["id"]):
                self.assertNotIn(
                    "a simple real-life scene that clearly represents",
                    MODULE.build_prompt(word),
                )

    def test_every_time_and_frequency_adverb_uses_a_specific_scene(self) -> None:
        words = MODULE.load_words(include_approved=True)
        frequency_words = [
            word for word in words if word.get("category") == "时间和频率副词"
        ]

        self.assertEqual(len(frequency_words), 20)
        for word in frequency_words:
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
