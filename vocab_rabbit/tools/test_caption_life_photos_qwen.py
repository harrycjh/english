#!/usr/bin/env python3

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("caption_life_photos_qwen.py")
sys.path.insert(0, str(SCRIPT_PATH.parent))
SPEC = importlib.util.spec_from_file_location("caption_life_photos_qwen", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CaptionTruncationTests(unittest.TestCase):
    def test_parse_json_classifies_unterminated_output_as_truncated(self) -> None:
        with self.assertRaises(MODULE.ResponseTruncatedError):
            MODULE.parse_json_content('{"captionZh":"unfinished')

    def test_parse_json_keeps_non_truncation_decode_errors(self) -> None:
        with self.assertRaises(json.JSONDecodeError):
            MODULE.parse_json_content('{"captionZh": invalid}')

    def test_load_state_counts_attempts_and_preserves_skipped_status(self) -> None:
        records = [
            {
                "photoId": "photo-1",
                "status": "error",
                "error": "Unterminated string starting at: line 1 column 10",
                "truncationAttempts": 2,
            },
            {
                "photoId": "photo-1",
                "status": "skipped",
                "reason": "repeated_truncation",
                "truncationCount": 3,
            },
        ]
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "captions.jsonl"
            path.write_text(
                "".join(json.dumps(record) + "\n" for record in records),
                encoding="utf-8",
            )

            latest, counts = MODULE.load_caption_state(path)

        self.assertEqual(latest["photo-1"]["status"], "skipped")
        self.assertEqual(counts["photo-1"], 3)

    def test_legacy_truncation_record_uses_configured_attempt_count(self) -> None:
        record = {
            "photoId": "photo-2",
            "status": "error",
            "error": "Unterminated string starting at: line 1 column 20",
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "captions.jsonl"
            path.write_text(json.dumps(record) + "\n", encoding="utf-8")

            _, counts = MODULE.load_caption_state(path, legacy_truncation_attempts=3)

        self.assertEqual(counts["photo-2"], 3)


if __name__ == "__main__":
    unittest.main()
