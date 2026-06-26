#!/usr/bin/env python3
"""Create a manual-review photo contact-sheet batch.

The batch selects the next N master-index entries whose labelSource is still
``master-finalize-pending``. It writes a pending manifest, a source path list,
and 4x5 contact sheets for manual recognition.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DEFAULT_ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_path_mappings(root: Path) -> list[tuple[str, str]]:
    mapping_path = root / "design-output/photo-word-linking/path-mapping.local.json"
    if not mapping_path.exists():
        return []
    payload = load_json(mapping_path)
    mappings = []
    for item in payload.get("pathMappings", []):
        old_prefix = item.get("from")
        new_prefix = item.get("to")
        if old_prefix and new_prefix:
            mappings.append((old_prefix.rstrip("/"), new_prefix.rstrip("/")))
    return mappings


def resolve_mapped_path(path: str, mappings: list[tuple[str, str]]) -> str:
    for old_prefix, new_prefix in mappings:
        if path == old_prefix or path.startswith(old_prefix + "/"):
            return new_prefix + path[len(old_prefix) :]
    return path


def get_font(size: int) -> ImageFont.ImageFont:
    for font_path in (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(font_path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def create_contact_sheets(
    batch_dir: Path, batch: int, entries: list[dict], mappings: list[tuple[str, str]]
) -> list[str]:
    width, height = 880, 1005
    cols, rows = 4, 5
    margin, gap, label_height = 15, 10, 34
    cell_width = (width - 2 * margin - (cols - 1) * gap) // cols
    cell_height = (height - 2 * margin - (rows - 1) * gap) // rows
    thumb_height = cell_height - label_height
    font = get_font(14)
    small_font = get_font(11)
    unreadable: list[str] = []

    for sheet_index in range((len(entries) + cols * rows - 1) // (cols * rows)):
        sheet = Image.new("RGB", (width, height), "white")
        draw = ImageDraw.Draw(sheet)
        sheet_entries = entries[sheet_index * cols * rows : (sheet_index + 1) * cols * rows]

        for index, entry in enumerate(sheet_entries):
            row, col = divmod(index, cols)
            x = margin + col * (cell_width + gap)
            y = margin + row * (cell_height + gap)
            draw.rounded_rectangle(
                [x, y, x + cell_width, y + cell_height],
                radius=10,
                outline=(210, 210, 210),
                width=1,
                fill=(250, 250, 250),
            )
            image_box = (x + 5, y + 5, x + cell_width - 5, y + thumb_height - 3)
            try:
                image_path = resolve_mapped_path(entry["sourcePath"], mappings)
                image = Image.open(image_path).convert("RGB")
                image.thumbnail(
                    (image_box[2] - image_box[0], image_box[3] - image_box[1]),
                    Image.Resampling.LANCZOS,
                )
                paste_x = image_box[0] + ((image_box[2] - image_box[0]) - image.width) // 2
                paste_y = image_box[1] + ((image_box[3] - image_box[1]) - image.height) // 2
                sheet.paste(image, (paste_x, paste_y))
            except Exception:
                draw.rectangle(image_box, fill=(235, 235, 235))
                draw.text((image_box[0] + 8, image_box[1] + 8), "UNREADABLE", fill=(180, 0, 0), font=font)
                unreadable.append(entry["sourcePath"])

            label_y = y + thumb_height + 2
            draw.text((x + 7, label_y), entry["slot"].split("-")[-1], fill=(0, 0, 0), font=font)
            file_name = entry["file"]
            if len(file_name) > 24:
                file_name = file_name[:21] + "..."
            draw.text((x + 40, label_y + 1), file_name, fill=(60, 60, 60), font=small_font)

        sheet.save(batch_dir / f"batch-{batch}-sheet-{sheet_index + 1}.jpg", quality=92)

    return unreadable


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--batch", type=int, required=True)
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--force", action="store_true", help="overwrite an existing batch directory")
    args = parser.parse_args()

    root = Path(args.root)
    path_mappings = load_path_mappings(root)
    link_root = root / "design-output/photo-word-linking"
    master = load_json(link_root / "master-index/photo-linking-master-index.json")
    batch_dir = link_root / f"batch-{args.batch}"
    if batch_dir.exists() and not args.force:
        raise SystemExit(f"{batch_dir} already exists; pass --force to overwrite generated files")
    batch_dir.mkdir(parents=True, exist_ok=True)

    selected = [
        entry for entry in master["entries"] if entry.get("labelSource") == "master-finalize-pending"
    ][: args.count]
    if len(selected) != args.count:
        raise SystemExit(f"need {args.count} pending entries, got {len(selected)}")

    manifest_entries = []
    for index, entry in enumerate(selected, 1):
        manifest_entries.append(
            {
                "slot": f"batch{args.batch}-{index:03d}",
                "file": entry["fileName"],
                "sourcePath": entry["absolutePath"],
                "localSourcePath": resolve_mapped_path(entry["absolutePath"], path_mappings),
                "reviewStatus": "pending",
                "primaryWordId": None,
                "candidateWordIds": [],
                "descriptionWords": [],
                "peopleCount": None,
                "indoorOutdoor": None,
                "confidence": None,
            }
        )

    manifest = {
        "meta": {
            "project": "vocab_rabbit",
            "createdAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
            "photoRoot": "/Volumes/ExternalSSD/Photo",
            "localPhotoRoot": resolve_mapped_path("/Volumes/ExternalSSD/Photo", path_mappings),
            "pathMapping": str(root / "design-output/photo-word-linking/path-mapping.local.json"),
            "selectionSource": "master-index labelSource=master-finalize-pending first pending entries",
            "wordPayload": str(root / "public/content/words/ket_vocabulary.json"),
            "purpose": "manual contact sheet recognition for fallback word photos",
            "qualityStatus": "contact-sheet-ready-not-reviewed",
            "recognizedBy": None,
            "notes": ["Review every slot from contact sheets before applying labels."],
            "count": len(manifest_entries),
            "labeled": None,
            "skipped": None,
        },
        "entries": manifest_entries,
    }

    manifest_path = batch_dir / f"batch-{args.batch}-photo-manifest.json"
    write_json(manifest_path, manifest)
    (batch_dir / "selection-source-paths.txt").write_text(
        "\n".join(entry["sourcePath"] for entry in manifest_entries) + "\n",
        encoding="utf-8",
    )
    (batch_dir / "selection-source-paths.local.txt").write_text(
        "\n".join(entry["localSourcePath"] for entry in manifest_entries) + "\n",
        encoding="utf-8",
    )
    unreadable = create_contact_sheets(batch_dir, args.batch, manifest_entries, path_mappings)
    print(
        {
            "batch": args.batch,
            "batchDir": str(batch_dir),
            "selected": len(manifest_entries),
            "unreadable": len(set(unreadable)),
            "first": selected[0]["absolutePath"],
            "last": selected[-1]["absolutePath"],
            "localFirst": resolve_mapped_path(selected[0]["absolutePath"], path_mappings),
            "localLast": resolve_mapped_path(selected[-1]["absolutePath"], path_mappings),
        }
    )


if __name__ == "__main__":
    main()
