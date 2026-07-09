# ESA Word Image Atlases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 1,693 individual generated word-image files in the ESA build with category-aware 3x3 WebP atlases while preserving existing UI behavior and fallback deployments.

**Architecture:** A pure planner groups vocabulary entries by their existing Chinese category and assigns each image to a stable 3x3 cell. An ESA post-build script composites the copied source images into atlases, writes a manifest, validates complete coverage, removes individual images, and enforces the Pages file limit. The frontend optionally merges that manifest into word records and renders atlas cells through one shared component, falling back to normal image URLs when no manifest exists.

**Tech Stack:** React 19, TypeScript, Vite 7, Vitest, Playwright, Node.js ESM, Sharp, CSS background sprites.

---

### Task 1: Category-Aware Atlas Planner

**Files:**
- Create: `scripts/word-atlas-plan.mjs`
- Create: `scripts/word-atlas-plan.test.ts`

- [ ] **Step 1: Write the failing planner tests**

Test that words remain in source order, categories never share an atlas, groups
contain at most nine entries, and coordinates use 512-pixel cells:

```ts
import { describe, expect, it } from 'vitest';
import { createWordAtlasPlan } from './word-atlas-plan.mjs';

it('chunks each category independently into stable 3x3 atlases', () => {
  const words = Array.from({ length: 11 }, (_, index) => ({
    id: `food-${index}`,
    category: '食物和饮料',
    imagePath: `/content/images/words/food-${index}.webp`,
  })).concat({
    id: 'family-0',
    category: '家人和朋友',
    imagePath: '/content/images/words/family-0.webp',
  });

  const plan = createWordAtlasPlan(words);

  expect(plan.atlases.map((atlas) => atlas.entries.length)).toEqual([9, 2, 1]);
  expect(plan.atlases[0].entries[4]).toMatchObject({
    imagePath: '/content/images/words/food-4.webp',
    row: 1,
    column: 1,
    x: 512,
    y: 512,
  });
  expect(plan.atlases[2].category).toBe('家人和朋友');
});
```

- [ ] **Step 2: Run the planner test and verify RED**

Run: `npx vitest run scripts/word-atlas-plan.test.ts`

Expected: FAIL because `word-atlas-plan.mjs` does not exist.

- [ ] **Step 3: Implement the pure planner**

Export constants for a 3x3 grid and implement:

```js
export const ATLAS_COLUMNS = 3;
export const ATLAS_ROWS = 3;
export const CELL_SIZE = 512;

export function createWordAtlasPlan(words) {
  // Preserve first-seen category order and source order within each category.
  // Return { atlases, entries } with deterministic category-NNN/atlas-NNN paths.
}
```

Use ASCII paths such as
`/content/images/word-atlases/category-000/atlas-000.webp`; store the original
Chinese category in manifest metadata.

- [ ] **Step 4: Run the planner test and verify GREEN**

Run: `npx vitest run scripts/word-atlas-plan.test.ts`

Expected: 1 test file passes.

- [ ] **Step 5: Commit the planner**

```bash
git add vocab_rabbit/scripts/word-atlas-plan.mjs vocab_rabbit/scripts/word-atlas-plan.test.ts
git commit -m "Add category-aware word atlas planner"
```

### Task 2: ESA Atlas Builder

**Files:**
- Create: `scripts/build-word-atlases.mjs`
- Create: `scripts/build-word-atlases.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.env.esa`

- [ ] **Step 1: Add Sharp as a development dependency**

Run: `npm install --save-dev sharp`

Expected: `sharp` appears in `devDependencies`; audit reports zero
vulnerabilities.

- [ ] **Step 2: Write the failing builder test**

Create a temporary `dist` containing a small vocabulary payload and ten
512x512 WebP files generated with Sharp. Assert that:

```ts
const result = await buildWordAtlases({ distDir, maxFiles: 2000 });
expect(result.sourceImages).toBe(10);
expect(result.atlasImages).toBe(2);
expect(await pathExists(join(distDir, 'content/images/words'))).toBe(false);
expect(manifest.entries).toHaveLength(10);
```

