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
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ACTION_KEYS,
  DATA_KEYS,
  DEFAULT_ACK_TEMPLATE,
  DEFAULT_COMPLETION_TEMPLATE,
  LEGACY_ACK_TEMPLATE,
  LEGACY_COMPLETION_TEMPLATE,
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
  describeFeishuConversation,
  describeRouteTrigger,
  extractInboundMessage,
  renderTemplate,
  resolveRoute,
} from "./routing.js";
import {
  buildRecordUpsertArgs,
  buildMessageGetArgs,
  buildProfileAddArgs,
  buildReplyMessageArgs,
  buildResourceDownloadArgs,
  buildSendMessageArgs,
  runLarkCli,
  startLarkConfigInit,
  startLarkEventSubscriber,
  type LarkConfigInitSession,
  type LarkEventSubscriber,
} from "./lark-cli.js";
import type {
  FeishuBaseSinkConfig,
  FeishuConnectionConfig,
  FeishuConnectorConfig,
  FeishuInboundAttachment,
  FeishuInboundMessage,
  FeishuRouteConfig,
  FeishuSessionData,
  LarkCliResult,
} from "./types.js";

type RecentRecord = {
  level: "info" | "warning" | "error";
  message: string;
  createdAt: string;
  data?: unknown;
};

type MonitorCheckTone = "success" | "warning" | "error";

type ProductionMonitorCheck = {
  key: string;
  tone: MonitorCheckTone;
  title: string;
  detail: string;
};

type ProductionMonitor = {
  health: "ok" | "warning" | "error";
  message: string;
  checkedAt: string;
  enabledConnectionCount: number;
  enabledRouteCount: number;
  expectedSubscriberCount: number;
  activeSubscriberCount: number;
  missingSubscriberConnectionIds: string[];
  recentErrorCount: number;
  recentWarningCount: number;
  lastEventAt: string | null;
  lastWatchdogAt: string | null;
  checks: ProductionMonitorCheck[];
};

type AttachedResourceResult = {
  filename: string;
  resourceKey: string;
  resourceType: FeishuInboundAttachment["resourceType"];
  attachmentId?: string;
  contentPath?: string;
  dryRun?: boolean;
  error?: string;
};

type ProfileRow = {
  name: string;
  appId: string | null;
  brand: string | null;
  active: boolean;
  user: string | null;
  tokenStatus: string | null;
  botName?: string | null;
  botOpenId?: string | null;
  botAvatarUrl?: string | null;
  botActivateStatus?: number | null;
};

type UserAuthSession = {
  profileName: string;
  deviceCode: string;
  verificationUrl: string;
  expiresAt: number;
};

type DirectoryChatRow = {
  chatId: string;
  name: string;
  description: string | null;
  external: boolean;
};

type DirectoryUserRow = {
  openId: string;
  userId: string | null;
  name: string;
  departmentIds: string[];
};

const recentRecords: RecentRecord[] = [];
const subscribers = new Map<string, LarkEventSubscriber>();
const guidedBindSessions = new Map<string, LarkConfigInitSession>();
const userAuthSessions = new Map<string, UserAuthSession>();
let currentContext: PluginContext | null = null;
let subscriberWatchdog: ReturnType<typeof setInterval> | null = null;
let lastWatchdogAt: string | null = null;
let lastInboundEventAt: string | null = null;

function record(level: RecentRecord["level"], message: string, data?: unknown): void {
  recentRecords.unshift({ level, message, data, createdAt: new Date().toISOString() });
  if (recentRecords.length > 50) recentRecords.length = 50;
}

function textPreview(text?: string | null, maxLength = 120): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function inboundMessageDiagnostics(
  message: FeishuInboundMessage,
  connection: FeishuConnectionConfig,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    connectionId: connection.id,
    connectionName: connection.name,
    profileName: connection.profileName,
    appId: connection.appId ?? null,
    messageId: message.messageId,
    chatId: message.chatId ?? null,
    chatName: message.chatName ?? null,
    senderName: message.senderName ?? null,
    senderOpenId: message.senderOpenId ?? null,
    textPreview: textPreview(message.text),
    attachmentCount: message.attachments.length,
    ...extra,
  };
}

function routeMatchDiagnostic(
  route: FeishuRouteConfig,
  message: FeishuInboundMessage,
  connectionId: string,
): Record<string, unknown> {
  const routeConnectionMatches = !route.connectionId || route.connectionId === connectionId;
  let triggerMatched = false;
  let reason = "";

  if (!routeConnectionMatches) {
    reason = `入口绑定的是 ${route.connectionId}，但消息来自 ${connectionId}`;
  } else if (route.enabled === false) {
    reason = "入口已暂停";
  } else if (route.matchType === "chat") {
    triggerMatched = !!route.chatId && route.chatId === message.chatId;
    reason = triggerMatched ? "飞书会话匹配" : `飞书会话不一致：入口 ${route.chatName ?? route.chatId ?? "未设置"}，消息 ${message.chatName ?? message.chatId ?? "未知会话"}`;
  } else if (route.matchType === "user") {
    triggerMatched = !!route.userOpenId && route.userOpenId === message.senderOpenId;
    reason = triggerMatched ? "提出人匹配" : `提出人不一致：入口 ${route.userName ?? route.userOpenId ?? "未设置"}，消息 ${message.senderName ?? message.senderOpenId ?? "unknown"}`;
  } else if (route.matchType === "keyword") {
    const keyword = route.keyword?.trim() ?? "";
    triggerMatched = !!keyword && message.text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
    reason = triggerMatched ? `消息包含关键词「${keyword}」` : `消息不包含关键词「${keyword || "未设置"}」`;
  } else if (route.matchType === "regex") {
    if (!route.regex) {
      reason = "正则表达式未设置";
    } else {
      try {
        triggerMatched = new RegExp(route.regex, "i").test(message.text);
        reason = triggerMatched ? `正则匹配「${route.regex}」` : `正则未匹配「${route.regex}」`;
      } catch (error) {
        reason = `正则表达式不可用：${String(error)}`;
      }
    }
  } else {
    triggerMatched = route.matchType === "default";
    reason = triggerMatched ? "默认入口匹配" : "入口类型未识别";
  }

  return {
    routeId: route.id,
    routeName: describeRouteTrigger(route),
    enabled: route.enabled !== false,
    trigger: describeRouteTrigger(route),
    routeConnectionId: route.connectionId ?? null,
    messageConnectionId: connectionId,
    connectionMatched: routeConnectionMatches,
    triggerMatched,
    wouldMatch: routeConnectionMatches && route.enabled !== false && triggerMatched,
    reason,
  };
}

function enabledRoutes(config: FeishuConnectorConfig): FeishuRouteConfig[] {
  return (config.routes ?? []).filter((route) => route.enabled !== false);
}

function activeSubscriberEntries(): Array<[string, LarkEventSubscriber]> {
  return [...subscribers.entries()].filter(([, subscriber]) => subscriber.isRunning());
}

function recentRecordsSince(minutes: number): RecentRecord[] {
  const since = Date.now() - minutes * 60 * 1000;
  return recentRecords.filter((item) => Date.parse(item.createdAt) >= since);
}

