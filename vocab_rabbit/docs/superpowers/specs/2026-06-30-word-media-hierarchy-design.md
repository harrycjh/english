# VocaRabbit Word Media Hierarchy Design

## Goal

Give every vocabulary word a clear, reviewed ComfyUI illustration and preserve
source context without allowing source images to replace the teaching image.

The complete target covers all 1,693 words. GitHub deployment remains paused
until generation, media linking, application work, and local verification are
complete.

## Image Hierarchy

Each word can display up to three images in this fixed order:

1. ComfyUI illustration: always present and used as the canonical thumbnail and
   main teaching image.
2. Oxford Tree image: at most one associated page image.
3. Life photo: at most one associated reviewed photo.

The Today Preview, word-selection grid, and learning questions use only the
ComfyUI image. The complete hierarchy appears only after opening word details.

The word-detail view uses the approved vertical layout:

- ComfyUI image at the top.
- Oxford Tree section below it when an associated page is available.
- Life Photo section last when an associated photo is available.
- A missing section is omitted completely.
- An associated image can be opened in a larger viewer.

## Data Model

`WordRecord.imagePath` remains the single canonical ComfyUI image path. Existing
consumers continue to use it for thumbnails, main images, and image questions.

Associated media is stored separately in
`public/content/words/word-media-index.json`:

```json
{
  "version": 1,
  "words": {
    "ket_dad_n": {
      "oxfordImage": {
        "level": 1,
        "book": 15,
        "page": 3,
        "imagePath": "/content/images/oxford/ket_dad_n.webp"
      },
      "photoImage": {
        "photoId": "photo-00003",
        "imagePath": "/content/images/photos/ket_dad_n.webp",
        "captionZh": "家庭生活照片",
        "confidence": 0.92
      }
    }
  }
}
```

The browser never reads local absolute paths. Oxford PDF pages and matched
photos are exported into public WebP assets before they are added to the media
index.

## Association Selection

### Oxford Tree

Choose the first valid `oxfordRef` whose source PDF and referenced page can be
resolved. Render that page into a web-sized WebP. If the first reference cannot
be resolved, continue through the remaining references. If none resolve, omit
the Oxford Tree section.

### Life Photo

Choose one candidate from the reviewed photo master index using this priority:

1. `safeForKids` is true.
2. The word is the candidate's `primaryWordId`.
3. Higher confidence.
4. Stable `photoId` ordering as the final tie-breaker.

Only use a secondary-word match when no valid primary-word match exists. If no
valid reviewed photo exists, omit the Life Photo section.

## ComfyUI Production

Generate images by semantic category in reviewable batches. Ambiguous words
receive dedicated scene prompts before generation.

Every accepted ComfyUI image must:

- Represent the intended word sense clearly without relying on a caption.
- Be child-safe and visually simple.
- Contain no visible words, letters, numbers, logos, labels, or watermarks.
- Be visually inspected using labeled contact sheets.
- Pass OCR as a secondary warning check.
- Be exported as a 512 by 512 WebP.
- Preserve a recoverable run manifest and original-image backup.

OCR is not authoritative: a visually detected text defect is rejected even if
OCR misses it, and an OCR warning can be cleared after inspecting the original
image.

Rejected images are regenerated individually with a more explicit prompt. Only
the accepted retry replaces the canonical word image.

## Application Behavior

The media index loads independently from the vocabulary payload. Failure to
load associated media does not block vocabulary learning: the app continues
with the ComfyUI image and hides unavailable source sections.

The detail drawer:

- Shows the ComfyUI image first.
- Adds source labels and Oxford location metadata.
- Uses native lazy loading for associated images.
- Opens associated images in an accessible large-image viewer.
- Keeps existing selection and learning controls unchanged.

## Verification

Automated generation checks verify:

- All 1,693 word IDs have a canonical image.
- Every canonical image is a readable 512 by 512 WebP.
- Every generated batch has a manifest and review result.
- No accepted image remains on the rejection list.
- Prompt coverage exists for categories and explicitly ambiguous words.

Associated-media checks verify:

- At most one Oxford Tree image and one life photo per word.
- Every indexed public asset exists and decodes.
- No index contains a local absolute path.
- Oxford metadata matches the selected `oxfordRef`.
- Photo IDs and confidence values match the reviewed master index.

Frontend tests verify:

- Preview, selection, and learning views use `imagePath`.
- The detail view renders ComfyUI first.
- Missing associated media hides its section.
- Available Oxford and photo media render in the approved order.
- Associated-image load failure does not hide the ComfyUI image.

Final local verification includes the full test suite, production build,
desktop and iPad screenshots, console-error inspection, and representative
detail views for words with both, one, or neither associated source image.

## Deployment Gate

Do not push or deploy intermediate batches. Deployment is allowed only after:

1. All 1,693 ComfyUI images pass the completion audit.
2. Associated media export and index validation pass.
3. The approved detail layout passes local verification.
4. The user reviews the completed local version and explicitly approves
   deployment.
