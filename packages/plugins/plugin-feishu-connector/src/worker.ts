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
  API_ROUTE_KEYS,
  DATA_KEYS,
  DEFAULT_ACK_TEMPLATE,
  DEFAULT_COMPLETION_TEMPLATE,
  DEFAULT_ESTIMATED_DURATION_LABEL,
  LEGACY_ACK_TEMPLATE,
  LEGACY_COMPLETION_TEMPLATE,
  PLUGIN_ID,
  TOOL_NAMES,
  WEBHOOK_KEYS,
} from "./constants.js";
import {
  getEnabledConnections,
  normalizeConfig,
  resolveBaseSink,
  resolveConnection,
} from "./config.js";
import {
  buildFeishuCapabilityCenter,
  FEISHU_CAPABILITY_DEFINITIONS,
  findFeishuCapabilityDefinition,
  isFeishuCapabilityEnabled,
  isLarkCliCommandAllowedForCapability,
  type FeishuCapabilityContext,
  type LarkCliSchemaDiscovery,
} from "./capabilities.js";
import {
  buildBaseRecord,
  buildSessionKey,
  createCommentBody,
  createIssueDescription,
  createIssueTitle,
  describeFeishuConversation,
  describeRouteEntry,
  describeRouteTrigger,
  extractInboundMessage,
  renderTemplate,
  resolveMatchingRoutes,
  resolveRoute,
} from "./routing.js";
import {
  buildAuthStatusArgs,
  buildFetchDocArgs,
  buildRecordUpsertArgs,
  buildMessageGetArgs,
  buildProfileAddArgs,
  buildReplyMessageArgs,
  buildResourceDownloadArgs,
  buildSendMessageArgs,
  resolveLarkCliBin,
  runLarkCli,
  startLarkConfigInit,
  startLarkEventSubscriber,
  type LarkConfigInitSession,
  type LarkEventSubscriber,
} from "./lark-cli.js";
import { planEventSubscribers, routeListeningConnections } from "./subscriber-plan.js";
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
import type { IssueComment } from "@paperclipai/shared";

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
  usableConnectionCount?: number;
  missingProfileConnectionIds?: string[];
  profileReadError?: string | null;
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

type RetryQueueItem = {
  id: string;
  kind: "feishu_reply" | "base_record";
  status: "queued" | "succeeded" | "failed";
  connectionId: string;
  profileName: string;
  args: string[];
  reason: string;
  routeId?: string;
  issueId?: string;
  messageId?: string;
  attemptCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt?: string;
  lastAttemptAt?: string;
};

type RetryQueueSummary = {
  totalCount: number;
  pendingCount: number;
  failedCount: number;
  succeededCount: number;
  items: RetryQueueItem[];
};

type ProfileAvailability = {
  availableProfileNames?: Set<string>;
  profileReadError?: string | null;
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
const connectionBotInfoCache = new Map<string, { fetchedAt: number; botName?: string | null; botOpenId?: string | null }>();
let currentContext: PluginContext | null = null;
let subscriberWatchdog: ReturnType<typeof setInterval> | null = null;
let lastWatchdogAt: string | null = null;
let lastInboundEventAt: string | null = null;
const FINAL_REPLY_FULL_TEXT_LIMIT = 1_800;
const FINAL_REPLY_SUMMARY_LIMIT = 900;
const RUN_FALLBACK_DELAY_MS = process.env.VITEST ? 10 : 5_000;
const CONNECTION_BOT_INFO_TTL_MS = 10 * 60 * 1000;
const EVENT_LOG_ENTITY_TYPE = "feishu_event_logs";
const CONFLICT_ENTITY_TYPE = "feishu_conflicts";
const RETRY_QUEUE_NAMESPACE = "feishu-retry-queue";
const RETRY_QUEUE_STATE_KEY = "items";
const RETRY_QUEUE_LIMIT = 100;
const DB_TABLES = {
  bots: "feishu_bots",
  entries: "feishu_entries",
  capabilities: "feishu_capabilities",
  entryCapabilities: "feishu_entry_capabilities",
  agentCapabilities: "feishu_agent_capabilities",
  conversations: "feishu_conversations",
  messageRoutes: "feishu_message_routes",
  eventLogs: "feishu_event_logs",
  conflicts: "feishu_conflicts",
  permissionChecks: "feishu_permission_checks",
} as const;

function record(level: RecentRecord["level"], message: string, data?: unknown): void {
  const entry = { level, message, data, createdAt: new Date().toISOString() };
  recentRecords.unshift(entry);
  if (recentRecords.length > 50) recentRecords.length = 50;
  const ctx = currentContext;
  if (ctx) {
    void persistRecentRecord(ctx, entry);
  }
}

function textPreview(text?: string | null, maxLength = 120): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function isLikelyFeishuInternalId(value?: string | null): boolean {
  const trimmed = (value ?? "").trim();
  return /^(oc|ou|om|on|od|of|cli)_[a-z0-9][a-z0-9_-]{5,}$/i.test(trimmed);
}

function displayNameOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || isLikelyFeishuInternalId(trimmed)) return null;
  return trimmed;
}

function legacyIssueLine(description: string | null | undefined, label: string): string | null {
  const line = description?.split(/\r?\n/g).find((item) => item.trim().startsWith(`${label}：`));
  const raw = line?.trim().slice(label.length + 1).trim();
  if (!raw) return null;
  const unescaped = raw.replace(/\\_/g, "_");
  const withoutParentheticalId = unescaped.replace(/[（(]\s*(oc|ou|om|on|od|of|cli)_[^)）]+\s*[)）]\s*$/i, "").trim();
  return displayNameOrNull(withoutParentheticalId);
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
    senderType: message.senderType ?? null,
    senderAppId: message.senderAppId ?? null,
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
    routeName: describeRouteEntry(route),
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

