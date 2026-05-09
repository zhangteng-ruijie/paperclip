# Ruijie SSO Login Plugin

Registers the `ruijie` OAuth SSO provider for the Paperclip host auth bridge.

The plugin manifest declares the SID endpoints, PKCE S256, profile mapping, and
auto-provisioning rules. The host resolves `RUIJIE_SSO_CLIENT_SECRET` at token
exchange time from the environment first, then from Paperclip company secrets.

Required upstream redirect URI:

```text
https://de.rjagi.cn/api/auth/sso/ruijie/callback
```
