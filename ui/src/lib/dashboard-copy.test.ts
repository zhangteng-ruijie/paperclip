import { describe, expect, it } from "vitest";

import {
  formatAgentRunStateLabel,
  formatBudgetIncidentLabel,
  formatBudgetIncidentSummary,
  formatMonthSpendDescription,
  formatPendingApprovalsDescription,
  getDashboardCopy,
  issueStatusLegendLabel,
  priorityLegendLabel,
} from "./dashboard-copy";

describe("dashboard-copy", () => {
  it("returns shared dashboard labels", () => {
    const copy = getDashboardCopy("zh-CN");

    expect(copy.dashboard).toBe("仪表盘");
    expect(copy.recentActivity).toBe("最近活动");
    expect(copy.noRunsYet).toBe("还没有运行记录");
  });

  it("formats dashboard summaries by locale", () => {
    expect(formatBudgetIncidentLabel(2, "zh-CN")).toBe("2 个活跃预算事件");
    expect(formatBudgetIncidentSummary(1, 2, 3, "en")).toBe(
      "1 agents paused · 2 projects paused · 3 pending budget approvals",
    );
    expect(formatMonthSpendDescription("$10.00", 25, "en")).toBe("25% of $10.00 budget");
    expect(formatPendingApprovalsDescription(0, "zh-CN")).toBe("等待 board 审核");
    expect(formatAgentRunStateLabel({ isActive: false, finishedAgo: "2m ago", startedAgo: "5m ago" }, "en")).toBe(
      "Finished 2m ago",
    );
  });

  it("formats legend labels", () => {
    expect(priorityLegendLabel("critical", "zh-CN")).toBe("紧急");
    expect(issueStatusLegendLabel("in_review", "en")).toBe("In Review");
  });
});
