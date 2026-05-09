import { describe, expect, it } from "vitest";
import { PLUGIN_CAPABILITIES } from "../constants.js";
import { pluginManagedRoutineDeclarationSchema, pluginManifestV1Schema, pluginUiSlotDeclarationSchema } from "./plugin.js";

describe("plugin capability constants", () => {
  it("exposes each capability once", () => {
    expect(new Set(PLUGIN_CAPABILITIES).size).toBe(PLUGIN_CAPABILITIES.length);
  });
});

describe("plugin managed routine validators", () => {
  it("accepts core issue surface visibility values in routine templates", () => {
    const parsed = pluginManagedRoutineDeclarationSchema.parse({
      routineKey: "wiki.refresh",
      title: "Refresh Wiki",
      issueTemplate: { surfaceVisibility: "default" },
    });

    expect(parsed.issueTemplate?.surfaceVisibility).toBe("default");
  });

  it("rejects non-core issue surface visibility values in routine templates", () => {
    const parsed = pluginManagedRoutineDeclarationSchema.safeParse({
      routineKey: "wiki.refresh",
      title: "Refresh Wiki",
      issueTemplate: { surfaceVisibility: "normal" },
    });

    expect(parsed.success).toBe(false);
  });
});

describe("plugin UI slot validators", () => {
  it("accepts route-scoped sidebar slots with a routePath", () => {
    const parsed = pluginUiSlotDeclarationSchema.parse({
      type: "routeSidebar",
      id: "wiki-route-sidebar",
      displayName: "Wiki Sidebar",
      exportName: "WikiSidebar",
      routePath: "wiki",
    });

    expect(parsed.routePath).toBe("wiki");
  });

  it("requires route-scoped sidebar slots to declare a routePath", () => {
    const parsed = pluginUiSlotDeclarationSchema.safeParse({
      type: "routeSidebar",
      id: "wiki-route-sidebar",
      displayName: "Wiki Sidebar",
      exportName: "WikiSidebar",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe("routeSidebar slots require routePath");
  });

  it("keeps reserved company route protection for route-scoped sidebars", () => {
    const parsed = pluginUiSlotDeclarationSchema.safeParse({
      type: "routeSidebar",
      id: "settings-route-sidebar",
      displayName: "Settings Sidebar",
      exportName: "SettingsSidebar",
      routePath: "settings",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message.includes("reserved by the host"))).toBe(true);
  });
});

describe("plugin auth SSO provider validators", () => {
  const manifest = {
    id: "test.sso",
    apiVersion: 1,
    version: "1.0.0",
    displayName: "Test SSO",
    description: "Test SSO provider",
    author: "Paperclip",
    categories: ["connector"],
    capabilities: ["auth.sso.register"],
    entrypoints: { worker: "./dist/worker.js" },
    authProviders: [{
      providerId: "ruijie",
      displayName: "Ruijie SSO",
      authorizationUrl: "https://sid.ruijie.com.cn/oauth2.0/authorize",
      tokenUrl: "https://sid.ruijie.com.cn/oauth2.0/accessToken",
      profileUrl: "https://sid.ruijie.com.cn/oauth2.0/profile",
      clientId: "derjagi",
      clientSecretRef: "RUIJIE_SSO_CLIENT_SECRET",
      redirectUri: "https://de.rjagi.cn/api/auth/sso/ruijie/callback",
      scope: "",
      usePkce: true,
      pkceMethod: "S256",
      useState: true,
      profileMapping: {
        providerAccountIdField: "attributes.GH",
        nameField: "attributes.XM",
        emailField: null,
        emailVerified: false,
      },
      autoProvision: {
        enabled: true,
        defaultCompanyId: "03a73a01-8754-47c7-bc7f-af7282b10afc",
        defaultMembershipRole: "credential",
        allowlist: { field: "attributes.DWM", values: ["dwm"] },
        active: { field: "attributes.DQZTM", values: ["在任"] },
      },
    }],
  } as const;

  it("accepts SSO providers when auth.sso.register is declared", () => {
    expect(pluginManifestV1Schema.parse(manifest).authProviders?.[0]?.providerId).toBe("ruijie");
  });

  it("requires auth.sso.register when SSO providers are declared", () => {
    const parsed = pluginManifestV1Schema.safeParse({
      ...manifest,
      capabilities: ["http.outbound"],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message.includes("auth.sso.register"))).toBe(true);
  });

  it("rejects duplicate provider ids", () => {
    const parsed = pluginManifestV1Schema.safeParse({
      ...manifest,
      authProviders: [manifest.authProviders[0], manifest.authProviders[0]],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message.includes("Duplicate auth provider ids"))).toBe(true);
  });
});
