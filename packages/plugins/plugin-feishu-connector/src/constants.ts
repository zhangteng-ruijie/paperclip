export const PLUGIN_ID = "paperclipai.feishu-connector";
export const PLUGIN_VERSION = "0.3.1-connector-feishu";

export const DATA_KEYS = {
  status: "status",
  catalog: "catalog",
  profiles: "profiles",
  directory: "directory",
  issueSource: "issue-source",
  capabilities: "capabilities",
} as const;

export const ACTION_KEYS = {
  simulateInboundMessage: "simulate-inbound-message",
  sendMessage: "send-message",
  writeBaseRecord: "write-base-record",
  bindProfile: "bind-profile",
  startGuidedBind: "start-guided-bind",
  finishGuidedBind: "finish-guided-bind",
  startUserAuth: "start-user-auth",
  finishUserAuth: "finish-user-auth",
  testRoute: "test-route",
  checkPermissions: "check-permissions",
  retryFailedDeliveries: "retry-failed-deliveries",
  replyIssueSourceThread: "reply-issue-source-thread",
  downloadIssueAttachments: "download-issue-attachments",
  writeIssueBaseRecord: "write-issue-base-record",
  lookupIssueRequester: "lookup-issue-requester",
  replyIssueCommentToFeishu: "reply-issue-comment-to-feishu",
} as const;

export const API_ROUTE_KEYS = {
  simulateInboundMessage: "simulate-inbound-message",
} as const;

export const TOOL_NAMES = {
  sendMessage: "feishu.send_message",
  sendCard: "feishu.send_card",
  writeBaseRecord: "feishu.write_base_record",
  downloadAttachments: "feishu.download_attachments",
  replyOriginalThread: "feishu.reply_original_thread",
  replySourceThread: "feishu.reply_source_thread",
  askClarification: "feishu.ask_clarification",
  lookupUser: "feishu.lookup_user",
  fetchDoc: "feishu.fetch_doc",
  runLarkCliCapability: "feishu.run_lark_cli_capability",
} as const;

export const UI_EXPORTS = {
  dashboardWidget: "DashboardWidget",
  sidebarLink: "FeishuSidebarLink",
  sidebarPanel: "FeishuSidebarPanel",
  settingsPage: "FeishuSettingsPage",
  issueTab: "FeishuIssueTab",
  commentReplyAction: "FeishuCommentReplyAction",
} as const;

export const WEBHOOK_KEYS = {
  feishuEvents: "feishu-events",
} as const;

export const LEGACY_ACK_TEMPLATE = "已收到，我会交给 {{agent_name}} 处理。";
export const LEGACY_COMPLETION_TEMPLATE = "任务已完成：{{issue_title}}";
export const DEFAULT_ACK_TEMPLATE = "已收到，交给 {{agent_name}} 处理。\n任务：{{issue_ref}}";
export const DEFAULT_COMPLETION_TEMPLATE = "处理完成：{{issue_title}}";
export const DEFAULT_ESTIMATED_DURATION_LABEL = "3-8 分钟";
export const DEFAULT_QUICK_REPLY_REGEX = "^(只回复\\s*ok|回复\\s*ok|ping)$";
export const DEFAULT_QUICK_REPLY_TEXT = "ok";
