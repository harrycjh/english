#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORD_IMAGE_ROOT = PROJECT_ROOT / "public/content/images/words"
COMFY_MANIFEST_PATH = PROJECT_ROOT / "public/content/words/comfy-image-manifest.json"
FINAL_REVIEW_STATES = {"ACCEPT", "REJECT"}


def load_review(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file, delimiter="\t"))

    decisions: dict[str, dict[str, str]] = {}
    for row in rows:
        word_id = (row.get("wordId") or "").strip()
        status = (row.get("status") or "").strip().upper()
        if not word_id:
            raise ValueError("Review row is missing wordId")
        if word_id in decisions:
            raise ValueError(f"Duplicate review decision for {word_id}")
        if status not in FINAL_REVIEW_STATES:
            raise ValueError(f"Review for {word_id} is not final: {status or 'EMPTY'}")
        decisions[word_id] = {
            **row,
            "wordId": word_id,
            "status": status,
            "notes": (row.get("notes") or "").strip(),
        }
    return decisions


def validate_sample(path: Path) -> None:
    if not path.exists():
        raise ValueError(f"Accepted sample does not exist: {path}")
    try:
        with Image.open(path) as image:
            image.load()
            if image.size != (512, 512):
                raise ValueError(f"Accepted sample must be 512x512: {path} is {image.size}")
    except OSError as error:
        raise ValueError(f"Accepted sample cannot be decoded: {path}") from error


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    temporary = path.with_name(f"{path.name}.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def apply_batch(
    run_dir: Path,
    image_root: Path,
    manifest_path: Path,
    backup_root: Path | None = None,
) -> dict[str, Any]:
    run_manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    records = run_manifest["records"]
    records_by_id = {record["wordId"]: record for record in records}
    if len(records_by_id) != len(records):
        raise ValueError("Run manifest contains duplicate wordId records")

    decisions = load_review(run_dir / "review/manual-review.tsv")
    manifest_ids = set(records_by_id)
    review_ids = set(decisions)
    if manifest_ids != review_ids:
        missing = sorted(manifest_ids - review_ids)
        extra = sorted(review_ids - manifest_ids)
        raise ValueError(f"Review IDs do not match run manifest: missing={missing}, extra={extra}")

    accepted_word_ids = sorted(
        word_id for word_id, decision in decisions.items() if decision["status"] == "ACCEPT"
    )
    rejected_word_ids = sorted(
        word_id for word_id, decision in decisions.items() if decision["status"] == "REJECT"
    )

    for word_id in accepted_word_ids:
        validate_sample(Path(records_by_id[word_id]["samplePath"]))

    backup_directory = backup_root or (run_dir / "original-webp-backup")
    backup_directory.mkdir(parents=True, exist_ok=True)
    image_root.mkdir(parents=True, exist_ok=True)

    for word_id in accepted_word_ids:
        source_path = Path(records_by_id[word_id]["samplePath"])
        destination = image_root / f"{word_id}.webp"
        backup_path = backup_directory / destination.name
        if destination.exists() and not backup_path.exists():
            shutil.copy2(destination, backup_path)

        temporary = destination.with_name(f"{destination.name}.tmp")
        with Image.open(source_path) as image:
            image.convert("RGB").save(temporary, "WEBP", quality=88, method=6)
        temporary.replace(destination)

    provenance = json.loads(manifest_path.read_text(encoding="utf-8"))
    provenance_by_id = {
        record["wordId"]: record
        for record in provenance.get("images", [])
    }
    reviews_by_id = {
        record["wordId"]: record
        for record in provenance.get("reviews", [])
    }
    run_id = run_manifest.get("meta", {}).get("runId") or run_dir.name
    accepted_at = datetime.now(timezone.utc).isoformat()
    for word_id, decision in decisions.items():
        record = records_by_id[word_id]
        reviews_by_id[word_id] = {
            "wordId": word_id,
            "status": decision["status"],
            "runId": run_id,
            "seed": record.get("seed"),
            "prompt": record.get("prompt", ""),
            "reviewNotes": decision["notes"],
            "reviewedAt": accepted_at,
        }
    for word_id in accepted_word_ids:
        record = records_by_id[word_id]
        provenance_by_id[word_id] = {
            "wordId": word_id,
            "status": "accepted",
            "source": "comfy-run",
            "runId": run_id,
            "seed": record.get("seed"),
            "prompt": record.get("prompt", ""),
            "reviewNotes": decisions[word_id]["notes"],
            "acceptedAt": accepted_at,
            "width": 512,
            "height": 512,
        }
    provenance["version"] = 1
    provenance["images"] = [
        provenance_by_id[word_id]
        for word_id in sorted(provenance_by_id)
    ]
    provenance["reviews"] = [
        reviews_by_id[word_id]
        for word_id in sorted(reviews_by_id)
    ]
    write_json_atomic(manifest_path, provenance)

    return {
        "acceptedWordIds": accepted_word_ids,
        "rejectedWordIds": rejected_word_ids,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply a fully reviewed Comfy image batch.")
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--image-root", type=Path, default=WORD_IMAGE_ROOT)
    parser.add_argument("--manifest", type=Path, default=COMFY_MANIFEST_PATH)
    parser.add_argument("--backup-root", type=Path)
    args = parser.parse_args()

    result = apply_batch(args.run_dir, args.image_root, args.manifest, args.backup_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
