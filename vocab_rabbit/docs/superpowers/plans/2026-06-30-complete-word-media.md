# Complete Word Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every one of the 1,693 canonical word images with a reviewed 512 by 512 ComfyUI illustration, then add at most one Oxford Tree page and one reviewed life photo to the approved word-detail layout.

**Architecture:** Keep `WordRecord.imagePath` as the canonical ComfyUI image contract. Add a committed Comfy provenance manifest and a guarded batch-acceptance tool so completion is measurable rather than inferred. Export optional source media into separate public asset folders and expose it through one static media index consumed only by the detail drawer.

**Tech Stack:** Python 3, Pillow, local ComfyUI HTTP API, Tesseract OCR, React 19, TypeScript, Vitest, Vite, static JSON/WebP assets.

---

## File Map

**Comfy production and audit**

- Create `tools/comfy_image_inventory.py`: derive and validate canonical Comfy coverage.
- Create `tools/test_comfy_image_inventory.py`: inventory and completion-gate tests.
- Create `tools/apply_accepted_comfy_batch.py`: validate reviewed batches, replace WebPs, and update provenance.
- Create `tools/test_apply_accepted_comfy_batch.py`: replacement and rejection tests.
- Modify `tools/audit_generated_word_images.py`: emit explicit `PENDING`, `ACCEPT`, and `REJECT` review states.
- Modify `tools/generate_comfy_word_image_samples.py`: add category/chunk selection and stronger scene lookup.
- Modify `tools/test_generate_comfy_word_image_samples.py`: cover category selection and ambiguous prompts.
- Create `public/content/words/comfy-image-manifest.json`: committed source of truth for accepted Comfy images.

**Associated source media**

- Create `tools/export_word_media.py`: select and export one Oxford Tree page and one life photo per word.
- Create `tools/test_export_word_media.py`: resolver, ranking, export, and path-safety tests.
- Create `public/content/words/word-media-index.json`: generated optional-media index.
- Create `public/content/images/oxford/`: one selected WebP per covered word.
- Create `public/content/images/photos/`: one selected WebP per covered word.

**Frontend**

- Create `src/models/word-media.ts`: media-index types.
- Create `src/services/word-media-service.ts`: versioned index and media URLs.
- Create `src/services/word-media-service.test.ts`: URL and missing-entry tests.
- Create `src/components/WordMediaSections.tsx`: approved vertical media hierarchy and viewer.
- Create `src/components/WordMediaSections.test.tsx`: server-rendered hierarchy tests.
- Modify `src/components/WordDetailDrawer.tsx`: render canonical Comfy image followed by optional source sections.
- Modify `src/app/App.tsx`: load media index without blocking vocabulary startup.
- Modify `src/screens/HomePage.tsx`: pass selected-word media to the drawer.
- Modify `src/screens/SelectionPage.tsx`: pass selected-word media to the drawer.
- Modify `src/styles/ipad.css`: responsive source sections and large-image viewer.

## Phase 1: Make Comfy Coverage Auditable

### Task 1: Build the Canonical Comfy Inventory

**Files:**
- Create: `tools/comfy_image_inventory.py`
- Create: `tools/test_comfy_image_inventory.py`
- Create: `public/content/words/comfy-image-manifest.json`

- [ ] **Step 1: Write failing tests for inventory validation**

```python
def test_inventory_reports_missing_word_ids(tmp_path):
    words = [{"id": "ket_a"}, {"id": "ket_b"}]
    manifest = {"version": 1, "images": [{"wordId": "ket_a", "status": "accepted"}]}
    report = MODULE.validate_inventory(words, manifest, tmp_path)
    assert report["accepted"] == 1
    assert report["missingWordIds"] == ["ket_b"]


def test_inventory_rejects_non_square_or_non_webp_assets(tmp_path):
    image_path = tmp_path / "ket_a.webp"
    Image.new("RGB", (800, 600), "white").save(image_path, "WEBP")
    result = MODULE.inspect_image(image_path)
    assert result == {"exists": True, "format": "WEBP", "width": 800, "height": 600, "valid": False}
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
python3 -m unittest tools/test_comfy_image_inventory.py
```

Expected: import or attribute failure because the inventory module does not exist.

- [ ] **Step 3: Implement inventory parsing and image inspection**

Implement these public functions:

```python
def inspect_image(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False, "format": None, "width": 0, "height": 0, "valid": False}
    with Image.open(path) as image:
        width, height = image.size
        image_format = image.format
    return {
        "exists": True,
        "format": image_format,
        "width": width,
        "height": height,
        "valid": image_format == "WEBP" and width == 512 and height == 512,
    }


def validate_inventory(words: list[dict[str, Any]], manifest: dict[str, Any], image_root: Path) -> dict[str, Any]:
    accepted = {item["wordId"]: item for item in manifest["images"] if item["status"] == "accepted"}
    word_ids = {word["id"] for word in words}
    invalid = [
        word_id for word_id in sorted(accepted)
        if word_id not in word_ids or not inspect_image(image_root / f"{word_id}.webp")["valid"]
    ]
    missing = sorted(word_ids - accepted.keys())
    return {
        "totalWords": len(word_ids),
        "accepted": len(accepted),
        "remaining": len(missing),
        "missingWordIds": missing,
        "invalidWordIds": invalid,
        "complete": not missing and not invalid,
    }
```

- [ ] **Step 4: Seed the provenance manifest from proven image commits**

Read image paths changed by:

```bash
git show --pretty= --name-only d8d94aa 72f1e3a 8b246d2 1153805
```

Write one sorted record per unique word ID:

```json
{
  "version": 1,
  "images": [
    {
      "wordId": "ket_dad_n",
      "status": "accepted",
      "source": "historical-verified-commit",
      "commit": "d8d94aa",
      "width": 512,
      "height": 512
    }
  ]
}
```

The seeded manifest must report exactly `278` accepted and `1415` remaining.

- [ ] **Step 5: Verify GREEN and commit locally**

Run:

```bash
python3 -m unittest tools/test_comfy_image_inventory.py
python3 tools/comfy_image_inventory.py --check
```

Expected: tests pass; report shows total `1693`, accepted `278`, remaining `1415`, invalid `0`.

Commit:

```bash
git add tools/comfy_image_inventory.py tools/test_comfy_image_inventory.py public/content/words/comfy-image-manifest.json
git commit -m "Add auditable Comfy image inventory"
```

### Task 2: Guard Batch Acceptance

**Files:**
- Create: `tools/apply_accepted_comfy_batch.py`
- Create: `tools/test_apply_accepted_comfy_batch.py`
- Modify: `tools/audit_generated_word_images.py`
- Modify: `public/content/words/comfy-image-manifest.json`

- [ ] **Step 1: Write failing tests for review-state enforcement**

```python
def test_load_review_requires_every_record_to_be_decided(tmp_path):
    review = tmp_path / "manual-review.tsv"
    review.write_text(
        "ordinal\twordId\tenglish\tstatus\tnotes\n"
        "1\tket_a\ta\tACCEPT\tclear\n"
        "2\tket_b\tb\tPENDING\t\n",
        encoding="utf-8",
    )
    with self.assertRaisesRegex(ValueError, "PENDING"):
        MODULE.load_review(review)


def test_apply_batch_copies_only_accepted_images_and_updates_manifest(tmp_path):
    result = MODULE.apply_batch(run_dir, image_root, manifest_path, backup_root)
    self.assertEqual(result["acceptedWordIds"], ["ket_a"])
    self.assertEqual(result["rejectedWordIds"], ["ket_b"])
    self.assertTrue((image_root / "ket_a.webp").exists())
    self.assertFalse((image_root / "ket_b.webp").exists())
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
python3 -m unittest tools/test_apply_accepted_comfy_batch.py
```

Expected: import failure because the acceptance tool does not exist.

- [ ] **Step 3: Change audit output to explicit decisions**

The audit TSV must begin every row with `PENDING`, even when OCR is empty:

```python
file.write("ordinal\twordId\tenglish\tstatus\tnotes\n")
for record in enriched:
    notes = f"OCR: {record['ocrText']}" if record["ocrText"] else ""
    file.write(
        f"{record['ordinal']}\t{record['wordId']}\t{record['english']}\tPENDING\t{notes}\n"
    )
```

Allowed final states are exactly `ACCEPT` and `REJECT`.

- [ ] **Step 4: Implement guarded replacement**

`apply_batch()` must:

1. Refuse any `PENDING` or unknown review state.
2. Verify every accepted PNG decodes and is exactly 512 by 512.
3. Back up the current canonical WebP under the run directory.
4. Convert only accepted PNGs to WebP quality 88, method 6.
5. Append or replace provenance by `wordId`.
6. Record run ID, seed, prompt, review notes, and UTC acceptance time.
7. Leave rejected canonical images unchanged.

