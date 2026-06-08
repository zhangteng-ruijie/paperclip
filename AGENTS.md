# AGENTS.md

Guidance for human and AI contributors working in this repository.

## 1. Purpose

Paperclip is a control plane for AI-agent companies.
The current implementation target is V1 and is defined in `doc/SPEC-implementation.md`.

## 2. Read This First

Before making changes, read in this order:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

`doc/SPEC.md` is long-horizon product context.
`doc/SPEC-implementation.md` is the concrete V1 build contract.

## 3. Repo Map

- `server/`: Express REST API and orchestration services
- `ui/`: React + Vite board UI
- `packages/db/`: Drizzle schema, migrations, DB clients
- `packages/shared/`: shared types, constants, validators, API path constants
- `packages/adapters/`: agent adapter implementations (Claude, Codex, Cursor, etc.)
- `packages/adapter-utils/`: shared adapter utilities
- `packages/plugins/`: plugin system packages
- `doc/`: operational and product docs

## 4. Dev Setup (Auto DB)

Use embedded PGlite in dev by leaving `DATABASE_URL` unset.

```sh
pnpm install
pnpm dev
```

This starts:

- API: `http://localhost:3100`
- UI: `http://localhost:3100` (served by API server in dev middleware mode)

Quick checks:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reset local dev DB:

```sh
rm -rf data/pglite
pnpm dev
```

## 5. Core Engineering Rules

1. Keep changes company-scoped.
Every domain entity should be scoped to a company and company boundaries must be enforced in routes/services.

2. Keep contracts synchronized.
If you change schema/API behavior, update all impacted layers:
- `packages/db` schema and exports
- `packages/shared` types/constants/validators
- `server` routes/services
- `ui` API clients and pages

3. Preserve control-plane invariants.
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for mutating actions

4. Do not replace strategic docs wholesale unless asked.
Prefer additive updates. Keep `doc/SPEC.md` and `doc/SPEC-implementation.md` aligned.

5. Keep repo plan docs dated and centralized.
When you are creating a plan file in the repository itself, new plan documents belong in `doc/plans/` and should use `YYYY-MM-DD-slug.md` filenames. This does not replace Paperclip issue planning: if a Paperclip issue asks for a plan, update the issue `plan` document per the `paperclip` skill instead of creating a repo markdown file.

## 6. Database Change Workflow

When changing data model:

1. Edit `packages/db/src/schema/*.ts`
2. Ensure new tables are exported from `packages/db/src/schema/index.ts`
3. Generate migration:

```sh
pnpm db:generate
```

4. Validate compile:

```sh
pnpm -r typecheck
```

Notes:
- `packages/db/drizzle.config.ts` reads compiled schema from `dist/schema/*.js`
- `pnpm db:generate` compiles `packages/db` first

## 7. Verification Before Hand-off

Default local/agent test path:

```sh
pnpm test
```

This is the cheap default and only runs the Vitest suite. Browser suites stay opt-in:

```sh
pnpm test:e2e
pnpm test:release-smoke
```

Run the browser suites only when your change touches them or when you are explicitly verifying CI/release flows.

For normal issue work, run the smallest relevant verification first. Do not default to repo-wide typecheck/build/test on every heartbeat when a narrower check is enough to prove the change.

Run this full check before claiming repo work done in a PR-ready hand-off, or when the change scope is broad enough that targeted checks are not sufficient:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If anything cannot be run, explicitly report what was not run and why.

## 8. API and Auth Expectations

- Base path: `/api`
- Board access is treated as full-control operator context
- Agent access uses bearer API keys (`agent_api_keys`), hashed at rest
- Agent keys must not access other companies

When adding endpoints:

- apply company access checks
- enforce actor permissions (board vs agent)
- write activity log entries for mutations
- return consistent HTTP errors (`400/401/403/404/409/422/500`)

## 9. UI Expectations

- Keep routes and nav aligned with available API surface
- Use company selection context for company-scoped pages
- Surface failures clearly; do not silently ignore API errors

## 10. Pull Request Requirements

When creating a pull request (via `gh pr create` or any other method), you **must** read and fill in every section of [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md). Do not craft ad-hoc PR bodies — use the template as the structure for your PR description. Required sections:

