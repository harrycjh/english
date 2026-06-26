#!/usr/bin/env python3
"""Apply a manually reviewed photo-linking batch from TSV on stdin.

TSV columns:
primaryWordId | secondaryWordIds comma-list | descriptionWords comma-list |
peopleCount | indoorOutdoor | confidence | optional skipReason

Use primaryWordId=SKIP for skipped rows. The number of non-empty TSV rows must
match the batch manifest entry count.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path


DEFAULT_ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_tsv(text: str) -> list[dict]:
    rows = []
    for line_no, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [part.strip() for part in line.split("|")]
        if len(parts) not in (6, 7):
            raise SystemExit(f"line {line_no}: expected 6 or 7 pipe-delimited fields, got {len(parts)}")
        primary, secondary, words, people, indoor_outdoor, confidence = parts[:6]
        skip_reason = parts[6] if len(parts) == 7 else ""
        rows.append(
            {
                "primaryWordId": primary,
                "secondaryWordIds": [item.strip() for item in secondary.split(",") if item.strip()],
                "descriptionWords": [item.strip() for item in words.split(",") if item.strip()],
                "peopleCount": None if primary == "SKIP" else int(people),
                "indoorOutdoor": None if primary == "SKIP" else indoor_outdoor,
                "confidence": None if primary == "SKIP" else float(confidence),
                "skipReason": skip_reason or words,
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--batch", type=int, required=True)
    args = parser.parse_args()

    root = Path(args.root)
    batch = args.batch
    batch_dir = root / f"design-output/photo-word-linking/batch-{batch}"
    manifest_path = batch_dir / f"batch-{batch}-photo-manifest.json"
    results_path = batch_dir / f"batch-{batch}-recognition-results.json"
    links_path = batch_dir / f"word-photo-links.batch-{batch}.json"
    master_path = root / "design-output/photo-word-linking/master-index/photo-linking-master-index.json"
    summary_path = root / "design-output/photo-word-linking/master-index/photo-linking-master-summary.json"

    valid_ids = {word["id"] for word in load_json(root / "public/content/words/ket_vocabulary.json")["words"]}
    manifest = load_json(manifest_path)
    tsv_rows = parse_tsv(__import__("sys").stdin.read())
    entries = manifest["entries"]
    if len(tsv_rows) != len(entries):
        raise SystemExit(f"TSV row count {len(tsv_rows)} does not match manifest count {len(entries)}")

    results = []
    for index, (entry, row) in enumerate(zip(entries, tsv_rows), 1):
        base = {
            "slot": entry["slot"],
            "file": entry["file"],
            "sourcePath": entry["sourcePath"],
        }
        if row["primaryWordId"] == "SKIP":
            result = {
                **base,
                "reviewStatus": "skipped",
                "primaryWordId": None,
                "secondaryWordIds": [],
                "confidence": None,
                "visibleObjects": [],
                "descriptionWords": [],
                "captionEn": None,
                "captionZh": None,
                "tags": [],
                "scene": None,
                "peopleCount": None,
                "indoorOutdoor": None,
                "colorMood": None,
                "matchHints": [f"Reviewed in batch-{batch} and intentionally kept skipped."],
                "reason": row["skipReason"],
                "safeForKids": True,
                "skipReason": row["skipReason"],
            }
            results.append(result)
            continue

        ids = [row["primaryWordId"], *row["secondaryWordIds"]]
        bad_ids = [word_id for word_id in ids if word_id not in valid_ids]
        if bad_ids:
            raise SystemExit(f"line {index}: invalid word ids {bad_ids}")

        core = ", ".join(row["descriptionWords"][:3])
        scene = "photo showing " + ", ".join(row["descriptionWords"])
        results.append(
            {
                **base,
                "reviewStatus": "labeled",
                "primaryWordId": row["primaryWordId"],
                "secondaryWordIds": row["secondaryWordIds"],
                "confidence": row["confidence"],
                "visibleObjects": row["descriptionWords"],
                "descriptionWords": row["descriptionWords"],
                "captionEn": f"A {row['indoorOutdoor']} photo showing {core}.",
                "captionZh": f"这是一张{row['indoorOutdoor']}照片，可以看到{core}。",
                "tags": row["descriptionWords"],
                "scene": scene,
                "peopleCount": row["peopleCount"],
                "indoorOutdoor": row["indoorOutdoor"],
                "colorMood": scene,
                "matchHints": [
                    f"Use as a fallback for {row['primaryWordId']}.",
                    (
                        "Secondary candidates: " + ", ".join(row["secondaryWordIds"]) + "."
                        if row["secondaryWordIds"]
                        else "No secondary candidates."
                    ),
                    f"This entry was manually reviewed from the batch-{batch} contact sheet.",
                ],
                "reason": f"The image most clearly matches {row['primaryWordId']} based on the visible {core}.",
                "safeForKids": True,
            }
        )

    labeled = sum(result["reviewStatus"] == "labeled" for result in results)
    skipped = sum(result["reviewStatus"] == "skipped" for result in results)

    manifest["meta"].update(
        {
            "qualityStatus": "manual-contact-sheet-reviewed",
            "recognizedBy": "Codex manual contact-sheet review",
            "notes": f"This batch was manually reviewed slot by slot from batch-{batch} contact sheets.",
            "count": len(entries),
            "labeled": labeled,
            "skipped": skipped,
        }
    )
    for entry, result in zip(entries, results):
        entry.update(
            {
                "reviewStatus": result["reviewStatus"],
                "primaryWordId": result["primaryWordId"],
                "candidateWordIds": (
                    [result["primaryWordId"], *result["secondaryWordIds"]]
                    if result["reviewStatus"] == "labeled"
                    else []
                ),
                "descriptionWords": result["descriptionWords"],
                "peopleCount": result["peopleCount"],
                "indoorOutdoor": result["indoorOutdoor"],
                "confidence": result["confidence"],
            }
        )
        if result["reviewStatus"] == "skipped":
            entry["skipReason"] = result["skipReason"]

    write_json(manifest_path, manifest)
    write_json(
        results_path,
        {
            "meta": {
                "createdAt": "2026-06-13",
                "recognizedBy": "Codex manual contact-sheet review",
                "sourceManifest": str(manifest_path),
                "notes": f"This batch was manually reviewed slot by slot from batch-{batch} contact sheets.",
                "count": len(entries),
                "labeled": labeled,
                "skipped": skipped,
                "qualityStatus": "manual-contact-sheet-reviewed",
            },
            "results": results,
        },
    )

    by_word: dict[str, list[dict]] = defaultdict(list)
    for result in results:
        if result["reviewStatus"] == "labeled":
            by_word[result["primaryWordId"]].append(
                {
                    "sourcePath": result["sourcePath"],
                    "file": result["file"],
                    "type": "real-photo",
                    "confidence": result["confidence"],
                    "sourceSlot": result["slot"],
                    "tags": result["tags"],
                }
            )
    write_json(
        links_path,
        {
            "meta": {
                "version": 1,
                "createdAt": "2026-06-13",
                "source": str(results_path),
                "notes": f"batch-{batch} high-quality manual fallback-photo mapping grouped by primary word id.",
                "qualityStatus": "manual-contact-sheet-reviewed",
            },
            "entries": [{"wordId": word_id, "photos": photos} for word_id, photos in sorted(by_word.items())],
        },
    )

    master = load_json(master_path)
    by_path = {result["sourcePath"]: result for result in results}
    updated = 0
    for entry in master["entries"]:
        result = by_path.get(entry["absolutePath"])
        if not result:
            continue
        updated += 1
        entry["reviewStatus"] = result["reviewStatus"]
        entry["labelSource"] = f"batch-{batch}"
        entry["reviewRef"] = str(results_path)
        if result["reviewStatus"] == "labeled":
            for key in [
                "primaryWordId",
                "secondaryWordIds",
                "descriptionWords",
                "tags",
                "confidence",
                "peopleCount",
                "indoorOutdoor",
                "colorMood",
                "scene",
                "safeForKids",
            ]:
                entry[key] = result[key]
            entry["skipReason"] = None
        else:
            entry.update(
                {
                    "primaryWordId": None,
                    "secondaryWordIds": [],
                    "descriptionWords": [],
                    "tags": [],
                    "confidence": None,
                    "peopleCount": None,
                    "indoorOutdoor": None,
                    "colorMood": None,
                    "scene": None,
                    "safeForKids": True,
                    "skipReason": result["skipReason"],
                }
            )
    if updated != len(entries):
        raise SystemExit(f"master updated {updated}, expected {len(entries)}")

    status = Counter(entry.get("reviewStatus") for entry in master["entries"])
    source = Counter(entry.get("labelSource") for entry in master["entries"])
    primary = Counter(
        entry.get("primaryWordId")
        for entry in master["entries"]
        if entry.get("reviewStatus") == "labeled" and entry.get("primaryWordId")
    )
    master["meta"][
        "notes"
    ] = f"Master index of all candidate photo assets. Batches 1000-{batch} have manual-quality review; remaining batches beyond {batch} need contact sheets and manual review."
    master["stats"] = {
        "byReviewStatus": dict(status),
        "byLabelSource": dict(source),
        "labeledPrimaryWordTop30": primary.most_common(30),
    }
    write_json(master_path, master)
    write_json(
        summary_path,
        {
            "meta": master["meta"],
            "stats": master["stats"],
            "paths": {
                "masterIndex": str(master_path),
                "latestManualBatch": str(results_path),
            },
        },
    )
    print({"batch": batch, "labeled": labeled, "skipped": skipped, "masterUpdated": updated, "linksEntries": len(by_word)})


if __name__ == "__main__":
    main()
