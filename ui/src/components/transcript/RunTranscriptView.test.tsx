// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TranscriptEntry } from "../../adapters";
import { ThemeProvider } from "../../context/ThemeContext";
import { RunTranscriptView, normalizeTranscript } from "./RunTranscriptView";

describe("RunTranscriptView", () => {
  it("keeps running command stdout inside the command fold instead of a standalone stdout block", () => {
    const entries: TranscriptEntry[] = [
      {
        kind: "tool_call",
        ts: "2026-03-12T00:00:00.000Z",
        name: "command_execution",
        toolUseId: "cmd_1",
        input: { command: "ls -la" },
      },
      {
        kind: "stdout",
        ts: "2026-03-12T00:00:01.000Z",
        text: "file-a\nfile-b",
      },
    ];

    const blocks = normalizeTranscript(entries, false);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "command_group",
      items: [{ result: "file-a\nfile-b", status: "running" }],
    });
  });

  it("renders assistant and thinking content as markdown in compact mode", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView
          density="compact"
          entries={[
            {
              kind: "assistant",
              ts: "2026-03-12T00:00:00.000Z",
              text: "Hello **world**",
            },
            {
              kind: "thinking",
              ts: "2026-03-12T00:00:01.000Z",
              text: "- first\n- second",
            },
          ]}
        />
      </ThemeProvider>,
    );

    expect(html).toContain("<strong>world</strong>");
    expect(html).toMatch(/<li[^>]*>first<\/li>/);
    expect(html).toMatch(/<li[^>]*>second<\/li>/);
  });

  it("hides saved-session resume skip stderr from nice mode normalization", () => {
    const entries: TranscriptEntry[] = [
      {
        kind: "stderr",
        ts: "2026-03-12T00:00:00.000Z",
        text: "[paperclip] Skipping saved session resume for task \"PAP-485\" because wake reason is issue_assigned.",
      },
      {
        kind: "assistant",
        ts: "2026-03-12T00:00:01.000Z",
        text: "Working on the task.",
      },
    ];

    const blocks = normalizeTranscript(entries, false);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "message",
      role: "assistant",
      text: "Working on the task.",
    });
  });

  it("renders successful result summaries as markdown in nice mode", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView
          density="compact"
          entries={[
            {
              kind: "result",
              ts: "2026-03-12T00:00:02.000Z",
              text: "## Summary\n\n- fixed deploy config\n- posted issue update",
              inputTokens: 10,
              outputTokens: 20,
              cachedTokens: 0,
              costUsd: 0,
              subtype: "success",
              isError: false,
              errors: [],
            },
          ]}
        />
      </ThemeProvider>,
    );

    expect(html).toContain("<h2>Summary</h2>");
    expect(html).toMatch(/<li[^>]*>fixed deploy config<\/li>/);
    expect(html).toMatch(/<li[^>]*>posted issue update<\/li>/);
    expect(html).not.toContain("result");
  });

  it("renders transcript chrome in Chinese when locale is zh-CN", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView
          locale="zh-CN"
          entries={[
            {
              kind: "user",
              ts: "2026-03-12T00:00:00.000Z",
              text: "请检查工作区",
            },
            {
              kind: "tool_call",
              ts: "2026-03-12T00:00:01.000Z",
              name: "command_execution",
              toolUseId: "cmd_1",
              input: { command: "pwd" },
            },
          ]}
        />
      </ThemeProvider>,
    );

    expect(html).toContain("用户");
    expect(html).toContain("正在执行命令");
  });

  it("uses the localized empty state when locale is zh-CN", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView locale="zh-CN" entries={[]} />
      </ThemeProvider>,
    );

    expect(html).toContain("还没有转录内容。");
  });

  it("localizes known system and command output patterns in zh-CN nice mode", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView
          locale="zh-CN"
          entries={[
            {
              kind: "system",
              ts: "2026-03-12T00:00:00.000Z",
              text: "[paperclip] No project or prior session workspace was available. Using fallback workspace \"/tmp/fallback\" for this run.",
            },
            {
              kind: "stdout",
              ts: "2026-03-12T00:00:01.000Z",
              text: "⚠️ DANGEROUS COMMAND: script execution via -e/-c flag curl -s https://example.com [o]nce | [s]ession | [a]lways | [d]eny Choice [o/s/a/D]: ✗ Denied",
            },
          ]}
        />
      </ThemeProvider>,
    );

    expect(html).toContain("1 条系统消息");
    expect(html).toContain("⚠️ 危险命令：通过 -e/-c 参数执行脚本");
    expect(html).toContain("✗ 已拒绝");
  });

  it("windows large raw transcripts instead of rendering every entry at once", () => {
    const entries: TranscriptEntry[] = Array.from({ length: 500 }, (_, index) => ({
      kind: "stdout",
      ts: `2026-03-12T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
      text: `line-${index}`,
    }));

    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView mode="raw" entries={entries} />
      </ThemeProvider>,
    );

    expect(html).toContain("line-0");
    expect(html).toContain("line-179");
    expect(html).not.toContain("line-250");
    expect(html).not.toContain("line-499");
  });
});
