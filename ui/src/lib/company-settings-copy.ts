type CompanySettingsCopyLocale = string | null | undefined;

const companySettingsCopy = {
  en: {
    title: "Company Settings",
    company: "Company",
    settings: "Settings",
    noCompanySelected: "No company selected. Select a company from the switcher above.",
    general: "General",
    appearance: "Appearance",
    companyName: "Company name",
    companyNameHint: "The display name for your company.",
    description: "Description",
    descriptionHint: "Optional description shown in the company profile.",
    descriptionPlaceholder: "Optional company description",
    logo: "Logo",
    logoHint: "Upload a PNG, JPEG, WEBP, GIF, or SVG logo image.",
    removeLogo: "Remove logo",
    removingLogo: "Removing...",
    logoUploadFailed: "Logo upload failed",
    uploadingLogo: "Uploading logo...",
    brandColor: "Brand color",
    brandColorHint: "Sets the hue for the company icon. Leave empty for auto-generated color.",
    auto: "Auto",
    clear: "Clear",
    saveChanges: "Save changes",
    saving: "Saving...",
    saved: "Saved",
    failedToSave: "Failed to save",
    hiring: "Hiring",
    requireBoardApproval: "Require board approval for new hires",
    requireBoardApprovalHint: "New agent hires stay pending until approved by board.",
    feedbackSharing: "Feedback Sharing",
    feedbackSharingLabel: "Allow sharing voted AI outputs with Paperclip Labs",
    feedbackSharingHint: "Only AI-generated outputs you explicitly vote on are eligible for feedback sharing.",
    feedbackSharingDescription:
      "Votes are always saved locally. This setting controls whether voted AI outputs may also be marked for sharing with Paperclip Labs.",
    feedbackEnabled: "Feedback sharing enabled",
    feedbackDisabled: "Feedback sharing disabled",
    failedToUpdateFeedbackSharing: "Failed to update feedback sharing",
    unknownError: "Unknown error",
    termsVersion: "Terms version",
    readTermsOfService: "Read our terms of service",
    invites: "Invites",
    inviteDescription: "Generate an OpenClaw agent invite snippet.",
    inviteHint: "Creates a short-lived OpenClaw agent invite and renders a copy-ready prompt.",
    generatingInvite: "Generating...",
    generateInvitePrompt: "Generate OpenClaw Invite Prompt",
    invitePromptTitle: "OpenClaw Invite Prompt",
    copied: "Copied",
    copySnippet: "Copy snippet",
    copiedSnippet: "Copied snippet",
    failedToCreateInvite: "Failed to create invite",
    companyPackages: "Company Packages",
    companyPackagesDescription: "Import and export have moved to dedicated pages accessible from the",
    orgChart: "Org Chart",
    companyPackagesDescriptionSuffix: "header.",
    export: "Export",
    import: "Import",
    dangerZone: "Danger Zone",
    archiveDescription: "Archive this company to hide it from the sidebar. This persists in the database.",
    archiving: "Archiving...",
    alreadyArchived: "Already archived",
    archiveCompany: "Archive company",
    failedToArchiveCompany: "Failed to archive company",
  },
  "zh-CN": {
    title: "公司设置",
    company: "公司",
    settings: "设置",
    noCompanySelected: "尚未选择公司。请先从上方切换器选择一个公司。",
    general: "常规",
    appearance: "外观",
    companyName: "公司名称",
    companyNameHint: "用于展示的公司名称。",
    description: "描述",
    descriptionHint: "展示在公司资料中的可选描述。",
    descriptionPlaceholder: "可选的公司描述",
    logo: "Logo",
    logoHint: "上传 PNG、JPEG、WEBP、GIF 或 SVG 格式的 Logo 图片。",
    removeLogo: "移除 Logo",
    removingLogo: "移除中...",
    logoUploadFailed: "Logo 上传失败",
    uploadingLogo: "正在上传 Logo...",
    brandColor: "品牌色",
    brandColorHint: "设置公司图标的主色调。留空时将自动生成颜色。",
    auto: "自动",
    clear: "清空",
    saveChanges: "保存更改",
    saving: "保存中...",
    saved: "已保存",
    failedToSave: "保存失败",
    hiring: "招聘",
    requireBoardApproval: "新雇员需经董事会批准",
    requireBoardApprovalHint: "新智能体的招聘请求会保持待处理状态，直到董事会批准。",
    feedbackSharing: "反馈共享",
    feedbackSharingLabel: "允许与 Paperclip Labs 共享你投票过的 AI 输出",
    feedbackSharingHint: "只有你明确投票过的 AI 生成内容，才会被纳入反馈共享范围。",
    feedbackSharingDescription: "投票记录始终只会保存在本地。此设置决定投票过的 AI 输出是否也会被标记为可与 Paperclip Labs 共享。",
    feedbackEnabled: "已开启反馈共享",
    feedbackDisabled: "已关闭反馈共享",
    failedToUpdateFeedbackSharing: "更新反馈共享设置失败",
    unknownError: "未知错误",
    termsVersion: "条款版本",
    readTermsOfService: "阅读我们的服务条款",
    invites: "邀请",
    inviteDescription: "生成 OpenClaw 智能体邀请片段。",
    inviteHint: "创建一个短时有效的 OpenClaw 智能体邀请，并生成可直接复制的提示词。",
    generatingInvite: "生成中...",
    generateInvitePrompt: "生成 OpenClaw 邀请提示词",
    invitePromptTitle: "OpenClaw 邀请提示词",
    copied: "已复制",
    copySnippet: "复制片段",
    copiedSnippet: "已复制片段",
    failedToCreateInvite: "创建邀请失败",
    companyPackages: "公司包",
    companyPackagesDescription: "导入和导出已迁移到独立页面，可从",
    orgChart: "组织架构",
    companyPackagesDescriptionSuffix: "页头进入。",
    export: "导出",
    import: "导入",
    dangerZone: "危险区域",
    archiveDescription: "归档此公司后，它将从侧边栏中隐藏。此操作会持久保存到数据库。",
    archiving: "归档中...",
    alreadyArchived: "已归档",
    archiveCompany: "归档公司",
    failedToArchiveCompany: "归档公司失败",
  },
} as const;

function resolveLocale(locale: CompanySettingsCopyLocale) {
  return locale === "zh-CN" ? "zh-CN" : "en";
}

export function getCompanySettingsCopy(locale: CompanySettingsCopyLocale) {
  return companySettingsCopy[resolveLocale(locale)];
}

export function formatFeedbackSharingStatus({
  locale,
  enabledAt,
  enabledBy,
}: {
  locale: CompanySettingsCopyLocale;
  enabledAt: string | null;
  enabledBy: string | null;
}) {
  if (!enabledAt) return locale === "zh-CN" ? "当前未启用共享。" : "Sharing is currently disabled.";
  return locale === "zh-CN"
    ? `启用时间 ${enabledAt}${enabledBy ? `，操作者 ${enabledBy}` : ""}`
    : `Enabled ${enabledAt}${enabledBy ? ` by ${enabledBy}` : ""}`;
}

export function formatArchiveCompanyConfirmation(companyName: string, locale: CompanySettingsCopyLocale) {
  return locale === "zh-CN"
    ? `确定要归档公司“${companyName}”吗？归档后它会从侧边栏中隐藏。`
    : `Archive company "${companyName}"? It will be hidden from the sidebar.`;
}
