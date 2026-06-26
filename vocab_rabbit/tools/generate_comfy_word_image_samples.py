#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import shutil
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORD_LIST_PATH = PROJECT_ROOT / "public/content/words/ket_vocabulary.json"
WORKFLOW_TEMPLATE_PATH = Path(
    "/Users/chujianhe/Documents/Codex/2026-06-22/w/outputs/comfyui-recovered-workflows/z-image-turbo_00001_.api-prompt.json"
)
COMFY_OUTPUT_ROOT = Path("/Users/chujianhe/ComfyUI-Shared/output")
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / "design-output/word-image-generation"


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def get_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def load_words(include_approved: bool) -> list[dict[str, Any]]:
    payload = json.loads(WORD_LIST_PATH.read_text(encoding="utf-8"))
    return [
        word
        for word in payload["words"]
        if word.get("imagePath") and (include_approved or word.get("imageApproved") is not True)
    ]


def build_prompt(word: dict[str, Any]) -> str:
    english = word["english"]
    scene_hints = {
        "grandchild": "a young child happily spending time with an elderly grandmother and grandfather in a sunny park",
        "guest": "a friendly visitor being welcomed at the front door of a cozy home",
        "penfriend": "two children smiling while exchanging plain sealed envelopes near two mailboxes, with no visible writing surfaces",
        "grandma": "a kind elderly woman smiling warmly in a cozy home",
        "surname": "a smiling family standing together for a simple outdoor portrait, suggesting a family group with no signs or writing anywhere",
        "grandpa": "a kind elderly man smiling warmly in a cozy home",
        "teenager": "a cheerful teenage student with a backpack standing outdoors",
        "granny": "a kind elderly woman smiling warmly in a cozy home",
        "boyfriend": "a friendly teenage boy and girl walking together in a park, wholesome and age appropriate",
        "business person": "a professional adult in business clothes carrying a briefcase in a modern office lobby",
        "first name": "a smiling child being gently greeted by a teacher in a classroom, with all papers and boards completely blank",
        "nationality": "children from different countries standing together with colorful blank flags and no symbols",
        "dictionary": "a thick closed reference book beside a magnifying glass and blank pages, with no visible writing",
        "chemistry": "safe colorful laboratory bottles and beakers on a clean table, with no labels or writing",
        "blog": "a child sitting at a laptop with a camera and notebook nearby, sharing a story online, with a completely blank screen",
        "discount": "a happy shopper holding a shopping bag beside two toys and a small pile of coins, with no price tags or signs",
        "February": "a cozy winter scene with snow, warm clothes, and heart decorations, with no calendar or writing",
        "turn on": "a child pressing a plain light switch as a lamp starts glowing, with no words or symbols",
        "half-price": "a shopper choosing between two identical toys, one next to a smaller pile of coins, with no signs or numbers",
        "well known": "a friendly performer on a small stage waving to a happy crowd, with no banners or writing",
        "celebrity": "a famous friendly performer waving to a crowd of smiling fans, with no banners or writing",
        "colleague": "two adults working together at neighboring desks in an office, with blank papers only",
        "headteacher": "a school principal welcoming children at a classroom door, with blank walls and no writing",
        "housewife": "an adult at home folding laundry beside a basket in a cozy room",
        "stomach ache": "a child gently holding their belly while sitting on a sofa, with a caring adult nearby",
        "pleasant": "a calm sunny garden picnic scene with smiling children and flowers",
        "accommodation": "a cozy bedroom in a small guest room with a made bed and suitcase",
        "DVD": "a shiny blank disc beside a small media player, with no letters on the disc",
        "roast": "a roasted meal on a plate with steam rising, no text",
        "main course": "a full dinner plate with vegetables and a central warm dish, no menu or writing",
        "slice": "one clean slice cut from a round fruit on a plate",
        "fried": "golden food cooking in a pan with a little oil and steam",
        "ingredient": "several simple cooking items on a kitchen table, such as eggs, flour, vegetables, and oil, with no labels",
        "biology": "a child observing a leaf and small plant through a magnifying glass, with blank notebook pages",
        "diploma": "a student in graduation clothes holding a rolled blank certificate tied with a ribbon",
        "geography": "children looking at a globe and mountains model, with no map labels or writing",
        "physics": "a simple science table with magnets, balls, and a ramp, with no formulas or writing",
        "grade": "a teacher placing a star sticker on a completely blank paper while a student smiles",
        "vocabulary": "children matching picture cards with blank cards on a table, no letters or words",
        "article": "a person reading a blank newspaper-style page at a table, no visible text",
        "paragraph": "several blank paper strips arranged neatly on a desk with a pencil nearby",
        "review": "a child thoughtfully looking at a toy and giving a thumbs-up, no rating stars with text",
        "hip hop": "a dancer in a colorful outfit doing a street dance pose on a clean stage, no graffiti or signs",
        "classical": "a small orchestra scene with violin and piano in a concert room, no posters",
        "comedy": "a cheerful performer making children laugh on a small stage, no microphone label or signs",
        "hobby": "a child choosing between painting, music, and a toy model at a table, no labels",
        "software": "a clean computer screen showing simple colorful shapes and buttons without any text",
        "by post": "a person putting a plain envelope into a red mailbox with no writing",
        "download": "a simple arrow shape moving from a cloud icon into a laptop, with no letters or numbers",
        "online": "two children smiling at each other through two blank computer screens connected by glowing dots",
        "password": "a key beside a locked tablet with a blank screen, no symbols or numbers",
        "web page": "a laptop showing a blank colorful layout with boxes and pictures, no writing",
        "app": "a tablet showing simple colorful rounded squares with no letters or icons",
        "channel": "a child choosing between several blank video thumbnails on a screen, no writing",
        "chatroom": "children chatting through blank speech bubbles on tablets, no written text",
        "social media": "friends sharing photos on phones shown as blank picture squares, no logos or writing",
        "technology": "a friendly desk with a laptop, tablet, headphones, and small robot toy, all screens blank",
        "wifi": "a family using devices near a router with soft signal waves, no symbols or letters",
        "department store": "a large indoor shop with clothing racks, toys, and shoppers, no signs or labels",
        "pharmacy": "a clean medicine shop counter with bottles and a friendly worker, all labels blank",
        "grocery store (n)": "a small food shop with fruit baskets and shelves, no signs or labels",
        "post office": "a counter with parcels and envelopes being handed over, no signs or writing",
        "guest-house": "a cozy small house with suitcases near the door, no signboard",
        "petrol station": "a car beside a fuel pump with all signs and numbers blank",
        "city centre": "a busy town square with buildings, trees, and people walking, no shop signs",
        "roundabout": "a circular road with small cars going around a planted island, no road signs",
        "crossing": "children safely walking across a zebra crossing with no street signs",
        "shop assistant": "a friendly store worker helping a child choose a toy at a counter, no labels",
        "shopper": "a child carrying shopping bags in a clean store aisle, no signs",
        "customer": "a person politely paying at a shop counter with coins, no receipt text",
        "dollar": "green coins and bills represented as plain money shapes without symbols or numbers",
        "September": "children walking to school in early autumn with orange leaves, no calendar",
        "weekday": "a child going to school in the morning with backpack and lunchbox, no calendar",
        "weekly": "a child doing the same small chore in several simple repeated picture panels, no labels",
        "working hours": "a shop worker opening a store in the morning and leaving in the evening, no clock numbers or signs",
        "monthly": "a plant growing through four simple moon phases, no calendar or writing",
        "centimetre/centimeter (cm)": "a small toy car being measured with a plain ruler that has no numbers",
        "degree": "a thermometer beside a sunny window, with no numbers or scale marks",
        "petrol": "a red fuel can beside a small car, with no labels",
        "tour guide": "a friendly guide leading a small group through a scenic place, with no flag symbols or signs",
        "tourist information centre": "a helpful desk where a traveler asks for directions, with blank maps and no signs",
        "mechanic": "a mechanic fixing a small red car with tools in a clean garage",
        "sightseeing": "a family happily looking at a famous-looking landmark from a viewpoint, no signs",
        "journalist": "a reporter holding a microphone and camera in front of a scene, no logos or writing",
        "secretary": "an office worker organizing blank papers at a desk with a computer",
        "businessman": "an adult man in business clothes carrying a briefcase in an office lobby",
        "businesswoman": "an adult woman in business clothes carrying a folder in an office lobby",
        "occupation": "several adults in different work outfits standing together, no labels",
        "guide": "a friendly person leading children along a forest path, no signs",
        "receptionist": "a friendly person at a front desk greeting a visitor, no signs or forms with writing",
        "career": "a student looking at several adults in different work outfits, no labels",
        "department": "different office teams working in separate open rooms, no signs",
        "identification": "a person showing a blank card with a simple portrait shape, no text or numbers",
        "opinion": "two children looking at the same painting and showing different facial expressions",
        "topic": "a group of children sitting around one object in the middle and discussing it, no words",
        "minus": "a child removing one apple from a small group of apples on a table, no symbols",
        "or": "a child choosing between an apple and a banana, no symbols or words",
        "alright": "a smiling child giving a thumbs-up after a small accident is fixed",
        "good afternoon": "two people greeting each other outside under warm afternoon sunlight",
        "first of all": "a child starting a simple craft project by placing the first block on a table",
        "break down": "a small red car stopped by the road while a mechanic arrives to help",
        "fill in": "a child coloring blank shapes on a worksheet that has no letters or numbers",
        "turn off": "a child pressing a plain light switch as a lamp becomes dark, no symbols",
        "discover": "a child finding a small hidden shell under leaves with a magnifying glass",
        "give back": "a child returning a borrowed toy to a friend with a smile",
        "give somebody a call/ring": "a child happily talking on a plain phone to a friend, no screen text",
        "Guess what?": "a child excitedly whispering surprising news to a friend, no speech bubbles",
        "repeat": "a child stacking the same colored blocks in the same pattern twice",
        "upload": "a photo moving from a camera into a blank laptop screen with an upward arrow shape, no letters",
        "available": "an open empty chair at a table inviting someone to sit, no signs",
        "extinct": "a museum dinosaur skeleton display with children looking, no labels",
        "foreign": "a traveler visiting a different-looking town with unfamiliar architecture, no flags or signs",
        "good-looking": "a neatly dressed smiling person standing confidently, no mirror text",
        "helpful": "a child helping another child pick up dropped books, no writing on the books",
        "left-hand": "a child using their left hand to draw a simple picture, no writing",
        "musical": "a child playing a small guitar with floating music notes only, no words",
        "natural (NOT ARTIFICIAL)": "fresh fruit and flowers in sunlight beside a wooden table, no packaging",
        "relaxing": "a person resting in a hammock under trees with a calm sky",
        "striped": "a sweater with clear colorful stripes laid on a chair, no labels",
    }
    strict_scenes = {
        "grandchild": "a child sitting between two grandparents on grass, plain park background only",
        "headteacher": "a principal standing outdoors and greeting students, no classroom wall, no blackboard, no papers",
        "cooker": "a clean kitchen cooker with a pot on top, plain white background, no labels",
        "accommodation": "a simple bed and suitcase in a cozy room, plain wall, no posters, no writing",
        "blouse": "a plain blouse on a hanger, white background, no tag",
        "earring": "a pair of earrings on a plain surface, no tag, no box text",
        "cafeteria": "children eating lunch at tables in a bright dining room, plain walls, no menu board",
        "onion": "one onion on a plain kitchen table, no labels",
        "waitress": "a smiling waitress carrying a tray, plain cafe background, no signs or menu",
        "grape": "a bunch of grapes on a plain plate, no labels",
        "bean": "green beans in a small bowl, no labels",
        "classmate": "two schoolchildren sitting together and smiling, plain background, no books or papers with writing",
        "college": "a young student with backpack walking by a simple campus building, no signs",
        "schoolchild": "a schoolchild with backpack standing outside, plain background, no signs",
        "guidebook": "a closed green travel book beside a compass and small suitcase, no title or text",
        "review": "a child giving thumbs up beside a toy, plain background, no rating marks",
        "painter": "a painter painting a simple flower on a blank canvas with no letters",
        "photography": "a child holding a camera in a park, no posters, no text",
        "dancer": "a dancer posing on a clean stage, no poster, no spotlight signs",
        "comedy": "children laughing at a funny performer, plain stage, no banners",
        "hobby": "a child painting a toy model at a table, no papers with writing",
        "download": "a simple cloud and arrow moving toward a blank laptop screen, no letters",
        "shop assistant": "a shop worker handing a toy to a child at a counter, no price tags, no signs",
        "shopper": "a shopper holding bags in a plain store aisle, no signs",
        "zebra": "a zebra standing on grass, no background signs",
        "environment": "a clean earth-shaped globe with trees and plants around it, no words",
        "September": "children walking to school with autumn leaves, no calendar, no writing",
        "weekday": "a child walking to school on a normal morning, no calendar, no labels",
        "petrol": "a red fuel can beside a small toy car, no labels, no numbers",
        "sightseeing": "a family looking at a scenic landmark from a viewpoint, no signs",
        "department": "several office workers in separate plain rooms, no signs, no labels",
        "alright": "a smiling child giving a thumbs up, plain background, no speech bubble",
        "first of all": "a child placing the first wooden block on a table, no numbers, no labels",
        "give back": "a child returning a toy to a friend, plain background, no speech bubble",
        "attractive": "a neat colorful garden scene with flowers and sunlight, no people holding signs",
    }
    scene_hints.update(strict_scenes)
    scene = scene_hints.get(english, f"a simple real-life scene that clearly represents {english}")
    return (
        f"Create a standalone storybook illustration: {scene}. "
        "Use a centered subject, simple clean background, bright natural colors, soft friendly style, safe for children. "
        "Scene only, full image illustration. Use plain blank surfaces. Avoid any object that could contain writing."
    )


