import { describe, expect, it } from "vitest";
import {
  isInternalSsoEmail,
  mapRuijieCredentialRoleToPaperclipRole,
  publicAuthEmail,
  sanitizeAuthNextPath,
} from "../auth/plugin-sso.js";

describe("plugin SSO helpers", () => {
  it("sanitizes auth next paths to same-origin relative paths", () => {
    expect(sanitizeAuthNextPath("/companies/acme?tab=agents")).toBe("/companies/acme?tab=agents");
    expect(sanitizeAuthNextPath("https://evil.example.test/capture")).toBe("/");
    expect(sanitizeAuthNextPath("//evil.example.test/capture")).toBe("/");
  });

  it("hides internal synthetic SSO emails from public auth payloads", () => {
    expect(isInternalSsoEmail("ruijie.hash@sso.paperclip.invalid")).toBe(true);
    expect(publicAuthEmail("ruijie.hash@sso.paperclip.invalid")).toBeNull();
    expect(publicAuthEmail("person@example.test")).toBe("person@example.test");
  });

  it("maps Ruijie credential to least-privilege Paperclip viewer role", () => {
    expect(mapRuijieCredentialRoleToPaperclipRole("credential")).toBe("viewer");
    expect(mapRuijieCredentialRoleToPaperclipRole(null)).toBe("viewer");
  });
});
