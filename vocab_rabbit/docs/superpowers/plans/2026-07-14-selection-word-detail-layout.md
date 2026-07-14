# Selection Word Detail Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen and reorganize only the detail overlay opened after clicking a word on the selection page.

**Architecture:** Add a selection-context modifier to the shared drawer and render a selection-only overview that places the primary image, word information with inline examples, and Oxford image in three columns. Keep the review context on the existing compact markup and use scoped CSS for the wide layout and mobile fallback.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, React server rendering, Vite.

---

### Task 1: Lock the selection-only markup contract

**Files:**
- Modify: `src/components/WordDetailDrawer.test.tsx`
- Modify: `src/components/WordDetailDrawer.tsx`

- [ ] **Step 1: Write the failing component tests**

Add an Oxford image and example sentence to the test word, render both contexts, and assert that selection markup has the modifier, inline examples, and Oxford card while review markup does not use the modifier:

```tsx
expect(selectionMarkup).toContain('word-detail-drawer--selection');
expect(selectionMarkup).toContain('word-detail-drawer__selection-overview');
expect(selectionMarkup).toContain('word-detail-drawer__inline-examples');
expect(selectionMarkup).toContain('word-detail-drawer__selection-oxford');
expect(selectionMarkup).toContain('This is my hand.');
expect(reviewMarkup).not.toContain('word-detail-drawer--selection');
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/components/WordDetailDrawer.test.tsx`

Expected: FAIL because the selection modifier and overview classes do not exist.

- [ ] **Step 3: Implement the selection-only overview**

In `WordDetailDrawer.tsx`:

```tsx
<aside
  className={`word-detail-drawer${context === 'selection' ? ' word-detail-drawer--selection' : ''}`}
  aria-label="单词详情抽屉"
  onClick={(event) => event.stopPropagation()}
>
```

Render `word-detail-drawer__selection-overview` only for `context === 'selection'`. It contains the existing primary media, summary, `word-detail-drawer__inline-examples`, and an optional `word-detail-drawer__selection-oxford`. Keep the current hero and standalone example panel for review context. Exclude Oxford from the lower related-media grid in selection context, while retaining Red Rocket and life photos there.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run src/components/WordDetailDrawer.test.tsx`

Expected: PASS.

### Task 2: Lock and implement the wide responsive layout

**Files:**
- Modify: `scripts/ipad-stacking.test.ts`
- Modify: `src/styles/ipad.css`

- [ ] **Step 1: Write the failing CSS regression test**

Assert the selection-only width, three-column overview, and Oxford height:

```ts
expect(css).toMatch(/\.word-detail-drawer--selection\s*\{[^}]*width:\s*min\(920px, calc\(100% - 24px\)\);/s);
expect(css).toMatch(/\.word-detail-drawer__selection-overview\s*\{[^}]*grid-template-columns:\s*150px minmax\(220px, 1fr\) minmax\(300px, 390px\);/s);
expect(css).toMatch(/\.word-detail-drawer__selection-oxford img\s*\{[^}]*height:\s*390px;/s);
```

- [ ] **Step 2: Run the focused regression test and verify it fails**

Run: `npx vitest run scripts/ipad-stacking.test.ts`

Expected: FAIL because the selection-only CSS rules do not exist.

- [ ] **Step 3: Add the scoped layout CSS**

Add rules equivalent to:

```css
.word-detail-drawer--selection {
  width: min(920px, calc(100% - 24px));
}

.word-detail-drawer__selection-overview {
  display: grid;
  grid-template-columns: 150px minmax(220px, 1fr) minmax(300px, 390px);
  align-items: start;
  gap: 20px;
}

.word-detail-drawer__selection-oxford img {
  width: 100%;
  height: 390px;
  object-fit: contain;
}
```

Add a no-Oxford modifier that lets the summary span the remaining columns. Under `720px`, stack the overview into one column and set the Oxford image height to `auto` with a safe maximum.

- [ ] **Step 4: Run the focused CSS and component tests**

Run: `npx vitest run scripts/ipad-stacking.test.ts src/components/WordDetailDrawer.test.tsx`

Expected: PASS.

### Task 3: Verify the complete feature

**Files:**
- Verify: `src/components/WordDetailDrawer.tsx`
- Verify: `src/styles/ipad.css`

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test`

Expected: all test files pass.

- [ ] **Step 2: Build the ESA bundle**

Run: `npm run build:esa`

Expected: TypeScript and Vite build succeed and the total file count remains below 2,000.

- [ ] **Step 3: Perform browser visual verification**

Open `http://127.0.0.1:4173/`, enter the selection page, click a word with Oxford and Red Rocket media, and verify the wide drawer, right-side Oxford image, inline examples, lower Red Rocket card, scrolling, and close action.

- [ ] **Step 4: Commit and push**

```bash
git add src/components/WordDetailDrawer.tsx src/components/WordDetailDrawer.test.tsx src/styles/ipad.css scripts/ipad-stacking.test.ts docs/superpowers/specs/2026-07-14-selection-word-detail-layout-design.md docs/superpowers/plans/2026-07-14-selection-word-detail-layout.md
git commit -m "Redesign selection word details"
git push origin main
```