function buildProductionMonitor(config: FeishuConnectorConfig): ProductionMonitor {
  const connections = getEnabledConnections(config);
  const routes = enabledRoutes(config);
  const activeEntries = activeSubscriberEntries();
  const expectedSubscriberCount = config.enableEventSubscriber === true ? connections.length : 0;
  const activeSubscriberCount = activeEntries.length;
  const activeSubscriberIds = new Set(activeEntries.map(([connectionId]) => connectionId));
  const missingSubscriberConnectionIds = config.enableEventSubscriber === true
    ? connections.filter((connection) => !activeSubscriberIds.has(connection.id)).map((connection) => connection.id)
    : [];
  const recent = recentRecordsSince(30);
  const recentErrorCount = recent.filter((item) => item.level === "error").length;
  const recentWarningCount = recent.filter((item) => item.level === "warning").length;
  const lastEventAt = recentRecords[0]?.createdAt ?? null;
  const checks: ProductionMonitorCheck[] = [
    {
      key: "connections",
      tone: connections.length > 0 ? "success" : "error",
      title: "飞书机器人",
      detail: connections.length > 0
        ? `已启用 ${connections.length} 个飞书机器人；每条入口可以单独选择。`
        : "还没有启用飞书机器人，飞书消息无法进入 Paperclip。",
    },
    {
      key: "routes",
      tone: routes.length > 0 ? "success" : "error",
      title: "业务入口",
      detail: routes.length > 0
        ? `已启用 ${routes.length} 条业务入口。`
        : "还没有启用业务入口，收到飞书消息也不会分配给智能体。",
    },
    {
      key: "event-subscriber",
      tone: config.enableEventSubscriber === true
        ? missingSubscriberConnectionIds.length > 0 ? "warning" : "success"
        : "warning",
      title: "自动监听",
      detail: config.enableEventSubscriber === true
        ? missingSubscriberConnectionIds.length > 0
          ? `监听开关已开启，但 ${missingSubscriberConnectionIds.length} 个机器人暂时没有运行中的监听进程；监控会自动尝试拉起。`
          : `监听运行中：${activeSubscriberCount}/${expectedSubscriberCount} 个进程在线。`
        : "监听开关未开启，飞书里发消息不会自动进入 Paperclip。",
    },
    {
      key: "real-send",
      tone: config.dryRunCli === false ? "success" : "warning",
      title: "真实回复",
      detail: config.dryRunCli === false
        ? "真实发送已开启，智能体完成后会回到飞书。"
        : "当前是页面模拟模式，不会真实回复飞书。",
    },
    {
      key: "recent-errors",
      tone: recentErrorCount > 0 ? "error" : recentWarningCount > 0 ? "warning" : "success",
      title: "最近 30 分钟",
      detail: recentErrorCount > 0
        ? `发现 ${recentErrorCount} 条错误、${recentWarningCount} 条提醒，请看事件日志。`
        : recentWarningCount > 0
          ? `没有错误，但有 ${recentWarningCount} 条提醒。`
          : "没有发现错误或提醒。",
    },
  ];
  const hasError = checks.some((item) => item.tone === "error");
  const hasWarning = checks.some((item) => item.tone === "warning");
  return {
    health: hasError ? "error" : hasWarning ? "warning" : "ok",
    message: hasError
      ? "生产监控发现阻塞项"
      : hasWarning
        ? "生产监控发现需要确认的风险项"
        : "生产监控正常",
    checkedAt: new Date().toISOString(),
    enabledConnectionCount: connections.length,
    enabledRouteCount: routes.length,
    expectedSubscriberCount,
    activeSubscriberCount,
    missingSubscriberConnectionIds,
    recentErrorCount,
    recentWarningCount,
    lastEventAt,
    lastWatchdogAt,
    checks,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function truncateText(value: string, maxLength = 700): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function summarizeLarkResult(result: LarkCliResult | null): Record<string, unknown> {
  if (!result) return { ok: false, skipped: true };
  const stderr = result.stderr.trim();
  const stdout = result.stdout.trim();
  return {
    ok: result.ok,
    dryRun: result.dryRun === true,
    code: result.code,
    stderr: stderr ? truncateText(stderr) : undefined,
    stdout: !result.ok && stdout ? truncateText(stdout) : undefined,
  };
}

function larkIdempotencyKey(prefix: string, ...parts: string[]): string {
  const hash = crypto.createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 32);
  return `pc-${prefix}-${hash}`;
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function firstMgetMessage(result: LarkCliResult): Record<string, unknown> | null {
  const parsed = parseJsonRecord(result.stdout.trim());
  const data = asRecord(parsed?.data);
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  return asRecord(messages[0]);
}

async function enrichChatName(
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  message: FeishuInboundMessage,
): Promise<FeishuInboundMessage> {
  if (message.chatName || !message.chatId || config.dryRunCli === true) return message;

  const result = await runLarkCli({
    bin: config.larkCliBin ?? "lark-cli",
    args: [
      "--profile",
      connection.profileName,
      "im",
      "chats",
      "get",
      "--as",
      "bot",
      "--params",
      JSON.stringify({ chat_id: message.chatId }),
      "--format",
      "json",
    ],
    timeoutMs: 8_000,
  });
  if (!result.ok) {
    record("warning", "飞书会话名称补全失败", {
      chatId: message.chatId,
      result: summarizeLarkResult(result),
    });
    return message;
  }

  const parsed = parseJsonRecord(result.stdout.trim());
  const data = asRecord(parsed?.data);
  const chat = asRecord(data?.chat) ?? asRecord(parsed?.chat);
  const chatName = readString(data?.name, data?.chat_name, chat?.name, chat?.chat_name, parsed?.name);
  return chatName ? { ...message, chatName } : message;
}

async function enrichInboundMessage(
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  message: FeishuInboundMessage,
): Promise<FeishuInboundMessage> {
  const alreadyHasCoreFields = !!(message.senderName && message.senderOpenId && message.threadId);
  if (alreadyHasCoreFields && (message.chatName || !message.chatId)) return message;
  if (config.dryRunCli === true) return message;

  let enrichedMessage = message;
  if (!alreadyHasCoreFields) {
    const result = await runLarkCli({
      bin: config.larkCliBin ?? "lark-cli",
      args: buildMessageGetArgs({
        profileName: connection.profileName,
        identity: "bot",
        messageId: message.messageId,
      }),
      timeoutMs: 15_000,
    });
    if (!result.ok) {
      record("warning", "飞书消息发起人补全失败", {
        messageId: message.messageId,
        result: summarizeLarkResult(result),
      });
      return enrichChatName(config, connection, enrichedMessage);
    }

    const detail = firstMgetMessage(result);
    if (detail) {
      const sender = asRecord(detail.sender);
      const chat = asRecord(detail.chat);
      const senderId = readString(sender?.id);
      const senderIdType = readString(sender?.id_type);
      enrichedMessage = {
        ...enrichedMessage,
        chatId: enrichedMessage.chatId ?? readString(detail.chat_id),
        chatName: enrichedMessage.chatName ?? readString(detail.chat_name, detail.chatName, chat?.name),
        threadId: enrichedMessage.threadId ?? readString(detail.thread_id),
        rootMessageId: enrichedMessage.rootMessageId ?? readString(detail.root_id),
        senderName: enrichedMessage.senderName ?? readString(sender?.name),
        senderOpenId: enrichedMessage.senderOpenId ?? (senderIdType === "open_id" ? senderId : undefined),
        senderUserId: enrichedMessage.senderUserId ?? (senderIdType === "user_id" ? senderId : undefined),
      };
    }
  }

  return enrichChatName(config, connection, enrichedMessage);
}

function quickReplyText(config: FeishuConnectorConfig, message: FeishuInboundMessage): string | null {
  if (config.enableQuickReply === false) return null;
  const stripped = message.text
    .replace(/@\S+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!stripped) return null;
  try {
    const pattern = new RegExp(config.quickReplyRegex ?? "", "i");
    if (!pattern.test(stripped)) return null;
  } catch {
    return null;
  }
  return config.quickReplyText ?? "ok";
}

async function getConfig(ctx: PluginContext): Promise<FeishuConnectorConfig> {
  return normalizeConfig(await ctx.config.get());
}

async function listLarkProfiles(config: FeishuConnectorConfig): Promise<{ profiles: ProfileRow[]; error?: string }> {
  const result = await runLarkCli({
    bin: config.larkCliBin ?? "lark-cli",
    args: ["profile", "list"],
    timeoutMs: 10_000,
  });
  if (!result.ok) {
    return {
      profiles: [],
      error: truncateText(result.stderr || result.stdout || "lark-cli profile list 执行失败", 500),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = [];
  }
  const rows = Array.isArray(parsed) ? parsed : [];
  const profiles = rows.map((row) => {
    const item = asRecord(row) ?? {};
    return {
      name: readString(item.name) ?? "",
      appId: readString(item.appId) ?? null,
      brand: readString(item.brand) ?? null,
      active: item.active === true,
      user: readString(item.user) ?? null,
      tokenStatus: readString(item.tokenStatus) ?? null,
    };
  }).filter((profile) => profile.name.length > 0);
  const enrichedProfiles = await Promise.all(profiles.map(async (profile) => ({
    ...profile,
    ...await readBotInfo(config, profile.name),
  })));
  return {
    profiles: enrichedProfiles,
  };
}

async function readBotInfo(
  config: FeishuConnectorConfig,
  profileName: string,
): Promise<Pick<ProfileRow, "botName" | "botOpenId" | "botAvatarUrl" | "botActivateStatus">> {
  const result = await runLarkCli({
    bin: config.larkCliBin ?? "lark-cli",
    args: [
      "--profile",
      profileName,
      "api",
      "GET",
      "/open-apis/bot/v3/info",
      "--as",
      "bot",
      "--format",
      "json",
    ],
    timeoutMs: 8_000,
  });
  if (!result.ok) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return {};
  }
  const root = asRecord(parsed);
  const data = asRecord(root?.data);
  const bot = asRecord(root?.bot) ?? asRecord(data?.bot) ?? data;
  if (!bot) return {};
  return {
    botName: readString(bot.app_name, bot.name) ?? null,
    botOpenId: readString(bot.open_id) ?? null,
    botAvatarUrl: readString(bot.avatar_url) ?? null,
    botActivateStatus: typeof bot.activate_status === "number" ? bot.activate_status : null,
  };
}

async function searchFeishuDirectory(
  config: FeishuConnectorConfig,
  params: Record<string, unknown>,
): Promise<{
  profileName: string | null;
  chats: DirectoryChatRow[];
  users: DirectoryUserRow[];
  chatError?: string;
  userError?: string;
}> {
  const profileName = readString(params.profileName)
    ?? getEnabledConnections(config)[0]?.profileName
    ?? null;
  const chatQuery = readString(params.chatQuery) ?? "";
  const userQuery = readString(params.userQuery) ?? "";
  const result: {
    profileName: string | null;
    chats: DirectoryChatRow[];
    users: DirectoryUserRow[];
    chatError?: string;
    userError?: string;
  } = {
    profileName,
    chats: [],
    users: [],
  };
  if (!profileName) {
    if (chatQuery) result.chatError = "请先选择一个已授权的飞书应用。";
    if (userQuery) result.userError = "请先选择一个已授权的飞书应用。";
    return result;
  }

  if (chatQuery) {
    const chatResult = await runLarkCli({
      bin: config.larkCliBin ?? "lark-cli",
      args: [
        "--profile",
        profileName,
        "im",
        "+chat-search",
        "--as",
        "user",
        "--query",
        chatQuery,
        "--page-size",
        "8",
        "--format",
        "json",
      ],
      timeoutMs: 12_000,
    });
    if (!chatResult.ok) {
      result.chatError = truncateText(chatResult.stderr || chatResult.stdout || "飞书群搜索失败", 500);
    } else {
      result.chats = parseDirectoryChats(chatResult.stdout);
    }
  }

  if (userQuery) {
    const userResult = await runLarkCli({
      bin: config.larkCliBin ?? "lark-cli",
      args: [
        "--profile",
        profileName,
        "contact",
        "+search-user",
        "--as",
        "user",
        "--query",
        userQuery,
        "--page-size",
        "8",
        "--format",
        "json",
      ],
      timeoutMs: 12_000,
    });
    if (!userResult.ok) {
      result.userError = truncateText(userResult.stderr || userResult.stdout || "飞书联系人搜索失败", 500);
    } else {
      result.users = parseDirectoryUsers(userResult.stdout);
    }
  }

  return result;
}

function parseDirectoryChats(stdout: string): DirectoryChatRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const data = asRecord(asRecord(parsed)?.data);
  const rows = Array.isArray(data?.chats) ? data.chats : [];
  return rows.map((row) => {
    const item = asRecord(row) ?? {};
    return {
      chatId: readString(item.chat_id, item.chatId) ?? "",
      name: readString(item.name) ?? "未命名飞书会话",
      description: readString(item.description) ?? null,
      external: item.external === true,
    };
  }).filter((chat) => chat.chatId.length > 0);
}

function parseDirectoryUsers(stdout: string): DirectoryUserRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const data = asRecord(asRecord(parsed)?.data);
  const rows = Array.isArray(data?.users) ? data.users : [];
  return rows.map((row) => {
    const item = asRecord(row) ?? {};
    return {
      openId: readString(item.open_id, item.openId) ?? "",
      userId: readString(item.user_id, item.userId) ?? null,
      name: readString(item.name) ?? "未命名用户",
      departmentIds: Array.isArray(item.department_ids)
        ? item.department_ids.filter((value): value is string => typeof value === "string")
        : [],
    };
  }).filter((user) => user.openId.length > 0);
}

