#!/usr/bin/env python3
"""Audit exported Oxford Tree word images with local Tesseract OCR."""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import time
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = PROJECT_ROOT / "public"
WORDS_PATH = PUBLIC_ROOT / "content/words/ket_vocabulary.json"
MEDIA_PATH = PUBLIC_ROOT / "content/words/word_related_media.json"
DEFAULT_EXTRACTED_ROOT = PROJECT_ROOT.parent / "oxford-tree/extracted"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "design-output/oxford-ocr-audit/full"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value)).lower().replace("’", "'")
    return " ".join(re.findall(r"[a-z0-9]+(?:'[a-z]+)?", value))


def term_variants(term: str) -> list[str]:
    variants: set[str] = set()
    for part in re.split(r"\s*/\s*", term):
        part = part.strip()
        if not part:
            continue
        variants.add(normalize(part))
        variants.add(normalize(re.sub(r"\([^)]*\)", "", part)))
        variants.add(normalize(re.sub(r"\(([^)]*)\)", r"\1", part)))
    return sorted(variant for variant in variants if variant)


def contains_term(text: str, term: str) -> bool:
    padded_text = f" {normalize(text)} "
    return any(f" {variant} " in padded_text for variant in term_variants(term))


def page_score(ocr_text: str, indexed_text: str) -> float:
    ocr_tokens = normalize(ocr_text).split()
    indexed_tokens = normalize(indexed_text).split()
    if not ocr_tokens or not indexed_tokens:
        return 0.0

    overlap = sum((Counter(ocr_tokens) & Counter(indexed_tokens)).values())
    coverage = overlap / len(indexed_tokens)
    precision = overlap / min(len(ocr_tokens), len(indexed_tokens))
    sequence = SequenceMatcher(None, normalize(indexed_text), normalize(ocr_text)).ratio()
    return 0.68 * coverage + 0.17 * precision + 0.15 * sequence


def parse_book_number(value: str) -> int | None:
    match = re.match(r"\s*(?:DD)?\s*\d+\s*[-–]\s*0*(\d+)", value, re.IGNORECASE)
    return int(match.group(1)) if match else None


def load_indexed_books(extracted_root: Path) -> dict[tuple[int, int], list[dict[str, Any]]]:
    records: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for path in sorted(extracted_root.glob("Level */*.json")):
        level_match = re.search(r"(\d+)", path.parent.name)
        if not level_match:
            continue
        level = int(level_match.group(1))
        try:
            payload = load_json(path)
        except (OSError, json.JSONDecodeError):
            continue

        for record in payload if isinstance(payload, list) else [payload]:
            if not isinstance(record, dict):
                continue
            book = parse_book_number(str(record.get("book", path.stem)))
            if book is None:
                book = parse_book_number(path.stem)
            if book is None:
                continue
            pages = [
                page
                for page in record.get("pages", [])
                if isinstance(page, dict)
                and isinstance(page.get("page_number"), int)
                and str(page.get("text", "")).strip()
            ]
            if pages:
                records[(level, book)].append({"source": str(path), "pages": pages})
    return records


def collect_images() -> tuple[list[dict[str, Any]], int]:
    words = {word["id"]: word for word in load_json(WORDS_PATH)["words"]}
    entries = load_json(MEDIA_PATH)["entries"]
    images: dict[str, dict[str, Any]] = {}
    association_count = 0

    for entry in entries:
        oxford = (entry.get("relatedMedia") or {}).get("oxford")
        word = words.get(entry.get("wordId"))
        if not oxford or not word:
            continue
        association_count += 1
        image_path = oxford["imagePath"]
        image = images.setdefault(
            image_path,
            {
                "imagePath": image_path,
                "level": int(oxford["level"]),
                "book": int(oxford["book"]),
                "page": int(oxford["page"]),
                "words": [],
            },
        )
        image["words"].append({"wordId": word["id"], "english": word["english"]})

    return sorted(images.values(), key=lambda item: (item["level"], item["book"], item["page"])), association_count


def load_cache(path: Path) -> dict[str, dict[str, Any]]:
    cache: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return cache
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if item.get("imagePath"):
            cache[item["imagePath"]] = item
    return cache


