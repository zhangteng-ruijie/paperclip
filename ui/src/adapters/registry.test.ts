import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { UIAdapterModule } from "./types";
import {
  findUIAdapter,
  getUIAdapter,
  listUIAdapters,
  registerUIAdapter,
  syncExternalAdapters,
  unregisterUIAdapter,
} from "./registry";
import { processUIAdapter } from "./process";
import { SchemaConfigFields } from "./schema-config-fields";

const externalUIAdapter: UIAdapterModule = {
  type: "external_test",
  label: "External Test",
  parseStdoutLine: () => [],
  ConfigFields: () => null,
  buildAdapterConfig: () => ({}),
};

describe("ui adapter registry", () => {
  beforeEach(() => {
    unregisterUIAdapter("external_test");
    unregisterUIAdapter("hermes_local");
    unregisterUIAdapter("hermes_gateway");
    syncExternalAdapters([]);
  });

  afterEach(() => {
    unregisterUIAdapter("external_test");
    unregisterUIAdapter("hermes_local");
    unregisterUIAdapter("hermes_gateway");
    syncExternalAdapters([]);
  });

  it("registers adapters for lookup and listing", () => {
    registerUIAdapter(externalUIAdapter);

    expect(findUIAdapter("external_test")).toBe(externalUIAdapter);
    expect(getUIAdapter("external_test")).toBe(externalUIAdapter);
    expect(listUIAdapters().some((adapter) => adapter.type === "external_test")).toBe(true);
  });

  it("falls back to the process parser for unknown types after unregistering", () => {
    registerUIAdapter(externalUIAdapter);

    unregisterUIAdapter("external_test");

    expect(findUIAdapter("external_test")).toBeNull();
    const fallback = getUIAdapter("external_test");
    // Unknown types return a lazy-loading wrapper (for external adapters),
    // not the process adapter directly. The type is preserved.
    expect(fallback.type).toBe("external_test");
    // But it uses the schema-based config fields for external adapter forms.
    expect(fallback.ConfigFields).toBe(SchemaConfigFields);
  });

  it("exposes Hermes adapters only from external adapter metadata", () => {
    for (const type of ["hermes_local", "hermes_gateway"]) {
      expect(findUIAdapter(type)).toBeNull();

      syncExternalAdapters([{ type, label: "External Hermes" }]);

      const adapter = getUIAdapter(type);
      expect(adapter.type).toBe(type);
      expect(adapter.label).toBe("External Hermes");
      expect(adapter.ConfigFields).toBe(SchemaConfigFields);
    }
  });
});
