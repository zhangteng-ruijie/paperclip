import type { ToolCallMessagePart } from "@assistant-ui/react";

type IssueChatCopyLocale = string | null | undefined;

const COPY = {
  en: {
    none: "None",
    timedOut: "timed out",
    running: "running",
    queued: "queued",
    succeeded: "succeeded",
    failed: "failed",
    cancelled: "cancelled",
    working: "Working",
    worked: "Worked",
    copy: "Copy",
    copyMessage: "Copy message",
    queuedBadge: "Queued",
    interrupting: "Interrupting...",
    interrupt: "Interrupt",
    sending: "Sending...",
    runningBadge: "Running",
    moreActions: "More actions",
    viewRun: "View run",
    helpful: "Helpful",
    needsWork: "Needs work",
    whatCouldBeBetter: "What could have been better?",
    addShortNote: "Add a short note",
    dismiss: "Dismiss",
    saving: "Saving...",
    saveNote: "Save note",
    saveFeedbackPreference: "Save your feedback sharing preference",
    feedbackPreferenceDescription: "Choose whether voted AI outputs can be shared with Paperclip Labs. This answer becomes the default for future thumbs up and thumbs down votes.",
    voteSavedLocally: "This vote is always saved locally.",
    feedbackPreferenceChoices: "Choose \"Always allow\" to share this vote and future voted AI outputs. Choose \"Don't allow\" to keep this vote and future votes local.",
    changeLaterInSettings: "You can change this later in Instance Settings > General.",
    readTerms: "Read our terms of service",
    dontAllow: "Don't allow",
    alwaysAllow: "Always allow",
    updatedThisTask: "updated this task",
    status: "Status",
    assignee: "Assignee",
    run: "run",
    reply: "Reply",
    attachImage: "Attach image",
    reopen: "Re-open",
    noAssigneesFound: "No assignees found.",
    noRunOutputYet: "No run output yet.",
    issueConversationEmpty: "This issue conversation is empty. Start with a message below.",
    jumpToLatest: "Jump to latest",
    send: "Send",
    posting: "Posting...",
  },
  "zh-CN": {
    none: "无",
    timedOut: "已超时",
    running: "进行中",
    queued: "排队中",
    succeeded: "成功",
    failed: "失败",
    cancelled: "已取消",
    working: "执行中",
    worked: "已执行",
    copy: "复制",
    copyMessage: "复制消息",
    queuedBadge: "排队中",
    interrupting: "中断中...",
    interrupt: "中断",
    sending: "发送中...",
    runningBadge: "运行中",
    moreActions: "更多操作",
    viewRun: "查看运行",
    helpful: "有帮助",
    needsWork: "还需改进",
    whatCouldBeBetter: "哪些地方还可以更好？",
    addShortNote: "补充一条简短说明",
    dismiss: "关闭",
    saving: "保存中...",
    saveNote: "保存说明",
    saveFeedbackPreference: "保存你的反馈共享偏好",
    feedbackPreferenceDescription: "选择带投票的 AI 输出是否可以共享给 Paperclip Labs。这个选择会成为之后点赞/点踩反馈的默认值。",
    voteSavedLocally: "这次投票一定会先保存在本地。",
    feedbackPreferenceChoices: "选择“始终允许”，即可共享这次以及今后带投票的 AI 输出；选择“不允许”，则本次和后续投票都只保存在本地。",
    changeLaterInSettings: "之后你仍可在 实例设置 > 常规 中修改。",
    readTerms: "阅读服务条款",
    dontAllow: "不允许",
    alwaysAllow: "始终允许",
    updatedThisTask: "更新了此任务",
    status: "状态",
    assignee: "负责人",
    run: "运行",
    reply: "回复",
    attachImage: "附加图片",
    reopen: "重新打开",
    noAssigneesFound: "没有找到负责人。",
    noRunOutputYet: "还没有运行输出。",
    issueConversationEmpty: "这个任务对话还是空的，请先在下方发送一条消息。",
    jumpToLatest: "跳到最新",
    send: "发送",
    posting: "发送中...",
  },
} as const;

export function getIssueChatCopy(locale: IssueChatCopyLocale) {
  return COPY[locale === "zh-CN" ? "zh-CN" : "en"];
}

export function humanizeIssueChatValue(value: string | null, locale: IssueChatCopyLocale) {
  if (!value) return getIssueChatCopy(locale).none;
  if (locale === "zh-CN") {
    return ({
      backlog: "待规划",
      todo: "待办",
      in_progress: "进行中",
      in_review: "待审核",
      done: "已完成",
      blocked: "阻塞",
      cancelled: "已取消",
      queued: "排队中",
      running: "进行中",
      failed: "失败",
      timed_out: "超时",
      succeeded: "成功",
    }[value] ?? value.replace(/_/g, " "));
  }
  return value.replace(/_/g, " ");
}

export function formatIssueChatRunStatus(status: string, locale: IssueChatCopyLocale) {
  const copy = getIssueChatCopy(locale);
  switch (status) {
    case "timed_out":
      return copy.timedOut;
    case "running":
      return copy.running;
    case "queued":
      return copy.queued;
    case "succeeded":
      return copy.succeeded;
    case "failed":
      return copy.failed;
    case "cancelled":
      return copy.cancelled;
    default:
      return status.replace(/_/g, " ");
  }
}

export function summarizeIssueChatToolCounts(toolParts: ToolCallMessagePart[], locale: IssueChatCopyLocale): string | null {
  if (toolParts.length === 0) return null;
  let commands = 0;
  let other = 0;
  for (const tool of toolParts) {
    const args = "args" in tool ? tool.args : undefined;
    const isCommand = tool.toolName === "terminal" || tool.toolName === "bash" || tool.toolName === "powershell"
      || (
        tool.toolName === "human"
        && typeof args === "object"
        && args !== null
        && "command" in (args as Record<string, unknown>)
      );
    if (isCommand) commands++;
    else other++;
  }
  const parts: string[] = [];
  if (commands > 0) parts.push(locale === "zh-CN" ? `执行了 ${commands} 个命令` : `ran ${commands} command${commands === 1 ? "" : "s"}`);
  if (other > 0) parts.push(locale === "zh-CN" ? `调用了 ${other} 个工具` : `called ${other} tool${other === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function formatIssueChatWorkHeader(args: {
  locale: IssueChatCopyLocale;
  isActive: boolean;
  liveElapsed?: string | null;
  durationText?: string | null;
}) {
  const copy = getIssueChatCopy(args.locale);
  const verb = args.isActive ? copy.working : copy.worked;
  if (args.isActive && args.liveElapsed) {
    return { verb, suffix: args.locale === "zh-CN" ? `已持续 ${args.liveElapsed}` : `for ${args.liveElapsed}` };
  }
  if (!args.isActive && args.durationText) {
    return { verb, suffix: args.locale === "zh-CN" ? `持续 ${args.durationText}` : `for ${args.durationText}` };
  }
  return { verb, suffix: null as string | null };
}