def run_ocr(tesseract: str, image_path: Path) -> tuple[str, str | None]:
    try:
        result = subprocess.run(
            [tesseract, str(image_path), "stdout", "-l", "eng", "--psm", "6"],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return "", "timeout"
    if result.returncode != 0:
        return result.stdout or "", (result.stderr or f"exit {result.returncode}").strip()
    return result.stdout or "", None


def audit_image(image: dict[str, Any], ocr_text: str, indexed_books: dict[tuple[int, int], list[dict[str, Any]]]) -> dict[str, Any]:
    candidates: list[tuple[float, int, str, str]] = []
    for record in indexed_books.get((image["level"], image["book"]), []):
        for page in record["pages"]:
            candidates.append(
                (
                    page_score(ocr_text, str(page.get("text", ""))),
                    int(page["page_number"]),
                    str(page.get("text", "")),
                    record["source"],
                )
            )
    candidates.sort(key=lambda item: item[0], reverse=True)
    best = candidates[0] if candidates else (0.0, None, "", "")
    second = candidates[1] if len(candidates) > 1 else (0.0, None, "", "")
    margin = best[0] - second[0]
    reliable = best[0] >= 0.62 and (margin >= 0.08 or best[0] >= 0.88)
    offset = int(best[1]) - image["page"] if reliable and best[1] is not None else None

    word_matches = [
        {
            **word,
            "exactOcrMatch": contains_term(ocr_text, word["english"]),
            "indexedMatch": contains_term(best[2], word["english"]) if best[2] else False,
        }
        for word in image["words"]
    ]
    return {
        **image,
        "ocrText": normalize(ocr_text),
        "ocrEmpty": not bool(normalize(ocr_text)),
        "wordMatches": word_matches,
        "bestIndexedPage": best[1],
        "offsetIndexMinusCurrent": offset,
        "alignmentScore": round(best[0], 4),
        "alignmentMargin": round(margin, 4),
        "alignmentReliable": reliable,
        "bestIndexedText": normalize(best[2]),
        "indexedSource": best[3] or None,
    }


def summarize(results: list[dict[str, Any]], association_count: int) -> dict[str, Any]:
    associations = [match for result in results for match in result["wordMatches"]]
    reliable = [result for result in results if result["alignmentReliable"]]
    offsets = Counter(result["offsetIndexMinusCurrent"] for result in reliable)

    by_level: dict[str, Any] = {}
    for level in range(1, 17):
        level_results = [result for result in results if result["level"] == level]
        level_reliable = [result for result in level_results if result["alignmentReliable"]]
        level_offsets = Counter(result["offsetIndexMinusCurrent"] for result in level_reliable)
        level_matches = [match for result in level_results for match in result["wordMatches"]]
        by_level[str(level)] = {
            "images": len(level_results),
            "associations": len(level_matches),
            "exactOcrMatches": sum(match["exactOcrMatch"] for match in level_matches),
            "reliableAlignments": len(level_reliable),
            "offsetCounts": {str(key): value for key, value in sorted(level_offsets.items())},
        }

    book_rows: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for result in reliable:
        book_rows[(result["level"], result["book"])].append(result)
    systematic_books = []
    for (level, book), rows in sorted(book_rows.items()):
        counts = Counter(row["offsetIndexMinusCurrent"] for row in rows)
        offset, count = counts.most_common(1)[0]
        dominance = count / len(rows)
        if offset != 0 and len(rows) >= 2 and dominance >= 0.7:
            systematic_books.append(
                {
                    "level": level,
                    "book": book,
                    "reliableImages": len(rows),
                    "dominantOffset": offset,
                    "dominance": round(dominance, 4),
                    "offsetCounts": {str(key): value for key, value in sorted(counts.items())},
                }
            )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalOxfordAssociations": association_count,
        "uniqueOxfordImages": len(results),
        "emptyOcrImages": sum(result["ocrEmpty"] for result in results),
        "exactOcrAssociations": sum(match["exactOcrMatch"] for match in associations),
        "exactOcrRate": round(sum(match["exactOcrMatch"] for match in associations) / len(associations), 4) if associations else 0,
        "reliableAlignments": len(reliable),
        "unreliableAlignments": len(results) - len(reliable),
        "offsetCounts": {str(key): value for key, value in sorted(offsets.items())},
        "byLevel": by_level,
        "systematicNonzeroBooks": systematic_books,
    }


