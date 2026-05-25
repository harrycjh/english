# Review Page Notes

- `topChrome`、`brandCluster`、`profileButton`、`heroHeadline`、`summaryPills`、`focusCard`、`metricRow`、`previewSection`、`guidanceSection`、`bottomDock` 必须用 DOM。
- 所有标题、中文说明、数字、统计值、CTA 文案、底部导航文案必须用 DOM，不得烘焙进图片。
- `review-page-layout.json` 里的 `textSafe` 用作文字回填硬边界，正文和数字不得超出。
- `review-page-layout.json` 里的 `iconAnchor`、`artSlot`、`indexBadge`、`favoriteIcon` 用作图标和装饰落点，优先按坐标回填，不再用肉眼二次对齐。
- `review-page-layout.json` 里的 `layers` 和各项 `zIndex` 作为层级顺序基准，页面施工时保持同序。
- `heroMascot` 容器用 DOM，内部主视觉使用 `review-bunny-scene.png`。
- `focusCard` 容器、星标、标题、描述、按钮用 DOM，右下插画使用 `review-focus-art.png`。
- 四张 `preview` 卡片的卡体、序号角标、收藏星标、英文词、中文释义、词性、来源行都用 DOM；每张左侧插画分别使用独立 slice。
- 三张 `guidance` 卡片的卡体、左侧小图标、标题、正文、右上箭头都用 DOM；每张右侧插画分别使用独立 slice。
- `brand` 图标、`profile avatar`、`summary` 三个图标、`dock` 四个图标可以继续切图；如果不切图，允许保持 DOM 绘制，但坐标和尺寸仍按当前 JSON 回填。
- 页面背景渐变、卡片圆角、描边、阴影、按钮底板、dock active 态都继续用 CSS，不做整块背景切图。
