# Feishu Connector Completion Audit - 2026-05-13

This audit maps the user goal for `packages/plugins/plugin-feishu-connector` to current artifacts. It is intentionally evidence-based: green tests are listed only where they cover the specific requirement.

## Objective

Turn the Feishu plugin from a message receiver into a product-grade Paperclip Feishu Connector:

- Feishu conversations become Paperclip Issue entry points.
- Issues become the Agent workbench.
- Controlled Feishu capabilities are exposed to Agents.
- Final Agent results reliably return to the original Feishu conversation.
- Configuration, permissions, conflicts, retries, logs, and cloud packaging are production-oriented.

## Evidence Commands

Latest verified commands:

```bash
pnpm --filter @paperclipai/plugin-feishu-connector test
pnpm --filter @paperclipai/plugin-feishu-connector typecheck
pnpm --filter @paperclipai/plugin-feishu-connector pack:cloud
pnpm -r typecheck
```

Observed result:

- Repository baseline: local branch fast-forwarded to `origin/fixed-sync-0512` (`1bd32833`, merge of upstream master after `v2026.512.0`).
- Dependencies: `pnpm install` completed on the updated baseline; `pnpm-lock.yaml` now includes `@larksuite/cli@1.0.29`.
- Vitest: 67 tests passed.
- TypeScript: passed.
- Workspace typecheck: passed.
- Cloud pack: `output/plugin-feishu-connector-cloud/paperclipai-plugin-feishu-connector-0.3.1-connector-feishu.tgz`, install verified, manifest id `paperclipai.feishu-connector`; pack verifier also checks bundled `@larksuite/cli`, no `workspace:*` dependencies, migrations, webhook, scoped API route, sidebar, and comment action.
- Latest targeted verification was rerun after UI polish that hides chat/open/user/message identifiers from ordinary entry and Issue views; raw identifiers remain available only behind the Issue "排障信息（工程师）" disclosure or in advanced/admin paths.
- Latest targeted verification also covers restart-style duplicate delivery by deleting the in-memory/state dedupe key and proving persisted message routes prevent duplicate Issue/comment/Agent processing.

## Prompt-To-Artifact Checklist

| Requirement | Artifact evidence | Verification | Status |
| --- | --- | --- | --- |
| Five main tabs: 总览 / 入口 / 机器人 / 测试 / 高级 | `src/ui/index.tsx` main tab model and settings page | Typecheck + plugin UI bundle build in `pack:cloud` | Done |
| Ordinary users avoid internal IDs | `describeRouteEntry`, UI cards, chat/user search cards, Issue source card; tests checking no `boss-chat` in issue/comment text | `tests/worker.spec.ts`, `tests/routing.spec.ts`, plugin typecheck/build | Done |
| Multi-bot pool | `connections`, bot cards, route connection IDs, bot-scoped capability checks | Worker tests for multi-bot routing and scoped capability | Done |
| Multi-entry routing | `routes`, priority sorting, conflict logging | Conflict tests select highest-priority route | Done |
| Strict bot @ name matching | `botAliases`, mention mismatch handling | Tests for `@小锐` not triggering `锐思` | Done |
| Case-insensitive keyword/regex | `resolveMatchingRoutes` | Routing spec for Paperclip/paperclip | Done |
| Fast first ack | `ackOnInbound`, `buildAckReplyText`, `replyToFeishu` | Dry-run command tests verify ack path | Implemented, real 3-second SLA not externally verified |
| Final reply prioritizes final comment | `latestFinalComment`, issue comment event handling | Worker test: final comment beats `run.finished` fallback | Done |
| Long result summary | `buildFinalReplyText`, `summarizeFinalReplyBody` | Worker tests around concise completion reply | Done |
| Issue source card | `DATA_KEYS.issueSource`, `FeishuIssueTab` | Tests for source fields, attachment count, comments | Done |
| Issue action area | `replyIssueSourceThread`, `downloadIssueAttachments`, `writeIssueBaseRecord`, `lookupIssueRequester` actions | Worker action tests | Done |
| Comment quick action | `commentContextMenuItem` slot, `FeishuCommentReplyAction`, `replyIssueCommentToFeishu` | Manifest slot test + action test | Done |
| Agent controlled tools | `ctx.tools.register` for Feishu tools | Worker tests for lookup, fetch doc, download attachments, controlled runner | Done |
| Agent should not naked-run lark-cli | Prompt instruction + controlled `run_lark_cli_capability` allowlist | Tests block unknown/disabled commands | Done |
| Capability center | `src/capabilities.ts`, Advanced capability UI | Capability data tests, scoped capability tests | Done |
| Capability scopes: instance/bot/entry/agent | `isFeishuCapabilityEnabled` with context | Worker tests for bot, entry, agent scope injection | Done |
| lark-cli vs lark-* skills relationship | README + capability center `syncPolicy` | Tests assert skills do not auto-sync | Done |
| Cloud package includes CLI | `package.json` dependency `@larksuite/cli`, `pack-cloud.mjs` | Tarball `package.json` contains `@larksuite/cli` | Done |
| Secret/Vault for App Secret | `secrets.read-ref`, `bindProfile` Secret Ref path | Test ensures resolved secret goes to stdin and is not persisted | Done |
| Webhook receive | manifest `webhooks`, `onWebhook` | Worker webhook tests | Done |
| Webhook token/encrypt/signature | `eventVerificationTokenRef`, `eventEncryptKeyRef`, signature check | Secure webhook tests | Done |
| Scoped API route | manifest `apiRoutes`, `onApiRequest` simulate route | API route worker test | Done |
| Plugin sidebar | `sidebar` and `sidebarPanel` UI slots | Manifest slot test | Done |
| Plugin namespace database | manifest `database`, `migrations/001_feishu_connector.sql`, runtime `ctx.db.execute` sync | Database namespace test + tarball contains migration | Done |
| Conflict detection | event logs and `feishu_conflicts` entities | Conflict tests | Done |
| Dedup after restart | `plugin.state` dedupe namespace plus persisted session `processedMessageIds` / message route lookup | Unit test deletes the dedupe state key and verifies same Feishu message is treated as persisted duplicate without new comment or Issue | Done |
| Retry queue | retry queue state/actions | Retry queue test | Done |
| Attachments into Issue | resource download and issue attachment upload | Real-download fake CLI test | Done |
| Cloud install package | `pack:cloud` | Install verified | Done |

## Remaining Gaps / Requires Authorization

1. Real Feishu end-to-end test is not run yet.
   - Needed evidence: send a real message in a real Feishu group, observe first ack, Issue creation, Agent execution, final reply in original thread.
   - This is externally visible and requires explicit user approval.

2. Feishu URL verification `challenge` cannot be fully satisfied by the current plugin-only boundary.
   - Current host route `POST /api/plugins/:pluginId/webhooks/:endpointKey` always returns `{ deliveryId, status }`.
   - Scoped API routes are JSON-only and `auth: "webhook"` is explicitly disabled.
   - Plugin `onWebhook` can record/decrypt/validate the challenge payload, but cannot control the HTTP response body.
   - Fix requires changing Paperclip host/SDK webhook response contract or adding a dedicated public callback route, which conflicts with the current "do not change official SDK/host" constraint unless approved.

3. Real cloud deployment has not been exercised against a remote Paperclip instance.
   - The npm/tarball install is verified locally by `pack:cloud`.
   - Server profile/Secret provider, public callback, and one-live-listener topology still need environment validation.

## Current Conclusion

The plugin package is at a productized, locally verified hand-off state. It should not be marked "100% complete" until real Feishu E2E and the webhook challenge response boundary are explicitly resolved.
