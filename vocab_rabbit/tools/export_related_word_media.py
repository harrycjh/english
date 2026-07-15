#!/usr/bin/env python3

from __future__ import annotations

import argparse
import io
import json
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
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
MANIFEST_PATH = PROJECT_ROOT / "public/content/words/word_related_media.json"
LIFE_PHOTO_COVERAGE_PATH = PROJECT_ROOT / "public/content/words/life_photo_coverage.json"
REPORT_PATH = (
    PROJECT_ROOT
    / "design-output/photo-word-linking/master-index/exported-related-word-media.json"
)
OXFORD_OUTPUT_ROOT = PROJECT_ROOT / "public/content/images/oxford-tree"
LIFE_PHOTO_OUTPUT_ROOT = PROJECT_ROOT / "public/content/images/life-photos"
LOCAL_LIFE_PHOTO_PACKAGE_PATH = (
    PROJECT_ROOT / "design-output/local-life-photo-package/vocab-rabbit-life-photos.zip"
)


@dataclass(frozen=True)
class PhotoCandidate:
    source_path: Path
    entry: dict[str, Any]
    match_rank: int

    @property
    def confidence(self) -> float:
        value = self.entry.get("confidence")
        return float(value) if isinstance(value, (int, float)) else 0.0

    def sort_key(self) -> tuple[int, float, int, str]:
        safe_rank = 1 if self.entry.get("safeForKids") is not False else 0
        return (self.match_rank, self.confidence, safe_rank, self.entry.get("id") or "")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_words() -> list[dict[str, Any]]:
    return load_json(WORD_LIST_PATH)["words"]


def load_path_mapping() -> dict[str, str]:
    if not PATH_MAPPING_PATH.exists():
        return {"/Volumes/ExternalSSD/Photo": "/Users/chujianhe/Photo"}

    raw_mapping = load_json(PATH_MAPPING_PATH)
    if "pathMappings" in raw_mapping:
        return {
            item["from"]: item["to"]
            for item in raw_mapping["pathMappings"]
            if item.get("from") and item.get("to")
        }

    return {key: value for key, value in raw_mapping.items() if isinstance(value, str)}


def localize_path(path_value: str | None, mapping: dict[str, str]) -> Path | None:
    if not path_value:
        return None
    for old_prefix, new_prefix in mapping.items():
        if path_value.startswith(old_prefix):
            return Path(new_prefix + path_value[len(old_prefix) :])
    return Path(path_value)


def resolve_oxford_root(value: str | None) -> Path:
    candidates = [
        Path(value).expanduser() if value else None,
        PROJECT_ROOT.parent / "oxford-tree",
        Path("/Users/chujianhe/English/oxford-tree"),
    ]
    for candidate in candidates:
        if candidate and candidate.exists() and list(candidate.glob("Level */*.pdf")):
            return candidate
    return PROJECT_ROOT.parent / "oxford-tree"


def find_oxford_pdf(oxford_root: Path, level: int, book: int) -> Path | None:
    level_dir = oxford_root / f"Level {level}"
    if not level_dir.exists():
        return None

    patterns = [
        f"{level}-{book}*.pdf",
        f"{level}-{book:02d}*.pdf",
        f"{level}-{book} *.pdf",
        f"{level}-{book:02d} *.pdf",
        f"{level}-{book}.*.pdf",
        f"{level}-{book:02d}.*.pdf",
    ]
    matches = sorted({path for pattern in patterns for path in level_dir.glob(pattern)})
    return matches[0] if matches else None


def image_to_webp_bytes(source_path: Path, max_width: int, quality: int) -> bytes:
    with Image.open(source_path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        if image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=quality, method=6)
        return buffer.getvalue()


