from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT_DIR / "KET_A2_child_friendly_themed_wordlist_zh.md"
DEFAULT_OUTPUT = ROOT_DIR / "vocab_rabbit" / "public" / "content" / "words" / "ket_vocabulary.json"
REF_PATTERN = re.compile(r"^Level\s+(?P<level>\d+),(?P<book>\d+),(?P<page>\d+)$")


@dataclass(frozen=True)
class OxfordRef:
    level: int
    book: int
    page: int

    def as_dict(self) -> dict[str, int]:
        return {
            "level": self.level,
            "book": self.book,
            "page": self.page,
        }


def split_markdown_row(line: str) -> list[str]:
    text = line.strip()
    if not text.startswith("|") or not text.endswith("|"):
        raise ValueError(f"Unsupported markdown row: {line}")
    return [part.strip() for part in text[1:-1].split("|")]


def parse_oxford_ref(cell: str) -> OxfordRef | None:
    text = cell.strip()
    if not text:
        return None
    match = REF_PATTERN.fullmatch(text)
    if not match:
        raise ValueError(f"Unsupported Oxford Tree reference: {cell}")
    return OxfordRef(
        level=int(match.group("level")),
        book=int(match.group("book")),
        page=int(match.group("page")),
    )


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower())
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug or "word"


def infer_difficulty(oxford_refs: list[OxfordRef]) -> int:
    if not oxford_refs:
        return 3
    earliest_level = min(reference.level for reference in oxford_refs)
    if earliest_level <= 3:
        return 1
    if earliest_level <= 6:
        return 2
    if earliest_level <= 9:
        return 3
    if earliest_level <= 12:
        return 4
    return 5


def parse_markdown(input_path: Path) -> tuple[list[str], list[dict[str, object]]]:
    categories: list[str] = []
    words: list[dict[str, object]] = []
    id_counts: Counter[str] = Counter()
    current_category: str | None = None

    with input_path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n")
            if line.startswith("## "):
                current_category = line[3:].strip()
                categories.append(current_category)
                continue

            if not current_category or not line.startswith("|"):
                continue

            if "单词" in line or line.startswith("| ---"):
                continue

            columns = split_markdown_row(line)
            if len(columns) != 5:
                raise ValueError(f"Expected 5 columns, got {len(columns)}: {line}")

            english, part_of_speech, chinese, first_occurrence, second_occurrence = columns
            oxford_refs = [
                reference
                for reference in (
                    parse_oxford_ref(first_occurrence),
                    parse_oxford_ref(second_occurrence),
                )
                if reference is not None
            ]

            base_id = f"ket_{slugify(english)}_{slugify(part_of_speech)}"
            id_counts[base_id] += 1
            word_id = base_id if id_counts[base_id] == 1 else f"{base_id}_{id_counts[base_id]}"

            words.append(
                {
                    "id": word_id,
                    "english": english,
                    "partOfSpeech": part_of_speech,
                    "chinese": chinese,
                    "category": current_category,
                    "difficulty": infer_difficulty(oxford_refs),
                    "imagePath": f"/content/images/words/{word_id}.webp",
                    "imageApproved": False,
                    "oxfordRefs": [reference.as_dict() for reference in oxford_refs],
                }
            )

    return categories, words


def build_payload(input_path: Path) -> dict[str, object]:
    categories, words = parse_markdown(input_path)
    return {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "sourceFile": input_path.name,
        "categoryCount": len(categories),
        "wordCount": len(words),
        "categories": categories,
        "words": words,
    }


def write_json(output_path: Path, payload: dict[str, object]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the VocaRabbit JSON word list.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_payload(args.input)
    write_json(args.output, payload)
    print(
        f"Wrote {payload['wordCount']} words across {payload['categoryCount']} categories to {args.output}"
    )


if __name__ == "__main__":
    main()