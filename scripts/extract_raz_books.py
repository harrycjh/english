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
import inspect
import statistics
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
SENTENCES_PATH = RAZ_DIR / "extracted" / "raz-sentences.json"

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
# 整页只有图解标签或表格的页（金球场平面图、龙卷风剖面图、球员数据表）根本没有正文，
# 而 body_size_of 是「从大到小取第一个够长的字号」，只能把 10pt 的标签当成正文交出去。
# 所以再按整本书的正文字号设一条下限：低于它的一律算图注，这一页不产出正文。
BODY_SIZE_FLOOR_RATIO = 0.8
CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]+")
PRODUCTION_NOTE_RE = re.compile(r"<\s*(?:PHOTO|IMAGE|ART|ILLO|TK)\b", re.IGNORECASE)
URL_RE = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
# 句末标点后跟空白才算断句；缩写的句点会先由 split_sentences 临时保护。
SENTENCE_SPLIT_RE = re.compile(
    r"(?<=[.!?])[\"\u201d\u2019']?\s+(?=[\"\u201c(]?\s*[A-Z0-9])"
)
ABBREVIATION_RE = re.compile(
    r"\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|No)\.|(?:\b[A-Z]\.){2,}|\b[A-Z]\."
)
ABBREVIATION_PERIOD_SENTINEL = "\ue000"
BULLET_BREAK_SENTINEL = "\ue001"
# RAZ 的开引号后面常带一个空格（`\u201c I see`），断句的前瞻和成品例句都不该带着它。
# 只收弯引号：直单引号 `'` 在 `the birds' nests` 里是撇号，去掉后面的空格会粘住下一个词。
OPEN_QUOTE_SPACE_RE = re.compile(r"([\u201c\u2018])\s+")
SENTENCE_END_RE = re.compile(r"[.!?][\"\u201d\u2019']?$")
SENTENCE_START_RE = re.compile(r"^[\"\u201c\u2018(]?[A-Z0-9]")
MIN_SENTENCE_WORDS = 3
# 项目符号清单（材料表、安全须知）整块没有句末标点，会被拼成一个几十词的"句子"。
# 拆开之后，`Reptiles have dry, scaly skin.` 这种完整句留下，`two rubber bands` 这种碎片
# 自然被"必须有句末标点"筛掉。
BULLET_RE = re.compile(r"\s*[\u2022\u25aa\u25cf\u2023]\s*")
BULLET_PREFIX_RE = re.compile(r"^[\u2022\u25aa\u25cf\u2023]\s*")
LIST_BREAK_RE = re.compile(
    rf"\s*(?:[\u2022\u25aa\u25cf\u2023]|{BULLET_BREAK_SENTINEL})\s*"
)
HEADING_LOWERCASE_WORDS = frozenset(
    {"a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"}
)
BARE_NUMBER_RE = re.compile(r"(?<![\w.])\d{1,2}(?![\w.])")
EMPTY_QUOTE_RE = re.compile(r"[\u201c\u2018]\s*(?=[\u201d\u2019]|$)")
# 目录标题有时被装饰性圆点包着：`\u2022\u2022\u2022 Table of Contents \u2022\u2022 \u2022`
DECORATION_RE = re.compile(r"^[\s\u2022\u25aa\u25cf\u2023.\u2013\u2014-]+|[\s\u2022\u25aa\u25cf\u2023\u2013\u2014-]+$")
OCR_DPI = 300
OCR_BODY_HEIGHT_RATIO = 0.72
OCR_TEXT_PAGE_RATIO = 0.3


def split_sentences(text: str) -> list[str]:
    protected = ABBREVIATION_RE.sub(
        lambda match: match.group(0).replace(".", ABBREVIATION_PERIOD_SENTINEL),
        text,
    )
    sentences = [
        sentence.replace(ABBREVIATION_PERIOD_SENTINEL, ".")
        for sentence in SENTENCE_SPLIT_RE.split(protected)
    ]
    merged: list[str] = []
    for sentence in sentences:
        if (
            merged
            and re.match(r"^[a-z]", sentence)
        ):
            merged[-1] = f"{merged[-1]} {sentence}"
        else:
            merged.append(sentence)
    return merged


