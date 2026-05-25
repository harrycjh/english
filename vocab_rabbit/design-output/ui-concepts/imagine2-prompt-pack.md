# VocaRabbit ChatGPT Image iPad Prompt Pack

## Use This Pack For

- Product: VocaRabbit
- Platform: iPad-first HTML5 web app / PWA
- Audience: parent-guided children's English vocabulary learning
- Default pages in this pack: review, selection, stats, settings
- Goal: ask ChatGPT Image to redraw the four parent pages at iPad Pro 11 landscape quality, using the current project structure rather than only the old low-res mockups

## Target Device And Canvas

- Target device: 11-inch iPad Pro, 3rd generation
- Physical render target: 2388 x 1668 px, landscape
- Layout logic: 1194 x 834 CSS viewport inside the image composition
- Output requirement: one page per image, full-screen app canvas, no outer black tablet bezel, no device hand mockup, no perspective tilt

## Recommended ChatGPT Image Workflow

Generate one page at a time, not all four together.

For each page:

1. Upload the matching current reference image from the project.
2. Paste the shared base prompt.
3. Paste the page-specific prompt.
4. Ask for a single image at 2388 x 1668, landscape.

Recommended reference files:

- Review: [public/design-reference/review-reference.png](public/design-reference/review-reference.png)
- Selection: [public/design-reference/selection-reference.png](public/design-reference/selection-reference.png)
- Stats: [public/design-reference/stats-reference.png](public/design-reference/stats-reference.png)
- Settings: [public/design-reference/settings-reference.png](public/design-reference/settings-reference.png)

If ChatGPT Image supports multiple reference images, also upload the higher-resolution original homepage image from Downloads as a style reference for warmth, lighting, and illustration finish.

## Shared Base Prompt

Use this together with one page-specific prompt.

```text
Redraw this interface as a premium iPad-first Chinese educational product UI for VocaRabbit. Keep the layout logic, information hierarchy, and page purpose, but upgrade the fidelity, spacing, illustration finish, lighting, and component consistency. Output a single landscape image at 2388 x 1668 pixels for 11-inch iPad Pro. Use a clean full-screen app canvas, not a physical tablet mockup. Preserve the warm cream, honey, apricot, soft sage, and lake-blue visual language. Make it feel like a high-end family learning product, not an enterprise dashboard and not a generic mobile app. Use large readable simplified Chinese headings and short labels only. Avoid tiny dense text. Keep the bottom navigation consistent across all four pages. Top-left brand is VocaRabbit, with a subtle small version badge if it fits naturally. The page should look production-ready, calm, premium, storybook-inspired, and tailored for parent use on iPad landscape.
```

## Core Art Direction

Use the same visual DNA across all pages:

- warm daylight educational product UI, not generic SaaS
- iPad landscape composition with strong horizontal rhythm and generous breathing room
- editorial + storybook feel, but still clearly a real product interface
- creamy ivory background with sunlit apricot, honey gold, muted lake blue, and soft sage accents
- rabbit and cottage illustrations can appear as supporting scene art, not as noisy stickers
- soft layered cards, rounded 28px corners, subtle depth, tactile shadows, premium spacing
- humanist rounded sans-serif for UI, elegant warm serif only for large hero headlines
- simplified Chinese interface labels, with selected English vocabulary words visible inside cards
- premium but child-friendly, calm, trustworthy, intelligent
- visual consistency across review, selection, stats, settings: same dock, same card system, same palette temperature, same illustration finish

## Shared Negative Prompt

Use this on every page:

```text
ugly layout, generic dribbble shot, purple gradient, dark mode, neon glow, futuristic HUD, cramped mobile UI, black tablet bezel, device frame, too many tiny charts, illegible Chinese text, random gibberish text, stock photo realism, mascot overload, childish toy aesthetic, low contrast, cheap e-learning app, cluttered spacing, inconsistent card styles, misaligned bottom navigation, messy shadows, too much empty white space with no structure, dense spreadsheet look
```

## Shared Output Settings

- aspect ratio: match 2388 x 1668 landscape
- device framing: clean full-screen product shot, no outer device shell
- resolution target: exact iPad Pro 11 landscape output if supported, otherwise nearest high-res landscape equivalent
- camera: straight-on product design shot, no extreme perspective
- text rule: only large headings, short labels, big numerals, sparse supporting copy
- consistency tip: keep the same palette, card radius, bottom navigation style, illustration rendering, and typography across all pages

## Prompt 1: Review Page

### Filename

- vocarabbit-review-page.png

### Upload This Reference

- [public/design-reference/review-reference.png](public/design-reference/review-reference.png)

### Prompt

```text
Create the VocaRabbit parent review home page, redesigned for 11-inch iPad Pro landscape at 2388 x 1668. Keep the page purpose of today's study overview. Use a premium warm cream educational UI with soft golden daylight, elegant serif headline, rounded tactile cards, and a gentle rabbit-and-cottage illustration language.

Top area: left side has a rabbit hero illustration and a large Chinese headline “今日学习计划”. Above it, a tiny encouraging line like “坚持每天进步一点点”. Below it, one sentence summarizing today's new words and review words. Add three compact summary pills for total vocabulary, mastered words, and 14-day completion.

Top right: a beautiful focus card with the section label “今日焦点”, a bold theme like “家庭与人物”, a short description, a large warm start button, and a small sunlit cottage illustration.

Middle row: four clean metric cards for today task count, estimated minutes, preview theme count, and 14-day heatmap summary.

Lower area: a “今日预习或今日预览” section with four premium vocabulary preview cards showing words like family, name, arm, better. Each card should show a small illustration, English word, Chinese meaning, level/location hint, and a warm category marker. Under that, a compact “轻量建议” or guidance area with three advisory cards for today's suggestion, future pressure, and current study settings.

Bottom dock navigation with four tabs: 复习, 选词, 统计, 设置. Review tab active. Keep the layout close to the reference structure but make it clearly higher fidelity, more spacious, sharper, and more consistent for iPad.
```

