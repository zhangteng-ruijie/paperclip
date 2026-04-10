import type { PaperclipUiLocale } from "@paperclipai/shared";

type CliMessageKey =
  | "program.description"
  | "option.config"
  | "option.dataDir"
  | "command.onboard.description"
  | "command.onboard.yes"
  | "command.onboard.run"
  | "command.doctor.description"
  | "command.doctor.repair"
  | "command.doctor.yes"
  | "command.env.description"
  | "command.configure.description"
  | "command.configure.section"
  | "command.dbBackup.description"
  | "command.dbBackup.dir"
  | "command.dbBackup.retention"
  | "command.dbBackup.prefix"
  | "command.dbBackup.json"
  | "command.allowedHostname.description"
  | "command.allowedHostname.argument"
  | "command.run.description"
  | "command.run.instance"
  | "command.run.repair"
  | "command.run.noRepair"
  | "command.heartbeat.description"
  | "command.heartbeat.run.description"
  | "command.heartbeat.agentId"
  | "command.heartbeat.context"
  | "command.heartbeat.profile"
  | "command.heartbeat.apiBase"
  | "command.heartbeat.apiKey"
  | "command.heartbeat.source"
  | "command.heartbeat.trigger"
  | "command.heartbeat.timeout"
  | "command.heartbeat.json"
  | "command.heartbeat.debug"
  | "command.auth.description"
  | "command.auth.bootstrap.description"
  | "command.auth.bootstrap.force"
  | "command.auth.bootstrap.expires"
  | "command.auth.bootstrap.baseUrl";

