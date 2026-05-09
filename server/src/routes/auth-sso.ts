import { Router, type Request, type Response as ExpressResponse } from "express";
import type { BetterAuthInstance } from "../auth/better-auth.js";
import {
  sanitizeAuthNextPath,
  type PluginSsoProviderDescriptor,
  type PluginSsoStore,
} from "../auth/plugin-sso.js";
import { notFound } from "../errors.js";

type JsonObject = Record<string, unknown>;

function requestBaseUrl(req: Request): string {
  const forwardedProto = Array.isArray(req.headers["x-forwarded-proto"])
    ? req.headers["x-forwarded-proto"][0]
    : req.headers["x-forwarded-proto"];
  const proto = forwardedProto || req.protocol || "http";
  const host = req.headers[":authority"] || req.headers.host;
  return `${proto}://${host}`;
}

function headersFromRequest(req: Request, overrides?: Record<string, string>): Headers {
  const headers = new Headers();
  for (const [key, raw] of Object.entries(req.headers)) {
    if (!raw) continue;
    if (Array.isArray(raw)) {
      for (const value of raw) headers.append(key, value);
      continue;
    }
    headers.set(key, raw);
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    headers.set(key, value);
  }
  return headers;
}

function splitSetCookieHeader(header: string): string[] {
  return header.split(/,(?=\s*[^;,]+=)/).map((cookie) => cookie.trim()).filter(Boolean);
}

function setCookiesFromAuthResponse(res: ExpressResponse, response: Response): void {
  const withGetSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = withGetSetCookie.getSetCookie?.() ?? (
    response.headers.get("set-cookie")
      ? splitSetCookieHeader(response.headers.get("set-cookie") ?? "")
      : []
  );
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);
}

async function proxyAuthHandler(input: {
  auth: BetterAuthInstance;
  req: Request;
  path: string;
  method?: string;
  body?: JsonObject;
}): Promise<Response> {
  const hasBody = input.body !== undefined;
  return input.auth.handler(new Request(`${requestBaseUrl(input.req)}/api/auth${input.path}`, {
    method: input.method ?? input.req.method,
    headers: headersFromRequest(input.req, hasBody ? {
      "content-type": "application/json",
      accept: "application/json",
    } : undefined),
    body: hasBody ? JSON.stringify(input.body) : undefined,
    redirect: "manual",
  }));
}

function providerResponse(provider: PluginSsoProviderDescriptor) {
  return {
    ...provider,
    signInPath: `/api/auth/sso/${encodeURIComponent(provider.providerId)}/sign-in`,
    errorPath: "/auth",
  };
}

export function authSsoRoutes(store: PluginSsoStore, auth: BetterAuthInstance) {
  const router = Router();

  router.get("/providers", async (_req, res) => {
    const providers = await store.getProviders();
    res.json({ providers: providers.map(providerResponse) });
  });

  router.get("/:providerId/sign-in", async (req, res) => {
    const providerId = req.params.providerId;
    if (!await store.hasProvider(providerId)) {
      throw notFound("SSO provider not found");
    }

    const nextPath = sanitizeAuthNextPath(req.query.next);
    const response = await proxyAuthHandler({
      auth,
      req,
      path: "/sign-in/oauth2",
      method: "POST",
      body: {
        providerId,
        callbackURL: nextPath,
        errorCallbackURL: `/auth?next=${encodeURIComponent(nextPath)}`,
        disableRedirect: true,
        requestSignUp: true,
      },
    });

    setCookiesFromAuthResponse(res, response);
    const payload = await response.json().catch(() => null) as { url?: unknown } | null;
    if (!response.ok || typeof payload?.url !== "string") {
      res.status(response.status).json(payload ?? { error: "SSO sign-in failed" });
      return;
    }

    res.redirect(payload.url);
  });

  router.get("/:providerId/callback", async (req, res) => {
    const providerId = req.params.providerId;
    if (!await store.hasProvider(providerId)) {
      throw notFound("SSO provider not found");
    }

    const queryIndex = req.originalUrl.indexOf("?");
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
    const response = await proxyAuthHandler({
      auth,
      req,
      path: `/oauth2/callback/${encodeURIComponent(providerId)}${query}`,
      method: "GET",
    });

    setCookiesFromAuthResponse(res, response);
    for (const [key, value] of response.headers) {
      if (key.toLowerCase() === "set-cookie") continue;
      res.setHeader(key, value);
    }
    res.status(response.status);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0) res.end();
    else res.send(body);
  });

  return router;
}
