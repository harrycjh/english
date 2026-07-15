#!/usr/bin/env python3
"""Audit all exported Red Rocket associations with independent OCR passes."""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

from audit_oxford_ocr import normalize, page_score


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = PROJECT_ROOT / "public"
DEFAULT_SOURCE_ROOT = PROJECT_ROOT.parent / "red-rocket"
DEFAULT_MANIFEST = PUBLIC_ROOT / "content/words/word_related_media.json"
DEFAULT_MATCH_REPORT = PROJECT_ROOT / "design-output/red-rocket-media/export-report.json"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "design-output/red-rocket-ocr-audit/full"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def contains_target(text: str, target: str) -> bool:
    normalized_text = f" {normalize(text)} "
    normalized_target = normalize(target)
    return bool(normalized_target and f" {normalized_target} " in normalized_text)


def run_tesseract(image_path: Path, psm: int) -> tuple[str, str | None]:
    try:
        result = subprocess.run(
            ["tesseract", str(image_path), "stdout", "-l", "eng", "--psm", str(psm)],
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


def load_cache(path: Path) -> dict[str, dict[str, Any]]:
    cache: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return cache
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("key"):
            cache[row["key"]] = row
    return cache


def append_cache(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def collect_pages(manifest: dict[str, Any], match_report: dict[str, Any]) -> list[dict[str, Any]]:
    report_by_word = {row["wordId"]: row for row in match_report["matches"]}
    pages: dict[str, dict[str, Any]] = {}
    association_count = 0

    for entry in manifest["entries"]:
        media = (entry.get("relatedMedia") or {}).get("redRocket")
        if not media:
            continue
        word_id = entry["wordId"]
        match = report_by_word.get(word_id)
        if not match:
            raise ValueError(f"Missing export match for {word_id}")
        expected = (match["level"], match["title"], int(match["page"]))
        actual = (media["level"], media["title"], int(media["page"]))
        if actual != expected:
            raise ValueError(f"Manifest/report mismatch for {word_id}: {actual} != {expected}")

        key = f"{media['atlasPath']}#{media['row']}#{media['column']}"
        page = pages.setdefault(
            key,
            {
                "key": key,
                "atlasPath": media["atlasPath"],
                "row": int(media["row"]),
                "column": int(media["column"]),
                "level": media["level"],
                "title": media["title"],
                "page": int(media["page"]),
                "associations": [],
            },
        )
        page["associations"].append(
            {
                "wordId": word_id,
                "english": match["english"],
                "matchKind": match["matchKind"],
                "matchedTerm": match["matchedTerm"],
                "matchedForm": match.get("matchedForm") or match["matchedTerm"],
                "confidence": match["confidence"],
                "candidateCount": match["candidateCount"],
            }
        )
        association_count += 1

    if association_count != manifest["stats"]["withRedRocket"]:
        raise ValueError("Red Rocket association count does not match manifest stats")
    return sorted(pages.values(), key=lambda row: (row["level"], row["title"], row["page"]))


def load_books(source_root: Path) -> dict[tuple[str, str], dict[str, Any]]:
    books: dict[tuple[str, str], dict[str, Any]] = {}
    for path in sorted((source_root / "extracted").glob("*/*.json")):
        payload = load_json(path)
        level = path.parent.name
        title = payload.get("title") or path.stem
        pdf_path = source_root / level / f"{path.stem}.pdf"
        books[(level, title)] = {
            "jsonPath": str(path),
            "pdfPath": str(pdf_path),
            "pages": payload.get("pages", []),
        }
    return books


def crop_atlas_cell(page: dict[str, Any], manifest: dict[str, Any], output_path: Path) -> None:
    size = int(manifest["redRocketAtlasGrid"]["cellSize"])
    atlas_path = PUBLIC_ROOT / page["atlasPath"].lstrip("/")
    with Image.open(atlas_path) as atlas:
        left = page["column"] * size
        top = page["row"] * size
        atlas.crop((left, top, left + size, top + size)).convert("RGB").save(output_path)


def render_pdf_page(pdf_path: Path, page: int, output_path: Path) -> str | None:
    prefix = output_path.with_suffix("")
    result = subprocess.run(
        [
            "pdftoppm",
            "-f",
            str(page),
            "-l",
            str(page),
            "-png",
            "-singlefile",
            "-r",
            "220",
            str(pdf_path),
            str(prefix),
        ],
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )
    if result.returncode != 0:
        return (result.stderr or f"exit {result.returncode}").strip()
    return None


def align_page(ocr_text: str, page: dict[str, Any], book: dict[str, Any] | None) -> dict[str, Any]:
    if not book:
        return {
            "bestExtractedPage": None,
            "offsetBestMinusCurrent": None,
            "alignmentScore": 0.0,
            "currentPageScore": 0.0,
            "alignmentMarginOverCurrent": 0.0,
            "alignmentReliable": False,
        }

    candidates = []
    for indexed_page in book["pages"]:
        text = str(indexed_page.get("text", ""))
        if text.strip():
            candidates.append((page_score(ocr_text, text), int(indexed_page["page_number"])))
    candidates.sort(reverse=True)
    best = candidates[0] if candidates else (0.0, None)
    current_score = next((score for score, number in candidates if number == page["page"]), 0.0)
    margin = best[0] - current_score
    reliable = best[0] >= 0.62 and (margin >= 0.08 or best[0] >= 0.88)
    return {
        "bestExtractedPage": best[1],
        "offsetBestMinusCurrent": best[1] - page["page"] if reliable and best[1] is not None else None,
        "alignmentScore": round(best[0], 4),
        "currentPageScore": round(current_score, 4),
        "alignmentMarginOverCurrent": round(margin, 4),
        "alignmentReliable": reliable,
    }


def audit_atlas_pages(
    pages: list[dict[str, Any]],
    manifest: dict[str, Any],
    books: dict[tuple[str, str], dict[str, Any]],
    cache_path: Path,
) -> list[dict[str, Any]]:
    cache = load_cache(cache_path)
    pending = [page for page in pages if page["key"] not in cache]
    print(f"Atlas OCR: {len(pages)} pages, {len(pages) - len(pending)} cached, {len(pending)} pending")

    with tempfile.TemporaryDirectory(prefix="red-rocket-atlas-ocr-") as temp_dir:
        temp_path = Path(temp_dir) / "cell.png"
        for index, page in enumerate(pending, start=1):
            crop_atlas_cell(page, manifest, temp_path)
            psm6, error6 = run_tesseract(temp_path, 6)
            psm11, error11 = run_tesseract(temp_path, 11)
            row = {
                "key": page["key"],
                "psm6Text": normalize(psm6),
                "psm11Text": normalize(psm11),
                "errors": [error for error in (error6, error11) if error],
            }
            cache[page["key"]] = row
            append_cache(cache_path, row)
            if index % 50 == 0 or index == len(pending):
                print(f"Atlas OCR progress {index}/{len(pending)}", flush=True)

    results = []
    for page in pages:
        ocr = cache[page["key"]]
        results.append(
            {
                **page,
                **ocr,
                **align_page(ocr["psm6Text"], page, books.get((page["level"], page["title"]))),
            }
        )
    return results


def audit_pdf_misses(
    page_results: list[dict[str, Any]],
    books: dict[tuple[str, str], dict[str, Any]],
    cache_path: Path,
) -> dict[str, dict[str, Any]]:
    missing_pages = []
    for page in page_results:
        non_title = [row for row in page["associations"] if row["matchKind"] != "title"]
        if any(
            not contains_target(page["psm6Text"], row["matchedForm"])
            and not contains_target(page["psm11Text"], row["matchedForm"])
            for row in non_title
        ):
            missing_pages.append(page)

    cache = load_cache(cache_path)
    pending = [page for page in missing_pages if page["key"] not in cache]
    print(f"PDF verification: {len(missing_pages)} pages, {len(missing_pages) - len(pending)} cached, {len(pending)} pending")

    with tempfile.TemporaryDirectory(prefix="red-rocket-pdf-ocr-") as temp_dir:
        temp_path = Path(temp_dir) / "page.png"
        for index, page in enumerate(pending, start=1):
            book = books.get((page["level"], page["title"]))
            render_error = None
            psm6 = psm11 = ""
            errors: list[str] = []
            if not book:
                render_error = "missing extracted book"
            else:
                pdf_path = Path(book["pdfPath"])
                if not pdf_path.exists():
                    render_error = f"missing PDF: {pdf_path}"
                else:
                    render_error = render_pdf_page(pdf_path, page["page"], temp_path)
            if render_error:
                errors.append(render_error)
            else:
                psm6, error6 = run_tesseract(temp_path, 6)
                psm11, error11 = run_tesseract(temp_path, 11)
                errors.extend(error for error in (error6, error11) if error)
            row = {
                "key": page["key"],
                "pdfPsm6Text": normalize(psm6),
                "pdfPsm11Text": normalize(psm11),
                "errors": errors,
            }
            cache[page["key"]] = row
            append_cache(cache_path, row)
            if index % 25 == 0 or index == len(pending):
                print(f"PDF verification progress {index}/{len(pending)}", flush=True)
    return cache


def classify_associations(
    page_results: list[dict[str, Any]], pdf_cache: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    rows = []
    for page in page_results:
        pdf = pdf_cache.get(page["key"], {})
        for association in page["associations"]:
            target = association["matchedForm"]
            atlas6 = contains_target(page["psm6Text"], target)
            atlas11 = contains_target(page["psm11Text"], target)
            pdf6 = contains_target(pdf.get("pdfPsm6Text", ""), target)
            pdf11 = contains_target(pdf.get("pdfPsm11Text", ""), target)
            if association["matchKind"] == "title":
                classification = "title_only"
            elif atlas6 or atlas11:
                classification = "confirmed_atlas"
            elif pdf11:
                classification = "confirmed_pdf_sparse"
            elif pdf6:
                classification = "unstable_ocr"
            else:
                classification = "likely_false_positive"
            rows.append(
                {
                    **association,
                    "level": page["level"],
                    "title": page["title"],
                    "page": page["page"],
                    "atlasPath": page["atlasPath"],
                    "row": page["row"],
                    "column": page["column"],
                    "atlasPsm6Visible": atlas6,
                    "atlasPsm11Visible": atlas11,
                    "pdfPsm6Visible": pdf6,
                    "pdfPsm11Visible": pdf11,
                    "classification": classification,
                    "bestExtractedPage": page["bestExtractedPage"],
                    "offsetBestMinusCurrent": page["offsetBestMinusCurrent"],
                    "alignmentScore": page["alignmentScore"],
                    "alignmentReliable": page["alignmentReliable"],
                }
            )
    return rows


def summarize(page_results: list[dict[str, Any]], associations: list[dict[str, Any]]) -> dict[str, Any]:
    reliable = [row for row in page_results if row["alignmentReliable"]]
    classifications = Counter(row["classification"] for row in associations)
    by_level = {}
    for level in sorted({row["level"] for row in associations}):
        rows = [row for row in associations if row["level"] == level]
        level_pages = [row for row in page_results if row["level"] == level]
        level_reliable = [row for row in level_pages if row["alignmentReliable"]]
        by_level[level] = {
            "associations": len(rows),
            "pages": len(level_pages),
            "classifications": dict(sorted(Counter(row["classification"] for row in rows).items())),
            "offsetCounts": {
                str(key): value
                for key, value in sorted(Counter(row["offsetBestMinusCurrent"] for row in level_reliable).items())
            },
        }

    systematic_books = []
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in reliable:
        grouped[(row["level"], row["title"])].append(row)
    for (level, title), rows in sorted(grouped.items()):
        counts = Counter(row["offsetBestMinusCurrent"] for row in rows)
        offset, count = counts.most_common(1)[0]
        dominance = count / len(rows)
        if offset != 0 and len(rows) >= 3 and dominance >= 0.7:
            systematic_books.append(
                {
                    "level": level,
                    "title": title,
                    "reliablePages": len(rows),
                    "dominantOffset": offset,
                    "dominance": round(dominance, 4),
                    "offsetCounts": {str(key): value for key, value in sorted(counts.items())},
                }
            )

    return {
        "totalAssociations": len(associations),
        "uniquePages": len(page_results),
        "classifications": dict(sorted(classifications.items())),
        "reliablePageAlignments": len(reliable),
        "offsetCounts": {
            str(key): value
            for key, value in sorted(Counter(row["offsetBestMinusCurrent"] for row in reliable).items())
        },
        "systematicNonzeroBooks": systematic_books,
        "byLevel": by_level,
    }


def write_reports(
    output_dir: Path,
    summary: dict[str, Any],
    page_results: list[dict[str, Any]],
    associations: list[dict[str, Any]],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (output_dir / "pages.json").write_text(json.dumps(page_results, indent=2), encoding="utf-8")
    (output_dir / "associations.json").write_text(json.dumps(associations, indent=2), encoding="utf-8")
    with (output_dir / "associations.tsv").open("w", encoding="utf-8", newline="") as handle:
        fields = [
            "wordId",
            "english",
            "level",
            "title",
            "page",
            "matchKind",
            "matchedTerm",
            "matchedForm",
            "classification",
            "atlasPsm6Visible",
            "atlasPsm11Visible",
            "pdfPsm6Visible",
            "pdfPsm11Visible",
            "bestExtractedPage",
            "offsetBestMinusCurrent",
            "alignmentScore",
            "alignmentReliable",
            "atlasPath",
            "row",
            "column",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter="\t", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(associations)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--match-report", type=Path, default=DEFAULT_MATCH_REPORT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--reset-cache", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not shutil.which("tesseract") or not shutil.which("pdftoppm"):
        raise SystemExit("tesseract and pdftoppm are required")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    atlas_cache = args.output_dir / "atlas-ocr-cache.jsonl"
    pdf_cache = args.output_dir / "pdf-ocr-cache.jsonl"
    if args.reset_cache:
        atlas_cache.unlink(missing_ok=True)
        pdf_cache.unlink(missing_ok=True)

    manifest = load_json(args.manifest)
    match_report = load_json(args.match_report)
    pages = collect_pages(manifest, match_report)
    books = load_books(args.source_root)
    page_results = audit_atlas_pages(pages, manifest, books, atlas_cache)
    pdf_results = audit_pdf_misses(page_results, books, pdf_cache)
    associations = classify_associations(page_results, pdf_results)
    summary = summarize(page_results, associations)
    write_reports(args.output_dir, summary, page_results, associations)
    print(json.dumps(summary, indent=2))
    print(f"Reports written to {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
