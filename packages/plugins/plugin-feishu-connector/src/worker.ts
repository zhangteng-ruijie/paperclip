import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginEvent,
  type PluginHealthDiagnostics,
  type AgentSessionEvent,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import {
  ACTION_KEYS,
  DATA_KEYS,
  PLUGIN_ID,
  TOOL_NAMES,
} from "./constants.js";
import {
  getEnabledConnections,
  normalizeConfig,
  resolveBaseSink,
  resolveConnection,
} from "./config.js";
import {
  buildBaseRecord,
  buildSessionKey,
  createCommentBody,
  createIssueDescription,
  createIssueTitle,
  extractInboundMessage,
  renderTemplate,
  resolveRoute,
} from "./routing.js";
import {
  buildRecordUpsertArgs,
  buildReplyMessageArgs,
  buildSendMessageArgs,
  runLarkCli,
  startLarkEventSubscriber,
  type LarkEventSubscriber,
} from "./lark-cli.js";
import type {
  FeishuBaseSinkConfig,
  FeishuConnectionConfig,
  FeishuConnectorConfig,
  FeishuInboundMessage,
  FeishuSessionData,
  LarkCliResult,
} from "./types.js";

type RecentRecord = {
  level: "info" | "warning" | "error";
  message: string;
  createdAt: string;
  data?: unknown;
};

const recentRecords: RecentRecord[] = [];
const subscribers = new Map<string, LarkEventSubscriber>();
let currentContext: PluginContext | null = null;

function record(level: RecentRecord["level"], message: string, data?: unknown): void {
  recentRecords.unshift({ level, message, data, createdAt: new Date().toISOString() });
  if (recentRecords.length > 50) recentRecords.length = 50;
}

async function getConfig(ctx: PluginContext): Promise<FeishuConnectorConfig> {
  return normalizeConfig(await ctx.config.get());
}

function dedupKey(message: FeishuInboundMessage): string {
  return message.eventId ? `event:${message.eventId}` : `message:${message.messageId}`;
}

async function markDeduped(ctx: PluginContext, message: FeishuInboundMessage): Promise<boolean> {
  const stateKey = dedupKey(message);
  const existing = await ctx.state.get({
    scopeKind: "instance",
    namespace: "feishu-dedup",
    stateKey,
  });
  if (existing) return true;
  await ctx.state.set({
    scopeKind: "instance",
    namespace: "feishu-dedup",
    stateKey,
  }, { processedAt: new Date().toISOString(), messageId: message.messageId });
  return false;
}

async function findSession(
  ctx: PluginContext,
  companyId: string,
  sessionKey: string,
): Promise<FeishuSessionData | null> {
  const existing = await ctx.entities.list({
    entityType: "feishu-session",
    scopeKind: "company",
    scopeId: companyId,
    externalId: sessionKey,
    limit: 1,
    offset: 0,
  });
  const data = existing[0]?.data as Partial<FeishuSessionData> | undefined;
  return data?.paperclipIssueId && data.connectionId && data.sessionKey
    ? data as FeishuSessionData
    : null;
}

async function upsertSession(
  ctx: PluginContext,
  companyId: string,
  data: FeishuSessionData,
): Promise<void> {
  await ctx.entities.upsert({
    entityType: "feishu-session",
    scopeKind: "company",
    scopeId: companyId,
    externalId: data.sessionKey,
    title: data.rootMessageId ?? data.lastMessageId,
    status: "active",
    data: data as unknown as Record<string, unknown>,
  });
}

async function writeBaseRecord(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  sink: FeishuBaseSinkConfig,
  recordJson: Record<string, unknown>,
): Promise<LarkCliResult> {
  const args = buildRecordUpsertArgs({
    profileName: connection.profileName,
    identity: sink.identity ?? "bot",
    baseToken: sink.baseToken,
    tableIdOrName: sink.tableIdOrName,
    recordJson,
  });
  const result = await runLarkCli({
    bin: config.larkCliBin ?? "lark-cli",
    args,
    dryRun: config.dryRunCli === true,
  });
  record(result.ok ? "info" : "error", "Base record upsert executed", { ok: result.ok, dryRun: result.dryRun });
  return result;
}

