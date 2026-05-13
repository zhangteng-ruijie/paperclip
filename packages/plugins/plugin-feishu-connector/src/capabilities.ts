import { TOOL_NAMES } from "./constants.js";
import type {
  FeishuCapabilityConfig,
  FeishuCapabilityScope,
  FeishuConnectorConfig,
} from "./types.js";

type CapabilityRisk = "low" | "medium" | "high";
type CapabilityStatus = "enabled" | "missing_permissions" | "disabled" | "planned";

export type CapabilityDefinition = {
  key: string;
  group: string;
  title: string;
  description: string;
  defaultEnabled: boolean;
  implemented: boolean;
  toolName?: string;
  legacyToolName?: string;
  larkCliCommands: string[];
  recommendedScopes: string[];
  relatedSkills: string[];
  risk: CapabilityRisk;
};

export type LarkCliSchemaDiscovery = {
  checked: boolean;
  checkedAt?: string;
  cliBin?: string;
  reason?: string;
  updateNotice?: {
    current?: string;
    latest?: string;
    message?: string;
  } | null;
  services: Array<{
    name: string;
    available: boolean;
    methodCount: number;
    scopeCount: number;
    sampleScopes: string[];
    error?: string;
  }>;
  commands: Array<{
    capabilityKey: string;
    command: string;
    cliService: string;
    cliCommand?: string;
    schemaService?: string | null;
    schemaAvailable: boolean | null;
    cliHelpAvailable: boolean | null;
    scopes: string[];
    status: "schema_backed" | "cli_help_backed" | "not_found" | "not_checked";
    note: string;
  }>;
  errors: string[];
  summary: string;
};

export type FeishuCapabilityContext = {
  connectionId?: string | null;
  routeId?: string | null;
  agentId?: string | null;
};

