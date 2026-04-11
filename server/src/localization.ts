import type { PaperclipUiLocale } from "@paperclipai/shared";

type ServerMessageKey =
  | "startup.mode"
  | "startup.deploy"
  | "startup.bind"
  | "startup.auth"
  | "startup.server"
  | "startup.api"
  | "startup.apiHealth"
  | "startup.ui"
  | "startup.database"
  | "startup.migrations"
  | "startup.agentJwt"
  | "startup.heartbeat"
  | "startup.dbBackup"
  | "startup.backupDir"
  | "startup.config"
  | "startup.ready"
  | "startup.notReady"
  | "startup.disabled"
  | "startup.requestedPort"
  | "startup.embeddedPostgres"
  | "startup.externalPostgres"
  | "startup.viteDev"
  | "startup.staticUi"
  | "startup.headlessApi"
  | "startup.dbPort"
  | "startup.agentJwt.set"
  | "startup.agentJwt.foundNotLoaded"
  | "startup.agentJwt.missing";

const messages: Record<PaperclipUiLocale, Record<ServerMessageKey, string>> = {
  en: {
    "startup.mode": "Mode",
    "startup.deploy": "Deploy",
    "startup.bind": "Bind",
    "startup.auth": "Auth",
    "startup.server": "Server",
    "startup.api": "API",
    "startup.apiHealth": "health: {url}",
    "startup.ui": "UI",
    "startup.database": "Database",
    "startup.migrations": "Migrations",
    "startup.agentJwt": "Agent JWT",
    "startup.heartbeat": "Heartbeat",
    "startup.dbBackup": "DB Backup",
    "startup.backupDir": "Backup Dir",
    "startup.config": "Config",
    "startup.ready": "ready",
    "startup.notReady": "not-ready",
    "startup.disabled": "disabled",
    "startup.requestedPort": "(requested {port})",
    "startup.embeddedPostgres": "embedded-postgres",
    "startup.externalPostgres": "external-postgres",
    "startup.viteDev": "vite-dev-middleware",
    "startup.staticUi": "static-ui",
    "startup.headlessApi": "headless-api",
    "startup.dbPort": "(pg:{port})",
    "startup.agentJwt.set": "set",
    "startup.agentJwt.foundNotLoaded": "found in {path} but not loaded",
    "startup.agentJwt.missing": "missing (run `pnpm paperclipai onboard`)",
  },
  "zh-CN": {
    "startup.mode": "模式",
    "startup.deploy": "部署",
    "startup.bind": "绑定",
    "startup.auth": "认证",
    "startup.server": "服务",
    "startup.api": "API",
    "startup.apiHealth": "健康检查：{url}",
    "startup.ui": "界面",
    "startup.database": "数据库",
    "startup.migrations": "迁移",
    "startup.agentJwt": "Agent JWT",
    "startup.heartbeat": "心跳调度",
    "startup.dbBackup": "数据库备份",
    "startup.backupDir": "备份目录",
    "startup.config": "配置文件",
    "startup.ready": "就绪",
    "startup.notReady": "未就绪",
    "startup.disabled": "已关闭",
    "startup.requestedPort": "（请求端口 {port}）",
    "startup.embeddedPostgres": "内置 PostgreSQL",
    "startup.externalPostgres": "外部 PostgreSQL",
    "startup.viteDev": "Vite 开发中间件",
    "startup.staticUi": "静态 UI",
    "startup.headlessApi": "仅 API",
    "startup.dbPort": "（pg:{port}）",
    "startup.agentJwt.set": "已设置",
    "startup.agentJwt.foundNotLoaded": "已在 {path} 中找到，但尚未加载",
    "startup.agentJwt.missing": "缺失（请运行 `pnpm paperclipai onboard`）",
  },
};

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? `{${key}}`));
}

export function resolveServerLocale(raw = process.env.PAPERCLIP_LOCALE): PaperclipUiLocale {
  return raw?.trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function serverT(key: ServerMessageKey, values?: Record<string, string | number>): string {
  const locale = resolveServerLocale();
  return interpolate(messages[locale][key] ?? messages.en[key], values);
}
