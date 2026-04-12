import { afterEach, describe, expect, it } from "vitest";
import {
  getRuntimeLocaleConfig,
  resolveRuntimeLocaleConfig,
  setRuntimeLocaleConfig,
} from "./runtime-locale";

const originalConfig = getRuntimeLocaleConfig();

afterEach(() => {
  setRuntimeLocaleConfig(originalConfig);
});

describe("runtime locale config", () => {
  it("resolves zh-CN preferences to Asia/Shanghai and CNY", () => {
    expect(
      resolveRuntimeLocaleConfig({
        locale: "zh-CN",
        timeZone: "Asia/Shanghai",
        currencyCode: "default",
      }),
    ).toEqual({
      locale: "zh-CN",
      timeZone: "Asia/Shanghai",
      currencyCode: "CNY",
    });
  });

  it("keeps explicit currency overrides", () => {
    expect(
      resolveRuntimeLocaleConfig({
        locale: "zh-CN",
        timeZone: "UTC",
        currencyCode: "USD",
      }),
    ).toEqual({
      locale: "zh-CN",
      timeZone: "UTC",
      currencyCode: "USD",
    });
  });
});
