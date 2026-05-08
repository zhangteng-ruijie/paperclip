# Better Auth generic-oauth SSO spike

Issue: `CMPAAAAA-64`

Date: 2026-05-08

Scope: validate Better Auth `generic-oauth` as a candidate host SSO bridge for plugin-provided OAuth/OIDC providers. This is a spike artifact only; it is not production implementation.

## Sources checked

- Project dependency: `server/package.json` pins `better-auth` to `1.4.18`.
- Installed package source:
  - `server/node_modules/better-auth/dist/plugins/generic-oauth/index.mjs`
  - `server/node_modules/better-auth/dist/plugins/generic-oauth/routes.mjs`
  - `server/node_modules/better-auth/dist/plugins/generic-oauth/types.d.mts`
- Official docs snapshot checked through Better Auth LLM docs:
  - `https://www.better-auth.com/llms.txt/docs/plugins/generic-oauth.md`

The current official docs include issuer-validation fields that are not present in the installed `1.4.18` package types/routes, so conclusions here are version-specific to the repo's locked dependency.

## Focused verification

Run from repo root:

```sh
node server/scripts/spikes/better-auth-generic-oauth-sso.mjs
```

The script uses `better-auth`, `better-auth/adapters/memory`, and `genericOAuth` with mock token/user-info functions. It validates the real Better Auth handler without external OAuth network calls.

Verified:

- `genericOAuth({ config: [...] })` can be built from ready plugin SSO config.
- `POST /api/auth/sign-in/oauth2` returns an authorization URL for the configured provider.
- `/api/auth/oauth2/callback/:providerId` completes sign-in when the state/code are valid.
- PKCE works for `pkce: true`; the authorization URL includes `code_challenge_method=S256` and callback token exchange receives a `codeVerifier`.
- `disableImplicitSignUp: true` blocks new users unless the sign-in request includes `requestSignUp: true`.
- Successful callback sets a scoped Better Auth session cookie and `auth.api.getSession` resolves it.
- `errorCallbackURL` receives token-exchange failures.
- Better Auth rejects absolute external `callbackURL` values in `1.4.18`.
- Better Auth preserves nested `next` query values inside a same-origin relative `callbackURL`; the host must sanitize the app-level `next` target before passing a callback URL into Better Auth.
- Reassigning the provider config array after auth creation does not update an existing auth instance.
- In-place mutation of the plugin's `options.config` array is observed by the generic endpoints, but relying on that mutable closure is undocumented. Formal implementation should rebuild or hot-swap the auth instance/handler from persisted ready plugin config.
- `clientSecretRef` can be resolved inside a custom `getToken` closure without putting the OAuth client secret into persisted plugin/auth config.

## Conclusion

Prefer Better Auth `generic-oauth` for the first implementation, with a Paperclip host SSO bridge that:

- stores plugin SSO config with `clientSecretRef`, never plaintext `clientSecret`;
- constructs Better Auth `GenericOAuthConfig` only from ready plugin configs;
- uses a custom `getToken` path for secret resolution when we want to keep the plaintext client secret out of serializable config;
- sanitizes `next`, `callbackURL`, and `errorCallbackURL` to same-origin relative destinations before calling Better Auth, with special handling for nested `next` query values;
- rebuilds or hot-swaps the Better Auth instance/handler after plugin install/config changes.

No hand-written host OAuth callback/session bridge is needed for the first pass unless a target provider requires a callback shape Better Auth `1.4.18` cannot support.

## Formal implementation file range

Expected files:

- `server/src/auth/better-auth.ts`: add generic-oauth plugin config construction and secret-ref aware token exchange.
- `server/src/index.ts`: load ready plugin SSO config before auth instance creation; add a reload/hot-swap path or document restart requirement.
- `server/src/app.ts`: keep `/api/auth/{*authPath}` routing; if hot-swapping, route through a stable wrapper handler.
- `server/src/routes/plugins*.ts` and plugin config services: validate/persist SSO config with `clientSecretRef`.
- `packages/plugins/sdk` types/docs: define SSO provider metadata/config contract.
- `ui/src` auth/plugin settings surfaces: initiate SSO with sanitized `next`.

Testing gate:

- focused unit tests for provider-config construction, secret-ref resolution, and `next` sanitization;
- Better Auth integration test with memory or test DB for sign-in URL, callback success, session cookie, `disableImplicitSignUp`, PKCE, and error callback;
- route regression test that `/api/auth/sign-in/oauth2` and `/api/auth/oauth2/callback/:providerId` still reach the Better Auth handler under Express 5;
- no full production implementation was made in this spike.
