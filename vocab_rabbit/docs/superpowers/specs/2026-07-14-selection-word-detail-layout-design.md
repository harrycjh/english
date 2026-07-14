# Selection Word Detail Layout Design

## Scope

Only the right-side detail overlay opened after clicking a word card on the selection page changes. The selection page behind it and the review-page detail drawer keep their current layout.

## Layout

- Add a selection-only drawer modifier and expand its width from `460px` to `920px`, capped to the viewport with a small outer margin.
- Build the selection overview as three columns:
  1. the existing approved/generated word image at `150px` square;
  2. word, meaning, part of speech, status chips, and example sentences;
  3. the Oxford Tree related image and its source label.
- Move example sentences directly below the word metadata in the middle column. Do not render the separate example panel for selection details.
- Move the Oxford Tree card out of the generic related-media grid for selection details. Give its image a `390px` presentation height, 30% taller than the current `300px` cap, with `object-fit: contain` so the page is never cropped.
- Keep Red Rocket and life-photo cards in the related-media section below the overview. If neither exists, omit that section.
- If a word has no Oxford image, let the word-information column use the remaining width instead of showing an empty card.

## Responsive Behavior

- At narrower viewport widths, reduce the selection drawer to the available width.
- Below the existing mobile breakpoint, stack the word image, word information, and Oxford image vertically.
- Preserve scrolling inside the drawer and keep the close/audio controls visible at the top.

## Testing

- Extend component rendering tests to verify the selection-only modifier, inline examples, and Oxford image placement.
- Extend CSS regression tests to verify the `920px` selection width and `390px` Oxford image height.
- Confirm the review context still renders the existing compact drawer.
- Run the full Vitest suite, ESA build, and a browser visual check on the selection page.