Also test that a 511x512 source image rejects with an error containing
`Expected 512x512`.

- [ ] **Step 3: Run the builder test and verify RED**

Run: `npx vitest run scripts/build-word-atlases.test.ts`

Expected: FAIL because `build-word-atlases.mjs` does not exist.

- [ ] **Step 4: Implement the builder**

Export:

```js
export async function buildWordAtlases({ distDir, maxFiles = 2000 }) {
  // Read ket_vocabulary.json, validate unique image paths and dimensions,
  // composite transparent 1536x1536 canvases with Sharp, write WebP atlases,
  // write word_image_atlas.json, validate coverage, remove individual images,
  // count output files, and reject when count >= maxFiles.
}
```

Use `sharp({ create: { width: 1536, height: 1536, channels: 4, background:
{ r: 255, g: 255, b: 255, alpha: 0 } } })`, composite each source at its
planned `x` and `y`, and encode with WebP quality 90.

The manifest shape is:

```json
{
  "schemaVersion": 1,
  "grid": { "columns": 3, "rows": 3, "cellSize": 512 },
  "stats": { "sourceImages": 1693, "atlasImages": 212 },
  "entries": {
    "/content/images/words/ket_dad_n.webp": {
      "atlasPath": "/content/images/word-atlases/category-000/atlas-000.webp",
      "row": 0,
      "column": 0
    }
  }
}
```

- [ ] **Step 5: Configure ESA and GitHub build boundaries**

Set scripts to:

```json
{
  "build": "npm run build:esa",
  "build:github": "tsc --noEmit && vite build --mode github-pages",
  "build:esa": "tsc --noEmit && vite build --mode esa && node scripts/build-word-atlases.mjs dist",
  "preview": "npm run build:github && node scripts/preview-github-pages.mjs"
}
```

Set `.env.esa` to:

```dotenv
VITE_BASE_PATH=/
```

- [ ] **Step 6: Run the builder tests and verify GREEN**

Run: `npx vitest run scripts/build-word-atlases.test.ts`

Expected: both success and invalid-dimension tests pass.

- [ ] **Step 7: Commit the builder**

```bash
git add vocab_rabbit/scripts vocab_rabbit/package.json vocab_rabbit/package-lock.json vocab_rabbit/.env.esa
git commit -m "Build category word atlases for ESA"
```

### Task 3: Atlas Manifest Loading

**Files:**
- Modify: `src/models/word.ts`
- Create: `src/services/word-atlas-service.ts`
- Create: `src/services/word-atlas-service.test.ts`
- Modify: `src/services/word-service.ts`
- Modify: `src/services/word-service.test.ts`

- [ ] **Step 1: Write failing manifest merge and style tests**

Define the expected public API:

```ts
expect(mergeWordAtlasManifest(payload, manifest).words[0].imageAtlas).toEqual({
  atlasPath: '/content/images/word-atlases/category-000/atlas-000.webp',
  row: 1,
  column: 2,
});

expect(getWordAtlasStyle(entry)).toMatchObject({
  backgroundSize: '300% 300%',
  backgroundPosition: '100% 50%',
});
```

Add a URL test expecting
`/content/words/word_image_atlas.json?v=<content-version>`.

- [ ] **Step 2: Run the service tests and verify RED**

Run:
`npx vitest run src/services/word-atlas-service.test.ts src/services/word-service.test.ts`

Expected: FAIL because atlas types and services do not exist.

- [ ] **Step 3: Add atlas types and pure helpers**

Add `WordImageAtlasEntry`, `WordImageAtlasManifest`, and optional
`imageAtlas?: WordImageAtlasEntry` to `WordRecord`. Implement immutable manifest
merging and percentage-based CSS positioning.

- [ ] **Step 4: Load the optional manifest with the vocabulary**

