#!/usr/bin/env python3
"""
批量OCR处理Level 1牛津树绘本
- 跳过封面(P1)和封底(最后1页)
- 跳过文字少于20字母的页面(纯图片页)
- 每本输出一个JSON文件
"""

import subprocess
import json
import os
import sys
from pathlib import Path

# 配置
OXFORD_TREE_DIR = Path(__file__).resolve().parents[1]
LEVEL1_DIR = OXFORD_TREE_DIR / "Level 1"
OUTPUT_DIR = OXFORD_TREE_DIR / "extracted" / "Level 1"
TEMP_DIR = Path.home() / "tmp_ocr"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

MIN_LETTERS = 20  # 少于20个字母的页面视为纯图片页


def get_page_count(pdf_path: str) -> int:
    result = subprocess.run(
        ["pdfinfo", pdf_path],
        capture_output=True, text=True, timeout=10
    )
    for line in result.stdout.splitlines():
        if line.startswith("Pages:"):
            return int(line.split(":")[-1].strip())
    return 0


def pdf_to_images(pdf_path: str, name: str) -> list[Path]:
    """PDF转图片，返回图片路径列表"""
    result = subprocess.run(
        ["pdftoppm", "-r", "150", "-png", pdf_path, str(TEMP_DIR / name)],
        capture_output=True, timeout=120
    )
    if result.returncode != 0:
        print(f"  pdftoppm错误: {result.stderr.decode()[:100]}")
        return []
    pages = sorted(TEMP_DIR.glob(f"{name}-*.png"))
    return pages


def ocr_page(png_path: Path) -> tuple[str, int]:
    """OCR单页，返回(文字, 字母数)"""
    result = subprocess.run(
        ["tesseract", str(png_path), "stdout", "-l", "eng", "--psm", "6"],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        return "", 0
    text = result.stdout
    letters = sum(1 for c in text if c.isalpha())
    return text.strip(), letters


def process_book(pdf_path: Path) -> dict:
    name = pdf_path.stem
    print(f"\n处理: {name}")
    
    page_count = get_page_count(str(pdf_path))
    print(f"  总页数: {page_count}")
    
    # PDF转图片
    pages = pdf_to_images(str(pdf_path), name.replace(" ", "_"))
    if not pages:
        return {"book": name, "error": "pdf_to_images failed", "pages": []}
    
    results = []
    text_page_count = 0
    
    for i, png in enumerate(pages, start=1):
        # 跳过封面(P1)和封底(最后1页)
        if i == 1 or i == page_count:
            print(f"  P{i}: 跳过(封面/封底)")
            continue
        
        text, letter_count = ocr_page(png)
        
        if letter_count < MIN_LETTERS:
            print(f"  P{i}: 跳过(纯图片, {letter_count}字母)")
            # 删除图片
            png.unlink()
            continue
        
        # 清理文字：去除乱码字符，保留可读英文
        clean_lines = []
        for line in text.splitlines():
            # 只保留字母、空格、常见标点
            cleaned = ''.join(
                c if (c.isalnum() or c in " .,'-!?") else ' '
                for c in line
            )
            cleaned = ' '.join(w for w in cleaned.split() if w)
            if cleaned:
                clean_lines.append(cleaned)
        clean_text = '\n'.join(clean_lines)
        
        results.append({
            "page_number": i,
            "letter_count": letter_count,
            "text": clean_text
        })
        text_page_count += 1
        
        print(f"  P{i}: ✓ {letter_count}字母")
        
        # 删除图片节省空间
        png.unlink()
    
    return {
        "book": name,
        "level": "Level 1",
        "pdf": str(pdf_path),
        "total_pages": page_count,
        "text_pages": text_page_count,
        "pages": results
    }


def main():
    books = sorted(LEVEL1_DIR.glob("*.pdf"))
    print(f"Level 1 共 {len(books)} 本\n{'='*50}")
    
    for i, book in enumerate(books, 1):
        out_path = OUTPUT_DIR / f"{book.stem}.json"
        
        # 跳过已处理的
        if out_path.exists():
            print(f"[{i}/{len(books)}] 跳过(已存在): {book.stem}")
            continue
        
        try:
            result = process_book(book)
            
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            
            print(f"  → 保存: {out_path.name}")
            
        except Exception as e:
            print(f"  [错误] {e}")
            import traceback
            traceback.print_exc()
    
    print(f"\n完成！结果保存在: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
