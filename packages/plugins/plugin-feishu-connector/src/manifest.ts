import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  PLUGIN_ID,
  PLUGIN_VERSION,
  TOOL_NAMES,
  UI_EXPORTS,
} from "./constants.js";
import { DEFAULT_CONFIG } from "./config.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Feishu Connector",
  description: "Routes Feishu/Lark messages into Paperclip agents through official lark-cli profiles.",
  author: "Paperclip",
  categories: ["connector", "automation"],
  capabilities: [
    "companies.read",
    "projects.read",
    "issues.read",
    "issues.create",
    "issue.comments.read",
    "issue.comments.create",
    "agents.read",
    "agents.invoke",
    "agent.sessions.create",
    "agent.sessions.send",
    "activity.log.write",
    "metrics.write",
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "agent.tools.register",
    "ui.dashboardWidget.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      larkCliBin: {
        type: "string",
        title: "lark-cli binary",
        default: DEFAULT_CONFIG.larkCliBin,
      },
      dryRunCli: {
        type: "boolean",
        title: "Dry-run lark-cli calls",
        default: DEFAULT_CONFIG.dryRunCli,
      },
      enableEventSubscriber: {
        type: "boolean",
        title: "Start event subscriber in this worker",
        default: DEFAULT_CONFIG.enableEventSubscriber,
        description: "Use only for local/single-instance deployments. Cloud deployments should run a singleton sidecar.",
      },
      eventTypes: {
        type: "string",
        title: "Subscribed event types",
        default: DEFAULT_CONFIG.eventTypes,
      },
      ackOnInbound: {
        type: "boolean",
        title: "Reply with acknowledgement when inbound demand is accepted",
        default: DEFAULT_CONFIG.ackOnInbound,
      },
      ackMessageTemplate: {
        type: "string",
        title: "Acknowledgement template",
        default: DEFAULT_CONFIG.ackMessageTemplate,
      },
      completionMessageTemplate: {
        type: "string",
        title: "Completion template",
        default: DEFAULT_CONFIG.completionMessageTemplate,
      },
      connections: {
        type: "array",
        title: "Feishu connections",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            profileName: { type: "string" },
            enabled: { type: "boolean", default: true },
          },
          required: ["id", "profileName"],
        },
        default: [],
      },
      routes: {
        type: "array",
        title: "Inbound routes",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            connectionId: { type: "string" },
            enabled: { type: "boolean", default: true },
            priority: { type: "number", default: 0 },
            matchType: { type: "string", enum: ["chat", "user", "keyword", "regex", "default"] },
            chatId: { type: "string" },
            userOpenId: { type: "string" },
            keyword: { type: "string" },
            regex: { type: "string" },
            companyId: { type: "string" },
            projectId: { type: "string" },
            targetAgentId: { type: "string" },
            targetAgentName: { type: "string" },
            baseSinkId: { type: "string" },
            replyMode: { type: "string", enum: ["none", "message", "thread"], default: "thread" },
          },
          required: ["id", "matchType", "companyId"],
        },
        default: [],
      },
      baseSinks: {
        type: "array",
        title: "Base sinks",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            connectionId: { type: "string" },
            enabled: { type: "boolean", default: true },
            baseToken: { type: "string" },
            tableIdOrName: { type: "string" },
            identity: { type: "string", enum: ["bot", "user"], default: "bot" },
            fieldMap: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          },
          required: ["id", "baseToken", "tableIdOrName"],
        },
        default: [],
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.sendMessage,
      displayName: "Send Feishu Message",
      description: "Send a Feishu message through a configured lark-cli profile.",
      parametersSchema: {
        type: "object",
        properties: {
          connectionId: { type: "string" },
          chatId: { type: "string" },
          userId: { type: "string" },
          text: { type: "string" },
          markdown: { type: "string" },
        },
      },
    },
    {
      name: TOOL_NAMES.writeBaseRecord,
      displayName: "Write Feishu Base Record",
      description: "Write a record to a configured Feishu Base sink.",
      parametersSchema: {
        type: "object",
        properties: {
          sinkId: { type: "string" },
          record: { type: "object" },
        },
        required: ["sinkId", "record"],
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "feishu-connector-status",
        displayName: "Feishu Connector",
        exportName: UI_EXPORTS.dashboardWidget,
      },
    ],
  },
};

export default manifest;
