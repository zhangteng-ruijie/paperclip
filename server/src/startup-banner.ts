import { existsSync, readFileSync } from "node:fs";
import { resolvePaperclipConfigPath, resolvePaperclipEnvPath } from "./paths.js";
import type { BindMode, DeploymentExposure, DeploymentMode } from "@paperclipai/shared";

import { parse as parseEnvFileContents } from "dotenv";
import { serverT } from "./localization.js";

type UiMode = "none" | "static" | "vite-dev";

type ExternalPostgresInfo = {
  mode: "external-postgres";
  connectionString: string;
};

type EmbeddedPostgresInfo = {
  mode: "embedded-postgres";
  dataDir: string;
  port: number;
};

type StartupBannerOptions = {
  bind: BindMode;
  host: string;
  deploymentMode: DeploymentMode;
  deploymentExposure: DeploymentExposure;
  authReady: boolean;
  requestedPort: number;
  listenPort: number;
  uiMode: UiMode;
  db: ExternalPostgresInfo | EmbeddedPostgresInfo;
  migrationSummary: string;
  heartbeatSchedulerEnabled: boolean;
  heartbeatSchedulerIntervalMs: number;
  databaseBackupEnabled: boolean;
  databaseBackupIntervalMinutes: number;
  databaseBackupRetentionDays: number;
  databaseBackupDir: string;
};

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

function color(text: string, c: keyof typeof ansi): string {
  return `${ansi[c]}${text}${ansi.reset}`;
}

function row(label: string, value: string): string {
  return `${color(label.padEnd(16), "dim")} ${value}`;
}

function redactConnectionString(raw: string): string {
  try {
    const u = new URL(raw);
    const user = u.username || "user";
    const auth = `${user}:***@`;
    return `${u.protocol}//${auth}${u.host}${u.pathname}`;
  } catch {
    return "<invalid DATABASE_URL>";
  }
}

function resolveAgentJwtSecretStatus(
  envFilePath: string,
): {
  status: "pass" | "warn";
  message: string;
} {
  const envValue = process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim();
  if (envValue) {
      return {
        status: "pass",
        message: serverT("startup.agentJwt.set"),
      };
  }

  if (existsSync(envFilePath)) {
    const parsed = parseEnvFileContents(readFileSync(envFilePath, "utf-8"));
    const fileValue = typeof parsed.PAPERCLIP_AGENT_JWT_SECRET === "string" ? parsed.PAPERCLIP_AGENT_JWT_SECRET.trim() : "";
    if (fileValue) {
      return {
        status: "warn",
        message: serverT("startup.agentJwt.foundNotLoaded", { path: envFilePath }),
      };
    }
  }

  return {
    status: "warn",
    message: serverT("startup.agentJwt.missing"),
  };
}

export function printStartupBanner(opts: StartupBannerOptions): void {
  const baseHost = opts.host === "0.0.0.0" ? "localhost" : opts.host;
  const baseUrl = `http://${baseHost}:${opts.listenPort}`;
  const apiUrl = `${baseUrl}/api`;
  const uiUrl = opts.uiMode === "none" ? "disabled" : baseUrl;
  const configPath = resolvePaperclipConfigPath();
  const envFilePath = resolvePaperclipEnvPath();
  const agentJwtSecret = resolveAgentJwtSecretStatus(envFilePath);

  const dbMode =
    opts.db.mode === "embedded-postgres"
      ? color(serverT("startup.embeddedPostgres"), "green")
      : color(serverT("startup.externalPostgres"), "yellow");
  const uiMode =
    opts.uiMode === "vite-dev"
      ? color(serverT("startup.viteDev"), "cyan")
      : opts.uiMode === "static"
        ? color(serverT("startup.staticUi"), "magenta")
        : color(serverT("startup.headlessApi"), "yellow");

  const portValue =
    opts.requestedPort === opts.listenPort
      ? `${opts.listenPort}`
      : `${opts.listenPort} ${color(serverT("startup.requestedPort", { port: opts.requestedPort }), "dim")}`;

  const dbDetails =
    opts.db.mode === "embedded-postgres"
      ? `${opts.db.dataDir} ${color(serverT("startup.dbPort", { port: opts.db.port }), "dim")}`
      : redactConnectionString(opts.db.connectionString);

  const heartbeat = opts.heartbeatSchedulerEnabled
    ? `enabled ${color(`(${opts.heartbeatSchedulerIntervalMs}ms)`, "dim")}`
    : color(serverT("startup.disabled"), "yellow");
  const dbBackup = opts.databaseBackupEnabled
    ? `enabled ${color(`(every ${opts.databaseBackupIntervalMinutes}m, keep ${opts.databaseBackupRetentionDays}d)`, "dim")}`
    : color(serverT("startup.disabled"), "yellow");

  const art = [
    color("██████╗  █████╗ ██████╗ ███████╗██████╗  ██████╗██╗     ██╗██████╗ ", "cyan"),
    color("██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██║     ██║██╔══██╗", "cyan"),
    color("██████╔╝███████║██████╔╝█████╗  ██████╔╝██║     ██║     ██║██████╔╝", "cyan"),
    color("██╔═══╝ ██╔══██║██╔═══╝ ██╔══╝  ██╔══██╗██║     ██║     ██║██╔═══╝ ", "cyan"),
    color("██║     ██║  ██║██║     ███████╗██║  ██║╚██████╗███████╗██║██║     ", "cyan"),
    color("╚═╝     ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝╚═╝     ", "cyan"),
  ];

  const lines = [
    "",
    ...art,
    color("  ───────────────────────────────────────────────────────", "blue"),
    row(serverT("startup.mode"), `${dbMode}  |  ${uiMode}`),
    row(serverT("startup.deploy"), `${opts.deploymentMode} (${opts.deploymentExposure})`),
    row(serverT("startup.bind"), `${opts.bind} ${color(`(${opts.host})`, "dim")}`),
    row(serverT("startup.auth"), opts.authReady ? color(serverT("startup.ready"), "green") : color(serverT("startup.notReady"), "yellow")),
    row(serverT("startup.server"), portValue),
    row(serverT("startup.api"), `${apiUrl} ${color(`(${serverT("startup.apiHealth", { url: `${apiUrl}/health` })})`, "dim")}`),
    row(serverT("startup.ui"), uiUrl),
    row(serverT("startup.database"), dbDetails),
    row(serverT("startup.migrations"), opts.migrationSummary),
    row(
      serverT("startup.agentJwt"),
      agentJwtSecret.status === "pass"
        ? color(agentJwtSecret.message, "green")
        : color(agentJwtSecret.message, "yellow"),
    ),
    row(serverT("startup.heartbeat"), heartbeat),
    row(serverT("startup.dbBackup"), dbBackup),
    row(serverT("startup.backupDir"), opts.databaseBackupDir),
    row(serverT("startup.config"), configPath),
    agentJwtSecret.status === "warn"
      ? color("  ───────────────────────────────────────────────────────", "yellow")
      : null,
    color("  ───────────────────────────────────────────────────────", "blue"),
    "",
  ];

  console.log(lines.filter((line): line is string => line !== null).join("\n"));
}
