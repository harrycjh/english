#!/usr/bin/env python3

from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
import time
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen


SOURCE_URL = "https://www.cambridgeenglish.org/Images/506886-a2-key-2020-vocabulary-list.pdf"
SOURCE_VERSION = "August 2025"
EXPECTED_HEADWORD_COUNT = 1695

ROOT_DIR = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT_DIR / "KET_A2_official_vocabulary_list.pdf"
CSV_PATH = ROOT_DIR / "KET_A2_official_headwords.csv"
MD_PATH = ROOT_DIR / "KET_A2_official_headwords.md"
BILINGUAL_CSV_PATH = ROOT_DIR / "KET_A2_official_headwords_zh.csv"
BILINGUAL_MD_PATH = ROOT_DIR / "KET_A2_official_headwords_zh.md"
THEMED_MD_PATH = ROOT_DIR / "KET_A2_official_themed_wordlist_zh.md"
CHILD_FRIENDLY_MD_PATH = ROOT_DIR / "KET_A2_child_friendly_themed_wordlist_zh.md"
TRANSLATION_CACHE_PATH = ROOT_DIR / "KET_A2_translation_cache.json"
OXFORD_TREE_EXTRACTED_DIR = ROOT_DIR / "oxford-tree" / "extracted"

TOPIC_HEADINGS = [
    "Appliances",
    "Clothes and Accessories",
    "Colours",
    "Communication and Technology",
    "Documents and Texts",
    "Education",
    "Entertainment and Media",
    "Family and Friends",
    "Food and Drink",
    "Health, Medicine and Exercise",
    "Hobbies and Leisure",
    "House and Home",
    "Measurements",
    "Personal Feelings, Opinions and Experiences (adjectives)",
    "Places: Buildings",
    "Places: Countryside",
    "Places: Town and City",
    "Services",
    "Shopping",
    "Sport",
    "The Natural World",
    "Time",
    "Travel and Transport",
    "Weather",
    "Work and Jobs",
]

ANIMAL_WORDS = {
    "animal",
    "bear",
    "beetle",
    "bird",
    "butterfly",
    "camel",
    "cat",
    "cow",
    "creature",
    "crocodile",
    "dinosaur",
    "dog",
    "dolphin",
    "donkey",
    "duck",
    "eagle",
    "elephant",
    "frog",
    "giraffe",
    "goat",
    "hippo",
    "horse",
    "insect",
    "jellyfish",
    "kangaroo",
    "kitten",
    "lion",
    "lizard",
    "monkey",
    "nest",
    "octopus",
    "panda",
    "parrot",
    "pet",
    "penguin",
    "polar bear",
    "puppy",
    "rabbit",
    "shark",
    "sheep",
    "snail",
    "snake",
    "spider",
    "swan",
    "tail",
    "tiger",
    "tortoise",
    "whale",
    "wildlife",
    "wing",
    "zebra",
}

CALENDAR_WORDS = {
    "April",
    "August",
    "December",
    "February",
    "Friday",
    "January",
    "July",
    "June",
    "March",
    "May",
    "Monday",
    "November",
    "October",
    "Saturday",
    "September",
    "Sunday",
    "Thursday",
    "Tuesday",
    "Wednesday",
}

PEOPLE_IDENTITY_WORDS = {
    "boyfriend",
    "business person",
    "celebrity",
    "colleague",
    "first name",
    "girlfriend",
    "headteacher",
    "housewife",
    "man",
    "name",
    "nationality",
}

HOUSE_EXTRA_WORDS = {
    "accommodation",
    "alarm clock",
    "bottom",
    "cabinet",
    "ceiling",
    "closet",
    "fan",
    "front",
    "ground",
    "mug",
    "sheet",
    "stairs",
    "table",
    "top",
    "wall",
    "wardrobe",
    "washing-up",
}

APPLIANCE_EXTRA_WORDS = {
    "battery",
    "CD",
    "DVD",
    "equipment",
}

FOOD_EXTRA_WORDS = {
    "bean",
    "fast food",
    "ingredient",
    "mango",
    "recipe",
    "spoon",
    "supper",
}

HEALTH_EXTRA_WORDS = {
    "beard",
    "headache",
    "mouth",
    "toe",
}

SCHOOL_EXTRA_WORDS = {
    "grade",
    "idea",
    "memory",
    "mistake",
    "number",
    "pen",
    "pencil",
    "pencil case",
    "question",
    "reading",
    "schoolchild",
    "sentence",
    "spelling",
    "timetable",
    "vocabulary",
    "word",
    "writing",
}

DOCUMENT_EXTRA_WORDS = {
    "album",
    "advert",
    "details",
    "document",
    "folder",
    "guidebook",
    "ID",
    "ID card",
    "invitation",
    "line",
    "list",
    "mail",
    "notice",
    "page",
    "paragraph",
    "poster",
    "review",
    "sign",
    "stamp",
    "title",
}

ENTERTAINMENT_EXTRA_WORDS = {
    "band",
    "balloon",
    "circus",
    "clown",
    "comedy",
    "jazz",
    "model",
    "performance (ENTERTAINMENT)",
    "rap",
    "story",
    "tune (music)",
    "violin",
}

HOBBY_EXTRA_WORDS = {
    "climbing",
    "cooking",
    "dancing",
    "ice skating",
    "kite",
    "painting",
    "running",
    "singing",
    "skateboarding",
    "skating",
    "surfing",
    "walking",
}

COMMUNICATION_EXTRA_WORDS = {
    "app",
    "blog",
    "channel",
    "chatroom",
    "headphones",
    "IT",
    "link (technology)",
    "microphone",
    "program",
    "selfie",
    "social media",
    "speaker",
    "technology",
    "text message",
    "wifi",
}

BUILDING_EXTRA_WORDS = {
    "court",
    "gallery",
    "gym",
}