## Prompt 2: Selection Page

### Filename

- vocarabbit-selection-page.png

### Upload This Reference

- [public/design-reference/selection-reference.png](public/design-reference/selection-reference.png)

### Prompt

```text
Create the VocaRabbit vocabulary management page for parents, redesigned for 11-inch iPad Pro landscape at 2388 x 1668. This is the word-library control center. Keep the warm premium family-learning style from the review page, but make the page more operational and structured.

Use a clear 3-column composition. Left column: a filter panel with search field, category selector, Oxford Tree level, difficulty, learning status, image-only toggle, and reset control. Center: the main word library with a heading “词库管理”, a short explanatory subtitle, a segmented card/list view toggle, sorting controls, bulk action chips, and a refined grid of vocabulary cards. Use example words like family, friend, arm, better, after, again.

Each vocabulary card should contain a category badge, status chip, English word, Chinese meaning, part of speech, and Oxford Tree location. The cards should feel collectible and elegant, not spreadsheet-like.

Right column: a plan summary panel with enabled count, paused count, due tomorrow, due in three days, pressure level, and a small category distribution module. Add a warm small house or rabbit support illustration in that summary area.

Bottom dock with 复习, 选词, 统计, 设置. Selection tab active. Keep the design readable and powerful for iPad parents, but never like a cold admin table.
```

## Prompt 3: Stats Page

### Filename

- vocarabbit-stats-page.png

### Upload This Reference

- [public/design-reference/stats-reference.png](public/design-reference/stats-reference.png)

### Prompt

```text
Create the VocaRabbit statistics page for parents, redesigned for 11-inch iPad Pro landscape at 2388 x 1668. This page should feel like a calm learning-rhythm cockpit, not a business dashboard. Preserve the warm premium storybook-product style.

Hero area: left side has a reading rabbit illustration and the headline “把学习节奏看成一张图，而不是一堆按钮”. Add a small eyebrow label “统计页 · 学习节奏看板”, plus one short sentence summarizing enabled words, mastered words, and studied words. Add a row of summary pills: 启用, 学习中, 已掌握, 连续天数.

Right side: a compact focus card labeled “当前节奏”, with a big state like “节奏正常” or “先给未来减压”, a short pressure note, and small plan pills.

Below: four top stat cards for today task, active library, mastered count, and 14-day accuracy. Then large analytics blocks for vocabulary progress distribution, upcoming review pressure, a refined 14-day heatmap with recent task list, and active library distribution by category and level. Use bars, chips, calm blocks, and soft data visuals only. No noisy charts.

Bottom dock with 复习, 选词, 统计, 设置. Stats tab active. The whole image should look premium, organized, readable, and emotionally calm for an iPad parent dashboard.
```

## Prompt 4: Settings Page

### Filename

- vocarabbit-settings-page.png

### Upload This Reference

- [public/design-reference/settings-reference.png](public/design-reference/settings-reference.png)

### Prompt

```text
Create the VocaRabbit settings page for parents, redesigned for 11-inch iPad Pro landscape at 2388 x 1668. Keep the same warm cream premium visual system, but make it the clearest and most controllable page of the set.

Hero area: a warm rabbit desk illustration on the left, eyebrow label “设置页 · 家长控制台”, main title “把学习节奏和本地数据收在这里”, and a short save-status line. Add three summary pills like new words per day, reviews per day, and audio on/off. On the right, a focus card labeled “当前任务影响” with a state such as 今日未开始 or 今日进行中, and a short explanation.

Below, build a calm 2-column settings layout with large tactile cards. Section 1: learning load controls with plus/minus steppers for daily new words and daily review cap. Section 2: learning experience toggles for English audio, image questions, example sentences, and spelling hints. Section 3: device/runtime guidance for iPad standalone mode, Safari environment, and landscape preference. Section 4: data management with safe reset, export, and one clearly dangerous destructive action.

Bottom dock with 复习, 选词, 统计, 设置. Settings tab active. The page should feel premium, reassuring, and readable on iPad, not like a default settings form.
```

## Recommended Generation Order

1. Generate the review page first and lock the visual language.
2. Use the accepted review page as an additional style reference for selection, stats, and settings.
3. Keep the dock, palette temperature, card geometry, and illustration finish identical across all four pages.

## If You Want Even More Stable Results

Append this mini consistency suffix to every page prompt:

```text
Keep the same product design language across all screens: same palette, same rounded card system, same bottom dock, same spacing logic, same shadow softness, same typography pairing, same rabbit/cottage illustration finish, same iPad-first composition.
```

## If You Want A Bolder Alternative Direction

Swap the art direction with this variation:

- more Mediterranean editorial warmth
- terracotta + butter + sea-glass palette
- bigger serif headlines, more asymmetry, more premium magazine rhythm
- still child-friendly, but less cute and more design-forward
