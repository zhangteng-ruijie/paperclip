import { describe, expect, it } from "vitest";
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
      companyId: "company-1",
      targetAgentId: "agent-1",
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    const status = await harness.getData<Record<string, unknown>>(DATA_KEYS.status);
    expect(JSON.stringify(status)).toContain("Feishu completion reply executed");
    expect(harness.metrics.some((metric) => metric.name === "feishu.agent_run.replied")).toBe(true);

    const issues = await harness.ctx.issues.list({ companyId: "company-1" });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.title).toContain("AI 芯片");
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
  });
});
