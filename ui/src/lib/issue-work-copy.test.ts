import { describe, expect, it } from "vitest";

import {
  formatIssueDetailTokenSummary,
  getIssueDetailCopy,
  issueFeedbackToastTitle,
} from "./issue-detail-copy";
import {
  formatDocumentRevisionLabel,
  formatDocumentUpdatedAtLabel,
  formatRemoteDocumentRevisionLabel,
  formatViewingDocumentRevisionLabel,
  getIssueDocumentsCopy,
} from "./issue-documents-copy";
import {
  formatIssueChatRunStatus,
  formatIssueChatWorkHeader,
  getIssueChatCopy,
  humanizeIssueChatValue,
} from "./issue-chat-copy";

describe("issue work copy helpers", () => {
  it("returns issue detail copy and summaries", () => {
    const copy = getIssueDetailCopy("zh-CN");

    expect(copy.issueUpdateFailed).toBe("任务更新失败");
    expect(issueFeedbackToastTitle({
      locale: "en",
      sharingPreferenceAtSubmit: "prompt",
      allowSharing: true,
    })).toBe("Feedback saved. Future votes will share");
    expect(formatIssueDetailTokenSummary({
      locale: "zh-CN",
      input: "1.2K",
      output: "300",
      cached: "800",
      hasCached: true,
    })).toBe("（输入 1.2K，输出 300，缓存 800）");
  });

  it("returns issue documents copy labels", () => {
    const copy = getIssueDocumentsCopy("zh-CN");

    expect(copy.documents).toBe("文档");
    expect(formatDocumentRevisionLabel(3, "en")).toBe("rev 3");
    expect(formatViewingDocumentRevisionLabel(4, "zh-CN")).toBe("查看版本 4");
    expect(formatRemoteDocumentRevisionLabel(2, "en")).toBe("Remote revision 2");
    expect(formatDocumentUpdatedAtLabel("2m ago", "zh-CN")).toBe("更新于 2m ago");
  });

  it("returns issue chat copy labels", () => {
    const copy = getIssueChatCopy("zh-CN");

    expect(copy.copyMessage).toBe("复制消息");
    expect(humanizeIssueChatValue("in_progress", "zh-CN")).toBe("进行中");
    expect(formatIssueChatRunStatus("queued", "en")).toBe("queued");
    expect(formatIssueChatWorkHeader({
      locale: "en",
      isActive: true,
      liveElapsed: "12s",
    })).toEqual({ verb: "Working", suffix: "for 12s" });
  });
});
