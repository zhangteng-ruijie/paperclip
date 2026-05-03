import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function isExecutableFile(candidate: string): boolean {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveCodexCommand(command: string, options: { local: boolean }): string {
  const trimmed = command.trim();
  if (trimmed.length > 0 && trimmed !== "codex") return trimmed;
  if (!options.local) return trimmed || "codex";

  const home = os.homedir();
  const candidates = [
    process.env.PAPERCLIP_CODEX_COMMAND,
    process.env.CODEX_COMMAND,
    path.join(home, ".bun", "bin", "codex"),
    path.join(home, ".local", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (isExecutableFile(normalized)) return normalized;
  }

  return trimmed || "codex";
}
