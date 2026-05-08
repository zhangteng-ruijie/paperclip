import assert from "node:assert/strict";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { genericOAuth } from "better-auth/plugins";

const baseURL = "http://localhost:3123";
const authBasePath = "/api/auth";
const oauthClientSecret = "oauth-client-secret-value";

function cookieHeaderFrom(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie")].filter(Boolean);
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

function createProvider(providerId, opts = {}) {
  const calls = {
    tokenRequests: [],
    secretRefs: [],
  };

  return {
    provider: {
      providerId,
      clientId: `${providerId}-client-id`,
      authorizationUrl: `https://${providerId}.example.test/oauth/authorize`,
      tokenUrl: `https://${providerId}.example.test/oauth/token`,
      scopes: ["openid", "email", "profile"],
      pkce: true,
      disableImplicitSignUp: opts.disableImplicitSignUp ?? true,
      getToken: async ({ code, redirectURI, codeVerifier }) => {
        calls.secretRefs.push(opts.clientSecretRef ?? `${providerId}:client-secret`);
        calls.tokenRequests.push({
          code,
          redirectURI,
          hasCodeVerifier: Boolean(codeVerifier),
          secretResolved: oauthClientSecret.length > 0,
        });
        if (opts.failToken || code === "force-token-error") {
          throw new Error("mock token exchange failed");
        }
        return {
          accessToken: `${providerId}-access-${code}`,
          refreshToken: `${providerId}-refresh-${code}`,
          accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          scopes: ["openid", "email", "profile"],
          raw: { providerId },
        };
      },
      getUserInfo: async () => ({
        id: `${providerId}-subject`,
        email: `${providerId}@example.test`,
        emailVerified: true,
        name: `Mock ${providerId}`,
      }),
    },
    calls,
  };
}

function createAuth(providerConfigs, db = { user: [], session: [], account: [], verification: [] }) {
  return {
    db,
    auth: betterAuth({
      baseURL,
      secret: "better-auth-spike-secret-that-is-long-enough",
      database: memoryAdapter(db),
      trustedOrigins: [baseURL],
      rateLimit: { enabled: false },
      logger: { disabled: true },
      advanced: {
        cookiePrefix: "paperclip-spike",
        useSecureCookies: false,
        disableCSRFCheck: true,
      },
      plugins: [
        genericOAuth({
          config: providerConfigs,
        }),
      ],
    }),
  };
}

async function authFetch(auth, path, init = {}) {
  return auth.handler(new Request(`${baseURL}${authBasePath}${path}`, init));
}

async function startOAuth(auth, body) {
  const response = await authFetch(auth, "/sign-in/oauth2", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseURL,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return {
    response,
    json,
    state: json?.url ? new URL(json.url).searchParams.get("state") : null,
    authorizationURL: json?.url ? new URL(json.url) : null,
    cookie: cookieHeaderFrom(response),
  };
}

async function completeOAuth(auth, providerId, state, code, cookie = "") {
  return authFetch(auth, `/oauth2/callback/${providerId}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {
    method: "GET",
    headers: {
      cookie,
      origin: baseURL,
    },
    redirect: "manual",
  });
}

async function getSession(auth, cookie) {
  return auth.api.getSession({
    headers: new Headers({
      cookie,
    }),
  });
}

async function run() {
  const primary = createProvider("mock-sso", {
    clientSecretRef: "secret://paperclip/sso/mock-sso",
  });
  let providerConfigs = [primary.provider];
  const { auth, db } = createAuth(providerConfigs);

  const noSignUp = await startOAuth(auth, {
    providerId: "mock-sso",
    callbackURL: "/app",
    errorCallbackURL: "/auth/error",
    disableRedirect: true,
  });
  assert.equal(noSignUp.response.status, 200);
  assert.equal(noSignUp.authorizationURL.searchParams.get("client_id"), "mock-sso-client-id");
  assert.equal(noSignUp.authorizationURL.searchParams.get("redirect_uri"), `${baseURL}${authBasePath}/oauth2/callback/mock-sso`);
  assert.equal(noSignUp.authorizationURL.searchParams.get("code_challenge_method"), "S256");
  assert.ok(noSignUp.authorizationURL.searchParams.get("code_challenge"));

  const noSignUpCallback = await completeOAuth(auth, "mock-sso", noSignUp.state, "first-code", noSignUp.cookie);
  assert.equal(noSignUpCallback.status, 302);
  assert.equal(new URL(noSignUpCallback.headers.get("location"), baseURL).pathname, "/auth/error");
  assert.equal(new URL(noSignUpCallback.headers.get("location"), baseURL).searchParams.get("error"), "signup_disabled");
  assert.equal(db.user?.length ?? 0, 0);

  const explicitSignUp = await startOAuth(auth, {
    providerId: "mock-sso",
    callbackURL: "/app?next=%2Fcompany%2Fabc",
    errorCallbackURL: "/auth/error",
    disableRedirect: true,
    requestSignUp: true,
  });
  const signedInCallback = await completeOAuth(auth, "mock-sso", explicitSignUp.state, "signup-code", explicitSignUp.cookie);
  assert.equal(signedInCallback.status, 302);
  assert.equal(signedInCallback.headers.get("location"), "/app?next=%2Fcompany%2Fabc");
  const sessionCookie = cookieHeaderFrom(signedInCallback);
  assert.match(sessionCookie, /paperclip-spike\.session_token=/);
  assert.doesNotMatch(sessionCookie, /__Secure-/);
  const session = await getSession(auth, sessionCookie);
  assert.equal(session?.user?.email, "mock-sso@example.test");
  assert.equal(primary.calls.tokenRequests.at(-1).hasCodeVerifier, true);

  const tokenFailure = await startOAuth(auth, {
    providerId: "mock-sso",
    callbackURL: "/app",
    errorCallbackURL: "/auth/error",
    disableRedirect: true,
    requestSignUp: true,
  });
  const tokenFailureCallback = await completeOAuth(auth, "mock-sso", tokenFailure.state, "force-token-error", tokenFailure.cookie);
  assert.equal(tokenFailureCallback.status, 302);
  assert.equal(new URL(tokenFailureCallback.headers.get("location"), baseURL).searchParams.get("error"), "oauth_code_verification_failed");

  const externalCallback = await startOAuth(auth, {
    providerId: "mock-sso",
    callbackURL: "https://evil.example.test/capture",
    errorCallbackURL: "https://evil.example.test/error",
    disableRedirect: true,
    requestSignUp: true,
  });
  assert.equal(externalCallback.response.status, 403);

  const nestedExternalNext = await startOAuth(auth, {
    providerId: "mock-sso",
    callbackURL: "/app?next=https%3A%2F%2Fevil.example.test%2Fcapture",
    errorCallbackURL: "/auth/error?next=https%3A%2F%2Fevil.example.test%2Ferror",
    disableRedirect: true,
    requestSignUp: true,
  });
  assert.equal(nestedExternalNext.response.status, 200);
  const nestedExternalNextCallback = await completeOAuth(
    auth,
    "mock-sso",
    nestedExternalNext.state,
    "nested-next-code",
    nestedExternalNext.cookie,
  );
  assert.equal(nestedExternalNextCallback.headers.get("location"), "/app?next=https%3A%2F%2Fevil.example.test%2Fcapture");

  const dynamic = createProvider("dynamic-sso");
  const missingDynamic = await startOAuth(auth, {
    providerId: "dynamic-sso",
    callbackURL: "/app",
    disableRedirect: true,
  });
  assert.equal(missingDynamic.response.status, 400);

  providerConfigs = [...providerConfigs, dynamic.provider];
  const stillMissingDynamic = await startOAuth(auth, {
    providerId: "dynamic-sso",
    callbackURL: "/app",
    disableRedirect: true,
  });
  assert.equal(stillMissingDynamic.response.status, 400);

  const mutableConfig = auth.options.plugins.find((plugin) => plugin.id === "generic-oauth").options.config;
  mutableConfig.push(dynamic.provider);
  const mutableDynamic = await startOAuth(auth, {
    providerId: "dynamic-sso",
    callbackURL: "/app",
    disableRedirect: true,
  });
  assert.equal(mutableDynamic.response.status, 200);

  const rebuilt = createAuth(providerConfigs, db);
  const rebuiltDynamic = await startOAuth(rebuilt.auth, {
    providerId: "dynamic-sso",
    callbackURL: "/app",
    disableRedirect: true,
  });
  assert.equal(rebuiltDynamic.response.status, 200);

  const dbSnapshot = JSON.stringify(db);
  const genericConfigSnapshot = JSON.stringify(
    auth.options.plugins.find((plugin) => plugin.id === "generic-oauth").options.config,
  );
  assert.equal(dbSnapshot.includes(oauthClientSecret), false);
  assert.equal(genericConfigSnapshot.includes(oauthClientSecret), false);
  assert.deepEqual(primary.calls.secretRefs, [
    "secret://paperclip/sso/mock-sso",
    "secret://paperclip/sso/mock-sso",
    "secret://paperclip/sso/mock-sso",
    "secret://paperclip/sso/mock-sso",
  ]);

  console.log(JSON.stringify({
    betterAuth: "1.4.18",
    routes: {
      signIn: `${authBasePath}/sign-in/oauth2`,
      callback: `${authBasePath}/oauth2/callback/:providerId`,
    },
    verified: [
      "genericOAuth config builds provider from ready plugin config",
      "sign-in URL includes provider callback route and PKCE S256 challenge",
      "disableImplicitSignUp blocks new users unless requestSignUp is true",
      "callback sets paperclip-scoped session cookie and auth.api.getSession resolves it",
      "errorCallbackURL receives token-exchange failures",
      "Better Auth rejects absolute external callbackURL values",
      "Better Auth preserves nested next query values inside relative callbackURL; host must sanitize app next targets",
      "reassigning provider config array does not update an existing auth instance",
      "in-place mutation of plugin config is observed but should be treated as an implementation detail",
      "rebuilding auth instance with the same DB picks up new provider config",
      "clientSecretRef can be resolved inside getToken without persisting the OAuth client secret",
    ],
    sessionCookiePrefix: "paperclip-spike.session_token",
    usersCreated: db.user?.length ?? 0,
    accountsCreated: db.account?.length ?? 0,
  }, null, 2));
}

await run();
