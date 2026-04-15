# Backend Development Requirements

Document created: 2026-04-14
Analyzed routes: `server/src/routes/`
Analyzed adapters: `packages/adapters/`

---

## 1. Existing API Analysis

### 1.1 Implemented Routes (27 files)

| Route File | Description | Status |
|---|---|---|
| `access.ts` | Company member management, invites, join requests, permissions | Complete |
| `activity.ts` | Activity logging | Complete |
| `adapters.ts` | Adapter lifecycle management (install, uninstall, reload, config-schema) | Complete |
| `agents.ts` | Agent CRUD, execution, skills, heartbeats, instructions | Complete |
| `approvals.ts` | Issue approval workflows | Complete |
| `assets.ts` | Asset management | Complete |
| `authz.ts` | Authorization middleware helpers | Complete |
| `companies.ts` | Company CRUD, branding, portability (import/export) | Complete |
| `company-skills.ts` | Company-level skill management | Complete |
| `costs.ts` | Cost tracking and reporting | Complete |
| `dashboard.ts` | Dashboard aggregations | Complete |
| `execution-workspaces.ts` | Execution workspace management | Complete |
| `goals.ts` | Goal management | Complete |
| `health.ts` | Health check endpoints | Complete |
| `inbox-dismissals.ts` | Inbox dismissal rules | Complete |
| `instance-settings.ts` | Instance-wide settings (general, experimental) | Complete |
| `issues-checkout-wakeup.ts` | Issue checkout wakeup | Complete |
| `issues.ts` | Issue management | Complete |
| `llms.ts` | LLM configuration management | Complete |
| `org-chart-svg.ts` | Org chart SVG generation | Complete |
| `plugin-ui-static.ts` | Plugin UI static assets | Complete |
| `plugins.ts` | Plugin management | Complete |
| `projects.ts` | Project management | Complete |
| `routines.ts` | Routine (scheduled task) management | Complete |
| `secrets.ts` | Secret management (providers, CRUD, rotation) | Complete |
| `sidebar-badges.ts` | Sidebar badge data | Complete |

### 1.2 Missing / Incomplete API Endpoints

| Area | Missing Endpoint | Priority |
|---|---|---|
| **Authentication** | No dedicated `/auth/*` routes — auth handled via middleware | Medium |
| **Users** | No `/users/:id` profile management | Medium |
| **API Keys** | No user API key management endpoints | Medium |
| **Webhooks** | No `/webhooks/*` for outbound event delivery | High |
| **Notifications** | No `/notifications/*` preference management | Medium |
| **Rate Limiting** | No `/rate-limits/*` status endpoint | Low |
| **Audit Logs** | No dedicated audit log export endpoint | Medium |
| **Billing** | No `/billing/*` subscription management | High |
| **Analytics** | No `/analytics/*` advanced reporting | Low |
| **Workspaces** | No `/workspaces/*` persistent workspace management | Medium |

---

## 2. Adapter Analysis

### 2.1 Existing Adapters (7 built-in)

| Adapter | Type | Status |
|---|---|---|
| `claude-local` | Claude Code local execution | Production |
| `codex-local` | OpenAI Codex local | Production |
| `cursor-local` | Cursor local | Production |
| `gemini-local` | Gemini local | Production |
| `openclaw-gateway` | OpenClaw Gateway WebSocket | Production |
| `opencode-local` | OpenCode local | Production |
| `pi-local` | PI local | Production |

### 2.2 Missing Adapters by Category

#### Cloud AI Providers
| Adapter | Priority |
|---|---|
| `anthropic-cloud` (Claude API) | High |
| `openai` (GPT-4 via API) | High |
| `google-ai-studio` (Gemini API) | Medium |
| `azure-openai` | Medium |
| `aws-bedrock` | Low |
| `groq` | Low |
| `mistral` | Low |
| `cohere` | Low |

#### Tool Integrations
| Adapter | Priority |
|---|---|
| `github` (Issues, PRs, Actions) | High |
| `slack` (notifications) | High |
| `jira` | Medium |
| `linear` | Medium |
| `gitlab` | Low |

#### Infrastructure
| Adapter | Priority |
|---|---|
| `s3` (file storage) | Medium |
| `pinecone` (vector search) | Low |
| `chromadb` (vector search) | Low |

### 2.3 Adapter Interface Analysis

The `ServerAdapterModule` interface (defined in `packages/adapter-utils/src/types.ts`) is well-designed with:

**Core Methods:**
- `execute(ctx)` — Required, runs agent
- `testEnvironment(ctx)` — Required, validates setup
- `listSkills(ctx)` / `syncSkills(ctx)` — Optional skill management
- `sessionManagement` — Optional session compaction

**Optional Lifecycle Hooks:**
- `onHireApproved` — When agent is approved
- `getQuotaWindows` — Rate limit visibility
- `detectModel` — Config detection
- `getConfigSchema` — Declarative UI form

