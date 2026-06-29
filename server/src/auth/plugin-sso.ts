import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { BetterAuthPlugin } from "better-auth";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins";
import type { Db } from "@paperclipai/db";
import {
  authAccounts,
  companySecrets,
  companyMemberships,
  companySecretVersions,
  pluginConfig,
  plugins,
} from "@paperclipai/db";
import type { PaperclipPluginManifestV1, PluginAuthSsoProviderDeclaration } from "@paperclipai/shared";
import { getSecretProvider } from "../secrets/provider-registry.js";

const INTERNAL_SSO_EMAIL_DOMAIN = "sso.paperclip.invalid";
const SSO_PROFILE_HANDLE_PREFIX = "paperclip-sso-profile:";
const PROFILE_HANDLE_TTL_MS = 2 * 60 * 1000;

type PreparedProfile = {
  id: string;
  name: string;
  email: string;
  emailVerified: false;
  image?: string;
};

type PendingProfile = {
  profile: PreparedProfile;
  expiresAt: number;
};

export type PluginSsoProviderDescriptor = {
  providerId: string;
  displayName: string;
  description: string | null;
  pluginKey: string;
  callbackPath: string;
};

export type PluginSsoProviderRuntime = PluginSsoProviderDescriptor & {
  declaration: PluginAuthSsoProviderDeclaration;
};

export type PluginSsoStore = {
  providerConfigs: GenericOAuthConfig[];
  getProviders(): Promise<PluginSsoProviderDescriptor[]>;
  reload(): Promise<GenericOAuthConfig[]>;
  hasProvider(providerId: string): Promise<boolean>;
  ensureMembershipForUser(userId: string): Promise<void>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (!segment) return undefined;
    const record = asObject(current);
    if (!record || !Object.prototype.hasOwnProperty.call(record, segment)) return undefined;
    current = record[segment];
  }
  return current;
}

function stringFromPath(source: unknown, path: string): string | null {
  const value = readPath(source, path);
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function scopeArray(scope: string | string[] | undefined): string[] {
  if (Array.isArray(scope)) return scope.map((item) => item.trim()).filter(Boolean);
  if (typeof scope !== "string") return [];
  const trimmed = scope.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
}

function internalSsoEmail(providerId: string, providerAccountId: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${providerId}:${providerAccountId}`)
    .digest("hex")
    .slice(0, 32);
  return `${providerId}.${digest}@${INTERNAL_SSO_EMAIL_DOMAIN}`;
}

export function isInternalSsoEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${INTERNAL_SSO_EMAIL_DOMAIN}`);
}

export function publicAuthEmail(email: string | null | undefined): string | null {
  return isInternalSsoEmail(email) ? null : email ?? null;
}

export function mapRuijieCredentialRoleToPaperclipRole(role: string | null | undefined): string {
  // Ruijie confirmed `credential`; Paperclip human roles are owner/admin/operator/viewer.
  // Map to viewer as the least-privileged role that still permits company login/read access.
  return role === "credential" ? "viewer" : role || "viewer";
}

function isAllowedByRule(profile: unknown, rule: { field: string; values: string[] } | undefined): boolean {
  if (!rule) return true;
  const value = stringFromPath(profile, rule.field);
  return value !== null && rule.values.includes(value);
}

function prepareProfile(provider: PluginAuthSsoProviderDeclaration, profile: unknown): PreparedProfile | null {
  const providerAccountId = stringFromPath(profile, provider.profileMapping.providerAccountIdField);
  if (!providerAccountId) return null;
  if (!isAllowedByRule(profile, provider.autoProvision?.active)) return null;
  if (!isAllowedByRule(profile, provider.autoProvision?.allowlist)) return null;

  const name = stringFromPath(profile, provider.profileMapping.nameField) ?? providerAccountId;
  const emailField = provider.profileMapping.emailField;
  const mappedEmail = emailField ? stringFromPath(profile, emailField) : null;
  return {
    id: providerAccountId,
    name,
    // Better Auth 1.4 requires a non-null email. We never use Ruijie email for
    // linking; this internal address exists only to satisfy that storage shape.
    email: mappedEmail ?? internalSsoEmail(provider.providerId, providerAccountId),
    emailVerified: false,
  };
}

