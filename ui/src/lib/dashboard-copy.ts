type DashboardCopyLocale = string | null | undefined;

const dashboardCopy = {
  en: {
    dashboard: "Dashboard",
    onboardingMessage: "Welcome to Paperclip. Set up your first company and agent to get started.",
    getStarted: "Get Started",
    selectCompany: "Create or select a company to view the dashboard.",
    noAgents: "You have no agents.",
    agentsHeading: "Agents",
    createOneHere: "Create one here",
    openBudgets: "Open budgets",
    agentsEnabled: "Agents Enabled",
    tasksInProgress: "Tasks In Progress",
    monthSpend: "Month Spend",
    pendingApprovals: "Pending Approvals",
    last14Days: "Last 14 days",
    runActivity: "Run Activity",
    issuesByPriority: "Issues by Priority",
    issuesByStatus: "Issues by Status",
    successRate: "Success Rate",
    recentActivity: "Recent Activity",
    recentTasks: "Recent Tasks",
    noTasksYet: "No tasks yet.",
    noRecentAgentRuns: "No recent agent runs.",
    noRunsYet: "No runs yet",
    noIssues: "No issues",
    liveNow: "Live now",
    finished: "Finished",
    started: "Started",
    unlimitedBudget: "Unlimited budget",
    awaitingBoardReview: "Awaiting board review",
  },
  "zh-CN": {
    dashboard: "仪表盘",
    onboardingMessage: "欢迎使用 Paperclip。先创建你的第一个公司和智能体即可开始。",
    getStarted: "开始使用",
    selectCompany: "创建或选择一个公司以查看仪表盘。",
    noAgents: "你还没有智能体。",
    agentsHeading: "智能体",
    createOneHere: "点此创建",
    openBudgets: "查看预算",
    agentsEnabled: "已启用智能体",
    tasksInProgress: "进行中的任务",
    monthSpend: "本月支出",
    pendingApprovals: "待审批",
    last14Days: "最近 14 天",
    runActivity: "运行活动",
    issuesByPriority: "任务优先级分布",
    issuesByStatus: "任务状态分布",
    successRate: "成功率",
    recentActivity: "最近活动",
    recentTasks: "最近任务",
    noTasksYet: "还没有任务。",
    noRecentAgentRuns: "最近没有智能体运行记录。",
    noRunsYet: "还没有运行记录",
    noIssues: "还没有任务",
    liveNow: "正在运行",
    finished: "完成于",
    started: "开始于",
    unlimitedBudget: "预算不限",
    awaitingBoardReview: "等待 board 审核",
  },
} as const;

function resolveLocale(locale: DashboardCopyLocale) {
  return locale === "zh-CN" ? "zh-CN" : "en";
}

export function getDashboardCopy(locale: DashboardCopyLocale) {
  return dashboardCopy[resolveLocale(locale)];
}

export function formatBudgetIncidentLabel(count: number, locale: DashboardCopyLocale): string {
  if (locale === "zh-CN") {
    return `${count} 个活跃预算事件`;
  }
  return `${count} active budget incident${count === 1 ? "" : "s"}`;
}

export function formatBudgetIncidentSummary(
  pausedAgents: number,
  pausedProjects: number,
  pendingApprovals: number,
  locale: DashboardCopyLocale,
): string {
  if (locale === "zh-CN") {
    return `${pausedAgents} 个智能体已暂停 · ${pausedProjects} 个项目已暂停 · ${pendingApprovals} 个预算审批待处理`;
  }
  return `${pausedAgents} agents paused · ${pausedProjects} projects paused · ${pendingApprovals} pending budget approvals`;
}

export function formatAgentsEnabledDescription(
  running: number,
  paused: number,
  errors: number,
  locale: DashboardCopyLocale,
): string {
  if (locale === "zh-CN") {
    return `${running} 个运行中，${paused} 个暂停，${errors} 个错误`;
  }
  return `${running} running, ${paused} paused, ${errors} errors`;
}

export function formatTasksInProgressDescription(open: number, blocked: number, locale: DashboardCopyLocale): string {
  if (locale === "zh-CN") {
    return `${open} 个打开，${blocked} 个阻塞`;
  }
  return `${open} open, ${blocked} blocked`;
}

export function formatMonthSpendDescription(
  budgetLabel: string,
  utilizationPercent: number,
  locale: DashboardCopyLocale,
): string {
  if (locale === "zh-CN") {
    return `已使用预算 ${budgetLabel} 的 ${utilizationPercent}%`;
  }
  return `${utilizationPercent}% of ${budgetLabel} budget`;
}

export function formatPendingApprovalsDescription(count: number, locale: DashboardCopyLocale): string {
  if (count > 0) {
    return locale === "zh-CN"
      ? `${count} 个预算覆盖等待 board 审核`
      : `${count} budget overrides awaiting board review`;
  }
  return getDashboardCopy(locale).awaitingBoardReview;
}

export function formatAgentRunStateLabel(
  args: { isActive: boolean; finishedAgo?: string | null; startedAgo: string },
  locale: DashboardCopyLocale,
): string {
  const copy = getDashboardCopy(locale);
  if (args.isActive) return copy.liveNow;
  if (args.finishedAgo) return `${copy.finished} ${args.finishedAgo}`;
  return `${copy.started} ${args.startedAgo}`;
}

export function priorityLegendLabel(priority: string, locale: DashboardCopyLocale): string {
  if (locale === "zh-CN") {
    return (
      {
        critical: "紧急",
        high: "高",
        medium: "中",
        low: "低",
      }[priority] ?? priority
    );
  }
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function issueStatusLegendLabel(status: string, locale: DashboardCopyLocale): string {
  if (locale === "zh-CN") {
    return (
      {
        todo: "待办",
        in_progress: "进行中",
        in_review: "待审核",
        done: "已完成",
        blocked: "阻塞",
        cancelled: "已取消",
        backlog: "待规划",
      }[status] ?? status
    );
  }
  return (
    {
      todo: "To Do",
      in_progress: "In Progress",
      in_review: "In Review",
      done: "Done",
      blocked: "Blocked",
      cancelled: "Cancelled",
      backlog: "Backlog",
    }[status] ?? status
  );
}