TOWN_EXTRA_WORDS = {
    "capital",
    "centre/center",
    "city",
    "crossing",
    "directions",
}

COUNTRYSIDE_EXTRA_WORDS = {
    "coast",
}

SHOPPING_EXTRA_WORDS = {
    "discount",
    "money",
    "pair",
    "pence",
    "sale",
    "size",
}

NATURE_EXTRA_WORDS = {
    "environment",
    "nature",
}

TIME_EXTRA_WORDS = {
    "age",
    "beginning",
    "birth",
    "future",
    "holiday",
    "lunchtime",
    "midday",
    "season",
}

TRAVEL_EXTRA_WORDS = {
    "aeroplane",
    "harbour",
    "lorry",
    "police car",
    "port",
    "scooter",
    "sightseeing",
    "site",
    "transport",
}

WORK_EXTRA_WORDS = {
    "career",
    "department",
    "scientist",
    "trainer",
}

MODAL_VERB_WORDS = {
    "cannot",
    "could",
    "have got to",
    "have to",
    "may",
    "might",
    "must",
    "shall",
    "should",
    "will ('ll)",
    "would",
}

ABSTRACT_CONCEPT_WORDS = {
    "activity",
    "advice",
    "character",
    "difference",
    "event",
    "example",
    "experience",
    "fact",
    "feelings",
    "identification",
    "invention",
    "life",
    "noise",
    "opinion",
    "pity",
    "place",
    "reason",
    "shame",
    "sort",
    "stuff",
    "success",
    "surprise",
    "thing",
    "topic",
    "trouble",
    "type",
    "variety",
    "view",
}

TOY_GIFT_WORDS = {
    "doll",
    "gift",
    "make-up",
    "perfume",
    "present",
    "puzzle",
    "scissors",
    "toy",
}

CHILD_FRIENDLY_OFFICIAL_CATEGORIES = [
    ("家人和朋友", ["Family and Friends"], {"kid(s)"}),
    ("人物身份和称呼", [], PEOPLE_IDENTITY_WORDS),
    ("身体、健康和锻炼", ["Health, Medicine and Exercise"], HEALTH_EXTRA_WORDS),
    ("感受和性格", ["Personal Feelings, Opinions and Experiences (adjectives)"], set()),
    ("房子和家具", ["House and Home"], HOUSE_EXTRA_WORDS),
    ("家用电器和电子设备", ["Appliances"], APPLIANCE_EXTRA_WORDS),
    ("衣服和配饰", ["Clothes and Accessories"], set()),
    ("颜色", ["Colours"], set()),
    ("食物和饮料", ["Food and Drink"], FOOD_EXTRA_WORDS),
    ("学校和学习", ["Education"], SCHOOL_EXTRA_WORDS),
    ("书本、证件和文字", ["Documents and Texts"], DOCUMENT_EXTRA_WORDS),
    ("娱乐和表演", ["Entertainment and Media"], ENTERTAINMENT_EXTRA_WORDS),
    ("爱好和休闲", ["Hobbies and Leisure"], HOBBY_EXTRA_WORDS),
    ("通讯、网络和数码", ["Communication and Technology"], COMMUNICATION_EXTRA_WORDS),
    ("运动和比赛", ["Sport"], set()),
    ("建筑和公共地点", ["Places: Buildings", "Services"], BUILDING_EXTRA_WORDS),
    ("城镇街道和城市", ["Places: Town and City"], TOWN_EXTRA_WORDS),
    ("乡村和自然地点", ["Places: Countryside"], COUNTRYSIDE_EXTRA_WORDS),
    ("购物买东西", ["Shopping"], SHOPPING_EXTRA_WORDS),
    ("动物和昆虫", [], ANIMAL_WORDS),
    ("自然世界", ["The Natural World"], NATURE_EXTRA_WORDS),
    ("天气", ["Weather"], set()),
    ("月份和星期", [], CALENDAR_WORDS),
    ("时间和日期", ["Time", "Measurements"], TIME_EXTRA_WORDS),
    ("出行和交通", ["Travel and Transport"], TRAVEL_EXTRA_WORDS),
    ("工作和职业", ["Work and Jobs"], WORK_EXTRA_WORDS),
]

NUMBER_WORDS = {
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
    "hundred",
    "thousand",
    "first",
    "second",
    "third",
}

QUANTITY_WORDS = {
    "a few",
    "a little",
    "all",
    "another",
    "any",
    "both",
    "each",
    "enough",
    "every",
    "few",
    "half",
    "less",
    "little",
    "lots / a lot",
    "many",
    "more",
    "most",
    "much",
    "no",
    "none",
    "same",
    "some",
}

RESPONSE_WORDS = {
    "all right/alright",
    "goodbye",
    "hello",
    "hi",
    "no",
    "of course (not)",
    "OK/okay",
    "please",
    "sorry",
    "thank you",
    "thanks",
    "wow",
    "Yeah!",
    "yes",
}

TIME_FREQUENCY_ADVERBS = {
    "afterwards",
    "again",
    "already",
    "always",
    "early",
    "ever",
    "first",
    "just",
    "late",
    "later",
    "never",
    "now",
    "often",
    "once",
    "since",
    "sometimes",
    "soon",
    "still",
    "then",
    "today",
    "tomorrow",
    "tonight",
    "twice",
    "usually",
    "yesterday",
    "yet",
}

COMMUNICATION_THINKING_VERBS = {
    "answer",
    "ask",
    "call",
    "chat",
    "choose",
    "describe",
    "explain",
    "hear",
    "know",
    "learn",
    "listen (to)",
    "mean",
    "message",
    "phone",
    "read",
    "remember",
    "say",
    "show",
    "speak",
    "study",
    "teach",
    "tell",
    "text",
    "think",
    "understand",
    "watch",
    "write",
}

