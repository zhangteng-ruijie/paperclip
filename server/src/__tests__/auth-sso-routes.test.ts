import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { authSsoRoutes } from "../routes/auth-sso.js";
import type { PluginSsoStore } from "../auth/plugin-sso.js";

function createStore(hasProvider = true): PluginSsoStore {
  return {
    providerConfigs: [],
    async reload() {
      return [];
    },
    async getProviders() {
      return hasProvider
        ? [{
            providerId: "ruijie",
            displayName: "锐捷 SSO 登录",
            description: null,
            pluginKey: "ruijie-sso-login",
            callbackPath: "/api/auth/sso/ruijie/callback",
          }]
        : [];
    },
    async hasProvider(providerId: string) {
      return hasProvider && providerId === "ruijie";
    },
    async ensureMembershipForUser() {},
  };
}

function createApp(auth: { handler: (request: Request) => Promise<Response> }, store = createStore()) {
  const app = express();
  app.use("/api/auth/sso", authSsoRoutes(store, auth as any));
  app.use(errorHandler);
  return app;
}

describe("auth SSO routes", () => {
  it("lists ready SSO providers with host sign-in paths", async () => {
    const app = createApp({ handler: vi.fn() });

    const res = await request(app).get("/api/auth/sso/providers");

    expect(res.status).toBe(200);
    expect(res.body.providers[0]).toMatchObject({
      providerId: "ruijie",
      signInPath: "/api/auth/sso/ruijie/sign-in",
      callbackPath: "/api/auth/sso/ruijie/callback",
    });
  });

  it("sanitizes next and preserves Better Auth state cookies during sign-in", async () => {
    const handler = vi.fn(async (authRequest: Request) => {
      const body = await authRequest.json();
      expect(new URL(authRequest.url).pathname).toBe("/api/auth/sign-in/oauth2");
      expect(body).toMatchObject({
        providerId: "ruijie",
        callbackURL: "/",
        errorCallbackURL: "/auth?next=%2F",
        requestSignUp: true,
        disableRedirect: true,
      });
      return Response.json(
        { url: "https://sid.ruijie.com.cn/oauth2.0/authorize?state=state-1" },
        { headers: { "set-cookie": "paperclip.oauth_state=state-1; Path=/; HttpOnly" } },
      );
    });
    const app = createApp({ handler });

    const res = await request(app)
      .get("/api/auth/sso/ruijie/sign-in")
      .query({ next: "https://evil.example.test/capture" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://sid.ruijie.com.cn/oauth2.0/authorize?state=state-1");
    expect(res.headers["set-cookie"]?.[0]).toContain("paperclip.oauth_state=state-1");
  });

  it("proxies the registered SSO callback path to Better Auth", async () => {
    const handler = vi.fn(async (authRequest: Request) => {
      const url = new URL(authRequest.url);
      expect(url.pathname).toBe("/api/auth/oauth2/callback/ruijie");
      expect(url.searchParams.get("code")).toBe("code-1");
      return new Response(null, {
        status: 302,
        headers: {
          location: "/",
          "set-cookie": "paperclip.session_token=session-1; Path=/; HttpOnly",
        },
      });
    });
    const app = createApp({ handler });

    const res = await request(app).get("/api/auth/sso/ruijie/callback?code=code-1&state=state-1");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    expect(res.headers["set-cookie"]?.[0]).toContain("paperclip.session_token=session-1");
  });
});
