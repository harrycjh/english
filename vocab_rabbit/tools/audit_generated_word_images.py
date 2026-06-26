#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

try:
    import pytesseract
except Exception:  # pragma: no cover - optional local tool
    pytesseract = None


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RUN_DIR = PROJECT_ROOT / "design-output/word-image-generation/comfy-sample-20260626-100955"


def load_manifest(run_dir: Path) -> list[dict[str, Any]]:
    manifest_path = run_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return manifest["records"]


def make_sheet(records: list[dict[str, Any]], output_path: Path, columns: int = 5) -> None:
    thumb_size = 220
    label_height = 64
    rows = (len(records) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * thumb_size, rows * (thumb_size + label_height)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for index, record in enumerate(records):
        x = (index % columns) * thumb_size
        y = (index // columns) * (thumb_size + label_height)
        with Image.open(record["samplePath"]) as image:
            image = image.convert("RGB")
            image.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS)
            sheet.paste(image, (x + (thumb_size - image.width) // 2, y + (thumb_size - image.height) // 2))
        label = f"{record['ordinal']:03d}. {record['english']}\n{record['wordId']}"
        draw.multiline_text((x + 8, y + thumb_size + 8), label, fill=(25, 25, 25), font=font, spacing=3)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, quality=92)


def detect_text(record: dict[str, Any]) -> str:
    if pytesseract is None:
        return ""
    try:
        with Image.open(record["samplePath"]) as image:
            text = pytesseract.image_to_string(image.convert("RGB"), lang="eng+chi_sim")
    except Exception:
        return ""
    return " ".join(text.split())


def main() -> None:
    parser = argparse.ArgumentParser(description="Create review artifacts for generated word images.")
    parser.add_argument("--run-dir", type=Path, default=DEFAULT_RUN_DIR)
    parser.add_argument("--page-size", type=int, default=30)
    args = parser.parse_args()

    run_dir = args.run_dir
    records = load_manifest(run_dir)
    review_dir = run_dir / "review"
    review_dir.mkdir(parents=True, exist_ok=True)

    enriched: list[dict[str, Any]] = []
    for ordinal, record in enumerate(records, start=1):
        text = detect_text(record)
        enriched.append({**record, "ordinal": ordinal, "ocrText": text})

    pages: list[str] = []
    for page_index, start in enumerate(range(0, len(enriched), args.page_size), start=1):
        page_records = enriched[start : start + args.page_size]
        sheet_path = review_dir / f"review-sheet-{page_index:02d}.jpg"
        make_sheet(page_records, sheet_path)
        pages.append(str(sheet_path))

    suspicious = [
        {
            "ordinal": record["ordinal"],
            "wordId": record["wordId"],
            "english": record["english"],
            "ocrText": record["ocrText"],
        }
        for record in enriched
        if record["ocrText"]
    ]

    tsv_path = review_dir / "manual-review.tsv"
    with tsv_path.open("w", encoding="utf-8") as file:
        file.write("ordinal\twordId\tenglish\tstatus\tnotes\n")
        for record in enriched:
            default_status = "REVIEW" if record["ocrText"] else "OK"
            file.write(f"{record['ordinal']}\t{record['wordId']}\t{record['english']}\t{default_status}\t{record['ocrText']}\n")

    report = {
        "runDir": str(run_dir),
        "total": len(enriched),
        "reviewSheets": pages,
        "manualReviewTsv": str(tsv_path),
        "ocrAvailable": pytesseract is not None,
        "ocrSuspiciousCount": len(suspicious),
        "ocrSuspicious": suspicious,
    }
    report_path = review_dir / "audit-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ["total", "ocrAvailable", "ocrSuspiciousCount"]}, ensure_ascii=False, indent=2))
    print(f"report={report_path}")
    print(f"manual_review={tsv_path}")


if __name__ == "__main__":
    main()