type ResolvedRouteConfig = FeishuRouteConfig & { companyId: string };

function normalizeRef(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

async function resolveRouteForRun(ctx: PluginContext, route: FeishuRouteConfig): Promise<ResolvedRouteConfig> {
  let companyId = route.companyId?.trim();
  const companyRef = route.companyRef?.trim();

  if (!companyId && companyRef) {
    const ref = normalizeRef(companyRef);
    const companies = await ctx.companies.list({ limit: 200 });
    const company = companies.find((candidate) =>
      normalizeRef(candidate.id) === ref ||
      normalizeRef(candidate.name) === ref ||
      normalizeRef(candidate.issuePrefix) === ref
    );
    companyId = company?.id;
  }

  if (!companyId) {
    throw new Error(`路由「${route.id}」没有找到公司。请填写公司名称/前缀，例如「锐捷网络」或「CMP」。`);
  }

  let targetAgentId = route.targetAgentId?.trim();
  const agentRef = (route.targetAgentRef ?? route.targetAgentName)?.trim();

  if (!targetAgentId && agentRef) {
    const ref = normalizeRef(agentRef);
    const agents = await ctx.agents.list({ companyId, limit: 500 });
    const agent = agents.find((candidate) =>
      normalizeRef(candidate.id) === ref ||
      normalizeRef(candidate.name) === ref ||
      normalizeRef(candidate.title ?? undefined) === ref ||
      normalizeRef(candidate.urlKey) === ref
    );
    targetAgentId = agent?.id;
  }

  if (agentRef && !targetAgentId) {
    throw new Error(`路由「${route.id}」没有找到智能体「${agentRef}」。请填写左侧智能体列表里显示的名称，或填写智能体 ID。`);
  }

  return {
    ...route,
    companyId,
    targetAgentId,
    targetAgentName: route.targetAgentName ?? route.targetAgentRef,
  };
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

async function findSessionByKey(
  ctx: PluginContext,
  sessionKey: string,
): Promise<{ companyId: string; data: FeishuSessionData } | null> {
  const existing = await ctx.entities.list({
    entityType: "feishu-session",
    externalId: sessionKey,
    limit: 1,
    offset: 0,
  });
  const record = existing[0];
  const data = record?.data as Partial<FeishuSessionData> | undefined;
  if (!record?.scopeId || !data?.paperclipIssueId || !data.connectionId || !data.sessionKey) return null;
  return { companyId: record.scopeId, data: data as FeishuSessionData };
}

async function findSessionByRunId(
  ctx: PluginContext,
  runId: string,
): Promise<{ companyId: string; data: FeishuSessionData } | null> {
  const existing = await ctx.entities.list({
    entityType: "feishu-session",
    limit: 500,
    offset: 0,
  });
  for (const record of existing) {
    const data = record.data as Partial<FeishuSessionData> | undefined;
    if (
      record.scopeId &&
      data?.paperclipIssueId &&
      data.connectionId &&
      data.sessionKey &&
      data.lastRunId === runId
    ) {
      return { companyId: record.scopeId, data: data as FeishuSessionData };
    }
  }
  return null;
}

async function resolveRouteFromSession(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  session: FeishuSessionData,
  companyId: string,
): Promise<ResolvedRouteConfig> {
  const configuredRoute = (config.routes ?? []).find((route) => route.id === session.routeId);
  if (configuredRoute) return resolveRouteForRun(ctx, configuredRoute);
  return {
    id: session.routeId ?? "existing-feishu-session",
    matchType: "default",
    connectionId: session.connectionId,
    companyId,
    targetAgentId: session.paperclipAgentId,
    replyMode: "thread",
  };
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
  record(result.ok ? "info" : "error", "多维表格写入已执行", { ok: result.ok, dryRun: result.dryRun });
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
  record(result.ok ? "info" : "error", "飞书回复已执行", summarizeLarkResult(result));
  return result;
}

function safeAttachmentFilename(attachment: FeishuInboundAttachment, index: number): string {
  const fallbackExt = attachment.resourceType === "image"
    ? ".jpg"
    : attachment.resourceType === "audio"
      ? ".mp3"
      : attachment.resourceType === "video"
        ? ".mp4"
        : ".bin";
  const base = attachment.filename?.trim() || `${attachment.resourceType}-${index + 1}-${attachment.resourceKey}`;
  const safe = base
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || `attachment-${index + 1}`;
  return path.extname(safe) ? safe : `${safe}${fallbackExt}`;
}

function contentTypeForFilename(filename: string, resourceType: FeishuInboundAttachment["resourceType"]): string {
  const ext = path.extname(filename).toLowerCase();
  const byExt: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
  };
  if (byExt[ext]) return byExt[ext];
  if (resourceType === "image") return "image/jpeg";
  if (resourceType === "audio") return "audio/mpeg";
  if (resourceType === "video") return "video/mp4";
  return "application/octet-stream";
}

async function pickDownloadedFile(tempDir: string, expectedFilename: string): Promise<string> {
  const expected = path.join(tempDir, expectedFilename);
  try {
    const stat = await fs.stat(expected);
    if (stat.isFile()) return expected;
  } catch {
    // lark-cli may choose its own output filename for some resource types.
  }
  const entries = await fs.readdir(tempDir);
  for (const entry of entries) {
    const candidate = path.join(tempDir, entry);
    const stat = await fs.stat(candidate);
    if (stat.isFile()) return candidate;
  }
  throw new Error("lark-cli 没有生成附件文件");
}

async function attachFeishuResources(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  message: FeishuInboundMessage,
  companyId: string,
  issueId: string,
  issueCommentId?: string | null,
): Promise<AttachedResourceResult[]> {
  if (message.attachments.length === 0) return [];

  const planned = message.attachments.map((attachment, index) => ({
    attachment,
    filename: safeAttachmentFilename(attachment, index),
  }));

  if (config.dryRunCli === true) {
    const results = planned.map(({ attachment, filename }) => ({
      filename,
      resourceKey: attachment.resourceKey,
      resourceType: attachment.resourceType,
      dryRun: true,
    }));
    record("info", "飞书附件下载为模拟模式，未真正上传附件", {
      issueId,
      attachments: results.map((item) => item.filename),
    });
    return results;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-"));
  try {
    const results: AttachedResourceResult[] = [];
    for (const { attachment, filename } of planned) {
      try {
        const args = buildResourceDownloadArgs({
          profileName: connection.profileName,
          identity: "bot",
          messageId: message.messageId,
          fileKey: attachment.resourceKey,
          type: attachment.resourceType,
          output: filename,
        });
        const download = await runLarkCli({
          bin: config.larkCliBin ?? "lark-cli",
          args,
          timeoutMs: 120_000,
          cwd: tempDir,
        });
        if (!download.ok) {
          const detail = [download.stderr.trim(), download.stdout.trim()].filter(Boolean).join("\n").slice(0, 1000);
          throw new Error(detail || "lark-cli 下载附件失败");
        }

        const downloadedPath = await pickDownloadedFile(tempDir, filename);
        const body = await fs.readFile(downloadedPath);
        const originalFilename = path.basename(downloadedPath) || filename;
        await fs.rm(downloadedPath, { force: true }).catch(() => undefined);
        const created = await ctx.issues.createAttachment({
          issueId,
          companyId,
          filename: originalFilename,
          contentType: contentTypeForFilename(originalFilename, attachment.resourceType),
          bodyBase64: body.toString("base64"),
          issueCommentId: issueCommentId ?? null,
        });
        results.push({
          filename: originalFilename,
          resourceKey: attachment.resourceKey,
          resourceType: attachment.resourceType,
          attachmentId: created.id,
          contentPath: created.contentPath,
        });
        record("info", "飞书附件已上传到 Paperclip 任务", {
          issueId,
          filename: originalFilename,
          attachmentId: created.id,
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        results.push({
          filename,
          resourceKey: attachment.resourceKey,
          resourceType: attachment.resourceType,
          error: messageText,
        });
        record("error", "飞书附件上传失败", {
          issueId,
          resourceKey: attachment.resourceKey,
          error: messageText,
        });
      }
    }
    return results;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function attachmentPromptLines(results: AttachedResourceResult[]): string[] {
  if (results.length === 0) return [];
  const lines = ["", "附件处理结果："];
  for (const result of results) {
    if (result.attachmentId) {
      lines.push(`- ${result.filename} 已作为 Paperclip 附件上传（${result.attachmentId}）`);
    } else if (result.dryRun) {
      lines.push(`- ${result.filename}：模拟模式，未真正下载上传`);
    } else {
      lines.push(`- ${result.filename}：上传失败，${result.error ?? "未知错误"}`);
    }
  }
  return lines;
}

function issueStatusLabel(status?: string | null): string {
  if (status === "done") return "已完成";
  if (status === "blocked") return "等待协作处理";
  if (status === "in_progress") return "处理中";
  if (status === "cancelled") return "已取消";
  if (status === "todo") return "已创建";
  return status || "处理中";
}

function normalizeTemplate(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isDefaultAckTemplate(template?: string | null): boolean {
  const normalized = normalizeTemplate(template);
  return !normalized ||
    normalized === normalizeTemplate(DEFAULT_ACK_TEMPLATE) ||
    normalized === normalizeTemplate(LEGACY_ACK_TEMPLATE);
}

function isDefaultCompletionTemplate(template?: string | null): boolean {
  const normalized = normalizeTemplate(template);
  return !normalized ||
    normalized === normalizeTemplate(DEFAULT_COMPLETION_TEMPLATE) ||
    normalized === normalizeTemplate(LEGACY_COMPLETION_TEMPLATE);
}

function issueDisplayRef(issueId: string, issueIdentifier?: string | null): string {
  return issueIdentifier?.trim() || issueId.slice(0, 8);
}

function cleanReplyTitle(title: string): string {
  const withoutMentions = title
    .replace(/<at\b[^>]*>.*?<\/at>/gi, " ")
    .replace(/@\S+/g, " ")
    .replace(/\bpaperclip\b/gi, " ");
  const withoutTail = withoutMentions
    .replace(/完成后(回复|告诉)我?[；;。,.，!！?？\s]*.*$/g, " ")
    .replace(/处理完(回复|告诉)我?[；;。,.，!！?？\s]*.*$/g, " ");
  const withoutLeadingAsk = withoutTail
    .replace(/^(请你?|麻烦你?|帮我|帮忙|可以|能否|能不能)?\s*(创建|新建|建立|生成|做|处理|看一下|查一下|帮我查下|帮我看看)\s*(一个|一下|一份|这个|下)?\s*/g, "");
  const cleaned = withoutLeadingAsk
    .replace(/\s+/g, " ")
    .replace(/^[，,；;。.!！?？\s]+/g, "")
    .replace(/[，,；;。.!！?？\s]+$/g, "")
    .trim();
  return cleaned || "Paperclip 任务";
}

function renderDefaultAwareTemplate(
  template: string,
  context: {
    message: FeishuInboundMessage;
    route: ResolvedRouteConfig;
    issueId: string;
    issueRef: string;
    issueTitle: string;
    runId?: string;
    runStatus?: string;
  },
): string {
  return renderTemplate(template, {
    message: context.message,
    route: context.route,
    issueId: context.issueId,
    issueRef: context.issueRef,
    issueTitle: context.issueTitle,
    agentName: context.route.targetAgentName,
    runId: context.runId,
    runStatus: context.runStatus,
  });
}

function buildAckReplyText(params: {
  config: FeishuConnectorConfig;
  message: FeishuInboundMessage;
  route: ResolvedRouteConfig;
  issueId: string;
  issueRef: string;
  issueTitle: string;
}): string {
  const { config, message, route, issueId, issueRef, issueTitle } = params;
  const template = config.ackMessageTemplate ?? DEFAULT_ACK_TEMPLATE;
  if (!isDefaultAckTemplate(template)) {
    return renderDefaultAwareTemplate(template, {
      message,
      route,
      issueId,
      issueRef,
      issueTitle,
    });
  }

  const agentName = route.targetAgentName ?? "对应智能体";
  return [
    `已收到，交给 ${agentName} 处理。`,
    `任务：${issueRef}`,
  ].join("\n");
}

function buildTerminalReplyText(params: {
  config: FeishuConnectorConfig;
  message: FeishuInboundMessage;
  route: ResolvedRouteConfig;
  session: FeishuSessionData;
  issueTitle: string;
  issueStatus?: string | null;
  issueIdentifier?: string | null;
  event: AgentSessionEvent;
}): string {
  const { config, message, route, session, issueTitle, issueStatus, issueIdentifier, event } = params;
  const isDone = event.eventType === "done";
  const issueRef = issueDisplayRef(session.paperclipIssueId, issueIdentifier ?? session.paperclipIssueIdentifier);
  const displayTitle = cleanReplyTitle(issueTitle);
  const context = {
    message,
    route,
    issueId: session.paperclipIssueId,
    issueRef,
    issueTitle: displayTitle,
    runId: event.runId,
    runStatus: event.eventType,
  };
  if (!isDone) {
    return renderDefaultAwareTemplate("处理失败：{{issue_title}}\n任务：{{issue_ref}}", context);
  }

  const template = config.completionMessageTemplate ?? DEFAULT_COMPLETION_TEMPLATE;
  if (!isDefaultCompletionTemplate(template)) {
    return renderDefaultAwareTemplate(template, context);
  }

  if (!issueStatus || issueStatus === "done") {
    return [
      `处理完成：${displayTitle}`,
      `任务：${issueRef}`,
    ].join("\n");
  }

  const firstLine = issueStatus === "blocked"
    ? `已转交处理：${displayTitle}`
    : `进度更新：${displayTitle}`;
  const nextLine = issueStatus === "blocked"
    ? "我已经转给相关智能体处理，完成后会继续回到这里。"
    : "后续进展会继续回到这里。";
  return [
    firstLine,
    `当前状态：${issueStatusLabel(issueStatus)}`,
    `任务：${issueRef}`,
    nextLine,
  ].join("\n");
}

async function claimTerminalReply(
  ctx: PluginContext,
  replyKey: string,
  event: AgentSessionEvent,
): Promise<boolean> {
  const scope = {
    scopeKind: "instance" as const,
    namespace: "feishu-run-replies",
    stateKey: replyKey,
  };
  const existing = await ctx.state.get(scope);
  if (existing) return false;
  await ctx.state.set(scope, {
    claimedAt: new Date().toISOString(),
    runId: event.runId,
    eventType: event.eventType,
  });
  return true;
}

async function replyOnAgentSessionTerminal(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  route: ResolvedRouteConfig,
  message: FeishuInboundMessage,
  session: FeishuSessionData,
  issueTitle: string,
  event: AgentSessionEvent,
): Promise<void> {
  if ((route.replyMode ?? "thread") === "none") return;

  const replyKey = larkIdempotencyKey("done", event.runId, event.eventType);
  if (!(await claimTerminalReply(ctx, replyKey, event))) {
    record("info", "已跳过重复的飞书完成回复", {
      routeId: route.id,
      runId: event.runId,
      eventType: event.eventType,
    });
    return;
  }

  const issue = await ctx.issues.get(session.paperclipIssueId, route.companyId).catch(() => null);
  const resolvedIssueTitle = issue?.title ?? session.paperclipIssueTitle ?? issueTitle;
  const text = buildTerminalReplyText({
    config,
    message,
    route,
    session,
    issueTitle: resolvedIssueTitle,
    issueStatus: issue?.status,
    issueIdentifier: issue?.identifier ?? null,
    event,
  });
  const suffix = event.eventType === "done" || !event.message ? "" : `\n\n${event.message}`;
  const result = await replyToFeishu(
    config,
    connection,
    message,
    `${text}${suffix}`,
    replyKey,
    (route.replyMode ?? "thread") === "thread",
  );
  if (!result?.ok) {
    await ctx.state.delete({
      scopeKind: "instance",
      namespace: "feishu-run-replies",
      stateKey: replyKey,
    });
  }

  await upsertSession(ctx, route.companyId, {
    ...session,
    paperclipIssueTitle: resolvedIssueTitle,
    paperclipIssueIdentifier: issue?.identifier ?? session.paperclipIssueIdentifier,
    lastRunId: event.runId,
    lastRunStatus: event.eventType,
    lastRunFinishedAt: new Date().toISOString(),
    lastCompletionReplyKey: result?.ok ? replyKey : session.lastCompletionReplyKey,
    updatedAt: new Date().toISOString(),
  });
  await ctx.metrics.write("feishu.agent_run.replied", 1, {
    route: route.id,
    status: event.eventType,
  });
  record(result?.ok ? "info" : "error", "智能体完成后的飞书回复已执行", {
    routeId: route.id,
    runId: event.runId,
    eventType: event.eventType,
    result: summarizeLarkResult(result),
  });
}

async function handleInboundMessage(
  ctx: PluginContext,
  raw: unknown,
  options: { connectionId?: string; configOverride?: FeishuConnectorConfig } = {},
): Promise<Record<string, unknown>> {
  const config = options.configOverride ?? await getConfig(ctx);
  let message = extractInboundMessage(raw, options.connectionId);
  const connection = resolveConnection(config, message.connectionId ?? options.connectionId);
  if (!connection) {
    throw new Error("还没有配置可用的飞书机器人连接。请先在「飞书机器人账号」里添加一项，并保持启用。");
  }
  lastInboundEventAt = new Date().toISOString();
  record("info", "收到飞书消息事件", inboundMessageDiagnostics(message, connection));
  const duplicate = await markDeduped(ctx, message);
  if (duplicate) {
    record("info", "已忽略重复的飞书消息", inboundMessageDiagnostics(message, connection));
    return { ok: true, duplicate: true, messageId: message.messageId };
  }

  message = await enrichInboundMessage(config, connection, message);
  const sessionKey = buildSessionKey(message, connection.id);
  const matchedRoute = resolveRoute(config, message, connection.id);
  if (matchedRoute) {
    record("info", "飞书消息已命中业务入口", inboundMessageDiagnostics(message, connection, {
      routeId: matchedRoute.id,
      routeName: describeRouteTrigger(matchedRoute),
      trigger: describeRouteTrigger(matchedRoute),
      targetAgentName: matchedRoute.targetAgentName ?? null,
      companyRef: matchedRoute.companyRef ?? matchedRoute.companyId,
    }));
  }

  const directReply = matchedRoute ? quickReplyText(config, message) : null;
  if (matchedRoute && directReply !== null && (matchedRoute.replyMode ?? "thread") !== "none") {
    const result = await replyToFeishu(
      config,
      connection,
      message,
      directReply,
      larkIdempotencyKey("quick", message.messageId),
      (matchedRoute.replyMode ?? "thread") === "thread",
    );
    record(result?.ok ? "info" : "error", "已执行飞书快捷测试回复", {
      routeId: matchedRoute.id,
      messageId: message.messageId,
      result: summarizeLarkResult(result),
    });
    return {
      ok: result?.ok === true,
      duplicate: false,
      quickReply: true,
      routeId: matchedRoute.id,
      replyOk: result?.ok === true,
      result: summarizeLarkResult(result),
    };
  }

  let route: ResolvedRouteConfig;
  let existingSession: FeishuSessionData | null = null;

  if (matchedRoute) {
    route = await resolveRouteForRun(ctx, matchedRoute);
    existingSession = await findSession(ctx, route.companyId, sessionKey);
  } else {
    const existingByKey = await findSessionByKey(ctx, sessionKey);
    if (!existingByKey) {
      record("warning", "飞书消息已收到，但没有命中任何业务入口", inboundMessageDiagnostics(message, connection, {
        activeRouteCount: enabledRoutes(config).length,
        routeDiagnostics: enabledRoutes(config).map((route) => routeMatchDiagnostic(route, message, connection.id)),
      }));
      return { ok: false, reason: "no_route", messageId: message.messageId };
    }
    existingSession = existingByKey.data;
    route = await resolveRouteFromSession(ctx, config, existingSession, existingByKey.companyId);
  }

  let issueId = existingSession?.paperclipIssueId ?? null;
  let issueIdentifier = existingSession?.paperclipIssueIdentifier ?? null;
  let issueTitle = "";
  let createdIssue = false;
  let issueCommentId: string | null = null;

  if (issueId) {
    if (!issueIdentifier) {
      const existingIssue = await ctx.issues.get(issueId, route.companyId).catch(() => null);
      issueIdentifier = existingIssue?.identifier ?? null;
    }
    const comment = await ctx.issues.createComment(issueId, createCommentBody(message, route), route.companyId);
    issueCommentId = comment.id;
    issueTitle = existingSession?.paperclipIssueTitle ?? createIssueTitle(message);
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
    issueIdentifier = issue.identifier ?? null;
    createdIssue = true;
  }

  const issueRef = issueDisplayRef(issueId, issueIdentifier);

  const attachedResources = await attachFeishuResources(
    ctx,
    config,
    connection,
    message,
    route.companyId,
    issueId,
    issueCommentId,
  );

  const session: FeishuSessionData = {
    connectionId: connection.id,
    sessionKey,
    routeId: route.id,
    chatId: message.chatId,
    rootMessageId: message.rootMessageId ?? message.messageId,
    threadId: message.threadId,
    requesterOpenId: message.senderOpenId,
    paperclipIssueId: issueId,
    paperclipIssueIdentifier: issueIdentifier ?? undefined,
    paperclipIssueTitle: existingSession?.paperclipIssueTitle ?? issueTitle,
    paperclipAgentId: route.targetAgentId,
    paperclipAgentSessionId: existingSession?.paperclipAgentSessionId,
    lastCompletionReplyKey: existingSession?.lastCompletionReplyKey,
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
      "收到一条新的飞书需求。请在 Paperclip 内处理这条需求。",
      "",
      "对外沟通规则：",
      "- 不要直接使用 lark-cli 或飞书 IM 给原群、原消息、提问人发送中间回复；飞书回复由 Paperclip 飞书连接器统一发送。",
      "- 用户说“创建任务 / 测试任务 / Paperclip 任务”时，默认指 Paperclip 任务，不是飞书待办。",
      "- 只有用户明确说“创建飞书待办 / 飞书任务 / 飞书 ToDo”时，才可以创建飞书待办。",
      "- 需要沉淀处理结果时，请写入当前 Paperclip 任务评论或更新任务状态。",
      "- 在 Paperclip 任务里汇报飞书来源时，优先写群名/入口名；不要只写 oc_ 或 om_ 这类内部 ID，ID 只作为追溯信息附带。",
      "",
      "用户原话：",
      message.text,
      ...attachmentPromptLines(attachedResources),
      "",
      `Paperclip 任务：${issueRef}`,
      `飞书来源：${describeFeishuConversation(message, route)}`,
      `飞书入口：${route.id}（${describeRouteTrigger(route)}）`,
      `飞书消息：${message.messageId}`,
      message.rootMessageId && message.rootMessageId !== message.messageId
        ? `飞书话题根消息：${message.rootMessageId}`
        : null,
    ].filter(Boolean).join("\n");

    let terminalReplyStarted = false;
    const run = await ctx.agents.sessions.sendMessage(session.paperclipAgentSessionId, route.companyId, {
      prompt,
      reason: "feishu_message",
      issueId,
      taskId: issueId,
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
          ctx.logger.error("发送飞书完成回复失败", {
            routeId: route.id,
            runId: event.runId,
            error: String(error),
          });
          record("error", "发送飞书完成回复失败", {
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
    const ackText = buildAckReplyText({
      config,
      message,
      route,
      issueId,
      issueRef,
      issueTitle,
    });
    ackResult = await replyToFeishu(
      config,
      connection,
      message,
      ackText,
      larkIdempotencyKey("ack", message.messageId),
      (route.replyMode ?? "thread") === "thread",
    );
  }

  await ctx.activity.log({
    companyId: route.companyId,
    entityType: "issue",
    entityId: issueId,
    message: `飞书消息已转成 Paperclip 任务「${issueTitle}」`,
    metadata: {
      plugin: PLUGIN_ID,
      routeId: route.id,
      connectionId: connection.id,
      messageId: message.messageId,
      runId,
    },
  });
  await ctx.metrics.write("feishu.inbound.routed", 1, { route: route.id });
  record("info", "已把飞书消息转成 Paperclip 任务", { issueId, routeId: route.id, runId });

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
    attachments: attachedResources.map((item) => ({
      filename: item.filename,
      attachmentId: item.attachmentId ?? null,
      dryRun: item.dryRun === true,
      error: item.error ?? null,
    })),
  };
}

function sampleTextForRoute(route: FeishuRouteConfig): string {
  if (route.matchType === "keyword") {
    return `@${route.keyword || "paperclip"} 只回复 ok`;
  }
  if (route.matchType === "regex") {
    if (route.regex?.includes("paperclip")) return "paperclip 只回复 ok";
    return "@paperclip 只回复 ok";
  }
  return "@paperclip 只回复 ok";
}

function testRawForRoute(route: FeishuRouteConfig): Record<string, unknown> {
  const suffix = `${route.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    event_id: `evt_test_${suffix}`,
    message_id: `om_test_${suffix}`,
    chat_id: route.chatId || `oc_test_${route.id}`,
    sender_open_id: route.userOpenId || "ou_paperclip_test_user",
    sender_name: "Paperclip 测试",
    text: sampleTextForRoute(route),
  };
}

function stopSubscribers(): void {
  for (const subscriber of subscribers.values()) {
    subscriber.stop();
  }
  subscribers.clear();
}

let shutdownHandlersInstalled = false;

function installProcessShutdownHandlers(): void {
  if (shutdownHandlersInstalled) return;
  shutdownHandlersInstalled = true;

  const stopAndExit = (signal: NodeJS.Signals) => {
    stopSubscribers();
    setTimeout(() => {
      process.exit(signal === "SIGINT" ? 130 : 0);
    }, 50).unref();
  };

  process.once("SIGTERM", () => stopAndExit("SIGTERM"));
  process.once("SIGINT", () => stopAndExit("SIGINT"));
  process.once("SIGHUP", () => stopAndExit("SIGHUP"));
  process.once("exit", () => {
    stopSubscribers();
  });
}

async function reconcileConfiguredSubscribers(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  options: { restartAll?: boolean; reason?: string } = {},
): Promise<void> {
  const enabledConnections = getEnabledConnections(config);
  const enabledConnectionIds = new Set(enabledConnections.map((connection) => connection.id));
  for (const [connectionId, subscriber] of subscribers.entries()) {
    if (options.restartAll || config.enableEventSubscriber !== true || !enabledConnectionIds.has(connectionId)) {
      subscriber.stop();
      subscribers.delete(connectionId);
      record("info", "已停止飞书消息监听", {
        connectionId,
        profileName: subscriber.profileName,
        reason: options.reason ?? (options.restartAll ? "restart" : "config"),
      });
    }
  }
  if (!config.enableEventSubscriber) return;
  for (const connection of enabledConnections) {
    const existing = subscribers.get(connection.id);
    if (existing?.isRunning()) continue;
    if (existing) {
      subscribers.delete(connection.id);
      record("warning", "飞书消息监听已退出，正在重新启动", {
        connectionId: connection.id,
        profileName: existing.profileName,
        pid: existing.child.pid ?? null,
        exitCode: existing.child.exitCode,
        signalCode: existing.child.signalCode,
      });
    }
    const subscriber = startLarkEventSubscriber({
      bin: config.larkCliBin ?? "lark-cli",
      profileName: connection.profileName,
      eventTypes: config.eventTypes,
      onEvent: (event) => {
        void handleInboundMessage(ctx, event, { connectionId: connection.id }).catch((error) => {
          ctx.logger.error("处理飞书消息失败", { connectionId: connection.id, error: String(error) });
          record("error", "处理飞书消息失败", { connectionId: connection.id, error: String(error) });
        });
      },
      onError: (error) => {
        if (error.message.includes("not found handler")) return;
        ctx.logger.warn("飞书消息监听出现提醒", { connectionId: connection.id, error: error.message });
        record("warning", "飞书消息监听出现提醒", { connectionId: connection.id, error: error.message });
      },
      onClose: (code, signal) => {
        if (subscribers.get(connection.id) === subscriber) {
          subscribers.delete(connection.id);
        }
        const expectedStop = signal === "SIGTERM" || signal === "SIGINT";
        if (!expectedStop) {
          record("warning", "飞书消息监听已退出", {
            connectionId: connection.id,
            profileName: connection.profileName,
            exitCode: code,
            signalCode: signal,
          });
        }
      },
    });
    subscribers.set(connection.id, subscriber);
    record("info", "已启动飞书消息监听", { connectionId: connection.id, profileName: connection.profileName });
  }
}

async function startConfiguredSubscribers(ctx: PluginContext, config: FeishuConnectorConfig): Promise<void> {
  await reconcileConfiguredSubscribers(ctx, config, { restartAll: true, reason: "config-start" });
}

function stopSubscriberWatchdog(): void {
  if (!subscriberWatchdog) return;
  clearInterval(subscriberWatchdog);
  subscriberWatchdog = null;
}

function startSubscriberWatchdog(ctx: PluginContext): void {
  if (subscriberWatchdog) return;
  subscriberWatchdog = setInterval(() => {
    void (async () => {
      try {
        const config = await getConfig(ctx);
        await reconcileConfiguredSubscribers(ctx, config, { reason: "watchdog" });
        lastWatchdogAt = new Date().toISOString();
      } catch (error) {
        record("error", "飞书生产监控自检失败", { error: String(error) });
      }
    })();
  }, 30_000);
  subscriberWatchdog.unref();
}

async function registerDataHandlers(ctx: PluginContext): Promise<void> {
  ctx.data.register(DATA_KEYS.status, async () => {
    const config = await getConfig(ctx);
    await reconcileConfiguredSubscribers(ctx, config, { reason: "status-check" });
    const monitor = buildProductionMonitor(config);
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
        running: subscriber.isRunning(),
      })),
      monitor,
      lastInboundEventAt,
      recentRecords,
    };
  });

  ctx.data.register(DATA_KEYS.catalog, async () => {
    const companies = await ctx.companies.list({ limit: 200 });
    const companyRows = await Promise.all(companies.map(async (company) => {
      const agents = await ctx.agents.list({ companyId: company.id, limit: 500 });
      return {
        id: company.id,
        name: company.name,
        issuePrefix: company.issuePrefix ?? null,
        agents: agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          title: agent.title ?? null,
          urlKey: agent.urlKey ?? null,
        })),
      };
    }));

    return { companies: companyRows };
  });

  ctx.data.register(DATA_KEYS.profiles, async () => {
    const config = await getConfig(ctx);
    return await listLarkProfiles(config);
  });

  ctx.data.register(DATA_KEYS.directory, async (params) => {
    const config = await getConfig(ctx);
    return await searchFeishuDirectory(config, params);
  });
}

async function registerActionHandlers(ctx: PluginContext): Promise<void> {
  ctx.actions.register(ACTION_KEYS.startGuidedBind, async (params) => {
    const config = await getConfig(ctx);
    const profileName = readString(params.profileName);
    const brand = readString(params.brand) === "lark" ? "lark" : "feishu";
    if (!profileName) throw new Error("请填写这次要保存的飞书机器人名称。");

    const existing = guidedBindSessions.get(profileName);
    if (existing?.isRunning()) existing.stop();

    const session = startLarkConfigInit({
      bin: config.larkCliBin ?? "lark-cli",
      profileName,
      brand,
      lang: "zh",
    });
    guidedBindSessions.set(profileName, session);
    setTimeout(() => {
      const current = guidedBindSessions.get(profileName);
      if (current === session && !session.isRunning()) guidedBindSessions.delete(profileName);
    }, 10 * 60 * 1000).unref();

    const snapshot = await session.waitForReady();
    if (!snapshot.ok && !snapshot.running) {
      const detail = [snapshot.stderr, snapshot.stdout].filter(Boolean).join("\n");
      record("error", "飞书官方向导启动失败", { profileName, result: snapshot });
      throw new Error(detail || "lark-cli config init --new 执行失败");
    }

    record("info", "已启动飞书官方绑定向导", {
      profileName,
      url: snapshot.url,
      running: snapshot.running,
    });
    const { ok: _snapshotOk, ...snapshotWithoutOk } = snapshot;
    return {
      ok: true,
      ...snapshotWithoutOk,
    };
  });

  ctx.actions.register(ACTION_KEYS.finishGuidedBind, async (params) => {
    const config = await getConfig(ctx);
    const profileName = readString(params.profileName);
    if (!profileName) throw new Error("请先生成飞书官方绑定链接。");

    const result = await listLarkProfiles(config);
    if (result.error) throw new Error(result.error);

    const configuredProfileNames = new Set((config.connections ?? [])
      .map((connection) => connection.profileName)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0));
    const profile = result.profiles.find((item) => item.name === profileName);
    const unlinkedProfiles = result.profiles.filter((item) => !configuredProfileNames.has(item.name));
    const fallbackProfile = unlinkedProfiles.length === 1 ? unlinkedProfiles[0] : undefined;
    if (!profile) {
      if (fallbackProfile) {
        record("warning", "飞书官方绑定返回了新 profile，但名称不是预期保存代号", {
          expectedProfileName: profileName,
          actualProfileName: fallbackProfile.name,
          appId: fallbackProfile.appId,
        });
        return {
          ok: true,
          profile: fallbackProfile,
          warning: `飞书已绑定成功，但 lark-cli 返回的保存代号是「${fallbackProfile.name}」，不是「${profileName}」。我已按实际返回的机器人加入列表。`,
        };
      }
      const available = result.profiles.map((item) => item.name).join("、") || "空";
      throw new Error(`还没有在当前运行环境看到刚刚绑定的「${profileName}」。当前 lark-cli 只看到：${available}。请确认飞书页面已经点完授权；如果还是没有出现，请重新绑定，或让工程师检查 lark-cli profile list。`);
    }

    const session = guidedBindSessions.get(profileName);
    if (session?.isRunning()) session.stop();
    guidedBindSessions.delete(profileName);
    record("info", "飞书官方绑定已确认", { profileName, appId: profile.appId });
    return {
      ok: true,
      profile,
    };
  });

  ctx.actions.register(ACTION_KEYS.startUserAuth, async (params) => {
    const config = await getConfig(ctx);
    const profileName = readString(params.profileName);
    if (!profileName) throw new Error("请先选择要补充用户授权的飞书机器人。");

    const result = await runLarkCli({
      bin: config.larkCliBin ?? "lark-cli",
      args: [
        "--profile",
        profileName,
        "auth",
        "login",
        "--recommend",
        "--no-wait",
        "--json",
      ],
      timeoutMs: 15_000,
    });
    if (!result.ok) {
      const detail = truncateText(result.stderr || result.stdout || "飞书用户授权链接生成失败", 700);
      record("error", "飞书用户授权链接生成失败", { profileName, result: summarizeLarkResult(result) });
      throw new Error(detail);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      parsed = {};
    }
    const root = asRecord(parsed) ?? {};
    const deviceCode = readString(root.device_code, root.deviceCode);
    const verificationUrl = readString(root.verification_url, root.verificationUrl);
    const expiresIn = typeof root.expires_in === "number" ? root.expires_in : 600;
    if (!deviceCode || !verificationUrl) {
      throw new Error("lark-cli 没有返回飞书用户授权链接。请确认 lark-cli 已更新到支持 device flow 的版本。");
    }

    userAuthSessions.set(profileName, {
      profileName,
      deviceCode,
      verificationUrl,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    record("info", "已生成飞书用户授权链接", { profileName, expiresIn });
    return {
      ok: true,
      profileName,
      url: verificationUrl,
      expiresIn,
      userCode: readString(root.user_code, root.userCode),
    };
  });

  ctx.actions.register(ACTION_KEYS.finishUserAuth, async (params) => {
    const config = await getConfig(ctx);
    const profileName = readString(params.profileName);
    if (!profileName) throw new Error("请先选择要确认授权的飞书机器人。");

    const session = userAuthSessions.get(profileName);
    if (!session) throw new Error("这次用户授权链接已经失效。请重新点击“补用户授权”。");
    if (Date.now() > session.expiresAt) {
      userAuthSessions.delete(profileName);
      throw new Error("这次飞书用户授权链接已经过期。请重新点击“补用户授权”。");
    }

    const result = await runLarkCli({
      bin: config.larkCliBin ?? "lark-cli",
      args: [
        "--profile",
        profileName,
        "auth",
        "login",
        "--device-code",
        session.deviceCode,
        "--json",
      ],
      timeoutMs: 60_000,
    });
    if (!result.ok) {
      const detail = truncateText(result.stderr || result.stdout || "飞书用户授权还没有完成", 700);
      record("warning", "飞书用户授权确认失败", { profileName, result: summarizeLarkResult(result) });
      throw new Error(detail);
    }

    userAuthSessions.delete(profileName);
    const profiles = await listLarkProfiles(config);
    if (profiles.error) throw new Error(profiles.error);
    const profile = profiles.profiles.find((item) => item.name === profileName);
    record("info", "飞书用户授权已确认", { profileName, user: profile?.user });
    return {
      ok: true,
      profile,
    };
  });

  ctx.actions.register(ACTION_KEYS.bindProfile, async (params) => {
    const config = await getConfig(ctx);
    const profileName = readString(params.profileName);
    const appId = readString(params.appId);
    const appSecret = readString(params.appSecret);
    const brand = readString(params.brand) === "lark" ? "lark" : "feishu";
    if (!profileName) throw new Error("请填写飞书应用配置名称。");
    if (!appId) throw new Error("请填写飞书 App ID。");
    if (!appSecret) throw new Error("请填写飞书 App Secret。");

    const result = await runLarkCli({
      bin: config.larkCliBin ?? "lark-cli",
      args: buildProfileAddArgs({ name: profileName, appId, brand }),
      stdin: `${appSecret}\n`,
      timeoutMs: 30_000,
    });
    if (!result.ok) {
      const detail = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
      record("error", "飞书应用绑定失败", {
        profileName,
        appId,
        result: summarizeLarkResult(result),
      });
      throw new Error(detail || "lark-cli profile add 执行失败");
    }

    record("info", "飞书应用已绑定到当前运行环境", { profileName, appId, brand });
    return {
      ok: true,
      profileName,
      appId,
      brand,
      result: summarizeLarkResult(result),
    };
  });

  ctx.actions.register(ACTION_KEYS.testRoute, async (params) => {
    const config = await getConfig(ctx);
    const routeId = readString(params.routeId);
    if (!routeId) throw new Error("请先选择要测试的飞书入口。");
    const route = (config.routes ?? []).find((candidate) => candidate.id === routeId);
    if (!route) throw new Error(`没有找到飞书入口「${routeId}」。`);
    if (route.enabled === false) throw new Error("这条飞书入口已暂停。请先启用后再测试。");
    const connection = resolveConnection(config, route.connectionId);
    if (!connection) throw new Error("这条入口没有可用的飞书机器人。");

    const testConfig = normalizeConfig({
      ...config,
      dryRunCli: true,
      enableQuickReply: true,
      quickReplyText: config.quickReplyText || "ok",
    });
    const raw = testRawForRoute(route);
    const result = await handleInboundMessage(ctx, raw, {
      connectionId: connection.id,
      configOverride: testConfig,
    });
    record(result.quickReply ? "info" : "warning", "飞书入口测试已执行", {
      routeId: route.id,
      sampleText: raw.text,
      result,
    });
    return {
      ok: result.ok === true && result.quickReply === true,
      dryRun: true,
      routeId: route.id,
      sampleText: raw.text,
      result,
      message: result.quickReply
        ? "测试通过：入口能匹配飞书消息，并会用机器人回复。"
        : "测试没有走通：请检查入口的监听方式、关键词或高级规则。",
    };
  });

  ctx.actions.register(ACTION_KEYS.simulateInboundMessage, async (params) => {
    return await handleInboundMessage(ctx, params.raw ?? params, {
      connectionId: typeof params.connectionId === "string" ? params.connectionId : undefined,
    });
  });

  ctx.actions.register(ACTION_KEYS.sendMessage, async (params) => {
    const config = await getConfig(ctx);
    const connection = resolveConnection(config, typeof params.connectionId === "string" ? params.connectionId : undefined);
    if (!connection) throw new Error("还没有配置可用的飞书机器人连接。");
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
    if (!sink) throw new Error("没有找到可用的多维表格写入规则。请检查第 3 步里的规则代号是否一致，并确认已启用。");
    const connection = resolveConnection(config, sink.connectionId);
    if (!connection) throw new Error("多维表格写入规则没有找到可用的飞书机器人连接。");
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
      displayName: "发送飞书消息",
      description: "通过已配置的飞书机器人给指定会话或用户发送消息。",
      parametersSchema: {
        type: "object",
        properties: {
          connectionId: { type: "string", title: "飞书机器人连接代号" },
          chatId: { type: "string", title: "飞书群/会话 chat_id" },
          userId: { type: "string", title: "飞书用户 ID" },
          text: { type: "string", title: "文本内容" },
          markdown: { type: "string", title: "Markdown 内容" },
        },
      },
    },
    async (params): Promise<ToolResult> => {
      const config = await getConfig(ctx);
      const payload = params as Record<string, unknown>;
      const connection = resolveConnection(config, typeof payload.connectionId === "string" ? payload.connectionId : undefined);
      if (!connection) return { error: "还没有配置可用的飞书机器人连接。" };
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
        ? { content: result.dryRun ? "测试模式：飞书消息没有真实发送，命令已生成。" : "飞书消息已发送。", data: result }
        : { error: result.stderr || `lark-cli exited with ${result.code}`, data: result };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.writeBaseRecord,
    {
      displayName: "写入飞书多维表格",
      description: "把一条结构化记录写入已配置的飞书多维表格。",
      parametersSchema: {
        type: "object",
        properties: {
          sinkId: { type: "string", title: "多维表格规则代号" },
          record: { type: "object", title: "要写入的记录内容" },
        },
        required: ["sinkId", "record"],
      },
    },
    async (params): Promise<ToolResult> => {
      const config = await getConfig(ctx);
      const payload = params as Record<string, unknown>;
      const sink = resolveBaseSink(config, typeof payload.sinkId === "string" ? payload.sinkId : undefined);
      if (!sink) return { error: "没有找到可用的多维表格写入规则。请检查第 3 步里的规则代号是否一致，并确认已启用。" };
      const connection = resolveConnection(config, sink.connectionId);
      if (!connection) return { error: "多维表格写入规则没有找到可用的飞书机器人连接。" };
      const recordJson = typeof payload.record === "object" && payload.record !== null && !Array.isArray(payload.record)
        ? payload.record as Record<string, unknown>
        : {};
      const result = await writeBaseRecord(ctx, config, connection, sink, recordJson);
      return result.ok
        ? { content: result.dryRun ? "测试模式：多维表格没有真实写入，命令已生成。" : "多维表格已写入。", data: result }
        : { error: result.stderr || `lark-cli exited with ${result.code}`, data: result };
    },
  );
}

function readRunIdFromEvent(event: PluginEvent): string | undefined {
  const payload = asRecord(event.payload);
  return readString(payload?.runId, payload?.id, event.entityId);
}

function terminalSessionEventType(eventType: PluginEvent["eventType"]): AgentSessionEvent["eventType"] | null {
  if (eventType === "agent.run.finished") return "done";
  if (eventType === "agent.run.failed" || eventType === "agent.run.cancelled") return "error";
  return null;
}

async function handleAgentRunTerminalEvent(ctx: PluginContext, event: PluginEvent): Promise<void> {
  const runId = readRunIdFromEvent(event);
  const eventType = terminalSessionEventType(event.eventType);
  if (!runId || !eventType) return;

  const sessionRecord = await findSessionByRunId(ctx, runId);
  if (!sessionRecord) {
    record("info", "收到 Paperclip 运行结束事件，但没有对应的飞书会话", {
      eventType: event.eventType,
      runId,
    });
    return;
  }

  const config = await getConfig(ctx);
  const session = sessionRecord.data;
  const connection = resolveConnection(config, session.connectionId);
  if (!connection) {
    record("warning", "飞书完成回复失败：找不到这个运行对应的机器人", {
      runId,
      connectionId: session.connectionId,
    });
    return;
  }

  const route = await resolveRouteFromSession(ctx, config, session, sessionRecord.companyId);
  const issue = await ctx.issues.get(session.paperclipIssueId, route.companyId).catch(() => null);
  const payload = asRecord(event.payload);
  const message: FeishuInboundMessage = {
    connectionId: session.connectionId,
    messageId: session.lastMessageId,
    chatId: session.chatId,
    threadId: session.threadId,
    rootMessageId: session.rootMessageId,
    senderOpenId: session.requesterOpenId,
    text: issue?.title ?? session.paperclipIssueTitle ?? "Paperclip 任务",
    attachments: [],
    raw: {
      recoveredFrom: event.eventType,
      runId,
    },
  };
  await replyOnAgentSessionTerminal(
    ctx,
    config,
    connection,
    route,
    message,
    session,
    issue?.title ?? session.paperclipIssueTitle ?? "Paperclip 任务",
    {
      sessionId: session.paperclipAgentSessionId ?? "",
      runId,
      seq: 0,
      eventType,
      stream: "system",
      message: readString(payload?.message, payload?.error, payload?.reason) ?? null,
      payload: payload ?? null,
    },
  );
}

async function registerEventHandlers(ctx: PluginContext): Promise<void> {
  const onRunDone = async (event: PluginEvent) => {
    record("info", "Observed Paperclip run event", {
      eventType: event.eventType,
      runId: (event.payload as Record<string, unknown> | null)?.runId ?? event.entityId,
    });
    await handleAgentRunTerminalEvent(ctx, event);
  };
  ctx.events.on("agent.run.finished", onRunDone);
  ctx.events.on("agent.run.failed", onRunDone);
  ctx.events.on("agent.run.cancelled", onRunDone);
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;
    installProcessShutdownHandlers();
    await registerDataHandlers(ctx);
    await registerActionHandlers(ctx);
    await registerToolHandlers(ctx);
    await registerEventHandlers(ctx);
    await startConfiguredSubscribers(ctx, await getConfig(ctx));
    startSubscriberWatchdog(ctx);
    record("info", "飞书连接器已启动", { pluginId: PLUGIN_ID });
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    const ctx = currentContext;
    const config = ctx ? await getConfig(ctx) : normalizeConfig({});
    const monitor = buildProductionMonitor(config);
    return {
      status: monitor.health === "error" ? "error" : monitor.health === "warning" ? "degraded" : "ok",
      message: monitor.message,
      details: {
        dryRunCli: config.dryRunCli === true,
        eventSubscriberEnabled: config.enableEventSubscriber === true,
        enabledConnections: getEnabledConnections(config).length,
        activeSubscribers: subscribers.size,
        expectedSubscribers: monitor.expectedSubscriberCount,
        missingSubscriberConnectionIds: monitor.missingSubscriberConnectionIds,
        recentErrorCount: monitor.recentErrorCount,
        recentWarningCount: monitor.recentWarningCount,
      },
    };
  },

  async onConfigChanged(newConfig) {
    const ctx = currentContext;
    if (!ctx) return;
    const config = normalizeConfig(newConfig);
    await startConfiguredSubscribers(ctx, config);
    record("info", "飞书连接器配置已更新", {
      enabledConnections: getEnabledConnections(config).length,
      subscribers: subscribers.size,
    });
  },

  async onValidateConfig(config) {
    const normalized = normalizeConfig(config);
    const warnings: string[] = [];
    const errors: string[] = [];
    if (normalized.enableEventSubscriber) {
      warnings.push("只有本地测试或单实例部署才建议开启「自动监听飞书消息」。云服务器部署建议用单独的监听服务，避免重复收消息。");
    }
    for (const route of normalized.routes ?? []) {
      if (route.enabled === false) continue;
      if (!route.companyId && !route.companyRef) errors.push(`接收规则「${route.id}」缺少公司。请填写公司名称/前缀，或填写公司 ID。`);
      if (route.matchType === "chat" && !route.chatId) errors.push(`接收规则「${route.id}」选择了群聊/会话，但没有填写飞书 chat_id。`);
      if (route.matchType === "user" && !route.userOpenId) errors.push(`接收规则「${route.id}」选择了指定用户，但没有填写用户 open_id。`);
      if (route.baseSinkId && !(normalized.baseSinks ?? []).some((sink) => sink.id === route.baseSinkId)) {
        errors.push(`接收规则「${route.id}」引用了不存在的多维表格规则「${route.baseSinkId}」。`);
      }
    }
    return { ok: errors.length === 0, warnings, errors };
  },

  async onShutdown() {
    stopSubscriberWatchdog();
    stopSubscribers();
    record("warning", "飞书连接器正在关闭");
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
