import { describe, expect, it } from "vitest";

import { getShellCopy, liveRunCountLabel, themeToggleLabel } from "./shell-copy";

describe("shell-copy", () => {
  it("returns Chinese navigation and issue labels", () => {
    const copy = getShellCopy("zh-CN");

    expect(copy.dashboard).toBe("仪表盘");
    expect(copy.newIssue).toBe("新建任务");
    expect(copy.attachments).toBe("附件");
    expect(copy.loadEarlierComments).toBe("加载更早评论");
  });

  it("formats theme toggles and live counts by locale", () => {
    expect(themeToggleLabel("dark", "zh-CN")).toBe("切换到深色模式");
    expect(themeToggleLabel("light", "en")).toBe("Switch to light mode");
    expect(liveRunCountLabel(3, "zh-CN")).toBe("3 运行中");
    expect(liveRunCountLabel(2, "en")).toBe("2 live");
  });
});
