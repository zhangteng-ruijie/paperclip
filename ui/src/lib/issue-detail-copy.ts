type IssueDetailCopyLocale = string | null | undefined;

const COPY = {
  en: {
    issues: "Issues",
    issue: "Issue",
    me: "Me",
    issueUpdateFailed: "Issue update failed",
    unableToSaveIssueChanges: "Unable to save issue changes",
    approvalApproved: "Approval approved",
    approvalRejected: "Approval rejected",
    approvalFailed: "Approval failed",
    rejectionFailed: "Rejection failed",
    unableToUpdateApproval: "Unable to update approval",
    commentFailed: "Comment failed",
    unableToPostComment: "Unable to post comment",
    interruptRequested: "Interrupt requested",
    interruptRequestedBody: "The active run is stopping so queued comments can continue next.",
    interruptFailed: "Interrupt failed",
    unableToInterruptRun: "Unable to interrupt the active run",
    feedbackSaved: "Feedback saved",
    feedbackSavedSharingEnabled: "Feedback saved and sharing enabled",
    feedbackSavedFutureShare: "Feedback saved. Future votes will share",
    feedbackSavedFutureLocal: "Feedback saved. Future votes will stay local",
    failedToSaveFeedback: "Failed to save feedback",
    unknownError: "Unknown error",
    noCompanySelected: "No company selected",
    uploadFailed: "Upload failed",
    documentImportFailed: "Document import failed",
    deleteFailed: "Delete failed",
    issueArchivedFromInbox: "Issue archived from inbox",
    archiveFailed: "Archive failed",
    unableToArchiveIssue: "Unable to archive this issue from the inbox",
    copiedToClipboard: "Copied to clipboard",
    tokenUsage: "Tokens",
  },
  "zh-CN": {
    issues: "任务",
    issue: "任务",
    me: "我",
    issueUpdateFailed: "任务更新失败",
    unableToSaveIssueChanges: "无法保存任务变更",
    approvalApproved: "审批已通过",
    approvalRejected: "审批已拒绝",
    approvalFailed: "审批失败",
    rejectionFailed: "拒绝失败",
    unableToUpdateApproval: "无法更新审批结果",
    commentFailed: "评论发送失败",
    unableToPostComment: "无法发送评论",
    interruptRequested: "已请求中断",
    interruptRequestedBody: "当前运行正在停止，排队中的评论会在下一步继续处理。",
    interruptFailed: "中断失败",
    unableToInterruptRun: "无法中断当前运行",
    feedbackSaved: "反馈已保存",
    feedbackSavedSharingEnabled: "反馈已保存，并已启用共享",
    feedbackSavedFutureShare: "反馈已保存，今后的投票将允许共享",
    feedbackSavedFutureLocal: "反馈已保存，今后的投票将保持本地",
    failedToSaveFeedback: "保存反馈失败",
    unknownError: "未知错误",
    noCompanySelected: "尚未选择公司",
    uploadFailed: "上传失败",
    documentImportFailed: "文档导入失败",
    deleteFailed: "删除失败",
    issueArchivedFromInbox: "任务已从收件箱归档",
    archiveFailed: "归档失败",
    unableToArchiveIssue: "无法从收件箱归档此任务",
    copiedToClipboard: "已复制到剪贴板",
    tokenUsage: "Tokens",
  },
} as const;

export function getIssueDetailCopy(locale: IssueDetailCopyLocale) {
  return COPY[locale === "zh-CN" ? "zh-CN" : "en"];
}

export function issueFeedbackToastTitle(args: {
  locale: IssueDetailCopyLocale;
  sharingPreferenceAtSubmit: "allowed" | "not_allowed" | "prompt";
  allowSharing?: boolean;
}) {
  const copy = getIssueDetailCopy(args.locale);
  if (args.sharingPreferenceAtSubmit === "prompt") {
    return args.allowSharing ? copy.feedbackSavedFutureShare : copy.feedbackSavedFutureLocal;
  }
  return args.allowSharing ? copy.feedbackSavedSharingEnabled : copy.feedbackSaved;
}

export function formatIssueDetailTokenSummary(args: {
  locale: IssueDetailCopyLocale;
  input: string;
  output: string;
  cached: string;
  hasCached: boolean;
}) {
  if (args.locale === "zh-CN") {
    return args.hasCached
      ? `（输入 ${args.input}，输出 ${args.output}，缓存 ${args.cached}）`
      : `（输入 ${args.input}，输出 ${args.output}）`;
  }
  return args.hasCached
    ? ` (in ${args.input}, out ${args.output}, cached ${args.cached})`
    : ` (in ${args.input}, out ${args.output})`;
}
