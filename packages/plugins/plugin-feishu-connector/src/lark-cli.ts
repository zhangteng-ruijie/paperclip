import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import type { FeishuIdentity, LarkCliResult } from "./types.js";

function profileArgs(profileName?: string): string[] {
  return profileName ? ["--profile", profileName] : [];
}

function pushOptional(args: string[], flag: string, value?: string) {
  if (value && value.trim().length > 0) {
    args.push(flag, value);
  }
}

function larkCliEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: process.env.HOME ?? os.homedir(),
    USER: process.env.USER ?? os.userInfo().username,
    LOGNAME: process.env.LOGNAME ?? os.userInfo().username,
  };
}

export function buildSendMessageArgs(input: {
  profileName?: string;
  identity?: FeishuIdentity;
  chatId?: string;
  userId?: string;
  text?: string;
  markdown?: string;
  content?: string;
  msgType?: string;
  idempotencyKey?: string;
}): string[] {
  const args = [...profileArgs(input.profileName), "im", "+messages-send", "--as", input.identity ?? "bot"];
  pushOptional(args, "--chat-id", input.chatId);
  pushOptional(args, "--user-id", input.userId);
  pushOptional(args, "--text", input.text);
  pushOptional(args, "--markdown", input.markdown);
  pushOptional(args, "--content", input.content);
  pushOptional(args, "--msg-type", input.msgType);
  pushOptional(args, "--idempotency-key", input.idempotencyKey);
  return args;
}

export function buildReplyMessageArgs(input: {
  profileName?: string;
  identity?: FeishuIdentity;
  messageId: string;
  text?: string;
  markdown?: string;
  content?: string;
  msgType?: string;
  replyInThread?: boolean;
  idempotencyKey?: string;
}): string[] {
  const args = [
    ...profileArgs(input.profileName),
    "im",
    "+messages-reply",
    "--as",
    input.identity ?? "bot",
    "--message-id",
    input.messageId,
  ];
  if (input.replyInThread) args.push("--reply-in-thread");
  pushOptional(args, "--text", input.text);
  pushOptional(args, "--markdown", input.markdown);
  pushOptional(args, "--content", input.content);
  pushOptional(args, "--msg-type", input.msgType);
  pushOptional(args, "--idempotency-key", input.idempotencyKey);
  return args;
}

export function buildRecordUpsertArgs(input: {
  profileName?: string;
  identity?: FeishuIdentity;
  baseToken: string;
  tableIdOrName: string;
  recordJson: Record<string, unknown>;
  recordId?: string;
}): string[] {
  const args = [
    ...profileArgs(input.profileName),
    "base",
    "+record-upsert",
    "--as",
    input.identity ?? "bot",
    "--base-token",
    input.baseToken,
    "--table-id",
    input.tableIdOrName,
    "--json",
    JSON.stringify(input.recordJson),
  ];
  pushOptional(args, "--record-id", input.recordId);
  return args;
}

export function buildEventSubscribeArgs(input: {
  profileName?: string;
  eventTypes?: string;
  compact?: boolean;
  quiet?: boolean;
}): string[] {
  const args = [
    ...profileArgs(input.profileName),
    "event",
    "+subscribe",
    "--as",
    "bot",
  ];
  if (input.compact !== false) args.push("--compact");
  if (input.quiet !== false) args.push("--quiet");
  pushOptional(args, "--event-types", input.eventTypes);
  return args;
}

export function buildResourceDownloadArgs(input: {
  profileName?: string;
  identity?: FeishuIdentity;
  messageId: string;
  fileKey: string;
  type: "image" | "file" | "audio" | "video";
  output: string;
}): string[] {
  return [
    ...profileArgs(input.profileName),
    "im",
    "+messages-resources-download",
    "--as",
    input.identity ?? "bot",
    "--message-id",
    input.messageId,
    "--file-key",
    input.fileKey,
    "--type",
    input.type,
    "--output",
    input.output,
  ];
}

