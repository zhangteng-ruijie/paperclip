import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
import { PLUGIN_ID } from "./constants.js";
import { ruijieAuthProvider } from "./oauth.js";

const manifest = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Ruijie SSO Login",
  description: "Registers Ruijie SID as a Paperclip SSO login provider.",
  author: "Paperclip",
  categories: ["connector"],
  minimumHostVersion: "0.3.0",
  capabilities: [
    "auth.sso.register",
    "http.outbound",
    "secrets.read-ref",
    "instance.settings.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        title: "Enabled",
        default: true,
      },
    },
    additionalProperties: false,
  },
  authProviders: [ruijieAuthProvider],
} satisfies PaperclipPluginManifestV1;

export default manifest;