Add `getWordImageAtlasUrl()` and a loader that returns `null` only for HTTP 404.
Fetch vocabulary, related media, and atlas manifest in parallel, then apply both
merge functions.

- [ ] **Step 5: Run the service tests and verify GREEN**

Run:
`npx vitest run src/services/word-atlas-service.test.ts src/services/word-service.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit manifest support**

```bash
git add vocab_rabbit/src/models/word.ts vocab_rabbit/src/services
git commit -m "Load word image atlas metadata"
```

### Task 4: Shared Word Image Renderer

**Files:**
- Create: `src/components/WordImage.tsx`
- Create: `src/components/WordImage.test.tsx`
- Modify: `src/screens/HomePage.tsx`
- Modify: `src/components/QuestionImage.tsx`
- Modify: `src/components/WordDetailDrawer.tsx`
- Modify: `src/screens/SelectionPage.tsx`
- Modify: `src/styles/ipad.css`

- [ ] **Step 1: Write the failing renderer test**

Render a word with atlas metadata and assert the accessible image uses the atlas
URL and `300% 300%` background sizing. Render a word without metadata and assert
an ordinary `<img>` uses `getWordImageUrl`.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npx vitest run src/components/WordImage.test.tsx`

Expected: FAIL because `WordImage.tsx` does not exist.

- [ ] **Step 3: Implement `WordImage`**

Expose:

```tsx
interface WordImageProps {
  word: WordRecord;
  alt: string;
  className?: string;
  onError?: () => void;
}
```

Render `<span role="img" aria-label={alt}>` with atlas background styles when
`word.imageAtlas` exists; otherwise render the current `<img>`. Keep the atlas
element block-level and make its background fill the same square area as the
former image.

- [ ] **Step 4: Replace the four direct word-image renderers**

Use `WordImage` in HomePage, QuestionImage, WordDetailDrawer, and SelectionPage.
Keep SelectionPage demo artwork as an ordinary `<img>` and retain its existing
error fallback.

- [ ] **Step 5: Run component and interaction tests**

Run: `npm test`

Expected: all unit tests pass.

Run: `npm run test:interactions`

Expected: all Playwright interaction tests pass.

- [ ] **Step 6: Commit the renderer**

```bash
git add vocab_rabbit/src/components vocab_rabbit/src/screens vocab_rabbit/src/styles/ipad.css
git commit -m "Render generated word images from atlases"
```

### Task 5: Real Build and Browser Verification

**Files:**
- No planned source changes. If verification fails, return to the owning task,
  add a reproducing test, and fix that component before repeating this task.

- [ ] **Step 1: Run the complete ESA build**

Run: `npm run build:esa`

Expected: build succeeds and reports 1,693 source images, 212 atlases, complete
manifest coverage, and fewer than 2,000 output files.

- [ ] **Step 2: Verify the output structurally**

Run:

```bash
find dist -type f | wc -l
find dist/content/images/word-atlases -type f -name '*.webp' | wc -l
test ! -d dist/content/images/words
jq '.stats, (.entries | length)' dist/content/words/word_image_atlas.json
```

Expected: total below 2,000; 212 WebP atlases; no individual directory; manifest
entry count 1,693.

- [ ] **Step 3: Run all automated verification**

Run: `npm test`

Expected: all unit tests pass.

Run: `npm run test:interactions`

Expected: all interaction tests pass.

- [ ] **Step 4: Preview the ESA output**

Run: `npx vite preview --host 127.0.0.1 --port 4174`

Use Playwright at desktop and iPad viewport sizes. Verify representative words
from at least three categories on the home preview, question screen, detail
drawer, and selection screen. Confirm computed atlas backgrounds are nonempty,
requests return 200, and the browser console has no errors.

- [ ] **Step 5: Commit verification fixes**

```bash
git add vocab_rabbit
git commit -m "Verify ESA word atlas deployment"
```

- [ ] **Step 6: Report the deployment boundary**

Report exact file count, atlas count, tests, and browser checks. State explicitly
that the branch remains local and has not been pushed or deployed.
