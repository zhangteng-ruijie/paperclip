type InstanceAdminCopyLocale = string | null | undefined;

const instanceAdminCopy = {
  en: {
    instanceSettings: "Instance Settings",
    heartbeats: {
      title: "Scheduler Heartbeats",
      description: "Agents with a timer heartbeat enabled across all of your companies.",
      loading: "Loading scheduler heartbeats...",
      failedLoad: "Failed to load scheduler heartbeats.",
      failedUpdateHeartbeat: "Failed to update heartbeat.",
      failedDisableAllHeartbeats: "Failed to disable all heartbeats.",
      unknownError: "Unknown error",
      active: "active",
      disabled: "disabled",
      company: "company",
      companies: "companies",
      disableAll: "Disable All",
      disabling: "Disabling...",
      noMatches: "No scheduler heartbeats match the current criteria.",
      on: "On",
      off: "Off",
      never: "never",
      fullAgentConfig: "Full agent config",
      enableTimerHeartbeat: "Enable Timer Heartbeat",
      disableTimerHeartbeat: "Disable Timer Heartbeat",
    },
    general: {
      toggleCensorAria: "Toggle username log censoring",
      toggleKeyboardAria: "Toggle keyboard shortcuts",
      backupRetention: "Backup retention",
      backupRetentionDescription:
        "Configure how long to keep automatic database backups at each tier. Daily backups are kept in full, then thinned to one per week and one per month. Backups are compressed with gzip.",
      daily: "Daily",
      weekly: "Weekly",
      monthly: "Monthly",
      day: "day",
      days: "days",
      week: "week",
      weeks: "weeks",
      month: "month",
      months: "months",
    },
    experimental: {
      toggleIsolatedWorkspacesAria: "Toggle isolated workspaces experimental setting",
      toggleAutoRestartAria: "Toggle guarded dev-server auto-restart",
    },
    plugins: {
      managerTitle: "Plugin Manager",
      installPlugin: "Install Plugin",
      pluginsAlpha: "Plugins are alpha.",
    },
    adapters: {
      managerTitle: "Adapter Manager",
      installAdapter: "Install Adapter",
      externalAdaptersAlpha: "External adapters are alpha.",
    },
  },
  "zh-CN": {
    instanceSettings: "实例设置",
    heartbeats: {
      title: "调度心跳",
      description: "查看所有公司中启用了定时心跳的智能体。",
      loading: "正在加载调度心跳…",
      failedLoad: "加载调度心跳失败。",
      failedUpdateHeartbeat: "更新心跳失败。",
      failedDisableAllHeartbeats: "停用全部心跳失败。",
      unknownError: "未知错误",
      active: "启用",
      disabled: "停用",
      company: "公司",
      companies: "公司",
      disableAll: "全部停用",
      disabling: "停用中...",
      noMatches: "当前条件下没有匹配的调度心跳。",
      on: "开启",
      off: "关闭",
      never: "从未",
      fullAgentConfig: "完整智能体配置",
      enableTimerHeartbeat: "启用定时心跳",
      disableTimerHeartbeat: "停用定时心跳",
    },
    general: {
      toggleCensorAria: "切换用户名日志脱敏",
      toggleKeyboardAria: "切换键盘快捷键",
      backupRetention: "备份保留策略",
      backupRetentionDescription:
        "配置自动数据库备份在各级别中的保留时长。每日备份会完整保留，然后逐步收敛为每周一份和每月一份。备份会使用 gzip 压缩。",
      daily: "每日",
      weekly: "每周",
      monthly: "每月",
      day: "天",
      days: "天",
      week: "周",
      weeks: "周",
      month: "个月",
      months: "个月",
    },
    experimental: {
      toggleIsolatedWorkspacesAria: "切换独立工作区实验功能",
      toggleAutoRestartAria: "切换开发服务器自动重启实验功能",
    },
    plugins: {
      managerTitle: "插件管理",
      installPlugin: "安装插件",
      pluginsAlpha: "插件功能仍处于 Alpha 阶段。",
    },
    adapters: {
      managerTitle: "适配器管理",
      installAdapter: "安装适配器",
      externalAdaptersAlpha: "外部适配器仍处于 Alpha 阶段。",
    },
  },
} as const;

function resolveLocale(locale: InstanceAdminCopyLocale) {
  return locale === "zh-CN" ? "zh-CN" : "en";
}

export function getInstanceAdminCopy(locale: InstanceAdminCopyLocale) {
  return instanceAdminCopy[resolveLocale(locale)];
}

export function formatHeartbeatSummary({
  active,
  disabled,
  companies,
  locale,
}: {
  active: number;
  disabled: number;
  companies: number;
  locale: InstanceAdminCopyLocale;
}) {
  const copy = getInstanceAdminCopy(locale);
  if (locale === "zh-CN") {
    return `${active} 个${copy.heartbeats.active} · ${disabled} 个${copy.heartbeats.disabled} · ${companies} 个${copy.heartbeats.company}`;
  }
  return `${active} ${copy.heartbeats.active} · ${disabled} ${copy.heartbeats.disabled} · ${companies} ${companies === 1 ? copy.heartbeats.company : copy.heartbeats.companies}`;
}

export function formatDisableAllHeartbeatsConfirmation(enabledCount: number, locale: InstanceAdminCopyLocale) {
  if (locale === "zh-CN") {
    return `确定要停用全部 ${enabledCount} 个已启用智能体的定时心跳吗？`;
  }
  return `Disable timer heartbeats for all ${enabledCount} enabled agent${enabledCount === 1 ? "" : "s"}?`;
}

export function formatDisableAllHeartbeatsFailure({
  failures,
  enabled,
  detail,
  locale,
}: {
  failures: number;
  enabled: number;
  detail: string;
  locale: InstanceAdminCopyLocale;
}) {
  if (locale === "zh-CN") {
    return failures === 1
      ? `停用 1 个定时心跳失败：${detail}`
      : `停用 ${enabled} 个定时心跳中的 ${failures} 个失败。首个错误：${detail}`;
  }
  return failures === 1
    ? `Failed to disable 1 timer heartbeat: ${detail}`
    : `Failed to disable ${failures} of ${enabled} timer heartbeats. First error: ${detail}`;
}

export function formatRetentionDays(days: number, locale: InstanceAdminCopyLocale) {
  if (locale === "zh-CN") {
    return `${days} 天`;
  }
  const copy = getInstanceAdminCopy(locale);
  return `${days} ${days === 1 ? copy.general.day : copy.general.days}`;
}

export function formatRetentionWeeks(weeks: number, locale: InstanceAdminCopyLocale) {
  if (locale === "zh-CN") {
    return `${weeks} 周`;
  }
  const copy = getInstanceAdminCopy(locale);
  return `${weeks} ${weeks === 1 ? copy.general.week : copy.general.weeks}`;
}

export function formatRetentionMonths(months: number, locale: InstanceAdminCopyLocale) {
  if (locale === "zh-CN") {
    return `${months} 个月`;
  }
  const copy = getInstanceAdminCopy(locale);
  return `${months} ${months === 1 ? copy.general.month : copy.general.months}`;
}

export function formatHeartbeatInterval(seconds: number, locale: InstanceAdminCopyLocale) {
  return locale === "zh-CN" ? `${seconds} 秒` : `${seconds}s`;
}