export const FEISHU_CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  {
    key: "reply_source_thread",
    group: "消息与群聊",
    title: "回复原飞书线程",
    description: "把 Agent 的进展或结果回复到创建 Issue 的原飞书消息线程。",
    defaultEnabled: true,
    implemented: true,
    toolName: TOOL_NAMES.replySourceThread,
    legacyToolName: TOOL_NAMES.replyOriginalThread,
    larkCliCommands: ["im +messages-reply"],
    recommendedScopes: ["im:message:send_as_bot"],
    relatedSkills: ["lark-im"],
    risk: "low",
  },
  {
    key: "send_message",
    group: "消息与群聊",
    title: "发送飞书消息",
    description: "通过已配置机器人向指定飞书会话或用户发送消息。",
    defaultEnabled: true,
    implemented: true,
    toolName: TOOL_NAMES.sendMessage,
    larkCliCommands: ["im +messages-send"],
    recommendedScopes: ["im:message:send_as_bot"],
    relatedSkills: ["lark-im"],
    risk: "medium",
  },
  {
    key: "send_card",
    group: "消息与群聊",
    title: "发送飞书卡片",
    description: "以飞书卡片形式发送结构化结论、按钮和任务状态。",
    defaultEnabled: false,
    implemented: true,
    toolName: TOOL_NAMES.sendCard,
    larkCliCommands: ["im +messages-send"],
    recommendedScopes: ["im:message:send_as_bot"],
    relatedSkills: ["lark-im"],
    risk: "medium",
  },
  {
    key: "ask_clarification",
    group: "消息与群聊",
    title: "向飞书追问",
    description: "任务信息不足时，回到原飞书线程向提出人追问。",
    defaultEnabled: true,
    implemented: true,
    toolName: TOOL_NAMES.askClarification,
    larkCliCommands: ["im +messages-reply"],
    recommendedScopes: ["im:message:send_as_bot"],
    relatedSkills: ["lark-im"],
    risk: "low",
  },
  {
    key: "download_attachments",
    group: "消息与群聊",
    title: "下载原消息附件",
    description: "下载飞书图片、文件、音频或视频，并挂到 Paperclip Issue。",
    defaultEnabled: true,
    implemented: true,
    toolName: TOOL_NAMES.downloadAttachments,
    larkCliCommands: ["im +messages-resources-download"],
    recommendedScopes: ["im:message:readonly", "drive:file:readonly"],
    relatedSkills: ["lark-im", "lark-drive"],
    risk: "medium",
  },
  {
    key: "lookup_user",
    group: "通讯录找人",
    title: "查询飞书用户",
    description: "按姓名、工号、邮箱或关键词解析飞书联系人。",
    defaultEnabled: true,
    implemented: true,
    toolName: TOOL_NAMES.lookupUser,
    larkCliCommands: ["contact +search-user"],
    recommendedScopes: ["contact:user.base:readonly"],
    relatedSkills: ["lark-contact"],
    risk: "medium",
  },
  {
    key: "fetch_doc",
    group: "云文档",
    title: "读取飞书文档",
    description: "读取飞书云文档内容，供 Agent 总结或分析。",
    defaultEnabled: false,
    implemented: true,
    toolName: TOOL_NAMES.fetchDoc,
    larkCliCommands: ["docs +fetch"],
    recommendedScopes: ["docx:document:readonly", "drive:drive:readonly"],
    relatedSkills: ["lark-doc", "lark-drive"],
    risk: "medium",
  },
  {
    key: "write_base_record",
    group: "多维表格",
    title: "写入多维表格",
    description: "把结构化结果写入已配置的飞书 Base 表。",
    defaultEnabled: true,
    implemented: true,
    toolName: TOOL_NAMES.writeBaseRecord,
    larkCliCommands: ["base +record-upsert"],
    recommendedScopes: ["base:app:readonly", "base:record:create", "base:record:update"],
    relatedSkills: ["lark-base"],
    risk: "high",
  },
  {
    key: "calendar_events",
    group: "日历会议",
    title: "日历会议",
    description: "查询、创建或更新飞书日程。默认关闭，后续接入受控日历工具后再按范围开启。",
    defaultEnabled: false,
    implemented: false,
    larkCliCommands: [],
    recommendedScopes: [],
    relatedSkills: ["lark-calendar"],
    risk: "medium",
  },
  {
    key: "approval",
    group: "审批",
    title: "审批",
    description: "查询或处理飞书审批。默认关闭，避免 Agent 误触发高风险流程。",
    defaultEnabled: false,
    implemented: false,
    larkCliCommands: [],
    recommendedScopes: [],
    relatedSkills: ["lark-approval"],
    risk: "high",
  },
  {
    key: "task",
    group: "任务",
    title: "飞书任务",
    description: "创建或更新飞书任务。默认关闭，Paperclip 任务仍是本连接器的主工作对象。",
    defaultEnabled: false,
    implemented: false,
    larkCliCommands: [],
    recommendedScopes: [],
    relatedSkills: ["lark-task"],
    risk: "medium",
  },
  {
    key: "mail",
    group: "邮箱",
    title: "飞书邮箱",
    description: "读取、草拟或发送飞书邮件。默认关闭，需要用户明确授权后再开放。",
    defaultEnabled: false,
    implemented: false,
    larkCliCommands: [],
    recommendedScopes: [],
    relatedSkills: ["lark-mail"],
    risk: "high",
  },
  {
    key: "okr",
    group: "OKR",
    title: "飞书 OKR",
    description: "查询或维护飞书 OKR。默认关闭，后续按管理场景接入。",
    defaultEnabled: false,
    implemented: false,
    larkCliCommands: [],
    recommendedScopes: [],
    relatedSkills: ["lark-okr"],
    risk: "medium",
  },
  {
    key: "minutes",
    group: "飞书妙记",
    title: "飞书妙记",
    description: "查询、读取或下载飞书妙记内容。默认关闭，按会议总结场景开启。",
    defaultEnabled: false,
    implemented: false,
    larkCliCommands: [],
    recommendedScopes: [],
    relatedSkills: ["lark-minutes", "lark-vc"],
    risk: "medium",
  },
  {
    key: "wiki",
    group: "知识库",
    title: "飞书知识库",
    description: "查询知识空间和文档节点。默认关闭，后续接入知识库受控工具。",
    defaultEnabled: false,
    implemented: false,
    larkCliCommands: [],
    recommendedScopes: [],
    relatedSkills: ["lark-wiki"],
    risk: "medium",
  },
  {
    key: "drive_files",
    group: "云空间文件",
    title: "云空间文件",
    description: "管理飞书云空间文件。下载原消息附件已单独实现，这里预留更完整的云空间能力。",
    defaultEnabled: false,
    implemented: false,
    larkCliCommands: [],
    recommendedScopes: [],
    relatedSkills: ["lark-drive"],
    risk: "medium",
  },
  {
    key: "run_lark_cli_capability",
    group: "高级兜底",
    title: "受控运行 lark-cli 能力",
    description: "只允许运行能力中心已开启、已授权、已审计的 lark-cli 命令。",
    defaultEnabled: false,
    implemented: true,
    toolName: TOOL_NAMES.runLarkCliCapability,
    larkCliCommands: ["schema", "api"],
    recommendedScopes: [],
    relatedSkills: ["lark-openapi-explorer", "lark-skill-maker"],
    risk: "high",
  },
];