function buildProductionMonitor(
  config: FeishuConnectorConfig,
  profileAvailability: ProfileAvailability = {},
): ProductionMonitor {
  const connections = getEnabledConnections(config);
  const availableProfileNames = profileAvailability.availableProfileNames;
  const missingProfileConnections = availableProfileNames
    ? connections.filter((connection) => !availableProfileNames.has(connection.profileName))
    : [];
  const usableConnectionCount = availableProfileNames
    ? connections.length - missingProfileConnections.length
    : undefined;
  const listeningConnections = routeListeningConnections(config);
  const subscriberPlans = planEventSubscribers(config);
  const routes = enabledRoutes(config);
  const activeEntries = activeSubscriberEntries();
  const expectedSubscriberCount = config.enableEventSubscriber === true ? subscriberPlans.length : 0;
  const activeSubscriberIds = new Set(activeEntries.map(([connectionId]) => connectionId));
  const expectedSubscriberIds = new Set(subscriberPlans.map((plan) => plan.primaryConnectionId));
  const activeSubscriberCount = activeEntries.filter(([connectionId]) => expectedSubscriberIds.has(connectionId)).length;
  const missingSubscriberConnectionIds = config.enableEventSubscriber === true
    ? subscriberPlans
      .filter((plan) => !activeSubscriberIds.has(plan.primaryConnectionId))
      .flatMap((plan) => plan.connectionIds)
    : [];
  const recent = recentRecordsSince(30).filter((item) => {
    const connectionId = typeof (item.data as Record<string, unknown> | undefined)?.connectionId === "string"
      ? (item.data as Record<string, unknown>).connectionId as string
      : null;
    return !connectionId || expectedSubscriberIds.has(connectionId);
  });
  const recentErrorCount = recent.filter((item) => item.level === "error").length;
  const recentWarningCount = recent.filter((item) => item.level === "warning").length;
  const recentConflictCount = recent.filter((item) =>
    item.message.includes("其他飞书机器人") || item.message.includes("抢答") || item.message.includes("命中多个入口")
  ).length;
  const lastEventAt = recentRecords[0]?.createdAt ?? null;
  const checks: ProductionMonitorCheck[] = [
    {
      key: "connections",
      tone: connections.length === 0
        ? "error"
        : missingProfileConnections.length > 0 || profileAvailability.profileReadError
          ? "warning"
          : "success",
      title: "飞书机器人",
      detail: connections.length === 0
        ? "还没有启用飞书机器人，飞书消息无法进入 Paperclip。"
        : profileAvailability.profileReadError
          ? `已配置 ${connections.length} 个飞书机器人，但当前运行环境无法读取 lark-cli 授权列表：${profileAvailability.profileReadError}`
          : missingProfileConnections.length > 0
            ? `已配置 ${connections.length} 个飞书机器人，其中 ${missingProfileConnections.length} 个当前运行环境读不到授权/profile，需要重新绑定或换用可运行机器人。`
            : availableProfileNames
              ? `已启用 ${usableConnectionCount ?? connections.length} 个可运行飞书机器人；每条入口可以单独选择。`
              : `已启用 ${connections.length} 个飞书机器人；每条入口可以单独选择。`,
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
        ? expectedSubscriberCount === 0
          ? "监听开关已开启，但当前没有启用的业务入口，所以不会启动机器人监听。"
          : missingSubscriberConnectionIds.length > 0
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
      key: "bot-conflict",
      tone: recentConflictCount > 0 ? "warning" : "success",
      title: "抢答冲突",
      detail: recentConflictCount > 0
        ? `最近 30 分钟检测到 ${recentConflictCount} 次其他飞书机器人可能在同一会话回复。建议只保留一个机器人监听同一入口。`
        : "没有发现其他机器人抢答同一入口。",
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
    usableConnectionCount,
    missingProfileConnectionIds: missingProfileConnections.map((connection) => connection.id),
    profileReadError: profileAvailability.profileReadError ?? null,
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

function assertSqlIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL ${label}: ${value}`);
  }
  return value;
}

function dbTable(namespace: string, table: string): string {
  return `${assertSqlIdentifier(namespace, "namespace")}.${assertSqlIdentifier(table, "table")}`;
}

async function executePluginDb(ctx: PluginContext, sql: string, params: unknown[] = []): Promise<void> {
  if (!ctx.db.namespace) return;
  try {
    await ctx.db.execute(sql, params);
  } catch (error) {
    ctx.logger.warn?.("Feishu connector database write failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function jsonParam(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function durableRecordId(prefix: string, entry: RecentRecord): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      createdAt: entry.createdAt,
      level: entry.level,
      message: entry.message,
      data: entry.data ?? null,
    }))
    .digest("hex")
    .slice(0, 32);
  return `${prefix}-${hash}`;
}

function conflictRecordId(entry: RecentRecord): string {
  const data = asRecord(entry.data);
  const messageId = readString(data?.messageId);
  const selectedRouteId = readString(data?.selectedRouteId, data?.routeId);
  if (messageId) {
    return `conflict-${crypto
      .createHash("sha256")
      .update([messageId, selectedRouteId ?? "", entry.message].join(":"))
      .digest("hex")
      .slice(0, 32)}`;
  }
  return durableRecordId("conflict", entry);
}

function isConflictRecord(entry: RecentRecord): boolean {
  const data = asRecord(entry.data);
  return data?.conflictDetected === true
    || entry.message.includes("同一条飞书消息命中多个入口")
    || entry.message.includes("其他飞书机器人")
    || entry.message.includes("抢答");
}

async function persistRecentRecord(ctx: PluginContext, entry: RecentRecord): Promise<void> {
  const data = asRecord(entry.data);
  const eventId = durableRecordId("event", entry);
  await ctx.entities.upsert({
    entityType: EVENT_LOG_ENTITY_TYPE,
    scopeKind: "instance",
    externalId: eventId,
    title: entry.message,
    status: entry.level,
    data: {
      level: entry.level,
      message: entry.message,
      createdAt: entry.createdAt,
      payload: entry.data ?? null,
      connectionId: readString(data?.connectionId) ?? null,
      routeId: readString(data?.routeId, data?.selectedRouteId) ?? null,
      issueId: readString(data?.issueId) ?? null,
      messageId: readString(data?.messageId) ?? null,
    },
  });
  await executePluginDb(
    ctx,
    `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.eventLogs)}
      (id, level, message, connection_id, entry_id, issue_id, feishu_message_id, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz)
     ON CONFLICT (id) DO UPDATE SET
       level = EXCLUDED.level,
       message = EXCLUDED.message,
       connection_id = EXCLUDED.connection_id,
       entry_id = EXCLUDED.entry_id,
       issue_id = EXCLUDED.issue_id,
       feishu_message_id = EXCLUDED.feishu_message_id,
       payload = EXCLUDED.payload`,
    [
      eventId,
      entry.level,
      entry.message,
      readString(data?.connectionId) ?? null,
      readString(data?.routeId, data?.selectedRouteId) ?? null,
      readString(data?.issueId) ?? null,
      readString(data?.messageId) ?? null,
      jsonParam(entry.data ?? {}),
      entry.createdAt,
    ],
  );

  if (!isConflictRecord(entry)) return;
  const conflictId = conflictRecordId(entry);
  await ctx.entities.upsert({
    entityType: CONFLICT_ENTITY_TYPE,
    scopeKind: "instance",
    externalId: conflictId,
    title: entry.message,
    status: "open",
    data: {
      level: entry.level,
      message: entry.message,
      createdAt: entry.createdAt,
      payload: entry.data ?? null,
      connectionId: readString(data?.connectionId) ?? null,
      selectedRouteId: readString(data?.selectedRouteId, data?.routeId) ?? null,
      messageId: readString(data?.messageId) ?? null,
    },
  });
  await executePluginDb(
    ctx,
    `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.conflicts)}
      (id, status, conflict_type, connection_id, selected_entry_id, feishu_message_id, summary, payload, created_at, updated_at)
     VALUES ($1, 'open', $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $8::timestamptz)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       connection_id = EXCLUDED.connection_id,
       selected_entry_id = EXCLUDED.selected_entry_id,
       feishu_message_id = EXCLUDED.feishu_message_id,
       summary = EXCLUDED.summary,
       payload = EXCLUDED.payload,
       updated_at = EXCLUDED.updated_at`,
    [
      conflictId,
      readString(data?.reason) ?? "routing",
      readString(data?.connectionId) ?? null,
      readString(data?.selectedRouteId, data?.routeId) ?? null,
      readString(data?.messageId) ?? null,
      entry.message,
      jsonParam(entry.data ?? {}),
      entry.createdAt,
    ],
  );
}

async function syncConfigToDatabase(ctx: PluginContext, config: FeishuConnectorConfig): Promise<void> {
  if (!ctx.db.namespace) return;
  for (const connection of config.connections ?? []) {
    await executePluginDb(
      ctx,
      `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.bots)}
        (id, display_name, app_id, profile_name, enabled, bot_aliases, raw_config, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         app_id = EXCLUDED.app_id,
         profile_name = EXCLUDED.profile_name,
         enabled = EXCLUDED.enabled,
         bot_aliases = EXCLUDED.bot_aliases,
         raw_config = EXCLUDED.raw_config,
         updated_at = now()`,
      [
        connection.id,
        connection.name?.trim() || connection.profileName,
        connection.appId ?? null,
        connection.profileName,
        connection.enabled !== false,
        jsonParam(connection.botAliases ?? []),
        jsonParam(connection),
      ],
    );
  }

  for (const route of config.routes ?? []) {
    await executePluginDb(
      ctx,
      `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.entries)}
        (id, display_name, connection_id, enabled, match_type, trigger_label, company_ref, company_id, project_id,
         target_agent_id, target_agent_name, reply_mode, base_sink_id, priority, raw_config, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         connection_id = EXCLUDED.connection_id,
         enabled = EXCLUDED.enabled,
         match_type = EXCLUDED.match_type,
         trigger_label = EXCLUDED.trigger_label,
         company_ref = EXCLUDED.company_ref,
         company_id = EXCLUDED.company_id,
         project_id = EXCLUDED.project_id,
         target_agent_id = EXCLUDED.target_agent_id,
         target_agent_name = EXCLUDED.target_agent_name,
         reply_mode = EXCLUDED.reply_mode,
         base_sink_id = EXCLUDED.base_sink_id,
         priority = EXCLUDED.priority,
         raw_config = EXCLUDED.raw_config,
         updated_at = now()`,
      [
        route.id,
        describeRouteEntry(route),
        route.connectionId ?? null,
        route.enabled !== false,
        route.matchType,
        describeRouteTrigger(route),
        route.companyRef ?? null,
        route.companyId ?? null,
        route.projectId ?? null,
        route.targetAgentId ?? null,
        route.targetAgentName ?? route.targetAgentRef ?? null,
        route.replyMode ?? "thread",
        route.baseSinkId ?? null,
        route.priority ?? 10,
        jsonParam(route),
      ],
    );
  }

  for (const definition of FEISHU_CAPABILITY_DEFINITIONS) {
    await executePluginDb(
      ctx,
      `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.capabilities)}
        (key, title, group_name, implemented, enabled, risk, tool_name, lark_cli_commands, recommended_scopes, raw_definition, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET
         title = EXCLUDED.title,
         group_name = EXCLUDED.group_name,
         implemented = EXCLUDED.implemented,
         enabled = EXCLUDED.enabled,
         risk = EXCLUDED.risk,
         tool_name = EXCLUDED.tool_name,
         lark_cli_commands = EXCLUDED.lark_cli_commands,
         recommended_scopes = EXCLUDED.recommended_scopes,
         raw_definition = EXCLUDED.raw_definition,
         updated_at = now()`,
      [
        definition.key,
        definition.title,
        definition.group,
        definition.implemented,
        isFeishuCapabilityEnabled(config, definition),
        definition.risk,
        definition.toolName ?? null,
        jsonParam(definition.larkCliCommands),
        jsonParam(definition.recommendedScopes),
        jsonParam(definition),
      ],
    );
  }

  for (const capability of config.capabilities ?? []) {
    if (capability.scope === "entry" && capability.routeId) {
      await executePluginDb(
        ctx,
        `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.entryCapabilities)}
          (entry_id, capability_key, enabled, raw_config, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, now())
         ON CONFLICT (entry_id, capability_key) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           raw_config = EXCLUDED.raw_config,
           updated_at = now()`,
        [capability.routeId, capability.key, capability.enabled === true, jsonParam(capability)],
      );
    }
    if (capability.scope === "agent" && capability.agentId) {
      await executePluginDb(
        ctx,
        `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.agentCapabilities)}
          (agent_id, capability_key, enabled, raw_config, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, now())
         ON CONFLICT (agent_id, capability_key) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           raw_config = EXCLUDED.raw_config,
           updated_at = now()`,
        [capability.agentId, capability.key, capability.enabled === true, jsonParam(capability)],
      );
    }
  }
}

function retryQueueScope() {
  return {
    scopeKind: "instance" as const,
    namespace: RETRY_QUEUE_NAMESPACE,
    stateKey: RETRY_QUEUE_STATE_KEY,
  };
}

function retryQueueId(kind: RetryQueueItem["kind"], connectionId: string, args: string[]): string {
  const hash = crypto
    .createHash("sha256")
    .update([kind, connectionId, ...args].join("\0"))
    .digest("hex")
    .slice(0, 32);
  return `retry-${hash}`;
}

function normalizeRetryQueueItem(value: unknown): RetryQueueItem | null {
  const recordValue = asRecord(value);
  if (!recordValue) return null;
  const kind = recordValue.kind === "base_record" ? "base_record" : recordValue.kind === "feishu_reply" ? "feishu_reply" : null;
  const status = recordValue.status === "succeeded" || recordValue.status === "failed" || recordValue.status === "queued"
    ? recordValue.status
    : null;
  const id = readString(recordValue.id);
  const connectionId = readString(recordValue.connectionId);
  const profileName = readString(recordValue.profileName);
  const reason = readString(recordValue.reason) ?? "飞书投递失败";
  const args = Array.isArray(recordValue.args)
    ? recordValue.args.filter((item): item is string => typeof item === "string")
    : [];
  if (!kind || !status || !id || !connectionId || !profileName || args.length === 0) return null;
  const createdAt = readString(recordValue.createdAt) ?? new Date().toISOString();
  const updatedAt = readString(recordValue.updatedAt) ?? createdAt;
  return {
    id,
    kind,
    status,
    connectionId,
    profileName,
    args,
    reason,
    routeId: readString(recordValue.routeId),
    issueId: readString(recordValue.issueId),
    messageId: readString(recordValue.messageId),
    attemptCount: typeof recordValue.attemptCount === "number" ? Math.max(0, recordValue.attemptCount) : 0,
    lastError: readString(recordValue.lastError),
    createdAt,
    updatedAt,
    nextAttemptAt: readString(recordValue.nextAttemptAt),
    lastAttemptAt: readString(recordValue.lastAttemptAt),
  };
}

async function readRetryQueue(ctx: PluginContext): Promise<RetryQueueItem[]> {
  const stored = await ctx.state.get(retryQueueScope());
  const rawItems = Array.isArray(stored)
    ? stored
    : Array.isArray(asRecord(stored)?.items)
      ? asRecord(stored)!.items as unknown[]
      : [];
  return rawItems
    .map((item) => normalizeRetryQueueItem(item))
    .filter((item): item is RetryQueueItem => item !== null);
}

async function writeRetryQueue(ctx: PluginContext, items: RetryQueueItem[]): Promise<void> {
  await ctx.state.set(retryQueueScope(), {
    items: items
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, RETRY_QUEUE_LIMIT),
    updatedAt: new Date().toISOString(),
  });
}

function retryQueueSummary(items: RetryQueueItem[]): RetryQueueSummary {
  const pendingItems = items.filter((item) => item.status === "queued");
  return {
    totalCount: items.length,
    pendingCount: pendingItems.length,
    failedCount: items.filter((item) => item.status === "failed").length,
    succeededCount: items.filter((item) => item.status === "succeeded").length,
    items: items
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 20),
  };
}

function larkResultError(result: LarkCliResult | null): string {
  if (!result) return "没有可投递的飞书目标。";
  return result.stderr.trim() || result.stdout.trim() || `lark-cli exit ${result.code ?? "unknown"}`;
}

async function enqueueRetryItem(
  ctx: PluginContext,
  input: {
    kind: RetryQueueItem["kind"];
    connection: FeishuConnectionConfig;
    args: string[];
    reason: string;
    result: LarkCliResult | null;
    routeId?: string;
    issueId?: string;
    messageId?: string;
  },
): Promise<RetryQueueItem> {
  const now = new Date().toISOString();
  const id = retryQueueId(input.kind, input.connection.id, input.args);
  const items = await readRetryQueue(ctx);
  const existing = items.find((item) => item.id === id);
  const nextItem: RetryQueueItem = {
    ...existing,
    id,
    kind: input.kind,
    status: "queued",
    connectionId: input.connection.id,
    profileName: input.connection.profileName,
    args: input.args,
    reason: input.reason,
    routeId: input.routeId ?? existing?.routeId,
    issueId: input.issueId ?? existing?.issueId,
    messageId: input.messageId ?? existing?.messageId,
    attemptCount: existing?.attemptCount ?? 0,
    lastError: larkResultError(input.result),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    nextAttemptAt: now,
  };
  await writeRetryQueue(ctx, [nextItem, ...items.filter((item) => item.id !== id)]);
  record("warning", "已加入飞书重试队列", {
    id,
    kind: input.kind,
    connectionId: input.connection.id,
    profileName: input.connection.profileName,
    routeId: nextItem.routeId,
    issueId: nextItem.issueId,
    messageId: nextItem.messageId,
    error: nextItem.lastError,
  });
  return nextItem;
}

async function retryFailedDeliveries(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
): Promise<{
  ok: boolean;
  attemptedCount: number;
  successCount: number;
  failedCount: number;
  retryQueue: RetryQueueSummary;
  results: Array<{ id: string; ok: boolean; error?: string }>;
}> {
  const items = await readRetryQueue(ctx);
  const retryable = items.filter((item) => item.status === "queued" || item.status === "failed");
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const item of retryable) {
    const attemptedAt = new Date().toISOString();
    const result = await runLarkCli({
      bin: larkCliBin(config),
      args: item.args,
      dryRun: false,
    });
    const updated: RetryQueueItem = {
      ...item,
      status: result.ok ? "succeeded" : "failed",
      attemptCount: item.attemptCount + 1,
      lastError: result.ok ? undefined : larkResultError(result),
      lastAttemptAt: attemptedAt,
      updatedAt: attemptedAt,
      nextAttemptAt: result.ok ? undefined : new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
    byId.set(item.id, updated);
    results.push({ id: item.id, ok: result.ok, error: updated.lastError });
    record(result.ok ? "info" : "error", "飞书重试队列已执行一条投递", {
      id: item.id,
      kind: item.kind,
      ok: result.ok,
      error: updated.lastError,
    });
  }

  const nextItems = [...byId.values()];
  await writeRetryQueue(ctx, nextItems);
  const summary = retryQueueSummary(nextItems);
  const failedCount = results.filter((item) => !item.ok).length;
  return {
    ok: failedCount === 0,
    attemptedCount: results.length,
    successCount: results.length - failedCount,
    failedCount,
    retryQueue: summary,
    results,
  };
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

function larkCliBin(config: FeishuConnectorConfig): string {
  return resolveLarkCliBin({ configuredBin: config.larkCliBin });
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
    return asRecord(JSON.parse(stripAnsiText(value)));
  } catch {
    return null;
  }
}

function stripAnsiText(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function webhookPayload(input: { parsedBody?: unknown; rawBody: string }): Record<string, unknown> {
  return asRecord(input.parsedBody) ?? parseJsonRecord(input.rawBody) ?? {};
}

function webhookHeader(headers: Record<string, string | string[]>, name: string): string | undefined {
  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== needle) continue;
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function timingSafeStringEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function decryptFeishuWebhookPayload(encrypt: string, encryptKey: string): Record<string, unknown> {
  const encrypted = Buffer.from(encrypt, "base64");
  if (encrypted.length <= 16) throw new Error("飞书加密事件格式不正确：密文太短。");
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const iv = encrypted.subarray(0, 16);
  const ciphertext = encrypted.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const parsed = parseJsonRecord(decrypted);
  if (!parsed) throw new Error("飞书加密事件解密后不是有效 JSON。");
  return parsed;
}

function verifyFeishuWebhookSignature(input: {
  headers: Record<string, string | string[]>;
  rawBody: string;
  parsedBody?: unknown;
}, encryptKey: string, requireSignature: boolean): boolean {
  const signature = readString(webhookHeader(input.headers, "x-lark-signature"));
  const timestamp = readString(
    webhookHeader(input.headers, "x-lark-request-timestamp"),
    webhookHeader(input.headers, "x-lark-timestamp"),
  );
  const nonce = readString(
    webhookHeader(input.headers, "x-lark-request-nonce"),
    webhookHeader(input.headers, "x-lark-nonce"),
  );
  if (!signature || !timestamp || !nonce) {
    if (requireSignature) throw new Error("飞书公网回调缺少签名头，已拒绝。");
    return false;
  }
  const rawBody = input.rawBody || JSON.stringify(input.parsedBody ?? {});
  const digest = crypto.createHash("sha256").update(`${timestamp}${nonce}${encryptKey}${rawBody}`).digest("hex");
  if (!timingSafeStringEquals(signature, digest)) throw new Error("飞书公网回调签名校验失败。");
  return true;
}

async function resolveWebhookSecret(ctx: PluginContext, secretRef: string | undefined, label: string): Promise<string | undefined> {
  if (!secretRef) return undefined;
  try {
    return await ctx.secrets.resolve(secretRef);
  } catch (error) {
    throw new Error(`无法读取${label} Secret Ref「${secretRef}」：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function prepareWebhookPayload(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  input: { headers: Record<string, string | string[]>; parsedBody?: unknown; rawBody: string },
): Promise<{ payload: Record<string, unknown>; encrypted: boolean; tokenVerified: boolean; signatureVerified: boolean }> {
  const basePayload = webhookPayload(input);
  const encrypt = readString(basePayload.encrypt);
  const encryptKey = await resolveWebhookSecret(ctx, config.eventEncryptKeyRef, "飞书事件 Encrypt Key");
  const signatureVerified = encryptKey
    ? verifyFeishuWebhookSignature(input, encryptKey, config.eventRequireSignature === true)
    : false;
  if (config.eventRequireSignature === true && !encryptKey) {
    throw new Error("已开启公网回调签名校验，但没有配置 Encrypt Key Secret Ref。");
  }
  if (encrypt && !encryptKey) {
    throw new Error("收到飞书加密事件，但没有配置 Encrypt Key Secret Ref，无法解密。");
  }
  const payload = encrypt && encryptKey ? decryptFeishuWebhookPayload(encrypt, encryptKey) : basePayload;
  const verificationToken = await resolveWebhookSecret(ctx, config.eventVerificationTokenRef, "飞书事件 Verification Token");
  const actualToken = readString(payload.token, asRecord(payload.header)?.token);
  if (!verificationToken) {
    return { payload, encrypted: Boolean(encrypt), tokenVerified: false, signatureVerified };
  }
  if (!actualToken || !timingSafeStringEquals(actualToken, verificationToken)) {
    throw new Error("飞书事件 Verification Token 校验失败。");
  }
  return { payload, encrypted: Boolean(encrypt), tokenVerified: true, signatureVerified };
}

function webhookAppId(payload: Record<string, unknown>): string | undefined {
  const header = asRecord(payload.header) ?? {};
  const event = asRecord(payload.event) ?? {};
  return readString(
    header.app_id,
    header.appId,
    payload.app_id,
    payload.appId,
    event.app_id,
    event.appId,
  );
}

function webhookConnectionIds(config: FeishuConnectorConfig, payload: Record<string, unknown>): string[] {
  const enabled = getEnabledConnections(config);
  const appId = webhookAppId(payload);
  if (appId) {
    const matching = enabled.filter((connection) => connection.appId === appId);
    if (matching.length > 0) return matching.map((connection) => connection.id);
  }
  return enabled.map((connection) => connection.id);
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
    bin: larkCliBin(config),
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
      bin: larkCliBin(config),
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
        senderType: enrichedMessage.senderType ?? readString(detail.sender_type, detail.senderType, sender?.type, sender?.sender_type, sender?.senderType),
        senderAppId: enrichedMessage.senderAppId ?? readString(detail.sender_app_id, detail.senderAppId, sender?.app_id, sender?.appId),
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
    bin: larkCliBin(config),
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
    bin: larkCliBin(config),
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
      bin: larkCliBin(config),
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
      bin: larkCliBin(config),
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
    throw new Error(`入口「${describeRouteEntry(route)}」没有找到公司。请填写公司名称/前缀，例如「锐捷网络」或「CMP」。`);
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
    throw new Error(`入口「${describeRouteEntry(route)}」没有找到智能体「${agentRef}」。请填写左侧智能体列表里显示的名称，或填写智能体 ID。`);
  }

  return {
    ...route,
    companyId,
    targetAgentId,
    targetAgentName: route.targetAgentName ?? route.targetAgentRef,
  };
}

function dedupKey(message: FeishuInboundMessage, connectionId: string): string {
  const eventOrMessage = message.eventId ? `event:${message.eventId}` : `message:${message.messageId}`;
  return `${connectionId}:${eventOrMessage}`;
}

function mergeProcessedMessageIds(existing: FeishuSessionData | null | undefined, messageId: string): string[] {
  const seen = new Set<string>();
  for (const id of existing?.processedMessageIds ?? []) {
    if (id) seen.add(id);
  }
  if (existing?.rootMessageId) seen.add(existing.rootMessageId);
  if (existing?.lastMessageId) seen.add(existing.lastMessageId);
  if (messageId) seen.add(messageId);
  return [...seen].slice(-50);
}

