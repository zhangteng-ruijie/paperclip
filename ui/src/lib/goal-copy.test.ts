import { describe, expect, it } from "vitest";
import { formatGoalTabLabel, getGoalCopy, goalLevelLabel, goalStatusLabel } from "./goal-copy";

describe("goal copy helpers", () => {
  it("returns Chinese goal labels for zh-CN", () => {
    const copy = getGoalCopy("zh-CN");
    expect(copy.newGoal).toBe("新建目标");
    expect(goalLevelLabel("agent", "zh-CN")).toBe("智能体");
    expect(goalStatusLabel("achieved", "zh-CN")).toBe("已达成");
  });

  it("formats tab labels with locale-appropriate punctuation", () => {
    expect(formatGoalTabLabel("subGoals", 3, "en")).toBe("Sub-Goals (3)");
    expect(formatGoalTabLabel("projects", 2, "zh-CN")).toBe("项目（2）");
  });
});
