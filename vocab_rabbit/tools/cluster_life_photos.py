#!/usr/bin/env python3
"""Cluster indexed life photos without changing the master index.

The first tier finds conservative near-duplicates that can safely share one
caption. The second tier groups visually similar scene candidates for review.
All results are written beside the master index; source photos are untouched.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import math
import os
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageFile, ImageOps


DEFAULT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = Path("design-output/photo-word-linking/clustering")
FEATURE_VERSION = 1

# Phone exports occasionally contain an otherwise valid JPEG with a few bytes
# missing at EOF. Pillow can still decode these safely for thumbnail features.
ImageFile.LOAD_TRUNCATED_IMAGES = True


class UnionFind:
    def __init__(self, values: Iterable[str]) -> None:
        self.parent = {value: value for value in values}
        self.rank = {value: 0 for value in values}

    def find(self, value: str) -> str:
        parent = self.parent[value]
        if parent != value:
            self.parent[value] = self.find(parent)
        return self.parent[value]

    def union(self, left: str, right: str) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root == right_root:
            return
        if self.rank[left_root] < self.rank[right_root]:
            left_root, right_root = right_root, left_root
        self.parent[right_root] = left_root
        if self.rank[left_root] == self.rank[right_root]:
            self.rank[left_root] += 1

    def groups(self) -> list[list[str]]:
        result: dict[str, list[str]] = defaultdict(list)
        for value in self.parent:
            result[self.find(value)].append(value)
        return list(result.values())


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_path_mappings(root: Path) -> list[tuple[str, str]]:
    path = root / "design-output/photo-word-linking/path-mapping.local.json"
    if not path.exists():
        return []
    result = []
    for item in load_json(path).get("pathMappings", []):
        source = item.get("from")
        target = item.get("to")
        if source and target:
            result.append((source.rstrip("/"), target.rstrip("/")))
    return result


def resolve_path(path: str, mappings: list[tuple[str, str]]) -> Path:
    for source, target in mappings:
        if path == source or path.startswith(source + "/"):
            candidate = Path(target + path[len(source) :])
            if candidate.is_file():
                return candidate
    return Path(path)


def perceptual_hash(rgb: np.ndarray) -> int:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    resized = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA)
    dct = cv2.dct(np.float32(resized))[:8, :8]
    values = dct.flatten()
    median = float(np.median(values[1:]))
    bits = values > median
    result = 0
    for bit in bits:
        result = (result << 1) | int(bit)
    return result


def difference_hash(rgb: np.ndarray) -> int:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    resized = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA)
    bits = resized[:, 1:] > resized[:, :-1]
    result = 0
    for bit in bits.flatten():
        result = (result << 1) | int(bit)
    return result


def color_histogram(rgb: np.ndarray) -> list[float]:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    histogram = cv2.calcHist([hsv], [0, 1, 2], None, [8, 3, 3], [0, 180, 0, 256, 0, 256])
    flat = histogram.flatten().astype(np.float32)
    norm = float(np.linalg.norm(flat))
    if norm:
        flat /= norm
    return [round(float(value), 6) for value in flat]


def read_capture_time(image: Image.Image) -> str | None:
    try:
        exif = image.getexif()
        raw = exif.get(36867) or exif.get(306)
        if not raw:
            return None
        parsed = dt.datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
        return parsed.isoformat(timespec="seconds")
    except (TypeError, ValueError, OSError):
        return None


def extract_feature(item: tuple[dict, str]) -> dict:
    entry, source_path = item
    with Image.open(source_path) as image:
        captured_at = read_capture_time(image)
        width, height = image.size
        image.draft("RGB", (320, 320))
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((320, 320), Image.Resampling.LANCZOS)
        rgb = np.asarray(image)

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    return {
        "id": entry["id"],
        "sourcePath": source_path,
        "width": width,
        "height": height,
        "capturedAt": captured_at,
        "pHash": f"{perceptual_hash(rgb):016x}",
        "dHash": f"{difference_hash(rgb):016x}",
        "histogram": color_histogram(rgb),
        "sharpness": round(sharpness, 3),
        "brightness": round(brightness, 3),
    }


def load_feature_cache(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    result = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            record = json.loads(line)
            if record.get("featureVersion") == FEATURE_VERSION:
                result[record["id"]] = record
    return result


def write_feature_cache(path: Path, features: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for feature in features:
            handle.write(json.dumps({"featureVersion": FEATURE_VERSION, **feature}, ensure_ascii=False) + "\n")


def extract_features(
    entries: list[dict], mappings: list[tuple[str, str]], cache_path: Path, workers: int
) -> tuple[list[dict], list[dict]]:
    cached = load_feature_cache(cache_path)
    features = []
    missing = []
    pending = []
    for entry in entries:
        source_path = resolve_path(entry["absolutePath"], mappings)
        if entry["id"] in cached and cached[entry["id"]].get("sourcePath") == str(source_path):
            features.append(cached[entry["id"]])
        elif source_path.is_file():
            pending.append((entry, str(source_path)))
        else:
            missing.append({"id": entry["id"], "path": str(source_path)})

    if pending:
        completed = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(extract_feature, item): item[0]["id"] for item in pending}
            for future in concurrent.futures.as_completed(futures):
                photo_id = futures[future]
                try:
                    features.append(future.result())
                except Exception as error:  # malformed source files should not abort the whole inventory
                    missing.append({"id": photo_id, "error": str(error)})
                completed += 1
                if completed % 500 == 0 or completed == len(pending):
                    print(f"feature extraction: {completed}/{len(pending)}", flush=True)

    features.sort(key=lambda feature: feature["id"])
    write_feature_cache(cache_path, features)
    return features, missing


def hamming(left: int, right: int) -> int:
    return (left ^ right).bit_count()


def histogram_similarity(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.dot(left, right))


def timestamp_seconds(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value).timestamp()
    except ValueError:
        return None


def metadata_overlap(left: dict, right: dict) -> float:
    left_words = set(left.get("descriptionWords") or [])
    right_words = set(right.get("descriptionWords") or [])
    union = left_words | right_words
    return len(left_words & right_words) / len(union) if union else 0.0


def candidate_pairs(features: list[dict], entries_by_id: dict[str, dict]) -> set[tuple[int, int]]:
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    time_buckets: dict[tuple[str, str], list[int]] = defaultdict(list)
    for index, feature in enumerate(features):
        value = int(feature["pHash"], 16)
        for chunk in range(4):
            buckets[(chunk, (value >> (chunk * 16)) & 0xFFFF)].append(index)
        captured = feature.get("capturedAt")
        if captured:
            entry = entries_by_id[feature["id"]]
            time_buckets[(entry.get("album") or "", captured[:10])].append(index)

    pairs: set[tuple[int, int]] = set()
    for indexes in buckets.values():
        if len(indexes) < 2:
            continue
        for offset, left in enumerate(indexes[:-1]):
            for right in indexes[offset + 1 :]:
                pairs.add((left, right) if left < right else (right, left))

    # Consecutive photos from the same album and day are useful candidates even
    # when a camera moved enough that no pHash chunk is identical.
    for indexes in time_buckets.values():
        indexes.sort(key=lambda index: features[index]["capturedAt"])
        for position, left in enumerate(indexes):
            left_time = timestamp_seconds(features[left].get("capturedAt"))
            for right in indexes[position + 1 : position + 13]:
                right_time = timestamp_seconds(features[right].get("capturedAt"))
                if left_time is None or right_time is None or right_time - left_time > 300:
                    break
                pairs.add((left, right))
    return pairs


def quality_score(feature: dict, entry: dict) -> float:
    pixels = max(1, feature["width"] * feature["height"])
    size_score = math.log2(pixels)
    sharpness_score = math.log1p(max(0.0, feature["sharpness"]))
    exposure_penalty = abs(feature["brightness"] - 128.0) / 64.0
    bytes_score = math.log1p(max(0, entry.get("bytes") or 0)) / 10.0
    return size_score + sharpness_score + bytes_score - exposure_penalty


def build_group_payload(
    groups: list[list[str]], prefix: str, features_by_id: dict[str, dict], entries_by_id: dict[str, dict]
) -> tuple[list[dict], dict[str, str]]:
    payload = []
    membership = {}
    ordered = sorted((group for group in groups if len(group) > 1), key=lambda group: (-len(group), group[0]))
    for number, group in enumerate(ordered, 1):
        group_id = f"{prefix}-{number:05d}"
        ranked = sorted(
            group,
            key=lambda photo_id: (
                -quality_score(features_by_id[photo_id], entries_by_id[photo_id]),
                photo_id,
            ),
        )
        representative = ranked[0]
        for photo_id in group:
            membership[photo_id] = group_id
        payload.append(
            {
                "id": group_id,
                "representativeId": representative,
                "memberIds": ranked,
                "memberCount": len(ranked),
            }
        )
    return payload, membership


def cluster_photos(features: list[dict], entries: list[dict]) -> dict:
    entries_by_id = {entry["id"]: entry for entry in entries}
    features_by_id = {feature["id"]: feature for feature in features}
    duplicate_union = UnionFind(features_by_id)
    scene_union = UnionFind(features_by_id)
    pairs = candidate_pairs(features, entries_by_id)
    duplicate_edges = 0
    scene_edges = 0

    for pair_number, (left_index, right_index) in enumerate(pairs, 1):
        left_feature = features[left_index]
        right_feature = features[right_index]
        left_entry = entries_by_id[left_feature["id"]]
        right_entry = entries_by_id[right_feature["id"]]
        p_distance = hamming(int(left_feature["pHash"], 16), int(right_feature["pHash"], 16))
        if p_distance > 18:
            continue
        d_distance = hamming(int(left_feature["dHash"], 16), int(right_feature["dHash"], 16))
        hist_similarity = histogram_similarity(
            np.asarray(left_feature["histogram"], dtype=np.float32),
            np.asarray(right_feature["histogram"], dtype=np.float32),
        )
        left_time = timestamp_seconds(left_feature.get("capturedAt"))
        right_time = timestamp_seconds(right_feature.get("capturedAt"))
        time_gap = abs(left_time - right_time) if left_time is not None and right_time is not None else None
        same_album = left_entry.get("album") == right_entry.get("album")
        overlap = metadata_overlap(left_entry, right_entry)

        is_duplicate = p_distance <= 4 or (
            p_distance <= 8 and d_distance <= 10 and hist_similarity >= 0.96
        )
        if is_duplicate:
            duplicate_union.union(left_feature["id"], right_feature["id"])
            scene_union.union(left_feature["id"], right_feature["id"])
            duplicate_edges += 1
            continue

        is_timed_scene = time_gap is not None and time_gap <= 180 and same_album
        is_labeled_scene = overlap >= 0.5 or left_entry.get("primaryWordId") == right_entry.get("primaryWordId")
        if (
            p_distance <= 16
            and d_distance <= 20
            and hist_similarity >= 0.90
            and (is_timed_scene or is_labeled_scene)
        ):
            scene_union.union(left_feature["id"], right_feature["id"])
            scene_edges += 1

        if pair_number % 1_000_000 == 0:
            print(f"pair comparison: {pair_number}/{len(pairs)}", flush=True)

    duplicate_groups, duplicate_membership = build_group_payload(
        duplicate_union.groups(), "duplicate", features_by_id, entries_by_id
    )
    scene_groups, scene_membership = build_group_payload(
        scene_union.groups(), "scene", features_by_id, entries_by_id
    )
    duplicate_representatives = {group["representativeId"] for group in duplicate_groups}
    duplicate_member_ids = set(duplicate_membership)
    auto_skip_ids = duplicate_member_ids - duplicate_representatives

    photo_assignments = []
    for entry in entries:
        photo_id = entry["id"]
        if photo_id not in features_by_id:
            continue
        duplicate_group = duplicate_membership.get(photo_id)
        scene_group = scene_membership.get(photo_id)
        duplicate_representative = None
        if duplicate_group:
            duplicate_representative = next(
                group["representativeId"] for group in duplicate_groups if group["id"] == duplicate_group
            )
        photo_assignments.append(
            {
                "id": photo_id,
                "duplicateClusterId": duplicate_group,
                "sceneClusterId": scene_group,
                "representativeId": duplicate_representative or photo_id,
                "skipCaptionGeneration": photo_id in auto_skip_ids,
            }
        )

    return {
        "candidatePairs": len(pairs),
        "duplicateEdges": duplicate_edges,
        "sceneEdges": scene_edges,
        "duplicateClusters": duplicate_groups,
        "sceneClusters": scene_groups,
        "photoAssignments": photo_assignments,
        "autoSkipIds": sorted(auto_skip_ids),
    }


def create_review_sheet(
    root: Path,
    output_path: Path,
    groups: list[dict],
    entries_by_id: dict[str, dict],
    mappings: list[tuple[str, str]],
    max_groups: int = 24,
) -> None:
    from PIL import ImageDraw, ImageFont

    rows = []
    for group in groups[:max_groups]:
        rows.append((group, group["memberIds"][:6]))
    if not rows:
        return
    cell_width, cell_height = 180, 145
    label_height = 28
    sheet = Image.new("RGB", (cell_width * 6, (cell_height + label_height) * len(rows)), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13)
    except OSError:
        font = ImageFont.load_default()

    for row, (group, member_ids) in enumerate(rows):
        y = row * (cell_height + label_height)
        draw.text((6, y + 5), f"{group['id']} ({group['memberCount']})", fill=(25, 25, 25), font=font)
        for column, photo_id in enumerate(member_ids):
            entry = entries_by_id[photo_id]
            path = resolve_path(entry["absolutePath"], mappings)
            try:
                with Image.open(path) as image:
                    image.draft("RGB", (cell_width, cell_height))
                    image = ImageOps.exif_transpose(image).convert("RGB")
                    image.thumbnail((cell_width - 8, cell_height - 8), Image.Resampling.LANCZOS)
                    x = column * cell_width + (cell_width - image.width) // 2
                    image_y = y + label_height + (cell_height - image.height) // 2
                    sheet.paste(image, (x, image_y))
            except OSError:
                pass
            if photo_id == group["representativeId"]:
                x = column * cell_width + 2
                draw.rectangle((x, y + label_height + 2, x + cell_width - 4, y + label_height + cell_height - 4), outline=(255, 145, 25), width=4)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, quality=90)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 4))
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    output = Path(args.output)
    if not output.is_absolute():
        output = root / output
    master_path = root / "design-output/photo-word-linking/master-index/photo-linking-master-index.json"
    entries = load_json(master_path)["entries"]
    if args.limit:
        entries = entries[: args.limit]
    mappings = load_path_mappings(root)
    cache_path = output / "photo-features.v1.jsonl"

    features, missing = extract_features(entries, mappings, cache_path, args.workers)
    clustered = cluster_photos(features, entries)
    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    result = {
        "meta": {
            "version": 1,
            "generatedAt": now,
            "sourceIndex": str(master_path),
            "sourcePhotosModified": False,
            "masterIndexModified": False,
            "nearDuplicatePolicy": "pHash<=4 or pHash<=8+dHash<=10+histogram>=0.96",
            "sceneCandidatePolicy": "pHash<=16+dHash<=20+histogram>=0.90 plus time/label agreement",
        },
        "stats": {
            "indexedPhotos": len(entries),
            "readablePhotos": len(features),
            "unreadablePhotos": len(missing),
            "candidatePairs": clustered["candidatePairs"],
            "duplicateClusters": len(clustered["duplicateClusters"]),
            "photosInDuplicateClusters": sum(
                group["memberCount"] for group in clustered["duplicateClusters"]
            ),
            "autoSkipCaptionPhotos": len(clustered["autoSkipIds"]),
            "captionPhotosAfterAutoSkip": len(features) - len(clustered["autoSkipIds"]),
            "sceneCandidateClusters": len(clustered["sceneClusters"]),
            "photosInSceneCandidateClusters": sum(
                group["memberCount"] for group in clustered["sceneClusters"]
            ),
        },
        "duplicateClusters": clustered["duplicateClusters"],
        "sceneCandidateClusters": clustered["sceneClusters"],
        "photoAssignments": clustered["photoAssignments"],
        "unreadable": missing,
    }
    write_json(output / "photo-clusters.json", result)
    write_json(output / "photo-clustering-summary.json", {"meta": result["meta"], "stats": result["stats"]})

    entries_by_id = {entry["id"]: entry for entry in entries}
    create_review_sheet(
        root, output / "duplicate-clusters-review.jpg", result["duplicateClusters"], entries_by_id, mappings
    )
    create_review_sheet(
        root,
        output / "scene-candidates-review.jpg",
        result["sceneCandidateClusters"],
        entries_by_id,
        mappings,
    )
    print(json.dumps(result["stats"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
