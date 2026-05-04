import type { Agent } from "@paperclipai/shared";
import { describe, expect, it } from "vitest";
import { formatActivityVerb, formatIssueActivityAction } from "./activity-format";

describe("activity formatting", () => {
  const agentMap = new Map<string, Agent>([
    ["agent-reviewer", { id: "agent-reviewer", name: "Reviewer Bot" } as Agent],
    ["agent-approver", { id: "agent-approver", name: "Approver Bot" } as Agent],
  ]);

  it("formats blocker activity using linked issue identifiers", () => {
    const details = {
      addedBlockedByIssues: [
        { id: "issue-2", identifier: "PAP-22", title: "Blocked task" },
      ],
      removedBlockedByIssues: [],
    };

    expect(formatActivityVerb("issue.blockers_updated", details)).toBe("将 阻塞项 PAP-22 添加到");
    expect(formatIssueActivityAction("issue.blockers_updated", details)).toBe("添加了 阻塞项 PAP-22");
  });

  it("formats reviewer activity using agent names", () => {
    const details = {
      addedParticipants: [
        { type: "agent", agentId: "agent-reviewer", userId: null },
      ],
      removedParticipants: [],
    };

    expect(formatActivityVerb("issue.reviewers_updated", details, { agentMap })).toBe("将 评审人 Reviewer Bot 添加到");
    expect(formatIssueActivityAction("issue.reviewers_updated", details, { agentMap })).toBe("添加了 评审人 Reviewer Bot");
  });

  it("formats approver removals using user-aware labels", () => {
    const details = {
      addedParticipants: [],
      removedParticipants: [
        { type: "user", agentId: null, userId: "local-board" },
      ],
    };

    expect(formatActivityVerb("issue.approvers_updated", details)).toBe("将 审批人 Board 从中移除");
    expect(formatIssueActivityAction("issue.approvers_updated", details)).toBe("移除了 审批人 Board");
  });

  it("falls back to updated wording when reviewers are both added and removed", () => {
    const details = {
      addedParticipants: [
        { type: "agent", agentId: "agent-reviewer", userId: null },
      ],
      removedParticipants: [
        { type: "agent", agentId: "agent-approver", userId: null },
      ],
    };

    expect(formatActivityVerb("issue.reviewers_updated", details, { agentMap })).toBe("更新了评审人");
    expect(formatIssueActivityAction("issue.reviewers_updated", details, { agentMap })).toBe("更新了评审人");
  });

  it("formats monitor activity with direct verbs", () => {
    expect(formatActivityVerb("issue.monitor_scheduled")).toBe("为其安排监控");
    expect(formatActivityVerb("issue.monitor_exhausted")).toBe("耗尽监控次数");
    expect(formatIssueActivityAction("issue.monitor_triggered")).toBe("触发了监控");
    expect(formatIssueActivityAction("issue.monitor_cleared")).toBe("清除了监控");
    expect(formatIssueActivityAction("issue.monitor_recovery_issue_created")).toBe("创建了监控恢复任务");
  });
});