POS_LIKE_MARKERS = {
    "n",
    "v",
    "adj",
    "adv",
    "det",
    "pron",
    "prep",
    "conj",
    "exclam",
    "mv",
    "av",
    "phr v",
}

HEADWORD_TRANSLATION_OVERRIDES = {
    "a/an": "一个；一",
    "all right/alright": "好的；没问题",
    "as well (as)": "也；以及",
    "at / @": "在；@符号",
    "barbecue/barbeque": "烧烤",
    "blond(e)": "金发的；金发的人",
    "cafe/café": "咖啡馆",
    "centre/center": "中心",
    "centimetre/centimeter (cm)": "厘米",
    "design (PLANNING)": "设计；规划",
    "design (PROCESS)": "设计过程",
    "design (DRAWING)": "设计图；图案设计",
    "examination/exam": "考试",
    "follow (SOCIAL MEDIA)": "关注",
    "give somebody a call/ring": "给某人打电话",
    "gram(me)": "克",
    "grand(d)ad": "爷爷；外公",
    "grocery store (n)": "食品杂货店",
    "kid(s)": "小孩",
    "laptop (computer)": "笔记本电脑",
    "link (technology)": "链接",
    "listen (to)": "听",
    "lots / a lot": "许多；很多",
    "make sure (that)": "确保",
    "mobile (phone)": "手机",
    "mom (n)": "妈妈",
    "mum (n)": "妈妈",
    "natural (NOT ARTIFICIAL)": "天然的",
    "of course (not)": "当然；当然不",
    "OK/okay": "好；可以",
    "PC (personal computer)": "个人电脑；电脑",
    "perform (ENTERTAIN)": "表演",
    "performance (ENTERTAINMENT)": "演出；表演",
    "photo(graph)": "照片",
    "poor thing/you": "真可怜；可怜的你",
    "pound (£)": "英镑",
    "prefer / would prefer": "更喜欢；宁愿",
    "railway (station)": "铁路；火车站",
    "relax (become happy)": "放松",
    "share (digitally)": "分享",
    "smart (stylish)": "时髦的",
    "smart (clever)": "聪明的",
    "television (TV)": "电视",
    "train (transitive and intransitive)": "训练",
    "training (transitive and intransitive)": "训练；培训",
    "tune (music)": "曲调",
    "v/versus": "对；对阵",
    "will ('ll)": "将；会",
    "yog(h)urt": "酸奶",
}

ENTRY_TRANSLATION_OVERRIDES = {
    ("a.m.", "adv"): "上午",
    ("advanced", "adj"): "高级的",
    ("app", "n"): "应用程序",
    ("book", "n & v"): "书；预订",
    ("business person", "n"): "商务人士",
    ("board", "n"): "板；牌",
    ("boot", "n"): "靴子",
    ("boil", "v"): "煮沸",
    ("boiled", "adj"): "煮熟的",
    ("channel", "n"): "频道",
    ("break", "n & v"): "休息；打破",
    ("call", "n & v"): "打电话；叫作",
    ("cap", "n"): "帽子",
    ("case", "n"): "箱子；盒子",
    ("CD", "n"): "CD；光盘",
    ("CD player", "n"): "CD播放器",
    ("change", "v & n"): "改变；零钱",
    ("clock", "n"): "时钟",
    ("close", "adj & v"): "近的；关闭",
    ("cold", "adj & n"): "冷的；感冒",
    ("conversation", "n"): "谈话；对话",
    ("cook", "n & v"): "厨师；做饭",
    ("cooker", "n"): "炉灶",
    ("costume", "n"): "戏服；服装",
    ("cousin", "n"): "堂／表兄弟姐妹",
    ("cream", "adj & n"): "奶油；奶油色的",
    ("digital", "adj"): "数码的",
    ("Dr", "n"): "医生；博士",
    ("dress", "n & v"): "连衣裙；穿衣服",
    ("fair", "adj"): "公平的；相当好的",
    ("fit", "adj"): "健康的；合适的",
    ("flat", "n"): "公寓",
    ("fog", "n"): "雾",
    ("grandchild", "n"): "孙辈",
    ("granddaughter", "n"): "孙女；外孙女",
    ("grandson", "n"): "孙子；外孙",
    ("guy", "n"): "小伙子；家伙",
    ("ID", "n"): "身份证明",
    ("ID card", "n"): "身份证",
    ("IT", "n"): "信息技术",
    ("kind", "adj & n"): "友好的；种类",
    ("left", "adj, adv & n"): "左边；左边的",
    ("light", "n & adj"): "灯；光；轻的；浅色的",
    ("mark", "n"): "分数；标记",
    ("March", "n"): "三月",
    ("message", "n, v"): "信息；发消息",
    ("May", "n"): "五月",
    ("Miss", "n"): "小姐",
    ("mouse", "n"): "鼠标",
    ("Ms", "n"): "女士",
    ("net", "n"): "网络；网",
    ("note", "n & v"): "笔记；记下",
    ("open", "adj & v"): "开着的；打开",
    ("orange", "adj & n"): "橙色；橙子",
    ("order", "n & v"): "顺序；点餐；订购",
    ("park", "n & v"): "公园；停车",
    ("p.m.", "adv"): "下午",
    ("past", "prep & n"): "过；过去",
    ("PC (personal computer)", "n"): "个人电脑",
    ("phone", "v & n"): "打电话；电话",
    ("player", "n"): "选手；运动员",
    ("present", "n"): "礼物",
    ("rest", "n & v"): "休息；其余部分",
    ("right", "n, adj & adv"): "右边；正确的",
    ("ring", "n & v"): "戒指；响铃；打电话",
    ("roast", "v & adj"): "烤；烤的",
    ("ruler", "n"): "尺子",
    ("show", "v & n"): "表演；给……看",
    ("studies", "n pl"): "学习；学业",
    ("subject", "n"): "学科；科目",
    ("suit", "n"): "套装；西装",
    ("swimming", "n"): "游泳",
    ("tablet", "n"): "平板电脑",
    ("text", "n & v"): "短信；发短信",
    ("video", "n"): "视频；录像",
    ("visit", "v"): "拜访；参观",
    ("visit", "n"): "拜访；参观",
    ("watch", "n & v"): "手表；观看",
    ("weekly", "adj & adv"): "每周的；每周",
}


