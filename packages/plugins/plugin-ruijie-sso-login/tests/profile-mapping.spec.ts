import { describe, expect, it } from "vitest";
import { pluginManifestV1Schema } from "@paperclipai/shared";
import manifest from "../src/manifest.js";
import { ruijieAuthProvider } from "../src/oauth.js";
import { mapRuijieProfile } from "../src/profile-mapping.js";

describe("Ruijie SSO manifest", () => {
  it("declares a valid auth provider with the registered callback and no email mapping", () => {
    expect(pluginManifestV1Schema.parse(manifest).authProviders?.[0]).toMatchObject({
      providerId: "ruijie",
      clientId: "derjagi",
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
    });
  });

  it("maps Ruijie credential role through the manifest for host-side provisioning", () => {
    expect(ruijieAuthProvider.autoProvision).toMatchObject({
      defaultCompanyId: "03a73a01-8754-47c7-bc7f-af7282b10afc",
      defaultMembershipRole: "credential",
      allowlist: { field: "attributes.DWM", values: ["dwm"] },
      active: { field: "attributes.DQZTM", values: ["在任"] },
    });
  });
});

describe("mapRuijieProfile", () => {
  it("accepts active allowlisted users and intentionally leaves email null", () => {
    expect(mapRuijieProfile({
      attributes: {
        GH: "A001",
        XM: "张三",
        DWM: "dwm",
        DQZTM: "在任",
      },
    })).toEqual({
      providerAccountId: "A001",
      name: "张三",
      email: null,
      emailVerified: false,
      eligible: true,
    });
  });

  it("rejects inactive or non-allowlisted profiles", () => {
    expect(mapRuijieProfile({
      attributes: { GH: "A001", XM: "张三", DWM: "dwm", DQZTM: "离职" },
    }).reason).toBe("inactive");
    expect(mapRuijieProfile({
      attributes: { GH: "A001", XM: "张三", DWM: "other", DQZTM: "在任" },
    }).reason).toBe("not_allowlisted");
  });
});
