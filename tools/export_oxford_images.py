#!/usr/bin/env python3
"""
export_oxford_images.py
从 Oxford Reading Tree PDF 中按词表的 oxfordRefs 提取页面图片，
输出为 webp 格式到 vocab_rabbit/public/content/images/words/

用法:
    python3 tools/export_oxford_images.py [--dpi 150] [--quality 80] [--max-width 800] [--dry-run]
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from io import BytesIO
from pathlib import Path

import pymupdf  # PyMuPDF
from PIL import Image

# ---------- 路径常量 ----------
ROOT = Path(__file__).resolve().parent.parent
VOCAB_JSON = ROOT / "vocab_rabbit" / "public" / "content" / "words" / "ket_vocabulary.json"
OXFORD_DIR = ROOT / "oxford-tree"
OUTPUT_DIR = ROOT / "vocab_rabbit" / "public" / "content" / "images" / "words"


def build_pdf_map() -> dict[tuple[int, int], Path]:
    """扫描 oxford-tree/Level X/ 构建 (level, book) -> PDF路径 的映射"""
    pdf_map: dict[tuple[int, int], Path] = {}
    for level in range(1, 17):
        level_dir = OXFORD_DIR / f"Level {level}"
        if not level_dir.is_dir():
            continue
        for f in level_dir.iterdir():
            if f.suffix.lower() != ".pdf":
                continue
            # 匹配 "10-08 Title.pdf" 或 "12-1. Title.pdf"
            m = re.match(r"(\d+)-(\d+)[.\s]", f.name)
            if m:
                l, b = int(m.group(1)), int(m.group(2))
                pdf_map[(l, b)] = f
    return pdf_map


def extract_page_image(
    pdf_path: Path, page_num: int, dpi: int, max_width: int, quality: int
) -> bytes | None:
    """从 PDF 提取指定页面（1-based）并转为 webp bytes"""
    try:
        doc = pymupdf.open(str(pdf_path))
    except Exception as e:
        print(f"  ⚠ 无法打开 PDF {pdf_path.name}: {e}")
        return None

    # page_num 在词表中是 1-based
    page_index = page_num - 1
    if page_index < 0 or page_index >= len(doc):
        print(f"  ⚠ 页码 {page_num} 超出范围 (共 {len(doc)} 页): {pdf_path.name}")
        doc.close()
        return None

    page = doc[page_index]
    # 按 DPI 渲染
    zoom = dpi / 72.0
    mat = pymupdf.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    doc.close()

    # 转 PIL Image
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    # 缩放到 max_width（保持纵横比）
    if img.width > max_width:
        ratio = max_width / img.width
        new_h = int(img.height * ratio)
        img = img.resize((max_width, new_h), Image.LANCZOS)

    # 转 webp
    buf = BytesIO()
    img.save(buf, format="WEBP", quality=quality)
    return buf.getvalue()


def main():
    parser = argparse.ArgumentParser(description="从 Oxford Tree PDF 导出单词图片")
    parser.add_argument("--dpi", type=int, default=150, help="渲染 DPI (默认 150)")
    parser.add_argument("--quality", type=int, default=80, help="WebP 质量 (默认 80)")
    parser.add_argument("--max-width", type=int, default=800, help="最大宽度像素 (默认 800)")
    parser.add_argument("--dry-run", action="store_true", help="仅统计，不实际提取")
    args = parser.parse_args()

    # 1. 加载词表
    print("📖 加载词表...")
    data = json.loads(VOCAB_JSON.read_text(encoding="utf-8"))
    words = data["words"]
    print(f"   共 {len(words)} 个单词")

    # 2. 构建 PDF 映射
    print("📂 扫描 PDF 文件...")
    pdf_map = build_pdf_map()
    print(f"   找到 {len(pdf_map)} 本 PDF")

    # 3. 按第一个 oxfordRef 分组：(level,book,page) -> [word_ids]
    page_to_words: dict[tuple[int, int, int], list[str]] = defaultdict(list)
    no_ref_words = []
    for w in words:
        refs = w.get("oxfordRefs", [])
        if not refs:
            no_ref_words.append(w["id"])
            continue
        r = refs[0]  # 取第一个引用
        page_to_words[(r["level"], r["book"], r["page"])].append(w["id"])

    # 过滤掉没有对应 PDF 的页面
    valid_pages = {}
    missing_pdfs = set()
    for (level, book, page), word_ids in page_to_words.items():
        if (level, book) in pdf_map:
            valid_pages[(level, book, page)] = word_ids
        else:
            missing_pdfs.add((level, book))

    words_with_images = sum(len(ids) for ids in valid_pages.values())
    print(f"\n📊 统计:")
    print(f"   有 oxfordRef 的单词: {len(words) - len(no_ref_words)}")
    print(f"   无 oxfordRef 的单词: {len(no_ref_words)}")
    print(f"   需提取的唯一页面: {len(valid_pages)}")
    print(f"   将生成图片的单词: {words_with_images}")
    if missing_pdfs:
        print(f"   缺失 PDF ({len(missing_pdfs)} 本): {sorted(missing_pdfs)[:5]}...")

    if args.dry_run:
        print("\n🏁 dry-run 模式，不提取图片")
        return

    # 4. 创建输出目录
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 5. 提取图片
    print(f"\n🖼️  开始提取 ({args.dpi} DPI, {args.quality}% quality, max {args.max_width}px)...")
    total_pages = len(valid_pages)
    success_count = 0
    fail_count = 0
    skip_count = 0
    word_image_count = 0

    # 按 (level, book) 分组以减少 PDF 打开次数
    book_pages: dict[tuple[int, int], list[tuple[int, list[str]]]] = defaultdict(list)
    for (level, book, page), word_ids in valid_pages.items():
        book_pages[(level, book)].append((page, word_ids))

    processed = 0
    for (level, book), pages in sorted(book_pages.items()):
        pdf_path = pdf_map[(level, book)]
        # 按页码排序
        pages.sort(key=lambda x: x[0])

        for page_num, word_ids in pages:
            processed += 1

            # 检查是否所有目标文件都已存在
            all_exist = all((OUTPUT_DIR / f"{wid}.webp").exists() for wid in word_ids)
            if all_exist:
                skip_count += 1
                word_image_count += len(word_ids)
                continue

            img_data = extract_page_image(pdf_path, page_num, args.dpi, args.max_width, args.quality)
            if img_data is None:
                fail_count += 1
                continue

            success_count += 1
            for wid in word_ids:
                out_path = OUTPUT_DIR / f"{wid}.webp"
                out_path.write_bytes(img_data)
                word_image_count += 1

            if processed % 100 == 0:
                print(f"   进度: {processed}/{total_pages} 页...")

    print(f"\n✅ 完成!")
    print(f"   提取成功: {success_count} 页")
    print(f"   跳过(已存在): {skip_count} 页")
    print(f"   提取失败: {fail_count} 页")
    print(f"   生成图片: {word_image_count} 个单词")

    # 6. 更新词表 JSON: 将有图片的单词标记 imageApproved=true
    print("\n📝 更新词表 imageApproved 标记...")
    approved_set = set()
    for w in words:
        img_file = OUTPUT_DIR / f"{w['id']}.webp"
        if img_file.exists():
            w["imageApproved"] = True
            approved_set.add(w["id"])
        else:
            w["imageApproved"] = False

    VOCAB_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"   已标记 {len(approved_set)}/{len(words)} 个单词 imageApproved=true")
    print("🏁 全部完成!")


if __name__ == "__main__":
    main()