async function resolveSecretByRef(db: Db, companyId: string, ref: string): Promise<string> {
  const envValue = process.env[ref];
  if (envValue && envValue.trim().length > 0) return envValue;

  const secret = await db
    .select()
    .from(companySecrets)
    .where(and(eq(companySecrets.companyId, companyId), eq(companySecrets.name, ref)))
    .then((rows) => rows[0] ?? null);
  const secretById = secret ?? await db
    .select()
    .from(companySecrets)
    .where(and(eq(companySecrets.companyId, companyId), eq(companySecrets.id, ref)))
    .then((rows) => rows[0] ?? null);
  if (!secretById) throw new Error("SSO client secret is not configured");

  const version = await db
    .select()
    .from(companySecretVersions)
    .where(
      and(
        eq(companySecretVersions.secretId, secretById.id),
        eq(companySecretVersions.version, secretById.latestVersion),
      ),
    )
    .then((rows) => rows[0] ?? null);
  if (!version) throw new Error("SSO client secret version is not configured");

  const provider = getSecretProvider(secretById.provider as Parameters<typeof getSecretProvider>[0]);
  return provider.resolveVersion({
    material: version.material as Record<string, unknown>,
    externalRef: secretById.externalRef,
  });
}

async function exchangeAuthorizationCode(input: {
  provider: PluginAuthSsoProviderDeclaration;
  code: string;
  codeVerifier?: string;
  clientSecret: string;
}): Promise<Record<string, unknown>> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", input.provider.clientId);
  body.set("client_secret", input.clientSecret);
  body.set("redirect_uri", input.provider.redirectUri);
  body.set("code", input.code);
  if (input.provider.usePkce && input.codeVerifier) body.set("code_verifier", input.codeVerifier);

  const response = await fetch(input.provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("SSO token exchange failed");
  }
  return payload as Record<string, unknown>;
}

async function fetchProfile(provider: PluginAuthSsoProviderDeclaration, tokenPayload: Record<string, unknown>): Promise<unknown> {
  const accessToken = typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : null;
  if (!accessToken) throw new Error("SSO token response did not include an access token");
  const url = new URL(provider.profileUrl);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("SSO profile fetch failed");
  }
  return payload;
}

function cleanupPendingProfiles(pendingProfiles: Map<string, PendingProfile>): void {
  const now = Date.now();
  for (const [key, value] of pendingProfiles) {
    if (value.expiresAt <= now) pendingProfiles.delete(key);
  }
}

function buildProviderConfig(input: {
  db: Db;
  provider: PluginSsoProviderRuntime;
  pendingProfiles: Map<string, PendingProfile>;
}): GenericOAuthConfig {
  const { db, provider, pendingProfiles } = input;
  const declaration = provider.declaration;
  const companyId = declaration.autoProvision?.defaultCompanyId;
  return {
    providerId: declaration.providerId,
    clientId: declaration.clientId,
    clientSecret: "",
    authorizationUrl: declaration.authorizationUrl,
    tokenUrl: declaration.tokenUrl,
    userInfoUrl: declaration.profileUrl,
    redirectURI: declaration.redirectUri,
    scopes: scopeArray(declaration.scope),
    pkce: declaration.usePkce ?? false,
    disableImplicitSignUp: true,
    disableSignUp: declaration.autoProvision?.enabled !== true,
    async getToken({ code, codeVerifier }) {
      if (!companyId) throw new Error("SSO auto-provision company is not configured");
      const clientSecret = await resolveSecretByRef(db, companyId, declaration.clientSecretRef);
      const tokens = await exchangeAuthorizationCode({
        provider: declaration,
        code,
        codeVerifier,
        clientSecret,
      });
      const profile = await fetchProfile(declaration, tokens);
      const mapped = prepareProfile(declaration, profile);
      if (!mapped) throw new Error("SSO profile is not eligible");
      cleanupPendingProfiles(pendingProfiles);
      const handle = `${SSO_PROFILE_HANDLE_PREFIX}${crypto.randomUUID()}`;
      pendingProfiles.set(handle, {
        profile: mapped,
        expiresAt: Date.now() + PROFILE_HANDLE_TTL_MS,
      });
      return {
        accessToken: handle,
        accessTokenExpiresAt: new Date(Date.now() + PROFILE_HANDLE_TTL_MS),
        scopes: scopeArray(declaration.scope),
      };
    },
    async getUserInfo(tokens) {
      const handle = typeof tokens.accessToken === "string" ? tokens.accessToken : "";
      const pending = pendingProfiles.get(handle);
      pendingProfiles.delete(handle);
      if (!pending || pending.expiresAt <= Date.now()) return null;
      return pending.profile;
    },
  };
}

