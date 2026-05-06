export type FeishuIdentity = "bot" | "user";

export interface FeishuConnectionConfig {
  id: string;
  name?: string;
  botAliases?: string[];
  profileName: string;
  appId?: string;
  enabled?: boolean;
}

export interface FeishuRouteConfig {
  id: string;
  name?: string;
  connectionId?: string;
  enabled?: boolean;
  priority?: number;
  matchType: "chat" | "user" | "keyword" | "regex" | "default";
  chatId?: string;
  chatName?: string;
  userOpenId?: string;
  userName?: string;
  keyword?: string;
  regex?: string;
  companyId?: string;
  companyRef?: string;
  projectId?: string;
  targetAgentId?: string;
  targetAgentRef?: string;
  targetAgentName?: string;
  baseSinkId?: string;
  replyMode?: "none" | "message" | "thread";
  createIssue?: boolean;
}

export interface FeishuBaseSinkConfig {
  id: string;
  connectionId?: string;
  enabled?: boolean;
  baseToken: string;
  tableIdOrName: string;
  identity?: FeishuIdentity;
  fieldMap?: Record<string, string>;
}

export interface FeishuConnectorConfig {
  larkCliBin?: string;
  dryRunCli?: boolean;
  paperclipBaseUrl?: string;
  enableEventSubscriber?: boolean;
  eventTypes?: string;
  ackOnInbound?: boolean;
  ackMessageTemplate?: string;
  completionMessageTemplate?: string;
  enableQuickReply?: boolean;
  quickReplyRegex?: string;
  quickReplyText?: string;
  connections?: FeishuConnectionConfig[];
  routes?: FeishuRouteConfig[];
  baseSinks?: FeishuBaseSinkConfig[];
}

export interface FeishuInboundMessage {
  connectionId?: string;
  eventId?: string;
  messageId: string;
  messageType?: string;
  chatId?: string;
  chatName?: string;
  threadId?: string;
  rootMessageId?: string;
  senderOpenId?: string;
  senderUserId?: string;
  senderName?: string;
  senderType?: string;
  senderAppId?: string;
  text: string;
  mentions: FeishuMention[];
  attachments: FeishuInboundAttachment[];
  raw: unknown;
}

export interface FeishuMention {
  name?: string;
  openId?: string;
  userId?: string;
  appId?: string;
  key?: string;
}

export interface FeishuInboundAttachment {
  resourceKey: string;
  resourceType: "image" | "file" | "audio" | "video";
  filename?: string;
}

export interface FeishuSessionData {
  connectionId: string;
  sessionKey: string;
  routeId?: string;
  chatId?: string;
  rootMessageId?: string;
  threadId?: string;
  requesterOpenId?: string;
  paperclipIssueId: string;
  paperclipIssueIdentifier?: string;
  paperclipIssueTitle?: string;
  paperclipIssueUrl?: string;
  paperclipAgentId?: string;
  paperclipAgentSessionId?: string;
  lastRunId?: string;
  lastRunStatus?: string;
  lastRunFinishedAt?: string;
  lastCompletionReplyKey?: string;
  createdAt?: string;
  lastMessageId: string;
  updatedAt: string;
}

export interface LarkCliResult {
  ok: boolean;
  dryRun?: boolean;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  code: number | null;
}
