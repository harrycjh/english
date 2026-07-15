#!/usr/bin/env python3
"""Apply reliable +1 Oxford OCR page fixes to source and runtime word data."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENGLISH_ROOT = PROJECT_ROOT.parent
DEFAULT_AUDIT_PATH = PROJECT_ROOT / "design-output/oxford-ocr-audit/full/images.json"
DEFAULT_SOURCE_PATH = ENGLISH_ROOT / "KET_A2_child_friendly_themed_wordlist_zh.md"
DEFAULT_WORDS_PATH = PROJECT_ROOT / "public/content/words/ket_vocabulary.json"
DEFAULT_REPORT_PATH = PROJECT_ROOT / "design-output/oxford-ocr-audit/full/applied-fixes.tsv"
REF_PATTERN = re.compile(r"^Level\s+(?P<level>\d+),(?P<book>\d+),(?P<page>\d+)$")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def split_markdown_row(line: str) -> list[str]:
    text = line.strip()
    return [part.strip() for part in text[1:-1].split("|")]


def format_ref(level: int, book: int, page: int) -> str:
    return f"Level {level},{book},{page}"


def collect_fixes(audit_path: Path) -> dict[str, dict[str, Any]]:
    fixes: dict[str, dict[str, Any]] = {}
    for image in load_json(audit_path):
        if not image.get("alignmentReliable") or image.get("offsetIndexMinusCurrent") != 1:
            continue
        old_page = int(image["page"])
        if old_page <= 1:
            raise ValueError(f"Cannot shift page below 1: {image['imagePath']}")
        for word in image["wordMatches"]:
            word_id = word["wordId"]
            if word_id in fixes:
                raise ValueError(f"Duplicate fix for {word_id}")
            fixes[word_id] = {
                "wordId": word_id,
                "english": word["english"],
                "level": int(image["level"]),
                "book": int(image["book"]),
                "oldPage": old_page,
                "newPage": old_page - 1,
                "alignmentScore": image["alignmentScore"],
                "oldImagePath": image["imagePath"],
            }
    return fixes


def update_words(payload: dict[str, Any], fixes: dict[str, dict[str, Any]]) -> None:
    applied: set[str] = set()
    for word in payload["words"]:
        fix = fixes.get(word["id"])
        if not fix:
            continue
        refs = word.get("oxfordRefs") or []
        if not refs:
            raise ValueError(f"Missing first Oxford ref for {word['id']}")
        first = refs[0]
        actual = (int(first["level"]), int(first["book"]), int(first["page"]))
        expected = (fix["level"], fix["book"], fix["oldPage"])
        if actual != expected:
            raise ValueError(f"Unexpected runtime ref for {word['id']}: {actual} != {expected}")
        first["page"] = fix["newPage"]
        applied.add(word["id"])
    missing = set(fixes) - applied
    if missing:
        raise ValueError(f"Fixes missing from runtime word list: {sorted(missing)[:5]}")


def update_source(source_text: str, words: list[dict[str, Any]], fixes: dict[str, dict[str, Any]]) -> str:
    lines = source_text.splitlines(keepends=True)
    word_index = 0
    applied: set[str] = set()
    output: list[str] = []

    for raw_line in lines:
        stripped = raw_line.rstrip("\r\n")
        newline = raw_line[len(stripped) :]
        if not stripped.startswith("|") or "单词" in stripped or stripped.startswith("| ---"):
            output.append(raw_line)
            continue

        columns = split_markdown_row(stripped)
        if len(columns) != 5:
            raise ValueError(f"Unexpected source row: {stripped}")
        if word_index >= len(words):
            raise ValueError("Source has more word rows than runtime JSON")
        word = words[word_index]
        word_index += 1
        if columns[:3] != [word["english"], word["partOfSpeech"], word["chinese"]]:
            raise ValueError(f"Source/runtime order mismatch at {word['id']}")

        fix = fixes.get(word["id"])
        if not fix:
            output.append(raw_line)
            continue
        match = REF_PATTERN.fullmatch(columns[3])
        if not match:
            raise ValueError(f"Missing source first ref for {word['id']}: {columns[3]}")
        actual = (int(match.group("level")), int(match.group("book")), int(match.group("page")))
        expected = (fix["level"], fix["book"], fix["oldPage"])
        if actual != expected:
            raise ValueError(f"Unexpected source ref for {word['id']}: {actual} != {expected}")
        columns[3] = format_ref(fix["level"], fix["book"], fix["newPage"])
        output.append("| " + " | ".join(columns) + " |" + newline)
        applied.add(word["id"])

    if word_index != len(words):
        raise ValueError(f"Source has {word_index} rows but runtime JSON has {len(words)} words")
    missing = set(fixes) - applied
    if missing:
        raise ValueError(f"Fixes missing from source word list: {sorted(missing)[:5]}")
    return "".join(output)


def write_report(path: Path, fixes: dict[str, dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            delimiter="\t",
            fieldnames=[
                "wordId",
                "english",
                "level",
                "book",
                "oldPage",
                "newPage",
                "alignmentScore",
                "oldImagePath",
            ],
        )
        writer.writeheader()
        writer.writerows(sorted(fixes.values(), key=lambda item: (item["level"], item["book"], item["oldPage"], item["wordId"])))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT_PATH)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE_PATH)
    parser.add_argument("--words", type=Path, default=DEFAULT_WORDS_PATH)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    fixes = collect_fixes(args.audit)
    words_payload = load_json(args.words)
    source_text = args.source.read_text(encoding="utf-8")
    updated_source = update_source(source_text, words_payload["words"], fixes)
    update_words(words_payload, fixes)
    print(f"Validated {len(fixes)} reliable first-reference fixes")

    if args.apply:
        args.source.write_text(updated_source, encoding="utf-8")
        args.words.write_text(json.dumps(words_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        write_report(args.report, fixes)
        print(f"Applied fixes to {args.source} and {args.words}")
        print(f"Wrote {args.report}")
    else:
        print("Dry run only; pass --apply to write changes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
