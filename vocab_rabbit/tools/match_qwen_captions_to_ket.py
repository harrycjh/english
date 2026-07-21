#!/usr/bin/env python3
"""Match factual Qwen photo captions to KET vocabulary with lexical evidence."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import statistics
from collections import defaultdict
from pathlib import Path


DEFAULT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CAPTIONS = Path(
    "design-output/photo-word-linking/captions/qwen-captions-3000.success.jsonl"
)
DEFAULT_OUTPUT = Path(
    "design-output/photo-word-linking/captions/qwen-captions-3000-ket-matches.json"
)
WORD_RE = re.compile(r"[a-z]+(?:'[a-z]+)?")
GENERIC_WORDS = {"be", "have", "do", "thing", "something", "anything", "nothing"}
SENSE_LABELS = {
    "not artificial",
    "entertainment",
    "social media",
    "transitive and intransitive",
    "planning",
    "process",
    "drawing",
    "stylish",
    "clever",
    "become happy",
    "digitally",
}
IRREGULAR_FORMS = {
    "children": "child",
    "people": "person",
    "men": "man",
    "women": "woman",
    "feet": "foot",
    "teeth": "tooth",
    "mice": "mouse",
    "geese": "goose",
    "ran": "run",
    "swam": "swim",
    "sat": "sit",
    "stood": "stand",
    "held": "hold",
    "wore": "wear",
    "drank": "drink",
    "ate": "eat",
    "made": "make",
    "took": "take",
    "went": "go",
    "came": "come",
    "saw": "see",
    "seen": "see",
    "bought": "buy",
    "brought": "bring",
    "thought": "think",
    "caught": "catch",
    "taught": "teach",
    "rode": "ride",
    "ridden": "ride",
    "drove": "drive",
    "driven": "drive",
    "flew": "fly",
    "flown": "fly",
    "lay": "lie",
    "lain": "lie",
    "lying": "lie",
    "gave": "give",
    "given": "give",
    "wrote": "write",
    "written": "write",
    "slept": "sleep",
    "spoke": "speak",
    "spoken": "speak",
    "sang": "sing",
    "sung": "sing",
    "built": "build",
    "left": "leave",
    "met": "meet",
    "paid": "pay",
    "said": "say",
    "sold": "sell",
    "sent": "send",
    "won": "win",
    "lost": "lose",
    "got": "get",
    "gotten": "get",
}


def normalize(text: str) -> str:
    return " ".join(WORD_RE.findall(text.lower().replace("café", "cafe")))


def aliases(english: str) -> set[str]:
    text = english.lower().replace("café", "cafe")
    text = re.sub(r"\((n|v|adj|adv)\)", "", text)
    optional_forms = {text}
    optional_letter = re.search(r"([a-z]+)\(([a-z])\)([a-z]+)", text)
    if optional_letter:
        prefix = text[: optional_letter.start()]
        suffix = text[optional_letter.end() :]
        before, letter, after = optional_letter.groups()
        optional_forms = {
            prefix + before + after + suffix,
            prefix + before + letter + after + suffix,
        }

    result = set()
    for value in optional_forms:
        for part in re.split(r"\s*/\s*", value):
            parenthetical = re.search(r"\(([a-z ]+)\)", part)
            if not parenthetical:
                result.add(normalize(re.sub(r"\([^)]*\)", "", part)))
                continue
            before = part[: parenthetical.start()].strip()
            inside = parenthetical.group(1).strip()
            result.add(normalize(before))
            if inside not in SENSE_LABELS:
                result.add(normalize(before + " " + inside))
    return {item for item in result if item}


def pos_types(part_of_speech: str) -> set[str]:
    pieces = part_of_speech.lower().replace("&", ",").replace(" ", "").split(",")
    result = set()
    if any(piece in {"n", "uncn", "npl", "ameng", "breng"} for piece in pieces):
        result.add("n")
    if any(piece in {"v", "phrv", "av"} for piece in pieces):
        result.add("v")
    if "adj" in pieces:
        result.add("adj")
    if "adv" in pieces:
        result.add("adv")
    return result


def inflections(alias: str, word_type: str) -> set[str]:
    tokens = alias.split()
    if not tokens:
        return set()
    word = tokens[-1]
    forms = {word}
    if word_type == "n":
        forms.add(word + "s")
        if word.endswith("y") and len(word) > 2 and word[-2] not in "aeiou":
            forms.add(word[:-1] + "ies")
        if word.endswith(("s", "x", "z", "ch", "sh")):
            forms.add(word + "es")
        for inflected, base in IRREGULAR_FORMS.items():
            if base == word and inflected in {
                "children",
                "people",
                "men",
                "women",
                "feet",
                "teeth",
                "mice",
                "geese",
            }:
                forms.add(inflected)
    elif word_type == "v":
        forms.update({word + "s", word + "ed", word + "ing"})
        if word.endswith("e"):
            forms.update({word + "d", word[:-1] + "ing"})
        if word.endswith("y") and len(word) > 2 and word[-2] not in "aeiou":
            forms.update({word[:-1] + "ies", word[:-1] + "ied"})
        if word.endswith(("s", "x", "z", "ch", "sh")):
            forms.add(word + "es")
        if (
            len(word) >= 3
            and word[-1] not in "aeiouwxy"
            and word[-2] in "aeiou"
            and word[-3] not in "aeiou"
        ):
            forms.update({word + word[-1] + "ed", word + word[-1] + "ing"})
        forms.update(inflected for inflected, base in IRREGULAR_FORMS.items() if base == word)
    return {" ".join(tokens[:-1] + [form]) for form in forms}


def ngrams(text: str, max_size: int = 6) -> set[str]:
    tokens = text.split()
    return {
        " ".join(tokens[index : index + size])
        for size in range(1, min(max_size, len(tokens)) + 1)
        for index in range(len(tokens) - size + 1)
    }


def build_indexes(captions: list[dict]) -> dict[str, dict[str, set[str]]]:
    indexes: dict[str, dict[str, set[str]]] = {
        key: defaultdict(set) for key in ("n", "v", "adj", "adv", "caption")
    }
    for row in captions:
        photo_id = row["photoId"]
        caption = row["caption"]
        for field in ("people", "objects", "scene"):
            for term in caption.get(field, []):
                for phrase in ngrams(normalize(term)):
                    indexes["n"][phrase].add(photo_id)
        for term in caption.get("actions", []):
            for phrase in ngrams(normalize(term)):
                indexes["v"][phrase].add(photo_id)
        for term in caption.get("attributes", []):
            for phrase in ngrams(normalize(term)):
                indexes["adj"][phrase].add(photo_id)
                indexes["adv"][phrase].add(photo_id)
        for phrase in ngrams(normalize(caption.get("captionEn", ""))):
            indexes["caption"][phrase].add(photo_id)
    return indexes


def match_words(words: list[dict], captions: list[dict]) -> list[dict]:
    indexes = build_indexes(captions)
    matches = []
    for word in words:
        word_aliases = aliases(word["english"])
        types = pos_types(word["partOfSpeech"])
        if not types or word_aliases & GENERIC_WORDS:
            continue

        structured_ids = set()
        for word_type in types:
            for alias in word_aliases:
                for form in inflections(alias, word_type):
                    structured_ids.update(indexes[word_type].get(form, set()))

        caption_ids = set()
        if types & {"n", "v", "adj"}:
            for alias in word_aliases:
                caption_ids.update(indexes["caption"].get(alias, set()))
        caption_only_ids = caption_ids - structured_ids
        if structured_ids or caption_only_ids:
            matches.append(
                {
                    "wordId": word["id"],
                    "english": word["english"],
                    "partOfSpeech": word["partOfSpeech"],
                    "category": word["category"],
                    "structuredPhotoIds": sorted(structured_ids),
                    "captionExactPhotoIds": sorted(caption_only_ids),
                }
            )
    return matches


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--captions", default=str(DEFAULT_CAPTIONS))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    root = Path(args.root).resolve()
    captions_path = Path(args.captions)
    output_path = Path(args.output)
    if not captions_path.is_absolute():
        captions_path = root / captions_path
    if not output_path.is_absolute():
        output_path = root / output_path

    words = json.loads((root / "public/content/words/ket_vocabulary.json").read_text())["words"]
    captions = [json.loads(line) for line in captions_path.read_text().splitlines() if line.strip()]
    matches = match_words(words, captions)
    matched_ids = {match["wordId"] for match in matches}
    structured_ids = {match["wordId"] for match in matches if match["structuredPhotoIds"]}
    existing_ids = set(
        json.loads((root / "public/content/words/life_photo_coverage.json").read_text())["wordIds"]
    )

    per_photo: dict[str, set[str]] = defaultdict(set)
    for match in matches:
        for photo_id in match["structuredPhotoIds"] + match["captionExactPhotoIds"]:
            per_photo[photo_id].add(match["wordId"])
    counts = [len(per_photo.get(caption["photoId"], set())) for caption in captions]
    payload = {
        "meta": {
            "version": 1,
            "generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
            "sourceCaptions": str(captions_path),
            "method": "field-aware lexical matching with conservative inflections",
            "semanticMatchingIncluded": False,
        },
        "stats": {
            "captionPhotos": len(captions),
            "vocabularyWords": len(words),
            "structuredMatchedWords": len(structured_ids),
            "highConfidenceMatchedWords": len(matched_ids),
            "highConfidenceCoveragePercent": round(100 * len(matched_ids) / len(words), 1),
            "existingLifePhotoWords": len(existing_ids),
            "overlapWithExisting": len(matched_ids & existing_ids),
            "newBeyondExisting": len(matched_ids - existing_ids),
            "combinedWithExisting": len(matched_ids | existing_ids),
            "combinedCoveragePercent": round(100 * len(matched_ids | existing_ids) / len(words), 1),
            "matchesPerPhoto": {
                "min": min(counts),
                "max": max(counts),
                "mean": round(statistics.mean(counts), 2),
                "median": statistics.median(counts),
                "photosWithNoMatches": sum(count == 0 for count in counts),
            },
        },
        "matchedWords": sorted(matches, key=lambda match: match["wordId"]),
        "unmatchedWordIds": sorted(word["id"] for word in words if word["id"] not in matched_ids),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["stats"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
