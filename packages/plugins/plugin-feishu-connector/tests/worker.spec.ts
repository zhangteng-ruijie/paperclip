import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { Agent, Company } from "@paperclipai/shared";
import { ACTION_KEYS, DATA_KEYS, TOOL_NAMES } from "../src/constants.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

function company(): Company {
  const now = new Date();
  return {
    id: "company-1",
    name: "Test Company",
    description: null,
    status: "active",
    pauseReason: null,
    pausedAt: null,
    issuePrefix: "TC",
    issueCounter: 1,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    attachmentMaxBytes: 10 * 1024 * 1024,
    requireBoardApprovalForNewAgents: false,
    feedbackDataSharingEnabled: false,
    feedbackDataSharingConsentAt: null,
    feedbackDataSharingConsentByUserId: null,
    feedbackDataSharingTermsVersion: null,
    brandColor: null,
    logoAssetId: null,
    logoUrl: null,
    createdAt: now,
    updatedAt: now,
  };
}

function agent(): Agent {
  const now = new Date();
  return {
    id: "agent-1",
    companyId: "company-1",
    name: "资讯数字人",
    urlKey: "news-agent",
    role: "researcher",
    title: null,
    icon: null,
    status: "idle",
    reportsTo: null,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: false },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

const config = {
  dryRunCli: true,
  ackOnInbound: true,
  connections: [
    { id: "news-bot", name: "News Bot", profileName: "paperclip-news-bot", enabled: true },
  ],
  routes: [
    {
      id: "boss-chat",
      connectionId: "news-bot",
      matchType: "chat",
      chatId: "oc_boss",
      chatName: "老板资讯群",
      companyRef: "TC",
      targetAgentName: "资讯数字人",
      baseSinkId: "demand-base",
      replyMode: "thread",
      priority: 10,
    },
  ],
  baseSinks: [
    {
      id: "demand-base",
      connectionId: "news-bot",
      baseToken: "base_token",
      tableIdOrName: "tbl_demand",
      identity: "bot",
      fieldMap: {
        "需求标题": "{{issue_title}}",
        "原始需求": "{{message.text}}",
        "提出人": "{{sender.name}}",
        "Paperclip issue_id": "{{issue_id}}",
      },
    },
  ],
};

const mentionOnlyConfig = {
  ...config,
  routes: [
    {
      id: "mention-news-bot",
      connectionId: "news-bot",
      matchType: "regex",
      regex: "(@?锐思|paperclip)",
      companyRef: "TC",
      targetAgentName: "资讯数字人",
      replyMode: "thread",
      priority: 10,
    },
  ],
  baseSinks: [],
};

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for condition");
}

function encryptFeishuWebhookPayload(payload: Record<string, unknown>, encryptKey: string): string {
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const iv = Buffer.from("1234567890abcdef");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, ciphertext]).toString("base64");
}

function signFeishuWebhookBody(body: string, encryptKey: string, timestamp = "1710000000", nonce = "nonce-1"): Record<string, string> {
  return {
    "x-lark-request-timestamp": timestamp,
    "x-lark-request-nonce": nonce,
    "x-lark-signature": crypto.createHash("sha256").update(`${timestamp}${nonce}${encryptKey}${body}`).digest("hex"),
  };
}