Use an atomic temporary file:

```python
temporary = destination.with_suffix(".webp.tmp")
with Image.open(sample_path) as image:
    image.convert("RGB").save(temporary, "WEBP", quality=88, method=6)
temporary.replace(destination)
```

- [ ] **Step 5: Run focused and inventory tests**

Run:

```bash
python3 -m unittest tools/test_apply_accepted_comfy_batch.py
python3 -m unittest tools/test_comfy_image_inventory.py
```

Expected: all tests pass and the existing 278-image inventory remains valid.

- [ ] **Step 6: Commit locally**

```bash
git add tools/audit_generated_word_images.py tools/apply_accepted_comfy_batch.py tools/test_apply_accepted_comfy_batch.py
git commit -m "Guard reviewed Comfy batch acceptance"
```

## Phase 2: Generate and Review the Remaining 1,415 Images

### Task 3: Add Deterministic Category and Chunk Selection

**Files:**
- Modify: `tools/generate_comfy_word_image_samples.py`
- Modify: `tools/test_generate_comfy_word_image_samples.py`

- [ ] **Step 1: Write failing selection tests**

```python
def test_select_words_excludes_manifested_ids_and_sorts_by_word_id(self):
    words = [
        {"id": "ket_c", "category": "食物和饮料"},
        {"id": "ket_a", "category": "食物和饮料"},
        {"id": "ket_b", "category": "天气"},
    ]
    selected = MODULE.select_words(
        words,
        accepted_ids={"ket_c"},
        category="食物和饮料",
        offset=0,
        limit=30,
    )
    self.assertEqual([word["id"] for word in selected], ["ket_a"])
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
python3 -m unittest tools/test_generate_comfy_word_image_samples.py
```

Expected: failure because `select_words` does not exist.

- [ ] **Step 3: Implement selection and CLI flags**

Add:

```python
parser.add_argument("--category")
parser.add_argument("--accepted-manifest", type=Path, default=COMFY_MANIFEST_PATH)
```

Implement selection:

```python
def select_words(words, accepted_ids, category, offset, limit):
    candidates = [
        word for word in words
        if word["id"] not in accepted_ids
        and (category is None or word.get("category") == category)
    ]
    candidates.sort(key=lambda word: word["id"])
    return candidates[offset: offset + limit]
```

- [ ] **Step 4: Verify tests and a dry selection**

```bash
python3 -m unittest tools/test_generate_comfy_word_image_samples.py
python3 tools/generate_comfy_word_image_samples.py --category "工作和职业" --limit 1 --list-only
```

Expected: tests pass and one unaccepted word is printed without queueing ComfyUI.

- [ ] **Step 5: Commit locally**

```bash
git add tools/generate_comfy_word_image_samples.py tools/test_generate_comfy_word_image_samples.py
git commit -m "Add deterministic Comfy batch selection"
```

### Task 4: Execute the Full Category Pipeline

**Files:**
- Modify repeatedly: `tools/generate_comfy_word_image_samples.py`
- Modify repeatedly: `tools/test_generate_comfy_word_image_samples.py`
- Modify repeatedly: `public/content/images/words/*.webp`
- Modify repeatedly: `public/content/words/comfy-image-manifest.json`

- [ ] **Step 1: Verify ComfyUI before each work session**

```bash
curl -fsS http://127.0.0.1:8188/system_stats | jq '{os:.system.os, device:.devices[0].name}'
```

Expected: Darwin and an MPS device. If unavailable, restart the known local
ComfyUI installation and repeat the check before queueing images.

- [ ] **Step 2: Process concrete categories first**

Use this order:

```text
工作和职业
衣服和配饰
房子和家具
食物和饮料
运动和比赛
出行和交通
身体、健康和锻炼
学校和学习
娱乐和表演
爱好和休闲
购物买东西
书本、证件和文字
通讯、网络和数码
时间和日期
```

For each category, repeat chunks of at most 30:

```bash
python3 tools/generate_comfy_word_image_samples.py \
  --category "工作和职业" \
  --limit 30 \
  --width 512 \
  --height 512
```

- [ ] **Step 3: Audit every generated chunk**

```bash
run_dir=$(find design-output/word-image-generation -maxdepth 1 -type d \
  -name 'comfy-sample-*' | sort | tail -1)
python3 tools/audit_generated_word_images.py \
  --run-dir "$run_dir" \
  --page-size 30
```

