import { describe, expect, it } from "vitest";
import { formatFeedbackSharingStatus, getCompanySettingsCopy } from "./company-settings-copy";

describe("company-settings-copy", () => {
  it("returns Chinese company settings labels", () => {
    const copy = getCompanySettingsCopy("zh-CN");

    expect(copy.title).toBe("公司设置");
    expect(copy.companyName).toBe("公司名称");
    expect(copy.brandColor).toBe("品牌色");
    expect(copy.requireBoardApproval).toBe("新雇员需经董事会批准");
  });

  it("formats feedback sharing status", () => {
    expect(formatFeedbackSharingStatus({ locale: "zh-CN", enabledAt: null, enabledBy: null })).toBe("当前未启用共享。");
  });
});