**Gaps in Adapter Interface:**
1. No streaming response support in execute result
2. No multi-agent coordination hooks
3. No budget/cost callback mechanism
4. No workspace state sync protocol

---

## 3. Requirements Priority List

### P0 — Critical (Must Have)

1. **Webhook System**
   - `POST /api/webhooks` — Register webhook
   - `GET /api/webhooks` — List webhooks
   - `DELETE /api/webhooks/:id` — Remove webhook
   - `POST /api/webhooks/:id/test` — Test webhook delivery
   - Event types: `agent.created`, `agent.execution.completed`, `routine.triggered`, `issue.created`, `company.imported`

2. **Billing API**
   - `GET /api/billing/subscription` — Current subscription
   - `GET /api/billing/invoices` — Invoice history
   - `POST /api/billing/checkout` — Create checkout session
   - `POST /api/billing/portal` — Customer portal session

3. **Claude API Adapter** (`anthropic-cloud`)
   - Cloud API access (not local Claude Code)
   - Model selection: Claude Opus, Sonnet, Haiku
   - Streaming support
   - Token usage tracking

### P1 — High Priority

4. **OpenAI API Adapter** (`openai`)
   - GPT-4, GPT-4o, GPT-4o-mini via API
   - Streaming support
   - Token usage tracking

5. **GitHub Adapter** (`github`)
   - Create/read/update issues
   - Comment on issues
   - Trigger workflows
   - File operations via API

6. **Slack Adapter** (`slack`)
   - Send messages to channels
   - Interactive message buttons
   - OAuth flow for workspace connection

7. **User API Key Management**
   - `POST /api/users/:id/api-keys` — Create key
   - `GET /api/users/:id/api-keys` — List keys
   - `DELETE /api/users/:id/api-keys/:keyId` — Revoke key

### P2 — Medium Priority

8. **User Profile Management**
   - `GET /api/users/:id` — Get profile
   - `PATCH /api/users/:id` — Update profile
   - `GET /api/users/:id/activity` — User activity

9. **Notification Preferences**
   - `GET /api/notifications/preferences`
   - `PATCH /api/notifications/preferences`
   - Per-channel (email, Slack, webhook) settings

10. **Audit Log Export**
    - `GET /api/companies/:id/audit-logs`
    - Filter by: actor, action, date range, entity type
    - Export formats: JSON, CSV

11. **Workspace Management API**
    - `GET /api/workspaces` — List persistent workspaces
    - `POST /api/workspaces` — Create workspace
    - `DELETE /api/workspaces/:id` — Archive workspace

12. **Jira Adapter** (`jira`)
    - Create/read/update issues
    - Transition issue status
    - Add comments

### P3 — Low Priority (Nice to Have)

13. **Analytics API**
    - `GET /api/analytics/usage` — Usage by company/agent
    - `GET /api/analytics/costs` — Cost breakdown

14. **Rate Limit Status**
    - `GET /api/rate-limits/status` — Current rate limit state

15. **Linear Adapter** (`linear`)
16. **GitLab Adapter** (`gitlab`)
17. **Google AI Studio Adapter** (`google-ai-studio`)

---

## 4. Recommended Implementation Approach

### 4.1 Webhook System (P0)

Use a queue-based approach for reliability:

```
WebhookService
├── register(webhook: Webhook): Promise<Webhook>
├── unregister(id: string): Promise<void>
├── deliver(event: Event, webhook: Webhook): Promise<DeliveryResult>
└── retryFailed(): Promise<void>

WebhookDeliveryQueue (Bull + Redis)
├── Enqueue on event
├── Process with signature verification
├── Retry with exponential backoff (3 attempts)
└── Dead letter queue for permanent failures
```

### 4.2 Cloud Adapter Pattern

Follow existing `openclaw-gateway` as the reference implementation:

```
openai/src/
├── server/
│   ├── index.ts          # Exports ServerAdapterModule
│   ├── execute.ts        # API call execution
│   ├── parse.ts          # Response parsing
│   ├── skills.ts         # Skill support
│   └── models.ts         # Model list
└── ui/
    ├── index.ts          # UI component entry
    └── build-config.ts   # Config form
```

### 4.3 API Key Management

Store hashed keys (SHA-256) with:
- Key prefix (first 8 chars) for identification
- Full hash for verification
- Expiry date (optional)
- Last used timestamp

### 4.4 Database Considerations

All new tables follow existing patterns:
- UUID primary keys
- CreatedAt, UpdatedAt timestamps
- Soft deletes where appropriate
- Indexes on foreign keys and common query fields

---

## 5. Testing Requirements

- Unit tests for all service layer functions
- Integration tests for all new API endpoints
- Adapter test suite: environment check, execute, skill sync
- Webhook delivery test harness
- Load testing for webhook delivery (1000 events/sec)
