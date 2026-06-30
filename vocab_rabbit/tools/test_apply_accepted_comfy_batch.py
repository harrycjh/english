#!/usr/bin/env python3

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPT_PATH = Path(__file__).with_name("apply_accepted_comfy_batch.py")
SPEC = importlib.util.spec_from_file_location("apply_accepted_comfy_batch", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)
AUDIT_SCRIPT_PATH = Path(__file__).with_name("audit_generated_word_images.py")
AUDIT_SPEC = importlib.util.spec_from_file_location("audit_generated_word_images", AUDIT_SCRIPT_PATH)
AUDIT_MODULE = importlib.util.module_from_spec(AUDIT_SPEC)
assert AUDIT_SPEC.loader is not None
AUDIT_SPEC.loader.exec_module(AUDIT_MODULE)


class ApplyAcceptedComfyBatchTests(unittest.TestCase):
    def test_acceptance_tool_exists(self) -> None:
        self.assertTrue(SCRIPT_PATH.exists())

    def test_acceptance_tool_exposes_review_and_apply_api(self) -> None:
        self.assertTrue(callable(getattr(MODULE, "load_review", None)))
        self.assertTrue(callable(getattr(MODULE, "apply_batch", None)))

    def test_audit_tool_exposes_review_tsv_writer(self) -> None:
        self.assertTrue(callable(getattr(AUDIT_MODULE, "write_review_tsv", None)))

    def test_audit_review_tsv_starts_every_record_as_pending(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_path = Path(temporary_directory) / "manual-review.tsv"

            AUDIT_MODULE.write_review_tsv(
                [
                    {"ordinal": 1, "wordId": "ket_a", "english": "a", "ocrText": ""},
                    {"ordinal": 2, "wordId": "ket_b", "english": "b", "ocrText": "B"},
                ],
                output_path,
            )

            self.assertEqual(
                output_path.read_text(encoding="utf-8"),
                "ordinal\twordId\tenglish\tstatus\tnotes\n"
                "1\tket_a\ta\tPENDING\t\n"
                "2\tket_b\tb\tPENDING\tOCR: B\n",
            )

    def test_load_review_requires_every_record_to_be_decided(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            review_path = Path(temporary_directory) / "manual-review.tsv"
            review_path.write_text(
                "ordinal\twordId\tenglish\tstatus\tnotes\n"
                "1\tket_a\ta\tACCEPT\tclear\n"
                "2\tket_b\tb\tPENDING\tcheck meaning\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "PENDING"):
                MODULE.load_review(review_path)

    def test_apply_batch_replaces_only_accepted_images_and_updates_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            run_dir = root / "comfy-sample-test"
            sample_dir = run_dir / "samples"
            review_dir = run_dir / "review"
            image_root = root / "images"
            backup_root = root / "backups"
            sample_dir.mkdir(parents=True)
            review_dir.mkdir()
            image_root.mkdir()

            accepted_sample = sample_dir / "ket_a.png"
            rejected_sample = sample_dir / "ket_b.png"
            Image.new("RGB", (512, 512), "red").save(accepted_sample, "PNG")
            Image.new("RGB", (512, 512), "blue").save(rejected_sample, "PNG")
            Image.new("RGB", (64, 64), "white").save(image_root / "ket_a.webp", "WEBP")
            Image.new("RGB", (80, 80), "black").save(image_root / "ket_b.webp", "WEBP")

            (run_dir / "manifest.json").write_text(
                json.dumps(
                    {
                        "meta": {"runId": "comfy-sample-test"},
                        "records": [
                            {
                                "wordId": "ket_a",
                                "english": "a",
                                "seed": 101,
                                "prompt": "a red object",
                                "samplePath": str(accepted_sample),
                            },
                            {
                                "wordId": "ket_b",
                                "english": "b",
                                "seed": 102,
                                "prompt": "a blue object",
                                "samplePath": str(rejected_sample),
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (review_dir / "manual-review.tsv").write_text(
                "ordinal\twordId\tenglish\tstatus\tnotes\n"
                "1\tket_a\ta\tACCEPT\tclear meaning\n"
                "2\tket_b\tb\tREJECT\twrong sense\n",
                encoding="utf-8",
            )
            manifest_path = root / "comfy-image-manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "images": [
                            {
                                "wordId": "ket_existing",
                                "status": "accepted",
                                "source": "historical-verified-commit",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            result = MODULE.apply_batch(run_dir, image_root, manifest_path, backup_root)

            self.assertEqual(result["acceptedWordIds"], ["ket_a"])
            self.assertEqual(result["rejectedWordIds"], ["ket_b"])
            with Image.open(image_root / "ket_a.webp") as accepted_image:
                self.assertEqual(accepted_image.size, (512, 512))
            with Image.open(image_root / "ket_b.webp") as rejected_image:
                self.assertEqual(rejected_image.size, (80, 80))
            self.assertTrue((backup_root / "ket_a.webp").exists())
            updated_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            records_by_id = {record["wordId"]: record for record in updated_manifest["images"]}
            self.assertEqual(records_by_id["ket_a"]["source"], "comfy-run")
            self.assertEqual(records_by_id["ket_a"]["runId"], "comfy-sample-test")
            self.assertEqual(records_by_id["ket_a"]["seed"], 101)
            self.assertEqual(records_by_id["ket_a"]["reviewNotes"], "clear meaning")
            self.assertNotIn("ket_b", records_by_id)


if __name__ == "__main__":
    unittest.main()
