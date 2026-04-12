type RunDetailCopyLocale = string | null | undefined;

const COPY = {
  en: {
    invocation: "Invocation",
    adapter: "Adapter",
    workingDir: "Working dir",
    details: "Details",
    command: "Command",
    commandNotes: "Command notes",
    prompt: "Prompt",
    context: "Context",
    environment: "Environment",
    workspace: "Workspace",
    showFullLog: "Show full log",
    hideFullLog: "Hide full log",
    loadingLog: "Loading log...",
    failedToLoadWorkspaceOperationLog: "Failed to load workspace operation log",
    noPersistedLogLines: "No persisted log lines.",
    branch: "Branch",
    baseRef: "Base ref",
    worktree: "Worktree",
    repoRoot: "Repo root",
    cleanup: "Cleanup",
    createdByThisRun: "Created by this run",
    reusedExistingWorkspace: "Reused existing workspace",
    stderrExcerpt: "stderr excerpt",
    stdoutExcerpt: "stdout excerpt",
    cancel: "Cancel",
    cancelling: "Cancelling…",
    resume: "Resume",
    resuming: "Resuming…",
    retry: "Retry",
    retrying: "Retrying…",
    resumeSkipped: "Resume request was skipped.",
    retrySkipped: "Retry was skipped.",
    failedToResumeRun: "Failed to resume run",
    failedToRetryRun: "Failed to retry run",
    duration: "Duration",
    runningClaudeLogin: "Running claude login...",
    loginToClaudeCode: "Login to Claude Code",
    failedToRunClaudeLogin: "Failed to run Claude login",
    loginUrl: "Login URL",
    exitCode: "Exit code",
    signal: "signal",
    input: "Input",
    output: "Output",
    cached: "Cached",
    cost: "Cost",
    session: "Session",
    changed: "changed",
    before: "Before",
    id: "ID",
    after: "After",
    clearingSession: "clearing session...",
    clearSessionForTheseIssues: "clear session for these issues",
    failedToClearSessions: "Failed to clear sessions",
    issuesTouched: "Issues Touched",
    stderr: "stderr",
    stdout: "stdout",
    loadingRunLogs: "Loading run logs...",
    failedToLoadRunLog: "Failed to load run log",
    noLogEvents: "No log events.",
    transcript: "Transcript",
    niceMode: "Nice",
    rawMode: "Raw",
    jumpToLive: "Jump to live",
    live: "Live",
    waitingForTranscript: "Waiting for transcript...",
    noPersistedTranscript: "No persisted transcript for this run.",
    failureDetails: "Failure details",
    error: "Error",
    adapterResultJson: "adapter result JSON",
    events: "Events",
    noTranscriptYet: "No transcript yet.",
    waitingForResult: "Waiting for result",
    waitingForResultEllipsis: "Waiting for result...",
    toolFailed: "Tool failed",
    completed: "Completed",
    failed: "Failed",
    runFailed: "Run failed",
    user: "User",
    streaming: "Streaming",
    running: "Running",
    errored: "Errored",
    collapseToolDetails: "Collapse tool details",
    expandToolDetails: "Expand tool details",
    collapseCommandDetails: "Collapse command details",
    expandCommandDetails: "Expand command details",
    commandFailed: "Command failed",
    inputPayload: "Input",
    resultPayload: "Result",
    empty: "<empty>",
    collapseStdout: "Collapse stdout",
    expandStdout: "Expand stdout",
    init: "init",
    result: "result",
  },
  "zh-CN": {
    invocation: "调用信息",
    adapter: "适配器",
    workingDir: "工作目录",
    details: "详细信息",
    command: "命令",
    commandNotes: "命令说明",
    prompt: "提示词",
    context: "上下文",
    environment: "环境变量",
    workspace: "工作区",
    showFullLog: "显示完整日志",
    hideFullLog: "隐藏完整日志",
    loadingLog: "正在加载日志...",
    failedToLoadWorkspaceOperationLog: "加载工作区操作日志失败",
    noPersistedLogLines: "还没有持久化日志。",
    branch: "分支",
    baseRef: "基线引用",
    worktree: "工作树",
    repoRoot: "仓库根目录",
    cleanup: "清理方式",
    createdByThisRun: "此运行新建了工作区",
    reusedExistingWorkspace: "复用了现有工作区",
    stderrExcerpt: "stderr 摘要",
    stdoutExcerpt: "stdout 摘要",
    cancel: "取消",
    cancelling: "取消中…",
    resume: "继续",
    resuming: "继续中…",
    retry: "重试",
    retrying: "重试中…",
    resumeSkipped: "已跳过继续运行请求。",
    retrySkipped: "已跳过重试请求。",
    failedToResumeRun: "继续运行失败",
    failedToRetryRun: "重试运行失败",
    duration: "耗时",
    runningClaudeLogin: "正在执行 claude login...",
    loginToClaudeCode: "登录 Claude Code",
    failedToRunClaudeLogin: "执行 Claude 登录失败",
    loginUrl: "登录链接",
    exitCode: "退出码",
    signal: "信号",
    input: "输入",
    output: "输出",
    cached: "缓存",
    cost: "成本",
    session: "会话",
    changed: "已变更",
    before: "之前",
    id: "ID",
    after: "之后",
    clearingSession: "清理会话中...",
    clearSessionForTheseIssues: "清理这些任务的会话",
    failedToClearSessions: "清理会话失败",
    issuesTouched: "涉及任务",
    stderr: "stderr",
    stdout: "stdout",
    loadingRunLogs: "正在加载运行日志...",
    failedToLoadRunLog: "加载运行日志失败",
    noLogEvents: "还没有日志事件。",
    transcript: "转录",
    niceMode: "整理",
    rawMode: "原始",
    jumpToLive: "跳到实时位置",
    live: "实时",
    waitingForTranscript: "正在等待转录内容...",
    noPersistedTranscript: "此运行还没有持久化转录。",
    failureDetails: "失败详情",
    error: "错误",
    adapterResultJson: "适配器结果 JSON",
    events: "事件",
    noTranscriptYet: "还没有转录内容。",
    waitingForResult: "等待结果",
    waitingForResultEllipsis: "正在等待结果...",
    toolFailed: "工具执行失败",
    completed: "已完成",
    failed: "失败",
    runFailed: "运行失败",
    user: "用户",
    streaming: "流式输出中",
    running: "进行中",
    errored: "出错",
    collapseToolDetails: "收起工具详情",
    expandToolDetails: "展开工具详情",
    collapseCommandDetails: "收起命令详情",
    expandCommandDetails: "展开命令详情",
    commandFailed: "命令执行失败",
    inputPayload: "输入",
    resultPayload: "结果",
    empty: "<空>",
    collapseStdout: "收起 stdout",
    expandStdout: "展开 stdout",
    init: "初始化",
    result: "结果",
  },
} as const;

