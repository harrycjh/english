# Review Page UI Spec

## 1. 文档目的

这份文档定义 VocaRabbit review 页的第一版可施工 UI 规格，目标不是重新设计，而是把现有参考图、切片资源、DOM 结构和样式实现整理成统一标准，供后续继续精修、差异对比和分阶段施工使用。

当前 review 页已经从“整图 + 热点”切回“切片资产 + DOM 组合”，所以这份 spec 以当前仓库实现为基础，同时保留对原参考图的视觉约束。

## 2. 参考输入

### 2.1 视觉参考

- 主参考图：`public/design-reference/review-page-original.png`
- 备份参考：`public/design-reference/review-reference.png`
- 历史切片规格：`design-output/ui-concepts/review-page-slice-spec.md`

### 2.2 当前实现锚点

- review 页组件：`src/screens/HomePage.tsx`
- review 页样式：`src/styles/ipad.css`
- 本地预览入口：`npm run preview -- --host 127.0.0.1 --port 4174`
- 本地预览地址：`http://127.0.0.1:4174/english/`

### 2.3 技术上下文

- 技术栈：React 19 + TypeScript + Vite 7
- UI 方式：HTML + CSS，自定义 iPad shell
- 目标平台：11 英寸 iPad Pro 横屏优先，桌面流式预览作为辅助
- 外层舞台基准：`1194 x 834`
- review 内容 frame：`1158 x 808`
- 适配策略：`ipad-fixed` 固定舞台 + `fluid` 模式按视口缩放

## 3. 页面结构 Layout Tree

```text
ReviewPage
└─ review-mockup-frame
   └─ review-dom-surface
      ├─ review-plan-shell
      │  ├─ review-plan-shell__chrome
      │  │  ├─ review-plan-shell__brand
      │  │  └─ review-plan-shell__profile
      │  └─ review-plan-shell__hero
      │     ├─ review-mascot-card
      │     │  └─ review-mascot-scene
      │     ├─ review-plan-shell__headline
      │     │  └─ review-summary-pills
      │     └─ review-focus-card
      ├─ review-metric-grid
      │  ├─ review-metric-card--task
      │  ├─ review-metric-card--time
      │  ├─ review-metric-card--theme
      │  └─ review-metric-card--heatmap
      ├─ review-panel#review-preview-section
      │  └─ review-preview-grid
      │     ├─ review-preview-card--family
      │     ├─ review-preview-card--hello
      │     ├─ review-preview-card--body
      │     └─ review-preview-card--spark
      ├─ review-panel#review-guidance-section
      │  └─ review-advice-grid
      │     ├─ review-advice-card--tea
      │     ├─ review-advice-card--bars
      │     └─ review-advice-card--bag
      └─ review-dock.home-dock
         ├─ review-dock__button review
         ├─ review-dock__button selection
         ├─ review-dock__button stats
         └─ review-dock__button settings

ReviewPage
└─ WordDetailDrawer
```

## 4. 主模块 Bounding Boxes

所有坐标以 review 内容 frame `1158 x 808` 为基准，左上角为 `(0, 0)`。

### 4.1 页面级容器

| Module | Box (x, y, w, h) | Notes |
| --- | --- | --- |
| review-mockup-frame | `(0, 0, 1158, 808)` | 主画布，圆角 34 |
| review-plan-shell | `(0, 0, 1158, 285)` | 顶部 hero 区 |
| review-metric-grid | `(29, 288, 1103, 100)` | 4 张 metric 卡 |
| review-preview-section | `(29, 402, 1103, ~151)` | 标题 + 4 张 preview card |
| review-guidance-section | `(29, 567, 1103, ~119)` | 标题 + 3 张 advice card |
| review-dock | `(29, 703, 1103, 87)` | 底部导航 |

### 4.2 顶部区

| Module | Box (x, y, w, h) | Notes |
| --- | --- | --- |
| chrome strip | `(23, 15, 1094, 34)` | 顶部品牌和右上 profile |
| brand cluster | `(23, 15, ~220, 29)` | logo + VocaRabbit + version |
| profile button | `(975, 15, 142, 34)` | 小树的家长版 |
| hero grid | `(0, 42, 1133, 243)` | 3 列：231 / 432 / 451 |
| mascot scene | `(0, 42, 231, 243)` | 左侧兔子插画卡 |
| headline block | `(231, 42, 432, 243)` | 标题与摘要 |
| focus card | `(682, 52, 451, 208)` | 今日重点 + CTA |

### 4.3 中间数据区

| Module | Box / Size | Notes |
| --- | --- | --- |
| metric card 1 | `258 x 100` | 今日任务 |
| metric card 2 | `258 x 100` | 预计时长 |
| metric card 3 | `258 x 100` | 预览主题 |
| metric card 4 | `289 x 100` | 热力图 |
| metric grid gap | `14` | 固定 gap |

### 4.4 Preview 区

