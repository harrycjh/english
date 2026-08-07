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
REVIEW_SELECTIONS_PATH = PROJECT_ROOT / "review-data/photo-match-review-selections.json"
CAPTIONS_PATH = (
    PROJECT_ROOT / "design-output/photo-word-linking/captions/qwen-captions-all.jsonl"
)
DEV_LIFE_PHOTO_ROOT = PROJECT_ROOT / "dev-life-photos"


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


def update_public_life_photo_package_count(count: int) -> None:
    if not MANIFEST_PATH.exists():
        return
    manifest = load_json(MANIFEST_PATH)
    manifest.setdefault("stats", {})["lifePhotoPackageImages"] = count
    write_json(MANIFEST_PATH, manifest)


def load_words() -> list[dict[str, Any]]:
    return load_json(WORD_LIST_PATH)["words"]


def preserved_media_by_word(manifest: dict[str, Any], source: str) -> dict[str, dict[str, Any]]:
    return {
        entry["wordId"]: (entry.get("relatedMedia") or {})[source]
        for entry in manifest.get("entries", [])
        if (entry.get("relatedMedia") or {}).get(source)
    }


def load_latest_photo_captions() -> dict[str, str]:
    latest: dict[str, dict[str, Any]] = {}
    if not CAPTIONS_PATH.exists():
        return {}
    with CAPTIONS_PATH.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid caption JSON on line {line_number}: {error}") from error
            photo_id = row.get("photoId")
            if photo_id:
                latest[photo_id] = row
    return {
        photo_id: str((row.get("caption") or {}).get("captionZh") or "")
        for photo_id, row in latest.items()
        if row.get("status") == "ok" and row.get("caption")
    }


def selected_photos_from_review(payload: dict[str, Any]) -> dict[str, str]:
    selected = {
        word_id: selection["photoId"]
        for word_id, selection in (payload.get("selections") or {}).items()
        if selection.get("status") == "selected" and selection.get("photoId")
    }
    photo_ids = list(selected.values())
    if len(photo_ids) != len(set(photo_ids)):
        raise ValueError("review selections contain a photo assigned to more than one word")
    return selected


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

    if REVIEW_SELECTIONS_PATH.exists():
        selected = selected_photos_from_review(load_json(REVIEW_SELECTIONS_PATH))
        unknown_word_ids = set(selected) - word_ids
        if unknown_word_ids:
            raise ValueError(f"review selections contain unknown words: {sorted(unknown_word_ids)}")

        entries_by_id = {entry["id"]: entry for entry in master["entries"]}
        captions_by_id = load_latest_photo_captions()
        missing: list[str] = []
        for word_id, photo_id in selected.items():
            entry = entries_by_id.get(photo_id)
            if entry is None or entry.get("safeForKids") is False:
                missing.append(f"{word_id}:{photo_id}:missing-or-unsafe")
                continue
            source_path = localize_path(
                entry.get("localSourcePath") or entry.get("sourcePath") or entry.get("absolutePath"),
                mapping,
            )
            if source_path is None or not source_path.exists():
                missing.append(f"{word_id}:{photo_id}:source-file-missing")
                continue
            reviewed_entry = {
                **entry,
                "scene": captions_by_id.get(photo_id) or entry.get("scene") or entry.get("colorMood"),
                "confidence": 1.0,
            }
            candidates[word_id].append(PhotoCandidate(source_path, reviewed_entry, match_rank=3))
        if missing:
            preview = ", ".join(missing[:12])
            suffix = "" if len(missing) <= 12 else f" ... and {len(missing) - 12} more"
            raise ValueError(f"reviewed photos could not be exported: {preview}{suffix}")
        return candidates

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


def build_life_photo_asset(
    word_id: str,
    candidate: PhotoCandidate,
    max_width: int,
    quality: int,
) -> tuple[dict[str, Any], tuple[str, bytes]]:
    life_photo = {
        "imagePath": f"/life-photos/{word_id}.webp",
        "caption": candidate.entry.get("scene")
        or candidate.entry.get("colorMood")
        or "matched life photo",
        "photoId": candidate.entry.get("id") or "",
        "match": "primary" if candidate.match_rank >= 2 else "secondary",
        "confidence": round(candidate.confidence, 3),
    }
    return (
        {"wordId": word_id, "relatedMedia": {"lifePhoto": life_photo}},
        (
            f"life-photos/{word_id}.webp",
            image_to_webp_bytes(candidate.source_path, max_width, quality),
        ),
    )


