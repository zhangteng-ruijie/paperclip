import type { PluginAuthSsoProviderDeclaration } from "@paperclipai/shared";
import {
  PROVIDER_ID,
  RUIJIE_CLIENT_ID,
  RUIJIE_CLIENT_SECRET_REF,
  RUIJIE_COMPANY_ID,
  RUIJIE_REDIRECT_URI,
} from "./constants.js";

export const ruijieAuthProvider: PluginAuthSsoProviderDeclaration = {
  providerId: PROVIDER_ID,
  displayName: "锐捷 SSO 登录",
  description: "Use Ruijie SID OAuth to sign in to Paperclip.",
  enabled: true,
  authorizationUrl: "https://sid.ruijie.com.cn/oauth2.0/authorize",
  tokenUrl: "https://sid.ruijie.com.cn/oauth2.0/accessToken",
  profileUrl: "https://sid.ruijie.com.cn/oauth2.0/profile",
  clientId: RUIJIE_CLIENT_ID,
  clientSecretRef: RUIJIE_CLIENT_SECRET_REF,
  redirectUri: RUIJIE_REDIRECT_URI,
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
    defaultCompanyId: RUIJIE_COMPANY_ID,
    defaultMembershipRole: "credential",
    allowlist: {
      field: "attributes.DWM",
      values: ["dwm"],
    },
    active: {
      field: "attributes.DQZTM",
      values: ["在任"],
    },
  },
};
