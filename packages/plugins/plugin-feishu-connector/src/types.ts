export type FeishuIdentity = "bot" | "user";

export interface FeishuConnectionConfig {
  id: string;
  name?: string;
  profileName: string;
  enabled?: boolean;
}

export interface FeishuRouteConfig {
  id: string;
  connectionId?: string;
  enabled?: boolean;
  priority?: number;
  matchType: "chat" | "user" | "keyword" | "regex" | "default";
  chatId?: string;
  userOpenId?: string;
  keyword?: string;
  regex?: string;
  companyId: string;
  projectId?: string;
  targetAgentId?: string;
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
  enableEventSubscriber?: boolean;
  eventTypes?: string;
  ackOnInbound?: boolean;
  ackMessageTemplate?: string;
  completionMessageTemplate?: string;
  connections?: FeishuConnectionConfig[];
  routes?: FeishuRouteConfig[];
  baseSinks?: FeishuBaseSinkConfig[];
}

export interface FeishuInboundMessage {
  connectionId?: string;
  eventId?: string;
  messageId: string;
  chatId?: string;
  threadId?: string;
  rootMessageId?: string;
  senderOpenId?: string;
  senderUserId?: string;
  senderName?: string;
  text: string;
  raw: unknown;
}

export interface FeishuSessionData {
  connectionId: string;
  sessionKey: string;
  chatId?: string;
  rootMessageId?: string;
  threadId?: string;
  requesterOpenId?: string;
  paperclipIssueId: string;
  paperclipAgentId?: string;
  paperclipAgentSessionId?: string;
  lastRunId?: string;
  lastRunStatus?: string;
  lastRunFinishedAt?: string;
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
