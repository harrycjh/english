#!/usr/bin/env python3
"""Build and serve a local review UI for Qwen life-photo matches."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import tempfile
from collections import defaultdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image, ImageOps

from cluster_life_photos import load_path_mappings, resolve_path
from match_qwen_captions_to_ket import (
    aliases,
    inflections,
    load_latest_successful_captions,
    ngrams,
    normalize,
    pos_types,
)


ROOT = Path(__file__).resolve().parents[1]
WORDS_PATH = ROOT / "public/content/words/ket_vocabulary.json"
MASTER_PATH = ROOT / "design-output/photo-word-linking/master-index/photo-linking-master-index.json"
CAPTIONS_PATH = ROOT / "design-output/photo-word-linking/captions/qwen-captions-all.jsonl"
MATCHES_PATH = ROOT / "design-output/photo-word-linking/captions/qwen-captions-all-ket-matches.json"
CLUSTERS_PATH = ROOT / "design-output/photo-word-linking/clustering/photo-clusters.json"
FEATURES_PATH = ROOT / "design-output/photo-word-linking/clustering/photo-features.v1.jsonl"
MANIFEST_PATH = ROOT / "design-output/photo-word-linking/review/photo-match-review-candidates.json"
SELECTIONS_PATH = ROOT / "design-output/photo-word-linking/review/photo-match-review-selections.json"
THUMBNAIL_ROOT = ROOT / "design-output/photo-word-linking/review/thumbnails"
HTML_PATH = Path(__file__).with_name("photo_match_review.html")
PHOTO_ID_RE = re.compile(r"photo-\d+")
FIELD_WEIGHTS = {
    "people": 110,
    "objects": 105,
    "actions": 100,
    "scene": 90,
    "attributes": 80,
    "captionEn": 45,
}
REVIEW_POOL_SIZE = 100
REVIEW_BATCH_SIZE = 20


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp"
    ) as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        temporary_path = Path(handle.name)
    temporary_path.replace(path)


def load_features(path: Path) -> dict[str, dict]:
    result = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                feature = json.loads(line)
                result[feature["id"]] = feature
    return result


def candidate_evidence(word: dict, caption: dict, structured: bool) -> list[dict]:
    word_aliases = aliases(word["english"])
    word_types = pos_types(word["partOfSpeech"])
    evidence: list[dict] = []
    field_types = {
        "people": {"n"},
        "objects": {"n"},
        "scene": {"n"},
        "actions": {"v"},
        "attributes": {"adj", "adv"},
    }

    if structured:
        for field, allowed_types in field_types.items():
            applicable_types = word_types & allowed_types
            if not applicable_types:
                continue
            forms = {
                form
                for word_type in applicable_types
                for alias in word_aliases
                for form in inflections(alias, word_type)
            }
            for term in caption.get(field, []):
                if forms & ngrams(normalize(term)):
                    evidence.append({"field": field, "term": term})

    if not evidence:
        caption_phrases = ngrams(normalize(caption.get("captionEn", "")))
        matched_alias = next((alias for alias in sorted(word_aliases) if alias in caption_phrases), None)
        if matched_alias:
            evidence.append({"field": "captionEn", "term": matched_alias})
    unique = []
    seen = set()
    for item in evidence:
        key = normalize(item["term"])
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def quality_bonus(feature: dict | None) -> float:
    if not feature:
        return 0.0
    sharpness = max(0.0, float(feature.get("sharpness") or 0))
    pixels = max(1, int(feature.get("width") or 1) * int(feature.get("height") or 1))
    exposure = abs(float(feature.get("brightness") or 128) - 128) / 128
    return min(7.0, math.log1p(sharpness)) + min(4.0, math.log2(pixels) / 6) - exposure


def rank_candidate(
    word: dict,
    photo_id: str,
    caption_row: dict,
    structured: bool,
    feature: dict | None,
    old_entry: dict | None,
    scene_cluster_id: str | None,
) -> dict:
    caption = caption_row["caption"]
    evidence = candidate_evidence(word, caption, structured)
    evidence_score = max((FIELD_WEIGHTS[item["field"]] for item in evidence), default=30)
    confidence = float(caption.get("confidence") or 0)
    old_word_ids = set((old_entry or {}).get("secondaryWordIds") or [])
    old_word_ids.add((old_entry or {}).get("primaryWordId"))
    old_match_bonus = 3 if word["id"] in old_word_ids else 0
    score = evidence_score + min(8, len(evidence) * 2) + confidence * 10 + quality_bonus(feature)
    score += old_match_bonus
    return {
        "photoId": photo_id,
        "score": round(score, 2),
        "matchType": "structured" if structured else "captionExact",
        "evidence": evidence[:4],
        "captionZh": caption.get("captionZh", ""),
        "captionEn": caption.get("captionEn", ""),
        "sceneClusterId": scene_cluster_id,
        "perceptualHash": (feature or {}).get("pHash"),
        "differenceHash": (feature or {}).get("dHash"),
        "wasPreviouslyMatched": old_match_bonus > 0,
    }


def visually_similar(left: dict, right: dict) -> bool:
    try:
        perceptual_distance = (
            int(left["perceptualHash"], 16) ^ int(right["perceptualHash"], 16)
        ).bit_count()
        difference_distance = (
            int(left["differenceHash"], 16) ^ int(right["differenceHash"], 16)
        ).bit_count()
        return perceptual_distance <= 16 and difference_distance <= 20
    except (KeyError, TypeError, ValueError):
        return False


def select_diverse_candidates(candidates: list[dict], limit: int = 20) -> list[dict]:
    ordered = sorted(candidates, key=lambda item: (-item["score"], item["photoId"]))
    selected: list[dict] = []
    used_scenes = set()
    selected_ids = set()
    for candidate in ordered:
        scene_key = candidate.get("sceneClusterId") or candidate["photoId"]
        if scene_key in used_scenes or any(
            visually_similar(candidate, previous) for previous in selected
        ):
            continue
        selected.append(candidate)
        selected_ids.add(candidate["photoId"])
        used_scenes.add(scene_key)
        if len(selected) == limit:
            return selected
    for candidate in ordered:
        if candidate["photoId"] in selected_ids:
            continue
        selected.append(candidate)
        if len(selected) == limit:
            break
    return selected


def build_review_manifest() -> dict:
    words = load_json(WORDS_PATH)["words"]
    matches = load_json(MATCHES_PATH)["matchedWords"]
    captions, caption_stats = load_latest_successful_captions(CAPTIONS_PATH)
    captions_by_id = {row["photoId"]: row for row in captions}
    features = load_features(FEATURES_PATH)
    master_entries = {entry["id"]: entry for entry in load_json(MASTER_PATH)["entries"]}
    assignments = {
        item["id"]: item for item in load_json(CLUSTERS_PATH).get("photoAssignments", [])
    }
    matches_by_word = {match["wordId"]: match for match in matches}

    review_words = []
    structured_word_count = 0
    weak_only_word_count = 0
    for word in words:
        match = matches_by_word.get(word["id"], {})
        structured_ids = set(match.get("structuredPhotoIds") or []) & captions_by_id.keys()
        caption_ids = set(match.get("captionExactPhotoIds") or []) & captions_by_id.keys()
        candidates = []
        for photo_id in structured_ids | caption_ids:
            candidates.append(
                rank_candidate(
                    word,
                    photo_id,
                    captions_by_id[photo_id],
                    photo_id in structured_ids,
                    features.get(photo_id),
                    master_entries.get(photo_id),
                    (assignments.get(photo_id) or {}).get("sceneClusterId"),
                )
            )
        selected = select_diverse_candidates(candidates, limit=REVIEW_POOL_SIZE)
        selected = [
            {
                key: value
                for key, value in candidate.items()
                if key not in {"perceptualHash", "differenceHash", "sceneClusterId", "captionEn"}
            }
            for candidate in selected
        ]
        if structured_ids:
            structured_word_count += 1
        elif caption_ids:
            weak_only_word_count += 1
        review_words.append(
            {
                "wordId": word["id"],
                "english": word["english"],
                "chinese": word["chinese"],
                "partOfSpeech": word["partOfSpeech"],
                "category": word["category"],
                "candidateCount": len(candidates),
                "candidates": selected,
            }
        )

    with_candidates = sum(bool(word["candidates"]) for word in review_words)
    payload = {
        "schemaVersion": 1,
        "generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "stats": {
            "totalWords": len(review_words),
            "wordsWithCandidates": with_candidates,
            "wordsWithoutCandidates": len(review_words) - with_candidates,
            "wordsWithStructuredCandidates": structured_word_count,
            "wordsWithCaptionOnlyCandidates": weak_only_word_count,
            "directSuccessfulCaptionPhotos": caption_stats["latestSuccessfulCaptions"],
        },
        "words": review_words,
    }
    write_json_atomic(MANIFEST_PATH, payload)
    return payload


class ReviewApplication:
    def __init__(self, rebuild: bool = False) -> None:
        self.manifest = build_review_manifest() if rebuild or not MANIFEST_PATH.exists() else load_json(MANIFEST_PATH)
        self.words_by_id = {word["wordId"]: word for word in self.manifest["words"]}
        self.master_entries = {entry["id"]: entry for entry in load_json(MASTER_PATH)["entries"]}
        self.path_mappings = load_path_mappings(ROOT)
        self.selections = self.load_selections()
        self.mark_exhausted_rejections()

    def load_selections(self) -> dict:
        if SELECTIONS_PATH.exists():
            payload = load_json(SELECTIONS_PATH)
        else:
            payload = {"schemaVersion": 2, "updatedAt": None, "selections": {}}

        payload["schemaVersion"] = 2
        payload.setdefault("rejectedCandidates", {})
        migrated = False
        for word_id, selection in list(payload.get("selections", {}).items()):
            if selection.get("status") != "skipped":
                continue
            word = self.words_by_id.get(word_id)
            rejected_ids = [
                candidate["photoId"]
                for candidate in (word or {}).get("candidates", [])[:REVIEW_BATCH_SIZE]
            ]
            existing = payload["rejectedCandidates"].setdefault(
                word_id, {"photoIds": [], "rejectedAt": selection.get("selectedAt")}
            )
            existing["photoIds"] = list(dict.fromkeys(existing.get("photoIds", []) + rejected_ids))
            payload["selections"].pop(word_id, None)
            migrated = True
        if migrated:
            payload["updatedAt"] = dt.datetime.now().astimezone().isoformat(timespec="seconds")
            write_json_atomic(SELECTIONS_PATH, payload)
        return payload

    def selected_photo_ids(self, excluding_word_id: str | None = None) -> set[str]:
        return {
            selection["photoId"]
            for word_id, selection in self.selections["selections"].items()
            if word_id != excluding_word_id
            and selection.get("status") == "selected"
            and selection.get("photoId")
        }

    def mark_exhausted_rejections(self) -> None:
        changed = False
        now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
        for word_id in self.selections.get("rejectedCandidates", {}):
            if word_id in self.selections["selections"]:
                continue
            if self.available_candidate_ids(word_id):
                continue
            self.selections["selections"][word_id] = {
                "status": "exhausted",
                "photoId": None,
                "selectedAt": now,
            }
            changed = True
        if changed:
            self.selections["updatedAt"] = now
            write_json_atomic(SELECTIONS_PATH, self.selections)

    def available_candidate_ids(self, word_id: str) -> list[str]:
        word = self.words_by_id[word_id]
        globally_selected = self.selected_photo_ids(excluding_word_id=word_id)
        rejected = set(
            (self.selections.get("rejectedCandidates", {}).get(word_id) or {}).get("photoIds", [])
        )
        return [
            candidate["photoId"]
            for candidate in word["candidates"]
            if candidate["photoId"] not in globally_selected and candidate["photoId"] not in rejected
        ]

    def save_selection(self, word_id: str, photo_id: str | None) -> dict:
        word = self.words_by_id.get(word_id)
        if not word:
            raise ValueError("unknown wordId")
        allowed = {candidate["photoId"] for candidate in word["candidates"]}
        if photo_id is not None and photo_id not in allowed:
            raise ValueError("photoId is not a candidate for this word")
        if photo_id in self.selected_photo_ids(excluding_word_id=word_id):
            raise ValueError("photoId has already been selected for another word")
        now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
        self.selections["updatedAt"] = now
        self.selections["selections"][word_id] = {
            "status": "selected" if photo_id else "skipped",
            "photoId": photo_id,
            "selectedAt": now,
        }
        write_json_atomic(SELECTIONS_PATH, self.selections)
        return self.selections["selections"][word_id]

    def reject_candidates(self, word_id: str, photo_ids: list[str]) -> dict:
        word = self.words_by_id.get(word_id)
        if not word:
            raise ValueError("unknown wordId")
        allowed = {candidate["photoId"] for candidate in word["candidates"]}
        rejected_ids = [photo_id for photo_id in photo_ids if photo_id in allowed]
        if len(rejected_ids) != len(photo_ids):
            raise ValueError("candidatePhotoIds contains an unknown photo")
        now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
        rejected = self.selections["rejectedCandidates"].setdefault(
            word_id, {"photoIds": [], "rejectedAt": now}
        )
        rejected["photoIds"] = list(dict.fromkeys(rejected.get("photoIds", []) + rejected_ids))
        rejected["rejectedAt"] = now
        self.selections["selections"].pop(word_id, None)
        if not self.available_candidate_ids(word_id):
            self.selections["selections"][word_id] = {
                "status": "exhausted",
                "photoId": None,
                "selectedAt": now,
            }
        self.selections["updatedAt"] = now
        write_json_atomic(SELECTIONS_PATH, self.selections)
        return {
            "selection": self.selections["selections"].get(word_id),
            "rejectedCandidates": rejected,
        }

    def remove_selection(self, word_id: str) -> None:
        self.selections["selections"].pop(word_id, None)
        self.selections["updatedAt"] = dt.datetime.now().astimezone().isoformat(timespec="seconds")
        write_json_atomic(SELECTIONS_PATH, self.selections)

    def thumbnail(self, photo_id: str) -> Path:
        if not PHOTO_ID_RE.fullmatch(photo_id):
            raise FileNotFoundError(photo_id)
        output = THUMBNAIL_ROOT / f"{photo_id}.webp"
        if output.exists():
            return output
        entry = self.master_entries.get(photo_id)
        if not entry:
            raise FileNotFoundError(photo_id)
        source = resolve_path(entry["absolutePath"], self.path_mappings)
        if not source.is_file():
            raise FileNotFoundError(source)
        output.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((960, 720), Image.Resampling.LANCZOS)
            image.save(output, "WEBP", quality=82, method=6)
        return output


def make_handler(application: ReviewApplication):
    class ReviewHandler(BaseHTTPRequestHandler):
        def send_bytes(self, body: bytes, content_type: str, status: int = 200) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            no_store = "json" in content_type or content_type.startswith("text/html")
            self.send_header("Cache-Control", "no-store" if no_store else "public, max-age=86400")
            self.end_headers()
            self.wfile.write(body)

        def send_json(self, payload: dict, status: int = 200) -> None:
            self.send_bytes(json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", status)

        def do_GET(self) -> None:  # noqa: N802
            path = unquote(urlparse(self.path).path)
            if path == "/":
                self.send_bytes(HTML_PATH.read_bytes(), "text/html; charset=utf-8")
                return
            if path == "/api/data":
                self.send_json({"manifest": application.manifest, "selectionState": application.selections})
                return
            if path.startswith("/photo/"):
                photo_id = path.removeprefix("/photo/")
                try:
                    self.send_bytes(application.thumbnail(photo_id).read_bytes(), "image/webp")
                except (FileNotFoundError, OSError):
                    self.send_error(HTTPStatus.NOT_FOUND)
                return
            self.send_error(HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:  # noqa: N802
            if urlparse(self.path).path != "/api/select":
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            try:
                length = min(int(self.headers.get("Content-Length", "0")), 65536)
                payload = json.loads(self.rfile.read(length))
                word_id = payload.get("wordId")
                if payload.get("clear"):
                    application.remove_selection(word_id)
                    self.send_json({"ok": True, "selection": None})
                elif payload.get("photoId") is None:
                    result = application.reject_candidates(
                        word_id, payload.get("candidatePhotoIds") or []
                    )
                    self.send_json({"ok": True, **result})
                else:
                    selection = application.save_selection(word_id, payload.get("photoId"))
                    self.send_json({"ok": True, "selection": selection})
            except (ValueError, TypeError, json.JSONDecodeError) as error:
                self.send_json({"ok": False, "error": str(error)}, HTTPStatus.BAD_REQUEST)

        def log_message(self, format: str, *args) -> None:
            if args and str(args[1]).startswith("4"):
                super().log_message(format, *args)

    return ReviewHandler


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the local life-photo match review page.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4180)
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost"}:
        parser.error("this private photo review server may only bind to localhost")

    application = ReviewApplication(rebuild=args.rebuild)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(application))
    print(json.dumps(application.manifest["stats"], ensure_ascii=False, indent=2), flush=True)
    print(f"photo review: http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
