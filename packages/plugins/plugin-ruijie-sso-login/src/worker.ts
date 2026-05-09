import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { normalizeConfig } from "./config.js";
import { PROVIDER_ID } from "./constants.js";

let currentConfig = normalizeConfig(null);

const plugin = definePlugin({
  async setup(ctx) {
    currentConfig = normalizeConfig(await ctx.config.get());
    ctx.logger.info("Ruijie SSO login plugin ready", {
      providerId: PROVIDER_ID,
      enabled: currentConfig.enabled,
    });
  },

  async onConfigChanged(newConfig) {
    currentConfig = normalizeConfig(newConfig);
  },

  async onValidateConfig(config) {
    normalizeConfig(config);
    return { ok: true };
  },

  async onHealth() {
    return {
      status: "ok",
      message: currentConfig.enabled
        ? "Ruijie SSO provider is registered"
        : "Ruijie SSO provider is disabled by plugin configuration",
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
