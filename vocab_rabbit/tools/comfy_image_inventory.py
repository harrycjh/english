#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORD_LIST_PATH = PROJECT_ROOT / "public/content/words/ket_vocabulary.json"
COMFY_MANIFEST_PATH = PROJECT_ROOT / "public/content/words/comfy-image-manifest.json"
WORD_IMAGE_ROOT = PROJECT_ROOT / "public/content/images/words"


def inspect_image(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "exists": False,
            "format": None,
            "width": 0,
            "height": 0,
            "valid": False,
        }

    try:
        with Image.open(path) as image:
            image.load()
            image_format = image.format
            width, height = image.size
    except (OSError, ValueError):
        return {
            "exists": True,
            "format": None,
            "width": 0,
            "height": 0,
            "valid": False,
        }

    return {
        "exists": True,
        "format": image_format,
        "width": width,
        "height": height,
        "valid": image_format == "WEBP" and width == 512 and height == 512,
    }


def validate_inventory(
    words: list[dict[str, Any]],
    manifest: dict[str, Any],
    image_root: Path,
) -> dict[str, Any]:
    word_ids = {word["id"] for word in words}
    accepted_records = [
        record for record in manifest.get("images", []) if record.get("status") == "accepted"
    ]
    accepted_by_id = {record["wordId"]: record for record in accepted_records}
    accepted_ids = set(accepted_by_id)
    reviewed_ids = accepted_ids | {
        record["wordId"]
        for record in manifest.get("reviews", [])
        if record.get("status") in {"ACCEPT", "REJECT"}
    }
    missing_word_ids = sorted(word_ids - accepted_ids)
    unreviewed_word_ids = sorted(word_ids - reviewed_ids)
    invalid_word_ids = sorted(
        word_id
        for word_id in accepted_ids
        if word_id not in word_ids
        or not inspect_image(image_root / f"{word_id}.webp")["valid"]
    )

    return {
        "totalWords": len(word_ids),
        "accepted": len(accepted_ids),
        "remaining": len(missing_word_ids),
        "missingWordIds": missing_word_ids,
        "reviewed": len(word_ids & reviewed_ids),
        "unreviewed": len(unreviewed_word_ids),
        "unreviewedWordIds": unreviewed_word_ids,
        "firstPassComplete": not unreviewed_word_ids,
        "invalidWordIds": invalid_word_ids,
        "complete": not missing_word_ids and not invalid_word_ids,
    }


def require_complete(report: dict[str, Any]) -> None:
    if not report["complete"]:
        raise SystemExit(
            f"Comfy coverage incomplete: remaining={report['remaining']} "
            f"invalid={len(report['invalidWordIds'])}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit canonical Comfy word-image coverage.")
    parser.add_argument("--check", action="store_true", help="Validate the manifest and print a summary.")
    parser.add_argument("--require-complete", action="store_true", help="Exit non-zero unless every word is valid.")
    parser.add_argument("--write-report", type=Path, help="Write the complete validation report.")
    parser.add_argument("--word-list", type=Path, default=WORD_LIST_PATH)
    parser.add_argument("--manifest", type=Path, default=COMFY_MANIFEST_PATH)
    parser.add_argument("--image-root", type=Path, default=WORD_IMAGE_ROOT)
    args = parser.parse_args()

    payload = json.loads(args.word_list.read_text(encoding="utf-8"))
    words = payload["words"] if isinstance(payload, dict) else payload
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    report = validate_inventory(words, manifest, args.image_root)

    if args.write_report:
        args.write_report.parent.mkdir(parents=True, exist_ok=True)
        args.write_report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    summary = {
        "totalWords": report["totalWords"],
        "accepted": report["accepted"],
        "remaining": report["remaining"],
        "reviewed": report["reviewed"],
        "unreviewed": report["unreviewed"],
        "invalid": len(report["invalidWordIds"]),
        "complete": report["complete"],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if args.require_complete:
        require_complete(report)


if __name__ == "__main__":
    main()
