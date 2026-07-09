# VocaRabbit 发布说明

## 当前正式发布方式

当前默认发布目标已经切回 GitHub Pages，线上地址是：

https://harrycjh.github.io/english/

这样做的原因是：

- 代码与部署链路都回到 GitHub，一条线更简单
- GitHub Actions 已恢复为推送 `main` 后自动发布
- 当前构建基路径已经恢复为 GitHub Pages 所需的 `/english/`

## 默认构建命令

GitHub Pages 发布必须使用 `build:github`（base 路径为 `/english/`）。在 `vocab_rabbit` 目录执行：

```bash
npm run build:github
```

生成的 `dist/` 就是 GitHub Pages 使用的产物。CI（`.github/workflows/deploy-vocab-rabbit.yml`）也执行这条命令。

> 注意：`npm run build` 现在指向 `build:esa`（base 路径为 `/`，供 ESA 边缘部署使用），**不要**用它来发布 GitHub Pages，否则线上资源会 404 并陷入无限刷新。

## 本地预览

本地不要再直接用 `vite preview` 预览 GitHub Pages 产物，因为当前构建基路径是 `/english/`，会导致资源路径和本地根路径不一致。

在 `vocab_rabbit` 目录执行：

```bash
npm run preview -- --host 127.0.0.1 --port 4174
```

这个命令会先构建，再用本地静态服务把 `dist/` 挂到 `/english/` 下。打开下面这个地址即可：

```text
http://127.0.0.1:4174/english/
```

## 发布到 GitHub Pages

默认流程：

1. 把代码推到 GitHub 仓库的 `main` 分支
2. GitHub Actions 自动执行 Pages workflow
3. Pages 发布完成后，站点会更新到最新版本

当前 workflow 文件是 [.github/workflows/deploy-vocab-rabbit.yml](../.github/workflows/deploy-vocab-rabbit.yml)。

## 手动备用方案

如果 GitHub Actions 暂时不可用，仓库里仍保留手动备用能力：

```bash
npm run deploy:github:legacy
```

这个脚本会把当前构建结果直接推送到 `gh-pages` 分支。

## 发布后检查

发布后检查：

- https://harrycjh.github.io/english/
- 首页是否正常显示 `VocaRabbit` 和今日学习计划
- 新增静态资源是否都能正常加载

## 当前约定

- 默认部署平台：GitHub Pages
- 默认仓库：GitHub
- 默认构建入口：`npm run build`
- 备用手动发布入口：`npm run deploy:github:legacy`