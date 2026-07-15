# Codex Handoff: Photo Word Linking

Use this file when opening a new Codex conversation/workspace for the local copy of `vocab_rabbit`.

## Workspace

- Project root: `/Users/chujianhe/English/vocab_rabbit`
- Photo root: `/Users/chujianhe/Photo`
- Old SSD project root: `/Volumes/ExternalSSD/English/vocab_rabbit`
- Old SSD photo root: `/Volumes/ExternalSSD/Photo`

The old SSD paths still appear inside historical JSON as canonical source paths. Local tools now use:

`/Users/chujianhe/English/vocab_rabbit/design-output/photo-word-linking/path-mapping.local.json`

This maps old SSD paths to the local Mac copy.

## Current Goal

Continue manually labeling the remaining photo candidates so they can be used as fallback word images in the English vocabulary app.

Original long-running objective:

`完成剩下的12646张图`

## Current Progress

Last verified state after applying `batch-9800`:

- Total candidate photos: `17153`
- Labeled: `9652`
- Skipped: `7501`
- Pending: `7346`
- Progress: `57.17%`
- Latest applied batch: `batch-9800`
- Next generated batch: `batch-9900`

`batch-9900` is ready at:

`/Users/chujianhe/English/vocab_rabbit/design-output/photo-word-linking/batch-9900`

Range:

- First canonical source: `/Volumes/ExternalSSD/Photo/Camera/DSC05428.JPG`
- Last canonical source: `/Volumes/ExternalSSD/Photo/Camera/DSC05527.JPG`
- Local first source: `/Users/chujianhe/Photo/Camera/DSC05428.JPG`
- Local last source: `/Users/chujianhe/Photo/Camera/DSC05527.JPG`
- Contact sheets generated: `batch-9900-sheet-1.jpg` through `batch-9900-sheet-5.jpg`
- Unreadable when generated: `0`

## Important Files

- Master index:
  `/Users/chujianhe/English/vocab_rabbit/design-output/photo-word-linking/master-index/photo-linking-master-index.json`
- Master summary:
  `/Users/chujianhe/English/vocab_rabbit/design-output/photo-word-linking/master-index/photo-linking-master-summary.json`
- Word list:
  `/Users/chujianhe/English/vocab_rabbit/public/content/words/ket_vocabulary.json`
- Batch creator:
  `/Users/chujianhe/English/vocab_rabbit/tools/create_photo_contact_batch.py`
- Batch applier:
  `/Users/chujianhe/English/vocab_rabbit/tools/apply_manual_photo_batch.py`
- Local path mapping:
  `/Users/chujianhe/English/vocab_rabbit/design-output/photo-word-linking/path-mapping.local.json`

## Standard Workflow

1. View the five contact sheets for the current batch.
2. Create exactly 100 TSV rows in this format:

```text
primaryWordId|secondaryWordIds comma-list|descriptionWords comma-list|peopleCount|indoorOutdoor|confidence
```

For skipped photos:

```text
SKIP||unreadable|0|indoor|0.0|reason
```

3. Apply the TSV:

```bash
python3 tools/apply_manual_photo_batch.py --batch 9900 < /tmp/batch9900.tsv
```

4. Validate the result and master summary:

```bash
python3 -m json.tool design-output/photo-word-linking/batch-9900/batch-9900-recognition-results.json >/tmp/batch9900.results.valid
python3 -m json.tool design-output/photo-word-linking/master-index/photo-linking-master-summary.json >/tmp/master.summary.valid
```

5. Generate the next batch:

```bash
python3 tools/create_photo_contact_batch.py --batch 10000
```

## Notes For The Next Codex Session

- Work from `/Users/chujianhe/English/vocab_rabbit`, not the old SSD path.
- Do not rewrite the entire master index just to replace old path strings. The local path mapping handles image reads.
- `create_photo_contact_batch.py` now writes both `sourcePath` and `localSourcePath`.
- `apply_manual_photo_batch.py` now defaults to the local project root.
- Keep using valid word IDs from `ket_vocabulary.json`; the applier validates IDs.
- Avoid invalid IDs seen earlier, such as `ket_sand_n`, `ket_shop_n`, `ket_waterfall_n`, and `ket_people_n`.
- For waterfalls, use `ket_river_n`, `ket_water_n`, `ket_mountain_n`, or `ket_forest_n`.
- For sand scenes, use `ket_beach_n`, `ket_drawing_n`, or another visible valid word.

## Recent Completed Batches

- `batch-9200`: 100 labeled, 0 skipped
- `batch-9300`: 100 labeled, 0 skipped
- `batch-9400`: 100 labeled, 0 skipped
- `batch-9500`: 100 labeled, 0 skipped
- `batch-9600`: 100 labeled, 0 skipped
- `batch-9700`: 100 labeled, 0 skipped
- `batch-9800`: 100 labeled, 0 skipped

## Suggested First Prompt In New Conversation

```text
请先读取 /Users/chujianhe/English/vocab_rabbit/docs/codex-handoff-photo-linking.md，然后在 /Users/chujianhe/English/vocab_rabbit 工作区继续照片和单词匹配任务。从 batch-9900 开始，查看 5 张 contact sheet，完成 100 张 TSV 标注，应用到 master index，校验进度，并生成下一批。
```