Inspect every labeled review sheet at original detail. Set each TSV row to
`ACCEPT` or `REJECT`. Reject wrong sense, ambiguity, unreadable composition,
text, letters, numbers, labels, logos, watermarks, or unsafe content.

- [ ] **Step 4: Strengthen prompts before retries**

Before changing an ambiguous prompt, add a failing assertion:

```python
def test_ambulance_scene_uses_emergency_visual_cues(self):
    prompt = MODULE.build_prompt(words["ket_ambulance_n"])
    self.assertIn("paramedics pushing an empty stretcher", prompt)
```

Run the test to see the intended failure, then add the minimal scene hint and
rerun the test. Generate only rejected IDs:

```bash
python3 tools/generate_comfy_word_image_samples.py \
  --allow-approved \
  --word-ids ket_example_id \
  --width 512 \
  --height 512
```

- [ ] **Step 5: Apply only fully reviewed batches**

```bash
python3 tools/apply_accepted_comfy_batch.py \
  --run-dir "$run_dir"
python3 tools/comfy_image_inventory.py --check
```

Expected: accepted count rises by the number of accepted IDs; rejected count
does not change canonical images.

- [ ] **Step 6: Process abstract and grammatical categories**

Use this order after concrete categories:

```text
常用动作动词
说话和思考动词
常用短语动词
常见形容词
感受和性格
方式和程度副词
时间和频率副词
介词和方向词
人称和指代词
冠词和限定词
连词和句子连接词
情态动词和语气
感叹词和回应语
数量和多少
抽象概念和想法
其他常用词
```

For non-concrete meanings, the scene must demonstrate the meaning through an
observable action or contrast. Do not accept symbolic text, written labels, or
an unrelated attractive scene.

- [ ] **Step 7: Commit locally after each reviewed 50 to 100 images**

Stage exact image paths, prompt code, tests, and provenance manifest:

```bash
awk -F '\t' 'NR > 1 && $4 == "ACCEPT" {
  print "public/content/images/words/" $2 ".webp"
}' "$run_dir/review/manual-review.tsv" | xargs git add --
git add public/content/words/comfy-image-manifest.json \
  tools/generate_comfy_word_image_samples.py \
  tools/test_generate_comfy_word_image_samples.py
git commit -m "Replace reviewed vocabulary illustrations"
```

Do not push.

### Task 5: Enforce the Full 1,693-Image Completion Gate

**Files:**
- Modify: `tools/comfy_image_inventory.py`
- Modify: `tools/test_comfy_image_inventory.py`

- [ ] **Step 1: Write a failing completion-gate test**

```python
def test_require_complete_raises_when_any_word_is_missing():
    report = {"complete": False, "remaining": 1, "invalidWordIds": []}
    with self.assertRaisesRegex(SystemExit, "remaining=1"):
        MODULE.require_complete(report)
```

- [ ] **Step 2: Verify RED, implement, and verify GREEN**

Implement:

```python
def require_complete(report: dict[str, Any]) -> None:
    if not report["complete"]:
        raise SystemExit(
            f"Comfy coverage incomplete: remaining={report['remaining']} "
            f"invalid={len(report['invalidWordIds'])}"
        )
```

Run:

```bash
python3 -m unittest tools/test_comfy_image_inventory.py
python3 tools/comfy_image_inventory.py --require-complete
```

Expected at the end of Phase 2: total `1693`, accepted `1693`, remaining `0`,
invalid `0`, exit code `0`.

- [ ] **Step 3: Run full image decoding and OCR report**

```bash
python3 tools/comfy_image_inventory.py \
  --require-complete \
  --write-report design-output/word-image-audit/comfy-completion-report.json
```

The report must contain every word ID, image SHA-256, format, dimensions,
provenance run, and review decision.

- [ ] **Step 4: Commit the completion gate locally**

```bash
git add tools/comfy_image_inventory.py tools/test_comfy_image_inventory.py \
  public/content/words/comfy-image-manifest.json
git commit -m "Complete Comfy coverage for all vocabulary words"
```

## Phase 3: Export One Oxford Image and One Life Photo

### Task 6: Build the Word Media Exporter

**Files:**
- Create: `tools/export_word_media.py`
- Create: `tools/test_export_word_media.py`
- Create: `public/content/words/word-media-index.json`
- Create: `public/content/images/oxford/`
- Create: `public/content/images/photos/`

