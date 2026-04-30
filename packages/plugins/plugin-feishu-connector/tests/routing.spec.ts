import { describe, expect, it } from "vitest";
import {
  buildBaseRecord,
  buildSessionKey,
  extractInboundMessage,
  resolveRoute,
} from "../src/routing.js";
import { buildRecordUpsertArgs, buildReplyMessageArgs, buildSendMessageArgs } from "../src/lark-cli.js";
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
  });
});