const messages: Record<PaperclipUiLocale, Record<CliMessageKey, string>> = {
  en: {
    "program.description": "Paperclip CLI — setup, diagnose, and configure your instance",
    "option.config": "Path to config file",
    "option.dataDir": "Paperclip data directory root (isolates state from ~/.paperclip)",
    "command.onboard.description": "Interactive first-run setup wizard",
    "command.onboard.yes": "Accept defaults (quickstart + start immediately)",
    "command.onboard.run": "Start Paperclip immediately after saving config",
    "command.doctor.description": "Run diagnostic checks on your Paperclip setup",
    "command.doctor.repair": "Attempt to repair issues automatically",
    "command.doctor.yes": "Skip repair confirmation prompts",
    "command.env.description": "Print environment variables for deployment",
    "command.configure.description": "Update configuration sections",
    "command.configure.section": "Section to configure (llm, database, logging, server, storage, secrets)",
    "command.dbBackup.description": "Create a one-off database backup using current config",
    "command.dbBackup.dir": "Backup output directory (overrides config)",
    "command.dbBackup.retention": "Retention window used for pruning",
    "command.dbBackup.prefix": "Backup filename prefix",
    "command.dbBackup.json": "Print backup metadata as JSON",
    "command.allowedHostname.description": "Allow a hostname for authenticated/private mode access",
    "command.allowedHostname.argument": "Hostname to allow (for example dotta-macbook-pro)",
    "command.run.description": "Bootstrap local setup (onboard + doctor) and run Paperclip",
    "command.run.instance": "Local instance id (default: default)",
    "command.run.repair": "Attempt automatic repairs during doctor",
    "command.run.noRepair": "Disable automatic repairs during doctor",
    "command.heartbeat.description": "Heartbeat utilities",
    "command.heartbeat.run.description": "Run one agent heartbeat and stream live logs",
    "command.heartbeat.agentId": "Agent ID to invoke",
    "command.heartbeat.context": "Path to CLI context file",
    "command.heartbeat.profile": "CLI context profile name",
    "command.heartbeat.apiBase": "Base URL for the Paperclip server API",
    "command.heartbeat.apiKey": "Bearer token for agent-authenticated calls",
    "command.heartbeat.source": "Invocation source (timer | assignment | on_demand | automation)",
    "command.heartbeat.trigger": "Trigger detail (manual | ping | callback | system)",
    "command.heartbeat.timeout": "Max time to wait before giving up",
    "command.heartbeat.json": "Output raw JSON where applicable",
    "command.heartbeat.debug": "Show raw adapter stdout/stderr JSON chunks",
    "command.auth.description": "Authentication and bootstrap utilities",
    "command.auth.bootstrap.description": "Create a one-time bootstrap invite URL for first instance admin",
    "command.auth.bootstrap.force": "Create new invite even if admin already exists",
    "command.auth.bootstrap.expires": "Invite expiration window in hours",
    "command.auth.bootstrap.baseUrl": "Public base URL used to print invite link",
  },
  "zh-CN": {
    "program.description": "Paperclip CLI —— 用于初始化、诊断和配置你的实例",
    "option.config": "配置文件路径",
    "option.dataDir": "Paperclip 数据目录根路径（用于隔离 ~/.paperclip 中的状态）",
    "command.onboard.description": "交互式首次启动引导",
    "command.onboard.yes": "接受默认值（快速开始并立即启动）",
    "command.onboard.run": "保存配置后立即启动 Paperclip",
    "command.doctor.description": "对当前 Paperclip 环境执行诊断检查",
    "command.doctor.repair": "尝试自动修复发现的问题",
    "command.doctor.yes": "跳过修复确认提示",
    "command.env.description": "打印部署所需的环境变量",
    "command.configure.description": "更新配置分区",
    "command.configure.section": "要配置的分区（llm、database、logging、server、storage、secrets）",
    "command.dbBackup.description": "使用当前配置创建一次性数据库备份",
    "command.dbBackup.dir": "备份输出目录（覆盖配置中的目录）",
    "command.dbBackup.retention": "用于清理的保留天数窗口",
    "command.dbBackup.prefix": "备份文件名前缀",
    "command.dbBackup.json": "以 JSON 形式输出备份元数据",
    "command.allowedHostname.description": "为 authenticated/private 模式放行一个主机名",
    "command.allowedHostname.argument": "需要放行的主机名（例如 dotta-macbook-pro）",
    "command.run.description": "完成本地初始化（onboard + doctor）并启动 Paperclip",
    "command.run.instance": "本地实例 ID（默认：default）",
    "command.run.repair": "在 doctor 过程中尝试自动修复",
    "command.run.noRepair": "关闭 doctor 阶段的自动修复",
    "command.heartbeat.description": "Heartbeat 相关工具",
    "command.heartbeat.run.description": "执行一次 Agent heartbeat 并输出实时日志",
    "command.heartbeat.agentId": "要调用的 Agent ID",
    "command.heartbeat.context": "CLI context 文件路径",
    "command.heartbeat.profile": "CLI context 配置名称",
    "command.heartbeat.apiBase": "Paperclip 服务端 API 基础地址",
    "command.heartbeat.apiKey": "用于 Agent 鉴权请求的 Bearer Token",
    "command.heartbeat.source": "触发来源（timer | assignment | on_demand | automation）",
    "command.heartbeat.trigger": "触发细节（manual | ping | callback | system）",
    "command.heartbeat.timeout": "放弃前的最大等待时间",
    "command.heartbeat.json": "在适用场景下输出原始 JSON",
    "command.heartbeat.debug": "显示适配器 stdout/stderr 的原始 JSON 分块",
    "command.auth.description": "认证与初始化相关工具",
    "command.auth.bootstrap.description": "为首个实例管理员创建一次性初始化邀请链接",
    "command.auth.bootstrap.force": "即使管理员已存在，也重新创建邀请",
    "command.auth.bootstrap.expires": "邀请过期时间（小时）",
    "command.auth.bootstrap.baseUrl": "打印邀请链接时使用的公开基础地址",
  },
};

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? `{${key}}`));
}

export function resolveCliLocale(raw = process.env.PAPERCLIP_LOCALE): PaperclipUiLocale {
  return raw?.trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function cliT(key: CliMessageKey, values?: Record<string, string | number>): string {
  const locale = resolveCliLocale();
  return interpolate(messages[locale][key] ?? messages.en[key], values);
}
