import {
  DEFAULT_ACK_TEMPLATE,
  DEFAULT_COMPLETION_TEMPLATE,
  DEFAULT_QUICK_REPLY_REGEX,
  DEFAULT_QUICK_REPLY_TEXT,
} from "./constants.js";
import type {
  FeishuBaseSinkConfig,
  FeishuCapabilityConfig,
  FeishuCapabilityScope,
  FeishuConnectionConfig,
  FeishuConnectorConfig,
  FeishuRouteConfig,
} from "./types.js";

const optionalStringKeys = [
  "eventVerificationTokenRef",
  "eventEncryptKeyRef",
] as const;

export const DEFAULT_CONFIG: Required<Pick<
  FeishuConnectorConfig,
  "larkCliBin" | "dryRunCli" | "paperclipBaseUrl" | "enableEventSubscriber" | "eventTypes" | "ackOnInbound" | "ackMessageTemplate" | "completionMessageTemplate"
  | "eventRequireSignature" | "enableQuickReply" | "quickReplyRegex" | "quickReplyText"
>> = {
  larkCliBin: "lark-cli",
  dryRunCli: true,
  paperclipBaseUrl: "",
  enableEventSubscriber: false,
  eventTypes: "im.message.receive_v1",
  eventRequireSignature: false,
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

function normalizeStringList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,，、\n]/g)
      : [];
  return [...new Set(values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))];
}

function normalizeCapabilityScope(value: unknown): FeishuCapabilityScope {
  return value === "bot" || value === "entry" || value === "agent" ? value : "instance";
}

export function normalizeConfig(input: Record<string, unknown> | null | undefined): FeishuConnectorConfig {
  const source = isRecord(input) ? input : {};
  const optionalStrings = Object.fromEntries(optionalStringKeys
    .map((key) => [key, typeof source[key] === "string" ? source[key].trim() : undefined])
    .filter(([, value]) => typeof value === "string" && value.length > 0));
  return {
    ...DEFAULT_CONFIG,
    ...optionalStrings,
    larkCliBin: typeof source.larkCliBin === "string" && source.larkCliBin.trim()
      ? source.larkCliBin.trim()
      : DEFAULT_CONFIG.larkCliBin,
    dryRunCli: typeof source.dryRunCli === "boolean"
      ? source.dryRunCli
      : DEFAULT_CONFIG.dryRunCli,
    paperclipBaseUrl: typeof source.paperclipBaseUrl === "string"
      ? source.paperclipBaseUrl.trim()
      : DEFAULT_CONFIG.paperclipBaseUrl,
    enableEventSubscriber: source.enableEventSubscriber === true,
    eventTypes: typeof source.eventTypes === "string" && source.eventTypes.trim()
      ? source.eventTypes.trim()
      : DEFAULT_CONFIG.eventTypes,
    eventRequireSignature: source.eventRequireSignature === true,
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
    connections: asArray<FeishuConnectionConfig>(source.connections)
      .filter((connection) =>
        typeof connection?.id === "string" &&
        typeof connection?.profileName === "string"
      )
      .map((connection) => ({
        ...connection,
        botAliases: normalizeStringList(connection.botAliases),
      })),
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
    capabilities: asArray<FeishuCapabilityConfig>(source.capabilities)
      .filter((capability) => typeof capability?.key === "string")
      .map((capability) => ({
        ...capability,
        key: capability.key.trim(),
        scope: normalizeCapabilityScope(capability.scope),
      }))
      .filter((capability) => capability.key.length > 0),
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
