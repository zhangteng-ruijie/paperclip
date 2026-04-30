export const PLUGIN_ID = "paperclipai.feishu-connector";
export const PLUGIN_VERSION = "0.1.0";

export const DATA_KEYS = {
  status: "status",
} as const;

export const ACTION_KEYS = {
  simulateInboundMessage: "simulate-inbound-message",
  sendMessage: "send-message",
  writeBaseRecord: "write-base-record",
} as const;

export const TOOL_NAMES = {
  sendMessage: "feishu.send_message",
  writeBaseRecord: "feishu.write_base_record",
} as const;

export const UI_EXPORTS = {
  dashboardWidget: "DashboardWidget",
} as const;

export const DEFAULT_ACK_TEMPLATE = "已收到，我会交给 {{agent_name}} 处理。";
export const DEFAULT_COMPLETION_TEMPLATE = "任务已完成：{{issue_title}}";