export function buildProfileAddArgs(input: {
  name: string;
  appId: string;
  brand?: "feishu" | "lark";
  use?: boolean;
}): string[] {
  const args = [
    "profile",
    "add",
    "--name",
    input.name,
    "--app-id",
    input.appId,
    "--brand",
    input.brand ?? "feishu",
    "--app-secret-stdin",
  ];
  if (input.use) args.push("--use");
  return args;
}

export function buildConfigInitNewArgs(input: {
  name: string;
  brand?: "feishu" | "lark";
  lang?: "zh" | "en";
}): string[] {
  return [
    "config",
    "init",
    "--new",
    "--name",
    input.name,
    "--brand",
    input.brand ?? "feishu",
    "--lang",
    input.lang ?? "zh",
  ];
}

export function buildMessageGetArgs(input: {
  profileName?: string;
  identity?: FeishuIdentity;
  messageId: string;
}): string[] {
  return [
    ...profileArgs(input.profileName),
    "im",
    "+messages-mget",
    "--as",
    input.identity ?? "bot",
    "--message-ids",
    input.messageId,
  ];
}

export async function runLarkCli(input: {
  bin: string;
  args: string[];
  dryRun?: boolean;
  timeoutMs?: number;
  cwd?: string;
  stdin?: string;
}): Promise<LarkCliResult> {
  if (input.dryRun) {
    return {
      ok: true,
      dryRun: true,
      command: input.bin,
      args: input.args,
      stdout: "",
      stderr: "",
      code: 0,
    };
  }

  return await new Promise<LarkCliResult>((resolve) => {
    const child = spawn(input.bin, input.args, {
      stdio: input.stdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      env: larkCliEnv(),
      cwd: input.cwd,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
    }, input.timeoutMs ?? 30_000);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    if (input.stdin && child.stdin) {
      child.stdin.end(input.stdin);
    }
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        command: input.bin,
        args: input.args,
        stdout,
        stderr: stderr || error.message,
        code: null,
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: code === 0,
        command: input.bin,
        args: input.args,
        stdout,
        stderr,
        code,
      });
    });
  });
}

export interface LarkEventSubscriber {
  profileName?: string;
  child: ChildProcess;
  stop(): void;
  isRunning(): boolean;
}