def build_negative_prompt() -> str:
    return (
        "text, words, letters, numbers, Chinese characters, English letters, caption, title, label, sign, "
        "poster, card, worksheet, book cover, page layout, interface, screen text, watermark, logo, border, frame, speech bubble, typography"
    )


def prepare_workflow(
    template: dict[str, Any],
    word: dict[str, Any],
    width: int,
    height: int,
    seed: int,
    filename_prefix: str,
) -> dict[str, Any]:
    workflow = json.loads(json.dumps(template))
    positive_clip_ref: list[Any] | None = None
    for node in workflow.values():
        class_type = node.get("class_type")
        inputs = node.get("inputs", {})
        if class_type == "CLIPTextEncode" and "text" in inputs:
            inputs["text"] = build_prompt(word)
            positive_clip_ref = inputs.get("clip")
        elif class_type in {"EmptySD3LatentImage", "EmptyLatentImage"}:
            inputs["width"] = width
            inputs["height"] = height
            inputs["batch_size"] = 1
        elif class_type == "KSampler":
            inputs["seed"] = seed
            inputs["negative"] = ["vocab_negative_prompt", 0]
        elif class_type == "SaveImage":
            inputs["filename_prefix"] = filename_prefix
    if positive_clip_ref is None:
        raise RuntimeError("No CLIPTextEncode node with a clip input found in workflow template")
    workflow["vocab_negative_prompt"] = {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": build_negative_prompt(),
            "clip": positive_clip_ref,
        },
    }
    return workflow


