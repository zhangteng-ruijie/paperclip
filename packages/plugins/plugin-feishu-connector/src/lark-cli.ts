import { spawn, type ChildProcess } from "node:child_process";
import type { FeishuIdentity, LarkCliResult } from "./types.js";

function profileArgs(profileName?: string): string[] {
  return profileName ? ["--profile", profileName] : [];
}

function pushOptional(args: string[], flag: string, value?: string) {
  if (value && value.trim().length > 0) {
    args.push(flag, value);
  }
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

export async function runLarkCli(input: {
  bin: string;
  args: string[];
  dryRun?: boolean;
  timeoutMs?: number;
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
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
    }, input.timeoutMs ?? 30_000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
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
}

export function startLarkEventSubscriber(input: {
  bin: string;
  profileName?: string;
  eventTypes?: string;
  onEvent: (event: unknown) => void;
  onError: (error: Error) => void;
}): LarkEventSubscriber {
  const args = buildEventSubscribeArgs({
    profileName: input.profileName,
    eventTypes: input.eventTypes,
    compact: true,
    quiet: true,
  });
  const child = spawn(input.bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
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

  return {
    profileName: input.profileName,
    child,
    stop() {
      if (!child.killed) child.kill("SIGTERM");
    },
  };
}