def resize_to_webp(source_path: Path, output_path: Path, max_width: int, quality: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(image_to_webp_bytes(source_path, max_width, quality))


def export_pdf_page(pdf_path: Path, page: int, output_path: Path, max_width: int, quality: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmpdir:
        prefix = Path(tmpdir) / "page"
        subprocess.run(
            [
                "pdftoppm",
                "-f",
                str(page),
                "-l",
                str(page),
                "-png",
                "-singlefile",
                str(pdf_path),
                str(prefix),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        resize_to_webp(prefix.with_suffix(".png"), output_path, max_width, quality)


def collect_photo_candidates(word_ids: set[str]) -> dict[str, list[PhotoCandidate]]:
    mapping = load_path_mapping()
    master = load_json(MASTER_INDEX_PATH)
    candidates: dict[str, list[PhotoCandidate]] = {word_id: [] for word_id in word_ids}

    for entry in master["entries"]:
        if entry.get("reviewStatus") != "labeled" or entry.get("safeForKids") is False:
            continue

        source_path = localize_path(
            entry.get("localSourcePath") or entry.get("sourcePath") or entry.get("absolutePath"),
            mapping,
        )
        if source_path is None or not source_path.exists():
            continue

        primary_word_id = entry.get("primaryWordId")
        if primary_word_id in candidates:
            candidates[primary_word_id].append(PhotoCandidate(source_path, entry, match_rank=2))

        for secondary_word_id in entry.get("secondaryWordIds") or []:
            if secondary_word_id in candidates:
                candidates[secondary_word_id].append(PhotoCandidate(source_path, entry, match_rank=1))

    return candidates


def get_relative_public_path(path: Path) -> str:
    return "/" + str(path.relative_to(PROJECT_ROOT / "public"))


def build_oxford_label(ref: dict[str, Any]) -> str:
    return f"Level {ref['level']}, Book {ref['book']}, Page {ref['page']}"


def export_related_media(args: argparse.Namespace) -> dict[str, Any]:
    words = load_words()
    oxford_root = resolve_oxford_root(args.oxford_root)
    photo_candidates = collect_photo_candidates({word["id"] for word in words})
    existing_manifest = load_json(MANIFEST_PATH) if MANIFEST_PATH.exists() else {"entries": []}
    existing_red_rocket = {
        entry["wordId"]: (entry.get("relatedMedia") or {}).get("redRocket")
        for entry in existing_manifest.get("entries", [])
        if (entry.get("relatedMedia") or {}).get("redRocket")
    }

    entries: list[dict[str, Any]] = []
    skipped_oxford: list[dict[str, Any]] = []
    skipped_photos: list[str] = []
    exported_oxford_refs: set[tuple[int, int, int]] = set()
    life_photo_package_entries: list[dict[str, Any]] = []
    life_photo_package_files: list[tuple[str, bytes]] = []

    for word in words:
        word_id = word["id"]
        related_media: dict[str, Any] = {}
        if word_id in existing_red_rocket:
            related_media["redRocket"] = existing_red_rocket[word_id]

        first_ref = (word.get("oxfordRefs") or [None])[0]
        if first_ref:
            level = int(first_ref["level"])
            book = int(first_ref["book"])
            page = int(first_ref["page"])
            pdf_path = find_oxford_pdf(oxford_root, level, book)
            output_path = OXFORD_OUTPUT_ROOT / f"level-{level}" / f"book-{book}" / f"page-{page}.webp"
            if pdf_path:
                if args.dry_run or output_path.exists():
                    exported_oxford_refs.add((level, book, page))
                else:
                    try:
                        export_pdf_page(pdf_path, page, output_path, args.oxford_max_width, args.quality)
                        exported_oxford_refs.add((level, book, page))
                    except subprocess.CalledProcessError as error:
                        skipped_oxford.append(
                            {
                                "wordId": word_id,
                                "level": level,
                                "book": book,
                                "page": page,
                                "reason": error.stderr.decode("utf-8", errors="ignore").strip(),
                            }
                        )
                        pdf_path = None
                if pdf_path:
                    related_media["oxford"] = {
                        "imagePath": get_relative_public_path(output_path),
                        "label": build_oxford_label(first_ref),
                        "level": level,
                        "book": book,
                        "page": page,
                    }
            else:
                skipped_oxford.append(
                    {"wordId": word_id, "level": level, "book": book, "page": page, "reason": "pdf not found"}
                )

        candidates = sorted(photo_candidates.get(word_id, []), key=PhotoCandidate.sort_key, reverse=True)
        if candidates:
            best = candidates[0]
            life_photo = {
                "imagePath": f"/life-photos/{word_id}.webp",
                "caption": best.entry.get("scene") or best.entry.get("colorMood") or "matched life photo",
                "photoId": best.entry.get("id") or "",
                "match": "primary" if best.match_rank == 2 else "secondary",
                "confidence": round(best.confidence, 3),
            }
            life_photo_package_entries.append({"wordId": word_id, "relatedMedia": {"lifePhoto": life_photo}})
            if not args.dry_run:
                life_photo_package_files.append(
                    (f"life-photos/{word_id}.webp", image_to_webp_bytes(best.source_path, args.photo_max_width, args.quality))
                )
        else:
            skipped_photos.append(word_id)

        if related_media:
            entries.append({"wordId": word_id, "relatedMedia": related_media})

    with_red_rocket = sum(1 for entry in entries if "redRocket" in entry["relatedMedia"])
    manifest = {
        "schemaVersion": 2 if with_red_rocket else 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "totalWords": len(words),
            "entries": len(entries),
            "withOxford": sum(1 for entry in entries if "oxford" in entry["relatedMedia"]),
            "withLifePhoto": 0,
            "uniqueOxfordImages": len(exported_oxford_refs),
            "lifePhotoPackageImages": len(life_photo_package_entries),
            "withRedRocket": with_red_rocket,
            "uniqueRedRocketImages": (existing_manifest.get("stats") or {}).get("uniqueRedRocketImages", 0),
            "redRocketAtlases": (existing_manifest.get("stats") or {}).get("redRocketAtlases", 0),
        },
        "entries": entries,
    }
    if with_red_rocket:
        manifest["redRocketAtlasGrid"] = existing_manifest.get("redRocketAtlasGrid") or {
            "columns": 3,
            "rows": 3,
            "cellSize": 512,
        }
    life_photo_package_manifest = {
        "schemaVersion": 1,
        "generatedAt": manifest["generatedAt"],
        "stats": {
            "totalWords": len(words),
            "withLifePhoto": len(life_photo_package_entries),
        },
        "entries": life_photo_package_entries,
    }
    life_photo_coverage_manifest = {
        "schemaVersion": 1,
        "generatedAt": manifest["generatedAt"],
        "count": len(life_photo_package_entries),
        "wordIds": sorted(entry["wordId"] for entry in life_photo_package_entries),
    }
    report = {
        "meta": {
            "script": "tools/export_related_word_media.py",
            "dryRun": args.dry_run,
            "oxfordRoot": str(oxford_root),
            "masterIndex": str(MASTER_INDEX_PATH),
        },
        "stats": manifest["stats"],
        "lifePhotoPackage": str(LOCAL_LIFE_PHOTO_PACKAGE_PATH),
        "skippedOxford": skipped_oxford,
        "skippedLifePhotoWordIds": skipped_photos,
    }

    if not args.dry_run:
        write_json(MANIFEST_PATH, manifest)
        write_json(LIFE_PHOTO_COVERAGE_PATH, life_photo_coverage_manifest)
        write_json(REPORT_PATH, report)
        LOCAL_LIFE_PHOTO_PACKAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(LOCAL_LIFE_PHOTO_PACKAGE_PATH, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "word_related_media.json",
                json.dumps(life_photo_package_manifest, ensure_ascii=False, indent=2) + "\n",
            )
            for image_path, image_bytes in life_photo_package_files:
                archive.writestr(image_path, image_bytes)

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Export one Oxford Tree image and one life photo per word.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--oxford-root", default=None)
    parser.add_argument("--oxford-max-width", type=int, default=900)
    parser.add_argument("--photo-max-width", type=int, default=720)
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()

    report = export_related_media(args)
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    if report["skippedOxford"]:
        print(f"skippedOxford={len(report['skippedOxford'])}")
    if report["skippedLifePhotoWordIds"]:
        print(f"skippedLifePhotoWordIds={len(report['skippedLifePhotoWordIds'])}")


if __name__ == "__main__":
    main()
