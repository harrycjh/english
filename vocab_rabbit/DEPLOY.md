# VocaRabbit 发布说明

## 当前正式发布方式

当前站点通过 `gh-pages` 分支发布，线上地址是：

https://harrycjh.github.io/english/

这样做的好处是：

- 不依赖 GitHub Actions workflow 权限
- 只需要本地构建通过，就能直接更新线上静态站点
- 适合当前这台机器上的 GitHub 认证现状

## 一键发布命令

在 `vocab_rabbit` 目录执行：

```bash
npm run deploy:gh-pages
```

这个命令会自动完成：

1. 执行生产构建
2. 复制 `dist/` 产物到临时目录
3. 写入 `.nojekyll`
4. 生成 `404.html`
5. 初始化临时 `gh-pages` 仓库
6. 强制推送到远端 `gh-pages` 分支

## 安全检查

如果只想验证流程，不想真正推送，可以先跑：

```bash
npm run deploy:gh-pages -- --dry-run
```

这会完整跑完构建和临时产物准备，但不会推送远端。

## 发布后检查

发布后通常等待几十秒到几分钟，然后检查：

- https://harrycjh.github.io/english/
- `gh api repos/harrycjh/english/pages`

如果 `status` 是 `built`，但主页短时间还没刷新，优先怀疑 GitHub Pages CDN 缓存同步，稍等再试即可。

## 备注

仓库里仍保留了 GitHub Actions 的 workflow 文件，但当前默认维护方式以 `gh-pages` 分支发布为主。