- [ ] **Step 1: Write failing resolver and ranking tests**

```python
def test_resolve_oxford_ref_finds_book_and_page(tmp_path):
    pdf = tmp_path / "Level 1" / "1-15 six in a bed.pdf"
    pdf.parent.mkdir()
    pdf.write_bytes(b"%PDF fixture")
    result = MODULE.resolve_oxford_ref(tmp_path, {"level": 1, "book": 15, "page": 3})
    self.assertEqual(result, (pdf, 3))


def test_choose_photo_prefers_safe_primary_then_confidence():
    chosen = MODULE.choose_photo("ket_dad_n", entries)
    self.assertEqual(chosen["id"], "photo-primary-safe-high")
```

- [ ] **Step 2: Run tests and verify RED**

```bash
python3 -m unittest tools/test_export_word_media.py
```

Expected: import failure because the exporter does not exist.

- [ ] **Step 3: Implement deterministic Oxford resolution**

Match PDFs with:

```python
pattern = f"{level}-{book:02d} *.pdf"
matches = sorted((oxford_root / f"Level {level}").glob(pattern))
```

Verify `1 <= page <= pdf_page_count`. Try refs in source order and stop at the
first valid page.

- [ ] **Step 4: Implement photo ranking**

Use tuple ordering:

```python
def photo_rank(entry, word_id):
    primary = entry.get("primaryWordId") == word_id
    secondary = word_id in (entry.get("secondaryWordIds") or [])
    return (
        entry.get("safeForKids") is True,
        primary,
        secondary,
        float(entry.get("confidence") or 0),
        entry.get("id") or "",
    )
```

Exclude skipped, unsafe, missing, or unreadable files.

- [ ] **Step 5: Export bounded WebPs and index**

Render the selected Oxford page at a maximum long edge of 1200 pixels. Apply
EXIF orientation to photos and resize their maximum long edge to 1200 pixels.
Save both as WebP quality 84, method 6.

Write only public relative URLs to:

```json
{
  "version": 1,
  "generatedAt": "ISO-8601 UTC",
  "words": {}
}
```

- [ ] **Step 6: Validate and commit locally**

```bash
python3 -m unittest tools/test_export_word_media.py
python3 tools/export_word_media.py --write
python3 tools/export_word_media.py --check
```

Expected: at most one Oxford image and one photo per word; every indexed asset
exists and decodes; no JSON value starts with `/Users/` or `/Volumes/`.

Commit:

```bash
git add tools/export_word_media.py tools/test_export_word_media.py \
  public/content/words/word-media-index.json \
  public/content/images/oxford public/content/images/photos
git commit -m "Export associated Oxford and life photos"
```

## Phase 4: Implement the Approved Detail Layout

### Task 7: Add Media Types and Loading

**Files:**
- Create: `src/models/word-media.ts`
- Create: `src/services/word-media-service.ts`
- Create: `src/services/word-media-service.test.ts`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing service tests**

```typescript
it('versions the media index URL', () => {
  expect(getWordMediaIndexUrl()).toBe(
    `/content/words/word-media-index.json?v=${CONTENT_VERSION}`,
  );
});

it('returns no associated media for an unknown word', () => {
  expect(getWordMedia({ version: 1, generatedAt: '', words: {} }, 'ket_missing')).toBeNull();
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/services/word-media-service.test.ts
```

Expected: import failure because the service does not exist.

- [ ] **Step 3: Implement types and service**

Define:

```typescript
export interface WordMedia {
  oxfordImage?: {
    level: number;
    book: number;
    page: number;
    imagePath: string;
  };
  photoImage?: {
    photoId: string;
    imagePath: string;
    captionZh: string;
    confidence: number;
  };
}

export interface WordMediaIndex {
  version: 1;
  generatedAt: string;
  words: Record<string, WordMedia>;
}
```

Load the media index in `App.tsx` after vocabulary bootstrap. Catch failure,
store an empty index, and keep the main app usable.

- [ ] **Step 4: Verify and commit locally**

```bash
npm test -- src/services/word-media-service.test.ts
git add src/models/word-media.ts src/services/word-media-service.ts \
  src/services/word-media-service.test.ts src/app/App.tsx
git commit -m "Load optional word media index"
```

### Task 8: Render the Vertical A Layout