| Module | Box / Size | Notes |
| --- | --- | --- |
| preview grid | `1103` 宽 | 4 列：274 / 274 / 274 / 231 |
| preview card | `274 x 110` | 前 3 张 |
| preview card last | `231 x 110` | 第 4 张 |
| preview art column | `110 x 110` | 前 3 张 |
| preview art column last | `96 x 110` | 第 4 张 |
| preview gap | `14` | 固定 gap |

### 4.5 Advice 区

| Module | Box / Size | Notes |
| --- | --- | --- |
| advice grid | `1103` 宽 | 3 列：361 / 352 / 363 |
| advice card | `~84` 高 | 固定视觉高度 |
| advice art slot | `74 x 63` | 右侧小插画区 |
| advice gap | `14` | 固定 gap |

### 4.6 底部导航区

| Module | Box / Size | Notes |
| --- | --- | --- |
| dock container | `(29, 703, 1103, 87)` | 圆角仅下边缘 |
| dock button | `158 x 54` | 4 个按钮等宽 |
| dock content gap | `109` | 按钮间隔 |
| dock padding | `16 45 17 98` | 容器内边距 |

## 5. Design Tokens

### 5.1 颜色

#### 页面背景

- `#fffdf8` -> `#fff7ea` -> `#fff4e1`：review frame 主背景渐变
- `rgba(255, 233, 180, 0.52)`：左上暖色光晕

#### 主文字

- `#3f230f`：主标题、模块标题
- `#332010`：右上焦点卡大标题
- `#4f4435`：正文描述
- `#59452b`：焦点卡正文
- `#6d5a38`：右上 profile 文本
- `#8b6f46`：小号辅助文字

#### 强调色

- `#2d62aa`：顶部 whisper 文案蓝色
- `#ff8f53` -> `#ffcd57`：主 CTA 按钮渐变
- `#ffd777` -> `#ffbe57`：底部 active dock 背景
- `#ffbc34` -> `#ff9112`：preview index badge 渐变

#### 卡片底色

- `rgba(255, 255, 255, 0.92)`：preview / metric / advice card 基础白卡
- `rgba(255, 248, 223, 0.98)` -> `rgba(255, 238, 192, 0.98)`：focus card 背景
- `rgba(255, 253, 247, 0.98)`：底部 dock 容器背景

### 5.2 圆角

- Frame：`34`
- Focus card：`32`
- Preview / Advice / Metric：`22`
- Summary pill：`18`
- Button pill：`999`
- Badge 小圆角：`10` 或 `12`

### 5.3 阴影

- Frame 内部柔和氛围：无硬投影，主靠背景渐变
- Focus card：`0 20px 40px rgba(193, 145, 68, 0.1)`
- Scene card：`0 20px 40px rgba(193, 145, 68, 0.08)`
- 普通信息卡：`0 10px 24px rgba(155, 104, 24, 0.08)`
- CTA：`0 18px 38px rgba(255, 143, 83, 0.35)`

### 5.4 字体

- 全局 UI 正文：`Avenir Next`, `PingFang SC`, `Helvetica Neue`, sans-serif
- 英文重点词：`Iowan Old Style`, `Palatino Linotype`, `Times New Roman`, serif

### 5.5 字号

- Hero 标题：`70`
- Focus card 标题：`40`
- 模块标题 `h2`：`22`
- CTA：`18`
- Preview 单词：`20`
- 正文：`15-16`
- 小说明：`10-13`

### 5.6 间距

- 主模块横向安全边距：`29`
- 主要 grid gap：`14`
- Summary pills gap：`12`
- 顶部 chrome 左右 padding：`23 / 41`

## 6. 图层顺序 Z-Index

| Layer | Content | Notes |
| --- | --- | --- |
| 0 | frame background gradient | review-mockup-frame 背景 |
| 1 | 场景切片、卡片底板、静态 DOM 结构 | 主视觉层 |
| 2 | 标题、正文、徽章、按钮文本 | 内容层 |
| 3 | CTA 装饰箭头、summary icon pseudo elements、dock glyph | 小装饰层 |
| 10+ | WordDetailDrawer | 全局浮层 |

禁止把整页背景重新做成一张 full-page raster image 覆盖在最上层。

## 7. 元素分类：代码实现 vs 切图实现

### 7.1 用代码实现

- 页面布局与定位
- 标题、正文、摘要数字
- CTA 按钮结构与交互
- Metric cards、Preview cards、Advice cards、Bottom dock
- HeatmapCalendar
- WordDetailDrawer
- Hover / focus / active 状态

### 7.2 用切图实现

- `review-bunny-scene.png`
- `review-focus-art.png`
- `review-preview-family-art.png`
- `review-preview-hello-art.png`
- `review-preview-body-art.png`
- `review-preview-spark-art.png`
- `review-book-art.png`
- `review-bars-art.png`
- `review-bag-art.png`

### 7.3 当前仍用 CSS 画、后续可资产化的对象

- brand rabbit mark
- summary pill icons
- preview favorite star
- dock glyphs
- profile avatar 圆形占位

如果继续追高还原度，这几类应优先换成真实切片资源。

## 8. Assets Manifest

### 8.1 当前已落地资源

