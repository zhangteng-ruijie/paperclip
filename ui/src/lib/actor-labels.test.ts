import { afterEach, describe, expect, it } from "vitest";
import { localizedActorLabel, runtimeActorLabel } from "./actor-labels";
import { getRuntimeLocaleConfig, setRuntimeLocaleConfig } from "./runtime-locale";

const originalConfig = getRuntimeLocaleConfig();

afterEach(() => {
  setRuntimeLocaleConfig(originalConfig);
});

describe("actor label helpers", () => {
  it("returns locale-aware static labels", () => {
    expect(localizedActorLabel("system", "zh-CN")).toBe("系统");
    expect(localizedActorLabel("board", "en")).toBe("Board");
  });

  it("uses runtime locale for runtime labels", () => {
    setRuntimeLocaleConfig({
      locale: "zh-CN",
      timeZone: "Asia/Shanghai",
      currencyCode: "CNY",
    });
    expect(runtimeActorLabel("you")).toBe("你");
    expect(runtimeActorLabel("unassigned")).toBe("未分配");
  });
});