def looks_like_heading_line(line: str) -> bool:
    if SENTENCE_END_RE.search(line):
        return False
    words = WORD_RE.findall(line)
    return (
        2 <= len(words) <= 10
        and all(word.lower() in HEADING_LOWERCASE_WORDS or word[0].isupper() for word in words)
    )

# 正文里夹带的功能页，单独打标签，不算故事正文词数。
SECTION_MARKERS = {
    "table of contents": "toc",
    "contents": "toc",
    "glossary": "glossary",
    "index": "index",
    "focus question": "focus-question",
    "word work": "word-work",
    "writing and art": "activity",
    "explore more": "activity",
    "explore further": "activity",
    "did you know?": "activity",
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


def is_production_note(text: str) -> bool:
    """`<PHOTO: Aerial photo of soccer pitch…>` 是排版批注，成书时该被图片替掉却漏在了
    文字层里（全库只有 H60 一处）。它读起来像正文，绝不能进例句。"""
    return text.lstrip().startswith("<") or bool(PRODUCTION_NOTE_RE.search(text))


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


def drop_production_notes(lines: list[dict]) -> list[dict]:
    """批注会折成好几行，`<` 开头那行之后一直丢到出现 `>` 为止。"""
    kept: list[dict] = []
    inside = False
    for line in lines:
        if not inside and is_production_note(line["text"]):
            inside = ">" not in line["text"]
            continue
        if inside:
            inside = ">" not in line["text"]
            continue
        kept.append(line)
    return kept


def split_section(lines: list[dict]) -> tuple[str | None, list[dict], list[dict]]:
    """按功能页标题（词汇表/目录/索引…）把一页切成两段，返回 (标签, 标题前, 标题后)。

    不能只看头两行：跨页排版会把「故事最后一段 + 词汇表开头」拼进同一页，标题落在页尾
    （K26、L23）；也有页首先排了一条图注、标题被挤到第三行的（L54 的目录）。
    切开之后，标题之前算正文，标题之后归功能页——这样混排页的正文不丢，词汇表也不会
    被当成正文喂进例句。
    """
    for index, line in enumerate(lines):
        kind = SECTION_MARKERS.get(DECORATION_RE.sub("", line["text"]).rstrip(":").casefold())
        if kind:
            return kind, lines[:index], lines[index + 1 :]
    return None, lines, []


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


def book_body_size(pages: list[list[dict]]) -> float:
    """整本书的正文字号——取各页正文字号的中位数，少数图解页拉不动它。"""
    sizes = [body_size_of(page) for page in pages if page]
    sizes = [size for size in sizes if size]
    return statistics.median(sizes) if sizes else 0.0


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
    floor = book_body_size(pages) * BODY_SIZE_FLOOR_RATIO
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
        lines = drop_production_notes(lines)

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

        body_size = body_size_of(lines)
        if body_size < floor:
            body_size = None  # 整页都是图注/表格，没有正文
        section, head, tail = split_section(lines)
        if section == "glossary":
            glossary = parse_glossary(tail)

        # 标题前没有正文字号的内容，说明整页都是功能页；否则是混排页，按正文收。
        def is_prose(line: dict) -> bool:
            return body_size is not None and abs(line["size"] - body_size) <= SIZE_TOLERANCE

        head_prose = [line for line in head if is_prose(line)]
        kind = section if section and not head_prose else None
        content = tail if kind else head

        prose = [line for line in content if is_prose(line)]
        labels = [line for line in content if not is_prose(line)]
        body.append(
            {
                "page": number,
                "pdfIndex": index,
                "kind": kind or "story",
                "bodySize": body_size,
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
        "bodySize": book_body_size(pages),
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
    parser.add_argument("--sentences", type=Path, default=SENTENCES_PATH)
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

    pool = write_sentences(books, args.sentences)

    report(books)
    print(f"\n已写入 {display_path(args.output)}")
    print(
        f"例句池 {display_path(args.sentences)}："
        f"{pool['bookCount']} 本 / {pool['sentenceCount']} 句（只来自正文）"
    )

    wiring = audit_wiring() + audit_body_sizes(books)
    for problem in wiring[:20]:
        print(f"接线守卫：{problem}", file=sys.stderr)

    leaks = audit_sentences(pool)
    if wiring:
        return 1
    if leaks:
        print(f"例句池混进了非正文内容 {len(leaks)} 处：", file=sys.stderr)
        for name, book_id, page, text in leaks[:20]:
            print(f"  [{name}] {book_id} p{page}  {text}", file=sys.stderr)
        return 1
    print("例句池守卫：未发现非正文内容 ✓")
    return 0


def collect_sentences(book: dict) -> list[dict]:
    """把一本书的正文切成句子——这是唯一允许拿去做例句的东西。

    只读 `kind == "story"` 页的 `text`：图注（`labels`）、词汇表、目录、索引、以及
    没有版面层级可言的扫描件（`kind == "ocr"`）都在这一步之前就被排除，不是靠调用方
    自觉绕开。句子会跨页续写，所以先按页序拼成一整篇再断句，并记下每句**起始**的页码。
    """
    chunks: list[str] = []
    starts: list[tuple[int, int]] = []  # (拼接后的字符下标, 页码)
    cursor = 0
    for page in book["pages"]:
        if page["kind"] != "story" or not page["text"]:
            continue
        lines: list[str] = []
        in_bullet = False
        previous_line: str | None = None
        for raw_line in page["text"].split("\n"):
            line = raw_line.strip()
            if not line:
                continue
            if BULLET_PREFIX_RE.match(line):
                in_bullet = True
            elif in_bullet and re.match(r"^[A-Z]", line):
                lines.append(BULLET_BREAK_SENTINEL)
                in_bullet = False
            elif (
                previous_line
                and looks_like_heading_line(previous_line)
                and re.match(r"^[A-Z]", line)
            ):
                lines.append(BULLET_BREAK_SENTINEL)
            lines.append(line)
            previous_line = line
        text = " ".join(lines).replace(
            f" {BULLET_BREAK_SENTINEL} ", BULLET_BREAK_SENTINEL
        )
        text = OPEN_QUOTE_SPACE_RE.sub(r"\1", text)
        if not text:
            continue
        starts.append((cursor, page["page"]))
        chunks.append(text)
        cursor += len(text) + 1

    joined = " ".join(chunks)
    sentences: list[dict] = []
    offset = 0
    for raw in split_sentences(joined):
        start = joined.find(raw, offset)
        if start >= 0:
            offset = start + len(raw)
        page = next((num for pos, num in reversed(starts) if pos <= start), None)
        for chunk in LIST_BREAK_RE.split(raw):
            for piece in split_sentences(chunk):
                text = accept_sentence(piece)
                if text:
                    sentences.append({"page": page, "text": text})
    return sentences


def accept_sentence(raw: str) -> str | None:
    """够格当例句就返回清理后的句子，否则 None。"""
    text = EMPTY_QUOTE_RE.sub("", raw).strip()
    # 结尾没有句末标点 = 半句话（页面截断、清单碎片、图注短语），不是完整句子。
    if not text or not SENTENCE_END_RE.search(text):
        return None
    if not SENTENCE_START_RE.search(text):
        return None
    if URL_RE.search(text):
        return None
    # 编号材料表（`1 Newspaper 2 Sponge 3 Wire hanger …`）读起来像句子，其实是插图清单。
    words = [word for word in re.findall(r"[A-Za-z’\'\-]+", text) if len(word) > 1]
    if len(words) < MIN_SENTENCE_WORDS:
        return None
    return text


def write_sentences(books: list[dict], path: Path) -> dict:
    pool = []
    for book in books:
        sentences = collect_sentences(book)
        if not sentences:
            continue
        pool.append(
            {
                "id": book["id"],
                "level": book["level"],
                "title": book["title"],
                "sentences": sentences,
            }
        )
    payload = {
        "bookCount": len(pool),
        "sentenceCount": sum(len(b["sentences"]) for b in pool),
        "books": pool,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return payload


# 例句里绝不该出现的东西：网址、版权页、分级对照、署名、功能页标题、目录点线、
# 词汇表词条、页码回指、控制字符、排版批注、项目符号清单。
LEAK_PATTERNS = {
    "网址": re.compile(r"https?://|www\."),
    "版权": re.compile(r"©|copyright|all rights reserved", re.IGNORECASE),
    "分级对照": re.compile(r"fountas|pinnell|reading recovery|lexile", re.IGNORECASE),
    "署名": re.compile(r"^(written by|illustrated by|photo credits?)\b", re.IGNORECASE),
    "功能页标题": re.compile(
        r"^(glossary|index|table of contents|explore more|word work|focus question)\b",
        re.IGNORECASE,
    ),
    "目录点线": re.compile(r"\.{4,}"),
    "词汇表词条": re.compile(r"\((n|v|adj|adv|prep|pron|conj|pl|interj)\.\)"),
    "页码回指": re.compile(r"\(pp?\.\s*\d"),
    "控制字符": re.compile(r"[\x00-\x08\x0b-\x1f\x7f]"),
    "排版批注": re.compile(r"<"),
    "版权页样板": re.compile(r"readinga-?z|learninga-?z", re.IGNORECASE),
    "项目符号": re.compile(r"[\u2022\u25aa\u25cf\u2023]"),
    "小写清单碎片": re.compile(r"^[a-z]"),
}


def audit_body_sizes(books: list[dict]) -> list[str]:
    """输出侧的不变量：正文页只要出了正文，字号就得落在整本书的正文区间里。

    图解页、数据表页整页没有正文，`body_size_of`（从大到小取第一个够长的字号）只能把
    10pt 的标签当正文交出来，而这些标签不含任何样板词，样板守卫是哑的。所以直接盯着
    产物：字号明显小于全书正文的页，正文必须是空的。
    """
    problems = []
    for book in books:
        floor = (book.get("bodySize") or 0) * BODY_SIZE_FLOOR_RATIO
        if not floor:
            continue
        for page in book["pages"]:
            size = page.get("bodySize")
            if page["kind"] == "story" and page["text"] and size and size < floor:
                problems.append(
                    f"{book['id']} p{page['page']} 正文字号 {size} 低于全书 "
                    f"{book['bodySize']} 的下限 —— 这页多半只是图注或表格"
                )
    return problems


def audit_wiring() -> list[str]:
    """接线守卫：例句只准读正文页的 `text`。

    图注本身就是通顺的完整句子（`A supercell thunderstorm moves across Nebraska in 2004.`），
    任何样板正则都认不出它不是正文。所以这一类只能盯着代码本身：一旦有人把 `labels`
    或别的 kind 接进例句，样板守卫是哑的，这里必须响。
    """
    # 只认真正的取值写法，别被文档字符串里提到的 labels 绊倒。
    source = re.sub(r'"""[\s\S]*?"""', "", inspect.getsource(collect_sentences))
    problems = []
    if re.search(r"""\[\s*["']labels""", source):
        problems.append("collect_sentences 读到了 labels —— 图注不是正文，不能进例句")
    if 'page["kind"] != "story"' not in source:
        problems.append("collect_sentences 没有把非正文页挡在外面")
    return problems


def audit_sentences(pool: dict) -> list[tuple[str, str, int | None, str]]:
    """例句池的守卫：非正文的东西一旦漏进来，这里必须叫。

    抽取规则是靠字号和版面猜出来的，换一批 PDF 就可能猜错。所以每次抽完都重跑一遍，
    而不是把"当时查过了"当成保证。
    """
    leaks = []
    for book in pool["books"]:
        for sentence in book["sentences"]:
            for name, pattern in LEAK_PATTERNS.items():
                if pattern.search(sentence["text"]):
                    leaks.append((name, book["id"], sentence["page"], sentence["text"][:90]))
    return leaks


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
