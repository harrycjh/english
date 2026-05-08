#!/usr/bin/env python3
"""
使用 Claude Vision API 重新提取 Red Rocket 绘本文字
替换之前 Tesseract OCR 效果差的提取结果

用法:
  python3 extract_redrocket_vision.py              # 处理全部6个级别
  python3 extract_redrocket_vision.py "Emergent Level"  # 只处理指定级别
"""

import base64
import json
import sys
import subprocess
import time
from pathlib import Path

import anthropic

ROOT_DIR = Path(__file__).resolve().parents[1]
BASE_DIR = ROOT_DIR / "red-rocket"
EXTRACTED_DIR = BASE_DIR / "extracted"
TEMP_DIR = Path.home() / "tmp_vision_ocr"
TEMP_DIR.mkdir(exist_ok=True)

ALL_LEVELS = [
    "Emergent Level",
    "Pre-Reading Level",
    "Early Level 1",
    "Early Level 2",
    "Early Level 3",
    "Early Level 4",
]

client = anthropic.Anthropic()

EXTRACT_PROMPT = (
    "This is a page from a children's picture book. "
    "Extract ONLY the printed text that appears on this page.\n\n"
    "Rules:\n"
    "- Copy the printed words exactly as they appear\n"
    "- Do NOT describe the illustrations or pictures\n"
    "- Do NOT add commentary or explanation\n"
    "- If there is no printed text, reply with exactly: [NO TEXT]\n"
    "- Preserve line breaks where they appear in the original"
)

SKIP_PAGE_TYPES = {"front_matter", "back_matter", "blank"}


def pdf_to_images(pdf_path: Path, name: str) -> list[Path]:
    name_safe = name.replace(" ", "_").replace("'", "")
    result = subprocess.run(
        ["pdftoppm", "-r", "150", "-png", str(pdf_path), str(TEMP_DIR / name_safe)],
        capture_output=True, timeout=120,
    )
    if result.returncode != 0:
        print(f"    pdftoppm error: {result.stderr.decode()[:120]}")
        return []
    return sorted(TEMP_DIR.glob(f"{name_safe}-*.png"))


def extract_text(img_path: Path, retries: int = 3) -> str:
    with open(img_path, "rb") as f:
        b64 = base64.standard_b64encode(f.read()).decode()

    for attempt in range(retries):
        try:
            msg = client.messages.create(
                model="claude-opus-4-7",
                max_tokens=512,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/png", "data": b64},
                        },
                        {"type": "text", "text": EXTRACT_PROMPT},
                    ],
                }],
            )
            text = msg.content[0].text.strip()
            return "" if text == "[NO TEXT]" else text
        except anthropic.RateLimitError:
            wait = 30 * (attempt + 1)
            print(f"\n    [rate limit] waiting {wait}s...", end="", flush=True)
            time.sleep(wait)
        except Exception as e:
            print(f"\n    [api error attempt {attempt + 1}] {e}", end="", flush=True)
            if attempt < retries - 1:
                time.sleep(5)
    return ""


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

        if page_type in SKIP_PAGE_TYPES:
            updated_pages.append({
                "page_number": i,
                "page_type": page_type,
                "raw_text": "",
                "text": "",
            })
            img_path.unlink()
            continue

        print(f"    P{i} ", end="", flush=True)
        text = extract_text(img_path)
        preview = text[:40].replace("\n", " ") if text else "(empty)"
        print(f"→ {preview!r}")

        updated_pages.append({
            "page_number": i,
            "page_type": page_type,
            "raw_text": text,
            "text": text,
        })

        img_path.unlink()
        time.sleep(0.3)  # avoid hammering the API

    data["pages"] = updated_pages
    data["extraction_method"] = "claude-vision"
    return data


def process_level(level: str) -> tuple[int, int]:
    pdf_dir = BASE_DIR / level
    out_dir = EXTRACTED_DIR / level
    out_dir.mkdir(parents=True, exist_ok=True)

    if not pdf_dir.exists():
        print(f"[MISSING] {level}")
        return 0, 0

    books = sorted(pdf_dir.glob("*.pdf"))
    print(f"\n{'=' * 55}")
    print(f"  {level}  ({len(books)} books)")
    print(f"{'=' * 55}")

    done = 0
    skipped = 0

    for book in books:
        out_path = out_dir / f"{book.stem}.json"

        if out_path.exists():
            try:
                with open(out_path) as f:
                    if json.load(f).get("extraction_method") == "claude-vision":
                        print(f"  [skip] {book.stem}")
                        skipped += 1
                        continue
            except (json.JSONDecodeError, KeyError):
                pass  # corrupt or missing method — re-process

        print(f"\n  [{done + skipped + 1}/{len(books)}] {book.stem}")

        try:
            result = process_book(book, out_path)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"  → saved")
            done += 1
        except Exception as e:
            import traceback
            print(f"  [ERROR] {e}")
            traceback.print_exc()

    return done, skipped


def main():
    levels = sys.argv[1:] if len(sys.argv) > 1 else ALL_LEVELS
    invalid = [l for l in levels if l not in ALL_LEVELS]
    if invalid:
        print(f"Unknown levels: {invalid}")
        print(f"Valid: {ALL_LEVELS}")
        sys.exit(1)

    total_done = total_skipped = 0
    for level in levels:
        done, skipped = process_level(level)
        total_done += done
        total_skipped += skipped

    # clean up any leftover temp images
    for f in TEMP_DIR.glob("*.png"):
        f.unlink()

    print(f"\n{'=' * 55}")
    print(f"Complete — processed: {total_done}, skipped: {total_skipped}")
    print(f"Results: {EXTRACTED_DIR}")


if __name__ == "__main__":
    main()
