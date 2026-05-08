#!/usr/bin/env python3
"""清理提取文本中的多余换行符和空格"""

import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BASE_DIR = ROOT_DIR / "red-rocket" / "extracted"
LEVELS = ["Emergent Level", "Pre-Reading Level", "Early Level 1", "Early Level 2", "Early Level 3", "Early Level 4"]


def clean_text(text: str) -> str:
    """清理文本：去掉多余换行符和空格"""
    if not text or not text.strip():
        return ""

    # 1. 按行处理：去掉每行首尾空格
    lines = [line.strip() for line in text.split("\n")]

    # 2. 去掉空行
    lines = [line for line in lines if line]

    # 3. 合并：多个句子用单个换行符分隔
    result = "\n".join(lines)

    # 4. 去掉多余的空格（句子内保留单个空格）
    result = " ".join(result.split())  # 规范化所有空格为单个空格

    # 但如果原文有换行分隔的多行（比如一行一个词），保留换行
    # 再从头处理：保留原有的换行结构但清理每行
    lines = text.split("\n")
    clean_lines = [" ".join(line.split()) for line in lines if line.strip()]

    return "\n".join(clean_lines)


def process_level(level: str):
    out_dir = BASE_DIR / level
    if not out_dir.exists():
        return 0

    count = 0
    for json_file in sorted(out_dir.glob("*.json")):
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            # 清理所有页面的text字段
            for page in data.get("pages", []):
                if page.get("text"):
                    page["text"] = clean_text(page["text"])

            # 写回
            with open(json_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            count += 1
        except Exception as e:
            print(f"  Error {json_file.stem}: {e}")

    return count


def main():
    total = 0
    for level in LEVELS:
        count = process_level(level)
        print(f"{level}: {count} books cleaned")
        total += count

    print(f"\n完成！清理了 {total} 个文件")


if __name__ == "__main__":
    main()
