import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildBaseRecord,
  buildSessionKey,
  describeRouteEntry,
  describeRouteForHumans,
  feishuContextLines,
  extractInboundMessage,
  isLikelyInternalRouteName,
  renderTemplate,
  resolveRoute,
} from "../src/routing.js";
import {
  buildRecordUpsertArgs,
  buildMessageGetArgs,
  buildReplyMessageArgs,
  buildResourceDownloadArgs,
  buildSendMessageArgs,
  resolveLarkCliBin,
} from "../src/lark-cli.js";
import { planEventSubscribers } from "../src/subscriber-plan.js";
import type { FeishuConnectorConfig } from "../src/types.js";

describe("Feishu routing helpers", () => {
  it("extracts compact and raw message fields defensively", () => {
    const message = extractInboundMessage({
      header: { event_id: "evt-1" },
      event: {
        sender: { sender_id: { open_id: "ou_boss" }, name: "Boss" },
        message: {
          message_id: "om_1",
          chat_id: "oc_boss",
          root_id: "om_root",
          content: "{\"text\":\"Need more AI chip news\"}",
        },
      },
    }, "news-bot");

    expect(message.connectionId).toBe("news-bot");
    expect(message.eventId).toBe("evt-1");
    expect(message.messageId).toBe("om_1");
    expect(message.chatId).toBe("oc_boss");
    expect(message.rootMessageId).toBe("om_root");
    expect(message.senderOpenId).toBe("ou_boss");
    expect(message.text).toBe("Need more AI chip news");
    expect(message.attachments).toEqual([]);
  });

  it("extracts Feishu image and file resource keys as attachments", () => {
    const image = extractInboundMessage({
      message_id: "om_img",
      message_type: "image",
      chat_id: "oc_boss",
      content: "{\"image_key\":\"img_v3_abc\"}",
    });
    expect(image.text).toBe("[图片：img_v3_abc]");
    expect(image.attachments).toEqual([{ resourceKey: "img_v3_abc", resourceType: "image" }]);

    const file = extractInboundMessage({
      message_id: "om_file",
      chat_id: "oc_boss",
      content: "{\"file_key\":\"file_v2_abc\",\"file_name\":\"需求说明.pdf\"}",
    });
    expect(file.attachments).toEqual([
      { resourceKey: "file_v2_abc", resourceType: "file", filename: "需求说明.pdf" },
    ]);
  });

  it("extracts Feishu mention targets from message content", () => {
    const message = extractInboundMessage({
      message_id: "om_mention",
      chat_id: "oc_boss",
      content: JSON.stringify({
        text: "@_user_1 请看下",
        mentions: [
          {
            key: "@_user_1",
            name: "小锐",
            id: { open_id: "ou_xiaorui", user_id: "u_xiaorui" },
          },
        ],
      }),
    });

    expect(message.mentions).toEqual([
      expect.objectContaining({ name: "小锐", openId: "ou_xiaorui", userId: "u_xiaorui", key: "@_user_1" }),
    ]);
  });

  it("keeps Feishu chat names from raw events for human-readable Paperclip context", () => {
    const message = extractInboundMessage({
      event_id: "evt-chat-name",
      message_id: "om_chat_name",
      chat_id: "oc_it_ai",
      chat_name: "IT-AI应用组",
      sender_name: "张腾",
      text: "@小思 总结一下最近讨论",
    });
    const route = {
      id: "keyword-xiaosi",
      name: "chat-team-to-liu",
      matchType: "keyword" as const,
      keyword: "小思",
      targetAgentName: "张工 - AI总工",
      companyRef: "CMP",
    };

    expect(message.chatName).toBe("IT-AI应用组");
    expect(feishuContextLines(message, route)).toContain("飞书会话：IT-AI应用组");
    expect(feishuContextLines(message, route)).toContain("原消息：已记录，可回原线程");
    expect(feishuContextLines(message, route).join("\n")).not.toContain("oc_it_ai");
    expect(feishuContextLines(message, route).join("\n")).not.toContain("om_chat_name");
    expect(feishuContextLines(message, route)).toContain("接收入口：包含「小思」的飞书消息 → 张工 - AI总工");
  });

  it("routes by chat before default and builds stable session keys", () => {
    const config: FeishuConnectorConfig = {
      routes: [
        { id: "default", matchType: "default", companyId: "company-1", priority: 0 },
        { id: "boss-chat", matchType: "chat", chatId: "oc_boss", companyId: "company-1", priority: 10 },
      ],
    };
    const message = extractInboundMessage({
      message_id: "om_2",
      chat_id: "oc_boss",
      root_id: "om_root",
      text: "Follow up",
    });

    expect(resolveRoute(config, message, "news-bot")?.id).toBe("boss-chat");
    expect(buildSessionKey(message, "news-bot")).toBe("feishu:news-bot:oc_boss:root:om_root");
  });

  it("matches keyword and regex routes without caring about letter case", () => {
    const keywordConfig: FeishuConnectorConfig = {
      routes: [
        { id: "paperclip-keyword", matchType: "keyword", keyword: "paperclip", companyId: "company-1" },
      ],
    };
    const regexConfig: FeishuConnectorConfig = {
      routes: [
        { id: "paperclip-regex", matchType: "regex", regex: "(@?锐思|paperclip)", companyId: "company-1" },
      ],
    };
    const message = extractInboundMessage({
      message_id: "om_case",
      chat_id: "oc_boss",
      text: "@锐思 请创建一个 Paperclip 测试任务",
    });

    expect(resolveRoute(keywordConfig, message, "news-bot")?.id).toBe("paperclip-keyword");
    expect(resolveRoute(regexConfig, message, "news-bot")?.id).toBe("paperclip-regex");
  });

  it("hides technical route ids from user-facing entry names", () => {
    const route = {
      id: "route-1",
      name: "chat-team-to-liu",
      matchType: "keyword" as const,
      keyword: "小思",
      targetAgentName: "张工",
      companyRef: "TC",
    };

    expect(isLikelyInternalRouteName("chat-team-to-liu")).toBe(true);
    expect(describeRouteEntry(route)).toBe("包含「小思」的飞书消息 → 张工");
    expect(describeRouteEntry({ ...route, name: "老板资讯群入口" })).toBe("老板资讯群入口");
  });

  it("provides a stable human route label for Paperclip issue context", () => {
    const route = {
      id: "chat-team-to-liu",
      name: "chat-team-to-liu",
      matchType: "keyword" as const,
      keyword: "小思",
      targetAgentName: "张工 - AI总工",
    };

    expect(describeRouteForHumans(route)).toBe("包含「小思」的飞书消息 → 张工 - AI总工");
    expect(describeRouteForHumans({ ...route, name: "IT-AI 应用组入口" })).toBe("IT-AI 应用组入口");
  });

  it("plans only one event subscriber per underlying Feishu app while retaining all entry bot choices", () => {
    const config: FeishuConnectorConfig = {
      connections: [
        { id: "ruisi", name: "锐思", profileName: "same-profile", appId: "cli_same", enabled: true },
        { id: "xiaorui", name: "小锐", profileName: "same-profile", appId: "cli_same", enabled: true },
        { id: "finder", name: "找人专家", profileName: "finder-profile", appId: "cli_finder", enabled: true },
      ],
      routes: [
        { id: "route-ruisi", connectionId: "ruisi", matchType: "keyword", keyword: "锐思", companyId: "company-1" },
        { id: "route-xiaorui", connectionId: "xiaorui", matchType: "keyword", keyword: "小锐", companyId: "company-1" },
        { id: "route-finder", connectionId: "finder", matchType: "keyword", keyword: "找人", companyId: "company-1" },
      ],
    };

    expect(planEventSubscribers(config)).toEqual([
      expect.objectContaining({
        key: "app:cli_same",
        primaryConnectionId: "ruisi",
        profileName: "same-profile",
        connectionIds: ["ruisi", "xiaorui"],
      }),
      expect.objectContaining({
        key: "app:cli_finder",
        primaryConnectionId: "finder",
        profileName: "finder-profile",
        connectionIds: ["finder"],
      }),
    ]);
  });

  it("renders Base records from templates", () => {
    const message = extractInboundMessage({
      message_id: "om_1",
      chat_id: "oc_boss",
      sender_open_id: "ou_boss",
      sender_name: "Boss",
      text: "Need more global AI news",
    });
    const record = buildBaseRecord({
      id: "sink-1",
      baseToken: "base",
      tableIdOrName: "tbl",
      fieldMap: {
        Title: "{{issue_title}}",
        Requester: "{{sender.name}}",
        Message: "{{message.text}}",
        Issue: "{{issue_id}}",
      },
    }, {
      message,
      issueId: "issue-1",
      issueTitle: "Need more global AI news",
      agentName: "News Agent",
    });

    expect(record).toEqual({
      Title: "Need more global AI news",
      Requester: "Boss",
      Message: "Need more global AI news",
      Issue: "issue-1",
    });
  });

  it("renders route entry and Feishu conversation in templates and default Base records", () => {
    const message = extractInboundMessage({
      message_id: "om_it_ai",
      chat_id: "oc_it_ai",
      chat_name: "IT-AI应用组",
      sender_open_id: "ou_boss",
      sender_name: "张腾",
      text: "@小思 总结本周聊天内容",
    });
    const route = {
      id: "keyword-xiaosi-to-zhanggong",
      name: "keyword-xiaosi-to-zhanggong",
      matchType: "keyword" as const,
      keyword: "小思",
      targetAgentName: "张工 - AI总工",
      companyRef: "CMP",
    };

    expect(renderTemplate("{{route.entry}} / {{route.trigger}} / {{message.chat_name}}", {
      message,
      route,
    })).toBe("包含「小思」的飞书消息 → 张工 - AI总工 / 包含「小思」的飞书消息 / IT-AI应用组");

    const record = buildBaseRecord({
      id: "sink-default",
      baseToken: "base",
      tableIdOrName: "tbl",
    }, {
      message,
      route,
      issueId: "issue-1",
      issueTitle: "总结本周聊天内容",
      agentName: "张工 - AI总工",
    });

    expect(record["飞书会话"]).toBe("IT-AI应用组");
    expect(record["接收入口"]).toBe("包含「小思」的飞书消息 → 张工 - AI总工");
    expect(record["飞书 chat_id"]).toBe("oc_it_ai");
    expect(record["飞书 message_id"]).toBe("om_it_ai");
  });

  it("builds lark-cli commands with profile and explicit identity", () => {
    expect(buildSendMessageArgs({
      profileName: "paperclip-news-bot",
      chatId: "oc_boss",
      text: "hello",
      idempotencyKey: "idem-1",
    })).toEqual([
      "--profile",
      "paperclip-news-bot",
      "im",
      "+messages-send",
      "--as",
      "bot",
      "--chat-id",
      "oc_boss",
      "--text",
      "hello",
      "--idempotency-key",
      "idem-1",
    ]);

    expect(buildReplyMessageArgs({
      profileName: "paperclip-news-bot",
      messageId: "om_1",
      text: "done",
      replyInThread: true,
    })).toContain("--reply-in-thread");

    expect(buildRecordUpsertArgs({
      profileName: "paperclip-news-bot",
      baseToken: "base",
      tableIdOrName: "tbl",
      recordJson: { Title: "Need more" },
    })).toContain("+record-upsert");

    expect(buildResourceDownloadArgs({
      profileName: "paperclip-news-bot",
      messageId: "om_1",
      fileKey: "img_v3_abc",
      type: "image",
      output: "image-1.jpg",
    })).toEqual([
      "--profile",
      "paperclip-news-bot",
      "im",
      "+messages-resources-download",
      "--as",
      "bot",
      "--message-id",
      "om_1",
      "--file-key",
      "img_v3_abc",
      "--type",
      "image",
      "--output",
      "image-1.jpg",
    ]);

    expect(buildMessageGetArgs({
      profileName: "paperclip-news-bot",
      messageId: "om_1",
    })).toEqual([
      "--profile",
      "paperclip-news-bot",
      "im",
      "+messages-mget",
      "--as",
      "bot",
      "--message-ids",
      "om_1",
    ]);
  });

  it("resolves lark-cli from explicit config, env, bundled dependency, then PATH", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-cli-resolve-"));
    const moduleDir = path.join(root, "node_modules", "@paperclipai", "plugin-feishu-connector", "dist");
    const bundledCli = path.join(root, "node_modules", "@larksuite", "cli", "scripts", "run.js");
    await mkdir(moduleDir, { recursive: true });
    await mkdir(path.dirname(bundledCli), { recursive: true });
    await writeFile(bundledCli, "#!/usr/bin/env node\n", "utf8");

    expect(resolveLarkCliBin({
      configuredBin: "/custom/lark-cli",
      env: { PAPERCLIP_FEISHU_LARK_CLI_BIN: "/env/lark-cli" },
      moduleDir,
    })).toBe("/custom/lark-cli");
    expect(resolveLarkCliBin({
      env: { PAPERCLIP_FEISHU_LARK_CLI_BIN: "/env/lark-cli" },
      moduleDir,
    })).toBe("/env/lark-cli");
    expect(resolveLarkCliBin({ env: {}, moduleDir })).toBe(bundledCli);

    const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-cli-empty-"));
    expect(resolveLarkCliBin({ env: {}, moduleDir: path.join(emptyRoot, "dist") })).toBe("lark-cli");
  });
});