- **Thinking Path** — trace reasoning from project context to this change (see `CONTRIBUTING.md` for examples)
- **What Changed** — bullet list of concrete changes
- **Verification** — how a reviewer can confirm it works
- **Risks** — what could go wrong
- **Model Used** — the AI model that produced or assisted with the change (provider, exact model ID, context window, capabilities). Write "None — human-authored" if no AI was used.
- **Checklist** — all items checked

## 11. Definition of Done

A change is done when all are true:

1. Behavior matches `doc/SPEC-implementation.md`
2. Typecheck, tests, and build pass
3. Contracts are synced across db/shared/server/ui
4. Docs updated when behavior or commands change
5. PR description follows the [PR template](.github/PULL_REQUEST_TEMPLATE.md) with all sections filled in (including Model Used)

## 11. Fork-Specific: HenkDz/paperclip

This is a fork of `paperclipai/paperclip` with QoL patches and an **external-only** Hermes adapter story on branch `feat/externalize-hermes-adapter` ([tree](https://github.com/HenkDz/paperclip/tree/feat/externalize-hermes-adapter)).

### Branch Strategy

- `feat/externalize-hermes-adapter` → core has **no** `hermes-paperclip-adapter` dependency and **no** built-in `hermes_local` registration. Install Hermes via the Adapter Plugin manager (`@henkey/hermes-paperclip-adapter` or a `file:` path).
- Older fork branches may still document built-in Hermes; treat this file as authoritative for the externalize branch.

### Hermes (plugin only)

- Register through **Board → Adapter manager** (same as Droid). Type remains `hermes_local` once the package is loaded.
- UI uses generic **config-schema** + **ui-parser.js** from the package — no Hermes imports in `server/` or `ui/` source.
- Optional: `file:` entry in `~/.paperclip/adapter-plugins.json` for local dev of the adapter repo.

### Local Dev

- Fork runs on port 3101+ (auto-detects if 3100 is taken by upstream instance)
- `npx vite build` hangs on NTFS — use `node node_modules/vite/bin/vite.js build` instead
- Server startup from NTFS takes 30-60s — don't assume failure immediately
- Kill ALL paperclip processes before starting: `pkill -f "paperclip"; pkill -f "tsx.*index.ts"`
- Vite cache survives `rm -rf dist` — delete both: `rm -rf ui/dist ui/node_modules/.vite`

### Fork QoL Patches (not in upstream)

These are local modifications in the fork's UI. If re-copying source, these must be re-applied:

1. **stderr_group** — amber accordion for MCP init noise in `RunTranscriptView.tsx`
2. **tool_group** — accordion for consecutive non-terminal tools (write, read, search, browser)
3. **Dashboard excerpt** — `LatestRunCard` strips markdown, shows first 3 lines/280 chars

### Plugin System

PR #2218 (`feat/external-adapter-phase1`) adds external adapter support. See root `AGENTS.md` for full details.

- Adapters can be loaded as external plugins via `~/.paperclip/adapter-plugins.json`
- The plugin-loader should have ZERO hardcoded adapter imports — pure dynamic loading
- `createServerAdapter()` must include ALL optional fields (especially `detectModel`)
- Built-in UI adapters can shadow external plugin parsers — remove built-in when fully externalizing
- Reference external adapters: Hermes (`@henkey/hermes-paperclip-adapter` or `file:`) and Droid (npm)


<claude-mem-context>
# Memory Context

# [paperclip] recent context, 2026-05-31 2:59pm GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (12,731t read) | 232,350t work | 95% savings

### May 14, 2026
508 10:01p ✅ Docker Compose environment initiated
509 10:02p ✅ PostgreSQL 17 Alpine image pull initiated
510 10:03p 🔵 PostgreSQL image pull timing out during docker compose build
511 10:06p ✅ Docker Compose services being built and started
512 " 🔵 PostgreSQL image pull timed out during docker compose
513 " ⚖️ PostgreSQL image pull manually stopped after timeout
514 10:29p 🔴 Docker build and start failed with exit code 1
515 10:30p 🔵 Docker daemon not running - postgres:17-alpine image pull failed
516 " 🔵 Docker daemon is running and socket is accessible
517 10:40p ✅ Docker compose build and start re-attempted from docker/ subdirectory
518 10:50p 🔵 Docker Compose project initiated for primary session
519 10:51p 🟣 Docker Compose build initiated for paperclip project
520 11:10p 🔵 Docker Compose Build in Progress for Paperclip Project
S33 Diagnose and resolve Feishu connector plugin auto-install failure in Paperclip Docker deployment (May 14 at 11:10 PM)
S32 Docker Compose Build in Progress for Paperclip Project (May 14 at 11:10 PM)
521 11:11p ✅ Paperclip AI hostname authorization required
522 11:13p 🔵 TypeScript version downgraded to 5.7.3 during pnpm install
523 11:14p 🔵 Paperclip Feishu deployment uses authenticated private mode with plugin auto-install
524 " 🔵 Feishu plugin produces no logs in server container on startup
525 " 🔵 Paperclip API surface mapped from live server logs
526 " 🔵 Paperclip /plugins endpoint returns SPA HTML, not plugin manifest
527 " 🔵 /api/plugins requires Board-level authorization
528 11:15p 🔵 Paperclip plugin system architecture documented in plugins.ts
529 " 🔵 Plugin loader logs "no ready plugins" when plugin registry has no ready plugins
530 " 🔵 Plugin registry database table is empty
531 " 🔵 PAPERCLIP_PREINSTALL_PLUGIN processed by docker-entrypoint.sh
532 " 🔵 Docker entrypoint auto-installs plugins via paperclipai CLI
533 " 🔵 plugin-feishu-connector not present in container /app directory
534 11:16p 🔵 Paperclip CLI version is 0.3.1-connector-feishu
535 " 🔵 Plugin auto-install runs without API key or company ID credentials
S34 Docker container config structure discovered (May 14 at 11:16 PM)
536 11:23p 🔵 Docker container config structure discovered
S35 assertInstanceAdmin allows local_implicit source or isInstanceAdmin flag (May 14 at 11:23 PM)
537 11:27p ✅ Local dev environment configured with Paperclip API credentials
538 " ✅ Docker stack restarted with Feishu configuration
539 " 🟣 Feishu connector plugin auto-installed on server startup
540 " 🔵 Paperclip plugin architecture uses UUID-keyed multi-table schema
541 11:28p 🔵 Paperclip server API health check confirmed working with API key
542 " 🔵 Plugin install API requires board access beyond API key alone
543 " 🔵 Plugin install routes protected by assertInstanceAdmin middleware
544 " 🔵 assertInstanceAdmin allows local_implicit source or isInstanceAdmin flag
S36 Paperclip AI hostname whitelist blocking access (May 14 at 11:28 PM)
### May 17, 2026
545 9:06p 🔴 Paperclip AI hostname whitelist blocking access
S37 Incomplete user query observed - "如何增加多个" (May 17 at 9:06 PM)
546 9:08p 🔵 Incomplete user query observed - "如何增加多个"
### May 18, 2026
S43 Paperclip AI hostname security restriction (May 18 at 11:43 AM)
595 5:50p 🔵 Researching paperclip architecture pattern
### May 25, 2026
652 9:08p 🔵 Postgres parameter type error in heartbeat_runs query
653 9:09p 🔴 Date objects passed to postgres query instead of ISO strings
654 " 🔴 Fixed Date objects causing postgres ERR_INVALID_ARG_TYPE in heartbeat_runs query
655 9:10p 🔴 Added regression test for heartbeat run attribution with Date parameter handling
656 " 🔴 Regression test passed — fix confirmed
657 " 🔵 Pre-existing typecheck failures in server package
658 9:11p 🔴 PostgreSQL date parameters must be converted to ISO strings
659 9:12p 🔴 Fixed PostgreSQL Date parameter serialization in enrichCommentsWithDerivedAgentAttribution
660 9:35p 🔴 PostgreSQL Date parameter fix deployed to docker-server container
661 9:37p 🔵 Attachment open error confirmed fixed by deployment

Access 232k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>