def write_reports(output_dir: Path, summary: dict[str, Any], results: list[dict[str, Any]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (output_dir / "images.json").write_text(json.dumps(results, indent=2), encoding="utf-8")

    with (output_dir / "associations.tsv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t")
        writer.writerow(
            [
                "wordId",
                "english",
                "level",
                "book",
                "currentPage",
                "exactOcrMatch",
                "indexedMatch",
                "bestIndexedPage",
                "offsetIndexMinusCurrent",
                "alignmentScore",
                "alignmentReliable",
                "imagePath",
            ]
        )
        for result in results:
            for match in result["wordMatches"]:
                writer.writerow(
                    [
                        match["wordId"],
                        match["english"],
                        result["level"],
                        result["book"],
                        result["page"],
                        match["exactOcrMatch"],
                        match["indexedMatch"],
                        result["bestIndexedPage"],
                        result["offsetIndexMinusCurrent"],
                        result["alignmentScore"],
                        result["alignmentReliable"],
                        result["imagePath"],
                    ]
                )

    lines = [
        "# Oxford OCR audit",
        "",
        f"- Oxford associations: {summary['totalOxfordAssociations']}",
        f"- Unique images: {summary['uniqueOxfordImages']}",
        f"- Exact OCR association matches: {summary['exactOcrAssociations']} ({summary['exactOcrRate']:.1%})",
        f"- Reliable page alignments: {summary['reliableAlignments']}",
        f"- Unreliable page alignments: {summary['unreliableAlignments']}",
        f"- Offset counts: {summary['offsetCounts']}",
        "",
        "## By level",
        "",
        "| Level | Images | Associations | Exact OCR | Reliable | Offsets |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for level, item in summary["byLevel"].items():
        lines.append(
            f"| {level} | {item['images']} | {item['associations']} | {item['exactOcrMatches']} | "
            f"{item['reliableAlignments']} | `{item['offsetCounts']}` |"
        )
    lines.extend(["", "## Systematic non-zero books", ""])
    for book in summary["systematicNonzeroBooks"]:
        lines.append(
            f"- Level {book['level']}, Book {book['book']}: offset {book['dominantOffset']}, "
            f"{book['reliableImages']} reliable images, dominance {book['dominance']:.1%}"
        )
    (output_dir / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extracted-root", type=Path, default=DEFAULT_EXTRACTED_ROOT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--reset-cache", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    tesseract = shutil.which("tesseract")
    if not tesseract:
        raise SystemExit("tesseract was not found")
    if not args.extracted_root.exists():
        raise SystemExit(f"Oxford extracted index was not found: {args.extracted_root}")

    images, association_count = collect_images()
    if args.limit is not None:
        images = images[: args.limit]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cache_path = args.output_dir / "ocr-cache.jsonl"
    if args.reset_cache and cache_path.exists():
        cache_path.unlink()
    cache = load_cache(cache_path)
    indexed_books = load_indexed_books(args.extracted_root)

    started = time.monotonic()
    pending = [image for image in images if image["imagePath"] not in cache]
    print(
        f"Oxford OCR: {len(images)} unique images, {len(cache)} cached, {len(pending)} pending, single-thread",
        flush=True,
    )
    with cache_path.open("a", encoding="utf-8") as handle:
        for index, image in enumerate(pending, 1):
            local_path = PUBLIC_ROOT / image["imagePath"].lstrip("/")
            ocr_text, error = run_ocr(tesseract, local_path)
            item = {"imagePath": image["imagePath"], "ocrText": ocr_text, "error": error}
            cache[image["imagePath"]] = item
            handle.write(json.dumps(item) + "\n")
            handle.flush()
            if index % 50 == 0 or index == len(pending):
                elapsed = time.monotonic() - started
                rate = index / elapsed if elapsed else 0
                remaining = (len(pending) - index) / rate if rate else 0
                print(
                    f"OCR progress {index}/{len(pending)} ({index / len(pending):.1%}), "
                    f"elapsed {elapsed:.1f}s, ETA {remaining:.1f}s",
                    flush=True,
                )

    results = [audit_image(image, cache[image["imagePath"]]["ocrText"], indexed_books) for image in images]
    summary = summarize(results, association_count)
    write_reports(args.output_dir, summary, results)
    print(json.dumps(summary, indent=2), flush=True)
    print(f"Reports written to {args.output_dir}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