function isZhLocale(locale: RunDetailCopyLocale) {
  return locale === "zh-CN";
}

export function getRunDetailCopy(locale: RunDetailCopyLocale) {
  return COPY[isZhLocale(locale) ? "zh-CN" : "en"];
}

export function formatRunDuration(seconds: number, locale: RunDetailCopyLocale) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (isZhLocale(locale)) {
    return minutes > 0 ? `${minutes} 分 ${remainingSeconds} 秒` : `${remainingSeconds} 秒`;
  }
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

export function formatWorkspaceOperationPhaseLabel(
  phase: string,
  locale: RunDetailCopyLocale,
) {
  if (isZhLocale(locale)) {
    return ({
      worktree_prepare: "准备工作树",
      workspace_provision: "准备工作区",
      workspace_teardown: "回收工作区",
      worktree_cleanup: "清理工作树",
    } as Record<string, string>)[phase] ?? phase;
  }
  return ({
    worktree_prepare: "Worktree setup",
    workspace_provision: "Provision",
    workspace_teardown: "Teardown",
    worktree_cleanup: "Worktree cleanup",
  } as Record<string, string>)[phase] ?? phase;
}

export function formatWorkspaceOperationStatusLabel(
  status: string,
  locale: RunDetailCopyLocale,
) {
  if (isZhLocale(locale)) {
    return ({
      succeeded: "成功",
      failed: "失败",
      running: "进行中",
      skipped: "已跳过",
    } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
  }
  return ({
    succeeded: "Succeeded",
    failed: "Failed",
    running: "Running",
    skipped: "Skipped",
  } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
}

export function formatSessionClearConfirm(
  issueCount: number,
  locale: RunDetailCopyLocale,
) {
  if (isZhLocale(locale)) {
    return `要清理本次运行涉及的 ${issueCount} 个任务会话吗？`;
  }
  return `Clear session for ${issueCount} issue${issueCount === 1 ? "" : "s"} touched by this run?`;
}

export function formatTranscriptModeLabel(
  mode: "nice" | "raw",
  locale: RunDetailCopyLocale,
) {
  const copy = getRunDetailCopy(locale);
  return mode === "nice" ? copy.niceMode : copy.rawMode;
}

export function formatTranscriptToolStatusLabel(
  status: "running" | "completed" | "error",
  locale: RunDetailCopyLocale,
) {
  const copy = getRunDetailCopy(locale);
  if (status === "running") return copy.running;
  if (status === "error") return copy.errored;
  return copy.completed;
}

export function formatTranscriptFailedWithExitCode(
  exitCode: string,
  locale: RunDetailCopyLocale,
) {
  return isZhLocale(locale)
    ? `退出码 ${exitCode}，执行失败`
    : `Failed with exit code ${exitCode}`;
}

export function formatTranscriptCommandGroupTitle(args: {
  locale: RunDetailCopyLocale;
  isRunning: boolean;
  commandCount: number;
}) {
  if (args.locale === "zh-CN") {
    if (args.isRunning) return "正在执行命令";
    if (args.commandCount === 1) return "已执行命令";
    return `已执行 ${args.commandCount} 个命令`;
  }
  if (args.isRunning) return "Executing command";
  if (args.commandCount === 1) return "Executed command";
  return `Executed ${args.commandCount} commands`;
}

export function formatTranscriptToolGroupTitle(args: {
  locale: RunDetailCopyLocale;
  isRunning: boolean;
  toolLabel: string;
  callCount: number;
}) {
  if (args.locale === "zh-CN") {
    if (args.isRunning) return `调用 ${args.toolLabel}`;
    if (args.callCount === 1) return `已调用 ${args.toolLabel}`;
    return `已调用 ${args.toolLabel}（${args.callCount} 次）`;
  }
  if (args.isRunning) return `Using ${args.toolLabel}`;
  if (args.callCount === 1) return `Used ${args.toolLabel}`;
  return `Used ${args.toolLabel} (${args.callCount} calls)`;
}

export function formatTranscriptLogLinesLabel(
  count: number,
  locale: RunDetailCopyLocale,
) {
  if (isZhLocale(locale)) {
    return `${count} 条日志`;
  }
  return `${count} log ${count === 1 ? "line" : "lines"}`;
}

export function formatTranscriptSystemMessagesLabel(
  count: number,
  locale: RunDetailCopyLocale,
) {
  if (isZhLocale(locale)) {
    return `${count} 条系统消息`;
  }
  return `${count} system ${count === 1 ? "message" : "messages"}`;
}

export function formatTranscriptInitText(args: {
  locale: RunDetailCopyLocale;
  model: string;
  sessionId?: string | null;
}) {
  if (args.locale === "zh-CN") {
    return `模型 ${args.model}${args.sessionId ? ` • 会话 ${args.sessionId}` : ""}`;
  }
  return `model ${args.model}${args.sessionId ? ` • session ${args.sessionId}` : ""}`;
}

export function formatTranscriptEventLabel(
  label: string,
  locale: RunDetailCopyLocale,
) {
  const copy = getRunDetailCopy(locale);
  if (label === "init") return copy.init;
  if (label === "result") return copy.result;
  return label;
}

export function formatTranscriptInspectInput(
  name: string,
  locale: RunDetailCopyLocale,
) {
  return isZhLocale(locale) ? `查看 ${name} 输入` : `Inspect ${name} input`;
}

export function formatTranscriptNoInput(
  name: string,
  locale: RunDetailCopyLocale,
) {
  return isZhLocale(locale) ? `${name} 没有输入` : `No ${name} input`;
}