def queue_and_wait(comfy_url: str, workflow: dict[str, Any], client_id: str, timeout: int) -> dict[str, Any]:
    response = post_json(f"{comfy_url}/prompt", {"prompt": workflow, "client_id": client_id})
    prompt_id = response["prompt_id"]
    started_at = time.time()

    while time.time() - started_at < timeout:
        history = get_json(f"{comfy_url}/history/{prompt_id}")
        if prompt_id in history:
            item = history[prompt_id]
            if item.get("status", {}).get("status_str") == "error":
                raise RuntimeError(json.dumps(item.get("status"), ensure_ascii=False))
            return item
        time.sleep(1.5)

    raise TimeoutError(f"Timed out waiting for ComfyUI prompt {prompt_id}")


def output_images_from_history(history_item: dict[str, Any]) -> list[Path]:
    paths: list[Path] = []
    for output in history_item.get("outputs", {}).values():
        for image in output.get("images", []):
            filename = image["filename"]
            subfolder = image.get("subfolder") or ""
            paths.append(COMFY_OUTPUT_ROOT / subfolder / filename)
    return paths


def make_contact_sheet(records: list[dict[str, Any]], output_path: Path, with_labels: bool) -> None:
    thumb_size = 180
    label_height = 56 if with_labels else 0
    columns = 5 if with_labels else 10
    row_height = thumb_size + label_height
    rows = (len(records) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * thumb_size, rows * row_height), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for index, record in enumerate(records):
        x = (index % columns) * thumb_size
        y = (index // columns) * row_height
        with Image.open(record["samplePath"]) as image:
            image = image.convert("RGB")
            image.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS)
            ox = x + (thumb_size - image.width) // 2
            oy = y + (thumb_size - image.height) // 2
            sheet.paste(image, (ox, oy))

        if with_labels:
            label = f"{index + 1}. {record['english']}\n{record['wordId']}"
            draw.multiline_text((x + 6, y + thumb_size + 6), label, fill=(30, 30, 30), font=font, spacing=3)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, quality=92)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate sample word images through local ComfyUI.")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--word-ids", nargs="*", help="Generate specific word ids instead of offset/limit selection.")
    parser.add_argument("--allow-approved", action="store_true", help="Allow regenerating words that are already imageApproved.")
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=512)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--comfy-url", default="http://127.0.0.1:8188")
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()

    template = json.loads(WORKFLOW_TEMPLATE_PATH.read_text(encoding="utf-8"))
    missing_words = load_words(args.allow_approved)
    if args.word_ids:
        by_id = {word["id"]: word for word in missing_words}
        selected_words = [by_id[word_id] for word_id in args.word_ids if word_id in by_id]
        missing_ids = [word_id for word_id in args.word_ids if word_id not in by_id]
        if missing_ids:
            raise SystemExit(f"Unknown or already-approved word ids: {', '.join(missing_ids)}")
    else:
        selected_words = missing_words[args.offset : args.offset + args.limit]
    run_id = datetime.now().strftime("comfy-sample-%Y%m%d-%H%M%S")
    run_dir = args.output_root / run_id
    sample_dir = run_dir / "samples"
    sample_dir.mkdir(parents=True, exist_ok=True)

    client_id = f"vocab-rabbit-{uuid.uuid4()}"
    records: list[dict[str, Any]] = []

    for index, word in enumerate(selected_words, start=1):
        word_id = word["id"]
        seed = int(time.time() * 1000) % 1_000_000_000_000 + index
        filename_prefix = f"vocab_rabbit_samples/{word_id}"
        workflow = prepare_workflow(template, word, args.width, args.height, seed, filename_prefix)
        print(f"[{index}/{len(selected_words)}] queue {word_id} {word['english']} seed={seed}", flush=True)
        history_item = queue_and_wait(args.comfy_url, workflow, client_id, args.timeout)
        output_paths = output_images_from_history(history_item)
        if not output_paths:
            raise RuntimeError(f"No output image for {word_id}")

        source_path = output_paths[0]
        sample_path = sample_dir / f"{word_id}.png"
        shutil.copy2(source_path, sample_path)
        records.append(
            {
                "wordId": word_id,
                "english": word["english"],
                "chinese": word.get("chinese", ""),
                "category": word.get("category", ""),
                "seed": seed,
                "prompt": build_prompt(word),
                "comfyOutputPath": str(source_path),
                "samplePath": str(sample_path),
            }
        )

    manifest = {
        "meta": {
            "runId": run_id,
            "workflowTemplate": str(WORKFLOW_TEMPLATE_PATH),
            "comfyUrl": args.comfy_url,
            "width": args.width,
            "height": args.height,
        },
        "records": records,
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    make_contact_sheet(records, run_dir / "contact-sheet.jpg", with_labels=True)
    make_contact_sheet(records, run_dir / "contact-sheet-clean.jpg", with_labels=False)

    print(f"run_dir={run_dir}")
    print(f"contact_sheet={run_dir / 'contact-sheet.jpg'}")
    print(f"contact_sheet_clean={run_dir / 'contact-sheet-clean.jpg'}")


if __name__ == "__main__":
    main()