def write_life_photo_package(
    manifest: dict[str, Any],
    files: list[tuple[str, bytes]],
) -> None:
    LOCAL_LIFE_PHOTO_PACKAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=LOCAL_LIFE_PHOTO_PACKAGE_PATH.parent,
        delete=False,
        suffix=".zip.tmp",
    ) as handle:
        temporary_path = Path(handle.name)
    try:
        with zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "word_related_media.json",
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            )
            for image_path, image_bytes in files:
                archive.writestr(image_path, image_bytes)
        temporary_path.replace(LOCAL_LIFE_PHOTO_PACKAGE_PATH)
    finally:
        temporary_path.unlink(missing_ok=True)


def sync_dev_life_photos(
    manifest: dict[str, Any],
    files: list[tuple[str, bytes]],
) -> None:
    photo_root = DEV_LIFE_PHOTO_ROOT / "life-photos"
    photo_root.mkdir(parents=True, exist_ok=True)
    expected_names = set()
    for image_path, image_bytes in files:
        file_name = Path(image_path).name
        expected_names.add(file_name)
        (photo_root / file_name).write_bytes(image_bytes)
    for existing_path in photo_root.glob("*.webp"):
        if existing_path.name not in expected_names:
            existing_path.unlink()
    write_json(DEV_LIFE_PHOTO_ROOT / "word_related_media.json", manifest)


def export_life_photos_only(args: argparse.Namespace) -> dict[str, Any]:
    words = load_words()
    photo_candidates = collect_photo_candidates({word["id"] for word in words})
    generated_at = datetime.now(timezone.utc).isoformat()
    package_entries: list[dict[str, Any]] = []
    package_files: list[tuple[str, bytes]] = []
    skipped_word_ids: list[str] = []

    for word in words:
        word_id = word["id"]
        candidates = sorted(photo_candidates.get(word_id, []), key=PhotoCandidate.sort_key, reverse=True)
        if not candidates:
            skipped_word_ids.append(word_id)
            continue
        entry, image_file = build_life_photo_asset(
            word_id,
            candidates[0],
            args.photo_max_width,
            args.quality,
        )
        package_entries.append(entry)
        package_files.append(image_file)

    package_manifest = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "stats": {
            "totalWords": len(words),
            "withLifePhoto": len(package_entries),
        },
        "entries": package_entries,
    }
    coverage_manifest = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "count": len(package_entries),
        "wordIds": sorted(entry["wordId"] for entry in package_entries),
    }
    report = {
        "generatedAt": generated_at,
        "reviewSelections": str(REVIEW_SELECTIONS_PATH),
        "selectedPhotos": len(package_entries),
        "skippedWords": len(skipped_word_ids),
        "skippedWordIds": skipped_word_ids,
        "package": str(LOCAL_LIFE_PHOTO_PACKAGE_PATH),
        "devLifePhotos": str(DEV_LIFE_PHOTO_ROOT),
    }
    if not args.dry_run:
        write_life_photo_package(package_manifest, package_files)
        sync_dev_life_photos(package_manifest, package_files)
        write_json(LIFE_PHOTO_COVERAGE_PATH, coverage_manifest)
        update_public_life_photo_package_count(len(package_entries))
        write_json(
            PROJECT_ROOT
            / "design-output/photo-word-linking/review/exported-reviewed-life-photos.json",
            report,
        )
    return report


