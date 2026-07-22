import json
import tempfile
import unittest
from pathlib import Path

from match_qwen_captions_to_ket import (
    expand_duplicate_captions,
    load_latest_successful_captions,
)


class CaptionStateTests(unittest.TestCase):
    def test_latest_caption_state_wins_and_only_successes_are_loaded(self):
        rows = [
            {"photoId": "photo-1", "status": "error"},
            {"photoId": "photo-1", "status": "ok", "caption": {"captionEn": "A dog."}},
            {"photoId": "photo-2", "status": "ok", "caption": {"captionEn": "A cat."}},
            {"photoId": "photo-2", "status": "skipped"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "captions.jsonl"
            path.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            captions, stats = load_latest_successful_captions(path)

        self.assertEqual([row["photoId"] for row in captions], ["photo-1"])
        self.assertEqual(stats["captionRows"], 4)
        self.assertEqual(stats["latestCaptionStates"], 2)
        self.assertEqual(stats["latestSuccessfulCaptions"], 1)
        self.assertEqual(stats["latestSkippedOrFailedCaptions"], 1)

    def test_duplicate_members_inherit_only_successful_representative_caption(self):
        captions = [
            {"photoId": "photo-1", "status": "ok", "caption": {"captionEn": "A dog."}}
        ]
        clusters = {
            "photoAssignments": [
                {
                    "id": "photo-1",
                    "representativeId": "photo-1",
                    "skipCaptionGeneration": False,
                },
                {
                    "id": "photo-2",
                    "representativeId": "photo-1",
                    "skipCaptionGeneration": True,
                },
                {
                    "id": "photo-3",
                    "representativeId": "photo-missing",
                    "skipCaptionGeneration": True,
                },
            ]
        }

        expanded, propagated = expand_duplicate_captions(captions, clusters)

        self.assertEqual([row["photoId"] for row in expanded], ["photo-1", "photo-2"])
        self.assertEqual(propagated, 1)
        inherited = expanded[1]
        self.assertEqual(inherited["captionSourcePhotoId"], "photo-1")
        self.assertTrue(inherited["captionPropagatedFromDuplicate"])


if __name__ == "__main__":
    unittest.main()
