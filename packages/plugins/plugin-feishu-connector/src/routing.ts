import type {
  FeishuBaseSinkConfig,
  FeishuConnectorConfig,
  FeishuInboundMessage,
  FeishuRouteConfig,
} from "./types.js";

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

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function extractTextFromContent(content: unknown): string | undefined {
  if (typeof content !== "string") return readString(content);
  const parsed = parseJsonRecord(content);
  if (!parsed) return content;
  const text = readString(parsed.text, parsed.content, parsed.title);
  if (text) return text;
  return content;
}

export function extractInboundMessage(raw: unknown, fallbackConnectionId?: string): FeishuInboundMessage {
  const root = asRecord(raw) ?? {};
  const event = asRecord(root.event) ?? root;
  const header = asRecord(root.header) ?? {};
  const message = asRecord(event.message) ?? asRecord(root.message) ?? root;
  const sender = asRecord(event.sender) ?? asRecord(root.sender) ?? {};
  const senderId = asRecord(sender.sender_id) ?? asRecord(sender.senderId) ?? sender;

  const eventId = readString(root.event_id, root.eventId, header.event_id, header.eventId);
  const messageId = readString(root.message_id, root.messageId, message.message_id, message.messageId);
  if (!messageId) {
    throw new Error("Feishu message event is missing message_id");
  }

  const text = readString(
    root.text,
    root.message_text,
    root.messageText,
    message.text,
    extractTextFromContent(message.content),
  ) ?? "";

  return {
    connectionId: readString(root.connectionId, fallbackConnectionId),
    eventId,
    messageId,
    chatId: readString(root.chat_id, root.chatId, message.chat_id, message.chatId),
    threadId: readString(root.thread_id, root.threadId, message.thread_id, message.threadId),
    rootMessageId: readString(root.root_id, root.rootId, message.root_id, message.rootId),
    senderOpenId: readString(root.sender_open_id, root.senderOpenId, senderId.open_id, senderId.openId),
    senderUserId: readString(root.sender_user_id, root.senderUserId, senderId.user_id, senderId.userId),
    senderName: readString(root.sender_name, root.senderName, sender.name, sender.sender_name),
    text,
    raw,
  };
}

export function buildSessionKey(message: FeishuInboundMessage, connectionId: string): string {
  const chat = message.chatId ?? "direct";
  const root = message.threadId ?? message.rootMessageId ?? message.messageId;
  return `feishu:${connectionId}:${chat}:root:${root}`;
}

function routeMatches(route: FeishuRouteConfig, message: FeishuInboundMessage, connectionId: string): boolean {
  if (route.enabled === false) return false;
  if (route.connectionId && route.connectionId !== connectionId) return false;
  if (route.matchType === "chat") return !!route.chatId && route.chatId === message.chatId;
  if (route.matchType === "user") return !!route.userOpenId && route.userOpenId === message.senderOpenId;
  if (route.matchType === "keyword") return !!route.keyword && message.text.includes(route.keyword);
  if (route.matchType === "regex") {
    if (!route.regex) return false;
    try {
      return new RegExp(route.regex).test(message.text);
    } catch {
      return false;
    }
  }
  return route.matchType === "default";
}

export function resolveRoute(
  config: FeishuConnectorConfig,
  message: FeishuInboundMessage,
  connectionId: string,
): FeishuRouteConfig | null {
  const routes = [...(config.routes ?? [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return routes.find((route) => routeMatches(route, message, connectionId)) ?? null;
}

export function createIssueTitle(message: FeishuInboundMessage): string {
  const text = message.text.replace(/\s+/g, " ").trim();
  if (!text) return "Feishu demand";
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export function createIssueDescription(message: FeishuInboundMessage, route: FeishuRouteConfig): string {
  const sender = message.senderName ?? message.senderOpenId ?? message.senderUserId ?? "unknown";
  const lines = [
    message.text.trim() || "(empty Feishu message)",
    "",
    "---",
    `Source: Feishu`,
    `Route: ${route.id}`,
    `Sender: ${sender}`,
  ];
  if (message.chatId) lines.push(`Chat: ${message.chatId}`);
  lines.push(`Message: ${message.messageId}`);
  return lines.join("\n");
}

export function createCommentBody(message: FeishuInboundMessage): string {
  const sender = message.senderName ?? message.senderOpenId ?? message.senderUserId ?? "unknown";
  return [
    `Feishu reply from ${sender}:`,
    "",
    message.text.trim() || "(empty Feishu message)",
    "",
    `Feishu message: ${message.messageId}`,
  ].join("\n");
}

export interface TemplateContext {
  message: FeishuInboundMessage;
  route?: FeishuRouteConfig;
  issueId?: string;
  issueTitle?: string;
  agentName?: string;
  runId?: string;
  runStatus?: string;
}

export function renderTemplate(template: string, context: TemplateContext): string {
  const values: Record<string, string> = {
    "message.text": context.message.text,
    "message.id": context.message.messageId,
    "message.chat_id": context.message.chatId ?? "",
    "sender.open_id": context.message.senderOpenId ?? "",
    "sender.name": context.message.senderName ?? context.message.senderOpenId ?? "",
    "route.id": context.route?.id ?? "",
    "issue_id": context.issueId ?? "",
    "issue_title": context.issueTitle ?? "",
    "agent_name": context.agentName ?? context.route?.targetAgentName ?? "agent",
    "run_id": context.runId ?? "",
    "run_status": context.runStatus ?? "",
  };
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => values[key.trim()] ?? "");
}

export function buildBaseRecord(
  sink: FeishuBaseSinkConfig,
  context: TemplateContext,
): Record<string, string> {
  const defaultMap: Record<string, string> = {
    "需求标题": "{{issue_title}}",
    "原始需求": "{{message.text}}",
    "提出人": "{{sender.name}}",
    "提出人 open_id": "{{sender.open_id}}",
    "飞书 chat_id": "{{message.chat_id}}",
    "飞书 message_id": "{{message.id}}",
    "Paperclip issue_id": "{{issue_id}}",
    "绑定 agent": "{{agent_name}}",
    "状态": "待处理",
    "来源": "飞书",
  };
  const fieldMap = sink.fieldMap && Object.keys(sink.fieldMap).length > 0 ? sink.fieldMap : defaultMap;
  return Object.fromEntries(
    Object.entries(fieldMap).map(([field, template]) => [field, renderTemplate(template, context)]),
  );
}
