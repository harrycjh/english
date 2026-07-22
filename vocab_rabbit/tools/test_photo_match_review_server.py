#!/usr/bin/env python3

import importlib.util
import sys
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