function runtimeFromManifest(plugin: {
  id: string;
  pluginKey: string;
  manifestJson: PaperclipPluginManifestV1;
}): PluginSsoProviderRuntime[] {
  const manifest = plugin.manifestJson;
  if (!manifest.capabilities.includes("auth.sso.register")) return [];
  return (manifest.authProviders ?? [])
    .filter((provider) => provider.enabled !== false)
    .map((provider) => ({
      providerId: provider.providerId,
      displayName: provider.displayName,
      description: provider.description ?? null,
      pluginKey: plugin.pluginKey,
      callbackPath: `/api/auth/sso/${provider.providerId}/callback`,
      declaration: provider,
    }));
}

export function createPluginSsoStore(db: Db): PluginSsoStore {
  const providerConfigs: GenericOAuthConfig[] = [];
  const runtimesByProvider = new Map<string, PluginSsoProviderRuntime>();
  const pendingProfiles = new Map<string, PendingProfile>();

  async function loadRuntimes(): Promise<PluginSsoProviderRuntime[]> {
    const rows = await db
      .select({
        id: plugins.id,
        pluginKey: plugins.pluginKey,
        manifestJson: plugins.manifestJson,
        configJson: pluginConfig.configJson,
      })
      .from(plugins)
      .leftJoin(pluginConfig, eq(pluginConfig.pluginId, plugins.id))
      .where(eq(plugins.status, "ready"));

    return rows.flatMap((row) => {
      const runtimes = runtimeFromManifest(row);
      const config = asObject(row.configJson) ?? {};
      const enabled = typeof config.enabled === "boolean" ? config.enabled : true;
      return enabled ? runtimes : [];
    });
  }

  async function reload() {
    const runtimes = await loadRuntimes();
    runtimesByProvider.clear();
    for (const runtime of runtimes) runtimesByProvider.set(runtime.providerId, runtime);
    providerConfigs.splice(
      0,
      providerConfigs.length,
      ...runtimes.map((provider) => buildProviderConfig({ db, provider, pendingProfiles })),
    );
    return providerConfigs;
  }

  async function getProviders() {
    await reload();
    return Array.from(runtimesByProvider.values()).map((provider) => ({
      providerId: provider.providerId,
      displayName: provider.displayName,
      description: provider.description,
      pluginKey: provider.pluginKey,
      callbackPath: provider.callbackPath,
    }));
  }

  async function hasProvider(providerId: string) {
    await reload();
    return runtimesByProvider.has(providerId);
  }

  async function ensureMembershipForUser(userId: string) {
    await reload();
    const providerIds = Array.from(runtimesByProvider.keys());
    if (providerIds.length === 0) return;
    const accounts = await db
      .select({ providerId: authAccounts.providerId })
      .from(authAccounts)
      .where(and(eq(authAccounts.userId, userId), inArray(authAccounts.providerId, providerIds)));
    if (accounts.length === 0) return;

    for (const account of accounts) {
      const runtime = runtimesByProvider.get(account.providerId);
      const autoProvision = runtime?.declaration.autoProvision;
      if (!autoProvision?.enabled || !autoProvision.defaultCompanyId) continue;
      const membershipRole = mapRuijieCredentialRoleToPaperclipRole(autoProvision.defaultMembershipRole);
      const existing = await db
        .select({ id: companyMemberships.id })
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.companyId, autoProvision.defaultCompanyId),
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (existing) {
        await db
          .update(companyMemberships)
          .set({ status: "active", membershipRole, updatedAt: new Date() })
          .where(eq(companyMemberships.id, existing.id));
      } else {
        await db.insert(companyMemberships).values({
          companyId: autoProvision.defaultCompanyId,
          principalType: "user",
          principalId: userId,
          status: "active",
          membershipRole,
        });
      }
    }
  }

  return {
    providerConfigs,
    getProviders,
    reload,
    hasProvider,
    ensureMembershipForUser,
  };
}

export function createGenericOAuthPlugin(store: PluginSsoStore): BetterAuthPlugin {
  return genericOAuth({
    config: store.providerConfigs,
  }) as BetterAuthPlugin;
}

export function sanitizeAuthNextPath(rawNext: unknown, fallback = "/"): string {
  if (typeof rawNext !== "string") return fallback;
  const trimmed = rawNext.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  try {
    const parsed = new URL(trimmed, "http://paperclip.local");
    if (parsed.origin !== "http://paperclip.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
