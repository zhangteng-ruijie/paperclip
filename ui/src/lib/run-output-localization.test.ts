import { describe, expect, it } from "vitest";
import { localizeRunOutputText } from "./run-output-localization";

describe("localizeRunOutputText", () => {
  it("localizes resumed session summaries for zh-CN", () => {
    expect(
      localizeRunOutputText(
        "↻ Resumed session 20260410_175024_aa71ab (35 user messages, 229 total messages)",
        "zh-CN",
      ),
    ).toBe("↻ 已恢复会话 20260410_175024_aa71ab（35 条用户消息，229 条总消息）");
  });

  it("localizes dangerous command prompts for zh-CN", () => {
    expect(
      localizeRunOutputText(
        "⚠️ DANGEROUS COMMAND: script execution via -e/-c flag curl -s https://example.com [o]nce | [s]ession | [a]lways | [d]eny Choice [o/s/a/D]: ✗ Denied",
        "zh-CN",
      ),
    ).toContain("⚠️ 危险命令：通过 -e/-c 参数执行脚本");
  });

  it("localizes usage-limit and no-response prefixes for zh-CN", () => {
    expect(
      localizeRunOutputText(
        "You've hit your usage limit. To get more access now, send a message to our sales team and ask for a limit increase.",
        "zh-CN",
      ),
    ).toContain("你已触达当前用量上限。如需立即获得更多额度，请联系销售团队申请提高限制。");

    expect(
      localizeRunOutputText(
        "↻ Resumed session 20260410_175024_aa71ab (10 user messages, 75 total messages) ⚠️ No response to command after timeout",
        "zh-CN",
      ),
    ).toContain("⚠️ 命令在超时前未收到响应");
  });

  it("localizes fallback workspace warnings for zh-CN", () => {
    expect(
      localizeRunOutputText(
        "[paperclip] No project or prior session workspace was available. Using fallback workspace \"/tmp/fallback\" for this run.",
        "zh-CN",
      ),
    ).toBe("[paperclip] 当前既没有项目工作区，也没有可复用的历史会话工作区。本次运行改用后备工作区 \"/tmp/fallback\"。");
  });

  it("leaves English output untouched outside zh-CN", () => {
    const text = "↻ Resumed session 20260410_175024_aa71ab (35 user messages, 229 total messages)";
    expect(localizeRunOutputText(text, "en")).toBe(text);
  });
});