def ensure_tool(name: str) -> None:
    result = subprocess.run(["/usr/bin/which", name], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Missing required command: {name}")


def ensure_pdf() -> None:
    if PDF_PATH.exists() and PDF_PATH.stat().st_size > 0:
        return

    result = subprocess.run(
        ["curl", "-L", "-o", str(PDF_PATH), SOURCE_URL],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to download PDF: {result.stderr.strip()}")


def extract_pdf_text() -> str:
    result = subprocess.run(
        ["pdftotext", str(PDF_PATH), "-"],
        capture_output=True,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Failed to extract PDF text: {stderr}")
    return result.stdout.decode("utf-8", errors="replace")


def extract_pdf_layout_text() -> str:
    result = subprocess.run(
        ["pdftotext", "-layout", str(PDF_PATH), "-"],
        capture_output=True,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Failed to extract PDF layout text: {stderr}")
    return result.stdout.decode("utf-8", errors="replace")


def get_main_wordlist_lines(pdf_text: str) -> list[str]:
    lines = pdf_text.splitlines()
    main_end = next(i for i, line in enumerate(lines) if line.strip() == "Appendix 1")
    return [line.strip() for line in lines[:main_end]]


def parse_headwords(lines: list[str]) -> list[tuple[str, str]]:
    pattern = re.compile(r"^(?P<headword>[^•©].*?)\s\((?P<pos>[A-Za-z ,&./]+)\)$")
    ignore_exact = {
        "A2 Key and Key for Schools",
        "Vocabulary List",
        "Key and Key for Schools Vocabulary List",
        "A2 Key and Key for",
        "Schools",
        "A2 Key",
        "A2 Key for Schools",
        "Summary of points to be noted",
        "Introduction to the A2 Key Vocabulary List",
    }

    entries: list[tuple[str, str]] = []
    for line in lines:
        if not line or line in ignore_exact:
            continue
        if line.startswith(("•", "© UCLES", "Page ")):
            continue
        if re.fullmatch(r"[A-Z]", line):
            continue

        match = pattern.match(line)
        if match:
            headword = match.group("headword").strip()
            pos = match.group("pos").strip()
            entries.append((headword, pos))

    if len(entries) != EXPECTED_HEADWORD_COUNT:
        raise RuntimeError(
            f"Unexpected headword count: {len(entries)} != {EXPECTED_HEADWORD_COUNT}"
        )

    if entries[0][0] != "a/an" or entries[-1][0] != "zoo":
        raise RuntimeError(
            f"Unexpected boundary entries: first={entries[0][0]!r}, last={entries[-1][0]!r}"
        )

    return entries


def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_alias(text: str) -> str:
    text = strip_accents(text)
    text = text.replace("’", "'").replace("‘", "'")
    text = text.lower()
    text = text.replace("&", " and ")
    text = text.replace("@", " at ")
    text = re.sub(r"[()]", " ", text)
    text = text.replace("/", " ")
    text = re.sub(r"[^a-z0-9' ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def expand_optional_spellings(text: str) -> set[str]:
    results = {text}
    pattern = re.compile(r"(?<!\s)([A-Za-z]*)\(([A-Za-z]+)\)([A-Za-z]*)(?!\s)")

    changed = True
    while changed:
        changed = False
        current = list(results)
        for item in current:
            match = pattern.search(item)
            if not match:
                continue
            changed = True
            prefix, middle, suffix = match.groups()
            start, end = match.span()
            without_middle = f"{item[:start]}{prefix}{suffix}{item[end:]}"
            with_middle = f"{item[:start]}{prefix}{middle}{suffix}{item[end:]}"
            results.discard(item)
            results.add(without_middle)
            results.add(with_middle)

    return {item.strip() for item in results if item.strip()}


def is_pos_like(text: str) -> bool:
    lowered = text.strip().lower()
    return lowered in POS_LIKE_MARKERS


def generate_aliases(text: str) -> set[str]:
    raw_candidates: set[str] = set()
    queue = list(expand_optional_spellings(text.strip()))

    while queue:
        item = queue.pop()
        if not item:
            continue
        if item in raw_candidates:
            continue
        raw_candidates.add(item)

        if "/" in item:
            queue.extend(part.strip() for part in re.split(r"\s*/\s*", item) if part.strip())

        if "(" in item and ")" in item:
            for content in re.findall(r"\(([^)]+)\)", item):
                content = content.strip()
                if not content:
                    continue
                removed = re.sub(r"\s*\([^)]*\)", "", item).strip()
                if removed:
                    queue.append(removed)
                if not is_pos_like(content):
                    inserted = re.sub(r"\(([^)]+)\)", r" \1 ", item)
                    inserted = re.sub(r"\s+", " ", inserted).strip()
                    if inserted:
                        queue.append(inserted)
                    queue.append(content)

    return {normalize_alias(candidate) for candidate in raw_candidates if normalize_alias(candidate)}


def build_headword_alias_maps(entries: list[tuple[str, str]]) -> tuple[dict[str, list[int]], dict[str, list[int]]]:
    exact_map: dict[str, list[int]] = defaultdict(list)
    alias_map: dict[str, list[int]] = defaultdict(list)
    for index, (headword, _pos) in enumerate(entries):
        exact_map[normalize_alias(headword)].append(index)
        for alias in generate_aliases(headword):
            alias_map[alias].append(index)
    return exact_map, alias_map


def generate_topic_item_candidates(text: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def add(candidate: str) -> None:
        normalized = normalize_alias(candidate)
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    stripped = text.strip()
    add(stripped)

    without_parentheses = re.sub(r"\s*\([^)]*\)", "", stripped).strip()
    if without_parentheses and without_parentheses != stripped:
        add(without_parentheses)

    inserted_parenthetical = re.sub(r"\(([^)]+)\)", r" \1 ", stripped)
    inserted_parenthetical = re.sub(r"\s+", " ", inserted_parenthetical).strip()
    if inserted_parenthetical and inserted_parenthetical != stripped:
        add(inserted_parenthetical)

    if "/" in stripped and "(" not in stripped:
        for part in re.split(r"\s*/\s*", stripped):
            add(part)

    for variant in expand_optional_spellings(stripped):
        add(variant)

    return candidates


def parse_topic_lists(
    pdf_layout_text: str,
    exact_map: dict[str, list[int]],
    alias_map: dict[str, list[int]],
) -> tuple[dict[str, list[int]], dict[str, list[str]]]:
    lines = pdf_layout_text.splitlines()
    appendix_start = next(i for i, line in enumerate(lines) if line.strip() == "Appendix 2")
    current_topic: str | None = None
    raw_topics: dict[str, list[str]] = {topic: [] for topic in TOPIC_HEADINGS}

    ignored_exact = {
        "Appendix 2",
        "Topic Lists",
        "Vocabulary List",
        "A2 Key and Key for",
        "Key and Key for Schools",
        "Schools",
    }

    for raw_line in lines[appendix_start + 1 :]:
        line = raw_line.strip()
        if not line:
            continue
        if line in ignored_exact:
            continue
        if line.startswith("© UCLES") or line.startswith("Page "):
            continue
        if line in TOPIC_HEADINGS:
            current_topic = line
            continue
        if current_topic is None:
            continue

        cells = [cell.strip() for cell in re.split(r"\s{2,}", raw_line) if cell.strip()]
        if not cells:
            continue
        raw_topics[current_topic].extend(cells)

    topic_to_indices: dict[str, list[int]] = {topic: [] for topic in TOPIC_HEADINGS}
    unmatched_items: dict[str, list[str]] = {topic: [] for topic in TOPIC_HEADINGS}

    for topic in TOPIC_HEADINGS:
        seen: set[int] = set()
        for item in raw_topics[topic]:
            matched: list[int] = []

            exact_matches = exact_map.get(normalize_alias(item), [])
            if exact_matches:
                matched.extend(exact_matches)
            else:
                for alias in generate_topic_item_candidates(item):
                    matched.extend(alias_map.get(alias, []))

            ordered_matches: list[int] = []
            for entry_index in matched:
                if entry_index in seen:
                    continue
                seen.add(entry_index)
                ordered_matches.append(entry_index)

            if ordered_matches:
                topic_to_indices[topic].extend(ordered_matches)
            else:
                unmatched_items[topic].append(item)

    unmatched_items = {topic: items for topic, items in unmatched_items.items() if items}
    return topic_to_indices, unmatched_items


def load_translation_cache() -> dict[str, str]:
    if not TRANSLATION_CACHE_PATH.exists():
        return {}
    return json.loads(TRANSLATION_CACHE_PATH.read_text(encoding="utf-8"))


def save_translation_cache(cache: dict[str, str]) -> None:
    TRANSLATION_CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def build_translation_queries(headword: str) -> list[str]:
    if headword in HEADWORD_TRANSLATION_OVERRIDES:
        return []

    expanded = expand_optional_spellings(headword)
    queries: list[str] = []

    for item in sorted(expanded):
        if "/" in item:
            queries.extend(part.strip() for part in re.split(r"\s*/\s*", item) if part.strip())
            continue

        if "(" in item and ")" in item:
            parts = re.findall(r"\(([^)]+)\)", item)
            if parts and all(is_pos_like(part.strip()) for part in parts):
                without_parenthetical = re.sub(r"\s*\([^)]*\)", "", item).strip()
                if without_parenthetical:
                    queries.append(without_parenthetical)
                continue

            inserted = re.sub(r"\(([^)]+)\)", r" \1 ", item)
            inserted = re.sub(r"\s+", " ", inserted).strip()
            if inserted:
                queries.append(inserted)
            continue

        queries.append(item)

    cleaned: list[str] = []
    seen: set[str] = set()
    for query in queries or [headword]:
        query = query.strip()
        if not query or query in seen:
            continue
        seen.add(query)
        cleaned.append(query)
    return cleaned


def fetch_google_translation(query: str) -> str:
    url = (
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q="
        + quote(query)
    )
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8", errors="replace"))
    return "".join(part[0] for part in payload[0] if part and part[0]).strip()


def clean_translation(text: str) -> str:
    text = text.strip()
    text = text.replace("（ ", "（").replace(" ）", "）")
    text = re.sub(r"\s*/\s*", " / ", text)
    text = re.sub(r"\s+", " ", text)
    text = text.strip(" ;；")
    return text


def translate_entry(headword: str, pos: str, cache: dict[str, str]) -> str:
    override = ENTRY_TRANSLATION_OVERRIDES.get((headword, pos))
    if override:
        return override

    headword_override = HEADWORD_TRANSLATION_OVERRIDES.get(headword)
    if headword_override:
        return headword_override

    cache_key = f"{headword}\t{pos}"
    if cache_key in cache:
        return cache[cache_key]

    translations: list[str] = []
    seen: set[str] = set()
    for query in build_translation_queries(headword):
        for attempt in range(3):
            try:
                translated = clean_translation(fetch_google_translation(query))
                if translated and translated not in seen:
                    seen.add(translated)
                    translations.append(translated)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(1 + attempt)

    combined = "；".join(translations) if translations else headword
    cache[cache_key] = combined
    return combined


def build_translations(entries: list[tuple[str, str]]) -> list[tuple[str, str, str]]:
    cache = load_translation_cache()
    pending = [(headword, pos) for headword, pos in entries if f"{headword}\t{pos}" not in cache and (headword, pos) not in ENTRY_TRANSLATION_OVERRIDES and headword not in HEADWORD_TRANSLATION_OVERRIDES]

    if pending:
        with ThreadPoolExecutor(max_workers=8) as executor:
            future_map = {
                executor.submit(translate_entry, headword, pos, cache.copy()): (headword, pos)
                for headword, pos in pending
            }
            for future in as_completed(future_map):
                headword, pos = future_map[future]
                cache[f"{headword}\t{pos}"] = future.result()
        save_translation_cache(cache)

    translated_entries: list[tuple[str, str, str]] = []
    for headword, pos in entries:
        translated_entries.append((headword, pos, translate_entry(headword, pos, cache)))

    save_translation_cache(cache)
    return translated_entries


def write_csv(entries: list[tuple[str, str]]) -> None:
    with CSV_PATH.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["headword", "part_of_speech", "source_version", "source_url"])
        for headword, pos in entries:
            writer.writerow([headword, pos, SOURCE_VERSION, SOURCE_URL])


def write_markdown(entries: list[tuple[str, str]]) -> None:
    grouped: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for headword, pos in entries:
        initial = headword[0].upper()
        if not initial.isalpha():
            initial = "#"
        grouped[initial].append((headword, pos))

    lines = [
        "# KET A2 官方完整词表",
        "",
        "说明：",
        f"- 来源：剑桥官网 A2 Key vocabulary list，版本 {SOURCE_VERSION}。",
        f"- 原始链接：{SOURCE_URL}",
        f"- 本文件仅整理官方主词条和词性，共 {len(entries)} 条。",
        "- 未收录官方 PDF 中的示例句和附录主题词，避免重复和冗长。",
        "",
    ]

    for initial in sorted(grouped):
        lines.append(f"## {initial}")
        lines.append("")
        lines.append("| 单词 | 词性 |")
        lines.append("| --- | --- |")
        for headword, pos in grouped[initial]:
            lines.append(f"| {headword} | {pos} |")
        lines.append("")

    MD_PATH.write_text("\n".join(lines), encoding="utf-8")


def write_bilingual_csv(entries: list[tuple[str, str, str]]) -> None:
    with BILINGUAL_CSV_PATH.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(
            [
                "headword",
                "part_of_speech",
                "chinese_gloss",
                "source_version",
                "source_url",
            ]
        )
        for headword, pos, chinese in entries:
            writer.writerow([headword, pos, chinese, SOURCE_VERSION, SOURCE_URL])


def write_bilingual_markdown(entries: list[tuple[str, str, str]]) -> None:
    grouped: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    for headword, pos, chinese in entries:
        initial = headword[0].upper()
        if not initial.isalpha():
            initial = "#"
        grouped[initial].append((headword, pos, chinese))

    lines = [
        "# KET A2 官方完整词表（中英对照）",
        "",
        "说明：",
        f"- 来源：剑桥官网 A2 Key vocabulary list，版本 {SOURCE_VERSION}。",
        f"- 原始链接：{SOURCE_URL}",
        f"- 本文件保留官方主词条和词性，共 {len(entries)} 条。",
        "- 中文释义为机翻基础上的规则清洗版，适合背诵和快速查阅。",
        "",
    ]

    for initial in sorted(grouped):
        lines.append(f"## {initial}")
        lines.append("")
        lines.append("| 单词 | 词性 | 中文释义 |")
        lines.append("| --- | --- | --- |")
        for headword, pos, chinese in grouped[initial]:
            lines.append(f"| {headword} | {pos} | {chinese} |")
        lines.append("")

    BILINGUAL_MD_PATH.write_text("\n".join(lines), encoding="utf-8")


def write_themed_markdown(
    entries: list[tuple[str, str, str]],
    topic_to_indices: dict[str, list[int]],
    unmatched_items: dict[str, list[str]],
) -> None:
    covered_indices = {index for indices in topic_to_indices.values() for index in indices}
    remaining_indices = [index for index in range(len(entries)) if index not in covered_indices]

    lines = [
        "# KET A2 官方主题词表（中英对照）",
        "",
        "说明：",
        f"- 来源：剑桥官网 A2 Key vocabulary list Appendix 2 Topic Lists，版本 {SOURCE_VERSION}。",
        f"- 原始链接：{SOURCE_URL}",
        f"- 官方主词条总数：{len(entries)}。",
        f"- 已映射到官方主题中的主词条：{len(covered_indices)}。",
        f"- 未出现在官方主题附录中的其他主词条：{len(remaining_indices)}。",
        "- 同一个词可能出现在多个官方主题中；未纳入官方主题的词统一收在末尾。",
        "",
    ]

    for topic in TOPIC_HEADINGS:
        lines.append(f"## {topic}")
        lines.append("")
        lines.append("| 单词 | 词性 | 中文释义 |")
        lines.append("| --- | --- | --- |")
        for index in topic_to_indices[topic]:
            headword, pos, chinese = entries[index]
            lines.append(f"| {headword} | {pos} | {chinese} |")
        if topic in unmatched_items:
            lines.append("")
            lines.append("未精确映射到主词条的官方主题项：")
            lines.append(", ".join(unmatched_items[topic]))
        lines.append("")

    lines.append("## 其他未纳入官方主题的主词条")
    lines.append("")
    lines.append("| 单词 | 词性 | 中文释义 |")
    lines.append("| --- | --- | --- |")
    for index in remaining_indices:
        headword, pos, chinese = entries[index]
        lines.append(f"| {headword} | {pos} | {chinese} |")
    lines.append("")

    THEMED_MD_PATH.write_text("\n".join(lines), encoding="utf-8")


def pos_has(pos: str, token: str) -> bool:
    return re.search(rf"\b{re.escape(token.lower())}\b", pos.lower()) is not None


def collect_unique_topic_indices(
    entries: list[tuple[str, str, str]],
    topic_to_indices: dict[str, list[int]],
    used_keys: set[tuple[str, str]],
    topic_name: str,
) -> list[int]:
    collected: list[int] = []
    for index in topic_to_indices.get(topic_name, []):
        headword, pos, _chinese = entries[index]
        key = (headword, pos)
        if key in used_keys:
            continue
        used_keys.add(key)
        collected.append(index)
    return collected


def split_remaining_indices(
    remaining_indices: list[int],
    entries: list[tuple[str, str, str]],
    predicate,
) -> tuple[list[int], list[int]]:
    matched: list[int] = []
    unmatched: list[int] = []
    for index in remaining_indices:
        headword, pos, chinese = entries[index]
        if predicate(headword, pos, chinese):
            matched.append(index)
        else:
            unmatched.append(index)
    return matched, unmatched


def normalize_oxford_lookup_headword(headword: str) -> str | None:
    cleaned = re.sub(r"\s*\([^)]*\)", "", headword).strip()
    if "/" in cleaned:
        cleaned = cleaned.split("/", 1)[0].strip()
    cleaned = cleaned.replace("’", "'")
    if not cleaned:
        return None
    return cleaned.lower()


def parse_oxford_book_metadata(book_text: str, level_text: str, fallback_name: str) -> tuple[int, int, str]:
    level_match = re.search(r"(\d+)", level_text)
    level_num = int(level_match.group(1)) if level_match else 999

    book_match = re.match(r"(?P<level>\d+)-(?P<book>\d+)\.?\s*(?P<title>.*)", book_text)
    if book_match:
        book_num = int(book_match.group("book"))
        title = book_match.group("title").strip() or fallback_name
    else:
        book_num = 999
        title = fallback_name

    return level_num, book_num, title


def format_oxford_occurrence(level_num: int, book_num: int, page_num: int | None, title: str) -> str:
    page_text = str(page_num) if page_num is not None else "?"
    return f"Level {level_num},{book_num},{page_text}"


def select_preferred_oxford_occurrences(
    hits: list[tuple[int, int, int, str, str]],
    max_hits: int,
) -> list[str]:
    if not hits:
        return []

    selected: list[tuple[int, int, int, str, str]] = [hits[0]]
    first_book_key = hits[0][3]

    for hit in hits[1:]:
        if hit[3] != first_book_key:
            selected.append(hit)
            break

    if len(selected) < max_hits:
        for hit in hits[1:]:
            if hit not in selected:
                selected.append(hit)
            if len(selected) >= max_hits:
                break

    return [
        format_oxford_occurrence(level_num, book_num, page_num, title)
        for level_num, book_num, page_num, _book_key, title in selected[:max_hits]
    ]


def build_oxford_occurrence_map(headwords: set[str], max_hits: int = 2) -> dict[str, list[str]]:
    normalized_headwords: dict[str, str] = {}
    patterns: dict[str, re.Pattern[str]] = {}
    for headword in headwords:
        normalized = normalize_oxford_lookup_headword(headword)
        if not normalized:
            continue
        normalized_headwords[headword] = normalized
        patterns[headword] = re.compile(
            rf"(?<![A-Za-z]){re.escape(normalized)}(?![A-Za-z])",
            re.IGNORECASE,
        )

    raw_hits: dict[str, list[tuple[int, int, int, str, str]]] = {
        headword: [] for headword in normalized_headwords
    }
    if not patterns or not OXFORD_TREE_EXTRACTED_DIR.exists():
        return {headword: [] for headword in normalized_headwords}

    book_records: list[tuple[int, int, str, dict]] = []
    for path in OXFORD_TREE_EXTRACTED_DIR.rglob("*.json"):
        obj = json.loads(path.read_text(encoding="utf-8"))
        records = obj if isinstance(obj, list) else [obj]
        for record in records:
            if not isinstance(record, dict):
                continue
            book_text = str(record.get("book", path.stem))
            level_text = str(record.get("level", path.parent.name))
            level_num, book_num, title = parse_oxford_book_metadata(book_text, level_text, path.stem)
            book_records.append((level_num, book_num, f"{book_text} {title}".lower(), record))

    for level_num, book_num, _sort_key, record in sorted(book_records, key=lambda item: (item[0], item[1], item[2])):
        title = parse_oxford_book_metadata(
            str(record.get("book", "")),
            str(record.get("level", "")),
            "",
        )[2]
        book_key = f"{level_num}:{book_num}:{title.lower()}"
        pages = sorted(record.get("pages", []), key=lambda page: page.get("page_number", 999))
        for page in pages:
            if not isinstance(page, dict):
                continue
            page_number = page.get("page_number")
            text = str(page.get("text", ""))
            for headword, pattern in patterns.items():
                if pattern.search(text):
                    raw_hits[headword].append(
                        (level_num, book_num, page_number if isinstance(page_number, int) else 999, book_key, title)
                    )

    return {
        headword: select_preferred_oxford_occurrences(hits, max_hits)
        for headword, hits in raw_hits.items()
    }


def write_child_friendly_markdown(
    entries: list[tuple[str, str, str]],
    topic_to_indices: dict[str, list[int]],
) -> int:
    used_keys: set[tuple[str, str]] = set()
    sections: list[tuple[str, list[int]]] = []

    for label, topic_names, extra_headwords in CHILD_FRIENDLY_OFFICIAL_CATEGORIES:
        collected: list[int] = []
        for topic_name in topic_names:
            collected.extend(collect_unique_topic_indices(entries, topic_to_indices, used_keys, topic_name))

        remaining_indices = [
            index
            for index, (headword, pos, _chinese) in enumerate(entries)
            if (headword, pos) not in used_keys
        ]
        matched, _unmatched = split_remaining_indices(
            remaining_indices,
            entries,
            lambda headword, pos, chinese: headword in extra_headwords,
        )
        for index in matched:
            headword, pos, _chinese = entries[index]
            used_keys.add((headword, pos))
        collected.extend(matched)

        if collected:
            sections.append((label, collected))

    remaining_indices = [
        index
        for index, (headword, pos, _chinese) in enumerate(entries)
        if (headword, pos) not in used_keys
    ]

    extra_categories = [
        ("情态动词和语气", lambda headword, pos, chinese: headword in MODAL_VERB_WORDS),
        ("抽象概念和想法", lambda headword, pos, chinese: headword in ABSTRACT_CONCEPT_WORDS),
        ("玩具、礼物和小物件", lambda headword, pos, chinese: headword in TOY_GIFT_WORDS),
        ("数字和顺序词", lambda headword, pos, chinese: headword in NUMBER_WORDS),
        ("数量和多少", lambda headword, pos, chinese: headword in QUANTITY_WORDS),
        ("人称和指代词", lambda headword, pos, chinese: pos_has(pos, "pron")),
        (
            "冠词和限定词",
            lambda headword, pos, chinese: pos_has(pos, "det") and headword not in QUANTITY_WORDS,
        ),
        (
            "介词和方向词",
            lambda headword, pos, chinese: pos_has(pos, "prep") or pos_has(pos, "prep phr"),
        ),
        ("连词和句子连接词", lambda headword, pos, chinese: pos_has(pos, "conj")),
        (
            "感叹词和回应语",
            lambda headword, pos, chinese: pos_has(pos, "exclam") or headword in RESPONSE_WORDS,
        ),
        (
            "时间和频率副词",
            lambda headword, pos, chinese: pos_has(pos, "adv") and headword in TIME_FREQUENCY_ADVERBS,
        ),
        (
            "方式和程度副词",
            lambda headword, pos, chinese: pos_has(pos, "adv") and headword not in TIME_FREQUENCY_ADVERBS,
        ),
        ("常用短语动词", lambda headword, pos, chinese: pos_has(pos, "phr v")),
        (
            "说话和思考动词",
            lambda headword, pos, chinese: pos_has(pos, "v") and headword in COMMUNICATION_THINKING_VERBS,
        ),
        ("常用动作动词", lambda headword, pos, chinese: pos_has(pos, "v")),
        ("常见形容词", lambda headword, pos, chinese: pos_has(pos, "adj")),
        (
            "其他常用词",
            lambda headword, pos, chinese: True,
        ),
    ]

    for label, predicate in extra_categories:
        matched, remaining_indices = split_remaining_indices(remaining_indices, entries, predicate)
        if matched:
            sections.append((label, matched))

    section_count = len(sections)
    if section_count < 30 or section_count > 50:
        raise RuntimeError(f"Unexpected child-friendly category count: {section_count}")

    all_headwords = {headword for headword, _pos, _chinese in entries}
    oxford_occurrences = build_oxford_occurrence_map(all_headwords)

    lines = [
        "# KET A2 儿童友好主题词表（中英对照）",
        "",
        "说明：",
        f"- 来源：剑桥官网 A2 Key vocabulary list 与 Appendix 2 Topic Lists，版本 {SOURCE_VERSION}。",
        f"- 本版将全部主词条拆成 {section_count} 个更细的儿童友好类别。",
        "- 先按生活场景分主题，再把剩余功能词按数字、代词、介词、副词、动词、形容词等继续拆分。",
        "- 每个单词只保留在一个最合适的类别里，便于孩子按小主题记忆。",
        "- 牛津树首次/第二次出现列：基于 oxford-tree/extracted 文本回填，按 Level 从低到高查找，第二次出现优先选不同书。",
        "",
    ]

    for label, indices in sections:
        lines.append(f"## {label}")
        lines.append("")
        lines.append("| 单词 | 词性 | 中文释义 | 牛津树第一次出现 | 牛津树第二次出现 |")
        lines.append("| --- | --- | --- | --- | --- |")
        for index in indices:
            headword, pos, chinese = entries[index]
            occurrence_values = oxford_occurrences.get(headword, [])
            first_occurrence = occurrence_values[0] if len(occurrence_values) > 0 else ""
            second_occurrence = occurrence_values[1] if len(occurrence_values) > 1 else ""
            lines.append(
                f"| {headword} | {pos} | {chinese} | {first_occurrence} | {second_occurrence} |"
            )
        lines.append("")

    CHILD_FRIENDLY_MD_PATH.write_text("\n".join(lines), encoding="utf-8")
    return section_count


def main() -> int:
    try:
        ensure_tool("curl")
        ensure_tool("pdftotext")
        ensure_pdf()
        pdf_text = extract_pdf_text()
        pdf_layout_text = extract_pdf_layout_text()
        lines = get_main_wordlist_lines(pdf_text)
        entries = parse_headwords(lines)
        topic_exact_map, topic_alias_map = build_headword_alias_maps(entries)
        topic_to_indices, unmatched_items = parse_topic_lists(
            pdf_layout_text,
            topic_exact_map,
            topic_alias_map,
        )
        translated_entries = build_translations(entries)
        child_section_count = write_child_friendly_markdown(translated_entries, topic_to_indices)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    covered_indices = {index for indices in topic_to_indices.values() for index in indices}
    print(
        "Generated "
        f"{CHILD_FRIENDLY_MD_PATH.name} with {len(entries)} headwords. "
        f"Official topics cover {len(covered_indices)} headwords. "
        f"Child-friendly categories: {child_section_count}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())