async function replyToFeishu(
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  message: FeishuInboundMessage,
  text: string,
  idempotencyKey: string,
  replyInThread: boolean,
): Promise<LarkCliResult | null> {
  if (!message.messageId && !message.chatId) return null;
  const args = message.messageId
    ? buildReplyMessageArgs({
      profileName: connection.profileName,
      identity: "bot",
      messageId: message.messageId,
      text,
      replyInThread,
      idempotencyKey,
    })
    : buildSendMessageArgs({
      profileName: connection.profileName,
      identity: "bot",
      chatId: message.chatId,
      text,
      idempotencyKey,
    });
  const result = await runLarkCli({
    bin: config.larkCliBin ?? "lark-cli",
    args,
    dryRun: config.dryRunCli === true,
  });
  record(result.ok ? "info" : "error", "Feishu reply executed", { ok: result.ok, dryRun: result.dryRun });
  return result;
}

async function replyOnAgentSessionTerminal(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  route: NonNullable<FeishuConnectorConfig["routes"]>[number],
  message: FeishuInboundMessage,
  session: FeishuSessionData,
  issueTitle: string,
  event: AgentSessionEvent,
): Promise<void> {
  if ((route.replyMode ?? "thread") === "none") return;

  const isDone = event.eventType === "done";
  const template = isDone
    ? config.completionMessageTemplate ?? ""
    : "任务执行失败：{{issue_title}}";
  const text = renderTemplate(template, {
    message,
    route,
    issueId: session.paperclipIssueId,
    issueTitle,
    agentName: route.targetAgentName,
    runId: event.runId,
    runStatus: event.eventType,
  });
  const suffix = isDone || !event.message ? "" : `\n\n${event.message}`;
  const result = await replyToFeishu(
    config,
    connection,
    message,
    `${text}${suffix}`,
    `paperclip-feishu-completion-${event.runId}-${event.eventType}`,
    (route.replyMode ?? "thread") === "thread",
  );

  await upsertSession(ctx, route.companyId, {
    ...session,
    lastRunId: event.runId,
    lastRunStatus: event.eventType,
    lastRunFinishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await ctx.metrics.write("feishu.agent_run.replied", 1, {
    route: route.id,
    status: event.eventType,
  });
  record(result?.ok ? "info" : "error", "Feishu completion reply executed", {
    routeId: route.id,
    runId: event.runId,
    eventType: event.eventType,
    dryRun: result?.dryRun === true,
  });
}

async function handleInboundMessage(
  ctx: PluginContext,
  raw: unknown,
  options: { connectionId?: string } = {},
): Promise<Record<string, unknown>> {
  const config = await getConfig(ctx);
  const message = extractInboundMessage(raw, options.connectionId);
  const connection = resolveConnection(config, message.connectionId ?? options.connectionId);
  if (!connection) {
    throw new Error("No enabled Feishu connection configured");
  }
  const duplicate = await markDeduped(ctx, message);
  if (duplicate) {
    record("info", "Ignored duplicate Feishu event", { messageId: message.messageId });
    return { ok: true, duplicate: true, messageId: message.messageId };
  }

  const route = resolveRoute(config, message, connection.id);
  if (!route) {
    record("warning", "No Feishu route matched inbound message", { messageId: message.messageId, chatId: message.chatId });
    return { ok: false, reason: "no_route", messageId: message.messageId };
  }

  const sessionKey = buildSessionKey(message, connection.id);
  const existingSession = await findSession(ctx, route.companyId, sessionKey);
  let issueId = existingSession?.paperclipIssueId ?? null;
  let issueTitle = "";
  let createdIssue = false;

  if (issueId) {
    await ctx.issues.createComment(issueId, createCommentBody(message), route.companyId);
    issueTitle = existingSession?.rootMessageId ?? createIssueTitle(message);
  } else {
    issueTitle = createIssueTitle(message);
    const issue = await ctx.issues.create({
      companyId: route.companyId,
      projectId: route.projectId,
      title: issueTitle,
      description: createIssueDescription(message, route),
      priority: "medium",
      assigneeAgentId: route.targetAgentId,
    });
    issueId = issue.id;
    createdIssue = true;
  }

  const session: FeishuSessionData = {
    connectionId: connection.id,
    sessionKey,
    chatId: message.chatId,
    rootMessageId: message.rootMessageId ?? message.messageId,
    threadId: message.threadId,
    requesterOpenId: message.senderOpenId,
    paperclipIssueId: issueId,
    paperclipAgentId: route.targetAgentId,
    paperclipAgentSessionId: existingSession?.paperclipAgentSessionId,
    lastMessageId: message.messageId,
    updatedAt: new Date().toISOString(),
  };

  let runId: string | null = null;
  if (route.targetAgentId) {
    if (!session.paperclipAgentSessionId) {
      const agentSession = await ctx.agents.sessions.create(route.targetAgentId, route.companyId, {
        taskKey: sessionKey,
        reason: "feishu_message",
      });
      session.paperclipAgentSessionId = agentSession.sessionId;
    }

    const prompt = [
      "New Feishu request received.",
      "",
      message.text,
      "",
      `Paperclip issue: ${issueId}`,
      message.chatId ? `Feishu chat: ${message.chatId}` : null,
      `Feishu message: ${message.messageId}`,
    ].filter(Boolean).join("\n");

    let terminalReplyStarted = false;
    const run = await ctx.agents.sessions.sendMessage(session.paperclipAgentSessionId, route.companyId, {
      prompt,
      reason: "feishu_message",
      onEvent: (event) => {
        if (terminalReplyStarted || (event.eventType !== "done" && event.eventType !== "error")) return;
        terminalReplyStarted = true;
        void replyOnAgentSessionTerminal(
          ctx,
          config,
          connection,
          route,
          message,
          session,
          issueTitle,
          event,
        ).catch((error) => {
          ctx.logger.error("Failed to send Feishu completion reply", {
            routeId: route.id,
            runId: event.runId,
            error: String(error),
          });
          record("error", "Failed to send Feishu completion reply", {
            routeId: route.id,
            runId: event.runId,
            error: String(error),
          });
        });
      },
    });
    runId = run.runId;
    session.lastRunId = runId;
    session.lastRunStatus = "running";
  }
  await upsertSession(ctx, route.companyId, session);

  let baseResult: LarkCliResult | null = null;
  const sink = resolveBaseSink(config, route.baseSinkId);
  if (sink) {
    const baseRecord = buildBaseRecord(sink, {
      message,
      route,
      issueId,
      issueTitle,
      agentName: route.targetAgentName,
    });
    baseResult = await writeBaseRecord(ctx, config, connection, sink, baseRecord);
  }

  let ackResult: LarkCliResult | null = null;
  if (config.ackOnInbound && (route.replyMode ?? "thread") !== "none") {
    const ackText = renderTemplate(config.ackMessageTemplate ?? "", {
      message,
      route,
      issueId,
      issueTitle,
      agentName: route.targetAgentName,
    });
    ackResult = await replyToFeishu(
      config,
      connection,
      message,
      ackText,
      `paperclip-feishu-ack-${message.messageId}`,
      (route.replyMode ?? "thread") === "thread",
    );
  }

  await ctx.activity.log({
    companyId: route.companyId,
    entityType: "issue",
    entityId: issueId,
    message: `Feishu message routed to Paperclip issue "${issueTitle}"`,
    metadata: {
      plugin: PLUGIN_ID,
      routeId: route.id,
      connectionId: connection.id,
      messageId: message.messageId,
      runId,
    },
  });
  await ctx.metrics.write("feishu.inbound.routed", 1, { route: route.id });
  record("info", "Routed Feishu message to Paperclip", { issueId, routeId: route.id, runId });

  return {
    ok: true,
    duplicate: false,
    createdIssue,
    issueId,
    runId,
    agentSessionId: session.paperclipAgentSessionId ?? null,
    routeId: route.id,
    baseDryRun: baseResult?.dryRun === true,
    ackDryRun: ackResult?.dryRun === true,
  };
}

function stopSubscribers(): void {
  for (const subscriber of subscribers.values()) {
    subscriber.stop();
  }
  subscribers.clear();
}

async function startConfiguredSubscribers(ctx: PluginContext, config: FeishuConnectorConfig): Promise<void> {
  stopSubscribers();
  if (!config.enableEventSubscriber) return;
  for (const connection of getEnabledConnections(config)) {
    if (subscribers.has(connection.id)) continue;
    const subscriber = startLarkEventSubscriber({
      bin: config.larkCliBin ?? "lark-cli",
      profileName: connection.profileName,
      eventTypes: config.eventTypes,
      onEvent: (event) => {
        void handleInboundMessage(ctx, event, { connectionId: connection.id }).catch((error) => {
          ctx.logger.error("Failed to handle Feishu event", { connectionId: connection.id, error: String(error) });
          record("error", "Failed to handle Feishu event", { connectionId: connection.id, error: String(error) });
        });
      },
      onError: (error) => {
        ctx.logger.warn("Feishu event subscriber warning", { connectionId: connection.id, error: error.message });
        record("warning", "Feishu event subscriber warning", { connectionId: connection.id, error: error.message });
      },
    });
    subscribers.set(connection.id, subscriber);
    record("info", "Started Feishu event subscriber", { connectionId: connection.id, profileName: connection.profileName });
  }
}

async function registerDataHandlers(ctx: PluginContext): Promise<void> {
  ctx.data.register(DATA_KEYS.status, async () => {
    const config = await getConfig(ctx);
    return {
      pluginId: PLUGIN_ID,
      dryRunCli: config.dryRunCli === true,
      eventSubscriberEnabled: config.enableEventSubscriber === true,
      connectionCount: getEnabledConnections(config).length,
      routeCount: (config.routes ?? []).filter((route) => route.enabled !== false).length,
      baseSinkCount: (config.baseSinks ?? []).filter((sink) => sink.enabled !== false).length,
      subscribers: [...subscribers.entries()].map(([connectionId, subscriber]) => ({
        connectionId,
        profileName: subscriber.profileName,
        pid: subscriber.child.pid ?? null,
        killed: subscriber.child.killed,
      })),
      recentRecords,
    };
  });
}

async function registerActionHandlers(ctx: PluginContext): Promise<void> {
  ctx.actions.register(ACTION_KEYS.simulateInboundMessage, async (params) => {
    return await handleInboundMessage(ctx, params.raw ?? params, {
      connectionId: typeof params.connectionId === "string" ? params.connectionId : undefined,
    });
  });

  ctx.actions.register(ACTION_KEYS.sendMessage, async (params) => {
    const config = await getConfig(ctx);
    const connection = resolveConnection(config, typeof params.connectionId === "string" ? params.connectionId : undefined);
    if (!connection) throw new Error("No enabled Feishu connection configured");
    const args = buildSendMessageArgs({
      profileName: connection.profileName,
      identity: "bot",
      chatId: typeof params.chatId === "string" ? params.chatId : undefined,
      userId: typeof params.userId === "string" ? params.userId : undefined,
      text: typeof params.text === "string" ? params.text : undefined,
      markdown: typeof params.markdown === "string" ? params.markdown : undefined,
      content: typeof params.content === "string" ? params.content : undefined,
      msgType: typeof params.msgType === "string" ? params.msgType : undefined,
      idempotencyKey: typeof params.idempotencyKey === "string" ? params.idempotencyKey : undefined,
    });
    return await runLarkCli({ bin: config.larkCliBin ?? "lark-cli", args, dryRun: config.dryRunCli === true });
  });

  ctx.actions.register(ACTION_KEYS.writeBaseRecord, async (params) => {
    const config = await getConfig(ctx);
    const sink = resolveBaseSink(config, typeof params.sinkId === "string" ? params.sinkId : undefined);
    if (!sink) throw new Error("Base sink not found or disabled");
    const connection = resolveConnection(config, sink.connectionId);
    if (!connection) throw new Error("No enabled Feishu connection configured for Base sink");
    const recordJson = typeof params.record === "object" && params.record !== null && !Array.isArray(params.record)
      ? params.record as Record<string, unknown>
      : {};
    return await writeBaseRecord(ctx, config, connection, sink, recordJson);
  });
}

async function registerToolHandlers(ctx: PluginContext): Promise<void> {
  ctx.tools.register(
    TOOL_NAMES.sendMessage,
    {
      displayName: "Send Feishu Message",
      description: "Send a Feishu message through a configured lark-cli profile.",
      parametersSchema: {
        type: "object",
        properties: {
          connectionId: { type: "string" },
          chatId: { type: "string" },
          userId: { type: "string" },
          text: { type: "string" },
          markdown: { type: "string" },
        },
      },
    },
    async (params): Promise<ToolResult> => {
      const config = await getConfig(ctx);
      const payload = params as Record<string, unknown>;
      const connection = resolveConnection(config, typeof payload.connectionId === "string" ? payload.connectionId : undefined);
      if (!connection) return { error: "No enabled Feishu connection configured" };
      const args = buildSendMessageArgs({
        profileName: connection.profileName,
        identity: "bot",
        chatId: typeof payload.chatId === "string" ? payload.chatId : undefined,
        userId: typeof payload.userId === "string" ? payload.userId : undefined,
        text: typeof payload.text === "string" ? payload.text : undefined,
        markdown: typeof payload.markdown === "string" ? payload.markdown : undefined,
      });
      const result = await runLarkCli({ bin: config.larkCliBin ?? "lark-cli", args, dryRun: config.dryRunCli === true });
      return result.ok
        ? { content: result.dryRun ? "Feishu message dry-run succeeded." : "Feishu message sent.", data: result }
        : { error: result.stderr || `lark-cli exited with ${result.code}`, data: result };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.writeBaseRecord,
    {
      displayName: "Write Feishu Base Record",
      description: "Write a record to a configured Feishu Base sink.",
      parametersSchema: {
        type: "object",
        properties: {
          sinkId: { type: "string" },
          record: { type: "object" },
        },
        required: ["sinkId", "record"],
      },
    },
    async (params): Promise<ToolResult> => {
      const config = await getConfig(ctx);
      const payload = params as Record<string, unknown>;
      const sink = resolveBaseSink(config, typeof payload.sinkId === "string" ? payload.sinkId : undefined);
      if (!sink) return { error: "Base sink not found or disabled" };
      const connection = resolveConnection(config, sink.connectionId);
      if (!connection) return { error: "No enabled Feishu connection configured for Base sink" };
      const recordJson = typeof payload.record === "object" && payload.record !== null && !Array.isArray(payload.record)
        ? payload.record as Record<string, unknown>
        : {};
      const result = await writeBaseRecord(ctx, config, connection, sink, recordJson);
      return result.ok
        ? { content: result.dryRun ? "Base record dry-run succeeded." : "Base record written.", data: result }
        : { error: result.stderr || `lark-cli exited with ${result.code}`, data: result };
    },
  );
}

async function registerEventHandlers(ctx: PluginContext): Promise<void> {
  const onRunDone = async (event: PluginEvent) => {
    record("info", "Observed Paperclip run event", {
      eventType: event.eventType,
      runId: (event.payload as Record<string, unknown> | null)?.runId ?? event.entityId,
    });
  };
  ctx.events.on("agent.run.finished", onRunDone);
  ctx.events.on("agent.run.failed", onRunDone);
  ctx.events.on("agent.run.cancelled", onRunDone);
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;
    await registerDataHandlers(ctx);
    await registerActionHandlers(ctx);
    await registerToolHandlers(ctx);
    await registerEventHandlers(ctx);
    await startConfiguredSubscribers(ctx, await getConfig(ctx));
    record("info", "Feishu Connector setup complete", { pluginId: PLUGIN_ID });
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    const ctx = currentContext;
    const config = ctx ? await getConfig(ctx) : normalizeConfig({});
    return {
      status: "ok",
      message: "Feishu Connector worker is running",
      details: {
        dryRunCli: config.dryRunCli === true,
        eventSubscriberEnabled: config.enableEventSubscriber === true,
        enabledConnections: getEnabledConnections(config).length,
        activeSubscribers: subscribers.size,
      },
    };
  },

  async onConfigChanged(newConfig) {
    const ctx = currentContext;
    if (!ctx) return;
    const config = normalizeConfig(newConfig);
    await startConfiguredSubscribers(ctx, config);
    record("info", "Feishu Connector config changed", {
      enabledConnections: getEnabledConnections(config).length,
      subscribers: subscribers.size,
    });
  },

  async onValidateConfig(config) {
    const normalized = normalizeConfig(config);
    const warnings: string[] = [];
    const errors: string[] = [];
    if (normalized.enableEventSubscriber) {
      warnings.push("Event subscriber should only be enabled in local or singleton deployments. Cloud deployments should use a sidecar.");
    }
    for (const route of normalized.routes ?? []) {
      if (route.enabled === false) continue;
      if (!route.companyId) errors.push(`Route ${route.id} is missing companyId`);
      if (route.matchType === "chat" && !route.chatId) errors.push(`Route ${route.id} is chat match but missing chatId`);
      if (route.matchType === "user" && !route.userOpenId) errors.push(`Route ${route.id} is user match but missing userOpenId`);
      if (route.baseSinkId && !(normalized.baseSinks ?? []).some((sink) => sink.id === route.baseSinkId)) {
        errors.push(`Route ${route.id} references unknown base sink ${route.baseSinkId}`);
      }
    }
    return { ok: errors.length === 0, warnings, errors };
  },

  async onShutdown() {
    stopSubscribers();
    record("warning", "Feishu Connector shutting down");
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
