import { describe, expect, it } from "vitest";
import {
  createPluginSecretsHandler,
  extractSecretRefPathsFromConfig,
  PLUGIN_SECRET_REFS_DISABLED_MESSAGE,
} from "../services/plugin-secrets-handler.js";

describe("createPluginSecretsHandler", () => {
  it("fails closed for plugin secret resolution until company scoping lands", async () => {
    const handler = createPluginSecretsHandler({
      db: {} as never,
      pluginId: "11111111-1111-4111-8111-111111111111",
    });

    await expect(
      handler.resolve({ secretRef: "77777777-7777-4777-8777-777777777777" }),
    ).rejects.toThrow(PLUGIN_SECRET_REFS_DISABLED_MESSAGE);
  });

  it("still rejects malformed secret refs before the feature-disable guard", async () => {
    const handler = createPluginSecretsHandler({
      db: {} as never,
      pluginId: "11111111-1111-4111-8111-111111111111",
    });

    await expect(
      handler.resolve({ secretRef: "not-a-uuid" }),
    ).rejects.toThrow(/invalid secret reference/i);
  });
});

describe("extractSecretRefPathsFromConfig", () => {
  it("should NOT flag known ID fields (companyId, targetAgentId, projectId) as secret refs", () => {
    // This config mimics the Feishu connector's route config with UUIDs in ID fields
    const config = {
      routes: [
        {
          id: "test-route",
          companyId: "6139d772-bbec-4a54-bfd3-76a66499469d",
          targetAgentId: "122775a1-7415-469f-a950-5583252a32df",
          projectId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          connectionId: "my-bot-connection",
        },
      ],
      connections: [
        {
          id: "my-bot-connection",
          name: "Test Bot",
          profileName: "test-profile",
        },
      ],
    };

    // No schema provided - fallback path
    const result = extractSecretRefPathsFromConfig(config, null);

    // Known ID fields should NOT be flagged
    expect(result.size).toBe(0);
  });

  it("should flag UUIDs in non-ID fields as potential secret refs", () => {
    const config = {
      apiKey: "77777777-7777-4777-8777-777777777777",
      token: "88888888-8888-4888-8888-888888888888",
      data: {
        secret: "99999999-9999-4999-8999-999999999999",
      },
    };

    // No schema provided - fallback path
    const result = extractSecretRefPathsFromConfig(config, null);

    // These should be flagged since they're not known ID fields
    expect(result.size).toBe(3);
  });

  it("should skip ID fields in nested arrays", () => {
    const config = {
      items: [
        { companyId: "11111111-1111-4111-8111-111111111111", name: "item1" },
        { projectId: "22222222-2222-4222-8222-222222222222", name: "item2" },
      ],
    };

    const result = extractSecretRefPathsFromConfig(config, null);

    // ID fields in arrays should also be skipped
    expect(result.size).toBe(0);
  });
});
