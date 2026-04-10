---
title: 快速开始（简体中文试点）
summary: 用适合中国企业环境的方式，在几分钟内启动 Paperclip
---

这是 Paperclip 当前的 **简体中文试点入口页**。它优先覆盖本地部署、中文界面切换和中国企业常见的私有化使用习惯，同时尽量保持与上游主版本低冲突同步。

## 一键启动（推荐）

```sh
npx paperclipai onboard --yes
```

这会完成首次引导、生成配置，并把实例启动起来。

如果已经安装过 Paperclip，再次运行 `onboard` 会尽量保留现有配置和数据路径；如果只想修改参数，可以改用：

```sh
npx paperclipai configure
```

后续再次启动：

```sh
npx paperclipai run
```

## 切到中文界面

启动后进入 Web UI，在 **Instance Settings → General** 中设置：

1. **Language** 选择 `简体中文`
2. **Time zone** 选择 `Asia/Shanghai`
3. **Currency** 选择 `CNY`

如果你希望 CLI 和本地启动横幅也优先显示中文，可以在启动前设置：

```sh
PAPERCLIP_LOCALE=zh-CN npx paperclipai run
```

## 本地开发

如果你是在本地克隆仓库开发 Paperclip：

```sh
pnpm install
pnpm dev
```

默认会在 [http://localhost:3100](http://localhost:3100) 启动 API 和 UI，不需要额外的 Docker 数据库。

## 中国企业部署建议

- 优先使用私有网络或内网访问方式部署，而不是直接暴露公网
- 首轮试点建议先固定 `zh-CN` + `Asia/Shanghai` + `CNY`
- 团队如果需要统一命令行输出语言，可在运维脚本中显式设置 `PAPERCLIP_LOCALE=zh-CN`
- 当前中文化仍是试点阶段，建议优先验证：引导、任务管理、审批、预算、日志与插件页

## 维护策略

当前中文支持采用 **locale 资源 + 配置化默认项 + 低侵入适配层** 的方案，目的是在 Paperclip 后续主版本更新时尽量减少 merge 冲突。

<Card title="本地开发部署" href="/deploy/local-development">
  查看本地开发部署说明
</Card>
