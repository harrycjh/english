#!/usr/bin/env python3
"""用tesseract逐本重新处理全部Red Rocket绘本"""

import subprocess
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BASE_DIR = ROOT_DIR / "red-rocket"
EXTRACTED_DIR = BASE_DIR / "extracted"
TEMP_DIR = Path.home() / "tmp_vision_ocr"
TEMP_DIR.mkdir(exist_ok=True)

LEVELS = ["Emergent Level", "Pre-Reading Level", "Early Level 1", "Early Level 2", "Early Level 3", "Early Level 4"]


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
    """用tesseract识别单页"""
    result = subprocess.run(
        ["tesseract", str(png_path), "stdout", "-l", "eng", "--psm", "6"],
        capture_output=True, text=True, timeout=60,
    )
    text = result.stdout.strip() if result.returncode == 0 else ""

    # 清理：保留字母/数字/标点，去掉乱码
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


def process_book(pdf_path: Path, out_path: Path) -> dict:
    """处理单本书"""
    # 读已有的metadata
    if out_path.exists():
        with open(out_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except:
                return None
    else:
        return None

    # 转PDF为图片
    images = pdf_to_images(pdf_path, pdf_path.stem)
    if not images:
        return None

    # 构建page_map（保留原有的page_type）
    page_map = {p["page_number"]: p for p in data.get("pages", [])}
    updated_pages = []

    for i, img_path in enumerate(images, start=1):
        existing_page = page_map.get(i, {})
        page_type = existing_page.get("page_type", "body")

        # skip front/back/blank
        if page_type in ("front_matter", "back_matter", "blank"):
            updated_pages.append({
                "page_number": i,
                "page_type": page_type,
                "raw_text": "",
                "text": "",
            })
            img_path.unlink()
            continue

        # OCR识别
        text = ocr_page(img_path)

        # 过滤：如果文字太少，判定为图片页
        letter_count = sum(1 for c in text if c.isalpha())
        if letter_count < 15:  # 少于15个字母→图片页
            text = ""

        updated_pages.append({
            "page_number": i,
            "page_type": page_type,
            "raw_text": text,
            "text": text,
        })

        img_path.unlink()

    data["pages"] = updated_pages
    data["extraction_method"] = "tesseract-ocr"
    return data


def main():
    total_done = 0
    total_skip = 0

    for level in LEVELS:
        pdf_dir = BASE_DIR / level
        out_dir = EXTRACTED_DIR / level
        out_dir.mkdir(parents=True, exist_ok=True)

        if not pdf_dir.exists():
            continue

        books = sorted(pdf_dir.glob("*.pdf"))
        print(f"\n{'='*50}\n{level}: {len(books)} books\n{'='*50}")

        for j, book in enumerate(books, 1):
            out_path = out_dir / f"{book.stem}.json"

            print(f"[{j:2d}/{len(books)}] {book.stem[:40]:40s} ", end="", flush=True)

            try:
                data = process_book(book, out_path)
                if data is None:
                    print("SKIP (no json)")
                    total_skip += 1
                    continue

                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print("✓")
                total_done += 1
            except Exception as e:
                print(f"✗ {str(e)[:40]}")

    # cleanup
    for f in TEMP_DIR.glob("*.png"):
        f.unlink()

    print(f"\n完成！处理 {total_done} 本，跳过 {total_skip} 本")


if __name__ == "__main__":
    main()