function sessionAlreadyHandledMessage(existing: FeishuSessionData | null | undefined, message: FeishuInboundMessage): boolean {
  if (!existing?.paperclipIssueId || !message.messageId) return false;
  if (existing.processedMessageIds?.includes(message.messageId)) return true;
  return existing.lastMessageId === message.messageId || existing.rootMessageId === message.messageId;
}

async function markDeduped(ctx: PluginContext, message: FeishuInboundMessage, connectionId: string): Promise<boolean> {
  const stateKey = dedupKey(message, connectionId);
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

async function findSessionByIssueId(
  ctx: PluginContext,
  issueId: string,
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
      data?.paperclipIssueId === issueId &&
      data.connectionId &&
      data.sessionKey
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
  for (const route of config.routes ?? []) {
    if (route.enabled === false) continue;
    if (route.connectionId && route.connectionId !== session.connectionId) continue;
    const resolved = await resolveRouteForRun(ctx, route).catch(() => null);
    if (!resolved) continue;
    if (resolved.companyId !== companyId) continue;
    if (session.paperclipAgentId && resolved.targetAgentId !== session.paperclipAgentId) continue;
    return resolved;
  }
  return {
    id: session.routeId ?? "existing-feishu-session",
    matchType: "default",
    connectionId: session.connectionId,
    companyId,
    targetAgentId: session.paperclipAgentId,
    replyMode: "thread",
  };
}

function messageFromSession(session: FeishuSessionData): FeishuInboundMessage {
  return {
    connectionId: session.connectionId,
    messageId: session.rootMessageId ?? session.lastMessageId,
    chatId: session.chatId,
    chatName: session.chatName,
    threadId: session.threadId,
    rootMessageId: session.rootMessageId,
    senderOpenId: session.requesterOpenId,
    senderName: session.requesterName,
    text: session.paperclipIssueTitle ?? "Paperclip 任务",
    mentions: [],
    attachments: session.attachments ?? [],
    raw: {},
  };
}

function isExternalBotMessage(
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  message: FeishuInboundMessage,
): boolean {
  const senderType = (message.senderType ?? "").toLowerCase();
  const looksLikeBot = /app|bot|机器人/.test(senderType);
  if (!looksLikeBot && !message.senderAppId) return false;

  const currentAppIds = new Set(
    [connection.appId?.trim()]
      .filter((appId): appId is string => !!appId),
  );
  const configuredAppIds = new Set(
    (config.connections ?? [])
      .map((item) => item.appId?.trim())
      .filter((appId): appId is string => !!appId),
  );

  if (!message.senderAppId) return looksLikeBot;
  if (currentAppIds.has(message.senderAppId)) return false;
  if (configuredAppIds.has(message.senderAppId)) return true;
  return looksLikeBot;
}

function isCurrentBotMessage(
  connection: FeishuConnectionConfig,
  message: FeishuInboundMessage,
): boolean {
  if (!message.senderAppId || !connection.appId) return false;
  if (message.senderAppId !== connection.appId) return false;
  const senderType = (message.senderType ?? "").toLowerCase();
  const looksLikeBot = /app|bot|机器人/.test(senderType);
  return !senderType || looksLikeBot;
}

function normalizeMentionValue(value?: string | null): string | null {
  const normalized = (value ?? "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .trim()
    .toLocaleLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function connectionBotAliases(connection: FeishuConnectionConfig): string[] {
  return [...new Set((connection.botAliases ?? [])
    .map((value) => value.trim())
    .filter(Boolean))];
}

function isTechnicalProfileName(value?: string | null): boolean {
  const normalized = (value ?? "").trim().toLocaleLowerCase();
  return !normalized
    || normalized.startsWith("cli_")
    || normalized.endsWith("-bot")
    || normalized.includes(" bot")
    || normalized.includes("feishu")
    || normalized.includes("飞书应用")
    || /^[0-9a-f-]{12,}$/.test(normalized);
}

function extractTextMentionNames(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/@([^\s,，。.!！?？、:：;；)）\]】]+)/g)) {
    const normalized = normalizeMentionValue(match[1]);
    if (normalized) names.push(normalized);
  }
  return names;
}

function inboundMentionTargets(message: FeishuInboundMessage): {
  names: Set<string>;
  openIds: Set<string>;
  appIds: Set<string>;
  rawNames: string[];
  hasExplicitMention: boolean;
} {
  const names = new Set<string>();
  const openIds = new Set<string>();
  const appIds = new Set<string>();
  const rawNames: string[] = [];

  for (const name of extractTextMentionNames(message.text)) {
    names.add(name);
    rawNames.push(name);
  }
  for (const mention of message.mentions ?? []) {
    const name = normalizeMentionValue(mention.name);
    if (name) {
      names.add(name);
      rawNames.push(name);
    }
    const openId = mention.openId?.trim();
    if (openId) openIds.add(openId);
    const appId = mention.appId?.trim();
    if (appId) appIds.add(appId);
  }

  return {
    names,
    openIds,
    appIds,
    rawNames: [...new Set(rawNames)],
    hasExplicitMention: names.size > 0 || openIds.size > 0 || appIds.size > 0,
  };
}

async function cachedConnectionBotInfo(
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
): Promise<{ botName?: string | null; botOpenId?: string | null }> {
  const cacheKey = `${connection.profileName}:${connection.appId ?? ""}`;
  const cached = connectionBotInfoCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CONNECTION_BOT_INFO_TTL_MS) {
    return { botName: cached.botName, botOpenId: cached.botOpenId };
  }
  const info: Partial<Pick<ProfileRow, "botName" | "botOpenId">> = await readBotInfo(config, connection.profileName).catch(() => ({}));
  const row = { fetchedAt: Date.now(), botName: info.botName ?? null, botOpenId: info.botOpenId ?? null };
  connectionBotInfoCache.set(cacheKey, row);
  return { botName: row.botName, botOpenId: row.botOpenId };
}

async function mentionTargetMismatch(
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  message: FeishuInboundMessage,
): Promise<Record<string, unknown> | null> {
  const targets = inboundMentionTargets(message);
  if (!targets.hasExplicitMention) return null;

  const currentNames = new Set<string>();
  const addCurrentName = (value?: string | null) => {
    if (isTechnicalProfileName(value)) return;
    const normalized = normalizeMentionValue(value);
    if (normalized) currentNames.add(normalized);
  };
  addCurrentName(connection.name);
  for (const alias of connectionBotAliases(connection)) addCurrentName(alias);
  const currentOpenIds = new Set<string>();
  const currentAppIds = new Set<string>();
  if (connection.appId) currentAppIds.add(connection.appId);

  const connectionNameAlreadyMatches = [...targets.names].some((name) => currentNames.has(name));
  if (!connectionNameAlreadyMatches) {
    const botInfo = await cachedConnectionBotInfo(config, connection);
    addCurrentName(botInfo.botName);
    if (botInfo.botOpenId) currentOpenIds.add(botInfo.botOpenId);
  }

  const hasComparableStructuredIdentity =
    (targets.openIds.size > 0 && currentOpenIds.size > 0)
    || (targets.appIds.size > 0 && currentAppIds.size > 0);
  const canIdentifyCurrentBot = currentNames.size > 0 || hasComparableStructuredIdentity;
  if (!canIdentifyCurrentBot) return null;

  const addressedToCurrentBot =
    [...targets.names].some((name) => currentNames.has(name))
    || [...targets.openIds].some((openId) => currentOpenIds.has(openId))
    || [...targets.appIds].some((appId) => currentAppIds.has(appId));

  if (addressedToCurrentBot) return null;

  return {
    reason: "mentioned_other_bot",
    mentionedNames: targets.rawNames,
    currentBotNames: [...currentNames],
    currentBotOpenIds: [...currentOpenIds],
    currentAppIds: [...currentAppIds],
  };
}

function connectionMatchesMention(connection: FeishuConnectionConfig, message: FeishuInboundMessage): boolean {
  const targets = inboundMentionTargets(message);
  if (!targets.hasExplicitMention) return false;
  if (connection.appId && targets.appIds.has(connection.appId)) return true;

  const names = new Set<string>();
  const addName = (value?: string | null) => {
    if (isTechnicalProfileName(value)) return;
    const normalized = normalizeMentionValue(value);
    if (normalized) names.add(normalized);
  };
  addName(connection.name);
  for (const alias of connectionBotAliases(connection)) addName(alias);
  return [...targets.names].some((name) => names.has(name));
}

function selectInboundConnection(
  config: FeishuConnectorConfig,
  message: FeishuInboundMessage,
  candidates: FeishuConnectionConfig[],
): FeishuConnectionConfig | null {
  if (candidates.length === 0) return null;
  const mentioned = candidates.find((connection) => connectionMatchesMention(connection, message));
  if (mentioned) return mentioned;

  const routeMatches = candidates
    .map((connection) => ({ connection, route: resolveRoute(config, message, connection.id) }))
    .filter((item): item is { connection: FeishuConnectionConfig; route: FeishuRouteConfig } => !!item.route)
    .sort((a, b) => (b.route.priority ?? 0) - (a.route.priority ?? 0));
  return routeMatches[0]?.connection ?? candidates[0] ?? null;
}

function buildPaperclipIssueUrl(
  config: FeishuConnectorConfig,
  route: ResolvedRouteConfig,
  issueIdentifier?: string | null,
): string | null {
  const base = (config.paperclipBaseUrl || process.env.PAPERCLIP_PUBLIC_BASE_URL || process.env.PAPERCLIP_BASE_URL || "")
    .trim()
    .replace(/\/+$/g, "");
  if (!base || !issueIdentifier) return null;
  const companySegment = (route.companyRef?.trim() || issueIdentifier.split("-")[0] || route.companyId).trim();
  if (!companySegment) return null;
  return `${base}/${encodeURIComponent(companySegment)}/issues/${encodeURIComponent(issueIdentifier)}`;
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
  if (data.chatId) {
    await executePluginDb(
      ctx,
      `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.conversations)}
        (chat_id, connection_id, name, conversation_type, last_active_at, raw_data, updated_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::jsonb, now())
       ON CONFLICT (chat_id) DO UPDATE SET
         connection_id = EXCLUDED.connection_id,
         name = COALESCE(EXCLUDED.name, feishu_conversations.name),
         conversation_type = EXCLUDED.conversation_type,
         last_active_at = EXCLUDED.last_active_at,
         raw_data = EXCLUDED.raw_data,
         updated_at = now()`,
      [
        data.chatId,
        data.connectionId,
        data.chatName ?? null,
        data.chatId.startsWith("oc_") ? "chat" : "unknown",
        data.updatedAt,
        jsonParam(data),
      ],
    );
  }
  await executePluginDb(
    ctx,
    `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.messageRoutes)}
      (id, connection_id, entry_id, company_id, issue_id, issue_identifier, agent_id, chat_id,
       requester_open_id, requester_name, message_id, root_message_id, thread_id, reply_mode, session_key, raw_session, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::timestamptz)
     ON CONFLICT (id) DO UPDATE SET
       connection_id = EXCLUDED.connection_id,
       entry_id = EXCLUDED.entry_id,
       company_id = EXCLUDED.company_id,
       issue_id = EXCLUDED.issue_id,
       issue_identifier = EXCLUDED.issue_identifier,
       agent_id = EXCLUDED.agent_id,
       chat_id = EXCLUDED.chat_id,
       requester_open_id = EXCLUDED.requester_open_id,
       requester_name = EXCLUDED.requester_name,
       message_id = EXCLUDED.message_id,
       root_message_id = EXCLUDED.root_message_id,
       thread_id = EXCLUDED.thread_id,
       reply_mode = EXCLUDED.reply_mode,
       raw_session = EXCLUDED.raw_session,
       updated_at = EXCLUDED.updated_at`,
    [
      data.sessionKey,
      data.connectionId,
      data.routeId ?? null,
      companyId,
      data.paperclipIssueId,
      data.paperclipIssueIdentifier ?? null,
      data.paperclipAgentId ?? null,
      data.chatId ?? null,
      data.requesterOpenId ?? null,
      data.requesterName ?? null,
      data.lastMessageId,
      data.rootMessageId ?? null,
      data.threadId ?? null,
      data.replyMode ?? "thread",
      data.sessionKey,
      jsonParam(data),
      data.updatedAt,
    ],
  );
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
    bin: larkCliBin(config),
    args,
    dryRun: config.dryRunCli === true,
  });
  record(result.ok ? "info" : "error", "多维表格写入已执行", { ok: result.ok, dryRun: result.dryRun });
  if (!result.ok && result.dryRun !== true) {
    await enqueueRetryItem(ctx, {
      kind: "base_record",
      connection,
      args,
      reason: "多维表格写入失败",
      result,
    });
  }
  return result;
}

async function replyToFeishu(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  message: FeishuInboundMessage,
  text: string,
  idempotencyKey: string,
  replyInThread: boolean,
  retryContext: { routeId?: string; issueId?: string; reason?: string } = {},
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
    bin: larkCliBin(config),
    args,
    dryRun: config.dryRunCli === true,
  });
  record(result.ok ? "info" : "error", "飞书回复已执行", summarizeLarkResult(result));
  if (!result.ok && result.dryRun !== true) {
    await enqueueRetryItem(ctx, {
      kind: "feishu_reply",
      connection,
      args,
      reason: retryContext.reason ?? "飞书消息回复失败",
      result,
      routeId: retryContext.routeId,
      issueId: retryContext.issueId,
      messageId: message.messageId,
    });
  }
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
          bin: larkCliBin(config),
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

function buildFeishuCardContent(input: {
  title: string;
  summary: string;
  actions?: Array<{ text?: unknown; url?: unknown }>;
}): string {
  const actions = (input.actions ?? [])
    .filter((action) => typeof action.text === "string" && action.text.trim() && typeof action.url === "string" && action.url.trim())
    .map((action) => ({
      tag: "button",
      text: {
        tag: "plain_text",
        content: String(action.text).trim(),
      },
      url: String(action.url).trim(),
      type: "default",
    }));
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: input.summary,
      },
    },
  ];
  if (actions.length > 0) {
    elements.push({
      tag: "action",
      actions,
    });
  }
  return JSON.stringify({
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: input.title,
      },
      template: "blue",
    },
    elements,
  });
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
    issueUrl?: string | null;
    estimatedDuration?: string;
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
    issueUrl: context.issueUrl ?? "",
    estimatedDuration: context.estimatedDuration ?? "",
  });
}

function buildAckReplyText(params: {
  config: FeishuConnectorConfig;
  message: FeishuInboundMessage;
  route: ResolvedRouteConfig;
  issueId: string;
  issueRef: string;
  issueTitle: string;
  issueUrl?: string | null;
  estimatedDuration?: string;
}): string {
  const { config, message, route, issueId, issueRef, issueTitle } = params;
  const estimatedDuration = params.estimatedDuration ?? DEFAULT_ESTIMATED_DURATION_LABEL;
  const template = config.ackMessageTemplate ?? DEFAULT_ACK_TEMPLATE;
  if (!isDefaultAckTemplate(template)) {
    return renderDefaultAwareTemplate(template, {
      message,
      route,
      issueId,
      issueRef,
      issueTitle,
      issueUrl: params.issueUrl,
      estimatedDuration,
    });
  }

  const agentName = route.targetAgentName ?? "对应智能体";
  const lines = [
    `已收到，交给 ${agentName} 处理。`,
    `任务：${issueRef}`,
    `预计耗时：${estimatedDuration}`,
    "完成后会在这里回复。",
  ];
  if (params.issueUrl) {
    lines.push(`Paperclip 内部链接：${params.issueUrl}（需要账号权限）`);
  }
  return lines.join("\n");
}

function normalizeCommentBody(body: string | null | undefined): string | null {
  const normalized = (body ?? "").replace(/\r\n/g, "\n").trim();
  return normalized.length > 0 ? normalized : null;
}

