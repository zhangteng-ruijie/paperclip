import { afterEach, describe, expect, it } from "vitest";
import { resolveServerLocale, serverT } from "../localization.js";

const originalLocale = process.env.PAPERCLIP_LOCALE;

afterEach(() => {
  if (originalLocale === undefined) {
    delete process.env.PAPERCLIP_LOCALE;
    return;
  }
  process.env.PAPERCLIP_LOCALE = originalLocale;
});

describe("server localization", () => {
  it("defaults to english", () => {
    delete process.env.PAPERCLIP_LOCALE;
    expect(resolveServerLocale()).toBe("en");
    expect(serverT("startup.mode")).toBe("Mode");
  });

  it("returns chinese copy when PAPERCLIP_LOCALE is zh-CN", () => {
    process.env.PAPERCLIP_LOCALE = "zh-CN";
    expect(resolveServerLocale()).toBe("zh-CN");
    expect(serverT("startup.mode")).toBe("模式");
    expect(serverT("startup.agentJwt.missing")).toContain("缺失");
  });
});
