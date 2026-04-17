# Agency-Agents To Paperclip Company Design

Status: Proposed  
Date: 2026-04-17  
Owner: Codex + zhangteng

## 1. Goal

Create a brand-new Paperclip company package derived from `msitarzewski/agency-agents`, but shaped for Paperclip's control-plane model instead of trying to import the source repository as-is.

This company should feel like a real operating business, not a loose pile of prompts:

- AI product is the central business engine
- brand growth and content acquisition exist as first-class business units
- the org chart is complete on day one
- every imported agent defaults to local Hermes execution
- all automatic heartbeats stay off by default
- company-facing names and prompts are authored in Chinese

The immediate success target is not "every agent autonomously runs perfectly on first import."  
The immediate success target is:

1. a valid portable company package exists
2. Paperclip dry-run import succeeds
3. new-company import succeeds without touching existing companies
4. the imported org chart is complete, readable, and structurally correct
5. every agent is configured for `hermes_local`

## 2. Why A Conversion Package Is Required

`agency-agents` is a strong talent library, but it is not a Paperclip company package.

What the source repository provides well:

- many high-quality specialist agent definitions
- clear functional clusters such as product, engineering, design, marketing, paid media, support, sales, and testing
- reusable prompt bodies that can seed Paperclip agent instructions

What it does not provide in a Paperclip-ready form:

- `COMPANY.md`
- a complete `reportsTo` org tree
- Paperclip-side adapter/runtime defaults
- an import-safe `.paperclip.yaml`
- a stable company package boundary

Because of that, the reliable path is:

1. select a curated subset of source agents
2. add a small number of hand-authored executive and coordination wrappers
3. convert the result into a Paperclip-native company package
4. import that package as a new company

## 3. Chosen Company Shape

The company is a `business-unit` organization with one product core and two surrounding growth engines.

### 3.1 Core identity

- Company type: AI-native digital company
- Primary engine: AI product
- Secondary engine: content acquisition
- Secondary engine: brand growth
- Coordination model: shared operations layer under COO
- Operator language: Simplified Chinese

### 3.2 Why this shape was chosen

This is the best fit for the user's constraints:

- larger than a tiny starter company
- closer to a real business than a pure engineering org
- still far more importable than a "holding company" or "group" model
- lets us reuse many `agency-agents` specialties without turning the first import into chaos

## 4. Runtime Defaults

These defaults are mandatory for phase 1.

### 4.1 Adapter

Every agent defaults to:

- `adapterType: hermes_local`

This matches the user's request and Paperclip's supported local adapter model.

### 4.2 Heartbeat policy

Every agent defaults to:

- scheduled heartbeats disabled
- assignment wakeups disabled
- automation wakeups disabled
- manual on-demand heartbeat allowed

In Paperclip runtime terms, the package should import agents with:

- `runtimeConfig.heartbeat.enabled = false`

If the importer or UI exposes more granular wake flags, they should also remain off in the generated extension config.

### 4.3 Budget policy

Phase 1 will not use restrictive agent budgets.

- leave budget unset or zero-equivalent
- do not create import-time budget stops
- defer budget shaping until after first successful import and first manual Hermes tests

### 4.4 Import scope

Phase 1 package should include:

- company metadata
- teams
- agents
- minimal Paperclip extension config

Phase 1 package should not include:

- starter projects
- starter issues/tasks
- routines
- vendored third-party skills
- aggressive env input requirements

This is deliberate. The first import should prove company structure first, not operational automation.

## 5. Organization Design

The first imported company will contain 36 agents total.

### 5.1 Executive layer

1. CEO
2. COO
3. CPO
4. CTO
5. CGO

### 5.2 Shared operations layer

6. PMO / Studio Operations Lead
7. Revenue Operations Manager
8. Customer Support Lead
9. Workflow & Knowledge Steward

### 5.3 AI product business unit

10. Product Lead
11. Product Manager
12. Sprint Prioritizer
13. Product Trend Researcher
14. Product Feedback Synthesizer
15. UX Architect
16. UX Researcher
17. UI Designer

### 5.4 Engineering and quality unit

18. AI Research Lead
19. Full-stack Engineer
20. Frontend Developer
21. Backend Architect
22. AI Engineer
23. DevOps Automator
24. QA Lead
25. Accessibility Auditor
26. Performance Benchmarker

### 5.5 Content acquisition unit

27. Brand Guardian
28. Content Director
29. SEO Strategist
30. Social Content Strategist
31. Video Content Producer