function commentTime(comment: IssueComment): number {
  const createdAt = comment.createdAt as unknown;
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "string") return Date.parse(createdAt);
  return 0;
}

function latestFinalComment(
  comments: IssueComment[],
  session: FeishuSessionData,
  route: ResolvedRouteConfig,
): IssueComment | null {
  const ordered = [...comments]
    .filter((comment) => normalizeCommentBody(comment.body))
    .sort((a, b) => commentTime(b) - commentTime(a));
  if (ordered.length === 0) return null;

  const agentAuthored = ordered.find((comment) =>
    !!comment.authorAgentId &&
    (comment.authorAgentId === route.targetAgentId || comment.authorAgentId === session.paperclipAgentId)
  );
  return agentAuthored ?? ordered[0] ?? null;
}

function looksLikeFinalComment(body: string | null | undefined): boolean {
  const normalized = normalizeCommentBody(body);
  if (!normalized) return false;
  return /完成|已完成|处理完成|交付|结论|总结|报告|已发送|已回复|done/i.test(normalized);
}

function summarizeLongFinalComment(body: string): string {
  const normalized = body.replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= FINAL_REPLY_SUMMARY_LIMIT) return normalized;
  const paragraphs = normalized.split(/\n{2,}/g);
  const picked: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const candidate = paragraph.trim();
    if (!candidate) continue;
    if (length + candidate.length > FINAL_REPLY_SUMMARY_LIMIT) break;
    picked.push(candidate);
    length += candidate.length + 2;
  }
  const summary = picked.length > 0 ? picked.join("\n\n") : normalized.slice(0, FINAL_REPLY_SUMMARY_LIMIT);
  return `${summary.trim()}...`;
}

function buildCompletionFromFinalComment(params: {
  issueRef: string;
  body: string;
  issueUrl?: string | null;
}): string {
  const body = params.body.trim();
  if (body.length <= FINAL_REPLY_FULL_TEXT_LIMIT) {
    return [`任务完成：${params.issueRef}`, "", body].join("\n");
  }
  const lines = [
    `任务完成：${params.issueRef}`,
    "",
    summarizeLongFinalComment(body),
    "",
    "结果较长，我先把摘要发到这里；完整内容已保存在 Paperclip 任务评论里。",
  ];
  if (params.issueUrl) {
    lines.push(`Paperclip 内部链接：${params.issueUrl}（需要账号权限）`);
  }
  return lines.join("\n");
}

