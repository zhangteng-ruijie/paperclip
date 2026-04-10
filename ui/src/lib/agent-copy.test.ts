import { describe, expect, it } from "vitest";

import {
  agentInvocationSourceLabels,
  formatAgentMoreIssues,
  getAgentCopy,
  thinkingEffortLabel,
} from "./agent-copy";

describe("agent-copy", () => {
  it("returns Chinese agent labels", () => {
    const copy = getAgentCopy("zh-CN");

    expect(copy.assignTask).toBe("分配任务");
    expect(copy.configurationRevisions).toBe("配置修订记录");
    expect(copy.noModelDetectedSelect).toBe("还没有检测到模型，请手动选择或输入。");
  });

  it("formats locale-aware agent helpers", () => {
    expect(formatAgentMoreIssues(3, "zh-CN")).toBe("还有 3 个任务");
    expect(agentInvocationSourceLabels("en").on_demand).toBe("On demand");
    expect(thinkingEffortLabel("xhigh", "zh-CN")).toBe("超高");
    expect(thinkingEffortLabel("plan", "en")).toBe("Plan");
  });
});
