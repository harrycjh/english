#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORD_LIST_PATH = PROJECT_ROOT / "public/content/words/ket_vocabulary.json"
PUBLIC_MANIFEST_PATH = PROJECT_ROOT / "public/content/words/word_related_media.json"
LIFE_PHOTO_COVERAGE_PATH = PROJECT_ROOT / "public/content/words/life_photo_coverage.json"
PUBLIC_ROOT = PROJECT_ROOT / "public"
LOCAL_PACKAGE_PATH = PROJECT_ROOT / "design-output/local-life-photo-package/vocab-rabbit-life-photos.zip"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def public_path_exists(path_value: str) -> bool:
    return (PUBLIC_ROOT / path_value.lstrip("/")).exists()


def validate_public_manifest(word_ids: set[str]) -> list[str]:
    errors: list[str] = []
    manifest = load_json(PUBLIC_MANIFEST_PATH)
    entries = manifest.get("entries", [])
    with_oxford = 0
    with_life_photo = 0
    with_red_rocket = 0
    with_raz = 0
    with_oxford_sentence_translation = 0
    with_red_rocket_sentence_translation = 0
    with_raz_sentence = 0
    with_raz_sentence_translation = 0
    red_rocket_atlases: set[str] = set()
    red_rocket_images: set[tuple[str, str | int, int | None]] = set()
    raz_atlases: set[str] = set()
    raz_images: set[tuple[str, int | None, int | None]] = set()

    if manifest.get("schemaVersion") not in (1, 2, 3):
        errors.append("public manifest schemaVersion must be 1, 2, or 3")

    for entry in entries:
        word_id = entry.get("wordId")
        if word_id not in word_ids:
            errors.append(f"public manifest has unknown wordId: {word_id}")
            continue

        related_media = entry.get("relatedMedia") or {}
        oxford = related_media.get("oxford")
        life_photo = related_media.get("lifePhoto")
        red_rocket = related_media.get("redRocket")
        raz = related_media.get("raz")

        if oxford:
            with_oxford += 1
            image_path = oxford.get("imagePath", "")
            if not image_path.startswith("/content/images/oxford-tree/"):
                errors.append(f"{word_id} oxford imagePath must stay under /content/images/oxford-tree/")
            if not public_path_exists(image_path):
                errors.append(f"{word_id} oxford imagePath is missing: {image_path}")
            if oxford.get("sentence"):
                if oxford.get("sentenceTranslation"):
                    with_oxford_sentence_translation += 1
                else:
                    errors.append(f"{word_id} oxford sentence is missing sentenceTranslation")

        if life_photo:
            with_life_photo += 1
            errors.append(f"{word_id} public manifest must not include lifePhoto")

        if red_rocket:
            with_red_rocket += 1
            atlas_path = red_rocket.get("atlasPath", "")
            image_path = red_rocket.get("imagePath", "")
            row = red_rocket.get("row")
            column = red_rocket.get("column")
            red_rocket_atlases.add(atlas_path)
            if image_path:
                red_rocket_images.add(("image", image_path, None))
                if not image_path.startswith("/content/images/red-rocket-pages/"):
                    errors.append(
                        f"{word_id} corrected Red Rocket imagePath must stay under "
                        "/content/images/red-rocket-pages/"
                    )
                if not public_path_exists(image_path):
                    errors.append(f"{word_id} corrected Red Rocket image is missing: {image_path}")
            else:
                red_rocket_images.add((atlas_path, row, column))
            if not atlas_path.startswith("/content/images/red-rocket-atlases/"):
                errors.append(f"{word_id} Red Rocket atlasPath must stay under /content/images/red-rocket-atlases/")
            if not public_path_exists(atlas_path):
                errors.append(f"{word_id} Red Rocket atlas is missing: {atlas_path}")
            if row not in (0, 1, 2) or column not in (0, 1, 2):
                errors.append(f"{word_id} Red Rocket atlas cell is invalid")
            if red_rocket.get("sentence"):
                if red_rocket.get("sentenceTranslation"):
                    with_red_rocket_sentence_translation += 1
                else:
                    errors.append(f"{word_id} Red Rocket sentence is missing sentenceTranslation")

        if raz:
            with_raz += 1
            atlas_path = raz.get("atlasPath", "")
            row = raz.get("row")
            column = raz.get("column")
            raz_atlases.add(atlas_path)
            raz_images.add((atlas_path, row, column))
            if not atlas_path.startswith("/content/images/raz-atlases/"):
                errors.append(f"{word_id} RAZ atlasPath must stay under /content/images/raz-atlases/")
            if not public_path_exists(atlas_path):
                errors.append(f"{word_id} RAZ atlas is missing: {atlas_path}")
            if row not in (0, 1, 2) or column not in (0, 1, 2):
                errors.append(f"{word_id} RAZ atlas cell is invalid")
            if not raz.get("bookId") or not raz.get("page"):
                errors.append(f"{word_id} RAZ reference is missing bookId or page")
            if raz.get("sentence"):
                with_raz_sentence += 1
                if raz.get("sentenceTranslation"):
                    with_raz_sentence_translation += 1

    stats = manifest.get("stats", {})
    if stats.get("entries") != len(entries):
        errors.append("public stats.entries does not match entry count")
    if stats.get("withOxford") != with_oxford:
        errors.append("public stats.withOxford does not match entry count")
    if stats.get("withLifePhoto") != with_life_photo:
        errors.append("public stats.withLifePhoto does not match entry count")
    if stats.get("withRedRocket", 0) != with_red_rocket:
        errors.append("public stats.withRedRocket does not match entry count")
    if stats.get("uniqueRedRocketImages", 0) != len(red_rocket_images):
        errors.append("public stats.uniqueRedRocketImages does not match displayed page images")
    if stats.get("redRocketAtlases", 0) != len(red_rocket_atlases):
        errors.append("public stats.redRocketAtlases does not match unique atlas paths")
    if stats.get("withRaz", 0) != with_raz:
        errors.append("public stats.withRaz does not match entry count")
    if stats.get("uniqueRazImages", 0) != len(raz_images):
        errors.append("public stats.uniqueRazImages does not match displayed page images")
    if stats.get("razAtlases", 0) != len(raz_atlases):
        errors.append("public stats.razAtlases does not match unique atlas paths")
    if stats.get("withOxfordSentenceTranslation", 0) != with_oxford_sentence_translation:
        errors.append("public stats.withOxfordSentenceTranslation does not match translated sentence count")
    if stats.get("withRedRocketSentenceTranslation", 0) != with_red_rocket_sentence_translation:
        errors.append("public stats.withRedRocketSentenceTranslation does not match translated sentence count")
    if stats.get("withRazSentence", 0) != with_raz_sentence:
        errors.append("public stats.withRazSentence does not match sentence count")
    if stats.get("withRazSentenceTranslation", 0) != with_raz_sentence_translation:
        errors.append("public stats.withRazSentenceTranslation does not match translated sentence count")
    if (PUBLIC_ROOT / "content/images/life-photos").exists():
        errors.append("public/content/images/life-photos must not exist")

    return errors


