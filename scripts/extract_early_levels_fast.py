#!/usr/bin/env python3
"""快速处理 Early Level 1-4 的 Red Rocket 绘本（用 tesseract + 清理）"""

import subprocess
import json
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BASE_DIR = ROOT_DIR / "red-rocket"
EXTRACTED_DIR = BASE_DIR / "extracted"
TEMP_DIR = Path.home() / "tmp_vision_ocr"
TEMP_DIR.mkdir(exist_ok=True)

LEVELS = ["Early Level 1", "Early Level 2", "Early Level 3", "Early Level 4"]
MIN_LETTERS = 15  # Early Level 书更清晰，降低阈值


def pdf_to_images(pdf_path: Path, name: str) -> list[Path]:
    name_safe = name.replace(" ", "_").replace("'", "")
    result = subprocess.run(
        ["pdftoppm", "-r", "150", "-png", str(pdf_path), str(TEMP_DIR / name_safe)],
        capture_output=True, timeout=120,
    )
    if result.returncode != 0:
        return []
    return sorted(TEMP_DIR.glob(f"{name_safe}-*.png"))


def ocr_page(png_path: Path) -> str:
    result = subprocess.run(
        ["tesseract", str(png_path), "stdout", "-l", "eng", "--psm", "6"],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        return ""
    text = result.stdout.strip()

    # 清理：去除乱码，保留字母、数字、标点
    clean_lines = []
    for line in text.splitlines():
        cleaned = "".join(
            c if (c.isalnum() or c in " .,'-!?;:") else " "
            for c in line
        )
        cleaned = " ".join(w for w in cleaned.split() if w)
        if cleaned:
            clean_lines.append(cleaned)
    return "\n".join(clean_lines)


def process_book(pdf_path: Path, existing_json: Path) -> dict:
    with open(existing_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    name = pdf_path.stem
    images = pdf_to_images(pdf_path, name)
    if not images:
        return data

    page_map = {p["page_number"]: p for p in data.get("pages", [])}
    updated_pages = []

    for i, img_path in enumerate(images, start=1):
        existing_page = page_map.get(i, {})
        page_type = existing_page.get("page_type", "body")

        if page_type in ("front_matter", "back_matter", "blank"):
            updated_pages.append({
                "page_number": i,
                "page_type": page_type,
                "raw_text": "",
                "text": "",
            })
            img_path.unlink()
            continue

        text = ocr_page(img_path)
        letter_count = sum(1 for c in text if c.isalpha())

        if letter_count < MIN_LETTERS:
            text = ""

        updated_pages.append({
            "page_number": i,
            "page_type": page_type,
            "raw_text": text,
            "text": text,
        })

        img_path.unlink()

    data["pages"] = updated_pages
    data["extraction_method"] = "tesseract-cleaned"
    return data


def main():
    total_done = 0

    for level in LEVELS:
        pdf_dir = BASE_DIR / level
        out_dir = EXTRACTED_DIR / level
        out_dir.mkdir(parents=True, exist_ok=True)

        if not pdf_dir.exists():
            continue

        books = sorted(pdf_dir.glob("*.pdf"))
        print(f"\n{'='*50}\n{level}: {len(books)} books")

        for j, book in enumerate(books, 1):
            out_path = out_dir / f"{book.stem}.json"

            # 跳过已用claude-vision处理的
            if out_path.exists():
                try:
                    with open(out_path) as f:
                        if json.load(f).get("extraction_method") == "claude-vision":
                            continue
                except json.JSONDecodeError:
                    pass

            print(f"[{j}/{len(books)}] {book.stem[:30]}...", end=" ", flush=True)

            try:
                result = process_book(book, out_path)
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                print("✓")
                total_done += 1
            except Exception as e:
                print(f"✗ {e}")

    # cleanup
    for f in TEMP_DIR.glob("*.png"):
        f.unlink()

    print(f"\n完成！处理 {total_done} 本书")


if __name__ == "__main__":
    main()
