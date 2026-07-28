#!/usr/bin/env python3

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("photo_match_review_server.py")
sys.path.insert(0, str(SCRIPT_PATH.parent))
SPEC = importlib.util.spec_from_file_location("photo_match_review_server", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PhotoMatchReviewTests(unittest.TestCase):
    def test_structured_object_evidence_outranks_caption_only_match(self) -> None:
        word = {"id": "camera", "english": "camera", "partOfSpeech": "n"}
        caption_row = {
            "caption": {
                "captionEn": "A child holds a camera.",
                "captionZh": "孩子拿着相机。",
                "people": ["child"],
                "objects": ["camera"],
                "actions": ["hold"],
                "attributes": [],
                "scene": [],
                "confidence": 0.9,
            }
        }

        structured = MODULE.rank_candidate(
            word, "photo-1", caption_row, True, None, None, None
        )
        caption_only = MODULE.rank_candidate(
            word, "photo-2", caption_row, False, None, None, None
        )

        self.assertGreater(structured["score"], caption_only["score"])
        self.assertEqual(structured["evidence"][0]["field"], "objects")

    def test_top_four_prefers_different_scene_clusters(self) -> None:
        candidates = [
            {"photoId": "photo-1", "score": 100, "sceneClusterId": "scene-a"},
            {"photoId": "photo-2", "score": 99, "sceneClusterId": "scene-a"},
            {"photoId": "photo-3", "score": 98, "sceneClusterId": "scene-b"},
            {"photoId": "photo-4", "score": 97, "sceneClusterId": "scene-c"},
            {"photoId": "photo-5", "score": 96, "sceneClusterId": "scene-d"},
        ]

        selected = MODULE.select_diverse_candidates(candidates, limit=4)

        self.assertEqual(
            [candidate["photoId"] for candidate in selected],
            ["photo-1", "photo-3", "photo-4", "photo-5"],
        )

    def test_top_four_avoids_visually_similar_photos(self) -> None:
        candidates = [
            {
                "photoId": "photo-1",
                "score": 100,
                "sceneClusterId": None,
                "perceptualHash": "0000000000000000",
                "differenceHash": "0000000000000000",
            },
            {
                "photoId": "photo-2",
                "score": 99,
                "sceneClusterId": None,
                "perceptualHash": "0000000000000001",
                "differenceHash": "0000000000000001",
            },
            {
                "photoId": "photo-3",
                "score": 98,
                "sceneClusterId": None,
                "perceptualHash": "ffffffffffffffff",
                "differenceHash": "ffffffffffffffff",
            },
        ]

        selected = MODULE.select_diverse_candidates(candidates, limit=2)

        self.assertEqual([candidate["photoId"] for candidate in selected], ["photo-1", "photo-3"])

    def test_description_search_scores_chinese_and_english_meaning(self) -> None:
        beach_caption = {
            "captionZh": "一个小女孩在海边捡贝壳，旁边可以看到蓝色海水。",
            "captionEn": "A little girl collects shells on the beach.",
            "people": ["girl"],
            "objects": ["shell"],
            "actions": ["collect"],
            "attributes": [],
            "scene": ["beach"],
        }
        indoor_caption = {
            "captionZh": "一张室内餐桌上摆着杯子和盘子。",
            "captionEn": "Cups and plates are on an indoor dining table.",
            "people": [],
            "objects": ["cup", "plate"],
            "actions": [],
            "attributes": [],
            "scene": ["dining room"],
        }

        chinese_match, _ = MODULE.description_candidate_score("小女孩在海边捡贝壳", beach_caption)
        chinese_miss, _ = MODULE.description_candidate_score("小女孩在海边捡贝壳", indoor_caption)
        english_match, _ = MODULE.description_candidate_score("girl collecting shells on beach", beach_caption)
        english_miss, _ = MODULE.description_candidate_score("girl collecting shells on beach", indoor_caption)

        self.assertGreater(chinese_match, chinese_miss)
        self.assertGreater(english_match, english_miss)

    def test_description_search_excludes_used_and_rejected_photos(self) -> None:
        application = MODULE.ReviewApplication.__new__(MODULE.ReviewApplication)
        application.words_by_id = {"word-1": {"wordId": "word-1", "candidates": []}}
        application.master_entries = {
            "photo-1": {},
            "photo-2": {},
            "photo-3": {},
        }
        application.search_results = {}
        application.search_queries = {}
        application.search_features = {}
        application.search_assignments = {}
        application.search_captions = [
            {
                "photoId": photo_id,
                "caption": {
                    "captionZh": "一个孩子在海边捡贝壳。",
                    "captionEn": "A child collects shells on the beach.",
                    "people": ["child"],
                    "objects": ["shell"],
                    "actions": ["collect"],
                    "attributes": [],
                    "scene": ["beach"],
                },
            }
            for photo_id in ("photo-1", "photo-2", "photo-3")
        ]
        application.selections = {
            "schemaVersion": 3,
            "updatedAt": None,
            "selections": {
                "word-2": {
                    "status": "selected",
                    "photoId": "photo-1",
                    "selectedAt": "2026-07-28T00:00:00+08:00",
                }
            },
            "rejectedCandidates": {
                "word-1": {
                    "photoIds": ["photo-2"],
                    "rejectedAt": "2026-07-28T00:00:00+08:00",
                }
            },
        }

        result = application.search_photos("word-1", "孩子在海边捡贝壳")

        self.assertEqual([candidate["photoId"] for candidate in result], ["photo-3"])

    def test_schema_three_reopens_exhausted_words_without_losing_selections(self) -> None:
        payload, changed = MODULE.migrate_selection_payload(
            {
                "schemaVersion": 2,
                "updatedAt": "2026-07-28T00:00:00+08:00",
                "selections": {
                    "selected-word": {"status": "selected", "photoId": "photo-1"},
                    "retry-word": {"status": "exhausted", "photoId": None},
                },
                "rejectedCandidates": {"retry-word": {"photoIds": ["photo-2"]}},
            }
        )

        self.assertTrue(changed)
        self.assertEqual(payload["schemaVersion"], 3)
        self.assertIn("selected-word", payload["selections"])
        self.assertNotIn("retry-word", payload["selections"])
        self.assertEqual(payload["rejectedCandidates"]["retry-word"]["photoIds"], ["photo-2"])

    def test_description_search_result_can_be_saved_as_a_selection(self) -> None:
        application = MODULE.ReviewApplication.__new__(MODULE.ReviewApplication)
        application.words_by_id = {"word-1": {"wordId": "word-1", "candidates": []}}
        application.search_results = {"word-1": {"photo-3"}}
        application.search_queries = {"word-1": "孩子在海边"}
        application.selections = {
            "schemaVersion": 3,
            "updatedAt": None,
            "selections": {},
            "rejectedCandidates": {},
        }

        with mock.patch.object(MODULE, "write_selection_state"):
            selection = application.save_selection(
                "word-1",
                "photo-3",
                source="descriptionSearch",
            )

        self.assertEqual(selection["status"], "selected")
        self.assertEqual(selection["photoId"], "photo-3")
        self.assertEqual(selection["source"], "descriptionSearch")
        self.assertEqual(selection["searchQuery"], "孩子在海边")

    def test_selection_state_is_written_to_runtime_and_durable_paths(self) -> None:
        payload = {
            "schemaVersion": 3,
            "updatedAt": "2026-07-28T00:00:00+08:00",
            "selections": {"word": {"status": "selected", "photoId": "photo-1"}},
            "rejectedCandidates": {},
        }
        with tempfile.TemporaryDirectory() as directory:
            runtime_path = Path(directory) / "runtime.json"
            durable_path = Path(directory) / "durable.json"

            MODULE.write_selection_state(payload, runtime_path, durable_path)

            self.assertEqual(json.loads(runtime_path.read_text()), payload)
            self.assertEqual(json.loads(durable_path.read_text()), payload)


if __name__ == "__main__":
    unittest.main()