function buildTerminalReplyText(params: {
  config: FeishuConnectorConfig;
  message: FeishuInboundMessage;
  route: ResolvedRouteConfig;
  session: FeishuSessionData;
  issueTitle: string;
  issueStatus?: string | null;
  issueIdentifier?: string | null;
  issueUrl?: string | null;
  finalCommentBody?: string | null;
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
    issueUrl: params.issueUrl,
  };
  if (!isDone) {
    return renderDefaultAwareTemplate("处理失败：{{issue_title}}\n任务：{{issue_ref}}", context);
  }

  const template = config.completionMessageTemplate ?? DEFAULT_COMPLETION_TEMPLATE;
  if (!isDefaultCompletionTemplate(template)) {
    return renderDefaultAwareTemplate(template, context);
  }

  const finalBody = normalizeCommentBody(params.finalCommentBody);
  if (finalBody && (!issueStatus || issueStatus === "done" || looksLikeFinalComment(finalBody))) {
    return buildCompletionFromFinalComment({
      issueRef,
      body: finalBody,
      issueUrl: params.issueUrl,
    });
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

  const replyKey = event.eventType === "done"
    ? larkIdempotencyKey("complete", session.paperclipIssueId)
    : larkIdempotencyKey("terminal", event.runId, event.eventType);
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
  const comments = await ctx.issues.listComments(session.paperclipIssueId, route.companyId).catch(() => []);
  const finalComment = latestFinalComment(comments, session, route);
  const issueUrl = session.paperclipIssueUrl
    ?? buildPaperclipIssueUrl(config, route, issue?.identifier ?? session.paperclipIssueIdentifier ?? null);
  const text = buildTerminalReplyText({
    config,
    message,
    route,
    session,
    issueTitle: resolvedIssueTitle,
    issueStatus: issue?.status,
    issueIdentifier: issue?.identifier ?? null,
    issueUrl,
    finalCommentBody: finalComment?.body ?? null,
    event,
  });
  const suffix = event.eventType === "done" || !event.message ? "" : `\n\n${event.message}`;
  const result = await replyToFeishu(
    ctx,
    config,
    connection,
    message,
    `${text}${suffix}`,
    replyKey,
    (route.replyMode ?? "thread") === "thread",
    { routeId: route.id, issueId: session.paperclipIssueId, reason: "智能体完成回复失败" },
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
    paperclipIssueUrl: issueUrl ?? session.paperclipIssueUrl,
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

function scheduleTerminalFallbackReply(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  connection: FeishuConnectionConfig,
  route: ResolvedRouteConfig,
  message: FeishuInboundMessage,
  session: FeishuSessionData,
  issueTitle: string,
  event: AgentSessionEvent,
): void {
  const timer = setTimeout(() => {
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
      ctx.logger.error("发送飞书完成兜底回复失败", {
        routeId: route.id,
        runId: event.runId,
        error: String(error),
      });
      record("error", "发送飞书完成兜底回复失败", {
        routeId: route.id,
        runId: event.runId,
        error: String(error),
      });
    });
  }, RUN_FALLBACK_DELAY_MS);
  timer.unref?.();
}

async function handleInboundMessage(
  ctx: PluginContext,
  raw: unknown,
  options: { connectionId?: string; connectionIds?: string[]; configOverride?: FeishuConnectorConfig } = {},
): Promise<Record<string, unknown>> {
  const config = options.configOverride ?? await getConfig(ctx);
  let message = extractInboundMessage(raw, options.connectionId);
  const enabledConnections = getEnabledConnections(config);
  const connectionById = new Map(enabledConnections.map((connection) => [connection.id, connection]));
  const candidateIds = [...new Set(
    (options.connectionIds && options.connectionIds.length > 0
      ? options.connectionIds
      : [message.connectionId ?? options.connectionId])
      .filter((connectionId): connectionId is string => typeof connectionId === "string" && connectionId.length > 0),
  )];
  const candidateConnections = candidateIds
    .map((connectionId) => connectionById.get(connectionId))
    .filter((connection): connection is FeishuConnectionConfig => !!connection);
  let connection = selectInboundConnection(config, message, candidateConnections)
    ?? resolveConnection(config, message.connectionId ?? options.connectionId);
  if (!connection) {
    throw new Error("还没有配置可用的飞书机器人连接。请先在「飞书机器人账号」里添加一项，并保持启用。");
  }
  message = { ...message, connectionId: connection.id };
  lastInboundEventAt = new Date().toISOString();
  record("info", "收到飞书消息事件", inboundMessageDiagnostics(message, connection));

  if (isCurrentBotMessage(connection, message)) {
    record("info", "飞书消息来自当前机器人自身，已忽略以避免自触发", inboundMessageDiagnostics(message, connection, {
      reason: "self_bot_message",
      currentAppId: connection.appId ?? null,
    }));
    return {
      ok: true,
      ignored: true,
      reason: "self_bot_message",
      messageId: message.messageId,
    };
  }

  const preEnrichMentionMismatch = await mentionTargetMismatch(config, connection, message);
  if (preEnrichMentionMismatch) {
    record("info", "飞书消息明确 @ 了其他机器人，已跳过当前连接", inboundMessageDiagnostics(message, connection, preEnrichMentionMismatch));
    return {
      ok: true,
      ignored: true,
      reason: "mentioned_other_bot",
      messageId: message.messageId,
      ...preEnrichMentionMismatch,
    };
  }

  message = await enrichInboundMessage(config, connection, message);
  const enrichedConnection = selectInboundConnection(config, message, candidateConnections);
  if (enrichedConnection && enrichedConnection.id !== connection.id) {
    connection = enrichedConnection;
    message = { ...message, connectionId: connection.id };
    record("info", "飞书消息已根据 @ 对象或入口规则切换到对应机器人", inboundMessageDiagnostics(message, connection, {
      candidateConnectionIds: candidateConnections.map((candidate) => candidate.id),
    }));
  }
  if (isCurrentBotMessage(connection, message)) {
    record("info", "飞书消息来自当前机器人自身，已忽略以避免自触发", inboundMessageDiagnostics(message, connection, {
      reason: "self_bot_message",
      currentAppId: connection.appId ?? null,
    }));
    return {
      ok: true,
      ignored: true,
      reason: "self_bot_message",
      messageId: message.messageId,
    };
  }
  if (isExternalBotMessage(config, connection, message)) {
    record("warning", "检测到其他飞书机器人可能在同一会话抢答，已忽略这条机器人消息", inboundMessageDiagnostics(message, connection, {
      reason: "external_bot_message",
      currentAppId: connection.appId ?? null,
      configuredAppIds: (config.connections ?? []).map((item) => item.appId).filter(Boolean),
    }));
    return {
      ok: true,
      ignored: true,
      conflictDetected: true,
      reason: "external_bot_message",
      messageId: message.messageId,
    };
  }
  const mentionMismatch = await mentionTargetMismatch(config, connection, message);
  if (mentionMismatch) {
    record("info", "飞书消息明确 @ 了其他机器人，已跳过当前连接", inboundMessageDiagnostics(message, connection, mentionMismatch));
    return {
      ok: true,
      ignored: true,
      reason: "mentioned_other_bot",
      messageId: message.messageId,
      ...mentionMismatch,
    };
  }

  const sessionKey = buildSessionKey(message, connection.id);
  const existingBySessionKey = await findSessionByKey(ctx, sessionKey);
  if (sessionAlreadyHandledMessage(existingBySessionKey?.data, message)) {
    await markDeduped(ctx, message, connection.id);
    record("info", "已通过持久消息映射忽略重复的飞书消息", inboundMessageDiagnostics(message, connection, {
      issueId: existingBySessionKey?.data.paperclipIssueId,
      routeId: existingBySessionKey?.data.routeId,
      dedupeSource: "message_route",
    }));
    return {
      ok: true,
      duplicate: true,
      persistedDuplicate: true,
      messageId: message.messageId,
      issueId: existingBySessionKey?.data.paperclipIssueId,
    };
  }

  const duplicate = await markDeduped(ctx, message, connection.id);
  if (duplicate) {
    record("info", "已忽略重复的飞书消息", inboundMessageDiagnostics(message, connection));
    return { ok: true, duplicate: true, messageId: message.messageId };
  }

  const matchingRoutes = resolveMatchingRoutes(config, message, connection.id);
  const matchedRoute = matchingRoutes[0] ?? null;
  if (matchedRoute && matchingRoutes.length > 1) {
    const skippedRoutes = matchingRoutes.slice(1);
    record("warning", "同一条飞书消息命中多个入口，已只执行最高优先级入口", inboundMessageDiagnostics(message, connection, {
      selectedRouteId: matchedRoute.id,
      selectedRouteName: describeRouteEntry(matchedRoute),
      skippedRoutes: skippedRoutes.map((route) => ({
        routeId: route.id,
        routeName: describeRouteEntry(route),
        priority: route.priority ?? 0,
      })),
      conflictDetected: true,
    }));
  }
  if (matchedRoute) {
    record("info", "飞书消息已命中业务入口", inboundMessageDiagnostics(message, connection, {
      routeId: matchedRoute.id,
      routeName: describeRouteEntry(matchedRoute),
      trigger: describeRouteTrigger(matchedRoute),
      targetAgentName: matchedRoute.targetAgentName ?? null,
      companyRef: matchedRoute.companyRef ?? matchedRoute.companyId,
    }));
  }

  const directReply = matchedRoute ? quickReplyText(config, message) : null;
  if (matchedRoute && directReply !== null && (matchedRoute.replyMode ?? "thread") !== "none") {
    const result = await replyToFeishu(
      ctx,
      config,
      connection,
      message,
      directReply,
      larkIdempotencyKey("quick", message.messageId),
      (matchedRoute.replyMode ?? "thread") === "thread",
      { routeId: matchedRoute.id, reason: "快捷测试回复失败" },
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
    const existingByKey = existingBySessionKey ?? await findSessionByKey(ctx, sessionKey);
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
  const paperclipIssueUrl = existingSession?.paperclipIssueUrl
    ?? buildPaperclipIssueUrl(config, route, issueIdentifier);

  const session: FeishuSessionData = {
    connectionId: connection.id,
    sessionKey,
    routeId: route.id,
    chatId: message.chatId,
    chatName: message.chatName ?? existingSession?.chatName,
    rootMessageId: message.rootMessageId ?? message.messageId,
    threadId: message.threadId,
    requesterOpenId: message.senderOpenId,
    requesterName: message.senderName,
    attachments: message.attachments.length > 0 ? message.attachments : existingSession?.attachments,
    paperclipIssueId: issueId,
    paperclipIssueIdentifier: issueIdentifier ?? undefined,
    paperclipIssueTitle: existingSession?.paperclipIssueTitle ?? issueTitle,
    paperclipIssueUrl: paperclipIssueUrl ?? undefined,
    paperclipAgentId: route.targetAgentId,
    paperclipAgentSessionId: existingSession?.paperclipAgentSessionId,
    replyMode: route.replyMode ?? "thread",
    lastCompletionReplyKey: existingSession?.lastCompletionReplyKey,
    createdAt: existingSession?.createdAt ?? new Date().toISOString(),
    lastMessageId: message.messageId,
    processedMessageIds: mergeProcessedMessageIds(existingSession, message.messageId),
    updatedAt: new Date().toISOString(),
  };

  await upsertSession(ctx, route.companyId, session);

  let ackResult: LarkCliResult | null = null;
  if (config.ackOnInbound && (route.replyMode ?? "thread") !== "none") {
    const ackText = buildAckReplyText({
      config,
      message,
      route,
      issueId,
      issueRef,
      issueTitle,
      issueUrl: paperclipIssueUrl,
      estimatedDuration: DEFAULT_ESTIMATED_DURATION_LABEL,
    });
    ackResult = await replyToFeishu(
      ctx,
      config,
      connection,
      message,
      ackText,
      larkIdempotencyKey("ack", message.messageId),
      (route.replyMode ?? "thread") === "thread",
      { routeId: route.id, issueId, reason: "首次受理回执失败" },
    );
    record(ackResult?.ok ? "info" : "error", "已向飞书发送任务受理回执", {
      routeId: route.id,
      routeName: describeRouteEntry(route),
      messageId: message.messageId,
      issueId,
      result: summarizeLarkResult(ackResult),
    });
  }

  const attachedResources = await attachFeishuResources(
    ctx,
    config,
    connection,
    message,
    route.companyId,
    issueId,
    issueCommentId,
  );

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
      `飞书入口：${describeRouteEntry(route)}`,
      `可用飞书工具：${enabledFeishuToolNames(config, {
        connectionId: connection.id,
        routeId: route.id,
        agentId: route.targetAgentId,
      }).join(", ") || "无"}`,
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
        scheduleTerminalFallbackReply(
          ctx,
          config,
          connection,
          route,
          message,
          session,
          issueTitle,
          event,
        );
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

function mentionNameForSample(connection: FeishuConnectionConfig): string | null {
  const alias = connectionBotAliases(connection)[0];
  if (alias) return alias;
  if (!isTechnicalProfileName(connection.name)) return connection.name?.trim() ?? null;
  return null;
}

function sampleTextForRoute(route: FeishuRouteConfig, connection: FeishuConnectionConfig): string {
  const mentionName = mentionNameForSample(connection);
  const mention = mentionName ? `@${mentionName}` : "";
  if (route.matchType === "keyword") {
    const keyword = route.keyword?.trim() || "paperclip";
    if (mentionName && normalizeMentionValue(keyword) === normalizeMentionValue(mentionName)) {
      return `${mention} 只回复 ok`.trim();
    }
    return [mention, keyword, "只回复 ok"].filter(Boolean).join(" ");
  }
  if (route.matchType === "regex") {
    return [mention, route.regex?.includes("paperclip") ? "paperclip" : "", "只回复 ok"].filter(Boolean).join(" ");
  }
  return [mention || "paperclip", "只回复 ok"].filter(Boolean).join(" ");
}

function testRawForRoute(route: FeishuRouteConfig, connection: FeishuConnectionConfig): Record<string, unknown> {
  const trigger = route.keyword?.trim() || route.chatName?.trim() || route.userName?.trim() || route.matchType;
  const safeTrigger = trigger
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "entry";
  const suffix = `${safeTrigger}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    event_id: `evt_test_${suffix}`,
    message_id: `om_test_${suffix}`,
    chat_id: route.chatId || `oc_test_${safeTrigger}`,
    sender_open_id: route.userOpenId || "ou_paperclip_test_user",
    sender_name: "Paperclip 测试",
    text: sampleTextForRoute(route, connection),
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
  const listeningConnections = routeListeningConnections(config);
  const connectionById = new Map(listeningConnections.map((connection) => [connection.id, connection]));
  const subscriberPlans = planEventSubscribers(config);
  const primarySubscriberIds = new Set(subscriberPlans.map((plan) => plan.primaryConnectionId));
  for (const [connectionId, subscriber] of subscribers.entries()) {
    if (options.restartAll || config.enableEventSubscriber !== true || !primarySubscriberIds.has(connectionId)) {
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
  for (const plan of subscriberPlans) {
    const connection = connectionById.get(plan.primaryConnectionId);
    if (!connection) continue;
    const existing = subscribers.get(plan.primaryConnectionId);
    if (existing?.isRunning()) continue;
    if (existing) {
      subscribers.delete(plan.primaryConnectionId);
      record("warning", "飞书消息监听已退出，正在重新启动", {
        connectionId: plan.primaryConnectionId,
        connectionIds: plan.connectionIds,
        profileName: existing.profileName,
        pid: existing.child.pid ?? null,
        exitCode: existing.child.exitCode,
        signalCode: existing.child.signalCode,
      });
    }
    const subscriber = startLarkEventSubscriber({
      bin: larkCliBin(config),
      profileName: connection.profileName,
      eventTypes: config.eventTypes,
      onEvent: (event) => {
        void handleInboundMessage(ctx, event, {
          connectionId: plan.primaryConnectionId,
          connectionIds: plan.connectionIds,
        }).catch((error) => {
          ctx.logger.error("处理飞书消息失败", { connectionId: plan.primaryConnectionId, connectionIds: plan.connectionIds, error: String(error) });
          record("error", "处理飞书消息失败", { connectionId: plan.primaryConnectionId, connectionIds: plan.connectionIds, error: String(error) });
        });
      },
      onError: (error) => {
        if (error.message.includes("not found handler")) return;
        ctx.logger.warn("飞书消息监听出现提醒", { connectionId: plan.primaryConnectionId, connectionIds: plan.connectionIds, error: error.message });
        record("warning", "飞书消息监听出现提醒", { connectionId: plan.primaryConnectionId, connectionIds: plan.connectionIds, error: error.message });
      },
      onClose: (code, signal) => {
        if (subscribers.get(plan.primaryConnectionId) === subscriber) {
          subscribers.delete(plan.primaryConnectionId);
        }
        const expectedStop = signal === "SIGTERM" || signal === "SIGINT";
        if (!expectedStop) {
          record("warning", "飞书消息监听已退出", {
            connectionId: plan.primaryConnectionId,
            connectionIds: plan.connectionIds,
            profileName: connection.profileName,
            exitCode: code,
            signalCode: signal,
          });
        }
      },
    });
    subscribers.set(plan.primaryConnectionId, subscriber);
    record("info", "已启动飞书消息监听", {
      connectionId: plan.primaryConnectionId,
      connectionIds: plan.connectionIds,
      profileName: connection.profileName,
      subscriberKey: plan.key,
    });
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
    const subscriberPlanByPrimaryId = new Map(
      planEventSubscribers(config).map((plan) => [plan.primaryConnectionId, plan]),
    );
    const shouldCheckProfiles = config.dryRunCli !== true && getEnabledConnections(config).length > 0;
    const profilesResult = shouldCheckProfiles
      ? await listLarkProfiles(config).catch((error) => ({
        profiles: [] as ProfileRow[],
        error: String(error),
      }))
      : { profiles: [] as ProfileRow[], error: undefined };
    const monitor = buildProductionMonitor(config, {
      availableProfileNames: !shouldCheckProfiles || profilesResult.error
        ? undefined
        : new Set(profilesResult.profiles.map((profile) => profile.name)),
      profileReadError: profilesResult.error ?? null,
    });
    const retryQueue = retryQueueSummary(await readRetryQueue(ctx));
    return {
      pluginId: PLUGIN_ID,
      dryRunCli: config.dryRunCli === true,
      eventSubscriberEnabled: config.enableEventSubscriber === true,
      connectionCount: getEnabledConnections(config).length,
      usableConnectionCount: monitor.usableConnectionCount,
      missingProfileConnectionIds: monitor.missingProfileConnectionIds ?? [],
      profileReadError: monitor.profileReadError ?? null,
      routeCount: (config.routes ?? []).filter((route) => route.enabled !== false).length,
      baseSinkCount: (config.baseSinks ?? []).filter((sink) => sink.enabled !== false).length,
      subscribers: [...subscribers.entries()].map(([connectionId, subscriber]) => ({
        connectionId,
        connectionIds: subscriberPlanByPrimaryId.get(connectionId)?.connectionIds ?? [connectionId],
        profileName: subscriber.profileName,
        pid: subscriber.child.pid ?? null,
        killed: subscriber.child.killed,
        running: subscriber.isRunning(),
      })),
      monitor,
      retryQueue,
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

  ctx.data.register(DATA_KEYS.capabilities, async () => {
    const config = await getConfig(ctx);
    const schemaDiscovery = await discoverLarkCliSchema(config).catch((error) => ({
      checked: false,
      reason: `lark-cli schema 扫描失败：${String(error)}`,
      services: [],
      commands: [],
      errors: [String(error)],
      summary: "lark-cli schema 扫描失败。",
    }) satisfies LarkCliSchemaDiscovery);
    return buildFeishuCapabilityCenter(config, schemaDiscovery);
  });

  ctx.data.register(DATA_KEYS.issueSource, async (params) => {
    const issueId = readString(params.issueId, params.issue_id);
    if (!issueId) return { found: false, reason: "missing_issue_id" };
    const sessionRecord = await findSessionByIssueId(ctx, issueId);
    if (!sessionRecord) return { found: false, sourceKind: null, issueId };

    const config = await getConfig(ctx);
    const session = sessionRecord.data;
    const connection = resolveConnection(config, session.connectionId);
    const route = await resolveRouteFromSession(ctx, config, session, sessionRecord.companyId);
    const message = messageFromSession(session);
    const issue = await ctx.issues.get(session.paperclipIssueId, route.companyId).catch(() => null);
    const comments = await ctx.issues.listComments(session.paperclipIssueId, route.companyId).catch(() => []);
    const conversationName = displayNameOrNull(session.chatName)
      ?? displayNameOrNull(route.chatName)
      ?? legacyIssueLine(issue?.description, "飞书会话");
    const requesterName = displayNameOrNull(session.requesterName)
      ?? legacyIssueLine(issue?.description, "提出人");
    const profilesResult = await listLarkProfiles(config).catch(() => null);
    const connectionProfile = profilesResult?.profiles.find((profile) => profile.name === connection?.profileName);
    const botName = displayNameOrNull(connectionProfile?.botName)
      ?? displayNameOrNull(connection?.botAliases?.[0])
      ?? displayNameOrNull(connection?.name)
      ?? "飞书机器人";
    return {
      found: true,
      sourceKind: "feishu",
      issueId: session.paperclipIssueId,
      issueIdentifier: issue?.identifier ?? session.paperclipIssueIdentifier ?? null,
      issueTitle: issue?.title ?? session.paperclipIssueTitle ?? null,
      entryName: describeRouteEntry(route),
      routeId: route.id,
      botName,
      connectionId: session.connectionId,
      profileName: connection?.profileName ?? null,
      conversationName,
      conversationLabel: conversationName ?? (session.chatId ? "飞书会话（名称待同步）" : null),
      chatId: session.chatId ?? null,
      requesterName,
      requesterOpenId: session.requesterOpenId ?? null,
      messageId: session.lastMessageId,
      rootMessageId: session.rootMessageId ?? null,
      threadId: session.threadId ?? null,
      replyMode: route.replyMode ?? "thread",
      issueUrl: session.paperclipIssueUrl ?? null,
      lastRunId: session.lastRunId ?? null,
      lastRunStatus: session.lastRunStatus ?? null,
      updatedAt: session.updatedAt,
      attachmentCount: session.attachments?.length ?? 0,
      attachments: (session.attachments ?? []).map((attachment) => ({
        filename: attachment.filename ?? null,
        resourceKey: attachment.resourceKey,
        resourceType: attachment.resourceType,
      })),
      recentComments: comments
        .slice()
        .sort((a, b) => commentTime(b) - commentTime(a))
        .slice(0, 5)
        .map((comment) => {
          const body = normalizeCommentBody(comment.body) ?? "";
          return {
            id: comment.id,
            body: truncateText(body, 500),
            authorAgentId: comment.authorAgentId ?? null,
            authorUserId: comment.authorUserId ?? null,
            createdAt: comment.createdAt instanceof Date ? comment.createdAt.toISOString() : comment.createdAt ? String(comment.createdAt) : null,
          };
        }),
    };
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
      bin: larkCliBin(config),
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
      bin: larkCliBin(config),
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
      bin: larkCliBin(config),
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
    const inlineAppSecret = readString(params.appSecret);
    const appSecretRef = readString(params.appSecretRef, params.secretRef);
    const brand = readString(params.brand) === "lark" ? "lark" : "feishu";
    if (!profileName) throw new Error("请填写飞书应用配置名称。");
    if (!appId) throw new Error("请填写飞书 App ID。");
    const appSecret = inlineAppSecret ?? (appSecretRef ? await ctx.secrets.resolve(appSecretRef) : undefined);
    if (!appSecret) throw new Error("请填写飞书 App Secret，或提供 Paperclip Secret Ref。");

    const result = await runLarkCli({
      bin: larkCliBin(config),
      args: buildProfileAddArgs({ name: profileName, appId, brand }),
      stdin: `${appSecret}\n`,
      timeoutMs: 30_000,
    });
    const redactSecret = (value: string): string => value.split(appSecret).join("[redacted]");
    if (!result.ok) {
      const detail = redactSecret([result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n"));
      record("error", "飞书应用绑定失败", {
        profileName,
        appId,
        appSecretRefUsed: Boolean(appSecretRef && !inlineAppSecret),
        result: {
          ok: result.ok,
          dryRun: result.dryRun === true,
          code: result.code,
          stderr: result.stderr.trim() ? truncateText(redactSecret(result.stderr.trim())) : undefined,
          stdout: result.stdout.trim() ? truncateText(redactSecret(result.stdout.trim())) : undefined,
        },
      });
      throw new Error(detail || "lark-cli profile add 执行失败");
    }

    record("info", "飞书应用已绑定到当前运行环境", {
      profileName,
      appId,
      brand,
      appSecretRefUsed: Boolean(appSecretRef && !inlineAppSecret),
    });
    return {
      ok: true,
      profileName,
      appId,
      brand,
      appSecretRefUsed: Boolean(appSecretRef && !inlineAppSecret),
      result: {
        ok: result.ok,
        dryRun: result.dryRun === true,
        code: result.code,
      },
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
      quickReplyRegex: ".+",
      quickReplyText: config.quickReplyText || "ok",
    });
    const raw = testRawForRoute(route, connection);
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

  ctx.actions.register(ACTION_KEYS.checkPermissions, async (params) => {
    const config = await getConfig(ctx);
    const result = await checkFeishuPermissions(config, params);
    await persistPermissionCheck(ctx, config, params, result);
    return result;
  });

  ctx.actions.register(ACTION_KEYS.retryFailedDeliveries, async () => {
    const config = await getConfig(ctx);
    return await retryFailedDeliveries(ctx, config);
  });

  ctx.actions.register(ACTION_KEYS.replyIssueSourceThread, async (params) => {
    const issueId = readString(params.issueId, params.issue_id);
    const text = readString(params.text, params.markdown);
    if (!issueId) throw new Error("请先打开一个由飞书创建的 Paperclip Issue。");
    if (!text) throw new Error("请填写要回复到飞书原线程的内容。");
    return await replyOriginalFeishuThreadFromTool(
      ctx,
      readString(params.runId) ?? `issue-action-${issueId}`,
      { issueId, replyMode: params.replyMode },
      text,
      "issue-action",
      "已回复原飞书会话",
      "reply_source_thread",
    );
  });

  ctx.actions.register(ACTION_KEYS.downloadIssueAttachments, async (params) => {
    const issueId = readString(params.issueId, params.issue_id);
    if (!issueId) throw new Error("请先打开一个由飞书创建的 Paperclip Issue。");
    return await downloadFeishuAttachmentsFromTool(ctx, readString(params.runId) ?? `issue-action-${issueId}`, { issueId });
  });

  ctx.actions.register(ACTION_KEYS.writeIssueBaseRecord, async (params) => {
    const issueId = readString(params.issueId, params.issue_id);
    if (!issueId) throw new Error("请先打开一个由飞书创建的 Paperclip Issue。");
    const sessionRecord = await findSessionByIssueId(ctx, issueId);
    if (!sessionRecord) throw new Error("没有找到这个 Issue 对应的飞书来源，不能自动写入入口配置的多维表格。");

    const config = await getConfig(ctx);
    const route = await resolveRouteFromSession(ctx, config, sessionRecord.data, sessionRecord.companyId);
    const sink = resolveBaseSink(config, readString(params.sinkId) ?? route.baseSinkId);
    if (!sink) throw new Error("这个飞书入口没有配置可用的多维表格规则。请先在高级页配置同步规则。");
    const connection = resolveConnection(config, sink.connectionId ?? sessionRecord.data.connectionId);
    if (!connection) throw new Error("多维表格规则没有找到可用的飞书机器人连接。");
    const disabled = disabledFeishuCapabilityResult(config, "write_base_record", {
      connectionId: connection.id,
      routeId: route.id,
      agentId: sessionRecord.data.paperclipAgentId,
    });
    if (disabled) return disabled;

    const issue = await ctx.issues.get(sessionRecord.data.paperclipIssueId, route.companyId).catch(() => null);
    const message = messageFromSession(sessionRecord.data);
    const extraRecord = typeof params.record === "object" && params.record !== null && !Array.isArray(params.record)
      ? params.record as Record<string, unknown>
      : {};
    const recordJson = {
      ...buildBaseRecord(sink, {
        message,
        route,
        issueId: sessionRecord.data.paperclipIssueId,
        issueRef: issue?.identifier ?? sessionRecord.data.paperclipIssueIdentifier,
        issueUrl: sessionRecord.data.paperclipIssueUrl,
        issueTitle: issue?.title ?? sessionRecord.data.paperclipIssueTitle,
        agentName: route.targetAgentName,
        runId: sessionRecord.data.lastRunId,
        runStatus: sessionRecord.data.lastRunStatus,
      }),
      ...extraRecord,
    };
    const result = await writeBaseRecord(ctx, config, connection, sink, recordJson);
    return result.ok
      ? { content: result.dryRun ? "测试模式：多维表格没有真实写入，命令已生成。" : "多维表格已写入。", data: result }
      : { error: result.stderr || `lark-cli exited with ${result.code}`, data: result };
  });

  ctx.actions.register(ACTION_KEYS.lookupIssueRequester, async (params) => {
    const issueId = readString(params.issueId, params.issue_id);
    if (!issueId) throw new Error("请先打开一个由飞书创建的 Paperclip Issue。");
    const sessionRecord = await findSessionByIssueId(ctx, issueId);
    if (!sessionRecord) throw new Error("没有找到这个 Issue 对应的飞书来源，不能自动查询提出人。");

    const config = await getConfig(ctx);
    const connection = resolveConnection(config, sessionRecord.data.connectionId);
    const disabled = disabledFeishuCapabilityResult(config, "lookup_user", {
      connectionId: connection?.id,
      routeId: sessionRecord.data.routeId,
      agentId: sessionRecord.data.paperclipAgentId,
    });
    if (disabled) return disabled;
    const query = readString(params.query, sessionRecord.data.requesterName, sessionRecord.data.requesterOpenId);
    if (!query) throw new Error("这个飞书来源没有提出人姓名或 open_id，无法查询。");
    const result = await searchFeishuDirectory(config, {
      profileName: connection?.profileName,
      userQuery: query,
    });
    return {
      content: result.userError
        ? `飞书用户查询失败：${result.userError}`
        : result.users.length > 0
          ? `找到 ${result.users.length} 个飞书用户。`
          : "没有找到匹配的飞书用户。",
      data: result,
      error: result.userError,
    };
  });

  ctx.actions.register(ACTION_KEYS.replyIssueCommentToFeishu, async (params) => {
    const issueId = readString(params.issueId, params.issue_id);
    const commentId = readString(params.commentId, params.comment_id);
    if (!issueId) throw new Error("请先打开一个由飞书创建的 Paperclip Issue。");
    if (!commentId) throw new Error("请选择要回复到飞书的评论。");
    const sessionRecord = await findSessionByIssueId(ctx, issueId);
    if (!sessionRecord) throw new Error("没有找到这个 Issue 对应的飞书来源，不能自动回复评论。");
    const config = await getConfig(ctx);
    const route = await resolveRouteFromSession(ctx, config, sessionRecord.data, sessionRecord.companyId);
    const comments = await ctx.issues.listComments(sessionRecord.data.paperclipIssueId, route.companyId);
    const comment = comments.find((item) => item.id === commentId);
    const text = normalizeCommentBody(comment?.body);
    if (!comment || !text) throw new Error("没有找到这条评论，或评论正文为空。");
    return await replyOriginalFeishuThreadFromTool(
      ctx,
      readString(params.runId) ?? `issue-comment-${commentId}`,
      { issueId, replyMode: params.replyMode },
      text,
      "issue-comment",
      "已把评论回复到原飞书会话",
      "reply_source_thread",
    );
  });

  ctx.actions.register(ACTION_KEYS.simulateInboundMessage, async (params) => {
    return await handleInboundMessage(ctx, params.raw ?? params, {
      connectionId: typeof params.connectionId === "string" ? params.connectionId : undefined,
      connectionIds: Array.isArray(params.connectionIds)
        ? params.connectionIds.filter((value): value is string => typeof value === "string" && value.length > 0)
        : undefined,
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
    return await runLarkCli({ bin: larkCliBin(config), args, dryRun: config.dryRunCli === true });
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

async function replyOriginalFeishuThreadFromTool(
  ctx: PluginContext,
  runId: string,
  payload: Record<string, unknown>,
  text: string,
  idempotencyScope: string,
  successVerb: string,
  capabilityKey = "reply_source_thread",
): Promise<ToolResult> {
  const issueId = typeof payload.issueId === "string" ? payload.issueId : undefined;
  const sessionRecord = await findSessionForTool(ctx, runId, issueId);
  if (!sessionRecord) {
    return {
      error: "没有找到当前运行对应的飞书原会话。只有从飞书入口创建的 Paperclip 任务，才能自动回到原会话。",
    };
  }

  const config = await getConfig(ctx);
  const connection = resolveConnection(config, sessionRecord.data.connectionId);
  if (!connection) return { error: "没有找到当前飞书会话对应的机器人连接。" };

  const route = await resolveRouteFromSession(ctx, config, sessionRecord.data, sessionRecord.companyId);
  const disabled = disabledFeishuCapabilityResult(config, capabilityKey, {
    connectionId: connection.id,
    routeId: route.id,
    agentId: sessionRecord.data.paperclipAgentId,
  });
  if (disabled) return disabled;
  const message = messageFromSession(sessionRecord.data);
  const explicitReplyMode = payload.replyMode === "message" || payload.replyMode === "thread"
    ? payload.replyMode
    : undefined;
  const replyInThread = explicitReplyMode
    ? explicitReplyMode === "thread"
    : (route.replyMode ?? "thread") !== "message";
  const result = await replyToFeishu(
    ctx,
    config,
    connection,
    message,
    text,
    larkIdempotencyKey(idempotencyScope, runId, message.messageId, text),
    replyInThread,
    { routeId: route.id, issueId: sessionRecord.data.paperclipIssueId, reason: "Agent 飞书工具回复失败" },
  );
  const conversation = describeFeishuConversation(message, route);
  record(result?.ok ? "info" : "error", "Agent 工具已尝试回复原飞书会话", {
    runId,
    issueId: sessionRecord.data.paperclipIssueId,
    routeName: describeRouteEntry(route),
    conversation,
    result: summarizeLarkResult(result),
  });
  if (!result?.ok) {
    return { error: result?.stderr || `lark-cli exited with ${result?.code ?? "unknown"}`, data: result };
  }
  return {
    content: result.dryRun
      ? `测试模式：${successVerb}（未真实发送）。原飞书会话：${conversation}。`
      : `${successVerb}。原飞书会话：${conversation}。`,
    data: result,
  };
}

async function findSessionForTool(
  ctx: PluginContext,
  runId: string,
  issueId?: string,
): Promise<{ companyId: string; data: FeishuSessionData } | null> {
  return await findSessionByRunId(ctx, runId)
    ?? (issueId ? await findSessionByIssueId(ctx, issueId) : null);
}

async function downloadFeishuAttachmentsFromTool(
  ctx: PluginContext,
  runId: string,
  payload: Record<string, unknown>,
): Promise<ToolResult> {
  const issueId = typeof payload.issueId === "string" ? payload.issueId : undefined;
  const sessionRecord = await findSessionForTool(ctx, runId, issueId);
  if (!sessionRecord) {
    return {
      error: "没有找到当前运行对应的飞书原会话。只有从飞书入口创建的 Paperclip 任务，才能下载原消息附件。",
    };
  }

  const config = await getConfig(ctx);
  const connection = resolveConnection(config, sessionRecord.data.connectionId);
  if (!connection) return { error: "没有找到当前飞书会话对应的机器人连接。" };
  const disabled = disabledFeishuCapabilityResult(config, "download_attachments", {
    connectionId: connection.id,
    routeId: sessionRecord.data.routeId,
    agentId: sessionRecord.data.paperclipAgentId,
  });
  if (disabled) return disabled;

  const message = messageFromSession(sessionRecord.data);
  if (message.attachments.length === 0) {
    return {
      content: "原飞书消息没有可下载附件。",
      data: { attachments: [] },
    };
  }

  const results = await attachFeishuResources(
    ctx,
    config,
    connection,
    message,
    sessionRecord.companyId,
    sessionRecord.data.paperclipIssueId,
  );
  const failedCount = results.filter((item) => item.error).length;
  record(failedCount > 0 ? "warning" : "info", "Agent 工具已处理原飞书附件", {
    runId,
    issueId: sessionRecord.data.paperclipIssueId,
    attachmentCount: results.length,
    failedCount,
  });
  return {
    content: failedCount > 0
      ? `已处理 ${results.length} 个飞书附件，其中 ${failedCount} 个失败。`
      : `已处理 ${results.length} 个飞书附件。`,
    data: { attachments: results },
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const SCHEMA_SERVICE_BY_LARK_CLI_SERVICE: Record<string, string | null> = {
  im: "im",
  drive: "drive",
  docs: "drive",
  calendar: "calendar",
  mail: "mail",
  wiki: "wiki",
  task: "task",
  approval: "approval",
  minutes: "minutes",
  okr: "okr",
  sheets: "sheets",
  slides: "slides",
  vc: "vc",
  attendance: "attendance",
  base: null,
  contact: null,
  schema: null,
};

function splitLarkCliCommand(command: string): {
  cliService: string;
  cliCommand?: string;
} {
  const [cliService = "", cliCommand] = command.split(/\s+/).filter(Boolean);
  return { cliService, cliCommand };
}

function readUpdateNotice(result: LarkCliResult): LarkCliSchemaDiscovery["updateNotice"] {
  const parsed = parseJsonRecord(result.stdout) ?? parseJsonRecord(result.stderr);
  const notice = asRecord(asRecord(parsed?._notice)?.update);
  if (!notice) return null;
  return {
    current: readString(notice.current),
    latest: readString(notice.latest),
    message: readString(notice.message),
  };
}

function parseRootSchemaServices(stdout: string): string[] {
  const parsed = parseJsonRecord(stdout);
  const resources = asRecord(parsed?.resources);
  if (resources) return Object.keys(resources);

  const services = new Set<string>();
  for (const line of stripAnsiText(stdout).split(/\r?\n/)) {
    const match = line.match(/^\s*([a-z][a-z0-9_-]+)\s{2,}/i);
    if (match?.[1] && match[1] !== "Usage") services.add(match[1]);
  }
  return [...services].sort((a, b) => a.localeCompare(b));
}

function inspectSchemaService(stdout: string): {
  methodCount: number;
  scopes: string[];
} {
  const parsed = parseJsonRecord(stdout);
  const resources = asRecord(parsed?.resources);
  if (!resources) return { methodCount: 0, scopes: [] };

  let methodCount = 0;
  const scopes: string[] = [];
  for (const resource of Object.values(resources)) {
    const methods = asRecord(asRecord(resource)?.methods);
    if (!methods) continue;
    for (const method of Object.values(methods)) {
      methodCount += 1;
      const methodScopes = asRecord(method)?.scopes;
      if (Array.isArray(methodScopes)) {
        scopes.push(...methodScopes.filter((scope): scope is string => typeof scope === "string"));
      }
    }
  }
  return { methodCount, scopes: uniqueStrings(scopes) };
}

function schemaDiscoverySkipped(config: FeishuConnectorConfig): LarkCliSchemaDiscovery {
  return {
    checked: false,
    reason: config.dryRunCli === true
      ? "当前是测试模式，能力中心不会自动探测本机 lark-cli。关闭测试模式或配置服务器 CLI 后会显示 schema 扫描结果。"
      : "未执行 lark-cli schema 扫描。",
    services: [],
    commands: [],
    errors: [],
    summary: "未扫描 lark-cli schema。",
  };
}

async function discoverLarkCliSchema(config: FeishuConnectorConfig): Promise<LarkCliSchemaDiscovery> {
  const explicitBin = config.larkCliBin?.trim();
  if (config.dryRunCli === true && (!explicitBin || explicitBin === "lark-cli")) {
    return schemaDiscoverySkipped(config);
  }

  const bin = larkCliBin(config);
  const checkedAt = new Date().toISOString();
  const errors: string[] = [];
  let updateNotice: LarkCliSchemaDiscovery["updateNotice"] = null;

  const root = await runLarkCli({
    bin,
    args: ["schema", "--format", "json"],
    timeoutMs: 5_000,
  });
  updateNotice = readUpdateNotice(root);
  if (!root.ok) errors.push(root.stderr.trim() || `lark-cli schema exited with ${root.code}`);

  const rootServices = new Set(parseRootSchemaServices(root.stdout));
  const commandSpecs = FEISHU_CAPABILITY_DEFINITIONS.flatMap((definition) =>
    definition.larkCliCommands.map((command) => ({
      capabilityKey: definition.key,
      command,
      ...splitLarkCliCommand(command),
      schemaService: SCHEMA_SERVICE_BY_LARK_CLI_SERVICE[splitLarkCliCommand(command).cliService],
    })),
  );
  const schemaServiceNames = uniqueStrings(commandSpecs
    .map((spec) => spec.schemaService)
    .filter((service): service is string => typeof service === "string" && service.length > 0));

  const services: LarkCliSchemaDiscovery["services"] = [];
  const serviceScopes = new Map<string, string[]>();
  for (const service of schemaServiceNames) {
    if (root.ok && rootServices.size > 0 && !rootServices.has(service)) {
      services.push({
        name: service,
        available: false,
        methodCount: 0,
        scopeCount: 0,
        sampleScopes: [],
        error: "当前 lark-cli schema 未列出这个 service。",
      });
      continue;
    }

    const result = await runLarkCli({
      bin,
      args: ["schema", service, "--format", "json"],
      timeoutMs: 8_000,
    });
    updateNotice = updateNotice ?? readUpdateNotice(result);
    if (!result.ok) {
      const error = result.stderr.trim() || result.stdout.trim() || `lark-cli schema ${service} exited with ${result.code}`;
      services.push({
        name: service,
        available: false,
        methodCount: 0,
        scopeCount: 0,
        sampleScopes: [],
        error,
      });
      errors.push(error);
      continue;
    }

    const inspected = inspectSchemaService(result.stdout);
    serviceScopes.set(service, inspected.scopes);
    services.push({
      name: service,
      available: true,
      methodCount: inspected.methodCount,
      scopeCount: inspected.scopes.length,
      sampleScopes: inspected.scopes.slice(0, 12),
    });
  }

  const helpOutputs = new Map<string, LarkCliResult>();
  for (const service of uniqueStrings(commandSpecs.map((spec) => spec.cliService).filter(Boolean))) {
    const args = service === "schema" ? ["schema", "--help"] : [service, "--help"];
    const result = await runLarkCli({ bin, args, timeoutMs: 5_000 });
    updateNotice = updateNotice ?? readUpdateNotice(result);
    helpOutputs.set(service, result);
  }

  const servicesByName = new Map(services.map((service) => [service.name, service]));
  const commands: LarkCliSchemaDiscovery["commands"] = commandSpecs.map((spec) => {
    const help = helpOutputs.get(spec.cliService);
    const cliHelpAvailable = help
      ? help.ok && (!spec.cliCommand || stripAnsiText(help.stdout).includes(spec.cliCommand))
      : null;
    const schemaService = spec.schemaService ?? null;
    const schemaAvailable = schemaService ? servicesByName.get(schemaService)?.available === true : null;
    const scopes = schemaService ? serviceScopes.get(schemaService) ?? [] : [];
    const status = schemaAvailable
      ? "schema_backed"
      : cliHelpAvailable
        ? "cli_help_backed"
        : help || schemaService
          ? "not_found"
          : "not_checked";
    const note = schemaAvailable
      ? `lark-cli schema 已覆盖 service：${schemaService}`
      : cliHelpAvailable
        ? "这是 lark-cli 高阶封装命令，可在 CLI help 中找到；不等同于 Paperclip skill 自动同步。"
        : "当前 CLI/schema 未发现这个命令，可能需要更新 lark-cli 或调整能力映射。";
    return {
      capabilityKey: spec.capabilityKey,
      command: spec.command,
      cliService: spec.cliService,
      cliCommand: spec.cliCommand,
      schemaService,
      schemaAvailable,
      cliHelpAvailable,
      scopes: scopes.slice(0, 12),
      status,
      note,
    };
  });

  const backedCount = commands.filter((command) =>
    command.status === "schema_backed" || command.status === "cli_help_backed"
  ).length;
  return {
    checked: true,
    checkedAt,
    cliBin: bin,
    updateNotice,
    services,
    commands,
    errors,
    summary: `已扫描 lark-cli schema/help：${backedCount}/${commands.length} 个能力命令在当前 CLI 中可发现。lark-* skills 仍不会自动变成 Paperclip tools。`,
  };
}

function isUnsafeLarkCliToken(value: string): boolean {
  return value.includes("\0") || value === "--app-secret" || value === "--app-secret-stdin";
}

function readScopesFromAuthStatus(stdout: string): {
  verified: boolean;
  identity?: string;
  tokenStatus?: string;
  profileName?: string;
  grantedScopes: string[];
} {
  const parsed = parseJsonRecord(stdout) ?? {};
  const scopeText = readString(parsed.scope, parsed.scopes) ?? "";
  return {
    verified: parsed.verified === true,
    identity: readString(parsed.identity),
    tokenStatus: readString(parsed.tokenStatus),
    profileName: readString(parsed.profileName, parsed.profile),
    grantedScopes: uniqueStrings(scopeText.split(/\s+/).filter(Boolean)),
  };
}

function permissionViolationsFromText(value: string): string[] {
  const parsed = parseJsonRecord(value);
  const root = asRecord(parsed?.error) ?? parsed;
  const direct = root?.permission_violations;
  if (Array.isArray(direct)) {
    return uniqueStrings(direct.filter((item): item is string => typeof item === "string"));
  }
  return uniqueStrings([...value.matchAll(/[a-z]+:[a-z0-9_.:-]+/g)].map((match) => match[0]));
}

function recommendedScopesFromConfig(config: FeishuConnectorConfig): string[] {
  const center = buildFeishuCapabilityCenter(config);
  return uniqueStrings([
    ...center.recommendedPermissionJson.scopes.tenant,
    ...center.recommendedPermissionJson.scopes.user,
  ]);
}

function disabledFeishuCapabilityResult(
  config: FeishuConnectorConfig,
  capabilityKey: string,
  context: FeishuCapabilityContext = {},
): ToolResult | null {
  const definition = findFeishuCapabilityDefinition(capabilityKey);
  if (!definition) {
    return { error: `未知的飞书能力：${capabilityKey}。请先在能力中心确认这个能力。` };
  }
  if (!isFeishuCapabilityEnabled(config, definition, context)) {
    return { error: `飞书能力 ${capabilityKey} 未开启。请先到能力中心开启，并确认权限后再调用。` };
  }
  return null;
}

function enabledFeishuToolNames(
  config: FeishuConnectorConfig,
  context: FeishuCapabilityContext = {},
): string[] {
  return uniqueStrings(FEISHU_CAPABILITY_DEFINITIONS
    .filter((definition) => definition.implemented && definition.toolName && isFeishuCapabilityEnabled(config, definition, context))
    .map((definition) => definition.toolName!));
}

async function checkFeishuPermissions(
  config: FeishuConnectorConfig,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const connection = resolveConnection(config, readString(params.connectionId));
  const profileName = connection?.profileName ?? readString(params.profileName);
  if (!profileName) {
    throw new Error("请先选择飞书机器人连接，或提供 lark-cli profile。");
  }

  const args = buildAuthStatusArgs({ profileName, verify: true });
  const result = await runLarkCli({ bin: larkCliBin(config), args, timeoutMs: 30_000 });
  const recommendedScopes = recommendedScopesFromConfig(config);
  if (!result.ok) {
    const missingScopes = permissionViolationsFromText(`${result.stderr}\n${result.stdout}`);
    return {
      ok: false,
      profileName,
      command: result.command,
      args: result.args,
      missingScopes,
      message: missingScopes.length > 0
        ? `缺少飞书权限：${missingScopes.join("、")}。请到飞书开放平台导入推荐权限并重新发布应用；用户身份还需要重新授权。`
        : result.stderr || `lark-cli exited with ${result.code}`,
      result,
    };
  }

  const status = readScopesFromAuthStatus(result.stdout);
  const missingScopes = recommendedScopes.filter((scope) => !status.grantedScopes.includes(scope));
  return {
    ok: missingScopes.length === 0,
    profileName: status.profileName ?? profileName,
    verified: status.verified,
    identity: status.identity,
    tokenStatus: status.tokenStatus,
    grantedScopes: status.grantedScopes,
    recommendedScopes,
    missingScopes,
    message: missingScopes.length > 0
      ? `缺少飞书权限：${missingScopes.join("、")}。请到高级页复制推荐权限 JSON，导入飞书开放平台并重新发布应用；用户身份还需要重新授权。`
      : "权限检查通过：当前 profile 已覆盖能力中心推荐 scopes。",
    result,
  };
}

async function persistPermissionCheck(
  ctx: PluginContext,
  config: FeishuConnectorConfig,
  params: Record<string, unknown>,
  result: Record<string, unknown>,
): Promise<void> {
  const connection = resolveConnection(config, readString(params.connectionId));
  const profileName = readString(result.profileName, params.profileName, connection?.profileName) ?? null;
  const checkedAt = new Date().toISOString();
  const id = `permission-${crypto
    .createHash("sha256")
    .update([connection?.id ?? "", profileName ?? "", checkedAt].join(":"))
    .digest("hex")
    .slice(0, 32)}`;
  await executePluginDb(
    ctx,
    `INSERT INTO ${dbTable(ctx.db.namespace, DB_TABLES.permissionChecks)}
      (id, connection_id, profile_name, ok, missing_scopes, granted_scopes, raw_result, checked_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::timestamptz)`,
    [
      id,
      connection?.id ?? null,
      profileName,
      result.ok === true,
      jsonParam(Array.isArray(result.missingScopes) ? result.missingScopes : []),
      jsonParam(Array.isArray(result.grantedScopes) ? result.grantedScopes : []),
      jsonParam(result),
      checkedAt,
    ],
  );
}

async function runControlledLarkCliCapabilityFromTool(
  ctx: PluginContext,
  runId: string,
  payload: Record<string, unknown>,
): Promise<ToolResult> {
  const capabilityKey = readString(payload.capabilityKey, payload.capability);
  if (!capabilityKey) return { error: "请提供要调用的飞书能力 key。" };
  const definition = findFeishuCapabilityDefinition(capabilityKey);
  if (!definition) return { error: `未知的飞书能力：${capabilityKey}。请先在能力中心确认这个能力。` };

  const config = await getConfig(ctx);
  const connection = resolveConnection(config, readString(payload.connectionId));
  const sessionRecord = await findSessionByRunId(ctx, runId);
  const disabled = disabledFeishuCapabilityResult(config, capabilityKey, {
    connectionId: sessionRecord?.data.connectionId ?? connection?.id,
    routeId: sessionRecord?.data.routeId,
    agentId: sessionRecord?.data.paperclipAgentId,
  });
  if (disabled) return disabled;

  const command = readStringArray(payload.command ?? payload.args);
  if (command.length === 0) return { error: "请提供要运行的 lark-cli 命令参数数组。" };
  if (command.some(isUnsafeLarkCliToken)) {
    return { error: "这个 lark-cli 参数涉及敏感凭据，不能通过 Agent 兜底工具调用。" };
  }
  if (!isLarkCliCommandAllowedForCapability(definition, command)) {
    return {
      error: `命令 ${command.slice(0, 2).join(" ")} 不在能力 ${capabilityKey} 的允许命令里。允许：${definition.larkCliCommands.join("、")}`,
    };
  }

  const profileName = connection?.profileName ?? readString(payload.profileName);
  const args = profileName ? ["--profile", profileName, ...command] : command;
  const result = await runLarkCli({
    bin: larkCliBin(config),
    args,
    dryRun: config.dryRunCli === true,
    timeoutMs: typeof payload.timeoutMs === "number" ? payload.timeoutMs : 60_000,
  });
  record(result.ok ? "info" : "error", "Agent 使用受控 lark-cli 兜底能力", {
    runId,
    capabilityKey,
    command: command.slice(0, 3).join(" "),
    result: summarizeLarkResult(result),
  });
  return result.ok
    ? { content: result.dryRun ? "测试模式：lark-cli 能力未真实执行，命令已生成。" : "lark-cli 能力已执行。", data: result }
    : { error: result.stderr || `lark-cli exited with ${result.code}`, data: result };
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
    async (params, runCtx): Promise<ToolResult> => {
      const config = await getConfig(ctx);
      const payload = params as Record<string, unknown>;
      const connection = resolveConnection(config, typeof payload.connectionId === "string" ? payload.connectionId : undefined);
      if (!connection) return { error: "还没有配置可用的飞书机器人连接。" };
      const disabled = disabledFeishuCapabilityResult(config, "send_message", {
        connectionId: connection.id,
        agentId: runCtx.agentId,
      });
      if (disabled) return disabled;
      const args = buildSendMessageArgs({
        profileName: connection.profileName,
        identity: "bot",
        chatId: typeof payload.chatId === "string" ? payload.chatId : undefined,
        userId: typeof payload.userId === "string" ? payload.userId : undefined,
        text: typeof payload.text === "string" ? payload.text : undefined,
        markdown: typeof payload.markdown === "string" ? payload.markdown : undefined,
      });
      const result = await runLarkCli({ bin: larkCliBin(config), args, dryRun: config.dryRunCli === true });
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
    async (params, runCtx): Promise<ToolResult> => {
      const config = await getConfig(ctx);
      const payload = params as Record<string, unknown>;
      const sink = resolveBaseSink(config, typeof payload.sinkId === "string" ? payload.sinkId : undefined);
      if (!sink) return { error: "没有找到可用的多维表格写入规则。请检查第 3 步里的规则代号是否一致，并确认已启用。" };
      const connection = resolveConnection(config, sink.connectionId);
      if (!connection) return { error: "多维表格写入规则没有找到可用的飞书机器人连接。" };
      const disabled = disabledFeishuCapabilityResult(config, "write_base_record", {
        connectionId: connection.id,
        agentId: runCtx.agentId,
      });
      if (disabled) return disabled;
      const recordJson = typeof payload.record === "object" && payload.record !== null && !Array.isArray(payload.record)
        ? payload.record as Record<string, unknown>
        : {};
      const result = await writeBaseRecord(ctx, config, connection, sink, recordJson);
      return result.ok
        ? { content: result.dryRun ? "测试模式：多维表格没有真实写入，命令已生成。" : "多维表格已写入。", data: result }
        : { error: result.stderr || `lark-cli exited with ${result.code}`, data: result };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.sendCard,
    {
      displayName: "发送飞书卡片",
      description: "通过已配置的飞书机器人发送结构化飞书卡片。",
      parametersSchema: {
        type: "object",
        properties: {
          connectionId: { type: "string", title: "飞书机器人连接代号" },
          chatId: { type: "string", title: "飞书群/会话 chat_id" },
          userId: { type: "string", title: "飞书用户 ID" },
          title: { type: "string", title: "卡片标题" },
          summary: { type: "string", title: "卡片正文摘要" },
          actions: {
            type: "array",
            title: "按钮",
            items: {
              type: "object",
              properties: {
                text: { type: "string", title: "按钮文字" },
                url: { type: "string", title: "按钮链接" },
              },
            },
          },
        },
        required: ["title", "summary"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const config = await getConfig(ctx);
      const payload = params as Record<string, unknown>;
      const connection = resolveConnection(config, readString(payload.connectionId));
      if (!connection) return { error: "还没有配置可用的飞书机器人连接。" };
      const disabled = disabledFeishuCapabilityResult(config, "send_card", {
        connectionId: connection.id,
        agentId: runCtx.agentId,
      });
      if (disabled) return disabled;
      const title = readString(payload.title);
      const summary = readString(payload.summary);
      if (!title || !summary) return { error: "请提供飞书卡片标题和摘要。" };
      const actions = Array.isArray(payload.actions)
        ? payload.actions.filter((item): item is { text?: unknown; url?: unknown } => typeof item === "object" && item !== null)
        : [];
      const args = buildSendMessageArgs({
        profileName: connection.profileName,
        identity: "bot",
        chatId: readString(payload.chatId),
        userId: readString(payload.userId),
        content: buildFeishuCardContent({ title, summary, actions }),
        msgType: "interactive",
      });
      const result = await runLarkCli({ bin: larkCliBin(config), args, dryRun: config.dryRunCli === true });
      return result.ok
        ? { content: result.dryRun ? "测试模式：飞书卡片没有真实发送，命令已生成。" : "飞书卡片已发送。", data: result }
        : { error: result.stderr || `lark-cli exited with ${result.code}`, data: result };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.replyOriginalThread,
    {
      displayName: "回复原飞书会话",
      description: "在飞书创建的 Paperclip 任务中，把智能体的进展或结果回复到原飞书消息线程。",
      parametersSchema: {
        type: "object",
        properties: {
          text: { type: "string", title: "要回复的文本" },
          issueId: { type: "string", title: "Paperclip 任务 ID（可选）" },
          replyMode: {
            type: "string",
            title: "回复方式",
            enum: ["thread", "message"],
          },
        },
        required: ["text"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as Record<string, unknown>;
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) return { error: "请提供要回复到飞书的文本内容。" };
      return await replyOriginalFeishuThreadFromTool(ctx, runCtx.runId, payload, text, "tool", "已回复原飞书会话", "reply_source_thread");
    },
  );

  ctx.tools.register(
    TOOL_NAMES.replySourceThread,
    {
      displayName: "回复飞书来源线程",
      description: "在飞书创建的 Paperclip 任务中，把智能体的进展或结果回复到原飞书消息线程。这个名称是 reply_original_thread 的产品化别名。",
      parametersSchema: {
        type: "object",
        properties: {
          text: { type: "string", title: "要回复的文本" },
          issueId: { type: "string", title: "Paperclip 任务 ID（可选）" },
          replyMode: {
            type: "string",
            title: "回复方式",
            enum: ["thread", "message"],
          },
        },
        required: ["text"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as Record<string, unknown>;
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) return { error: "请提供要回复到飞书的文本内容。" };
      return await replyOriginalFeishuThreadFromTool(ctx, runCtx.runId, payload, text, "tool", "已回复原飞书会话", "reply_source_thread");
    },
  );

  ctx.tools.register(
    TOOL_NAMES.askClarification,
    {
      displayName: "向飞书提出追问",
      description: "任务信息不足时，在原飞书消息线程里向提出人追问。",
      parametersSchema: {
        type: "object",
        properties: {
          question: { type: "string", title: "要追问的问题" },
          issueId: { type: "string", title: "Paperclip 任务 ID（可选）" },
        },
        required: ["question"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as Record<string, unknown>;
      const question = typeof payload.question === "string" ? payload.question.trim() : "";
      if (!question) return { error: "请提供要追问的问题。" };
      const text = question.startsWith("需要补充信息：") ? question : `需要补充信息：${question}`;
      return await replyOriginalFeishuThreadFromTool(ctx, runCtx.runId, payload, text, "clarify", "已向原飞书会话追问", "ask_clarification");
    },
  );

  ctx.tools.register(
    TOOL_NAMES.downloadAttachments,
    {
      displayName: "下载原飞书附件",
      description: "下载创建当前 Paperclip 任务的飞书原消息附件，并挂到 Issue。",
      parametersSchema: {
        type: "object",
        properties: {
          issueId: { type: "string", title: "Paperclip 任务 ID（可选）" },
        },
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as Record<string, unknown>;
      return await downloadFeishuAttachmentsFromTool(ctx, runCtx.runId, payload);
    },
  );

  ctx.tools.register(
    TOOL_NAMES.lookupUser,
    {
      displayName: "查找飞书用户",
      description: "按姓名、工号或关键词查找飞书联系人。",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string", title: "姓名、工号或关键词" },
          connectionId: { type: "string", title: "飞书机器人连接代号（可选）" },
          profileName: { type: "string", title: "lark-cli profile（可选）" },
        },
        required: ["query"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as Record<string, unknown>;
      const query = typeof payload.query === "string" ? payload.query.trim() : "";
      if (!query) return { error: "请提供要查找的飞书用户姓名、工号或关键词。" };

      const config = await getConfig(ctx);
      const connection = resolveConnection(config, typeof payload.connectionId === "string" ? payload.connectionId : undefined);
      const profileName = connection?.profileName ?? readString(payload.profileName);
      const disabled = disabledFeishuCapabilityResult(config, "lookup_user", {
        connectionId: connection?.id,
        agentId: runCtx.agentId,
      });
      if (disabled) return disabled;
      const result = await searchFeishuDirectory(config, { profileName, userQuery: query });
      if (result.userError) {
        return { error: result.userError, data: result };
      }
      return {
        content: result.users.length > 0
          ? `找到 ${result.users.length} 个飞书用户。`
          : "没有找到匹配的飞书用户。",
        data: result,
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.fetchDoc,
    {
      displayName: "读取飞书文档",
      description: "通过 lark-cli 读取飞书云文档内容，并把正文返回给 Agent。",
      parametersSchema: {
        type: "object",
        properties: {
          doc: { type: "string", title: "飞书文档 URL 或 token" },
          connectionId: { type: "string", title: "飞书机器人连接代号（可选）" },
          profileName: { type: "string", title: "lark-cli profile（可选）" },
          identity: {
            type: "string",
            title: "访问身份",
            enum: ["user", "bot"],
            default: "user",
          },
        },
        required: ["doc"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as Record<string, unknown>;
      const doc = readString(payload.doc, payload.url, payload.token);
      if (!doc) return { error: "请提供飞书文档 URL 或 token。" };
      const config = await getConfig(ctx);
      const connection = resolveConnection(config, readString(payload.connectionId));
      const profileName = connection?.profileName ?? readString(payload.profileName);
      const disabled = disabledFeishuCapabilityResult(config, "fetch_doc", {
        connectionId: connection?.id,
        agentId: runCtx.agentId,
      });
      if (disabled) return disabled;
      if (!profileName) return { error: "请先配置飞书机器人连接，或提供可用的 lark-cli profile。" };
      const identity = payload.identity === "bot" ? "bot" : "user";
      const args = buildFetchDocArgs({
        profileName,
        identity,
        doc,
        format: "pretty",
      });
      const result = await runLarkCli({ bin: larkCliBin(config), args, dryRun: config.dryRunCli === true, timeoutMs: 60_000 });
      if (!result.ok) return { error: result.stderr || `lark-cli exited with ${result.code}`, data: result };
      const text = result.stdout.trim();
      return {
        content: result.dryRun ? "测试模式：飞书文档没有真实读取，命令已生成。" : "已读取飞书文档。",
        data: {
          ...result,
          text,
        },
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.runLarkCliCapability,
    {
      displayName: "受控运行 lark-cli 能力",
      description: "高级兜底工具。只能运行能力中心已开启且命令前缀在允许列表里的 lark-cli 能力。",
      parametersSchema: {
        type: "object",
        properties: {
          capabilityKey: { type: "string", title: "能力 key" },
          command: {
            type: "array",
            title: "lark-cli 命令参数数组",
            items: { type: "string" },
          },
          connectionId: { type: "string", title: "飞书机器人连接代号（可选）" },
          profileName: { type: "string", title: "lark-cli profile（可选）" },
          timeoutMs: { type: "number", title: "超时时间毫秒（可选）" },
        },
        required: ["capabilityKey", "command"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      return await runControlledLarkCliCapabilityFromTool(ctx, runCtx.runId, params as Record<string, unknown>);
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

function readIssueIdFromEvent(event: PluginEvent): string | undefined {
  const payload = asRecord(event.payload);
  const issue = asRecord(payload?.issue);
  return readString(
    payload?.issueId,
    payload?.issue_id,
    issue?.id,
    event.entityType === "issue" ? event.entityId : undefined,
  );
}

function isAgentAuthoredComment(
  comment: IssueComment | null,
  session: FeishuSessionData,
  route: ResolvedRouteConfig,
): boolean {
  return !!comment?.authorAgentId &&
    (comment.authorAgentId === route.targetAgentId || comment.authorAgentId === session.paperclipAgentId);
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
    mentions: [],
    attachments: [],
    raw: {
      recoveredFrom: event.eventType,
      runId,
    },
  };
  scheduleTerminalFallbackReply(
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

async function handleIssueCompletionEvent(ctx: PluginContext, event: PluginEvent): Promise<void> {
  const issueId = readIssueIdFromEvent(event);
  if (!issueId) return;

  const sessionRecord = await findSessionByIssueId(ctx, issueId);
  if (!sessionRecord) {
    record("info", "收到 Paperclip 任务事件，但没有对应的飞书会话", {
      eventType: event.eventType,
      issueId,
    });
    return;
  }

  const config = await getConfig(ctx);
  const session = sessionRecord.data;
  const connection = resolveConnection(config, session.connectionId);
  if (!connection) {
    record("warning", "飞书完成回复失败：找不到这个任务对应的机器人", {
      issueId,
      connectionId: session.connectionId,
    });
    return;
  }

  const route = await resolveRouteFromSession(ctx, config, session, sessionRecord.companyId);
  const issue = await ctx.issues.get(issueId, route.companyId).catch(() => null);
  const comments = await ctx.issues.listComments(issueId, route.companyId).catch(() => []);
  const finalComment = latestFinalComment(comments, session, route);
  const agentFinalComment = isAgentAuthoredComment(finalComment, session, route) && looksLikeFinalComment(finalComment?.body);
  const issueDone = issue?.status === "done";
  if (!issueDone && !agentFinalComment) return;

  const message: FeishuInboundMessage = {
    connectionId: session.connectionId,
    messageId: session.lastMessageId,
    chatId: session.chatId,
    threadId: session.threadId,
    rootMessageId: session.rootMessageId,
    senderOpenId: session.requesterOpenId,
    text: issue?.title ?? session.paperclipIssueTitle ?? "Paperclip 任务",
    mentions: [],
    attachments: [],
    raw: {
      recoveredFrom: event.eventType,
      issueId,
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
      runId: session.lastRunId ?? issueId,
      seq: 0,
      eventType: "done",
      stream: "system",
      message: null,
      payload: asRecord(event.payload),
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
  const onIssueDone = async (event: PluginEvent) => {
    record("info", "Observed Paperclip issue event", {
      eventType: event.eventType,
      issueId: readIssueIdFromEvent(event) ?? event.entityId,
    });
    await handleIssueCompletionEvent(ctx, event);
  };
  ctx.events.on("agent.run.finished", onRunDone);
  ctx.events.on("agent.run.failed", onRunDone);
  ctx.events.on("agent.run.cancelled", onRunDone);
  ctx.events.on("issue.updated", onIssueDone);
  ctx.events.on("issue.comment.created", onIssueDone);
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;
    installProcessShutdownHandlers();
    const config = await getConfig(ctx);
    await syncConfigToDatabase(ctx, config);
    await registerDataHandlers(ctx);
    await registerActionHandlers(ctx);
    await registerToolHandlers(ctx);
    await registerEventHandlers(ctx);
    await startConfiguredSubscribers(ctx, config);
    startSubscriberWatchdog(ctx);
    record("info", "飞书连接器已启动", { pluginId: PLUGIN_ID });
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    const ctx = currentContext;
    const config = ctx ? await getConfig(ctx) : normalizeConfig({});
    const shouldCheckProfiles = config.dryRunCli !== true && getEnabledConnections(config).length > 0;
    const profilesResult = shouldCheckProfiles
      ? await listLarkProfiles(config).catch((error) => ({
        profiles: [] as ProfileRow[],
        error: String(error),
      }))
      : { profiles: [] as ProfileRow[], error: undefined };
    const monitor = buildProductionMonitor(config, {
      availableProfileNames: !shouldCheckProfiles || profilesResult.error
        ? undefined
        : new Set(profilesResult.profiles.map((profile) => profile.name)),
      profileReadError: profilesResult.error ?? null,
    });
    return {
      status: monitor.health === "error" ? "error" : monitor.health === "warning" ? "degraded" : "ok",
      message: monitor.message,
      details: {
        dryRunCli: config.dryRunCli === true,
        eventSubscriberEnabled: config.enableEventSubscriber === true,
        enabledConnections: getEnabledConnections(config).length,
        usableConnections: monitor.usableConnectionCount,
        missingProfileConnectionIds: monitor.missingProfileConnectionIds,
        profileReadError: monitor.profileReadError,
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
    await syncConfigToDatabase(ctx, config);
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
    const enabledConnectionIds = new Set(getEnabledConnections(normalized).map((connection) => connection.id));
    const enabledBaseSinkIds = new Set((normalized.baseSinks ?? []).filter((sink) => sink.enabled !== false).map((sink) => sink.id));
    if (normalized.enableEventSubscriber) {
      warnings.push("只有本地测试或单实例部署才建议开启「自动监听飞书消息」。云服务器部署建议用单独的监听服务，避免重复收消息。");
    }
    if (normalized.eventRequireSignature && !normalized.eventEncryptKeyRef) {
      errors.push("已开启公网回调签名校验，但没有填写 Encrypt Key Secret Ref。请先把飞书事件订阅里的 Encrypt Key 存到 Paperclip Secret/Vault。");
    }
    if (!normalized.eventVerificationTokenRef && !normalized.eventEncryptKeyRef) {
      warnings.push("公网 webhook 还没有配置 Verification Token 或 Encrypt Key Secret Ref。生产环境建议至少配置一项，避免外部请求伪造飞书事件。");
    }
    for (const connection of getEnabledConnections(normalized)) {
      if (isTechnicalProfileName(connection.name) && connectionBotAliases(connection).length === 0) {
        warnings.push(`飞书机器人「${connection.name || connection.profileName}」没有填写 @ 名称。飞书没有返回官方机器人名时，@小锐/@锐思 这类多机器人群聊可能无法准确判断。`);
      }
    }
    if (normalized.dryRunCli !== true && getEnabledConnections(normalized).length > 0) {
      const result = await listLarkProfiles(normalized).catch((error) => ({
        profiles: [] as ProfileRow[],
        error: String(error),
      }));
      if (result.error) {
        warnings.push(`无法读取当前运行环境的飞书授权/profile 列表：${result.error}。请确认 lark-cli 可用，否则飞书机器人可能无法监听或回复。`);
      } else {
        const availableProfileNames = new Set(result.profiles.map((profile) => profile.name));
        const routeConnectionIds = new Set((normalized.routes ?? [])
          .filter((route) => route.enabled !== false)
          .map((route) => route.connectionId)
          .filter((connectionId): connectionId is string => typeof connectionId === "string" && connectionId.trim().length > 0));
        for (const connection of getEnabledConnections(normalized)) {
          if (availableProfileNames.has(connection.profileName)) continue;
          const label = connection.name || connection.profileName;
          if (routeConnectionIds.has(connection.id)) {
            errors.push(`入口正在使用飞书机器人「${label}」，但当前运行环境读不到它的授权/profile「${connection.profileName}」。请重新绑定，或把入口换成可运行的机器人。`);
          } else {
            warnings.push(`飞书机器人「${label}」已保留在机器人池里，但当前运行环境读不到它的授权/profile「${connection.profileName}」。如果还要用它，请重新绑定；不用可先停用。`);
          }
        }
      }
    }
    for (const route of normalized.routes ?? []) {
      if (route.enabled === false) continue;
      const entryName = describeRouteEntry(route);
      if (!route.connectionId) {
        errors.push(`入口「${entryName}」没有选择飞书机器人。请在入口里选择一个机器人，避免多个机器人同时处理同一条消息。`);
      } else if (!enabledConnectionIds.has(route.connectionId)) {
        errors.push(`入口「${entryName}」选择的飞书机器人不可用：${route.connectionId}。请重新选择已启用的机器人。`);
      }
      if (!route.companyId && !route.companyRef) errors.push(`入口「${entryName}」缺少公司。请填写公司名称/前缀，或填写公司 ID。`);
      if (route.matchType === "chat" && !route.chatId) errors.push(`入口「${entryName}」选择了群聊/会话，但没有填写飞书 chat_id。`);
      if (route.matchType === "user" && !route.userOpenId) errors.push(`入口「${entryName}」选择了指定用户，但没有填写用户 open_id。`);
      if (route.matchType === "keyword" && !route.keyword?.trim()) errors.push(`入口「${entryName}」选择了关键词，但没有填写关键词。`);
      if (route.matchType === "regex") {
        if (!route.regex?.trim()) {
          errors.push(`入口「${entryName}」选择了高级规则，但没有填写正则表达式。`);
        } else {
          try {
            new RegExp(route.regex);
          } catch (error) {
            errors.push(`入口「${entryName}」的正则表达式不可用：${String(error)}`);
          }
        }
      }
      if (!route.targetAgentId && !route.targetAgentRef && !route.targetAgentName) {
        warnings.push(`入口「${entryName}」没有指定智能体；它只会创建 Paperclip 任务，不会自动交给智能体处理。`);
      }
      if (route.baseSinkId && !enabledBaseSinkIds.has(route.baseSinkId)) {
        errors.push(`入口「${entryName}」引用了不存在的多维表格规则「${route.baseSinkId}」。`);
      }
    }
    for (const sink of normalized.baseSinks ?? []) {
      if (sink.enabled === false) continue;
      if (sink.connectionId && !enabledConnectionIds.has(sink.connectionId)) {
        errors.push(`多维表格规则「${sink.id}」选择的飞书机器人不可用：${sink.connectionId}。`);
      }
    }
    return { ok: errors.length === 0, warnings, errors };
  },

  async onWebhook(input) {
    if (input.endpointKey !== WEBHOOK_KEYS.feishuEvents) {
      throw new Error(`Unsupported Feishu webhook endpoint: ${input.endpointKey}`);
    }
    const ctx = currentContext;
    if (!ctx) throw new Error("飞书连接器还没有启动，暂时无法处理公网回调。");
    const config = await getConfig(ctx);
    const prepared = await prepareWebhookPayload(ctx, config, input);
    const payload = prepared.payload;
    const challenge = readString(payload.challenge);
    const callbackType = readString(payload.type);
    if (challenge && callbackType === "url_verification") {
      record("info", "收到飞书 URL 验证回调", {
        endpointKey: input.endpointKey,
        requestId: input.requestId,
        encrypted: prepared.encrypted,
        tokenVerified: prepared.tokenVerified,
        signatureVerified: prepared.signatureVerified,
        note: "当前 Paperclip webhook 宿主返回固定成功响应；如飞书要求回显 challenge，需要使用宿主支持自定义响应的回调入口。",
      });
      return;
    }

    const result = await handleInboundMessage(ctx, payload, {
      connectionIds: webhookConnectionIds(config, payload),
    });
    record(result.ok ? "info" : "warning", "已通过飞书公网回调处理事件", {
      endpointKey: input.endpointKey,
      requestId: input.requestId,
      encrypted: prepared.encrypted,
      tokenVerified: prepared.tokenVerified,
      signatureVerified: prepared.signatureVerified,
      eventId: readString(asRecord(payload.header)?.event_id, asRecord(payload.header)?.eventId, payload.event_id, payload.eventId),
      appId: webhookAppId(payload),
      result,
    });
  },

  async onApiRequest(input) {
    if (input.routeKey !== API_ROUTE_KEYS.simulateInboundMessage) {
      return { status: 404, body: { error: `Unsupported Feishu connector API route: ${input.routeKey}` } };
    }
    const ctx = currentContext;
    if (!ctx) return { status: 503, body: { error: "飞书连接器还没有启动，暂时无法处理 API 请求。" } };
    const body = asRecord(input.body) ?? {};
    const raw = body.raw ?? body.message ?? body;
    const connectionId = readString(body.connectionId);
    const connectionIds = Array.isArray(body.connectionIds)
      ? body.connectionIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : undefined;
    const result = await handleInboundMessage(ctx, raw, {
      connectionId,
      connectionIds,
    });
    return {
      status: result.ok ? 200 : 422,
      body: {
        ...result,
        apiRoute: API_ROUTE_KEYS.simulateInboundMessage,
        companyId: input.companyId,
      },
    };
  },

  async onShutdown() {
    stopSubscriberWatchdog();
    stopSubscribers();
    record("warning", "飞书连接器正在关闭");
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
