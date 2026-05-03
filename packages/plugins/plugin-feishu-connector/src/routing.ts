import type {
  FeishuBaseSinkConfig,
  FeishuConnectorConfig,
  FeishuInboundAttachment,
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

function collectAttachments(value: unknown, out: FeishuInboundAttachment[] = []): FeishuInboundAttachment[] {
  if (Array.isArray(value)) {
    for (const item of value) collectAttachments(item, out);
    return out;
  }

  const record = asRecord(value);
  if (!record) return out;

  const imageKey = readString(record.image_key, record.imageKey);
  if (imageKey) {
    out.push({
      resourceKey: imageKey,
      resourceType: "image",
      filename: readString(record.file_name, record.fileName, record.name, record.title),
    });
  }

  const fileKey = readString(record.file_key, record.fileKey);
  if (fileKey) {
    out.push({
      resourceKey: fileKey,
      resourceType: "file",
      filename: readString(record.file_name, record.fileName, record.name, record.title),
    });
  }

  const audioKey = readString(record.audio_key, record.audioKey);
  if (audioKey) {
    out.push({
      resourceKey: audioKey,
      resourceType: "audio",
      filename: readString(record.file_name, record.fileName, record.name, record.title),
    });
  }

  const videoKey = readString(record.video_key, record.videoKey);
  if (videoKey) {
    out.push({
      resourceKey: videoKey,
      resourceType: "video",
      filename: readString(record.file_name, record.fileName, record.name, record.title),
    });
  }

  for (const child of Object.values(record)) collectAttachments(child, out);
  return out;
}

function parsePlaceholderAttachments(text: string): FeishuInboundAttachment[] {
  const attachments: FeishuInboundAttachment[] = [];
  const patterns: Array<[RegExp, FeishuInboundAttachment["resourceType"]]> = [
    [/\[Image:\s*([^\]\s]+)\]/gi, "image"],
    [/\[File:\s*([^\]\s]+)\]/gi, "file"],
    [/\[Audio:\s*([^\]\s]+)\]/gi, "audio"],
    [/\[Video:\s*([^\]\s]+)\]/gi, "video"],
    [/<(image|file|audio|video)\s+key=["']?([^"'\s>]+)["']?[^>]*>/gi, "file"],
  ];
  for (const [pattern, fallbackType] of patterns) {
    for (const match of text.matchAll(pattern)) {
      const xmlType = match[1]?.toLowerCase();
      const key = match[2] ?? match[1];
      if (!key) continue;
      const resourceType = xmlType === "image" || xmlType === "file" || xmlType === "audio" || xmlType === "video"
        ? xmlType
        : fallbackType;
      attachments.push({ resourceKey: key, resourceType });
    }
  }
  return attachments;
}

