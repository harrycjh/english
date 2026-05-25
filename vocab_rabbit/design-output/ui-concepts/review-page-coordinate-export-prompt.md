# Review Page Coordinate Export Prompt

## 目标

不要继续靠人工目测微调 review 页。先让 ChatGPT 基于主参考图输出一份机器可读的坐标文件和切图清单，再按文件回填到真实 React + CSS 页面里。

这份文档是给 ChatGPT 的输入规范，不是最终实现代码。

## 需要一起提供给 ChatGPT 的输入

1. 主参考图
   - `public/design-reference/review-page-original.png`

2. 当前施工文档
   - `docs/plans/2026-05-12-review-page-ui-spec.md`

3. 当前切图规范
   - `design-output/ui-concepts/review-page-slice-spec.md`

4. 可选
   - 当前页面截图
   - 当前本地预览地址截图

## 希望 ChatGPT 产出的文件

ChatGPT 不要只给自然语言描述，必须按下面结构输出三份内容：

1. `review-page-layout.json`
   - 页面所有主要模块、卡片和关键元素的坐标、尺寸、层级

2. `review-page-slices-manifest.json`
   - 所有需要切出来的图，包含文件名、用途、显示尺寸、导出尺寸、透明背景要求

3. `review-page-notes.md`
   - 只记录少量实现说明，例如哪些必须用 DOM，哪些必须用 slice

## 坐标系统硬约束

- 基准画布：`1158 x 808`
- 原点：左上角 `(0, 0)`
- 单位：CSS px
- 所有坐标与尺寸尽量使用整数
- 如果某个元素是圆角卡片，要写出 `borderRadius`
- 如果某个元素必须由 DOM 绘制，要标 `renderMode: "dom"`
- 如果某个元素必须由切图实现，要标 `renderMode: "slice"`
- 不要把文字、数字、按钮文案烘焙进图片

## 需要覆盖的模块

至少包含这些 key：

- `topChrome`
- `brandCluster`
- `profileButton`
- `heroMascot`
- `heroHeadline`
- `summaryPills`
- `focusCard`
- `metricRow`
- `previewSection`
- `guidanceSection`
- `bottomDock`

并且要进一步拆到这些子项：

- metric 4 张卡
- preview 4 张卡
- advice 3 张卡
- dock 4 个按钮

## 必须返回的 JSON 结构

### 1. `review-page-layout.json`

```json
{
  "meta": {
    "project": "VocaRabbit",
    "page": "review",
    "coordinateSpace": {
      "width": 1158,
      "height": 808,
      "origin": "top-left",
      "units": "px"
    }
  },
  "modules": {
    "topChrome": {
      "x": 23,
      "y": 15,
      "width": 1094,
      "height": 34,
      "renderMode": "dom"
    }
  },
  "cards": {
    "metrics": [],
    "previews": [],
    "guidance": [],
    "dockButtons": []
  },
  "slices": []
}
```

### 2. `review-page-slices-manifest.json`

```json
{
  "basePath": "public/design-reference/slices/",
  "exports": [
    {
      "file": "review-bunny-scene.png",
      "type": "scene",
      "display": { "width": 188, "height": 276 },
      "export": { "width": 376, "height": 552 },
      "background": "rectangular",
      "transparent": false,
      "notes": "No text, no UI chrome"
    }
  ]
}
```

## 输出质量要求

- 不要输出“差不多”“大概”“建议”这种模糊表述
- 每个模块都给准确坐标和宽高
- preview / advice / dock 必须逐项拆分，不接受只给整个 grid 外框
- 如果参考图里某个元素无法精确判断，也要先给一个可施工的数值，不要留空
- 如果一个模块推荐继续由 DOM 画，必须显式写 `renderMode: "dom"`
- 如果一个模块推荐切图，必须同时在 `slices` 或 manifest 里给出文件项

## 允许切图的范围

可以切图：

- bunny scene
- focus card art
- preview 四张插画
- advice 三张插画
- brand icon / avatar / summary icons / dock icons（如果要追求更高还原度）

不要切图：

- 标题文字
- 中文描述
- 数字
- CTA 文案
- 统计值
- 底部导航文案

## 给 ChatGPT 的粘贴版 Prompt

```text
你现在要做的不是写网页代码，而是为一个真实的 React + CSS 项目输出“可施工坐标文件 + 切图清单”。

我会给你 3 份输入：
1. review 页主参考图
2. 当前 UI spec
3. 当前 slice spec

你的任务：
基于主参考图，输出一份机器可读的 review 页布局坐标文件，以及一份切图导出 manifest。

你必须严格遵守这些约束：
1. 坐标基准画布固定为 1158 x 808。
2. 原点是左上角。
3. 所有值尽量用整数像素。
4. 不要把任何文字、数字、按钮文案做进图片。
5. 你必须把模块拆到可直接施工的粒度，不能只给大区域。
6. 你必须显式标明每个模块是 dom 还是 slice。
7. preview 4 张卡、advice 3 张卡、dock 4 个按钮都要逐个给坐标。

请按下面顺序输出，且不要省略：

第一部分：`review-page-layout.json`
要求：
- 包含 meta, modules, cards, slices
- modules 里至少有 topChrome, brandCluster, profileButton, heroMascot, heroHeadline, summaryPills, focusCard, metricRow, previewSection, guidanceSection, bottomDock
- cards 里至少有 metrics, previews, guidance, dockButtons

第二部分：`review-page-slices-manifest.json`
要求：
- 包含 basePath 和 exports
- 每个 export 都要有 file, type, display, export, background, transparent, notes

第三部分：`review-page-notes.md`
要求：
- 只写少量实现说明
- 说明哪些必须是 DOM，哪些建议继续切图

输出要求：
1. JSON 必须是合法 JSON。
2. 不要在 JSON 里写注释。
3. 如果某个值不能百分百判断，也要给一个可施工的数值。
4. 不要输出泛泛的 UI 建议。
5. 优先输出结构化结果，不要长篇解释。
```

## 实施顺序建议

拿到 ChatGPT 输出后，不要立刻重做整页。按这个顺序落地：

1. 先核对 `review-page-layout.json` 的模块坐标是否完整
2. 再核对 `review-page-slices-manifest.json` 是否覆盖所有插画资产
3. 先把坐标回填到 `src/styles/ipad.css`
4. 再补或替换缺的 slices
5. 最后才做 hover、focus、active 微调

## 这条路线为什么比继续手调更靠谱

- 把“看图猜位置”改成“先产出结构化坐标文件”
- 把“切图需求散落在对话里”改成“统一 manifest”
- 后续不管是我还是别的代理继续施工，都能直接基于 JSON 和 manifest，而不是再从截图猜