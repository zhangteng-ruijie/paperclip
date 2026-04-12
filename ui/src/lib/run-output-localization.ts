type RunOutputLocale = string | null | undefined;

function isZhLocale(locale: RunOutputLocale) {
  return locale === "zh-CN";
}

function localizeSessionResetReason(reason: string) {
  return reason
    .replaceAll("forceFreshSession was requested", "请求了 forceFreshSession")
    .replaceAll("wake reason is issue_assigned", "唤醒原因是 issue_assigned")
    .replaceAll("wake reason is execution_review_requested", "唤醒原因是 execution_review_requested")
    .replaceAll("wake reason is execution_approval_requested", "唤醒原因是 execution_approval_requested")
    .replaceAll("wake reason is execution_changes_requested", "唤醒原因是 execution_changes_requested");
}

export function localizeRunOutputText(text: string, locale: RunOutputLocale): string {
  if (!isZhLocale(locale) || !text.trim()) return text;

  return text
    .replace(
      /\[paperclip\] No project or prior session workspace was available\. Using fallback workspace "([^"]+)" for this run\./g,
      "[paperclip] 当前既没有项目工作区，也没有可复用的历史会话工作区。本次运行改用后备工作区 \"$1\"。",
    )
    .replace(
      /\[paperclip\] No project workspace directory is currently available for this issue\. Using fallback workspace "([^"]+)" for this run\./g,
      "[paperclip] 当前这个任务还没有可用的项目工作区目录。本次运行改用后备工作区 \"$1\"。",
    )
    .replace(
      /\[paperclip\] Saved session workspace "([^"]+)" is not available\. Using fallback workspace "([^"]+)" for this run\./g,
      "[paperclip] 已保存的会话工作区 \"$1\" 当前不可用。本次运行改用后备工作区 \"$2\"。",
    )
    .replace(
      /\[paperclip\] Project workspace has no local cwd configured\. Using fallback workspace "([^"]+)" for this run\./g,
      "[paperclip] 项目工作区还没有配置本地 cwd。本次运行改用后备工作区 \"$1\"。",
    )
    .replace(
      /\[paperclip\] Project workspace path "([^"]+)" is not available yet\. Using fallback workspace "([^"]+)" for this run\./g,
      "[paperclip] 项目工作区路径 \"$1\" 目前还不可用。本次运行改用后备工作区 \"$2\"。",
    )
    .replace(
      /\[paperclip\] Project workspace path "([^"]+)" and (\d+) other configured path\(s\) are not available yet\. Using fallback workspace "([^"]+)" for this run\./g,
      "[paperclip] 项目工作区路径 \"$1\" 以及另外 $2 个已配置路径目前还不可用。本次运行改用后备工作区 \"$3\"。",
    )
    .replace(
      /\[paperclip\] Project workspace "([^"]+)" is now available\. Attempting to resume session "([^"]+)" that was previously saved in fallback workspace "([^"]+)"\./g,
      "[paperclip] 项目工作区 \"$1\" 现在已经可用。正在尝试恢复之前保存在后备工作区 \"$3\" 里的会话 \"$2\"。",
    )
    .replace(
      /\[paperclip\] Skipping saved session resume for task "([^"]+)" because ([^.]+)\./g,
      (_match, taskKey: string, reason: string) =>
        `[paperclip] 已跳过任务 "${taskKey}" 的已保存会话恢复，因为${localizeSessionResetReason(reason)}。`,
    )
    .replace(
      /\[paperclip\] Skipping saved session resume because ([^.]+)\./g,
      (_match, reason: string) =>
        `[paperclip] 已跳过已保存会话恢复，因为${localizeSessionResetReason(reason)}。`,
    )
    .replace(
      /↻ Resumed session ([^\s]+) \((\d+) user messages?, (\d+) total messages?\)/g,
      "↻ 已恢复会话 $1（$2 条用户消息，$3 条总消息）",
    )
    .replace(
      /API call failed \(attempt (\d+)\/(\d+)\):/g,
      "API 调用失败（第 $1/$2 次尝试）：",
    )
    .replace(/⚠️?\s*DANGEROUS COMMAND:/g, "⚠️ 危险命令：")
    .replaceAll("script execution via -e/-c flag", "通过 -e/-c 参数执行脚本")
    .replaceAll("You've hit your usage limit.", "你已触达当前用量上限。")
    .replaceAll(
      "To get more access now, send a request to your administrator or organization owner.",
      "如需立即获得更多额度，请联系你的管理员或组织所有者。",
    )
    .replaceAll(
      "To get more access now, send a message to our sales team and ask for a limit increase.",
      "如需立即获得更多额度，请联系销售团队申请提高限制。",
    )
    .replaceAll("To get more access now, send a", "如需立即获得更多额度，请联系")
    .replaceAll("request to your administrator or organization owner", "你的管理员或组织所有者")
    .replaceAll("request to your admin", "你的管理员")
    .replace(/or try again at ([^.]+)\.?/g, "或在 $1 后重试。")
    .replaceAll("or try again", "或稍后重试")
    .replaceAll("No response to command after timeout", "命令在超时前未收到响应")
    .replaceAll("No response from command after timeout", "命令在超时前未收到响应")
    .replaceAll("No response to", "未收到")
    .replaceAll("No response from", "未收到来自")
    .replaceAll("No response", "未收到响应")
    .replaceAll("[o]nce", "[o]单次")
    .replaceAll("[s]ession", "[s]本会话")
    .replaceAll("[a]lways", "[a]始终允许")
    .replaceAll("[d]eny", "[d]拒绝")
    .replaceAll("Choice [o/s/a/D]:", "选择 [o/s/a/D]：")
    .replaceAll("✗ Denied", "✗ 已拒绝")
    .replace(/\b(\d{1,2}:\d{2})\s*AM\b/g, "上午 $1")
    .replace(/\b(\d{1,2}:\d{2})\s*PM\b/g, "下午 $1")
    .replace(/请联系\s+/g, "请联系")
    .replace(/管理员\s+或/g, "管理员或")
    .replace(/。\s+如需立即获得更多额度/g, "。如需立即获得更多额度")
    .replace(/⚠️ 危险命令：\s+/g, "⚠️ 危险命令：")
    .replace(/选择 \[o\/s\/a\/D\]：\s+/g, "选择 [o/s/a/D]：");
}
