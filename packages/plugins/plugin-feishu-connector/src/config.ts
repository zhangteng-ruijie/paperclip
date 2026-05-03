import {
  DEFAULT_ACK_TEMPLATE,
  DEFAULT_COMPLETION_TEMPLATE,
  DEFAULT_QUICK_REPLY_REGEX,
  DEFAULT_QUICK_REPLY_TEXT,
} from "./constants.js";
import type {
  FeishuBaseSinkConfig,
  FeishuConnectionConfig,
  FeishuConnectorConfig,
  FeishuRouteConfig,
} from "./types.js";

export const DEFAULT_CONFIG: Required<Pick<
  FeishuConnectorConfig,
  "larkCliBin" | "dryRunCli" | "enableEventSubscriber" | "eventTypes" | "ackOnInbound" | "ackMessageTemplate" | "completionMessageTemplate"
  | "enableQuickReply" | "quickReplyRegex" | "quickReplyText"
>> = {
  larkCliBin: "lark-cli",
  dryRunCli: true,
  enableEventSubscriber: false,
  eventTypes: "im.message.receive_v1",
  ackOnInbound: false,
  ackMessageTemplate: DEFAULT_ACK_TEMPLATE,
  completionMessageTemplate: DEFAULT_COMPLETION_TEMPLATE,
  enableQuickReply: true,
  quickReplyRegex: DEFAULT_QUICK_REPLY_REGEX,
  quickReplyText: DEFAULT_QUICK_REPLY_TEXT,
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeConfig(input: Record<string, unknown> | null | undefined): FeishuConnectorConfig {
  const source = isRecord(input) ? input : {};
  return {
    ...DEFAULT_CONFIG,
    larkCliBin: typeof source.larkCliBin === "string" && source.larkCliBin.trim()
      ? source.larkCliBin.trim()
      : DEFAULT_CONFIG.larkCliBin,
    dryRunCli: typeof source.dryRunCli === "boolean"
      ? source.dryRunCli
      : DEFAULT_CONFIG.dryRunCli,
    enableEventSubscriber: source.enableEventSubscriber === true,
    eventTypes: typeof source.eventTypes === "string" && source.eventTypes.trim()
      ? source.eventTypes.trim()
      : DEFAULT_CONFIG.eventTypes,
    ackOnInbound: source.ackOnInbound === true,
    ackMessageTemplate: typeof source.ackMessageTemplate === "string"
      ? source.ackMessageTemplate
      : DEFAULT_CONFIG.ackMessageTemplate,
    completionMessageTemplate: typeof source.completionMessageTemplate === "string"
      ? source.completionMessageTemplate
      : DEFAULT_CONFIG.completionMessageTemplate,
    enableQuickReply: source.enableQuickReply !== false,
    quickReplyRegex: typeof source.quickReplyRegex === "string" && source.quickReplyRegex.trim()
      ? source.quickReplyRegex.trim()
      : DEFAULT_CONFIG.quickReplyRegex,
    quickReplyText: typeof source.quickReplyText === "string"
      ? source.quickReplyText
      : DEFAULT_CONFIG.quickReplyText,
    connections: asArray<FeishuConnectionConfig>(source.connections).filter((connection) =>
      typeof connection?.id === "string" &&
      typeof connection?.profileName === "string"
    ),
    routes: asArray<FeishuRouteConfig>(source.routes).filter((route) =>
      typeof route?.id === "string" &&
      (typeof route?.companyId === "string" || typeof route?.companyRef === "string") &&
      typeof route?.matchType === "string"
    ),
    baseSinks: asArray<FeishuBaseSinkConfig>(source.baseSinks).filter((sink) =>
      typeof sink?.id === "string" &&
      typeof sink?.baseToken === "string" &&
      typeof sink?.tableIdOrName === "string"
    ),
  };
}

export function getEnabledConnections(config: FeishuConnectorConfig): FeishuConnectionConfig[] {
  return (config.connections ?? []).filter((connection) => connection.enabled !== false);
}

export function resolveConnection(
  config: FeishuConnectorConfig,
  connectionId?: string,
): FeishuConnectionConfig | null {
  const enabled = getEnabledConnections(config);
  if (connectionId) {
    return enabled.find((connection) => connection.id === connectionId) ?? null;
  }
  return enabled[0] ?? null;
}

export function resolveBaseSink(
  config: FeishuConnectorConfig,
  sinkId?: string,
): FeishuBaseSinkConfig | null {
  if (!sinkId) return null;
  return (config.baseSinks ?? []).find((sink) => sink.id === sinkId && sink.enabled !== false) ?? null;
}
