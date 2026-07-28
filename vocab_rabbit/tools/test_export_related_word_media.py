#!/usr/bin/env python3

import importlib.util
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from PIL import Image


SCRIPT_PATH = Path(__file__).with_name("export_related_word_media.py")
sys.path.insert(0, str(SCRIPT_PATH.parent))
SPEC = importlib.util.spec_from_file_location("export_related_word_media", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ExportRelatedWordMediaTests(unittest.TestCase):
    def test_selected_photos_only_includes_confirmed_unique_results(self) -> None:
        selected = MODULE.selected_photos_from_review(
            {
                "selections": {
                    "word-1": {"status": "selected", "photoId": "photo-1"},
                    "word-2": {"status": "selected", "photoId": "photo-2"},
                }
            }
        )

        self.assertEqual(selected, {"word-1": "photo-1", "word-2": "photo-2"})

    def test_selected_photos_rejects_duplicate_photo_assignments(self) -> None:
        with self.assertRaisesRegex(ValueError, "more than one word"):
            MODULE.selected_photos_from_review(
                {
                    "selections": {
                        "word-1": {"status": "selected", "photoId": "photo-1"},
                        "word-2": {"status": "selected", "photoId": "photo-1"},
                    }
                }
            )

    def test_reviewed_photo_is_exported_as_primary_with_review_caption(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            image_path = Path(directory) / "source.png"
            Image.new("RGB", (32, 24), "orange").save(image_path)
            candidate = MODULE.PhotoCandidate(
                image_path,
                {
                    "id": "photo-1",
                    "scene": "孩子在海边捡贝壳。",
                    "confidence": 1.0,
                },
                match_rank=3,
            )

            entry, (archive_path, image_bytes) = MODULE.build_life_photo_asset(
                "word-1",
                candidate,
                max_width=720,
                quality=82,
            )

        life_photo = entry["relatedMedia"]["lifePhoto"]
        self.assertEqual(life_photo["match"], "primary")
        self.assertEqual(life_photo["confidence"], 1.0)
        self.assertEqual(life_photo["caption"], "孩子在海边捡贝壳。")
        self.assertEqual(archive_path, "life-photos/word-1.webp")
        self.assertTrue(image_bytes.startswith(b"RIFF"))

    def test_package_and_dev_manifest_receive_the_same_entries(self) -> None:
        manifest = {
            "schemaVersion": 1,
            "generatedAt": "2026-07-28T00:00:00+00:00",
            "stats": {"totalWords": 1, "withLifePhoto": 1},
            "entries": [
                {
                    "wordId": "word-1",
                    "relatedMedia": {
                        "lifePhoto": {
                            "imagePath": "/life-photos/word-1.webp",
                            "caption": "测试照片",
                            "photoId": "photo-1",
                            "match": "primary",
                            "confidence": 1.0,
                        }
                    },
                }
            ],
        }
        files = [("life-photos/word-1.webp", b"RIFF-test")]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package_path = root / "package.zip"
            dev_root = root / "dev-life-photos"
            with (
                mock.patch.object(MODULE, "LOCAL_LIFE_PHOTO_PACKAGE_PATH", package_path),
                mock.patch.object(MODULE, "DEV_LIFE_PHOTO_ROOT", dev_root),
            ):
                MODULE.write_life_photo_package(manifest, files)
                MODULE.sync_dev_life_photos(manifest, files)

            with zipfile.ZipFile(package_path) as archive:
                package_manifest = json.loads(archive.read("word_related_media.json"))
                package_image = archive.read("life-photos/word-1.webp")
            dev_manifest = json.loads((dev_root / "word_related_media.json").read_text())
            dev_image = (dev_root / "life-photos/word-1.webp").read_bytes()

        self.assertEqual(package_manifest, manifest)
        self.assertEqual(dev_manifest, manifest)
        self.assertEqual(package_image, dev_image)


if __name__ == "__main__":
    unittest.main()
