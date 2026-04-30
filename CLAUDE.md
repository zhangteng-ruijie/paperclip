
## 项目概述 / Project Overview

Paperclip 是一个开源的 AI Agent 公司编排平台。通过组织架构、目标、预算、治理和任务协调来管理 AI Agent 团队。

## 命令 / Commands

```bash
pnpm dev              # 完整开发模式 (API server + UI，watch 模式)
pnpm dev:once         # 完整开发模式（不监听文件变化）
pnpm dev:server       # 仅启动 server
pnpm dev:ui           # 仅启动 UI (Vite dev server)

pnpm build            # 构建所有包
pnpm typecheck        # 类型检查所有包
pnpm test             # 运行测试 (vitest，watch 模式)
pnpm test:run         # 运行测试一次

pnpm db:generate      # 生成 Drizzle 数据库迁移
pnpm db:migrate       # 执行数据库迁移

pnpm paperclipai <cmd>  # 运行 CLI 命令 (onboard, doctor, configure 等)
```

运行单个测试文件：
```bash
npx vitest run packages/db/src/some-test-file.ts
```

## 架构 / Architecture

### 包结构 (pnpm workspace monorepo)

```
paperclip/
├── server/           # Express REST API + 编排服务
├── ui/               # React + Vite 管理界面 UI
├── cli/              # Paperclip CLI (paperclipai 命令)
├── packages/
│   ├── db/           # Drizzle ORM schema、迁移、PGlite/Postgres 客户端
│   ├── shared/       # 类型、常量、验证器、API 路径常量
│   ├── adapters/     # Agent 适配器实现 (Claude, Codex, Cursor, Gemini 等)
│   ├── adapter-utils/# 共享适配器工具
│   └── plugins/      # 插件系统包
```

### 核心架构原则

**公司作用域实体**：所有领域实体都归属于某个公司。必须在路由/服务中强制执行公司边界。

**契约同步**：更改 schema 或 API 行为时，需按顺序更新所有影响的层：
1. `packages/db/src/schema/*.ts` - 数据库 schema
2. `packages/shared/src/*.ts` - 类型、常量、验证器
3. `server/src/routes/*.ts` - API 路由
4. `ui/src/**/*.ts` - React 组件和 API 客户端

**开发模式嵌入式 PostgreSQL**：未设置 `DATABASE_URL` 时，server 自动使用嵌入式 PGlite。数据存储在 `~/.paperclip/instances/default/db`。

**适配器模式**：Agent（Claude Code、Codex、Cursor 等）通过 `packages/adapters/` 下的适配器包接入。每个适配器实现心跳、任务执行和配额监控的通用接口。

### 数据库变更流程

1. 编辑 `packages/db/src/schema/*.ts`
2. 确保新表从 `packages/db/src/schema/index.ts` 导出
3. 生成迁移：`pnpm db:generate`
4. 验证：`pnpm -r typecheck`

注意：`packages/db/drizzle.config.ts` 从 `dist/schema/*.js` 读取编译后的 schema，所以生成迁移前会先编译 db 包。

### 测试

Vitest 配置了多个项目（定义在 `vitest.config.ts`）：
- `packages/db`
- `packages/adapters/codex-local`
- `packages/adapters/opencode-local`
- `server`
- `ui`
- `cli`

## 开发注意事项 / Development Notes

- **开发服务器**：运行在 `http://localhost:3100`。UI 由 API server 以 dev middleware 模式提供服务。
- **Worktree 隔离**：从多个 git worktree 开发时，使用 `paperclipai worktree init` 创建独立的 Paperclip 实例。切勿让两个 server 指向同一个嵌入式 PostgreSQL 数据目录。
- **健康检查**：
  ```bash
  curl http://localhost:3100/api/health
  curl http://localhost:3100/api/companies
  ```
- **重置开发数据库**：`rm -rf ~/.paperclip/instances/default/db && pnpm dev`

## 重要文件 / Important Files

- `AGENTS.md` - 开发指导和工程规范
- `doc/DEVELOPING.md` - 详细开发文档
- `doc/DATABASE.md` - 数据库 schema 文档
- `doc/SPEC-implementation.md` - V1 实现规范

## 开发规范
Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
