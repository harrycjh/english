#!/usr/bin/env python3

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


MASTER_INDEX_PATH = Path(
    "/Volumes/ExternalSSD/English/vocab_rabbit/design-output/photo-word-linking/master-index/photo-linking-master-index.json"
)
MASTER_SUMMARY_PATH = Path(
    "/Volumes/ExternalSSD/English/vocab_rabbit/design-output/photo-word-linking/master-index/photo-linking-master-summary.json"
)
FINALIZATION_REPORT_PATH = Path(
    "/Volumes/ExternalSSD/English/vocab_rabbit/design-output/photo-word-linking/master-index/photo-linking-finalization-report.json"
)


def build_skip_reason(entry: dict) -> str:
    top_folder = entry.get("topFolder") or "UNKNOWN"
    album = entry.get("album") or "UNKNOWN"
    relative_path = entry.get("relativePath", "")
    file_name = entry.get("fileName", "")

    if ".gs_fs" in relative_path:
        return "sync-artifact style image path auto-skipped during full inventory finalization"

    if album == "WeiXin" or "WeiXin" in relative_path:
        return "weixin backlog auto-skipped during full inventory finalization because it was not individually reviewed in this pass"

    if top_folder == "Camera":
        return "camera-roll backlog auto-skipped during full inventory finalization because it was not individually reviewed in this pass"

    if top_folder == "ROOT":
        return "root-level photo backlog auto-skipped during full inventory finalization because it was not individually reviewed in this pass"

    if album in {"PCWallpaper", "hw_wallpaper", "helios"}:
        return "wallpaper or auxiliary image source auto-skipped during full inventory finalization"

    if album in {"0", "1", "Pictures"}:
        return "miscellaneous album backlog auto-skipped during full inventory finalization because it was not individually reviewed in this pass"

    return f"{album} album backlog auto-skipped during full inventory finalization because it was not individually reviewed in this pass"


def main() -> None:
    master = json.loads(MASTER_INDEX_PATH.read_text(encoding="utf-8"))
    entries = master["entries"]

    finalized_count = 0
    reasons = Counter()

    for entry in entries:
        if entry.get("reviewStatus") != "pending":
            continue

        skip_reason = build_skip_reason(entry)
        entry["reviewStatus"] = "skipped"
        entry["labelSource"] = "master-finalize-pending"
        entry["primaryWordId"] = None
        entry["secondaryWordIds"] = []
        entry["descriptionWords"] = []
        entry["tags"] = []
        entry["confidence"] = None
        entry["peopleCount"] = None
        entry["indoorOutdoor"] = None
        entry["colorMood"] = None
        entry["scene"] = None
        entry["safeForKids"] = None
        entry["reviewRef"] = "tools/finalize_photo_linking_master_index.py"
        entry["skipReason"] = skip_reason
        finalized_count += 1
        reasons[skip_reason] += 1

    review_status_counter = Counter(entry["reviewStatus"] for entry in entries)
    label_source_counter = Counter((entry.get("labelSource") or "none") for entry in entries)
    primary_word_counter = Counter(entry["primaryWordId"] for entry in entries if entry.get("primaryWordId"))

    master["meta"]["createdAt"] = "2026-06-12"
    master["meta"]["notes"] = (
        "Master index of all candidate photo assets. Every image now has an explicit final status. "
        "Labeled items come from pilot-10, batch-100, and batch-200. Remaining backlog items were bulk-finalized as skipped."
    )
    master["stats"] = {
        "byReviewStatus": dict(review_status_counter),
        "byLabelSource": dict(label_source_counter),
        "labeledPrimaryWordTop30": primary_word_counter.most_common(30),
    }

    summary = {
        "meta": master["meta"],
        "stats": master["stats"],
        "paths": {
            "masterIndex": str(MASTER_INDEX_PATH),
            "pilot10": "/Volumes/ExternalSSD/English/vocab_rabbit/design-output/photo-word-linking/pilot-10/pilot-10-recognition-results.json",
            "batch100": "/Volumes/ExternalSSD/English/vocab_rabbit/design-output/photo-word-linking/batch-100/batch-100-recognition-results.json",
            "batch200": "/Volumes/ExternalSSD/English/vocab_rabbit/design-output/photo-word-linking/batch-200/batch-200-recognition-results.json",
        },
    }

    report = {
        "meta": {
            "createdAt": "2026-06-12",
            "script": "tools/finalize_photo_linking_master_index.py",
            "masterIndex": str(MASTER_INDEX_PATH),
        },
        "finalizedPendingCount": finalized_count,
        "reasonBreakdown": dict(reasons),
        "finalStats": summary["stats"],
    }

    MASTER_INDEX_PATH.write_text(json.dumps(master, ensure_ascii=False, indent=2), encoding="utf-8")
    MASTER_SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    FINALIZATION_REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"finalized_pending={finalized_count}")
    print(json.dumps(summary["stats"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
