# VocaRabbit Review Page Slice Spec

## Goal

Use the review-page master render as the visual source and regenerate clean sliced assets so the review page can be restored one-to-one in HTML/CSS.

Source references:

- Main render: `design-output/chatgpt-ipad-renders/review-page-original.png`
- Backup reference: `public/design-reference/review-reference.png`

Implementation canvas:

- Device target: 11-inch iPad Pro landscape
- CSS canvas: `1194 x 834`
- Physical export baseline: `2388 x 1668`
- Review content frame used in code: `1158 x ~798`

## Layout Targets In Code

These are the display sizes the sliced assets should match inside the real page:

- Left hero illustration card: `188 x 276` CSS px
- Center headline block: fluid column between left and right cards
- Right focus card main illustration area: `188 x 142` CSS px
- Primary CTA button in focus card: `312 x 60` CSS px
- Summary pills: `3-up`, each about `154 x 96` CSS px
- Metric cards: `4-up`, each about `276 x 118` CSS px
- Preview cards: `4-up`, each about `279 x 182` CSS px
- Preview artwork zone inside each card: `132 x 182` CSS px
- Advice cards: `3-up`, each about `375 x 126` CSS px
- Advice art zone: `110 x 90` CSS px
- Bottom dock buttons: about `262 x 62` CSS px

Export rule:

- All sliced assets should be exported at `2x` the CSS display size.
- Keep background transparent unless the asset is a full-bleed scene for a card.
- Do not rasterize text, numbers, labels, button copy, or UI borders into the slices.

## Required Slice List

### Batch A: Directly used on the review page

1. `review-bunny-scene.png`
   - Type: full-bleed rectangular illustration
   - Display size: `188 x 276`
   - Export size: `376 x 552`
   - Content: white rabbit in warm meadow, soft trees and golden light behind, no text, no extra UI chrome

2. `review-focus-art.png`
   - Type: full-bleed rectangular illustration
   - Display size: `188 x 142`
   - Export size: `376 x 284`
   - Content: small countryside house with path, tree, flowers, same warm storybook lighting, no text

3. `review-preview-family-art.png`
   - Type: transparent PNG cutout
   - Display size: `126 x 118`
   - Export size: `252 x 236`
   - Content: family group illustration matching the review render

4. `review-preview-hello-art.png`
   - Type: transparent PNG cutout
   - Display size: `104 x 104`
   - Export size: `208 x 208`
   - Content: blue hello name-card illustration

5. `review-preview-body-art.png`
   - Type: transparent PNG cutout
   - Display size: `100 x 100`
   - Export size: `200 x 200`
   - Content: flexed arm illustration

6. `review-preview-spark-art.png`
   - Type: transparent PNG cutout
   - Display size: `102 x 112`
   - Export size: `204 x 224`
   - Content: smiling child with sparkles and thumbs-up

7. `review-book-art.png`
   - Type: transparent PNG cutout
   - Display size: `104 x 90`
   - Export size: `208 x 180`
   - Content: cup on stacked books

8. `review-bars-art.png`
   - Type: transparent PNG cutout
   - Display size: `94 x 86`
   - Export size: `188 x 172`
   - Content: rounded blue bar chart cluster

9. `review-bag-art.png`
   - Type: transparent PNG cutout
   - Display size: `96 x 88`
   - Export size: `192 x 176`
   - Content: yellow school bag

### Batch B: Optional for pixel-perfect refinement

10. `review-brand-rabbit-icon.png`
    - Type: transparent PNG or SVG
    - Display size: `34 x 34`
    - Export size: `68 x 68`
    - Content: app rabbit icon only

11. `review-profile-avatar.png`
    - Type: transparent PNG
    - Display size: `28 x 28`
    - Export size: `56 x 56`
    - Content: same parent avatar style as the master render

12. `review-summary-library-icon.png`
    - Type: transparent PNG
    - Display size: `54 x 54`
    - Export size: `108 x 108`
    - Content: stacked books icon

13. `review-summary-mastered-icon.png`
    - Type: transparent PNG
    - Display size: `54 x 54`
    - Export size: `108 x 108`
    - Content: green leaf icon

14. `review-summary-completion-icon.png`
    - Type: transparent PNG
    - Display size: `54 x 54`
    - Export size: `108 x 108`
    - Content: orange completion ring icon

## Paste-Ready Prompt For ChatGPT

Please use the attached review-page master render as the only style reference and generate a sliced asset pack for production UI reconstruction.

Target style:

- warm storybook iPad UI
- creamy white and golden-yellow light
- soft shadows, airy spacing, child-friendly but polished
- clean commercial app illustration quality
- same character faces, same scene mood, same color family as the source render

Hard rules:

- do not include any text, numbers, labels, buttons, borders, cards, or UI chrome inside the exported assets
- keep every asset isolated and production-ready
- use transparent background for cutout assets
- only the two scene assets may keep their own rectangular background
- output at exact pixel sizes listed below
- keep style consistent across all assets

Please generate these files:

1. `review-bunny-scene.png`, exact size `376 x 552`, full-bleed rabbit meadow scene
2. `review-focus-art.png`, exact size `376 x 284`, full-bleed warm house scene
3. `review-preview-family-art.png`, exact size `252 x 236`, transparent family cutout
4. `review-preview-hello-art.png`, exact size `208 x 208`, transparent hello-card cutout
5. `review-preview-body-art.png`, exact size `200 x 200`, transparent arm cutout
6. `review-preview-spark-art.png`, exact size `204 x 224`, transparent child cutout
7. `review-book-art.png`, exact size `208 x 180`, transparent books-and-cup cutout
8. `review-bars-art.png`, exact size `188 x 172`, transparent rounded blue chart cutout
9. `review-bag-art.png`, exact size `192 x 176`, transparent yellow schoolbag cutout

If possible, also generate these optional files for pixel-perfect matching:

10. `review-brand-rabbit-icon.png`, `68 x 68`, transparent
11. `review-profile-avatar.png`, `56 x 56`, transparent
12. `review-summary-library-icon.png`, `108 x 108`, transparent
13. `review-summary-mastered-icon.png`, `108 x 108`, transparent
14. `review-summary-completion-icon.png`, `108 x 108`, transparent

Important:

- keep the same camera angle and illustration style as the source image
- keep soft light bloom and warm highlights
- avoid adding extra props not present in the source
- edges must be clean enough for direct placement in a real web UI
- if one reply cannot output all assets, split them into two batches: Batch A first, Batch B second