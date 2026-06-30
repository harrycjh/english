#!/usr/bin/env python3

import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPT_PATH = Path(__file__).with_name("comfy_image_inventory.py")
SPEC = importlib.util.spec_from_file_location("comfy_image_inventory", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ComfyImageInventoryTests(unittest.TestCase):
    def test_inventory_tool_exists(self) -> None:
        self.assertTrue(SCRIPT_PATH.exists())

    def test_inventory_exposes_validation_api(self) -> None:
        self.assertTrue(callable(getattr(MODULE, "inspect_image", None)))
        self.assertTrue(callable(getattr(MODULE, "validate_inventory", None)))

    def test_inspect_image_accepts_only_512_square_webp(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            valid_path = root / "valid.webp"
            invalid_path = root / "invalid.webp"
            Image.new("RGB", (512, 512), "white").save(valid_path, "WEBP")
            Image.new("RGB", (800, 600), "white").save(invalid_path, "WEBP")

            self.assertEqual(
                MODULE.inspect_image(valid_path),
                {
                    "exists": True,
                    "format": "WEBP",
                    "width": 512,
                    "height": 512,
                    "valid": True,
                },
            )
            self.assertFalse(MODULE.inspect_image(invalid_path)["valid"])
            self.assertEqual(
                MODULE.inspect_image(root / "missing.webp"),
                {
                    "exists": False,
                    "format": None,
                    "width": 0,
                    "height": 0,
                    "valid": False,
                },
            )

    def test_validate_inventory_reports_missing_and_invalid_word_ids(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            image_root = Path(temporary_directory)
            Image.new("RGB", (512, 512), "white").save(image_root / "ket_a.webp", "WEBP")
            Image.new("RGB", (640, 512), "white").save(image_root / "ket_c.webp", "WEBP")
            words = [{"id": "ket_a"}, {"id": "ket_b"}, {"id": "ket_c"}]
            manifest = {
                "version": 1,
                "images": [
                    {"wordId": "ket_a", "status": "accepted"},
                    {"wordId": "ket_c", "status": "accepted"},
                ],
            }

            report = MODULE.validate_inventory(words, manifest, image_root)

            self.assertEqual(report["totalWords"], 3)
            self.assertEqual(report["accepted"], 2)
            self.assertEqual(report["remaining"], 1)
            self.assertEqual(report["missingWordIds"], ["ket_b"])
            self.assertEqual(report["invalidWordIds"], ["ket_c"])
            self.assertFalse(report["complete"])

    def test_validate_inventory_counts_rejected_reviews_as_first_pass_processed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            image_root = Path(temporary_directory)
            Image.new("RGB", (512, 512), "white").save(image_root / "ket_a.webp", "WEBP")
            words = [{"id": "ket_a"}, {"id": "ket_b"}, {"id": "ket_c"}]
            manifest = {
                "version": 1,
                "images": [{"wordId": "ket_a", "status": "accepted"}],
                "reviews": [{"wordId": "ket_b", "status": "REJECT"}],
            }

            report = MODULE.validate_inventory(words, manifest, image_root)

            self.assertEqual(report.get("reviewed"), 2)
            self.assertEqual(report.get("unreviewed"), 1)
            self.assertEqual(report.get("unreviewedWordIds"), ["ket_c"])
            self.assertFalse(report.get("firstPassComplete"))

if __name__ == "__main__":
    unittest.main()
