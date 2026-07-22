#!/usr/bin/env python3
"""Generate factual life-photo captions through the local LM Studio Qwen API."""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import io
import json
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageFile, ImageOps

from cluster_life_photos import DEFAULT_ROOT, load_json, load_path_mappings, resolve_path


MODEL = "qwen/qwen3-vl-30b"
PROMPT_VERSION = "life-photo-factual-v1"
DEFAULT_ENDPOINT = "http://127.0.0.1:1234/v1/chat/completions"
DEFAULT_OUTPUT = Path("design-output/photo-word-linking/captions/qwen-pilot-300.jsonl")
ImageFile.LOAD_TRUNCATED_IMAGES = True


class ResponseTruncatedError(ValueError):
    """The model stopped before returning a complete JSON response."""


SYSTEM_PROMPT = """You describe private family photos for an English vocabulary learning app.
Report only facts clearly visible in the image. Do not infer names, relationships, exact locations,
nationality, occupations, motives, events outside the frame, or hidden emotions. Do not identify
people. Vocabulary is unrestricted. Return JSON only and follow the supplied schema exactly."""


USER_PROMPT = """Describe this photo accurately.

Requirements:
1. captionZh: natural Chinese, no more than 100 Chinese characters.
2. captionEn: natural KET-friendly English, no more than 60 words.
3. List all clearly visible people, objects, actions, attributes and scene terms using concise English lemmas.
4. Use singular dictionary forms where natural, such as child instead of children and wear instead of wearing.
5. Put uncertain observations in uncertain instead of presenting them as facts.
6. confidence is a number from 0 to 1 measuring confidence in the visible-fact description.
7. Do not force the terms to match any vocabulary list.
"""


JSON_SCHEMA = {
    "name": "life_photo_caption",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "captionZh": {"type": "string"},
            "captionEn": {"type": "string"},
            "people": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
            "objects": {"type": "array", "items": {"type": "string"}, "maxItems": 20},
            "actions": {"type": "array", "items": {"type": "string"}, "maxItems": 12},
            "attributes": {"type": "array", "items": {"type": "string"}, "maxItems": 12},
            "scene": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
            "visibleText": {"type": "array", "items": {"type": "string"}, "maxItems": 10},
            "uncertain": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": [
            "captionZh",
            "captionEn",
            "people",
            "objects",
            "actions",
            "attributes",
            "scene",
            "visibleText",
            "uncertain",
            "confidence",
        ],
        "additionalProperties": False,
    },
}


def image_data_url(path: Path, max_side: int = 1024) -> str:
    with Image.open(path) as image:
        image.draft("RGB", (max_side, max_side))
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, "JPEG", quality=88, optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return "data:image/jpeg;base64," + encoded