export interface LarkConfigInitSession {
  profileName: string;
  child: ChildProcess;
  args: string[];
  snapshot(): {
    ok: boolean;
    profileName: string;
    command: string;
    args: string[];
    pid: number | null;
    running: boolean;
    stdout: string;
    stderr: string;
    url?: string;
    userCode?: string;
    code: number | null;
  };
  waitForReady(): Promise<ReturnType<LarkConfigInitSession["snapshot"]>>;
  stop(): void;
  isRunning(): boolean;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function extractFirstUrl(value: string): string | undefined {
  const match = stripAnsi(value).match(/https?:\/\/[^\s"'<>）)]+/);
  return match?.[0];
}

function extractUserCode(value: string): string | undefined {
  const text = stripAnsi(value);
  const match = text.match(/(?:user\s*code|device\s*code|code|验证码|校验码|用户代码)[:：\s]+([A-Z0-9][A-Z0-9-]{3,})/i);
  return match?.[1];
}

function childProcessIds(parentPid: number): number[] {
  try {
    return execFileSync("pgrep", ["-P", String(parentPid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

function killProcessTree(pid: number, signal: NodeJS.Signals): void {
  for (const childPid of childProcessIds(pid)) {
    killProcessTree(childPid, signal);
  }
  try {
    process.kill(pid, signal);
  } catch {
    // The process may have already exited between pgrep and kill.
  }
}

export function startLarkConfigInit(input: {
  bin: string;
  profileName: string;
  brand?: "feishu" | "lark";
  lang?: "zh" | "en";
  initialWaitMs?: number;
}): LarkConfigInitSession {
  const args = buildConfigInitNewArgs({
    name: input.profileName,
    brand: input.brand,
    lang: input.lang,
  });
  const child = spawn(input.bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: larkCliEnv(),
    detached: true,
  });

  let stdout = "";
  let stderr = "";
  let closeCode: number | null = null;
  let readyResolved = false;
  let resolveReady: (snapshot: ReturnType<LarkConfigInitSession["snapshot"]>) => void = () => {};

  const session: LarkConfigInitSession = {
    profileName: input.profileName,
    child,
    args,
    snapshot() {
      const allOutput = `${stdout}\n${stderr}`;
      return {
        ok: closeCode === null || closeCode === 0,
        profileName: input.profileName,
        command: input.bin,
        args,
        pid: child.pid ?? null,
        running: this.isRunning(),
        stdout: stripAnsi(stdout).trim(),
        stderr: stripAnsi(stderr).trim(),
        url: extractFirstUrl(allOutput),
        userCode: extractUserCode(allOutput),
        code: closeCode,
      };
    },
    waitForReady() {
      return readyPromise;
    },
    isRunning() {
      return child.exitCode === null && child.signalCode === null && !child.killed;
    },
    stop() {
      if (child.killed) return;
      const pid = child.pid;
      if (!pid) {
        child.kill("SIGTERM");
        return;
      }
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // Fall through to direct process-tree cleanup.
      }
      killProcessTree(pid, "SIGTERM");
    },
  };

  function resolveOnce() {
    if (readyResolved) return;
    readyResolved = true;
    clearTimeout(timer);
    resolveReady(session.snapshot());
  }

  const readyPromise = new Promise<ReturnType<LarkConfigInitSession["snapshot"]>>((resolve) => {
    resolveReady = resolve;
  });
  const timer = setTimeout(resolveOnce, input.initialWaitMs ?? 4500);
  timer.unref();

  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
    if (extractFirstUrl(stdout)) resolveOnce();
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
    if (extractFirstUrl(stderr)) resolveOnce();
  });
  child.on("error", (error) => {
    stderr += stderr ? `\n${error.message}` : error.message;
    closeCode = 1;
    resolveOnce();
  });
  child.on("close", (code) => {
    closeCode = code;
    resolveOnce();
  });

  return session;
}

export function startLarkEventSubscriber(input: {
  bin: string;
  profileName?: string;
  eventTypes?: string;
  onEvent: (event: unknown) => void;
  onError: (error: Error) => void;
  onClose?: (code: number | null, signal: NodeJS.Signals | null) => void;
}): LarkEventSubscriber {
  const args = buildEventSubscribeArgs({
    profileName: input.profileName,
    eventTypes: input.eventTypes,
    compact: true,
    quiet: true,
  });
  const child = spawn(input.bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: larkCliEnv(),
    detached: true,
  });

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += String(chunk);
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) {
        try {
          input.onEvent(JSON.parse(line));
        } catch (error) {
          input.onError(error instanceof Error ? error : new Error(String(error)));
        }
      }
      newline = buffer.indexOf("\n");
    }
  });
  child.stderr.on("data", (chunk) => {
    const message = String(chunk).trim();
    if (message) input.onError(new Error(message));
  });
  child.on("error", (error) => input.onError(error));
  child.on("close", (code, signal) => {
    input.onClose?.(code, signal);
  });

  return {
    profileName: input.profileName,
    child,
    isRunning() {
      return child.exitCode === null && child.signalCode === null && !child.killed;
    },
    stop() {
      if (child.killed) return;
      const pid = child.pid;
      if (!pid) {
        child.kill("SIGTERM");
        return;
      }
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // Fall through to the direct process-tree cleanup below.
      }
      killProcessTree(pid, "SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            // Ignore and try direct children below.
          }
          killProcessTree(pid, "SIGKILL");
        }
      }, 1500).unref();
    },
  };
}