```json
{
  "basePath": "public/design-reference/slices/",
  "sprites": {
    "reviewBunnyScene": "review-bunny-scene.png",
    "reviewFocusArt": "review-focus-art.png",
    "reviewPreviewFamilyArt": "review-preview-family-art.png",
    "reviewPreviewHelloArt": "review-preview-hello-art.png",
    "reviewPreviewBodyArt": "review-preview-body-art.png",
    "reviewPreviewSparkArt": "review-preview-spark-art.png",
    "reviewBookArt": "review-book-art.png",
    "reviewBarsArt": "review-bars-art.png",
    "reviewBagArt": "review-bag-art.png"
  }
}
```

### 8.2 推荐追加资源

```json
{
  "optionalSprites": {
    "reviewBrandRabbitIcon": "review-brand-rabbit-icon.png",
    "reviewProfileAvatar": "review-profile-avatar.png",
    "reviewSummaryLibraryIcon": "review-summary-library-icon.png",
    "reviewSummaryMasteredIcon": "review-summary-mastered-icon.png",
    "reviewSummaryCompletionIcon": "review-summary-completion-icon.png",
    "reviewDockReviewActive": "review-dock-review-active.png",
    "reviewDockSelection": "review-dock-selection.png",
    "reviewDockStats": "review-dock-stats.png",
    "reviewDockSettings": "review-dock-settings.png"
  }
}
```

## 9. 组件与文件映射

| Component / Module | File | Notes |
| --- | --- | --- |
| ReviewPage | `src/screens/HomePage.tsx` | review 页主入口 |
| HeatmapCalendar | `src/components/HeatmapCalendar` | 热力图组件 |
| WordDetailDrawer | `src/components/WordDetailDrawer` | 预览词详情抽屉 |
| Review page CSS | `src/styles/ipad.css` | review 页专用定位与视觉 |

## 10. 分阶段施工建议

### Phase 1

- 冻结当前切片 DOM 结构
- 不再回退到 full-page background + hotspots
- 用当前 spec 做第一轮视觉校准

### Phase 2

- 校准 TopChrome
- 校准 Hero headline block
- 校准 FocusCard 与 CTA
- 校准 BottomDock

### Phase 3

- 校准 MetricGrid
- 校准 Preview cards
- 校准 Advice cards

### Phase 4

- 把 CSS 伪元素图标替换成真实切图资源
- 再做 hover / focus / active 微调

### Phase 5

- 只在通过基准视觉验收后再做多尺寸适配

## 11. 给 Codex / 实施代理的 Prompt 模板

```text
你现在在一个 React + TypeScript + Vite 项目里工作。

目标：继续实现和校准 review 页，不允许重新设计，不允许回退成整页背景图热点方案。

必须先阅读：
1. src/screens/HomePage.tsx
2. src/styles/ipad.css
3. docs/plans/2026-05-12-review-page-ui-spec.md

约束：
1. 严格使用 1158 x 808 review frame 作为基准。
2. 复杂插画必须使用 public/design-reference/slices 下的切图资源。
3. 文字、按钮、列表、摘要数字、导航必须使用 DOM/CSS 实现。
4. 不要把标题、按钮文案、数字做进图片。
5. 不要一次重做整页，只处理我指定的模块。
6. 保持现有数据流和交互：preview card -> WordDetailDrawer，profile -> settings，dock -> route switch。

本轮只实现：<在这里填模块名>

输出要求：
1. 告诉我改了哪些文件。
2. 告诉我具体改了哪些 class 或组件。
3. 提供一个本地预览验证方法。
4. 如果需要新切图，先给 assets manifest，不要自己乱造路径。
```

## 12. 视觉验收 Checklist

### 12.1 页面级

- review frame 是否保持 `1158 x 808` 视觉比例
- 外层暖色背景氛围是否与参考图接近
- 主要模块是否都在正确层级和顺序里

### 12.2 顶部区

- 品牌区是否足够轻、没有过重边框
- 右上 profile 是否保持单行，不换行、不挤压
- hero 标题与正文是否和参考图同量级

### 12.3 焦点卡

- 标题、说明、CTA、插画是否形成稳定三角关系
- CTA 按钮宽高、箭头和阴影是否贴近参考图

### 12.4 Preview 区

- 4 张卡片的宽度和节奏是否稳定
- 插画是否与文字区域保持正确权重比
- 英文词显示是否足够大，中文释义是否没有抢层级

### 12.5 Advice 区

- 三张 advice card 是否高度一致
- 右侧小插画是否不挤占文字

### 12.6 底部导航

- 容器高度、圆角、内边距是否稳定
- active 态是否有明确但不过重的突出效果
- 图标与文案是否垂直居中

## 13. 当前结论

这份 spec 对应的核心决策是：

1. review 页继续沿用切片资产 + DOM 组合，不再回退到整图热点
2. 现有切图资产已经足够支撑第一轮高还原实现
3. 下一轮工作重点不再是“找按钮坐标”，而是“按模块做视觉校准”
4. 如果还需要继续追像，就优先补齐 brand / summary / dock / avatar 这些小型资源切片