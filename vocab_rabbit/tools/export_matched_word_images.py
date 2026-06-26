#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORD_LIST_PATH = PROJECT_ROOT / "public/content/words/ket_vocabulary.json"
MASTER_INDEX_PATH = (
    PROJECT_ROOT
    / "design-output/photo-word-linking/master-index/photo-linking-master-index.json"
)
PATH_MAPPING_PATH = PROJECT_ROOT / "design-output/photo-word-linking/path-mapping.local.json"
REPORT_PATH = (
    PROJECT_ROOT
    / "design-output/photo-word-linking/master-index/exported-matched-word-images.json"
)


@dataclass(frozen=True)
class Candidate:
    word_id: str
    source_path: Path
    entry: dict[str, Any]
    match_rank: int

    @property
    def confidence(self) -> float:
        value = self.entry.get("confidence")
        return value if isinstance(value, (int, float)) else 0.0

    def sort_key(self) -> tuple[int, float, int, str]:
        safe_rank = 1 if self.entry.get("safeForKids") is not False else 0
        return (self.match_rank, self.confidence, safe_rank, self.entry.get("id") or "")


def load_words() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    payload = json.loads(WORD_LIST_PATH.read_text(encoding="utf-8"))
    words = payload["words"] if isinstance(payload, dict) else payload
    return payload, words


def load_path_mapping() -> dict[str, str]:
    if not PATH_MAPPING_PATH.exists():
        return {"/Volumes/ExternalSSD/Photo": "/Users/chujianhe/Photo"}
    mapping = json.loads(PATH_MAPPING_PATH.read_text(encoding="utf-8"))
    mapping.setdefault("/Volumes/ExternalSSD/Photo", "/Users/chujianhe/Photo")
    return mapping


def localize_path(path_value: str | None, mapping: dict[str, str]) -> Path | None:
    if not path_value:
        return None
    for old_prefix, new_prefix in mapping.items():
        if path_value.startswith(old_prefix):
            return Path(new_prefix + path_value[len(old_prefix) :])
    return Path(path_value)


def target_image_path(word: dict[str, Any]) -> Path | None:
    image_path = word.get("imagePath")
    if not image_path:
        return None
    return PROJECT_ROOT / "public" / image_path.lstrip("/")


def collect_candidates(missing_word_ids: set[str]) -> dict[str, list[Candidate]]:
    mapping = load_path_mapping()
    master = json.loads(MASTER_INDEX_PATH.read_text(encoding="utf-8"))
    candidates: dict[str, list[Candidate]] = {word_id: [] for word_id in missing_word_ids}

    for entry in master["entries"]:
        if entry.get("reviewStatus") != "labeled":
            continue

        source_path = localize_path(
            entry.get("localSourcePath") or entry.get("sourcePath") or entry.get("absolutePath"),
            mapping,
        )
        if source_path is None or not source_path.exists():
            continue

        primary_word_id = entry.get("primaryWordId")
        if primary_word_id in candidates:
            candidates[primary_word_id].append(
                Candidate(primary_word_id, source_path, entry, match_rank=2)
            )

        for secondary_word_id in entry.get("secondaryWordIds") or []:
            if secondary_word_id in candidates:
                candidates[secondary_word_id].append(
                    Candidate(secondary_word_id, source_path, entry, match_rank=1)
                )

    return candidates


def export_image(source_path: Path, output_path: Path, max_width: int, quality: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source_path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        if image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.Resampling.LANCZOS)
        image.save(output_path, "WEBP", quality=quality, method=6)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export matched fallback photos into missing word image assets."
    )
    parser.add_argument("--dry-run", action="store_true", help="Report actions without writing files.")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing word image files.")
    parser.add_argument("--max-width", type=int, default=800)
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()

    payload, words = load_words()
    missing_words = [
        word
        for word in words
        if word.get("imagePath")
        and (args.overwrite or not target_image_path(word).exists())
        and not word.get("imageApproved", False)
    ]
    missing_word_ids = {word["id"] for word in missing_words}
    candidates = collect_candidates(missing_word_ids)

    exported: list[dict[str, Any]] = []
    uncovered: list[dict[str, str]] = []

    for word in missing_words:
        word_id = word["id"]
        target_path = target_image_path(word)
        word_candidates = sorted(candidates.get(word_id, []), key=Candidate.sort_key, reverse=True)
        if not word_candidates or target_path is None:
            uncovered.append({"wordId": word_id, "english": word.get("english", "")})
            continue

        best = word_candidates[0]
        if not args.dry_run:
            export_image(best.source_path, target_path, args.max_width, args.quality)
            word["imageApproved"] = True

        exported.append(
            {
                "wordId": word_id,
                "english": word.get("english", ""),
                "imagePath": word.get("imagePath"),
                "sourcePath": str(best.source_path),
                "photoId": best.entry.get("id"),
                "labelSource": best.entry.get("labelSource"),
                "match": "primary" if best.match_rank == 2 else "secondary",
                "confidence": best.confidence,
            }
        )

    report = {
        "meta": {
            "script": "tools/export_matched_word_images.py",
            "dryRun": args.dry_run,
            "masterIndex": str(MASTER_INDEX_PATH),
            "wordList": str(WORD_LIST_PATH),
        },
        "stats": {
            "missingWordsConsidered": len(missing_words),
            "exported": len(exported),
            "uncovered": len(uncovered),
        },
        "exported": exported,
        "uncovered": uncovered,
    }

    if not args.dry_run:
        WORD_LIST_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        REPORT_PATH.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