export function findFeishuCapabilityDefinition(key: string): CapabilityDefinition | null {
  return FEISHU_CAPABILITY_DEFINITIONS.find((definition) => definition.key === key) ?? null;
}

export function isFeishuCapabilityEnabled(
  config: FeishuConnectorConfig,
  definition: CapabilityDefinition,
  context: FeishuCapabilityContext = {},
): boolean {
  const overrides = configuredCapabilities(config, definition.key);
  if (overrides.length === 0) return definition.defaultEnabled;

  const instanceOverride = overrides.find((item) => (item.scope ?? "instance") === "instance");
  const baseEnabled = typeof instanceOverride?.enabled === "boolean"
    ? instanceOverride.enabled
    : definition.defaultEnabled;

  const scopedOverrides = overrides.filter((item) => (item.scope ?? "instance") !== "instance");
  const matchedOverride = scopedOverrides
    .filter((item) => capabilityOverrideMatchesContext(item, context))
    .sort((a, b) => capabilityScopeSpecificity(b.scope) - capabilityScopeSpecificity(a.scope))[0];
  if (matchedOverride && typeof matchedOverride.enabled === "boolean") return matchedOverride.enabled;

  const hasEnabledScopedPolicy = scopedOverrides.some((item) => item.enabled === true && capabilityOverrideHasTarget(item));
  if (hasEnabledScopedPolicy) return false;
  return baseEnabled;
}

export function isLarkCliCommandAllowedForCapability(
  definition: CapabilityDefinition,
  command: string[],
): boolean {
  return definition.larkCliCommands.some((allowed) => {
    const prefix = allowed.split(/\s+/).filter(Boolean);
    return prefix.length > 0 && prefix.every((part, index) => command[index] === part);
  });
}

function configuredCapability(
  config: FeishuConnectorConfig,
  key: string,
): FeishuCapabilityConfig | undefined {
  return (config.capabilities ?? []).find((item) => item.key === key);
}

function configuredCapabilities(
  config: FeishuConnectorConfig,
  key: string,
): FeishuCapabilityConfig[] {
  return (config.capabilities ?? []).filter((item) => item.key === key);
}

function capabilityScopeSpecificity(scope: FeishuCapabilityScope | undefined): number {
  if (scope === "agent") return 4;
  if (scope === "entry") return 3;
  if (scope === "bot") return 2;
  return 1;
}

function capabilityOverrideHasTarget(override: FeishuCapabilityConfig): boolean {
  if (override.scope === "bot") return Boolean(override.connectionId);
  if (override.scope === "entry") return Boolean(override.routeId);
  if (override.scope === "agent") return Boolean(override.agentId);
  return true;
}

function capabilityOverrideMatchesContext(
  override: FeishuCapabilityConfig,
  context: FeishuCapabilityContext,
): boolean {
  if (override.scope === "bot") {
    return Boolean(override.connectionId && context.connectionId && override.connectionId === context.connectionId);
  }
  if (override.scope === "entry") {
    return Boolean(override.routeId && context.routeId && override.routeId === context.routeId);
  }
  if (override.scope === "agent") {
    return Boolean(override.agentId && context.agentId && override.agentId === context.agentId);
  }
  return true;
}

function scopeLabel(scope: FeishuCapabilityScope | undefined): string {
  if (scope === "bot") return "某个机器人开启";
  if (scope === "entry") return "某个入口开启";
  if (scope === "agent") return "某个 Agent 开启";
  return "全实例开启";
}