**Files:**
- Create: `src/components/WordMediaSections.tsx`
- Create: `src/components/WordMediaSections.test.tsx`
- Modify: `src/components/WordDetailDrawer.tsx`
- Modify: `src/screens/HomePage.tsx`
- Modify: `src/screens/SelectionPage.tsx`
- Modify: `src/styles/ipad.css`

- [ ] **Step 1: Write failing hierarchy tests**

```tsx
it('renders Comfy first, then Oxford, then life photo', () => {
  const markup = renderToStaticMarkup(
    <WordMediaSections word={word} media={media} />,
  );
  expect(markup.indexOf('AI 释义主图')).toBeLessThan(markup.indexOf('牛津树关联图'));
  expect(markup.indexOf('牛津树关联图')).toBeLessThan(markup.indexOf('生活照片'));
});

it('omits absent source sections', () => {
  const markup = renderToStaticMarkup(
    <WordMediaSections word={word} media={null} />,
  );
  expect(markup).toContain('AI 释义主图');
  expect(markup).not.toContain('牛津树关联图');
  expect(markup).not.toContain('生活照片');
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/components/WordMediaSections.test.tsx
```

Expected: import failure because the component does not exist.

- [ ] **Step 3: Implement media sections**

Render:

```tsx
<section className="word-media-section word-media-section--primary">
  <h3>AI 释义主图</h3>
  <img src={getWordImageUrl(word.imagePath)} alt={word.chinese} />
</section>
{media?.oxfordImage ? <OxfordMediaSection image={media.oxfordImage} /> : null}
{media?.photoImage ? <PhotoMediaSection image={media.photoImage} /> : null}
```

Clicking either associated image opens one accessible dialog with a close
button, `aria-modal="true"`, Escape handling, and the full image.

- [ ] **Step 4: Pass selected-word media into both drawers**

Add `media: WordMedia | null` to `WordDetailDrawerProps`. In review and
selection screens, look up:

```typescript
const selectedWordMedia = selectedWord
  ? wordMediaIndex.words[selectedWord.id] ?? null
  : null;
```

The Today Preview, selection-card thumbnail, and learning question components
remain unchanged and continue using `word.imagePath`.

- [ ] **Step 5: Add responsive styling**

The canonical image fills the drawer width up to 560 pixels. Source images use
their natural aspect ratio with `max-height: 520px` and `object-fit: contain`.
No empty panel renders for missing media. The modal image fits within
`min(92vw, 1100px)` by `88vh`.

- [ ] **Step 6: Verify tests and build**

```bash
npm test
npm run build
```

Expected: all tests and TypeScript checks pass.

- [ ] **Step 7: Commit locally**

```bash
git add src/components/WordMediaSections.tsx \
  src/components/WordMediaSections.test.tsx \
  src/components/WordDetailDrawer.tsx \
  src/screens/HomePage.tsx src/screens/SelectionPage.tsx src/styles/ipad.css
git commit -m "Show associated media in word details"
```

## Phase 5: Completion Audit and Local Approval

### Task 9: Verify the Entire Objective

**Files:**
- Create: `design-output/word-image-audit/final-completion-report.json` (ignored local evidence)
- Create: `design-output/word-image-audit/final-ui-desktop.png` (ignored local evidence)
- Create: `design-output/word-image-audit/final-ui-ipad.png` (ignored local evidence)

- [ ] **Step 1: Run all automated gates**

```bash
python3 -m unittest discover -s tools -p 'test_*.py'
python3 tools/comfy_image_inventory.py --require-complete
python3 tools/export_word_media.py --check
npm test
npm run build
```

Expected: all commands exit `0`; Comfy report is exactly 1693 accepted, 0
remaining, 0 invalid.

- [ ] **Step 2: Verify representative runtime states**

Open the local production preview and inspect:

1. A word with both Oxford and photo media.
2. A word with Oxford only.
3. A word with photo only.
4. A word with neither.

Confirm Comfy always appears first, missing sections are absent, associated
images open and close correctly, and the browser console has no errors.

- [ ] **Step 3: Capture desktop and iPad evidence**

Save screenshots and record natural dimensions and URLs for all rendered images
in `final-completion-report.json`.

- [ ] **Step 4: Verify Git and deployment state**

```bash
git status --short
git log --oneline origin/main..HEAD
```

Expected: only intentionally ignored local evidence is untracked; the feature
branch contains local commits and has not been pushed.

- [ ] **Step 5: Present the completed local URL to the user**

Do not push or deploy. Ask the user to review the completed local application.
Only after explicit approval should the branch be integrated and deployed.