def export_related_media(args: argparse.Namespace) -> dict[str, Any]:
    words = load_words()
    words_by_id = {word["id"]: word for word in words}
    oxford_root = resolve_oxford_root(args.oxford_root)
    photo_candidates = collect_photo_candidates({word["id"] for word in words})
    existing_manifest = load_json(MANIFEST_PATH) if MANIFEST_PATH.exists() else {"entries": []}
    existing_red_rocket = preserved_media_by_word(existing_manifest, "redRocket")
    existing_raz = preserved_media_by_word(existing_manifest, "raz")
    existing_oxford_sentences = {
        entry["wordId"]: {
            "sentence": ((entry.get("relatedMedia") or {}).get("oxford") or {}).get("sentence"),
            "sentenceTranslation": (
                ((entry.get("relatedMedia") or {}).get("oxford") or {}).get("sentenceTranslation")
            ),
        }
        for entry in existing_manifest.get("entries", [])
        if ((entry.get("relatedMedia") or {}).get("oxford") or {}).get("sentence")
    }
    existing_oxford_page_overrides: dict[str, dict[str, Any]] = {}
    for entry in existing_manifest.get("entries", []):
        oxford = (entry.get("relatedMedia") or {}).get("oxford")
        word = words_by_id.get(entry["wordId"], {})
        first_ref = (word.get("oxfordRefs") or [None])[0]
        if not oxford or not oxford.get("imagePath"):
            continue
        existing_page = (oxford.get("level"), oxford.get("book"), oxford.get("page"))
        source_page = (
            first_ref.get("level"),
            first_ref.get("book"),
            first_ref.get("page"),
        ) if first_ref else None
        if source_page is None or existing_page != source_page:
            existing_oxford_page_overrides[entry["wordId"]] = oxford

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
        if word_id in existing_raz:
            related_media["raz"] = existing_raz[word_id]

        first_ref = (word.get("oxfordRefs") or [None])[0]
        if word_id in existing_oxford_page_overrides:
            existing_override = existing_oxford_page_overrides[word_id]
            related_media["oxford"] = existing_override
            exported_oxford_refs.add(
                (
                    int(existing_override["level"]),
                    int(existing_override["book"]),
                    int(existing_override["page"]),
                )
            )
            first_ref = None
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
                    if word_id in existing_oxford_sentences:
                        related_media["oxford"].update(
                            {
                                key: value
                                for key, value in existing_oxford_sentences[word_id].items()
                                if value
                            }
                        )
            else:
                skipped_oxford.append(
                    {"wordId": word_id, "level": level, "book": book, "page": page, "reason": "pdf not found"}
                )

        candidates = sorted(photo_candidates.get(word_id, []), key=PhotoCandidate.sort_key, reverse=True)
        if candidates:
            best = candidates[0]
            life_photo_entry, life_photo_file = build_life_photo_asset(
                word_id,
                best,
                args.photo_max_width,
                args.quality,
            )
            life_photo_package_entries.append(life_photo_entry)
            if not args.dry_run:
                life_photo_package_files.append(life_photo_file)
        else:
            skipped_photos.append(word_id)

        if related_media:
            entries.append({"wordId": word_id, "relatedMedia": related_media})

    with_red_rocket = sum(1 for entry in entries if "redRocket" in entry["relatedMedia"])
    with_raz = sum(1 for entry in entries if "raz" in entry["relatedMedia"])
    manifest = {
        "schemaVersion": 3 if with_raz else 2 if with_red_rocket else 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "totalWords": len(words),
            "entries": len(entries),
            "withOxford": sum(1 for entry in entries if "oxford" in entry["relatedMedia"]),
            "withLifePhoto": 0,
            "uniqueOxfordImages": len(exported_oxford_refs),
            "withOxfordSentence": sum(
                1
                for entry in entries
                if ((entry.get("relatedMedia") or {}).get("oxford") or {}).get("sentence")
            ),
            "lifePhotoPackageImages": len(life_photo_package_entries),
            "withRedRocket": with_red_rocket,
            "uniqueRedRocketImages": (existing_manifest.get("stats") or {}).get("uniqueRedRocketImages", 0),
            "redRocketAtlases": (existing_manifest.get("stats") or {}).get("redRocketAtlases", 0),
            "withRaz": with_raz,
            "uniqueRazImages": (existing_manifest.get("stats") or {}).get("uniqueRazImages", 0),
            "razAtlases": (existing_manifest.get("stats") or {}).get("razAtlases", 0),
        },
        "entries": entries,
    }
    if with_red_rocket:
        manifest["redRocketAtlasGrid"] = existing_manifest.get("redRocketAtlasGrid") or {
            "columns": 3,
            "rows": 3,
            "cellSize": 512,
        }
    if with_raz:
        manifest["razAtlasGrid"] = existing_manifest.get("razAtlasGrid") or {
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
        write_life_photo_package(life_photo_package_manifest, life_photo_package_files)
        sync_dev_life_photos(life_photo_package_manifest, life_photo_package_files)

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Export one Oxford Tree image and one life photo per word.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--life-photos-only", action="store_true")
    parser.add_argument("--oxford-root", default=None)
    parser.add_argument("--oxford-max-width", type=int, default=900)
    parser.add_argument("--photo-max-width", type=int, default=720)
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()

    if args.life_photos_only:
        print(json.dumps(export_life_photos_only(args), ensure_ascii=False, indent=2))
        return

    report = export_related_media(args)
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    if report["skippedOxford"]:
        print(f"skippedOxford={len(report['skippedOxford'])}")
    if report["skippedLifePhotoWordIds"]:
        print(f"skippedLifePhotoWordIds={len(report['skippedLifePhotoWordIds'])}")


if __name__ == "__main__":
    main()
