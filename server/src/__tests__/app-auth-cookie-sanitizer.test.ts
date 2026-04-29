import { describe, expect, it } from "vitest";
import { sanitizeAuthCookieHeader } from "../app.js";

describe("sanitizeAuthCookieHeader", () => {
  it("removes csrftoken cookie while keeping auth cookies", () => {
    expect(
      sanitizeAuthCookieHeader("csrftoken=abc; better-auth.session_token=token; other=value"),
    ).toBe("better-auth.session_token=token; other=value");
  });

  it("returns undefined when only csrftoken is present", () => {
    expect(sanitizeAuthCookieHeader("csrftoken=abc")).toBeUndefined();
  });

  it("keeps cookie header unchanged when there is no conflicting cookie", () => {
    expect(sanitizeAuthCookieHeader("better-auth.session_token=token; other=value")).toBe(
      "better-auth.session_token=token; other=value",
    );
  });
});
