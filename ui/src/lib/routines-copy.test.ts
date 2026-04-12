import { describe, expect, it } from "vitest";

import {
  formatRoutineAssigneeGroupLabel,
  formatRoutineCount,
  formatRoutineProjectGroupLabel,
  formatRoutineToggleAriaLabel,
  getRoutinesCopy,
  routinePolicyDescription,
  routinePolicyLabel,
} from "./routines-copy";

describe("routines-copy", () => {
  it("returns Chinese routines labels", () => {
    const copy = getRoutinesCopy("zh-CN");

    expect(copy.routines).toBe("例行任务");
    expect(copy.createRoutine).toBe("创建例行任务");
    expect(copy.advancedDeliverySettings).toBe("高级投递设置");
  });

  it("formats routine helper text", () => {
    expect(formatRoutineCount(2, "zh-CN")).toBe("2 个例行任务");
    expect(formatRoutineToggleAriaLabel("日报", true, "zh-CN")).toBe("停用 日报");
    expect(
      formatRoutineProjectGroupLabel("__no_project", new Map<string, { name: string }>(), "en"),
    ).toBe("No project");
    expect(
      formatRoutineAssigneeGroupLabel("__unassigned", new Map<string, { name: string }>(), "zh-CN"),
    ).toBe("未分配");
    expect(routinePolicyLabel("skip_if_active", "zh-CN")).toBe("运行中时跳过");
    expect(routinePolicyDescription("skip_missed", "en")).toContain("missed");
  });
});