describe("Feishu connector worker", () => {
  it("creates a Paperclip issue, invokes the routed agent, writes Base dry-run, and dedupes events", async () => {
    const harness = createTestHarness({ manifest, config });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-1",
        message_id: "om_1",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "这个资讯不够，再补一些 AI 芯片方向",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.createdIssue).toBe(true);
    expect(result.baseDryRun).toBe(true);
    expect(result.ackDryRun).toBe(true);
    expect(typeof result.issueId).toBe("string");
    expect(typeof result.runId).toBe("string");
    expect(typeof result.agentSessionId).toBe("string");

    harness.simulateSessionEvent(result.agentSessionId as string, {
      runId: result.runId as string,
      seq: 0,
      eventType: "done",
      stream: "system",
      message: "Run completed",
      payload: { status: "succeeded" },
    });
    await waitFor(() => harness.metrics.some((metric) => metric.name === "feishu.agent_run.replied"));
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(status)).toContain("智能体完成后的飞书回复已执行");
    expect(harness.metrics.some((metric) => metric.name === "feishu.agent_run.replied")).toBe(true);

    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.title).toContain("AI 芯片");
    expect(issues[0]?.description).toContain("接收入口：指定飞书会话「老板资讯群」 → 资讯数字人");
    expect(issues[0]?.description).not.toContain("入口代号");
    expect(issues[0]?.description).not.toContain("boss-chat");
    expect(issues[0]?.description).toContain("飞书会话：老板资讯群");
    expect(issues[0]?.description).toContain("原消息：已记录，可回原线程");
    expect(issues[0]?.description).not.toContain("oc_boss");
    expect(issues[0]?.description).not.toContain("om_1");
    expect(issues[0]?.assigneeAgentId).toBe("agent-1");
    const issueSource = await harness.getData<Record<string, unknown>>("issue-source", {
      issueId: issues[0]!.id,
    });
    expect(issueSource).toMatchObject({
      found: true,
      sourceKind: "feishu",
      issueId: issues[0]!.id,
      issueIdentifier: issues[0]!.identifier,
      entryName: "指定飞书会话「老板资讯群」 → 资讯数字人",
      botName: "News Bot",
      conversationName: "老板资讯群",
      requesterName: "老板",
      messageId: "om_1",
      replyMode: "thread",
      attachmentCount: 0,
    });

    const duplicate = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-1",
        message_id: "om_1",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        text: "这个资讯不够，再补一些 AI 芯片方向",
      },
    });

    expect(duplicate.duplicate).toBe(true);
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(1);
  });

  it("keeps raw Feishu ids out of Issue source display fields when names are not synced yet", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        routes: [
          {
            id: "keyword-xiaosi",
            connectionId: "news-bot",
            matchType: "keyword",
            keyword: "小思",
            companyRef: "TC",
            targetAgentName: "资讯数字人",
            replyMode: "thread",
            priority: 10,
          },
        ],
        baseSinks: [],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-display-safe",
        message_id: "om_display_safe",
        chat_id: "oc_e7eb18b06ec61be34e547bc78e8ec33f",
        sender_open_id: "ou_9f5bdebad6138f85cc6c7263ebb9bc32",
        text: "小思 帮我看下这条需求",
      },
    });

    expect(result.ok).toBe(true);
    const issueSource = await harness.getData<Record<string, unknown>>(DATA_KEYS.issueSource, {
      issueId: result.issueId,
    });
    expect(issueSource).toMatchObject({
      found: true,
      conversationName: null,
      conversationLabel: "飞书会话（名称待同步）",
      requesterName: null,
      chatId: "oc_e7eb18b06ec61be34e547bc78e8ec33f",
      requesterOpenId: "ou_9f5bdebad6138f85cc6c7263ebb9bc32",
    });
  });

  it("uses persisted message routes to ignore duplicate deliveries after dedupe state is lost", async () => {
    const harness = createTestHarness({ manifest, config });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const raw = {
      event_id: "evt-restart-duplicate",
      message_id: "om_restart_duplicate",
      chat_id: "oc_boss",
      sender_open_id: "ou_boss",
      sender_name: "老板",
      text: "请帮我查最近三天客户动态",
    };

    const first = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw,
    });

    expect(first.createdIssue).toBe(true);
    await harness.ctx.state.delete({
      scopeKind: "instance",
      namespace: "feishu-dedup",
      stateKey: "news-bot:event:evt-restart-duplicate",
    });

    const duplicate = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw,
    });

    expect(duplicate).toMatchObject({
      ok: true,
      duplicate: true,
      persistedDuplicate: true,
      issueId: first.issueId,
    });
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(1);
    const comments = await harness.ctx.issues.listComments(first.issueId as string, "company-1");
    expect(comments).toHaveLength(0);
  });

  it("lets an operator write the Feishu-created Issue context to the route Base sink", async () => {
    const harness = createTestHarness({ manifest, config });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const inbound = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-issue-action-base",
        message_id: "om_issue_action_base",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "把这个客户需求写到表里",
      },
    });

    const actionResult = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.writeIssueBaseRecord, {
      issueId: inbound.issueId,
      record: {
        "处理状态": "已受理",
      },
    });

    expect(actionResult.content).toContain("多维表格");
    expect(actionResult.data).toEqual(expect.objectContaining({
      dryRun: true,
      args: expect.arrayContaining(["base", "+record-upsert", "--table-id", "tbl_demand"]),
    }));
    expect(JSON.stringify(actionResult.data)).toContain("处理状态");
  });

  it("reports the Feishu capability center and separates lark-cli from local lark skills", async () => {
    const harness = createTestHarness({ manifest, config });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const capabilities = await harness.getData<Record<string, unknown>>("capabilities");

    expect(capabilities).toMatchObject({
      syncPolicy: {
        cliAutoBundled: true,
        larkSkillsAutoSynced: false,
        paperclipSkillsAutoSynced: false,
      },
      relationship: {
        larkCli: "runtime_api_client",
        larkSkills: "local_agent_instructions",
        paperclipTools: "controlled_plugin_tools",
      },
    });
    expect(capabilities).toHaveProperty("recommendedPermissionJson.scopes.tenant");
    expect(JSON.stringify(capabilities)).toContain("im:message:send_as_bot");
    expect(JSON.stringify(capabilities)).toContain("docx:document:readonly");
    expect(JSON.stringify(capabilities)).toContain("默认按飞书应用授权开放");
    expect(JSON.stringify(capabilities)).toContain("用户在能力中心关闭");
    expect(JSON.stringify(capabilities)).toContain("消息与群聊");
    expect(JSON.stringify(capabilities)).toContain("feishu.reply_source_thread");
    expect(JSON.stringify(capabilities)).toContain("feishu.ask_clarification");
    expect(JSON.stringify(capabilities)).toContain("日历会议");
    expect(JSON.stringify(capabilities)).toContain("审批");
    expect(JSON.stringify(capabilities)).toContain("任务");
    expect(JSON.stringify(capabilities)).toContain("邮箱");
    expect(JSON.stringify(capabilities)).toContain("OKR");
    expect(JSON.stringify(capabilities)).toContain("飞书妙记");
    expect(JSON.stringify(capabilities)).toContain("知识库");
    expect(JSON.stringify(capabilities)).toContain("云空间文件");
    expect(JSON.stringify(capabilities)).toContain("更新 lark-cli 不会自动同步 lark-* skills 到 Paperclip skill");
    const capabilityList = capabilities.capabilities as Array<{ key: string; enabled: boolean; statusLabel: string }>;
    expect(capabilityList.find((capability) => capability.key === "send_card")).toMatchObject({
      enabled: true,
      statusLabel: expect.stringContaining("已开启"),
    });
    expect(capabilityList.find((capability) => capability.key === "fetch_doc")).toMatchObject({
      enabled: true,
      statusLabel: expect.stringContaining("已开启"),
    });
    expect(capabilityList.find((capability) => capability.key === "mail")).toMatchObject({
      enabled: true,
      statusLabel: expect.stringContaining("已开启"),
    });
    expect(capabilityList.find((capability) => capability.key === "task")).toMatchObject({
      enabled: true,
      statusLabel: expect.stringContaining("已开启"),
    });
    expect(capabilityList.find((capability) => capability.key === "calendar_events")).toMatchObject({
      enabled: true,
      statusLabel: expect.stringContaining("已开启"),
    });
    expect(capabilityList.find((capability) => capability.key === "wiki")).toMatchObject({
      enabled: true,
      statusLabel: expect.stringContaining("已开启"),
    });
    expect(JSON.stringify(capabilities)).toContain("mail:user_mailbox.message:send");
    expect(JSON.stringify(capabilities)).toContain("calendar:calendar.event:create");
    expect(JSON.stringify(capabilities)).toContain("task:task:write");
  });

  it("declares the productized UI surfaces including the plugin sidebar", () => {
    expect(manifest.capabilities).toEqual(expect.arrayContaining([
      "instance.settings.register",
      "api.routes.register",
      "database.namespace.migrate",
      "database.namespace.read",
      "database.namespace.write",
      "ui.sidebar.register",
      "ui.dashboardWidget.register",
      "ui.detailTab.register",
      "ui.action.register",
    ]));
    expect(manifest.database).toEqual(expect.objectContaining({
      namespaceSlug: "feishu_connector",
      migrationsDir: "migrations",
      coreReadTables: ["issues"],
    }));
    expect(manifest.apiRoutes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        routeKey: "simulate-inbound-message",
        method: "POST",
        path: "/simulate-inbound-message",
        auth: "board",
      }),
    ]));
    expect(manifest.ui?.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "settingsPage", exportName: "FeishuSettingsPage" }),
      expect.objectContaining({ type: "dashboardWidget", exportName: "DashboardWidget" }),
      expect.objectContaining({ type: "sidebar", exportName: "FeishuSidebarLink" }),
      expect.objectContaining({ type: "sidebarPanel", exportName: "FeishuSidebarPanel" }),
      expect.objectContaining({ type: "detailTab", exportName: "FeishuIssueTab", entityTypes: ["issue"] }),
      expect.objectContaining({ type: "commentContextMenuItem", exportName: "FeishuCommentReplyAction", entityTypes: ["comment"] }),
    ]));
  });

  it("syncs connector config and runtime mappings into the plugin database namespace", async () => {
    const harness = createTestHarness({ manifest, config });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    expect(harness.dbExecutes.some((entry) => entry.sql.includes(".feishu_bots"))).toBe(true);
    expect(harness.dbExecutes.some((entry) => entry.sql.includes(".feishu_entries"))).toBe(true);
    expect(harness.dbExecutes.some((entry) => entry.sql.includes(".feishu_capabilities"))).toBe(true);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-db-sync",
        message_id: "om_db_sync",
        chat_id: "oc_boss",
        chat_name: "老板资讯群",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "帮我查锐捷网络最近三天动态，汇总给我",
      },
    });

    expect(result.ok).toBe(true);
    expect(harness.dbExecutes.some((entry) => entry.sql.includes(".feishu_conversations"))).toBe(true);
    expect(harness.dbExecutes.some((entry) => entry.sql.includes(".feishu_message_routes"))).toBe(true);
    await waitFor(() => harness.dbExecutes.some((entry) => entry.sql.includes(".feishu_event_logs")));
  });

  it("discovers current lark-cli schema/help coverage without treating lark skills as Paperclip tools", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-schema-discovery-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "const serviceHelp = {",
      "  im: 'Available Commands:\\n  +messages-send\\n  +messages-reply\\n  +messages-resources-download',",
      "  docs: 'Available Commands:\\n  +fetch',",
      "  base: 'Available Commands:\\n  +record-upsert',",
      "  contact: 'Available Commands:\\n  +search-user',",
      "};",
      "if (args[0] === 'schema' && args[1] === '--format') {",
      "  console.log('Available services:\\n\\n  im  即时通讯 API\\n  drive  云空间 API');",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'schema' && args[1] === 'im') {",
      "  console.log(JSON.stringify({ resources: { messages: { methods: { create: { scopes: ['im:message:send_as_bot'] } } } } }));",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'schema' && args[1] === 'drive') {",
      "  console.log(JSON.stringify({ resources: { files: { methods: { get: { scopes: ['drive:drive:readonly'] } } } } }));",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'schema' && args[1] === '--help') {",
      "  console.log('Usage: lark-cli schema <service.resource.method>');",
      "  process.exit(0);",
      "}",
      "if (serviceHelp[args[0]] && args[1] === '--help') {",
      "  console.log(serviceHelp[args[0]]);",
      "  process.exit(0);",
      "}",
      "console.error('unexpected args ' + args.join(' '));",
      "process.exit(1);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        larkCliBin: fakeCli,
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const capabilities = await harness.getData<Record<string, unknown>>(DATA_KEYS.capabilities);

    expect(capabilities).toHaveProperty("schemaDiscovery.checked", true);
    expect(JSON.stringify(capabilities)).toContain("已扫描 lark-cli schema/help");
    expect(JSON.stringify(capabilities)).toContain("schema_backed");
    expect(JSON.stringify(capabilities)).toContain("cli_help_backed");
    expect(JSON.stringify(capabilities)).toContain("lark-* skills 仍不会自动变成 Paperclip tools");
    expect(capabilities).toMatchObject({
      syncPolicy: {
        larkSkillsAutoSynced: false,
        paperclipSkillsAutoSynced: false,
      },
    });
  });

  it("checks granted lark-cli scopes against capability center recommendations", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-permission-check-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args.includes('auth') && args.includes('status') && args.includes('--verify')) {",
      "  console.log(JSON.stringify({ profileName: 'paperclip-news-bot', verified: true, scope: 'im:message:send_as_bot contact:user.base:readonly' }));",
      "  process.exit(0);",
      "}",
      "console.error('unexpected args ' + args.join(' '));",
      "process.exit(1);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        larkCliBin: fakeCli,
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.checkPermissions, {
      connectionId: "news-bot",
    });

    expect(result).toMatchObject({
      ok: false,
      profileName: "paperclip-news-bot",
      verified: true,
    });
    expect(result.grantedScopes).toEqual(expect.arrayContaining(["im:message:send_as_bot"]));
    expect(result.missingScopes).toEqual(expect.arrayContaining(["docx:document:readonly", "base:record:create"]));
    expect(JSON.stringify(result)).toContain("缺少飞书权限");
  });

  it("queues failed Feishu replies and lets an operator retry them after the CLI recovers", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-retry-queue-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    const allowSuccessPath = path.join(tempDir, "allow-success");
    const capturePath = path.join(tempDir, "retry-args.json");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "const args = process.argv.slice(2);",
      `const allowSuccessPath = ${JSON.stringify(allowSuccessPath)};`,
      `const capturePath = ${JSON.stringify(capturePath)};`,
      "if (!fs.existsSync(allowSuccessPath)) {",
      "  console.error('missing im:message:send_as_bot');",
      "  process.exit(1);",
      "}",
      "fs.writeFileSync(capturePath, JSON.stringify(args));",
      "console.log(JSON.stringify({ ok: true, retried: true, args }));",
      "process.exit(0);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        ackOnInbound: true,
        baseSinks: [],
        larkCliBin: fakeCli,
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const inbound = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-retry-ack",
        message_id: "om_retry_ack",
        thread_id: "om_retry_ack",
        chat_id: "oc_boss",
        chat_name: "老板资讯群",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "帮我查锐捷网络最近三天动态，汇总给我",
      },
    });

    expect(inbound.ok).toBe(true);
    let status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(status).toHaveProperty("retryQueue.pendingCount", 1);
    expect(JSON.stringify(status)).toContain("missing im:message:send_as_bot");

    await fs.writeFile(allowSuccessPath, "ok");
    const retry = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.retryFailedDeliveries);

    expect(retry).toMatchObject({
      ok: true,
      attemptedCount: 1,
      successCount: 1,
      failedCount: 0,
    });
    const retriedArgs = JSON.parse(await fs.readFile(capturePath, "utf8")) as string[];
    expect(retriedArgs).toEqual(expect.arrayContaining(["im", "+messages-reply", "--message-id", "om_retry_ack"]));
    status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(status).toHaveProperty("retryQueue.pendingCount", 0);
  });

  it("accepts Feishu event payloads through the public plugin webhook entrypoint", async () => {
    expect(manifest.capabilities).toContain("webhooks.receive");
    expect(manifest.webhooks).toEqual([
      expect.objectContaining({ endpointKey: "feishu-events" }),
    ]);
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: true,
        connections: [
          { id: "news-bot", name: "News Bot", profileName: "paperclip-news-bot", appId: "cli_news", enabled: true },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    await plugin.definition.onWebhook?.({
      endpointKey: "feishu-events",
      headers: {},
      rawBody: JSON.stringify({
        schema: "2.0",
        header: { event_id: "evt-webhook-1", app_id: "cli_news" },
        event: {
          sender: {
            sender_id: { open_id: "ou_boss" },
            sender_name: "老板",
          },
          message: {
            message_id: "om_webhook_1",
            root_id: "om_webhook_1",
            chat_id: "oc_boss",
            chat_name: "老板资讯群",
            message_type: "text",
            content: JSON.stringify({ text: "帮我查锐捷网络最近三天动态，汇总给我" }),
          },
        },
      }),
      parsedBody: {
        schema: "2.0",
        header: { event_id: "evt-webhook-1", app_id: "cli_news" },
        event: {
          sender: {
            sender_id: { open_id: "ou_boss" },
            sender_name: "老板",
          },
          message: {
            message_id: "om_webhook_1",
            root_id: "om_webhook_1",
            chat_id: "oc_boss",
            chat_name: "老板资讯群",
            message_type: "text",
            content: JSON.stringify({ text: "帮我查锐捷网络最近三天动态，汇总给我" }),
          },
        },
      },
      requestId: "req-webhook-1",
    });

    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.title).toContain("锐捷网络");
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(status)).toContain("已通过飞书公网回调处理事件");
  });

  it("decrypts and verifies Feishu public webhook deliveries with Secret Ref settings", async () => {
    const tokenRef = "feishu/event-token";
    const encryptKeyRef = "feishu/event-encrypt-key";
    const token = `resolved:${tokenRef}`;
    const encryptKey = `resolved:${encryptKeyRef}`;
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: true,
        eventVerificationTokenRef: tokenRef,
        eventEncryptKeyRef: encryptKeyRef,
        eventRequireSignature: true,
        connections: [
          { id: "news-bot", name: "News Bot", profileName: "paperclip-news-bot", appId: "cli_news", enabled: true },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const payload = {
      schema: "2.0",
      header: { event_id: "evt-webhook-secure-1", app_id: "cli_news", token },
      event: {
        sender: {
          sender_id: { open_id: "ou_boss" },
          sender_name: "老板",
        },
        message: {
          message_id: "om_webhook_secure_1",
          root_id: "om_webhook_secure_1",
          chat_id: "oc_boss",
          chat_name: "老板资讯群",
          message_type: "text",
          content: JSON.stringify({ text: "帮我查锐捷网络最近三天动态，汇总给我" }),
        },
      },
    };
    const encryptedBody = { encrypt: encryptFeishuWebhookPayload(payload, encryptKey) };
    const rawBody = JSON.stringify(encryptedBody);

    await plugin.definition.onWebhook?.({
      endpointKey: "feishu-events",
      headers: signFeishuWebhookBody(rawBody, encryptKey),
      rawBody,
      parsedBody: encryptedBody,
      requestId: "req-webhook-secure-1",
    });

    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.title).toContain("锐捷网络");
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(status)).toContain("tokenVerified");
    expect(JSON.stringify(status)).toContain("signatureVerified");
  });

  it("accepts board-scoped API route simulations for entry testing", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: true,
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const response = await plugin.definition.onApiRequest!({
      routeKey: "simulate-inbound-message",
      method: "POST",
      path: "/simulate-inbound-message",
      params: {},
      query: {},
      body: {
        companyId: "company-1",
        connectionId: "news-bot",
        raw: {
          event_id: "evt-api-route-1",
          message_id: "om_api_route_1",
          chat_id: "oc_boss",
          chat_name: "老板资讯群",
          sender_open_id: "ou_boss",
          sender_name: "老板",
          text: "帮我查锐捷网络最近三天动态，汇总给我",
        },
      },
      actor: {
        actorType: "user",
        actorId: "user-1",
        userId: "user-1",
        agentId: null,
        runId: null,
      },
      companyId: "company-1",
      headers: {},
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      ok: true,
      apiRoute: "simulate-inbound-message",
      companyId: "company-1",
      routeId: "boss-chat",
    }));
    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues).toHaveLength(1);
  });

  it("rejects Feishu webhook deliveries with a mismatched verification token", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        eventVerificationTokenRef: "feishu/event-token",
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    await expect(plugin.definition.onWebhook!({
      endpointKey: "feishu-events",
      headers: {},
      rawBody: JSON.stringify({
        schema: "2.0",
        header: { event_id: "evt-webhook-bad-token", app_id: "cli_news", token: "wrong-token" },
        event: {},
      }),
      parsedBody: {
        schema: "2.0",
        header: { event_id: "evt-webhook-bad-token", app_id: "cli_news", token: "wrong-token" },
        event: {},
      },
      requestId: "req-webhook-bad-token",
    })).rejects.toThrow("Verification Token");
  });

  it("records a conflict when one Feishu message matches multiple enabled entries", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        baseSinks: [],
        routes: [
          {
            id: "low-priority-ruijie",
            name: "低优先级锐捷入口",
            connectionId: "news-bot",
            matchType: "keyword",
            keyword: "锐捷",
            companyRef: "TC",
            targetAgentName: "资讯数字人",
            replyMode: "thread",
            priority: 1,
          },
          {
            id: "high-priority-ruijie",
            name: "高优先级锐捷入口",
            connectionId: "news-bot",
            matchType: "keyword",
            keyword: "锐捷",
            companyRef: "TC",
            targetAgentName: "资讯数字人",
            replyMode: "thread",
            priority: 20,
          },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-multi-entry",
        message_id: "om_multi_entry",
        chat_id: "oc_boss",
        chat_name: "老板资讯群",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "请汇总锐捷网络最近三天动态",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.routeId).toBe("high-priority-ruijie");
    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.description).toContain("接收入口：高优先级锐捷入口");
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(status)).toContain("同一条飞书消息命中多个入口");
    expect(JSON.stringify(status)).toContain("低优先级锐捷入口");
    await waitFor(async () => {
      const logs = await harness.ctx.entities.list({ entityType: "feishu_event_logs", limit: 50, offset: 0 });
      return logs.some((log) => String(log.data.message).includes("同一条飞书消息命中多个入口"));
    });
    const logs = await harness.ctx.entities.list({ entityType: "feishu_event_logs", limit: 50, offset: 0 });
    expect(logs.some((log) => String(log.data.message).includes("同一条飞书消息命中多个入口"))).toBe(true);
    const conflicts = await harness.ctx.entities.list({ entityType: "feishu_conflicts", limit: 10, offset: 0 });
    expect(conflicts).toHaveLength(1);
    expect(JSON.stringify(conflicts[0]?.data)).toContain("低优先级锐捷入口");
  });

  it("opens implemented lark-cli capabilities by default but still respects explicit off switches", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-default-capability-runner-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args.includes('docs') && args.includes('+fetch')) {",
      "  console.log(JSON.stringify({ ok: true, args }));",
      "  process.exit(0);",
      "}",
      "console.error('unexpected args ' + args.join(' '));",
      "process.exit(1);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        larkCliBin: fakeCli,
        capabilities: [],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.runLarkCliCapability,
      {
        capabilityKey: "fetch_doc",
        connectionId: "news-bot",
        command: ["docs", "+fetch", "--as", "user", "--doc", "https://ruijie.feishu.cn/docx/example"],
      },
      { runId: "run-generic-default-open", companyId: "company-1", agentId: "agent-1" },
    );

    expect(result.content).toContain("lark-cli 能力已执行");
    expect(result.data).toEqual(expect.objectContaining({
      args: expect.arrayContaining(["--profile", "paperclip-news-bot", "docs", "+fetch"]),
    }));

    const blockedHarness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        larkCliBin: fakeCli,
        capabilities: [{ key: "fetch_doc", enabled: false }],
      },
    });
    blockedHarness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(blockedHarness.ctx);

    const blocked = await blockedHarness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.runLarkCliCapability,
      {
        capabilityKey: "fetch_doc",
        connectionId: "news-bot",
        command: ["docs", "+fetch", "--as", "user", "--doc", "https://ruijie.feishu.cn/docx/example"],
      },
      { runId: "run-generic-explicitly-closed", companyId: "company-1", agentId: "agent-1" },
    );

    expect(blocked.error).toContain("未开启");
  });

  it("opens lark-cli service-backed platform capabilities through the audited runner by default", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-platform-capability-runner-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args.includes('task') && args.includes('+get-my-tasks')) {",
      "  console.log(JSON.stringify({ ok: true, service: 'task', args }));",
      "  process.exit(0);",
      "}",
      "if (args.includes('calendar') && args.includes('+agenda')) {",
      "  console.log(JSON.stringify({ ok: true, service: 'calendar', args }));",
      "  process.exit(0);",
      "}",
      "console.error('unexpected args ' + args.join(' '));",
      "process.exit(1);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        larkCliBin: fakeCli,
        capabilities: [],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const taskResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.runLarkCliCapability,
      {
        capabilityKey: "task",
        connectionId: "news-bot",
        command: ["task", "+get-my-tasks", "--as", "user", "--complete=false"],
      },
      { runId: "run-platform-task", companyId: "company-1", agentId: "agent-1" },
    );
    expect(taskResult.content).toContain("lark-cli 能力已执行");
    expect((taskResult.data as { stdout?: string }).stdout).toContain('"service":"task"');

    const calendarResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.runLarkCliCapability,
      {
        capabilityKey: "calendar_events",
        connectionId: "news-bot",
        command: ["calendar", "+agenda", "--as", "user", "--start", "2026-05-13"],
      },
      { runId: "run-platform-calendar", companyId: "company-1", agentId: "agent-1" },
    );
    expect(calendarResult.content).toContain("lark-cli 能力已执行");
    expect((calendarResult.data as { stdout?: string }).stdout).toContain('"service":"calendar"');
  });

  it("runs only enabled and allowlisted lark-cli capabilities through the audited runner", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-capability-runner-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args.includes('docs') && args.includes('+fetch')) {",
      "  console.log(JSON.stringify({ ok: true, args }));",
      "  process.exit(0);",
      "}",
      "console.error('unexpected args ' + args.join(' '));",
      "process.exit(1);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        larkCliBin: fakeCli,
        capabilities: [{ key: "fetch_doc", enabled: true }],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const allowed = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.runLarkCliCapability,
      {
        capabilityKey: "fetch_doc",
        connectionId: "news-bot",
        command: ["docs", "+fetch", "--as", "user", "--doc", "https://ruijie.feishu.cn/docx/example"],
      },
      { runId: "run-generic-allowed", companyId: "company-1", agentId: "agent-1" },
    );

    expect(allowed.content).toContain("lark-cli 能力已执行");
    expect(allowed.data).toEqual(expect.objectContaining({
      args: expect.arrayContaining(["--profile", "paperclip-news-bot", "docs", "+fetch"]),
      stdout: expect.stringContaining("\"ok\":true"),
    }));

    const blocked = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.runLarkCliCapability,
      {
        capabilityKey: "fetch_doc",
        command: ["mail", "+send", "--to", "someone@example.com"],
      },
      { runId: "run-generic-blocked", companyId: "company-1", agentId: "agent-1" },
    );
    expect(blocked.error).toContain("不在能力 fetch_doc 的允许命令里");
  });

  it("sends the first Feishu acknowledgement before waiting for the Paperclip run", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: true,
        ackOnInbound: true,
        baseSinks: [],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    let sendMessageStarted = false;
    let releaseSendMessage!: () => void;
    const sendMessageGate = new Promise<void>((resolve) => {
      releaseSendMessage = resolve;
    });
    const originalSendMessage = harness.ctx.agents.sessions.sendMessage.bind(harness.ctx.agents.sessions);
    harness.ctx.agents.sessions.sendMessage = async (sessionId, companyId, options) => {
      sendMessageStarted = true;
      await sendMessageGate;
      return await originalSendMessage(sessionId, companyId, options);
    };
    await plugin.definition.setup(harness.ctx);

    const promise = harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-ack-first",
        message_id: "om_ack_first",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "请创建一个 Paperclip 测试任务，完成后回复我",
      },
    });

    await waitFor(() => sendMessageStarted);
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(status)).toContain("已向飞书发送任务受理回执");

    releaseSendMessage();
    const result = await promise;
    expect(result.ok).toBe(true);
  });

  it("uses Feishu chat names from inbound events in the Paperclip issue context", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...mentionOnlyConfig,
        routes: [
          {
            id: "keyword-xiaosi-to-zhanggong",
            name: "keyword-xiaosi-to-zhanggong",
            connectionId: "news-bot",
            matchType: "keyword",
            keyword: "小思",
            companyRef: "TC",
            targetAgentName: "资讯数字人",
            replyMode: "thread",
            priority: 10,
          },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-chat-name",
        message_id: "om_chat_name",
        chat_id: "oc_it_ai",
        chat_name: "IT-AI应用组",
        sender_open_id: "ou_zhangteng",
        sender_name: "张腾",
        text: "@小思 总结一下最近讨论",
      },
    });

    expect(result.ok).toBe(true);
    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.description).toContain("飞书会话：IT-AI应用组");
    expect(issues[0]?.description).not.toContain("oc_it_ai");
    expect(issues[0]?.description).toContain("接收入口：包含「小思」的飞书消息 → 资讯数字人");
    expect(issues[0]?.description).not.toContain("keyword-xiaosi-to-zhanggong");
  });

  it("lets the agent reply to the original Feishu thread from the current run", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        ackOnInbound: false,
        baseSinks: [],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const inbound = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-agent-reply-original-thread",
        message_id: "om_agent_reply_original_thread",
        chat_id: "oc_boss",
        chat_name: "IT-AI应用组",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "请总结最近一周聊天内容",
      },
    });

    expect(inbound.ok).toBe(true);
    expect(typeof inbound.runId).toBe("string");

    const toolResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.replySourceThread,
      { text: "阶段进展：我已经开始整理，会把结论回到这里。" },
      { runId: inbound.runId as string, companyId: "company-1", agentId: "agent-1" },
    );

    expect(toolResult.content).toContain("原飞书会话：IT-AI应用组");
    expect(toolResult.content).not.toContain("oc_boss");
    const data = toolResult.data as { dryRun?: boolean; args?: string[] };
    expect(data.dryRun).toBe(true);
    expect(data.args).toEqual(expect.arrayContaining([
      "--message-id",
      "om_agent_reply_original_thread",
      "--reply-in-thread",
      "--text",
      "阶段进展：我已经开始整理，会把结论回到这里。",
    ]));
  });

  it("lets an operator reply to the source Feishu thread from the Issue action area", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        ackOnInbound: false,
        baseSinks: [],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const inbound = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-issue-action-reply",
        message_id: "om_issue_action_reply",
        chat_id: "oc_boss",
        chat_name: "老板资讯群",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "请整理一版老板资讯",
      },
    });

    expect(inbound.ok).toBe(true);
    const actionResult = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.replyIssueSourceThread, {
      issueId: inbound.issueId,
      text: "我已经在 Paperclip 任务里补充了阶段结论。",
    });

    expect(actionResult.content).toContain("已回复原飞书会话");
    expect(actionResult.data).toEqual(expect.objectContaining({
      dryRun: true,
      args: expect.arrayContaining([
        "--message-id",
        "om_issue_action_reply",
        "--reply-in-thread",
        "--text",
        "我已经在 Paperclip 任务里补充了阶段结论。",
      ]),
    }));
  });

  it("lets an operator reply a specific Paperclip comment back to Feishu", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        ackOnInbound: false,
        baseSinks: [],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const inbound = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-comment-action-reply",
        message_id: "om_comment_action_reply",
        chat_id: "oc_boss",
        chat_name: "老板资讯群",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "请整理一版老板资讯",
      },
    });
    const comment = await harness.ctx.issues.createComment(
      inbound.issueId as string,
      "这是要同步回飞书的评论正文。",
      "company-1",
      { authorAgentId: "agent-1" },
    );

    const issueSource = await harness.getData<Record<string, unknown>>(DATA_KEYS.issueSource, {
      issueId: inbound.issueId,
    });
    expect(JSON.stringify(issueSource)).toContain("这是要同步回飞书的评论正文。");

    const actionResult = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.replyIssueCommentToFeishu, {
      issueId: inbound.issueId,
      commentId: comment.id,
    });

    expect(actionResult.content).toContain("已把评论回复到原飞书会话");
    expect(actionResult.data).toEqual(expect.objectContaining({
      dryRun: true,
      args: expect.arrayContaining([
        "--message-id",
        "om_comment_action_reply",
        "--text",
        "这是要同步回飞书的评论正文。",
      ]),
    }));
  });

  it("lets the agent ask a clarification question in the original Feishu thread", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        ackOnInbound: false,
        baseSinks: [],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const inbound = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-agent-ask-clarification",
        message_id: "om_agent_ask_clarification",
        chat_id: "oc_boss",
        chat_name: "IT-AI应用组",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "帮我整理一下最近动态",
      },
    });

    expect(inbound.ok).toBe(true);

    const toolResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.askClarification,
      { question: "请确认要按最近三天还是最近一个月整理？" },
      { runId: inbound.runId as string, companyId: "company-1", agentId: "agent-1" },
    );

    expect(toolResult.content).toContain("已向原飞书会话追问");
    const data = toolResult.data as { dryRun?: boolean; args?: string[] };
    expect(data.dryRun).toBe(true);
    expect(data.args).toEqual(expect.arrayContaining([
      "--message-id",
      "om_agent_ask_clarification",
      "--reply-in-thread",
      "--text",
      "需要补充信息：请确认要按最近三天还是最近一个月整理？",
    ]));
  });

  it("lets the agent search Feishu users through a controlled tool", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-lookup-user-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args.includes('contact') && args.includes('+search-user')) {",
      "  console.log(JSON.stringify({ data: { users: [{ open_id: 'ou_zhangteng', user_id: 'zhangteng', name: '张腾', department_ids: ['000023'] }] } }));",
      "  process.exit(0);",
      "}",
      "console.error('unexpected args ' + args.join(' '));",
      "process.exit(1);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        baseSinks: [],
        larkCliBin: fakeCli,
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const toolResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.lookupUser,
      { query: "张腾", connectionId: "news-bot" },
      { runId: "run-lookup-user", companyId: "company-1", agentId: "agent-1" },
    );

    expect(toolResult.content).toContain("找到 1 个飞书用户");
    expect(toolResult.data).toEqual(expect.objectContaining({
      users: [expect.objectContaining({
        openId: "ou_zhangteng",
        userId: "zhangteng",
        name: "张腾",
      })],
    }));
  });

  it("lets an operator look up the Feishu requester from the Issue action area", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-issue-requester-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args.includes('contact') && args.includes('+search-user')) {",
      "  console.log(JSON.stringify({ data: { users: [{ open_id: 'ou_boss', user_id: 'boss', name: '老板' }] } }));",
      "  process.exit(0);",
      "}",
      "console.error('unexpected args ' + args.join(' '));",
      "process.exit(1);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        ackOnInbound: false,
        baseSinks: [],
        dryRunCli: false,
        larkCliBin: fakeCli,
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const inbound = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-issue-action-lookup",
        message_id: "om_issue_action_lookup",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "帮我查一下这个人",
      },
    });
    const actionResult = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.lookupIssueRequester, {
      issueId: inbound.issueId,
    });

    expect(actionResult.content).toContain("找到 1 个飞书用户");
    expect(actionResult.data).toEqual(expect.objectContaining({
      users: [expect.objectContaining({ openId: "ou_boss", name: "老板" })],
    }));
  });

  it("blocks controlled Feishu tools when their capability center switch is disabled", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-disabled-capability-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "console.log(JSON.stringify({ data: { users: [{ open_id: 'ou_should_not_run', name: '不应执行' }] } }));",
      "process.exit(0);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        baseSinks: [],
        larkCliBin: fakeCli,
        capabilities: [
          { key: "lookup_user", enabled: false },
          { key: "ask_clarification", enabled: false },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const lookupResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.lookupUser,
      { query: "张腾", connectionId: "news-bot" },
      { runId: "run-disabled-lookup", companyId: "company-1", agentId: "agent-1" },
    );
    expect(lookupResult.error).toContain("飞书能力 lookup_user 未开启");

    const inbound = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-disabled-ask-clarification",
        message_id: "om_disabled_ask_clarification",
        chat_id: "oc_boss",
        chat_name: "IT-AI应用组",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "帮我整理一下最近动态",
      },
    });

    expect(inbound.ok).toBe(true);
    const askResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.askClarification,
      { question: "请确认时间范围？" },
      { runId: inbound.runId as string, companyId: "company-1", agentId: "agent-1" },
    );
    expect(askResult.error).toContain("飞书能力 ask_clarification 未开启");
  });

  it("honors capability center bot scopes when deciding whether a controlled tool can run", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-scoped-capability-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args.includes('contact') && args.includes('+search-user')) {",
      "  console.log(JSON.stringify({ data: { users: [{ open_id: 'ou_zhangteng', user_id: 'zhangteng', name: '张腾' }] } }));",
      "  process.exit(0);",
      "}",
      "console.error('unexpected args ' + args.join(' '));",
      "process.exit(1);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        baseSinks: [],
        larkCliBin: fakeCli,
        connections: [
          { id: "news-bot", name: "小锐", profileName: "paperclip-news-bot", enabled: true },
          { id: "people-bot", name: "找人专家", profileName: "paperclip-people-bot", enabled: true },
        ],
        capabilities: [
          { key: "lookup_user", enabled: true, scope: "bot", connectionId: "news-bot" },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const allowed = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.lookupUser,
      { query: "张腾", connectionId: "news-bot" },
      { runId: "run-scoped-allowed", companyId: "company-1", agentId: "agent-1" },
    );
    expect(allowed.content).toContain("找到 1 个飞书用户");

    const blocked = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.lookupUser,
      { query: "张腾", connectionId: "people-bot" },
      { runId: "run-scoped-blocked", companyId: "company-1", agentId: "agent-1" },
    );
    expect(blocked.error).toContain("飞书能力 lookup_user 未开启");
  });

  it("injects only entry-scoped and agent-scoped Feishu tools that match the routed run", async () => {
    const prompts: string[] = [];
    const agentTwo: Agent = {
      ...agent(),
      id: "agent-2",
      name: "另外一个智能体",
      urlKey: "other-agent",
    };
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        ackOnInbound: false,
        baseSinks: [],
        routes: [
          {
            id: "boss-chat",
            connectionId: "news-bot",
            matchType: "chat",
            chatId: "oc_boss",
            chatName: "老板资讯群",
            companyRef: "TC",
            targetAgentName: "资讯数字人",
            targetAgentId: "agent-1",
            replyMode: "thread",
            priority: 10,
          },
          {
            id: "it-chat",
            connectionId: "news-bot",
            matchType: "chat",
            chatId: "oc_it",
            chatName: "IT-AI应用组",
            companyRef: "TC",
            targetAgentName: "另外一个智能体",
            targetAgentId: "agent-2",
            replyMode: "thread",
            priority: 10,
          },
        ],
        capabilities: [
          { key: "download_attachments", enabled: true, scope: "entry", routeId: "boss-chat" },
          { key: "lookup_user", enabled: true, scope: "agent", agentId: "agent-1" },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent(), agentTwo] });
    const originalSendMessage = harness.ctx.agents.sessions.sendMessage.bind(harness.ctx.agents.sessions);
    harness.ctx.agents.sessions.sendMessage = async (sessionId, companyId, options) => {
      prompts.push(options.prompt);
      return await originalSendMessage(sessionId, companyId, options);
    };
    await plugin.definition.setup(harness.ctx);

    await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-scoped-tools-boss",
        message_id: "om_scoped_tools_boss",
        chat_id: "oc_boss",
        chat_name: "老板资讯群",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "请查一下锐捷最近动态",
      },
    });
    await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-scoped-tools-it",
        message_id: "om_scoped_tools_it",
        chat_id: "oc_it",
        chat_name: "IT-AI应用组",
        sender_open_id: "ou_it",
        sender_name: "同事",
        text: "请查一下内部流程",
      },
    });

    const bossPrompt = prompts.find((prompt) => prompt.includes("飞书入口：指定飞书会话「老板资讯群」")) ?? "";
    const itPrompt = prompts.find((prompt) => prompt.includes("飞书入口：指定飞书会话「IT-AI应用组」")) ?? "";
    expect(bossPrompt).toContain("feishu.download_attachments");
    expect(bossPrompt).toContain("feishu.lookup_user");
    expect(itPrompt).not.toContain("feishu.download_attachments");
    expect(itPrompt).not.toContain("feishu.lookup_user");
  });

  it("lets the agent send a Feishu card through a controlled tool", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        ackOnInbound: false,
        baseSinks: [],
        capabilities: [{ key: "send_card", enabled: true }],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const toolResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.sendCard,
      {
        connectionId: "news-bot",
        chatId: "oc_boss",
        title: "任务完成",
        summary: "核心结论已整理完成。",
        actions: [
          { text: "打开 Paperclip", url: "https://paperclip.example/issues/TC-1" },
        ],
      },
      { runId: "run-send-card", companyId: "company-1", agentId: "agent-1" },
    );

    expect(toolResult.content).toContain("飞书卡片");
    const data = toolResult.data as { dryRun?: boolean; args?: string[] };
    expect(data.dryRun).toBe(true);
    expect(data.args).toEqual(expect.arrayContaining([
      "--chat-id",
      "oc_boss",
      "--msg-type",
      "interactive",
    ]));
    const content = JSON.parse(data.args![data.args!.indexOf("--content") + 1]!);
    expect(JSON.stringify(content)).toContain("任务完成");
    expect(JSON.stringify(content)).toContain("打开 Paperclip");
  });

  it("lets the agent fetch a Feishu document through a controlled tool", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-fetch-doc-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args.includes('docs') && args.includes('+fetch')) {",
      "  console.log('飞书文档正文：这里是需求背景和目标。');",
      "  process.exit(0);",
      "}",
      "console.error('unexpected args ' + args.join(' '));",
      "process.exit(1);",
    ].join("\n"));
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        baseSinks: [],
        larkCliBin: fakeCli,
        capabilities: [{ key: "fetch_doc", enabled: true }],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const toolResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.fetchDoc,
      { doc: "https://ruijie.feishu.cn/docx/example", connectionId: "news-bot" },
      { runId: "run-fetch-doc", companyId: "company-1", agentId: "agent-1" },
    );

    expect(toolResult.content).toContain("已读取飞书文档");
    expect(toolResult.data).toEqual(expect.objectContaining({
      text: expect.stringContaining("需求背景和目标"),
      args: expect.arrayContaining(["docs", "+fetch", "--doc", "https://ruijie.feishu.cn/docx/example"]),
    }));
  });

  it("explains when an agent tries to reply without a Feishu-created run", async () => {
    const harness = createTestHarness({ manifest, config });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const toolResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.replyOriginalThread,
      { text: "这条消息找不到飞书来源" },
      { runId: "run-not-from-feishu", companyId: "company-1", agentId: "agent-1" },
    );

    expect(toolResult.error).toContain("没有找到当前运行对应的飞书原会话");
  });

  it("recovers Feishu terminal replies from durable Paperclip run events without duplicating them", async () => {
    const harness = createTestHarness({ manifest, config: { ...config, ackOnInbound: false, baseSinks: [] } });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-run-finished",
        message_id: "om_run_finished",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "请创建一个 Paperclip 测试任务",
      },
    });

    expect(result.ok).toBe(true);
    expect(typeof result.runId).toBe("string");
    expect(typeof result.agentSessionId).toBe("string");

    await harness.emit("agent.run.finished", { runId: result.runId }, {
      entityId: result.runId as string,
      entityType: "agent_run",
      companyId: "company-1",
    });

    await waitFor(() => harness.metrics.filter((metric) => metric.name === "feishu.agent_run.replied").length === 1);
    expect(harness.metrics.filter((metric) => metric.name === "feishu.agent_run.replied")).toHaveLength(1);

    harness.simulateSessionEvent(result.agentSessionId as string, {
      runId: result.runId as string,
      seq: 1,
      eventType: "done",
      stream: "system",
      message: "Run completed",
      payload: { status: "succeeded" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.metrics.filter((metric) => metric.name === "feishu.agent_run.replied")).toHaveLength(1);
    await waitFor(async () => {
      const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
      return JSON.stringify(status).includes("已跳过重复的飞书完成回复");
    });
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(status)).toContain("已跳过重复的飞书完成回复");
  });

  it("prefers the Paperclip final issue comment and uses run.finished only as a fallback", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-final-comment-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    const capturePath = path.join(tempDir, "replies.jsonl");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "const args = process.argv.slice(2);",
      `fs.appendFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ args }) + '\\n');`,
      "process.exit(0);",
      "",
    ].join("\n"), "utf8");
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        ackOnInbound: false,
        baseSinks: [],
        larkCliBin: fakeCli,
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-final-comment",
        message_id: "om_final_comment",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "@锐思 请创建一个 paperclip 测试任务，完成后回复我",
      },
    });

    expect(result.ok).toBe(true);
    const comment = await harness.ctx.issues.createComment(
      result.issueId as string,
      "已完成：这里是最终交付正文。\n\n后续建议：继续真实飞书端验收。",
      "company-1",
      { authorAgentId: "agent-1" },
    );
    await harness.emit("issue.comment.created", { issueId: result.issueId }, {
      entityId: comment.id,
      entityType: "issue_comment",
      companyId: "company-1",
    });

    await waitFor(async () => {
      const output = await fs.readFile(capturePath, "utf8").catch(() => "");
      return output.trim().length > 0;
    });

    await harness.emit("agent.run.finished", { runId: result.runId }, {
      entityId: result.runId as string,
      entityType: "agent_run",
      companyId: "company-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const output = await fs.readFile(capturePath, "utf8");
    const replies = output.trim().split("\n").map((line) => JSON.parse(line) as { args: string[] });
    const replyTexts = replies
      .map(({ args }) => {
        const textIndex = args.indexOf("--text");
        return textIndex >= 0 ? args[textIndex + 1] ?? "" : "";
      })
      .filter(Boolean);
    expect(replyTexts).toHaveLength(1);
    expect(replyTexts[0]).toContain("任务完成：");
    expect(replyTexts[0]).toContain("这里是最终交付正文");
    expect(replyTexts[0]).not.toContain("处理完成：");
  });

  it("detects other Feishu bots replying in the same conversation and ignores those bot messages", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...mentionOnlyConfig,
        connections: [
          { id: "news-bot", name: "News Bot", profileName: "paperclip-news-bot", appId: "cli_ours", enabled: true },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-other-bot",
        message_id: "om_other_bot",
        chat_id: "oc_boss",
        sender_type: "app",
        sender_app_id: "cli_other",
        text: "@锐思 paperclip 已经处理完成",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      ignored: true,
      conflictDetected: true,
      reason: "external_bot_message",
    });
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(0);
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(status)).toContain("其他飞书机器人");
    expect(JSON.stringify(status)).toContain("抢答");
  });

  it("routes a shared Feishu app subscriber to the bot explicitly mentioned by the human", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...mentionOnlyConfig,
        connections: [
          { id: "ruisi-bot", name: "锐思", profileName: "same-profile", appId: "cli_same", enabled: true },
          { id: "xiaorui-bot", name: "小锐", profileName: "same-profile", appId: "cli_same", enabled: true },
        ],
        routes: [
          {
            id: "route-ruisi",
            connectionId: "ruisi-bot",
            matchType: "keyword",
            keyword: "锐思",
            companyRef: "TC",
            targetAgentName: "资讯数字人",
            replyMode: "thread",
            priority: 10,
          },
          {
            id: "route-xiaorui",
            connectionId: "xiaorui-bot",
            matchType: "keyword",
            keyword: "小锐",
            companyRef: "TC",
            targetAgentName: "资讯数字人",
            replyMode: "thread",
            priority: 10,
          },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "ruisi-bot",
      connectionIds: ["ruisi-bot", "xiaorui-bot"],
      raw: {
        event_id: "evt-shared-app-xiaorui",
        message_id: "om_shared_app_xiaorui",
        chat_id: "oc_team",
        chat_name: "张腾的智能体团队",
        sender_open_id: "ou_zhangteng",
        sender_name: "张腾",
        text: "@小锐 请搜索锐捷网络近三天动态",
      },
    });

    expect(result.ok).toBe(true);
    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.description).toContain("接收入口：包含「小锐」的飞书消息 → 资讯数字人");
    expect(issues[0]?.description).toContain("飞书会话：张腾的智能体团队");
    expect(issues[0]?.description).not.toContain("oc_team");
    expect(JSON.stringify(result)).toContain("route-xiaorui");
  });

  it("treats another configured Feishu bot as external for the current connection", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...mentionOnlyConfig,
        connections: [
          { id: "ruisi-bot", name: "锐思", profileName: "paperclip-ruisi", appId: "cli_ruisi", enabled: true },
          { id: "xiaorui-bot", name: "小锐", profileName: "paperclip-xiaorui", appId: "cli_xiaorui", enabled: true },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "ruisi-bot",
      raw: {
        event_id: "evt-configured-other-bot",
        message_id: "om_configured_other_bot",
        chat_id: "oc_boss",
        sender_type: "app",
        sender_app_id: "cli_xiaorui",
        text: "小锐已经回复了",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      ignored: true,
      conflictDetected: true,
      reason: "external_bot_message",
    });
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(0);
  });

  it("ignores messages emitted by the current Feishu bot to avoid self-trigger loops", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...mentionOnlyConfig,
        connections: [
          { id: "news-bot", name: "锐思", profileName: "paperclip-news-bot", appId: "cli_ruisi", enabled: true },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-self-bot",
        message_id: "om_self_bot",
        chat_id: "oc_boss",
        sender_type: "app",
        sender_app_id: "cli_ruisi",
        text: "已收到，交给 张工 处理。任务：CMP-100",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      ignored: true,
      reason: "self_bot_message",
    });
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(0);
  });

  it("ignores current bot messages even when Feishu omits sender type", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...mentionOnlyConfig,
        connections: [
          { id: "news-bot", name: "锐思", profileName: "paperclip-news-bot", appId: "cli_ruisi", enabled: true },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-self-bot-no-type",
        message_id: "om_self_bot_no_type",
        chat_id: "oc_boss",
        sender_app_id: "cli_ruisi",
        text: "任务已完成：CMP-100",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      ignored: true,
      reason: "self_bot_message",
    });
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(0);
  });

  it("ignores a human message that explicitly mentions another bot before keyword routing", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...mentionOnlyConfig,
        connections: [
          { id: "news-bot", name: "锐思", profileName: "paperclip-news-bot", appId: "cli_ruisi", enabled: true },
        ],
        routes: [
          {
            id: "xiaorui-keyword-on-ruisi",
            connectionId: "news-bot",
            matchType: "keyword",
            keyword: "小锐",
            companyRef: "TC",
            targetAgentName: "资讯数字人",
            replyMode: "thread",
            priority: 20,
          },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-human-mentions-xiaorui",
        message_id: "om_human_mentions_xiaorui",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "@小锐 请帮我搜索锐捷网络最近动态",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      ignored: true,
      reason: "mentioned_other_bot",
    });
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(0);
  });

  it("uses configured bot aliases to avoid reacting when Feishu does not return the real bot name", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        ...mentionOnlyConfig,
        connections: [
          {
            id: "news-bot",
            name: "本地飞书应用（张腾）",
            botAliases: ["锐思"],
            profileName: "paperclip-news-bot",
            appId: "cli_ruisi",
            enabled: true,
          },
        ],
        routes: [
          {
            id: "xiaorui-keyword-on-generic-profile",
            connectionId: "news-bot",
            matchType: "keyword",
            keyword: "小锐",
            companyRef: "TC",
            targetAgentName: "资讯数字人",
            replyMode: "thread",
            priority: 20,
          },
        ],
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-human-mentions-xiaorui-generic",
        message_id: "om_human_mentions_xiaorui_generic",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "@小锐 请帮我搜索锐捷网络最近动态",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      ignored: true,
      reason: "mentioned_other_bot",
    });
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(0);
  });

  it("maps follow-up messages in the same Feishu root to comments on the existing issue", async () => {
    const harness = createTestHarness({ manifest, config });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const first = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-1",
        message_id: "om_1",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        text: "今天的资讯不够",
      },
    });

    const followUp = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-2",
        message_id: "om_2",
        root_id: "om_1",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "再加一些海外竞品动态",
      },
    });

    expect(followUp.createdIssue).toBe(false);
    expect(followUp.issueId).toBe(first.issueId);
    expect(followUp.agentSessionId).toBe(first.agentSessionId);
    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues).toHaveLength(1);
    const comments = await harness.ctx.issues.listComments(first.issueId as string, "company-1");
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain("海外竞品");
    expect(comments[0]?.body).toContain("飞书会话：老板资讯群");
    expect(comments[0]?.body).toContain("原消息：已记录，可回原线程");
    expect(comments[0]?.body).not.toContain("oc_boss");
    expect(comments[0]?.body).not.toContain("om_2");
    expect(comments[0]?.body).toContain("接收入口：指定飞书会话「老板资讯群」 → 资讯数字人");
    expect(comments[0]?.body).not.toContain("入口代号");
    expect(comments[0]?.body).not.toContain("boss-chat");
  });

  it("ignores ordinary group images but accepts mentioned image attachments", async () => {
    const harness = createTestHarness({ manifest, config: mentionOnlyConfig });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const ignored = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-img-plain",
        message_id: "om_img_plain",
        message_type: "image",
        chat_id: "oc_boss",
        content: "{\"image_key\":\"img_v3_plain\"}",
      },
    });
    expect(ignored).toMatchObject({ ok: false, reason: "no_route" });
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(0);

    const accepted = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-img-mentioned",
        message_id: "om_img_mentioned",
        chat_id: "oc_boss",
        text: "@锐思 看下这个附件",
        content: "{\"image_key\":\"img_v3_mentioned\"}",
      },
    });

    expect(accepted).toMatchObject({ ok: true, createdIssue: true });
    expect(accepted.attachments).toEqual([
      expect.objectContaining({ filename: expect.stringContaining("img_v3_mentioned"), dryRun: true }),
    ]);
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(1);
    const issueSource = await harness.getData<Record<string, unknown>>(DATA_KEYS.issueSource, {
      issueId: accepted.issueId,
    });
    expect(issueSource).toMatchObject({
      attachmentCount: 1,
      attachments: [
        expect.objectContaining({ resourceKey: "img_v3_mentioned", resourceType: "image" }),
      ],
    });

    const toolResult = await harness.executeTool<Record<string, unknown>>(
      TOOL_NAMES.downloadAttachments,
      { issueId: accepted.issueId },
      { runId: accepted.runId as string, companyId: "company-1", agentId: "agent-1" },
    );
    expect(toolResult.content).toContain("已处理 1 个飞书附件");
    expect(toolResult.data).toEqual(expect.objectContaining({
      attachments: [expect.objectContaining({ resourceKey: "img_v3_mentioned", dryRun: true })],
    }));

    const actionResult = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.downloadIssueAttachments, {
      issueId: accepted.issueId,
    });
    expect(actionResult.content).toContain("已处理 1 个飞书附件");
  });

  it("downloads Feishu file resources into Paperclip issue attachments when real lark-cli calls are enabled", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-attachment-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "const args = process.argv.slice(2);",
      "if (args.includes('+messages-resources-download')) {",
      "  const output = args[args.indexOf('--output') + 1] || 'downloaded-file.bin';",
      "  fs.writeFileSync(path.resolve(process.cwd(), output), 'Feishu attachment body');",
      "  process.exit(0);",
      "}",
      "console.log(JSON.stringify({ ok: true, args }));",
      "process.exit(0);",
      "",
    ].join("\n"), "utf8");
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        ackOnInbound: false,
        baseSinks: [],
        larkCliBin: fakeCli,
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    const sentPrompts: string[] = [];
    const originalSendMessage = harness.ctx.agents.sessions.sendMessage.bind(harness.ctx.agents.sessions);
    harness.ctx.agents.sessions.sendMessage = async (sessionId, companyId, options) => {
      sentPrompts.push(options.prompt);
      return await originalSendMessage(sessionId, companyId, options);
    };
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-file-real",
        message_id: "om_file_real",
        thread_id: "om_file_real",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "请根据这个附件整理一版资讯摘要",
        content: "{\"file_key\":\"file_v1_material\",\"file_name\":\"需求材料.pdf\"}",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.attachments).toEqual([
      expect.objectContaining({
        filename: "需求材料.pdf",
        dryRun: false,
        error: null,
        attachmentId: expect.any(String),
      }),
    ]);
    expect(sentPrompts.join("\n")).toContain("需求材料.pdf 已作为 Paperclip 附件上传");
    expect(sentPrompts.join("\n")).toContain("不要直接使用 lark-cli");
    expect(sentPrompts.join("\n")).toContain("默认指 Paperclip 任务，不是飞书待办");
    expect(sentPrompts.join("\n")).toContain("飞书来源：老板资讯群");
    expect(sentPrompts.join("\n")).toContain("飞书消息：已记录，可通过飞书工具回到原线程");
    expect(sentPrompts.join("\n")).not.toContain("oc_boss");
    expect(sentPrompts.join("\n")).toContain("飞书入口：指定飞书会话「老板资讯群」 → 资讯数字人");
    expect(sentPrompts.join("\n")).toContain("可用飞书工具：");
    expect(sentPrompts.join("\n")).toContain("feishu.reply_source_thread");
    expect(sentPrompts.join("\n")).toContain("feishu.ask_clarification");
    expect(sentPrompts.join("\n")).toContain("feishu.download_attachments");
    expect(sentPrompts.join("\n")).toContain("feishu.lookup_user");
    expect(sentPrompts.join("\n")).not.toContain("入口代号");
    expect(sentPrompts.join("\n")).not.toContain("boss-chat");
    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues[0]?.description).toContain("需求材料.pdf（file）");
  });

  it("keeps Feishu thread replies concise when persisted legacy templates are present", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-replies-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    const capturePath = path.join(tempDir, "replies.jsonl");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "const args = process.argv.slice(2);",
      `fs.appendFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ args }) + '\\n');`,
      "process.exit(0);",
      "",
    ].join("\n"), "utf8");
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        dryRunCli: false,
        ackOnInbound: true,
        baseSinks: [],
        larkCliBin: fakeCli,
        ackMessageTemplate: "已收到，我会交给 {{agent_name}} 处理。",
        completionMessageTemplate: "任务已完成：{{issue_title}}",
      },
    });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-concise-reply",
        message_id: "om_concise_reply",
        thread_id: "om_concise_reply",
        chat_id: "oc_boss",
        sender_open_id: "ou_boss",
        sender_name: "老板",
        text: "@锐思 请创建一个 Paperclip 测试任务，完成后回复我；",
      },
    });

    expect(result.ok).toBe(true);
    harness.simulateSessionEvent(result.agentSessionId as string, {
      runId: result.runId as string,
      seq: 0,
      eventType: "done",
      stream: "system",
      message: "Run completed",
      payload: { status: "succeeded" },
    });

    let replyTexts: string[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const output = await fs.readFile(capturePath, "utf8").catch(() => "");
      const captures = output.trim().length > 0
        ? output.trim().split("\n").map((line) => JSON.parse(line) as { args: string[] })
        : [];
      replyTexts = captures
        .map(({ args }) => {
          const index = args.indexOf("--text");
          return index >= 0 ? args[index + 1] : "";
        })
        .filter(Boolean);
      if (replyTexts.length >= 2) break;
    }

    expect(replyTexts).toHaveLength(2);
    expect(replyTexts[0]).toContain("已收到，交给 资讯数字人 处理。");
    expect(replyTexts[0]).toContain("任务：");
    expect(replyTexts[1]).toContain("进度更新：");
    expect(replyTexts[1]).toContain("测试任务");
    expect(replyTexts.join("\n")).not.toContain("任务已完成：@锐思");
    expect(replyTexts.join("\n")).not.toContain("https://");
  });

  it("handles quick OK smoke tests without creating a Paperclip issue", async () => {
    const harness = createTestHarness({ manifest, config: mentionOnlyConfig });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.simulateInboundMessage, {
      connectionId: "news-bot",
      raw: {
        event_id: "evt-quick-ok",
        message_id: "om_quick_ok",
        chat_id: "oc_boss",
        text: "@锐思 只回复 ok",
      },
    });

    expect(result).toMatchObject({ ok: true, quickReply: true, replyOk: true });
    expect(result).not.toHaveProperty("runId");
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(0);
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(status)).toContain("已执行飞书快捷测试回复");
  });

  it("tests a route without creating a Paperclip issue", async () => {
    const harness = createTestHarness({ manifest, config });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.testRoute, {
      routeId: "boss-chat",
    });

    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      routeId: "boss-chat",
      message: "测试通过：入口能匹配飞书消息，并会用机器人回复。",
    });
    expect(result.sampleText).toBe("paperclip 只回复 ok");
    expect(await harness.ctx.issues.list({ companyId: "company-1" })).toHaveLength(0);
  });

  it("starts the official guided bind flow and returns the verification URL", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-bind-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "console.log('Open https://open.feishu.cn/app/setup?device_code=abc123 to continue');",
      "setTimeout(() => process.exit(0), 50);",
      "",
    ].join("\n"), "utf8");
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        larkCliBin: fakeCli,
      },
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.startGuidedBind, {
      profileName: "paperclip-feishu-bot",
    });

    expect(result.ok).toBe(true);
    expect(result.profileName).toBe("paperclip-feishu-bot");
    expect(result.url).toBe("https://open.feishu.cn/app/setup?device_code=abc123");
    expect(result.args).toEqual([
      "config",
      "init",
      "--new",
      "--name",
      "paperclip-feishu-bot",
      "--brand",
      "feishu",
      "--lang",
      "zh",
    ]);
  });

  it("confirms a completed guided bind by reading lark-cli profiles", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-finish-bind-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "if (process.argv.slice(2).join(' ') === 'profile list') {",
      "  console.log(JSON.stringify([{",
      "    name: 'paperclip-feishu-bot',",
      "    appId: 'cli_test_app',",
      "    brand: 'feishu',",
      "    active: true,",
      "    user: '测试用户',",
      "    tokenStatus: 'valid'",
      "  }]));",
      "  process.exit(0);",
      "}",
      "process.exit(1);",
      "",
    ].join("\n"), "utf8");
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        larkCliBin: fakeCli,
      },
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.finishGuidedBind, {
      profileName: "paperclip-feishu-bot",
    });

    expect(result.ok).toBe(true);
    expect(result.profile).toMatchObject({
      name: "paperclip-feishu-bot",
      appId: "cli_test_app",
      user: "测试用户",
      tokenStatus: "valid",
    });
  });

  it("validates product routes before a user can ship ambiguous Feishu entries", async () => {
    const result = await plugin.definition.onValidateConfig?.({
      ...config,
      routes: [
        {
          id: "missing-bot",
          matchType: "keyword",
          keyword: "",
          companyRef: "TC",
          enabled: true,
        },
        {
          id: "bad-regex",
          connectionId: "news-bot",
          matchType: "regex",
          regex: "(",
          companyRef: "TC",
          targetAgentName: "资讯数字人",
          enabled: true,
        },
      ],
      baseSinks: [],
    });

    expect(result?.ok).toBe(false);
    const errors = result?.errors ?? [];
    const warnings = result?.warnings ?? [];
    expect(errors.join("\n")).toContain("没有选择飞书机器人");
    expect(errors.join("\n")).toContain("没有填写关键词");
    expect(errors.join("\n")).toContain("正则表达式不可用");
    expect(warnings.join("\n")).toContain("没有指定智能体");
  });

  it("blocks enabled entries that use a Feishu bot missing from the current lark-cli profiles", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-missing-profile-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "if (process.argv.slice(2).join(' ') === 'profile list') {",
      "  console.log(JSON.stringify([]));",
      "  process.exit(0);",
      "}",
      "process.exit(1);",
      "",
    ].join("\n"), "utf8");
    await fs.chmod(fakeCli, 0o755);

    const result = await plugin.definition.onValidateConfig?.({
      ...config,
      dryRunCli: false,
      larkCliBin: fakeCli,
    });

    expect(result?.ok).toBe(false);
    expect((result?.errors ?? []).join("\n")).toContain("读不到它的授权/profile");
    expect((result?.errors ?? []).join("\n")).toContain("paperclip-news-bot");
    expect((result?.errors ?? []).join("\n")).toContain("请重新绑定");
  });

  it("warns when a technical Feishu connection has no @ name fallback", async () => {
    const result = await plugin.definition.onValidateConfig?.({
      ...config,
      dryRunCli: true,
      connections: [
        {
          id: "xiaorui",
          name: "cli_a435d83412b8903b",
          profileName: "cli_a435d83412b8903b",
          enabled: true,
        },
      ],
      routes: [],
      baseSinks: [],
    });

    expect(result?.ok).toBe(true);
    const warnings = (result?.warnings ?? []).join("\n");
    expect(warnings).toContain("没有填写 @ 名称");
    expect(warnings).toContain("@小锐/@锐思");
  });

  it("uses the only new lark-cli profile when the guided bind returns a generated profile name", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-finish-bind-generated-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "if (process.argv.slice(2).join(' ') === 'profile list') {",
      "  console.log(JSON.stringify([{",
      "    name: 'cli_generated_app',",
      "    appId: 'cli_generated_app',",
      "    brand: 'feishu',",
      "    active: false,",
      "    tokenStatus: 'valid'",
      "  }]));",
      "  process.exit(0);",
      "}",
      "process.exit(1);",
      "",
    ].join("\n"), "utf8");
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        connections: [],
        larkCliBin: fakeCli,
      },
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.finishGuidedBind, {
      profileName: "paperclip-feishu-bot",
    });

    expect(result.ok).toBe(true);
    expect(result.warning).toContain("cli_generated_app");
    expect(result.profile).toMatchObject({
      name: "cli_generated_app",
      appId: "cli_generated_app",
      tokenStatus: "valid",
    });
  });

  it("binds App ID and App Secret through lark-cli stdin without storing the secret", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-secret-bind-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    const capturePath = path.join(tempDir, "capture.json");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "const args = process.argv.slice(2);",
      "let stdin = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { stdin += chunk; });",
      "process.stdin.on('end', () => {",
      `  fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ args, stdin }));`,
      "  process.exit(args.includes('profile') && args.includes('add') ? 0 : 1);",
      "});",
      "process.stdin.resume();",
      "",
    ].join("\n"), "utf8");
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        larkCliBin: fakeCli,
      },
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.bindProfile, {
      profileName: "paperclip-feishu-secret",
      appId: "cli_secret_app",
      appSecret: "super-secret-value",
      brand: "feishu",
    });

    expect(result).toMatchObject({ ok: true, profileName: "paperclip-feishu-secret", appId: "cli_secret_app" });
    const captured = JSON.parse(await fs.readFile(capturePath, "utf8")) as { args: string[]; stdin: string };
    expect(captured.args).toEqual([
      "profile",
      "add",
      "--name",
      "paperclip-feishu-secret",
      "--app-id",
      "cli_secret_app",
      "--brand",
      "feishu",
      "--app-secret-stdin",
    ]);
    expect(captured.stdin).toBe("super-secret-value\n");
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(result)).not.toContain("super-secret-value");
    expect(JSON.stringify(status)).not.toContain("super-secret-value");
  });

  it("binds App Secret from a Paperclip Secret Ref without storing resolved secret material", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-secret-ref-bind-"));
    const fakeCli = path.join(tempDir, "fake-lark-cli.mjs");
    const capturePath = path.join(tempDir, "capture.json");
    await fs.writeFile(fakeCli, [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "const args = process.argv.slice(2);",
      "let stdin = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { stdin += chunk; });",
      "process.stdin.on('end', () => {",
      `  fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ args, stdin }));`,
      "  process.exit(args.includes('profile') && args.includes('add') ? 0 : 1);",
      "});",
      "process.stdin.resume();",
      "",
    ].join("\n"), "utf8");
    await fs.chmod(fakeCli, 0o755);

    const harness = createTestHarness({
      manifest,
      config: {
        ...config,
        larkCliBin: fakeCli,
      },
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<Record<string, unknown>>(ACTION_KEYS.bindProfile, {
      profileName: "paperclip-feishu-secret-ref",
      appId: "cli_secret_ref_app",
      appSecretRef: "feishu/app-secret",
      brand: "feishu",
    });

    expect(result).toMatchObject({
      ok: true,
      profileName: "paperclip-feishu-secret-ref",
      appId: "cli_secret_ref_app",
      appSecretRefUsed: true,
    });
    const captured = JSON.parse(await fs.readFile(capturePath, "utf8")) as { args: string[]; stdin: string };
    expect(captured.stdin).toBe("resolved:feishu/app-secret\n");
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(result)).not.toContain("resolved:feishu/app-secret");
    expect(JSON.stringify(status)).not.toContain("resolved:feishu/app-secret");
  });

  it("reports production monitor diagnostics in status data", async () => {
    const harness = createTestHarness({ manifest, config });
    harness.seed({ companies: [company()], agents: [agent()] });
    await plugin.definition.setup(harness.ctx);

    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(status.monitor).toMatchObject({
      health: "warning",
      enabledConnectionCount: 1,
      enabledRouteCount: 1,
      expectedSubscriberCount: 0,
      activeSubscriberCount: 0,
    });
    expect(JSON.stringify(status.monitor)).toContain("飞书机器人");
    expect(JSON.stringify(status.monitor)).toContain("自动监听");
  });
});
