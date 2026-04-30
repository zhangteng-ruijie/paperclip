export type GoalCopyLocale = string | null | undefined;

const goalCopy = {
  en: {
    goal: "Goal",
    goals: "Goals",
    newGoal: "New Goal",
    newSubGoal: "New sub-goal",
    addGoal: "Add Goal",
    subGoal: "Sub Goal",
    goalTitlePlaceholder: "Goal title",
    descriptionPlaceholder: "Add description...",
    parentGoal: "Parent goal",
    noParent: "No parent",
    createGoal: "Create goal",
    createSubGoal: "Create sub-goal",
    creating: "Creating…",
    showProperties: "Show properties",
    status: "Status",
    level: "Level",
    owner: "Owner",
    none: "None",
    parentGoalLabel: "Parent Goal",
    created: "Created",
    updated: "Updated",
    noGoals: "No goals.",
    noGoalsYet: "No goals yet.",
    noSubGoals: "No sub-goals.",
    noLinkedProjects: "No linked projects.",
    selectCompanyToViewGoals: "Select a company to view goals.",
    noCompanySelected: "No company selected",
    subGoalsTab: "Sub-Goals",
    projectsTab: "Projects",
    levels: {
      company: "Company",
      team: "Team",
      agent: "Agent",
      task: "Task",
    },
    statuses: {
      planned: "Planned",
      active: "Active",
      achieved: "Achieved",
      cancelled: "Cancelled",
    },
  },
  "zh-CN": {
    goal: "目标",
    goals: "目标",
    newGoal: "新建目标",
    newSubGoal: "新建子目标",
    addGoal: "添加目标",
    subGoal: "子目标",
    goalTitlePlaceholder: "目标标题",
    descriptionPlaceholder: "添加描述...",
    parentGoal: "父目标",
    noParent: "无父目标",
    createGoal: "创建目标",
    createSubGoal: "创建子目标",
    creating: "创建中…",
    showProperties: "显示属性",
    status: "状态",
    level: "层级",
    owner: "负责人",
    none: "无",
    parentGoalLabel: "父目标",
    created: "创建时间",
    updated: "更新时间",
    noGoals: "还没有目标。",
    noGoalsYet: "还没有目标。",
    noSubGoals: "还没有子目标。",
    noLinkedProjects: "还没有关联项目。",
    selectCompanyToViewGoals: "请选择一个公司以查看目标。",
    noCompanySelected: "尚未选择公司",
    subGoalsTab: "子目标",
    projectsTab: "项目",
    levels: {
      company: "公司",
      team: "团队",
      agent: "智能体",
      task: "任务",
    },
    statuses: {
      planned: "规划中",
      active: "进行中",
      achieved: "已达成",
      cancelled: "已取消",
    },
  },
} as const;

function resolveLocale(locale: GoalCopyLocale) {
  return locale === "zh-CN" ? "zh-CN" : "en";
}

export function getGoalCopy(locale: GoalCopyLocale) {
  return goalCopy[resolveLocale(locale)];
}

export function goalLevelLabel(level: string, locale: GoalCopyLocale): string {
  const copy = getGoalCopy(locale);
  return copy.levels[level as keyof typeof copy.levels] ?? level;
}

export function goalStatusLabel(status: string, locale: GoalCopyLocale): string {
  const copy = getGoalCopy(locale);
  return copy.statuses[status as keyof typeof copy.statuses] ?? status.replace(/_/g, " ");
}

export function formatGoalTabLabel(kind: "subGoals" | "projects", count: number, locale: GoalCopyLocale): string {
  const copy = getGoalCopy(locale);
  const label = kind === "subGoals" ? copy.subGoalsTab : copy.projectsTab;
  return locale === "zh-CN" ? `${label}（${count}）` : `${label} (${count})`;
}
