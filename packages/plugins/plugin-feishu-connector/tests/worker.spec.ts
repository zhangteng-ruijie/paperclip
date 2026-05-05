import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { Agent, Company } from "@paperclipai/shared";
import { ACTION_KEYS, DATA_KEYS } from "../src/constants.js";
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
    expect(issues[0]?.description).toContain("飞书会话：老板资讯群（oc_boss）");
    expect(issues[0]?.assigneeAgentId).toBe("agent-1");

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
    expect(comments[0]?.body).toContain("飞书会话：老板资讯群（oc_boss）");
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
    expect(sentPrompts.join("\n")).toContain("飞书来源：老板资讯群（oc_boss）");
    expect(sentPrompts.join("\n")).toContain("飞书入口：指定飞书会话「老板资讯群」 → 资讯数字人");
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
    expect(JSON.stringify(status)).not.toContain("super-secret-value");
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