def parse_json_content(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```")
        if text.endswith("```"):
            text = text[:-3]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        if is_truncation_error(error):
            raise ResponseTruncatedError(str(error)) from error
        raise


def is_truncation_error(error: BaseException | str) -> bool:
    if isinstance(error, ResponseTruncatedError):
        return True
    message = str(error).lower()
    if "finish_reason=length" in message or "unterminated string" in message:
        return True
    if isinstance(error, json.JSONDecodeError):
        document = error.doc.rstrip()
        return bool(document) and error.pos >= len(document) - 1
    return False


def validate_caption(payload: dict) -> list[str]:
    errors = []
    required_lists = ["people", "objects", "actions", "attributes", "scene", "visibleText", "uncertain"]
    if not isinstance(payload.get("captionZh"), str) or not payload["captionZh"].strip():
        errors.append("captionZh is empty")
    elif len(payload["captionZh"].strip()) > 100:
        errors.append(f"captionZh has {len(payload['captionZh'].strip())} characters")
    if not isinstance(payload.get("captionEn"), str) or not payload["captionEn"].strip():
        errors.append("captionEn is empty")
    elif len(payload["captionEn"].split()) > 60:
        errors.append(f"captionEn has {len(payload['captionEn'].split())} words")
    for key in required_lists:
        if not isinstance(payload.get(key), list) or any(not isinstance(item, str) for item in payload[key]):
            errors.append(f"{key} is not a string list")
    confidence = payload.get("confidence")
    if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        errors.append("confidence is outside 0..1")
    return errors


def request_caption(endpoint: str, source_path: Path, timeout: int) -> tuple[dict, dict]:
    request_payload = {
        "model": MODEL,
        "temperature": 0.1,
        "max_tokens": 1600,
        "response_format": {"type": "json_schema", "json_schema": JSON_SCHEMA},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": USER_PROMPT},
                    {"type": "image_url", "image_url": {"url": image_data_url(source_path)}},
                ],
            },
        ],
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(request_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        response_payload = json.loads(response.read())
    elapsed = time.monotonic() - started
    choice = response_payload["choices"][0]
    message = choice["message"]
    content = message.get("content")
    if isinstance(content, list):
        content = "".join(item.get("text", "") for item in content if isinstance(item, dict))
    if choice.get("finish_reason") == "length":
        raise ResponseTruncatedError("model output truncated (finish_reason=length)")
    caption = parse_json_content(content or "")
    return caption, {
        "durationSeconds": round(elapsed, 3),
        "usage": response_payload.get("usage"),
        "finishReason": choice.get("finish_reason"),
    }


def load_caption_state(
    path: Path,
    legacy_truncation_attempts: int = 1,
) -> tuple[dict[str, dict], dict[str, int]]:
    if not path.exists():
        return {}, {}
    completed = {}
    truncation_counts: dict[str, int] = defaultdict(int)
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                item = json.loads(line)
                photo_id = item["photoId"]
                completed[photo_id] = item
                if item.get("status") == "error" and is_truncation_error(item.get("error", "")):
                    truncation_counts[photo_id] += int(
                        item.get("truncationAttempts", legacy_truncation_attempts)
                    )
                elif item.get("status") == "skipped" and item.get("reason") == "repeated_truncation":
                    truncation_counts[photo_id] = max(
                        truncation_counts[photo_id], int(item.get("truncationCount", 0))
                    )
    return completed, dict(truncation_counts)


def choose_diverse_entries(
    entries: list[dict],
    assignments: dict[str, dict],
    limit: int,
    include_skipped: bool = False,
) -> list[dict]:
    eligible = [
        entry
        for entry in entries
        if (entry.get("reviewStatus") == "labeled" or include_skipped)
        and entry.get("safeForKids") is not False
        and entry["id"] in assignments
        and not assignments[entry["id"]]["skipCaptionGeneration"]
    ]
    by_primary: dict[str, list[dict]] = defaultdict(list)
    for entry in eligible:
        by_primary[entry.get("primaryWordId") or "unknown"].append(entry)
    selected = []
    selected_ids = set()
    for word_id in sorted(by_primary):
        candidates = sorted(
            by_primary[word_id],
            key=lambda entry: (-(entry.get("confidence") or 0), -(entry.get("bytes") or 0), entry["id"]),
        )
        selected.append(candidates[0])
        selected_ids.add(candidates[0]["id"])
        if len(selected) >= limit:
            return selected
    for entry in sorted(eligible, key=lambda item: (item.get("album") or "", item["id"])):
        if entry["id"] not in selected_ids:
            selected.append(entry)
            selected_ids.add(entry["id"])
            if len(selected) >= limit:
                break
    return selected


def append_jsonl(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--limit", type=int, default=300)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument(
        "--max-truncations",
        type=int,
        default=3,
        help="permanently skip a photo after this many truncated model responses",
    )
    parser.add_argument("--max-new", type=int, help="stop after this many new successful captions")
    parser.add_argument("--pause-every", type=int, default=0)
    parser.add_argument("--pause-seconds", type=float, default=0)
    parser.add_argument(
        "--include-skipped",
        action="store_true",
        help="include readable entries skipped by the earlier manual word-labeling pass",
    )
    args = parser.parse_args()
    if args.max_truncations < 1:
        parser.error("--max-truncations must be at least 1")

    root = Path(args.root).resolve()
    output = Path(args.output)
    if not output.is_absolute():
        output = root / output
    master = load_json(root / "design-output/photo-word-linking/master-index/photo-linking-master-index.json")
    clusters = load_json(root / "design-output/photo-word-linking/clustering/photo-clusters.json")
    assignments = {item["id"]: item for item in clusters["photoAssignments"]}
    mappings = load_path_mappings(root)
    selected = choose_diverse_entries(
        master["entries"], assignments, args.limit, include_skipped=args.include_skipped
    )
    completed, truncation_counts = load_caption_state(
        output,
        legacy_truncation_attempts=args.retries + 1,
    )
    new_successes = 0

    for index, entry in enumerate(selected, 1):
        if args.max_new is not None and new_successes >= args.max_new:
            break
        photo_id = entry["id"]
        previous = completed.get(photo_id)
        if previous and previous.get("status") in {"ok", "skipped"}:
            print(
                f"caption {index}/{len(selected)}: {photo_id} cached {previous['status']}",
                flush=True,
            )
            continue
        truncation_count = truncation_counts.get(photo_id, 0)
        if truncation_count >= args.max_truncations:
            result = {
                "photoId": photo_id,
                "status": "skipped",
                "reason": "repeated_truncation",
                "truncationCount": truncation_count,
                "model": MODEL,
                "promptVersion": PROMPT_VERSION,
                "generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                "sourcePath": entry["absolutePath"],
            }
            append_jsonl(output, result)
            completed[photo_id] = result
            print(
                f"caption {index}/{len(selected)}: {photo_id} skipped after "
                f"{truncation_count} truncated responses",
                flush=True,
            )
            continue
        source_path = resolve_path(entry["absolutePath"], mappings)
        last_error = None
        attempt_errors = []
        finalized = False
        for attempt in range(1, args.retries + 2):
            try:
                caption, meta = request_caption(args.endpoint, source_path, args.timeout)
                validation_errors = validate_caption(caption)
                if validation_errors:
                    raise ValueError("; ".join(validation_errors))
                result = {
                    "photoId": photo_id,
                    "status": "ok",
                    "model": MODEL,
                    "promptVersion": PROMPT_VERSION,
                    "generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                    "sourcePath": entry["absolutePath"],
                    "currentPrimaryWordId": entry.get("primaryWordId"),
                    "currentSecondaryWordIds": entry.get("secondaryWordIds") or [],
                    "caption": caption,
                    **meta,
                }
                append_jsonl(output, result)
                new_successes += 1
                finalized = True
                print(
                    f"caption {index}/{len(selected)}: {photo_id} ok {meta['durationSeconds']}s "
                    f"zh={len(caption['captionZh'])}",
                    flush=True,
                )
                if (
                    args.pause_every > 0
                    and args.pause_seconds > 0
                    and new_successes % args.pause_every == 0
                    and (args.max_new is None or new_successes < args.max_new)
                ):
                    print(
                        f"cooldown: {args.pause_seconds:g}s after {new_successes} new captions",
                        flush=True,
                    )
                    time.sleep(args.pause_seconds)
                break
            except (OSError, ValueError, KeyError, json.JSONDecodeError, urllib.error.URLError) as error:
                last_error = str(error)
                truncated = is_truncation_error(error)
                if truncated:
                    truncation_count += 1
                attempt_errors.append(
                    {"attempt": attempt, "error": last_error, "truncated": truncated}
                )
                print(f"caption {index}/{len(selected)}: {photo_id} attempt {attempt} failed: {error}", flush=True)
                if truncation_count >= args.max_truncations:
                    result = {
                        "photoId": photo_id,
                        "status": "skipped",
                        "reason": "repeated_truncation",
                        "truncationCount": truncation_count,
                        "attemptErrors": attempt_errors,
                        "model": MODEL,
                        "promptVersion": PROMPT_VERSION,
                        "generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                        "sourcePath": entry["absolutePath"],
                    }
                    append_jsonl(output, result)
                    completed[photo_id] = result
                    finalized = True
                    print(
                        f"caption {index}/{len(selected)}: {photo_id} permanently skipped "
                        f"after {truncation_count} truncated responses",
                        flush=True,
                    )
                    break
                if attempt <= args.retries:
                    time.sleep(min(8, attempt * 2))
        if not finalized:
            append_jsonl(
                output,
                {
                    "photoId": photo_id,
                    "status": "error",
                    "model": MODEL,
                    "promptVersion": PROMPT_VERSION,
                    "generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                    "sourcePath": entry["absolutePath"],
                    "error": last_error,
                    "attemptErrors": attempt_errors,
                    "truncationAttempts": sum(
                        1 for attempt_error in attempt_errors if attempt_error["truncated"]
                    ),
                    "truncationCount": truncation_count,
                },
            )


if __name__ == "__main__":
    main()