function dedupeAttachments(attachments: FeishuInboundAttachment[]): FeishuInboundAttachment[] {
  const seen = new Set<string>();
  const out: FeishuInboundAttachment[] = [];
  for (const attachment of attachments) {
    const key = `${attachment.resourceType}:${attachment.resourceKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(attachment);
  }
  return out;
}

function extractTextFromContent(content: unknown): string | undefined {
  if (typeof content !== "string") return readString(content);
  const parsed = parseJsonRecord(content);
  if (!parsed) return content;
  const text = readString(parsed.text, parsed.content, parsed.title);
  if (text) return text;
  return undefined;
}

function attachmentSummary(attachments: FeishuInboundAttachment[]): string {
  if (attachments.length === 0) return "";
  return attachments.map((attachment) => {
    const label = attachment.resourceType === "image"
      ? "图片"
      : attachment.resourceType === "audio"
        ? "音频"
        : attachment.resourceType === "video"
          ? "视频"
          : "文件";
    return `[${label}：${attachment.filename ?? attachment.resourceKey}]`;
  }).join(" ");
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
    throw new Error("飞书消息事件缺少 message_id，无法识别是哪条消息。");
  }

  const rawText = readString(
    root.text,
    root.message_text,
    root.messageText,
    message.text,
    extractTextFromContent(message.content),
  ) ?? "";
  const contentRecord = parseJsonRecord(message.content);
  const attachments = dedupeAttachments([
    ...collectAttachments(contentRecord ?? message.content),
    ...parsePlaceholderAttachments(rawText),
  ]);
  const text = rawText || attachmentSummary(attachments);

  return {
    connectionId: readString(root.connectionId, fallbackConnectionId),
    eventId,
    messageId,
    messageType: readString(root.message_type, root.messageType, message.message_type, message.messageType),
    chatId: readString(root.chat_id, root.chatId, message.chat_id, message.chatId),
    threadId: readString(root.thread_id, root.threadId, message.thread_id, message.threadId),
    rootMessageId: readString(root.root_id, root.rootId, message.root_id, message.rootId),
    senderOpenId: readString(root.sender_open_id, root.senderOpenId, senderId.open_id, senderId.openId),
    senderUserId: readString(root.sender_user_id, root.senderUserId, senderId.user_id, senderId.userId),
    senderName: readString(root.sender_name, root.senderName, sender.name, sender.sender_name),
    text,
    attachments,
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
  if (route.matchType === "keyword") {
    const keyword = route.keyword?.trim();
    return !!keyword && message.text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
  }
  if (route.matchType === "regex") {
    if (!route.regex) return false;
    try {
      return new RegExp(route.regex, "i").test(message.text);
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
  if (!text) return "飞书需求";
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export function describeRouteTrigger(route: FeishuRouteConfig): string {
  if (route.matchType === "chat") {
    return route.chatName ? `指定飞书会话「${route.chatName}」` : "指定飞书会话";
  }
  if (route.matchType === "user") {
    return route.userName ? `指定提出人「${route.userName}」` : "指定提出人";
  }
  if (route.matchType === "keyword") {
    return route.keyword ? `消息包含「${route.keyword}」` : "消息包含关键词";
  }
  if (route.matchType === "regex") {
    return route.regex ? `正则匹配「${route.regex}」` : "正则匹配";
  }
  return "默认入口";
}

export function describeFeishuConversation(
  message: FeishuInboundMessage,
  route?: FeishuRouteConfig,
): string {
  const name = message.chatName ?? route?.chatName ?? route?.userName;
  if (name && message.chatId) return `${name}（${message.chatId}）`;
  if (name) return name;
  if (message.chatId) return message.chatId;
  if (message.senderName) return `来自 ${message.senderName} 的单聊`;
  return "未知飞书会话";
}

export function feishuContextLines(
  message: FeishuInboundMessage,
  route?: FeishuRouteConfig,
): string[] {
  const sender = message.senderName ?? message.senderOpenId ?? message.senderUserId ?? "unknown";
  const lines = [
    "来源：飞书",
    route ? `接收入口：${route.id}（${describeRouteTrigger(route)}）` : undefined,
    `飞书会话：${describeFeishuConversation(message, route)}`,
    `提出人：${sender}`,
    `飞书消息：${message.messageId}`,
  ];
  if (message.rootMessageId && message.rootMessageId !== message.messageId) {
    lines.push(`飞书话题根消息：${message.rootMessageId}`);
  }
  if (
    message.threadId &&
    message.threadId !== message.messageId &&
    message.threadId !== message.rootMessageId
  ) {
    lines.push(`飞书线程：${message.threadId}`);
  }
  return lines.filter((line): line is string => typeof line === "string" && line.length > 0);
}

export function createIssueDescription(message: FeishuInboundMessage, route: FeishuRouteConfig): string {
  const lines = [
    message.text.trim() || "（空飞书消息）",
    "",
    "---",
    ...feishuContextLines(message, route),
  ];
  if (message.attachments.length > 0) {
    lines.push("");
    lines.push("附件：");
    for (const attachment of message.attachments) {
      lines.push(`- ${attachment.filename ?? attachment.resourceKey}（${attachment.resourceType}）`);
    }
  }
  return lines.join("\n");
}

export function createCommentBody(message: FeishuInboundMessage, route?: FeishuRouteConfig): string {
  const sender = message.senderName ?? message.senderOpenId ?? message.senderUserId ?? "unknown";
  const lines = [
    `飞书后续消息，来自 ${sender}：`,
    "",
    message.text.trim() || "（空飞书消息）",
    "",
    ...feishuContextLines(message, route),
  ];
  if (message.attachments.length > 0) {
    lines.push("", "附件：");
    for (const attachment of message.attachments) {
      lines.push(`- ${attachment.filename ?? attachment.resourceKey}（${attachment.resourceType}）`);
    }
  }
  return lines.join("\n");
}

export interface TemplateContext {
  message: FeishuInboundMessage;
  route?: FeishuRouteConfig;
  issueId?: string;
  issueRef?: string;
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
    "issue_ref": context.issueRef ?? context.issueId ?? "",
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
