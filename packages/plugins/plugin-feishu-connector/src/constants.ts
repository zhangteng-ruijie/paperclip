export const PLUGIN_ID = "paperclipai.feishu-connector";
export const PLUGIN_VERSION = "0.1.0";

export const DATA_KEYS = {
  status: "status",
  catalog: "catalog",
  profiles: "profiles",
  directory: "directory",
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
} as const;

export const TOOL_NAMES = {
  sendMessage: "feishu.send_message",
  writeBaseRecord: "feishu.write_base_record",
} as const;

export const UI_EXPORTS = {
  dashboardWidget: "DashboardWidget",
  settingsPage: "FeishuSettingsPage",
} as const;

export const LEGACY_ACK_TEMPLATE = "已收到，我会交给 {{agent_name}} 处理。";
export const LEGACY_COMPLETION_TEMPLATE = "任务已完成：{{issue_title}}";
export const DEFAULT_ACK_TEMPLATE = "已收到，交给 {{agent_name}} 处理。\n任务：{{issue_ref}}";
export const DEFAULT_COMPLETION_TEMPLATE = "处理完成：{{issue_title}}";
export const DEFAULT_QUICK_REPLY_REGEX = "^(只回复\\s*ok|回复\\s*ok|ping)$";
export const DEFAULT_QUICK_REPLY_TEXT = "ok";