function capabilityStatus(definition: CapabilityDefinition, enabled: boolean): CapabilityStatus {
  if (!enabled) return "disabled";
  if (!definition.implemented) return "planned";
  if (definition.recommendedScopes.length > 0) return "missing_permissions";
  return "enabled";
}

function statusLabel(status: CapabilityStatus): string {
  if (status === "enabled") return "已开启，可用";
  if (status === "missing_permissions") return "已开启，等待权限动态检查";
  if (status === "planned") return "未开启，工具待接入";
  return "未开启";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function buildRecommendedPermissionJson(capabilities: Array<{
  recommendedScopes: string[];
}>) {
  const allScopes = uniqueSorted(capabilities.flatMap((capability) => capability.recommendedScopes));
  return {
    note: "推荐权限按能力中心生成。审批/任务/邮箱默认关闭，用户在能力中心手动开启后再补对应权限。",
    scopes: {
      tenant: allScopes,
      user: uniqueSorted([
        "contact:user.base:readonly",
        "docx:document:readonly",
        "drive:drive:readonly",
        "drive:file:readonly",
      ].filter((scope) => allScopes.includes(scope) || scope === "contact:user.base:readonly")),
    },
  };
}

export function buildFeishuCapabilityCenter(
  config: FeishuConnectorConfig,
  schemaDiscovery?: LarkCliSchemaDiscovery,
) {
  const commandStatusByCapability = new Map<string, LarkCliSchemaDiscovery["commands"]>();
  for (const command of schemaDiscovery?.commands ?? []) {
    const existing = commandStatusByCapability.get(command.capabilityKey) ?? [];
    existing.push(command);
    commandStatusByCapability.set(command.capabilityKey, existing);
  }

  const capabilities = FEISHU_CAPABILITY_DEFINITIONS.map((definition) => {
    const override = configuredCapability(config, definition.key);
    const enabled = typeof override?.enabled === "boolean"
      ? override.enabled
      : definition.defaultEnabled;
    const status = capabilityStatus(definition, enabled);
    const scope = override?.scope ?? "instance";
    return {
      key: definition.key,
      group: definition.group,
      title: definition.title,
      description: definition.description,
      enabled,
      implemented: definition.implemented,
      status,
      statusLabel: statusLabel(status),
      scope,
      scopeLabel: scopeLabel(scope),
      connectionId: override?.connectionId ?? null,
      routeId: override?.routeId ?? null,
      agentId: override?.agentId ?? null,
      toolName: definition.toolName ?? null,
      legacyToolName: definition.legacyToolName ?? null,
      larkCliCommands: definition.larkCliCommands,
      schemaCommands: commandStatusByCapability.get(definition.key) ?? [],
      recommendedScopes: definition.recommendedScopes,
      relatedSkills: definition.relatedSkills,
      risk: definition.risk,
    };
  });
  const groups = [...new Set(capabilities.map((capability) => capability.group))]
    .map((group) => ({
      name: group,
      capabilities: capabilities.filter((capability) => capability.group === group),
    }));

  return {
    summary: "能力中心把飞书 API 能力映射成 Paperclip 受控工具；Agent 只能调用插件注册的工具，不能裸跑 lark-cli。",
    syncPolicy: {
      cliAutoBundled: true,
      larkSkillsAutoSynced: false,
      paperclipSkillsAutoSynced: false,
      text: "更新 lark-cli 不会自动同步 lark-* skills 到 Paperclip skill。lark-* skills 是本地 Agent 的使用说明，Paperclip skill/工具需要由插件显式注册或单独同步。",
    },
    relationship: {
      larkCli: "runtime_api_client",
      larkSkills: "local_agent_instructions",
      paperclipTools: "controlled_plugin_tools",
    },
    schemaDiscovery: schemaDiscovery ?? {
      checked: false,
      reason: "未执行 lark-cli schema 扫描。测试模式下不会自动探测本机 CLI，避免单元测试或离线环境误调用外部命令。",
      services: [],
      commands: [],
      errors: [],
      summary: "未扫描 lark-cli schema。",
    },
    recommendedPermissionJson: buildRecommendedPermissionJson(capabilities),
    permissionStrategy: "权限缺口优先通过 lark-cli schema、lark-cli auth scopes 或飞书官方权限状态 API 动态检查；这里的 scopes 只是推荐导入清单。",
    capabilities,
    groups,
  };
}
