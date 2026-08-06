#!/usr/bin/env python3
"""把 raz/ 下的 Reading A-Z 分级读物 PDF 抽成结构化 JSON（逐页正文 + 词汇表 + 书目信息）。

用法：
    python3 scripts/extract_raz_books.py                 # 全量抽取
    python3 scripts/extract_raz_books.py --level E F     # 只抽某几级
    python3 scripts/extract_raz_books.py --limit 5       # 每级只抽前 5 本（调参用）

为什么用 PyMuPDF 而不是仓库里惯用的 pdftotext：
RAZ 的 PDF 是**对开拼版**——MediaBox 是 792x612（左右两页）或 612x792（上下两页），
CropBox 才是真正的单页。poppler 默认按 MediaBox 出文字，于是每个 PDF 页都会吐出
相邻两页的内容、且前后页互相重复，正文直接翻倍且串行。PyMuPDF 认 CropBox，开箱即对。

抽取质量不靠肉眼：每本书封底自带官方 `Word Count: N`，脚本会拿它跟抽出来的正文词数
对账，最后打印吻合率。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover - 环境提示
    sys.exit("需要 PyMuPDF：pip install pymupdf")

ROOT_DIR = Path(__file__).resolve().parents[1]
RAZ_DIR = ROOT_DIR / "raz"
OUTPUT_PATH = RAZ_DIR / "extracted" / "raz-books.json"

LEVEL_DIR_RE = re.compile(r"^([A-Z])级别-pdf$")
# 每级除了正式读物，还有两本「定级」测评本，编号写成 `H定级1-…`。
FILE_NAME_RE = re.compile(r"^([A-Z])(?:定级)?(\d+)-(.+)\.pdf$")
BENCHMARK_RE = re.compile(r"^[A-Z]定级\d+-")

# 封面/封底/版权页上的固定字样，出现即判为非正文。
BOILERPLATE_MARKERS = (
    "www.readinga-z.com",
    "© Learning A–Z",
    "All rights reserved",
    "LEVELED BOOK •",
    "A Reading A–Z Level",
    "Photo Credits:",
    "Illustration Credits:",
)

WORD_COUNT_RE = re.compile(r"Word Count:\s*([\d,]+)")
GRADE_RE = re.compile(r"^Grade\s+(\S+)", re.MULTILINE)
WRITTEN_BY_RE = re.compile(r"Written by\s+(.+)")
ILLUSTRATED_BY_RE = re.compile(r"Illustrated by\s+(.+)")
PAGE_NUMBER_RE = re.compile(r"^\s*(\d{1,3})\s*$")
# 偶尔页码和正文首句挤在同一行（`12 This is a shark egg.`）。只在数字等于期望页码时
# 才切，所以不会误伤 `3 friends went...` 这种以数字开头的正文。
GLUED_PAGE_NUMBER_RE = re.compile(r"^(\d{1,3})\s+(?=\S)")
# 页眉 `书名 • Level J`。按这个模式认，而不是拿文件名去比对——
# 文件名和书内标题常常对不上（`Where Is Cub` vs `Where Is Cub?`、大小写差异）。
RUNNING_HEADER_RE = re.compile(r"^(.{1,80}?)\s*[•·]\s*Level\s+[A-Z]$")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’\-]*")
# 正文和图注的字号差得很开（21 vs 10），留 0.75 只是为了容忍同一段里的字号抖动。
SIZE_TOLERANCE = 0.75
# 一个字号要占到这么多字符才可能是正文，挡掉装饰性大字。
MIN_BODY_CHARS = 25
CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]+")
OCR_DPI = 300
OCR_BODY_HEIGHT_RATIO = 0.72
OCR_TEXT_PAGE_RATIO = 0.3

# 正文里夹带的功能页，单独打标签，不算故事正文词数。
SECTION_MARKERS = {
    "Table of Contents": "toc",
    "Glossary": "glossary",
    "Index": "index",
    "Focus Question": "focus-question",
    "Word Work": "word-work",
    "Writing and Art": "activity",
    "Explore More": "activity",
}

# freedom (n.)  the state of being free (p. 4)
GLOSSARY_HEAD_RE = re.compile(
    r"^\s*([A-Za-z][A-Za-z '’\-]*?)\s*\((n|v|adj|adv|prep|pl|conj|pron|interj)\.\)\s*(.*)$"
)
GLOSSARY_PAGE_REF_RE = re.compile(r"\(p{1,2}\.\s*([\d,\s\-–and]+)\)\s*$")


def ocr_page(page) -> list[dict]:
    """扫描件没有文字层，只能渲染成图再 OCR。

    OCR 出不来字号，用 tesseract 给的字高代替：正文字高明显大于图注。不过字高会随
    有没有升部/降部抖动（`trains, and buses.` 就比同段其他行矮一截），所以不能直接
    比数值，得先按整页最高的一档划线，再把结果归一成 PDF 那套字号，好让下游一视同仁。
    """
    with tempfile.TemporaryDirectory() as work_dir:
        image = Path(work_dir) / "page.png"
        page.get_pixmap(dpi=OCR_DPI).save(image)
        result = subprocess.run(
            ["tesseract", str(image), "stdout", "-l", "eng", "--psm", "3", "tsv"],
            capture_output=True,
            text=True,
            timeout=120,
        )
    if result.returncode != 0:
        return []

    grouped: dict[tuple, list[tuple[str, int]]] = {}
    for row in result.stdout.splitlines()[1:]:
        cells = row.split("\t")
        if len(cells) < 12 or not cells[11].strip():
            continue
        grouped.setdefault(tuple(cells[1:5]), []).append((cells[11].strip(), int(cells[9])))

    lines = [
        {"text": " ".join(word for word, _ in words), "height": max(h for _, h in words)}
        for words in grouped.values()
    ]
    if not lines:
        return []
    cut = max(line["height"] for line in lines) * OCR_BODY_HEIGHT_RATIO
    return [
        {"text": line["text"], "size": 18.0 if line["height"] >= cut else 10.0}
        for line in lines
    ]


def split_credit(value: str) -> str | None:
    name = re.split(r"[•·]|\bIllustrated by\b|\bWritten by\b", value)[0]
    name = " ".join(name.split()).strip(" ,;")
    return name or None


def clean_text(text: str) -> str:
    """RAZ 用 \x07 当词条里的制表符，原样留着会污染下游。"""
    return CONTROL_CHARS_RE.sub(" ", text).strip()


def is_ocr_noise(text: str) -> bool:
    """OCR 会把插图的线条读成 `A/T —`、`ee ae eS` 这类碎片。

    真词至少有一个 4 字母以上的词——这一条足够干净地把碎片挡掉，
    代价是偶尔丢一个孤立的短词，对语料没影响。
    """
    return not any(len(token) >= 4 for token in WORD_RE.findall(text))


def read_pages(pdf_path: Path) -> tuple[list[list[dict]], str]:
    """按 CropBox 逐页取文字，每行连字号一起带出来。

    字号是这套书里最干净的判别器：同一页上正文 21pt、页码 14pt、图注 10pt、
    页眉 8pt，泾渭分明。光看文字流没法把图注和正文分开——它们在阅读顺序里是混着的。
    """
    pages: list[list[dict]] = []
    with fitz.open(pdf_path) as doc:
        for page in doc:
            lines: list[dict] = []
            for block in page.get_text("dict")["blocks"]:
                if block.get("type") != 0:
                    continue
                for line in block["lines"]:
                    spans = line["spans"]
                    text = clean_text("".join(span["text"] for span in spans))
                    if not text:
                        continue
                    lines.append({"text": text, "size": round(max(s["size"] for s in spans), 1)})
            pages.append(lines)

        # 扫描件不是「一个字都没有」——这几本的封底仍带一行文字层。所以按有字页的
        # 占比判定；正常书里夹着的几张空白页不会把占比拉到这么低。
        if pages and sum(1 for page in pages if page) < len(pages) * OCR_TEXT_PAGE_RATIO:
            return [ocr_page(page) for page in doc], "ocr"
    return pages, "text"


def body_size_of(lines: list[dict]) -> float:
    """从大到小挑第一个有实质篇幅的字号，那就是正文。

    别按字符数取「占篇幅最多」的字号：科普书一页上地图标注能有二三十个词，比正文
    还长，正文字号会被直接挤掉（H39 因此把整幅地图的地名当成了正文，多算 146%）。
    也别无脑取最大字号：偶尔有一两个字的装饰性大字。所以要「够大且够长」。
    """
    weight: dict[float, int] = {}
    for line in lines:
        weight[line["size"]] = weight.get(line["size"], 0) + len(line["text"])
    for size in sorted(weight, reverse=True):
        if weight[size] >= MIN_BODY_CHARS:
            return size
    return max(weight, default=0.0)


def strip_running_header(lines: list[dict]) -> tuple[list[dict], str | None]:
    """摘掉页眉 `书名 • Level X`，顺带把书内标题捞出来。

    页眉只印在跨页的其中一侧，所以不能按行号固定裁剪；书内标题比文件名可靠。
    """
    kept: list[dict] = []
    title: str | None = None
    for line in lines:
        match = RUNNING_HEADER_RE.match(line["text"])
        if match:
            title = title or match.group(1).strip()
            continue
        kept.append(line)
    return kept, title


def take_page_number(lines: list[dict], expected: int) -> tuple[int | None, list[dict]]:
    """摘掉页码行。

    页码在版面上哪儿都可能——页首、页尾，甚至夹在正文和图注中间（跨页的哪半边决定了
    阅读顺序），所以位置不能用来定位。改成认数字本身：RAZ 正文一律从 3 开始连号，
    命中期望页码才算数，正文里孤零零的数字就不会被误吃。

    窗口放宽到 expected+2 是为了防雪崩：只要有一页的页码没认出来，后面每一页都会
    对不上号、整本书从那里开始全丢（G10 就这样丢掉了最后三页）。
    """
    for candidate in (expected, expected + 1, expected + 2):
        for position, line in enumerate(lines):
            if PAGE_NUMBER_RE.match(line["text"]) and int(line["text"]) == candidate:
                return candidate, lines[:position] + lines[position + 1 :]
            glued = GLUED_PAGE_NUMBER_RE.match(line["text"])
            if glued and int(glued.group(1)) == candidate:
                rest = dict(line, text=line["text"][glued.end() :])
                return candidate, lines[:position] + [rest] + lines[position + 1 :]
    return None, lines


def looks_like_boilerplate(text: str) -> bool:
    return any(marker in text for marker in BOILERPLATE_MARKERS)


def classify_section(lines: list[dict]) -> str | None:
    """页首若是功能页标题（词汇表/目录/索引…），返回标签。"""
    for line in lines[:2]:
        for marker, kind in SECTION_MARKERS.items():
            if line["text"].rstrip(":") == marker:
                return kind
    return None


def parse_glossary(lines: list[dict]) -> list[dict]:
    """词汇表条目形如 `cob (n.)  the hard, middle part of an ear of corn (p. 9)`。

    释义常常折行，且换行位置取决于排版，所以条目边界只能靠下一个 `词 (词性.)` 开头来切。
    """
    entries: list[dict] = []
    current: dict | None = None
    for item in lines:
        line = item["text"]
        head = GLOSSARY_HEAD_RE.match(line)
        if head:
            if current:
                entries.append(current)
            current = {
                "word": head.group(1).strip(),
                "partOfSpeech": head.group(2),
                "definition": head.group(3).strip(),
            }
        elif current is not None:
            current["definition"] = f"{current['definition']} {line}".strip()
    if current:
        entries.append(current)

    for entry in entries:
        definition = " ".join(entry["definition"].split())
        ref = GLOSSARY_PAGE_REF_RE.search(definition)
        if ref:
            definition = definition[: ref.start()].strip()
            pages = [int(n) for n in re.findall(r"\d+", ref.group(1))]
            entry["pages"] = pages
        entry["definition"] = definition.rstrip(",;")
    return [e for e in entries if e["definition"]]


def parse_ocr_pages(pages: list[list[dict]]) -> list[dict]:
    """扫描件只给整页文字，不装作有页码和图注。

    OCR 认不出版面层级：页码被并进页眉（`Building a Bridge ¢ Level | 3`），插图线条
    又常被判成大字，硬套结构化那条路只会产出看着像结构、实际错位的数据。
    """
    body: list[dict] = []
    for index, raw in enumerate(pages):
        kept = [
            line["text"]
            for line in raw
            if not looks_like_boilerplate(line["text"])
            and " Level " not in line["text"]
            and not is_ocr_noise(line["text"])
        ]
        if kept:
            body.append({"page": None, "pdfIndex": index, "kind": "ocr", "text": "\n".join(kept), "labels": []})
    return body


def parse_book(pages: list[list[dict]], *, level: str, sequence: int, title: str, source: str) -> dict:
    """把整本书的原始页文字切成 front matter / 正文 / back matter。"""
    joined = "\n".join(line["text"] for page in pages for line in page)
    last_page_text = "\n".join(line["text"] for line in pages[-1]) if pages else ""

    word_count = WORD_COUNT_RE.search(joined)
    grade = GRADE_RE.search(last_page_text) or GRADE_RE.search(joined)
    author = WRITTEN_BY_RE.search(joined)
    illustrator = ILLUSTRATED_BY_RE.search(joined)
    # 封面常把两个署名排在同一行：`Written by A • Illustrated by B`。
    author_name = split_credit(author.group(1)) if author else None
    illustrator_name = split_credit(illustrator.group(1)) if illustrator else None

    body: list[dict] = []
    glossary: list[dict] = []
    book_title: str | None = None
    if source == "ocr":
        body = parse_ocr_pages(pages)
    expected = 3
    pending_number: int | None = None
    for index, raw in enumerate(pages if source != "ocr" else []):
        if not raw:
            continue

        lines, header_title = strip_running_header(raw)
        book_title = book_title or header_title

        number, lines = take_page_number(lines, expected)
        if number is not None:
            expected = number + 1
        if looks_like_boilerplate("\n".join(line["text"] for line in lines)):
            continue

        # 通栏排版的书（正文横跨整个跨页）会把页码单独甩在对开的另一半上，于是
        # 「只有页码的空页」后面跟着「有正文却没页码的页」。把号码交接过去，否则
        # 从这里开始整本书都对不上号，后面全被当成版权页丢掉。
        if number is not None and not lines:
            pending_number = number
            continue
        if number is None:
            if pending_number is None or not lines:
                continue
            number, pending_number = pending_number, None
        else:
            pending_number = None
        if not lines:
            continue

        kind = classify_section(lines)
        if kind:
            lines = lines[1:]
        if kind == "glossary":
            glossary = parse_glossary(lines)

        body_size = body_size_of(lines)
        prose = [line for line in lines if abs(line["size"] - body_size) <= SIZE_TOLERANCE]
        labels = [line for line in lines if abs(line["size"] - body_size) > SIZE_TOLERANCE]
        body.append(
            {
                "page": number,
                "pdfIndex": index,
                "kind": kind or "story",
                "text": "\n".join(line["text"] for line in prose),
                "labels": [line["text"] for line in labels],
            }
        )

    story_words = sum(
        len(WORD_RE.findall(page["text"])) for page in body if page["kind"] in ("story", "ocr")
    )

    return {
        "id": f"{level}{sequence:02d}",
        "level": level,
        "sequence": sequence,
        "title": book_title or title,
        "fileTitle": title,
        "author": author_name,
        "illustrator": illustrator_name,
        "officialWordCount": int(word_count.group(1).replace(",", "")) if word_count else None,
        "grade": grade.group(1) if grade else None,
        "pdfPageCount": len(pages),
        "source": source,
        "storyWordCount": story_words,
        "pages": body,
        "glossary": glossary,
    }


def discover(levels: list[str] | None, limit: int | None) -> list[tuple[Path, str, int, str, bool]]:
    found: list[tuple[Path, str, int, str, bool]] = []
    for directory in sorted(RAZ_DIR.glob("*级别-pdf")):
        level_match = LEVEL_DIR_RE.match(directory.name)
        if not level_match:
            continue
        level = level_match.group(1)
        if levels and level not in levels:
            continue
        files = sorted(directory.glob("*.pdf"))
        if limit:
            files = files[:limit]
        for pdf in files:
            name_match = FILE_NAME_RE.match(pdf.name)
            if not name_match:
                print(f"  文件名不合规，跳过：{pdf.name}", file=sys.stderr)
                continue
            found.append(
                (
                    pdf,
                    name_match.group(1),
                    int(name_match.group(2)),
                    name_match.group(3),
                    bool(BENCHMARK_RE.match(pdf.name)),
                )
            )
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description="抽取 RAZ 分级读物")
    parser.add_argument("--level", nargs="*", help="只处理这些级别，如 E F G")
    parser.add_argument("--limit", type=int, help="每级最多处理几本")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    targets = discover(args.level, args.limit)
    if not targets:
        print("没找到 PDF，检查 raz/ 目录", file=sys.stderr)
        return 1

    books = []
    for pdf, level, sequence, title, benchmark in targets:
        try:
            pages, source = read_pages(pdf)
        except Exception as error:  # noqa: BLE001 - 单本失败不该拖垮全量
            print(f"  读取失败 {pdf.name}: {error}", file=sys.stderr)
            continue
        book = parse_book(pages, level=level, sequence=sequence, title=title, source=source)
        book["file"] = str(pdf.relative_to(ROOT_DIR))
        book["benchmark"] = benchmark
        if benchmark:
            book["id"] = f"{level}定级{sequence}"
        books.append(book)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"bookCount": len(books), "books": books}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    report(books)
    print(f"\n已写入 {display_path(args.output)}")
    return 0


def report(books: list[dict]) -> None:
    """拿封底官方 `Word Count` 对账。

    别指望 100% 吻合：RAZ 自己的口径就不统一——科普书的侧栏、贴士框、编号清单它不算，
    绘本的对话气泡它又算。所以真正的合格线是「官方词数落在 [正文, 正文+图注] 区间内」，
    低于正文说明我们多抽了侧栏（无妨），高于正文+图注才是真漏页。
    """
    text_books = [book for book in books if book["source"] == "text"]
    ocr_books = [book for book in books if book["source"] == "ocr"]

    print(f"{'级别':<5}{'本数':>5}{'正文页':>7}{'词条':>6}{'词数吻合':>9}{'中位偏差':>10}")
    checked = 0
    inside = 0
    for level, group in sorted(group_by_level(text_books).items()):
        deltas = []
        good = 0
        for book in group:
            official = book["officialWordCount"]
            if not official:
                continue
            low = book["storyWordCount"]
            high = low + label_words(book)
            deltas.append((low - official) / official)
            if low * 0.97 <= official <= high * 1.03:
                good += 1
        checked += len(deltas)
        inside += good
        median = sorted(deltas)[len(deltas) // 2] if deltas else 0.0
        story_pages = sum(len([p for p in b["pages"] if p["kind"] == "story"]) for b in group)
        entries = sum(len(b["glossary"]) for b in group)
        print(
            f"{level:<5}{len(group):>5}{story_pages:>7}{entries:>6}"
            f"{f'{good}/{len(deltas)}':>9}{median:>+10.1%}"
        )
    if checked:
        print(f"\n官方词数落在 [正文, 正文+图注] 区间：{inside}/{checked} = {inside / checked:.1%}")

    missed = [
        book
        for book in text_books
        if book["officialWordCount"]
        and book["officialWordCount"] > (book["storyWordCount"] + label_words(book)) * 1.03
    ]
    extra = [
        book
        for book in text_books
        if book["officialWordCount"] and book["officialWordCount"] < book["storyWordCount"] * 0.97
    ]
    print(f"多抽（官方不算侧栏/贴士框，属预期）：{len(extra)} 本")
    print(f"疑似漏抽（官方比正文+图注还多）：{len(missed)} 本")
    for book in sorted(
        missed, key=lambda b: (b["storyWordCount"] - b["officialWordCount"]) / b["officialWordCount"]
    )[:5]:
        official = book["officialWordCount"]
        print(
            f"  {book['id']:<8}{(book['storyWordCount'] - official) / official:+7.0%}"
            f"  正文 {book['storyWordCount']:>4} / 官方 {official:<4} {book['title']}"
        )

    empty = [book["id"] for book in books if not book["pages"]]
    print(f"\n扫描件走 OCR：{len(ocr_books)} 本 {[b['id'] for b in ocr_books]}")
    print(f"一页都没抽到：{len(empty)} 本 {empty}")


def display_path(path: Path) -> str:
    """--output 可以指到仓库外，relative_to 会直接抛异常。"""
    try:
        return str(path.relative_to(ROOT_DIR))
    except ValueError:
        return str(path)


def group_by_level(books: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for book in books:
        grouped.setdefault(book["level"], []).append(book)
    return grouped


def label_words(book: dict) -> int:
    return sum(
        len(WORD_RE.findall(" ".join(page["labels"])))
        for page in book["pages"]
        if page["kind"] == "story"
    )


if __name__ == "__main__":
    raise SystemExit(main())