### 5.6 Brand growth unit

32. Growth Marketing Lead
33. Paid Search Strategist
34. Paid Social Strategist
35. Tracking Specialist
36. Marketing Analyst

This 36-agent target is intentional after roster validation against the source library; it gives each engine enough surface area to behave like a real business unit instead of a thin symbolic shell.

## 6. Reporting Structure

The reporting tree is intentionally strict and easy to reason about.

### 6.1 Top of tree

- CEO
  - COO
  - CPO
  - CTO
  - CGO

### 6.2 COO subtree

- COO
  - PMO / Studio Operations Lead
  - Revenue Operations Manager
  - Customer Support Lead
  - Workflow & Knowledge Steward

### 6.3 CPO subtree

- CPO
  - Product Lead
  - Product Manager
  - Sprint Prioritizer
  - Product Trend Researcher
  - Product Feedback Synthesizer
  - UX Architect
  - UX Researcher
  - UI Designer

### 6.4 CTO subtree

- CTO
  - AI Research Lead
  - Full-stack Engineer
  - Frontend Developer
  - Backend Architect
  - AI Engineer
  - DevOps Automator
  - QA Lead
  - Accessibility Auditor
  - Performance Benchmarker

### 6.5 CGO subtree

- CGO
  - Brand Guardian
  - Content Director
  - Growth Marketing Lead

- Content Director
  - SEO Strategist
  - Social Content Strategist
  - Video Content Producer

- Growth Marketing Lead
  - Paid Search Strategist
  - Paid Social Strategist
  - Tracking Specialist
  - Marketing Analyst

## 7. Source Mapping Strategy

The company will be assembled from two kinds of agents:

### 7.1 Directly adapted source specialists

These map closely to an `agency-agents` file and mostly keep the original body with light normalization:

- `product/product-manager.md`
- `product/product-sprint-prioritizer.md`
- `product/product-trend-researcher.md`
- `product/product-feedback-synthesizer.md`
- `design/design-ux-architect.md`
- `design/design-ux-researcher.md`
- `design/design-ui-designer.md`
- `engineering/engineering-frontend-developer.md`
- `engineering/engineering-backend-architect.md`
- `engineering/engineering-ai-engineer.md`
- `engineering/engineering-devops-automator.md`
- `marketing/marketing-seo-specialist.md`
- `marketing/marketing-social-media-strategist.md`
- `marketing/marketing-short-video-editing-coach.md`
- `paid-media/paid-media-ppc-strategist.md`
- `paid-media/paid-media-paid-social-strategist.md`
- `paid-media/paid-media-tracking-specialist.md`
- `support/support-support-responder.md`
- `sales/sales-pipeline-analyst.md`
- `testing/testing-accessibility-auditor.md`
- `testing/testing-performance-benchmarker.md`
- `specialized/specialized-model-qa.md`
- `project-management/project-management-studio-operations.md`
- `project-management/project-management-jira-workflow-steward.md`
- `design/design-brand-guardian.md`

For these roles, "light normalization" includes Chinese localization:

- translate role names and titles into natural Chinese
- rewrite the instruction body into concise Chinese operator language
- preserve the original responsibility boundaries
- drop decorative English persona phrasing when it does not help Paperclip execution

### 7.2 Hand-authored management wrappers

These are intentionally authored as Paperclip-first managers instead of pretending a perfect one-to-one source file already exists:

- CEO
- COO
- CPO
- CTO
- CGO
- Product Lead
- AI Research Lead
- Full-stack Engineer
- Content Director
- Growth Marketing Lead
- Marketing Analyst

These wrappers are necessary because the source repository is strongest at specialist roles, while Paperclip needs explicit managers who understand delegation, governance, and org-aware routing.

These wrappers should be authored directly in Chinese from the start instead of being translated later.

## 8. Portable Package Shape

The generated package will use the Paperclip-compatible portable company layout:

```text
agency-ai-company/
├── COMPANY.md
├── teams/
│   ├── shared-operations/TEAM.md
│   ├── ai-product/TEAM.md
│   ├── engineering-quality/TEAM.md
│   ├── content-acquisition/TEAM.md
│   └── brand-growth/TEAM.md
├── agents/
│   ├── ceo/AGENTS.md
│   ├── coo/AGENTS.md
│   ├── ...
│   └── marketing-analyst/AGENTS.md
└── .paperclip.yaml
```

Important format choices:

- use `AGENTS.md` for every agent package
- keep business identity in markdown frontmatter + body
- keep Paperclip runtime details in `.paperclip.yaml`
- avoid absolute local paths and secret values
- keep slugs, folder names, and machine-facing references in stable ASCII

## 8.1 Chinese-first authoring rules

The user wants the imported company to feel native in Chinese, so the generated package should keep a strict split between machine identifiers and operator-facing language.

Keep these in English / ASCII for stability:

- folder names
- file names
- agent and team slugs
- machine-facing references such as `reportsTo` targets and team paths

Write these in Chinese:

- company name
- team names
- agent `name`
- agent `title`
- capability descriptions
- `AGENTS.md` body instructions
- company and team descriptive copy shown to operators

The source repository is mostly English. We should not blindly paste it. Instead:

1. translate the role into natural Chinese
2. keep the operating intent of the source agent
3. rewrite the body so it sounds like a Chinese operator would actually configure it
4. remove tool/runtime assumptions that do not belong in the Paperclip company package

## 9. `.paperclip.yaml` Design

The extension file should stay minimal.

### 9.1 Per-agent data included

For each agent, the extension can declare:

- adapter type = `hermes_local`
- runtime heartbeat disabled
- optional sidebar ordering

### 9.2 Per-agent data excluded

Phase 1 should omit:

- secrets
- prompt duplication if already present in `AGENTS.md`
- system-specific absolute commands
- instructions file path bindings
- budgets beyond zero/unset defaults
- routines

## 10. Import Strategy

### 10.1 First import target

Always import as:

- `target = new company`

Never merge this first package into an existing company.

### 10.2 Sequence

1. Generate the company package in-repo or in a temp build folder
2. Validate that every agent has a slug, name, title, role, and `reportsTo`
3. Run Paperclip import preview / dry-run
4. Inspect resulting manifest and import plan
5. Apply import as a new company only after preview is clean

### 10.3 Dry-run success bar

The preview is acceptable only if:

- no package-structure errors exist
- no agent-path resolution errors exist
- no reporting-cycle errors exist
- all agents resolve with `hermes_local`
- the company is planned as `created`, not merged

## 11. Why This Is The "100% Success" Version

This plan is deliberately conservative in the places that usually break:

- it does not import the raw upstream repository directly
- it does not assume the source already has a valid org chart
- it does not depend on starter tasks or routines
- it does not depend on third-party skills resolving at import time
- it does not enable automatic runtime behavior on import
- it does not touch the user's existing companies

The risk is shifted from runtime complexity into controlled package authoring, which is exactly what we want for phase 1.

## 12. Validation Plan

### 12.1 Package validation

Validate before import:

- every referenced `reportsTo` slug exists
- every `TEAM.md` manager exists
- every `AGENTS.md` has valid frontmatter
- no duplicate slugs
- no duplicate top-level titles that would confuse the org chart

### 12.2 Import validation

After preview and import:

- company appears in Paperclip company list
- org chart renders the full tree
- every agent shows `hermes_local`
- every imported agent shows heartbeat disabled
- no automatic runs start

### 12.3 Post-import smoke validation

Only after import succeeds:

- manually invoke heartbeat for 1 executive agent
- manually invoke heartbeat for 1 product agent
- manually invoke heartbeat for 1 engineering agent
- manually invoke heartbeat for 1 content/growth agent

If manual Hermes invocation works for those representatives, phase 1 is complete.

## 13. Non-Goals For Phase 1

The following are explicitly deferred:

- auto-generating the company from the entire upstream repository
- importing 50+ specialists at once
- live budget enforcement policy
- broad recurring automation
- project and issue seeding
- automatic skill vendoring
- full commercial sales and account-management org

Those belong in phase 2 once the first company exists and is operationally legible.

## 14. Implementation Outline

Implementation should happen in this order:

1. create a local transformation script or authored package folder
2. generate `COMPANY.md`
3. generate `TEAM.md` files
4. generate `AGENTS.md` files for direct adapters and manager wrappers
5. generate minimal `.paperclip.yaml`
6. run import preview
7. revise package until preview is clean
8. apply import as a new company

## 15. Open Choice Resolved Here

This design resolves the final operator choices as follows:

- organization model: business-unit company
- central engine: AI product
- secondary engines: content acquisition and brand growth
- runtime default: `hermes_local`
- heartbeat default: automatic heartbeats off
- import mode: new company only
- import scope: company + teams + agents + minimal extension only

## 16. Approval To Proceed

After this spec is approved, the next step is implementation:

- author the portable company package
- run preview import
- inspect the plan
- import the company