def validate_local_life_photo_package(word_ids: set[str]) -> list[str]:
    errors: list[str] = []
    if not LOCAL_PACKAGE_PATH.exists():
        return [f"local life photo package is missing: {LOCAL_PACKAGE_PATH}"]

    with zipfile.ZipFile(LOCAL_PACKAGE_PATH) as archive:
        names = set(archive.namelist())
        if "word_related_media.json" not in names:
            return ["local life photo package is missing word_related_media.json"]

        manifest = json.loads(archive.read("word_related_media.json"))
        entries = manifest.get("entries", [])
        image_count = sum(1 for name in names if name.startswith("life-photos/") and name.endswith(".webp"))
        package_word_ids = [entry.get("wordId") for entry in entries]
        package_photo_ids = [
            ((entry.get("relatedMedia") or {}).get("lifePhoto") or {}).get("photoId")
            for entry in entries
        ]

        if manifest.get("schemaVersion") != 1:
            errors.append("local package manifest schemaVersion must be 1")
        if len(package_word_ids) != len(set(package_word_ids)):
            errors.append("local package contains duplicate wordIds")
        if len(package_photo_ids) != len(set(package_photo_ids)):
            errors.append("local package contains a photo assigned to more than one word")

        for entry in entries:
            word_id = entry.get("wordId")
            if word_id not in word_ids:
                errors.append(f"local package has unknown wordId: {word_id}")
                continue

            life_photo = (entry.get("relatedMedia") or {}).get("lifePhoto")
            if not life_photo:
                errors.append(f"{word_id} local package entry is missing lifePhoto")
                continue

            image_path = life_photo.get("imagePath", "")
            if not image_path.startswith("/life-photos/"):
                errors.append(f"{word_id} local life photo path must start with /life-photos/")
            zip_image_path = image_path.lstrip("/")
            if zip_image_path not in names:
                errors.append(f"{word_id} local package image is missing: {zip_image_path}")

        stats = manifest.get("stats", {})
        if stats.get("withLifePhoto") != len(entries):
            errors.append("local package stats.withLifePhoto does not match entry count")
        if image_count != len(entries):
            errors.append("local package image count does not match entry count")

    return errors


def validate_life_photo_coverage(word_ids: set[str]) -> list[str]:
    errors: list[str] = []
    if not LIFE_PHOTO_COVERAGE_PATH.exists():
        return [f"life photo coverage is missing: {LIFE_PHOTO_COVERAGE_PATH}"]

    manifest = load_json(LIFE_PHOTO_COVERAGE_PATH)
    coverage_word_ids = manifest.get("wordIds", [])
    unique_word_ids = set(coverage_word_ids)
    if manifest.get("schemaVersion") != 1:
        errors.append("life photo coverage schemaVersion must be 1")
    if manifest.get("count") != len(coverage_word_ids):
        errors.append("life photo coverage count does not match wordIds")
    if len(unique_word_ids) != len(coverage_word_ids):
        errors.append("life photo coverage contains duplicate wordIds")
    unknown_word_ids = unique_word_ids - word_ids
    if unknown_word_ids:
        errors.append(f"life photo coverage has unknown wordIds: {sorted(unknown_word_ids)}")
    if LOCAL_PACKAGE_PATH.exists():
        with zipfile.ZipFile(LOCAL_PACKAGE_PATH) as archive:
            package_manifest = json.loads(archive.read("word_related_media.json"))
        package_word_ids = {
            entry.get("wordId") for entry in package_manifest.get("entries", []) if entry.get("wordId")
        }
        if unique_word_ids != package_word_ids:
            errors.append("life photo coverage wordIds do not match the local package")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate VocaRabbit related media assets.")
    parser.add_argument("--public-only", action="store_true")
    args = parser.parse_args()
    words = load_json(WORD_LIST_PATH)["words"]
    word_ids = {word["id"] for word in words}

    errors = validate_public_manifest(word_ids)
    errors.extend(validate_life_photo_coverage(word_ids))
    if not args.public_only:
        errors.extend(validate_local_life_photo_package(word_ids))
    result = {
        "totalWords": len(word_ids),
        "publicManifest": str(PUBLIC_MANIFEST_PATH),
        "localLifePhotoPackage": str(LOCAL_PACKAGE_PATH),
        "errors": errors,
        "valid": len(errors) == 0,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))

    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
