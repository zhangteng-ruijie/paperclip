type CodexLocalLocale = string | null | undefined;

function isZhLocale(locale: CodexLocalLocale) {
  return typeof locale === "string" && locale.trim().toLowerCase().startsWith("zh");
}

export function formatUsingCodexHomeLog(args: {
  locale?: string | null;
  isWorktreeMode: boolean;
  targetHome: string;
  sourceHome: string;
}) {
  if (isZhLocale(args.locale)) {
    return `[paperclip] 使用${args.isWorktreeMode ? "工作树隔离的" : " Paperclip 托管的"} Codex 目录 "${args.targetHome}"（从 "${args.sourceHome}" 初始化）。\n`;
  }
  return `[paperclip] Using ${args.isWorktreeMode ? "worktree-isolated" : "Paperclip-managed"} Codex home "${args.targetHome}" (seeded from "${args.sourceHome}").\n`;
}

export function formatRemovedStaleCodexSkillLog(
  skillName: string,
  skillsHome: string,
  locale?: string | null,
) {
  if (isZhLocale(locale)) {
    return `[paperclip] 已从 ${skillsHome} 移除过期的 Codex 技能 "${skillName}"\n`;
  }
  return `[paperclip] Removed stale Codex skill "${skillName}" from ${skillsHome}\n`;
}

export function formatRepairedCodexSkillLog(
  skillName: string,
  skillsHome: string,
  locale?: string | null,
) {
  if (isZhLocale(locale)) {
    return `[paperclip] 已在 ${skillsHome} 修复 Codex 技能 "${skillName}"\n`;
  }
  return `[paperclip] Repaired Codex skill "${skillName}" into ${skillsHome}\n`;
}

export function formatInjectedCodexSkillLog(args: {
  locale?: string | null;
  skillName: string;
  skillsHome: string;
  repaired: boolean;
}) {
  if (isZhLocale(args.locale)) {
    return `[paperclip] 已在 ${args.skillsHome} 中${args.repaired ? "修复" : "注入"} Codex 技能 "${args.skillName}"\n`;
  }
  return `[paperclip] ${args.repaired ? "Repaired" : "Injected"} Codex skill "${args.skillName}" into ${args.skillsHome}\n`;
}

export function formatFailedToInjectCodexSkillLog(args: {
  locale?: string | null;
  skillKey: string;
  skillsHome: string;
  reason: string;
}) {
  if (isZhLocale(args.locale)) {
    return `[paperclip] 无法将 Codex 技能 "${args.skillKey}" 注入到 ${args.skillsHome}：${args.reason}\n`;
  }
  return `[paperclip] Failed to inject Codex skill "${args.skillKey}" into ${args.skillsHome}: ${args.reason}\n`;
}

export function formatSavedSessionMismatchLog(args: {
  locale?: string | null;
  sessionId: string;
  runtimeSessionCwd: string;
  cwd: string;
}) {
  if (isZhLocale(args.locale)) {
    return `[paperclip] Codex 会话 "${args.sessionId}" 原先保存在工作目录 "${args.runtimeSessionCwd}" 下，本次运行目录为 "${args.cwd}"，因此不会继续复用该会话。\n`;
  }
  return `[paperclip] Codex session "${args.sessionId}" was saved for cwd "${args.runtimeSessionCwd}" and will not be resumed in "${args.cwd}".\n`;
}

export function formatUnreadableInstructionsWarning(args: {
  locale?: string | null;
  instructionsFilePath: string;
  reason: string;
}) {
  if (isZhLocale(args.locale)) {
    return `[paperclip] 警告：无法读取智能体指令文件 "${args.instructionsFilePath}"：${args.reason}\n`;
  }
  return `[paperclip] Warning: could not read agent instructions file "${args.instructionsFilePath}": ${args.reason}\n`;
}

export function formatCodexResumeUnavailableLog(
  sessionId: string,
  locale?: string | null,
) {
  if (isZhLocale(locale)) {
    return `[paperclip] Codex 恢复会话 "${sessionId}" 不可用，将改为新建会话重试。\n`;
  }
  return `[paperclip] Codex resume session "${sessionId}" is unavailable; retrying with a fresh session.\n`;
}

export function codexRepoAgentsNote(locale?: string | null) {
  if (isZhLocale(locale)) {
    return "Codex exec 会自动应用当前工作区内 repo 级的 AGENTS.md 指令，Paperclip 目前不会屏蔽这类发现。";
  }
  return "Codex exec automatically applies repo-scoped AGENTS.md instructions from the current workspace; Paperclip does not currently suppress that discovery.";
}

export function codexLoadedAgentInstructionsNote(
  instructionsFilePath: string,
  locale?: string | null,
) {
  if (isZhLocale(locale)) {
    return `已从 ${instructionsFilePath} 加载智能体指令`;
  }
  return `Loaded agent instructions from ${instructionsFilePath}`;
}

export function codexSkippedInstructionReinjectionNote(locale?: string | null) {
  if (isZhLocale(locale)) {
    return "由于当前正在结合唤醒增量恢复既有 Codex 会话，因此跳过了 stdin 指令重新注入。";
  }
  return "Skipped stdin instruction reinjection because an existing Codex session is being resumed with a wake delta.";
}

export function codexPrependedInstructionsNote(
  instructionsDir: string,
  locale?: string | null,
) {
  if (isZhLocale(locale)) {
    return `已把指令内容和路径提示追加到 stdin 提示词前缀（相对路径基于 ${instructionsDir} 解析）。`;
  }
  return `Prepended instructions + path directive to stdin prompt (relative references from ${instructionsDir}).`;
}

export function codexMissingInstructionsNote(
  instructionsFilePath: string,
  locale?: string | null,
) {
  if (isZhLocale(locale)) {
    return `已配置 instructionsFilePath=${instructionsFilePath}，但文件无法读取，因此继续运行且不注入额外指令。`;
  }
  return `Configured instructionsFilePath ${instructionsFilePath}, but file could not be read; continuing without injected instructions.`;
}
