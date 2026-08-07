#!/usr/bin/env python3
"""Render CropBox-aware RAZ PDF pages into deduplicated 3x3 WebP atlases."""

from __future__ import annotations

import argparse
import json
from collections import OrderedDict
from pathlib import Path
from typing import Any

import fitz
from PIL import Image


CELL_SIZE = 512
ATLAS_COLUMNS = 3
ATLAS_ROWS = 3
RENDER_DPI = 144
MAX_OPEN_BOOKS = 12


class DocumentCache:
    def __init__(self, limit: int = MAX_OPEN_BOOKS) -> None:
        self.limit = limit
        self.documents: OrderedDict[Path, fitz.Document] = OrderedDict()

    def get(self, path: Path) -> fitz.Document:
        document = self.documents.pop(path, None)
        if document is None:
            document = fitz.open(path)
        self.documents[path] = document
        while len(self.documents) > self.limit:
            _, oldest = self.documents.popitem(last=False)
            oldest.close()
        return document

    def close(self) -> None:
        for document in self.documents.values():
            document.close()
        self.documents.clear()


def render_cell(entry: dict[str, Any], cache: DocumentCache) -> Image.Image:
    pdf_path = Path(entry["pdfPath"])
    document = cache.get(pdf_path)
    pdf_index = int(entry["pdfIndex"])
    if pdf_index < 0 or pdf_index >= len(document):
        raise ValueError(f"{pdf_path}: pdfIndex {pdf_index} is outside 0..{len(document) - 1}")

    # PyMuPDF respects the RAZ CropBox. Poppler renders the imposed two-page
    # MediaBox here, which would put the wrong facing page into the word card.
    pixmap = document[pdf_index].get_pixmap(dpi=RENDER_DPI, alpha=False)
    page_image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    page_image.thumbnail((CELL_SIZE, CELL_SIZE), Image.Resampling.LANCZOS)
    cell = Image.new("RGB", (CELL_SIZE, CELL_SIZE), "white")
    cell.paste(
        page_image,
        ((CELL_SIZE - page_image.width) // 2, (CELL_SIZE - page_image.height) // 2),
    )
    return cell


def render_atlases(plan: dict[str, Any], public_root: Path, quality: int) -> None:
    cache = DocumentCache()
    try:
        for atlas_number, atlas in enumerate(plan["atlases"], 1):
            canvas = Image.new(
                "RGB",
                (CELL_SIZE * ATLAS_COLUMNS, CELL_SIZE * ATLAS_ROWS),
                "white",
            )
            for entry in atlas["entries"]:
                cell = render_cell(entry, cache)
                canvas.paste(
                    cell,
                    (int(entry["column"]) * CELL_SIZE, int(entry["row"]) * CELL_SIZE),
                )
            output_path = public_root / atlas["atlasPath"].lstrip("/")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(output_path, "WEBP", quality=quality, method=6)
            if atlas_number % 10 == 0 or atlas_number == len(plan["atlases"]):
                print(f"Rendered RAZ atlases {atlas_number}/{len(plan['atlases'])}")
    finally:
        cache.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--public-root", type=Path, required=True)
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()
    if not 1 <= args.quality <= 100:
        parser.error("--quality must be from 1 to 100")
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    render_atlases(plan, args.public_root, args.quality)


if __name__ == "__main__":
    main()
