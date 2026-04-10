import { afterEach, describe, expect, it } from "vitest";
import { cliT, resolveCliLocale } from "../localization.js";

const originalLocale = process.env.PAPERCLIP_LOCALE;

afterEach(() => {
  if (originalLocale === undefined) {
    delete process.env.PAPERCLIP_LOCALE;
    return;
  }
  process.env.PAPERCLIP_LOCALE = originalLocale;
});

describe("cli localization", () => {
  it("defaults to english", () => {
    delete process.env.PAPERCLIP_LOCALE;
    expect(resolveCliLocale()).toBe("en");
    expect(cliT("program.description")).toContain("Paperclip CLI");
  });

  it("switches to zh-CN when PAPERCLIP_LOCALE is chinese", () => {
    process.env.PAPERCLIP_LOCALE = "zh-CN";
    expect(resolveCliLocale()).toBe("zh-CN");
    expect(cliT("command.onboard.description")).toBe("交互式首次启动引导");
  });
});
