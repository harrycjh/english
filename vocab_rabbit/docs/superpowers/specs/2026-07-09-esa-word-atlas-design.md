# ESA Word Image Atlas Design

## Goal

Reduce the VocaRabbit ESA Pages deployment below the 2,000-file limit without
moving images to GitHub Pages, OSS, or another ESA project.

The 1,693 generated word images remain visually unchanged. They are packed into
category-aware 3x3 WebP atlases for the ESA build so words from the same topic
reuse downloaded atlas files.

## Scope

This change applies only to generated word images under
`public/content/images/words`.

Oxford Tree images and locally imported life photos keep their existing storage
and rendering behavior. GitHub Pages and local development continue to support
the existing individual word images.

## Atlas Layout

- Read the canonical word order and categories from
  `public/content/words/ket_vocabulary.json`.
- Group words by their existing Chinese topic category.
- Preserve vocabulary order within each category.
- Split each category into groups of at most nine words.
- Place each group in a fixed 3x3 grid.
- Keep every source image at 512x512 pixels.
- Produce a 1536x1536 WebP atlas without resizing individual images.
- Name atlas files deterministically from a safe category identifier and
  zero-based group number.

The current vocabulary produces 212 atlas images. Replacing the 1,693 individual
files with those atlases and one manifest reduces the current complete
deployment from 2,978 files to an estimated 1,498.

## Manifest

The ESA build generates a JSON manifest containing:

- schema version
- generation timestamp
- source image count
- atlas image count
- grid and cell dimensions
- one entry per word image
- atlas path, row, column, and pixel coordinates for each entry

Entries are keyed by the existing word image path so the application can attach
atlas metadata without changing word IDs or vocabulary content.

## Runtime Rendering

The vocabulary loader requests the optional atlas manifest alongside the
existing word payload and related-media manifest.

When an atlas entry exists, a shared word-image component renders the matching
512x512 cell with CSS background positioning. It preserves the accessible image
label and the square sizing behavior used by current screens.

When the atlas manifest is missing or a word has no atlas entry, the component
falls back to the existing individual `<img>` URL. This keeps local development
and GitHub Pages compatible and provides a safe migration path.

The shared component replaces direct word-image rendering in:

- home preview cards
- question image stages
- word detail drawer
- selection/review screens

Demo artwork and Oxford Tree images are not routed through the atlas renderer.

## ESA Build

The ESA-specific build performs these steps:

1. Type-check and run the normal Vite production build.
2. Generate category-aware atlases and the manifest inside `dist`.
3. Validate that all 1,693 source word images have exactly one manifest entry.
4. Remove `dist/content/images/words`.
5. Count all output files and fail if the total is 2,000 or greater.

The normal GitHub build does not remove individual word images.

## Failure Handling

The atlas builder fails with a specific error when:

- a vocabulary image path is missing
- an image is not 512x512
- an image appears more than once
- an atlas or manifest cannot be written
- manifest coverage differs from the vocabulary image count
- the final ESA output reaches the platform file limit

Runtime manifest requests treat HTTP 404 as atlas support being unavailable and
use individual images. Other manifest-loading failures are reported through the
existing vocabulary loading error path.

## Verification

- Unit-test category grouping, stable ordering, chunking, and coordinate
  calculation.
- Unit-test manifest merging and individual-image fallback.
- Run the real ESA build.
- Confirm the manifest contains 1,693 unique entries.
- Confirm no individual word images remain in the ESA output.
- Confirm the final output has fewer than 2,000 files.
- Run all frontend unit tests.
- Use Playwright to verify representative home, question, detail, and selection
  images render nonblank at desktop and iPad viewport sizes.

## Deployment Boundary

Implementation and verification remain local until the user explicitly approves
uploading or deploying the result.
