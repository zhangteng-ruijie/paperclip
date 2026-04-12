type IssueDocumentsCopyLocale = string | null | undefined;

const COPY = {
  en: {
    failedDeleteDocument: "Failed to delete document",
    failedRestoreDocumentRevision: "Failed to restore document revision",
    invalidDocumentKeyHint: "Use lowercase letters, numbers, -, or _, and start with a letter or number.",
    documentKeyAndBodyRequired: "Document key and body are required",
    documentBodyRequired: "Document body cannot be empty",
    invalidDocumentKey: "Document key must start with a letter or number and use only lowercase letters, numbers, -, or _.",
    remoteChangedCouldNotLoad: "Document changed remotely and the latest version could not be loaded",
    failedToSaveDocument: "Failed to save document",
    couldNotCopyDocument: "Could not copy document",
    saveBeforeViewingOlderRevision: "Save or cancel your local changes before viewing an older revision.",
    newDocument: "New document",
    newShort: "New",
    documents: "Documents",
    documentKey: "Document key",
    optionalTitle: "Optional title",
    markdownBody: "Markdown body",
    cancel: "Cancel",
    saving: "Saving...",
    createDocument: "Create document",
    revisionHistory: "Revision history",
    loadingRevisions: "Loading revisions...",
    current: "Current",
    noRevisionsYet: "No revisions yet",
    copied: "Copied",
    copyDocument: "Copy document",
    documentActions: "Document actions",
    editDocument: "Edit document",
    downloadDocument: "Download document",
    viewDiff: "View diff",
    deleteDocument: "Delete document",
    returnToLatest: "Return to latest",
    restoring: "Restoring...",
    restoreThisRevision: "Restore this revision",
    outOfDate: "Out of date",
    outOfDateDescription: "This document changed while you were editing. Your local draft is preserved and autosave is paused.",
    hideRemote: "Hide remote",
    reviewRemote: "Review remote",
    keepMyDraft: "Keep my draft",
    reloadRemote: "Reload remote",
    overwriteRemote: "Overwrite remote",
    viewingHistoricalRevision: "Viewing historical revision",
    historicalPreviewDescription: "This is a historical preview. Restoring it creates a new latest revision and keeps history append-only.",
    autosaving: "Autosaving...",
    saved: "Saved",
    couldNotSave: "Could not save",
    deleteDocumentConfirm: "Delete this document? This cannot be undone.",
    deleting: "Deleting...",
    delete: "Delete",
  },
  "zh-CN": {
    failedDeleteDocument: "删除文档失败",
    failedRestoreDocumentRevision: "恢复文档版本失败",
    invalidDocumentKeyHint: "请使用小写字母、数字、- 或 _，并以字母或数字开头。",
    documentKeyAndBodyRequired: "文档键和正文不能为空",
    documentBodyRequired: "文档正文不能为空",
    invalidDocumentKey: "文档键必须以字母或数字开头，且只能使用小写字母、数字、- 或 _。",
    remoteChangedCouldNotLoad: "文档在远端已更新，且无法加载最新版本",
    failedToSaveDocument: "保存文档失败",
    couldNotCopyDocument: "无法复制文档",
    saveBeforeViewingOlderRevision: "查看旧版本前，请先保存或取消本地修改。",
    newDocument: "新建文档",
    newShort: "新建",
    documents: "文档",
    documentKey: "文档键",
    optionalTitle: "可选标题",
    markdownBody: "Markdown 正文",
    cancel: "取消",
    saving: "保存中...",
    createDocument: "创建文档",
    revisionHistory: "版本历史",
    loadingRevisions: "正在加载版本...",
    current: "当前",
    noRevisionsYet: "还没有历史版本",
    copied: "已复制",
    copyDocument: "复制文档",
    documentActions: "文档操作",
    editDocument: "编辑文档",
    downloadDocument: "下载文档",
    viewDiff: "查看差异",
    deleteDocument: "删除文档",
    returnToLatest: "返回最新版本",
    restoring: "恢复中...",
    restoreThisRevision: "恢复此版本",
    outOfDate: "版本已过期",
    outOfDateDescription: "你编辑期间文档已被远端更新。你的本地草稿会被保留，自动保存已暂停。",
    hideRemote: "隐藏远端版本",
    reviewRemote: "查看远端版本",
    keepMyDraft: "保留我的草稿",
    reloadRemote: "重新加载远端",
    overwriteRemote: "覆盖远端版本",
    viewingHistoricalRevision: "正在查看历史版本",
    historicalPreviewDescription: "这是历史预览。恢复后会创建一个新的最新版本，并保留追加式的版本历史。",
    autosaving: "自动保存中...",
    saved: "已保存",
    couldNotSave: "无法保存",
    deleteDocumentConfirm: "删除此文档？此操作无法撤销。",
    deleting: "删除中...",
    delete: "删除",
  },
} as const;

export function getIssueDocumentsCopy(locale: IssueDocumentsCopyLocale) {
  return COPY[locale === "zh-CN" ? "zh-CN" : "en"];
}

export function formatDocumentRevisionLabel(revisionNumber: number, locale: IssueDocumentsCopyLocale) {
  return locale === "zh-CN" ? `版本 ${revisionNumber}` : `rev ${revisionNumber}`;
}

export function formatDocumentUpdatedAtLabel(relative: string, locale: IssueDocumentsCopyLocale) {
  return locale === "zh-CN" ? `更新于 ${relative}` : `updated ${relative}`;
}

export function formatViewingDocumentRevisionLabel(revisionNumber: number, locale: IssueDocumentsCopyLocale) {
  return locale === "zh-CN" ? `查看版本 ${revisionNumber}` : `Viewing revision ${revisionNumber}`;
}

export function formatRemoteDocumentRevisionLabel(revisionNumber: number, locale: IssueDocumentsCopyLocale) {
  return locale === "zh-CN" ? `远端版本 ${revisionNumber}` : `Remote revision ${revisionNumber}`;
}
