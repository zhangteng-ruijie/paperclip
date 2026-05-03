import { Children, Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import { ACTION_KEYS, DATA_KEYS, PLUGIN_ID } from "../constants.js";
import { DEFAULT_CONFIG } from "../config.js";
import type {
  FeishuBaseSinkConfig,
  FeishuConnectionConfig,
  FeishuConnectorConfig,
  FeishuRouteConfig,
} from "../types.js";

type ConnectorStatus = {
  dryRunCli: boolean;
  eventSubscriberEnabled: boolean;
  connectionCount: number;
  routeCount: number;
  baseSinkCount: number;
  subscribers: Array<{ connectionId: string; profileName?: string; pid: number | null; killed: boolean; running?: boolean }>;
  monitor?: {
    health: "ok" | "warning" | "error";
    message: string;
    checkedAt: string;
    enabledConnectionCount: number;
    enabledRouteCount: number;
    expectedSubscriberCount: number;
    activeSubscriberCount: number;
    missingSubscriberConnectionIds: string[];
    recentErrorCount: number;
    recentWarningCount: number;
    lastEventAt: string | null;
    lastWatchdogAt: string | null;
    checks: CheckReportItem[];
  };
  lastInboundEventAt?: string | null;
  recentRecords: RecentRecord[];
};

type RecentRecord = {
  level: string;
  message: string;
  createdAt: string;
  data?: Record<string, unknown> | null;
};

type AgentOption = {
  id: string;
  name: string;
  title?: string | null;
  urlKey?: string | null;
};

type CompanyOption = {
  id: string;
  name: string;
  issuePrefix?: string | null;
  agents: AgentOption[];
};

type CatalogData = {
  companies: CompanyOption[];
};

type ProfileOption = {
  name: string;
  appId?: string | null;
  brand?: string | null;
  active?: boolean;
  user?: string | null;
  tokenStatus?: string | null;
  botName?: string | null;
  botOpenId?: string | null;
  botAvatarUrl?: string | null;
  botActivateStatus?: number | null;
};

type ProfilesData = {
  profiles: ProfileOption[];
  error?: string;
};

type DirectoryChatOption = {
  chatId: string;
  name: string;
  description?: string | null;
  external?: boolean;
};

type DirectoryUserOption = {
  openId: string;
  userId?: string | null;
  name: string;
  departmentIds?: string[];
};

type DirectoryData = {
  profileName?: string | null;
  chats: DirectoryChatOption[];
  users: DirectoryUserOption[];
  chatError?: string;
  userError?: string;
};

type ConfigRecord = FeishuConnectorConfig & Record<string, unknown>;

type BindFormState = {
  displayName: string;
  profileName: string;
  appId: string;
  appSecret: string;
};

type GuidedBindResult = {
  ok?: boolean;
  profileName?: string;
  command?: string;
  args?: string[];
  pid?: number | null;
  running?: boolean;
  stdout?: string;
  stderr?: string;
  url?: string;
  userCode?: string;
};

type FinishGuidedBindResult = {
  ok?: boolean;
  profile?: ProfileOption;
  warning?: string;
};

type UserAuthResult = {
  ok?: boolean;
  profileName?: string;
  url?: string;
  expiresIn?: number;
  userCode?: string;
  profile?: ProfileOption;
};

type RouteTestResult = {
  ok?: boolean;
  dryRun?: boolean;
  routeId?: string;
  sampleText?: string;
  message?: string;
};

type CheckReportItem = {
  tone: "success" | "warning" | "error";
  title: string;
  detail: string;
};

type BotCheckState = {
  checkedAt: string;
  items: CheckReportItem[];
};

type EntryWizardDraft = {
  connectionId?: string;
  matchType: FeishuRouteConfig["matchType"];
  chatId?: string;
  chatName?: string;
  userOpenId?: string;
  userName?: string;
  keyword?: string;
  regex?: string;
  companyId?: string;
  targetAgentId?: string;
  replyMode: NonNullable<FeishuRouteConfig["replyMode"]>;
  baseSinkId?: string;
};

type AdvancedPanelKey = "auth" | "deploy" | "runtime" | "events" | "base";
type MainTabKey = "overview" | "entries" | "robots" | "test" | "advanced";
type NextStepKind = "bind" | "rebind" | "entry" | "edit-entry" | "enable-listen" | "enable-real" | "test";
type BindMethod = "guided" | "secret";

const mainTabs: Array<{ key: MainTabKey; label: string; detail: string; hash: string }> = [
  { key: "overview", label: "总览", detail: "下一步", hash: "feishu-overview" },
  { key: "entries", label: "入口", detail: "业务规则", hash: "feishu-entries" },
  { key: "robots", label: "机器人", detail: "账号池", hash: "feishu-robots" },
  { key: "test", label: "测试", detail: "真实确认", hash: "feishu-test" },
  { key: "advanced", label: "高级", detail: "工程配置", hash: "feishu-advanced" },
];

function mainTabFromHash(hash: string): MainTabKey {
  const match = mainTabs.find((tab) => `#${tab.hash}` === hash);
  return match?.key ?? "overview";
}

function initialMainTab(): MainTabKey {
  if (typeof window === "undefined") return "overview";
  return mainTabFromHash(window.location.hash);
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "18px",
  fontSize: "14px",
};

const sectionStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "16px",
  display: "grid",
  gap: "14px",
  background: "var(--background)",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
};

const actionBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  alignItems: "center",
  justifyContent: "space-between",
};

const gridTwoStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "12px",
};

const stepGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
};

const labelStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
};

const helpStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--muted-foreground)",
  lineHeight: 1.5,
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: "38px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "0 12px",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: "14px",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
};

const buttonStyle: CSSProperties = {
  height: "36px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "0 12px",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: "14px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: "1px solid var(--primary)",
  background: "var(--primary)",
  color: "var(--primary-foreground)",
  fontWeight: 600,
};

const subtleBoxStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "12px",
  background: "var(--muted)",
};

const successBoxStyle: CSSProperties = {
  ...subtleBoxStyle,
  border: "1px solid color-mix(in oklab, var(--primary) 40%, var(--border))",
  background: "color-mix(in oklab, var(--primary) 8%, var(--background))",
};

const recommendedBoxStyle: CSSProperties = {
  ...subtleBoxStyle,
  border: "1px solid color-mix(in oklab, var(--primary) 55%, var(--border))",
  background: "color-mix(in oklab, var(--primary) 10%, var(--background))",
};

const qrPlaceholderStyle: CSSProperties = {
  width: "132px",
  height: "132px",
  borderRadius: "8px",
  border: "1px solid var(--border)",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  padding: "10px",
  background: "var(--background)",
  color: "var(--muted-foreground)",
  fontSize: "12px",
  lineHeight: 1.4,
};

const heroStyle: CSSProperties = {
  border: "1px solid color-mix(in oklab, var(--primary) 35%, var(--border))",
  borderRadius: "12px",
  padding: "16px",
  display: "grid",
  gap: "14px",
  background: "var(--background)",
  boxShadow: "0 18px 40px color-mix(in oklab, var(--foreground) 5%, transparent)",
};

const tabNavStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  padding: "0",
  borderBottom: "1px solid var(--border)",
  alignItems: "flex-end",
};

const tabLinkStyle: CSSProperties = {
  appearance: "none",
  border: "0",
  background: "transparent",
  padding: "0 12px 10px",
  color: "var(--muted-foreground)",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 700,
  borderBottom: "2px solid transparent",
  display: "grid",
  gap: "2px",
  textAlign: "left",
  cursor: "pointer",
};

const activeTabLinkStyle: CSSProperties = {
  ...tabLinkStyle,
  color: "var(--foreground)",
  borderBottom: "2px solid var(--foreground)",
};

const tabDetailStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 500,
  color: "var(--muted-foreground)",
};

const metricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px",
};

const metricCardStyle: CSSProperties = {
  borderRight: "1px solid var(--border)",
  padding: "12px 18px",
  background: "transparent",
  display: "grid",
  gap: "6px",
};

const metricHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "var(--muted-foreground)",
  fontSize: "12px",
};

const metricIconStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  display: "inline-grid",
  placeItems: "center",
  fontSize: "13px",
  fontWeight: 800,
};

const productSectionStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "16px",
  display: "grid",
  gap: "14px",
  background: "var(--background)",
};

const productEntryStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "14px",
  display: "grid",
  gap: "10px",
  background: "var(--background)",
};

const productEntryEditorStyle: CSSProperties = {
  border: "1px solid color-mix(in oklab, var(--primary) 34%, var(--border))",
  borderRadius: "12px",
  padding: "14px",
  display: "grid",
  gap: "12px",
  background: "color-mix(in oklab, var(--primary) 5%, var(--background))",
};

const compactPillStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "3px 8px",
  background: "var(--muted)",
  color: "var(--muted-foreground)",
  fontSize: "12px",
};

const botIconStyle: CSSProperties = {
  width: "52px",
  height: "52px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "var(--primary)",
  color: "var(--primary-foreground)",
  fontWeight: 900,
  fontSize: "20px",
  flex: "0 0 auto",
};

const wizardStepperStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "10px",
};

const sectionTitleRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "16px 16px 0",
};

const checklistGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
};

const entryCardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "14px",
  display: "grid",
  gap: "14px",
  background: "var(--muted)",
};

const flowGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "10px",
};

const flowStepStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "10px",
  background: "var(--background)",
  minHeight: "74px",
};

const settingsListStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  overflow: "hidden",
  background: "var(--background)",
};

const wizardStyle: CSSProperties = {
  border: "1px solid color-mix(in oklab, var(--primary) 45%, var(--border))",
  borderRadius: "8px",
  padding: "16px",
  display: "grid",
  gap: "16px",
  background: "color-mix(in oklab, var(--primary) 6%, var(--background))",
};

const guideCardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "12px",
  display: "grid",
  gap: "8px",
  background: "var(--background)",
};

const codeStyle: CSSProperties = {
  display: "block",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "10px",
  background: "var(--muted)",
  color: "var(--foreground)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "12px",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const linkButtonStyle: CSSProperties = {
  ...buttonStyle,
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  textDecoration: "none",
};

const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(0, 0, 0, 0.28)",
  display: "grid",
  placeItems: "center",
  padding: "24px",
};

const modalPanelStyle: CSSProperties = {
  width: "min(720px, 100%)",
  maxHeight: "min(760px, calc(100vh - 48px))",
  overflow: "auto",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  background: "var(--background)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.24)",
  padding: "18px",
  display: "grid",
  gap: "14px",
};

const floatingToastStyle: CSSProperties = {
  position: "fixed",
  right: "24px",
  bottom: "24px",
  zIndex: 1100,
  width: "min(420px, calc(100vw - 48px))",
  border: "1px solid color-mix(in oklab, var(--primary) 45%, var(--border))",
  borderRadius: "12px",
  padding: "12px 14px",
  background: "var(--background)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
};

const nextStepStyle: CSSProperties = {
  border: "1px solid color-mix(in oklab, var(--primary) 38%, var(--border))",
  borderRadius: "12px",
  padding: "14px",
  background: "color-mix(in oklab, var(--primary) 5%, var(--background))",
  display: "grid",
  gap: "10px",
};

const heroCommandStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "16px",
  display: "grid",
  gap: "14px",
  background: "var(--background)",
};

const setupStepStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "12px",
  display: "grid",
  gap: "8px",
  minHeight: "118px",
  background: "var(--background)",
};

const pipelineStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "8px",
};

const pipelineStepStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "12px",
  display: "grid",
  gap: "6px",
  background: "var(--background)",
};

const settingsShellStyle: CSSProperties = {
  ...settingsListStyle,
  display: "grid",
};

const cardStyle = {
  display: "grid",
  gap: "8px",
  fontSize: "12px",
} as const;

const rowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  alignItems: "center",
} as const;

const mutedRowStyle = {
  ...rowStyle,
  color: "var(--muted-foreground)",
  fontSize: "12px",
} as const;

const matchTypeLabels: Record<FeishuRouteConfig["matchType"], string> = {
  chat: "只接某个群或单聊",
  user: "只接某个人",
  keyword: "消息里有关键词",
  regex: "高级规则",
  default: "其他消息都接收",
};

const replyModeLabels: Record<NonNullable<FeishuRouteConfig["replyMode"]>, string> = {
  none: "不自动回复",
  message: "发一条新消息",
  thread: "在原消息线程里回复",
};

function Badge({ children }: { children: string }) {
  return (
    <span style={{
      border: "1px solid var(--border)",
      borderRadius: "999px",
      padding: "2px 8px",
      opacity: 0.82,
    }}>
      {children}
    </span>
  );
}

function StatusBadge({ tone = "neutral", children }: { tone?: "success" | "warning" | "neutral"; children: string }) {
  const background = tone === "success"
    ? "color-mix(in oklab, var(--primary) 12%, var(--background))"
    : tone === "warning"
      ? "color-mix(in oklab, #f59e0b 14%, var(--background))"
      : "var(--muted)";
  return (
    <span style={{
      border: "1px solid var(--border)",
      borderRadius: "999px",
      padding: "4px 10px",
      fontSize: "12px",
      fontWeight: 600,
      background,
    }}>
      {children}
    </span>
  );
}

function CheckReport({ items, title = "连接体检报告" }: { items: CheckReportItem[]; title?: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "12px",
        display: "grid",
        gap: "10px",
        background: "var(--background)",
      }}
    >
      <div key="title" style={{ fontWeight: 800 }}>{title}</div>
      <div key="items" style={checklistGridStyle}>
        {items.map((item, index) => {
          const marker = item.tone === "success" ? "✓" : item.tone === "warning" ? "!" : "×";
          const border = item.tone === "error"
            ? "1px solid var(--destructive)"
            : item.tone === "warning"
              ? "1px solid color-mix(in oklab, #f59e0b 55%, var(--border))"
              : "1px solid color-mix(in oklab, var(--primary) 35%, var(--border))";
          return (
            <div
              key={`${item.title}-${index}`}
              style={{
                border,
                borderRadius: "8px",
                padding: "10px",
                display: "grid",
                gap: "6px",
                background: "var(--muted)",
              }}
            >
              <div key="head" style={{ ...rowStyle, gap: "6px" }}>
                <strong
                  key="marker"
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "999px",
                    display: "inline-grid",
                    placeItems: "center",
                    border: "1px solid var(--border)",
                    fontSize: "12px",
                  }}
                >
                  {marker}
                </strong>
                <strong key="title">{item.title}</strong>
              </div>
              <div key="detail" style={helpStyle}>{item.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function dataString(data: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routeDiagnosticReasons(data: Record<string, unknown> | null | undefined): string[] {
  const diagnostics = data?.routeDiagnostics;
  if (!Array.isArray(diagnostics)) return [];
  return diagnostics
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.routeName === "string" ? record.routeName : typeof record.routeId === "string" ? record.routeId : "入口";
      const reason = typeof record.reason === "string" ? record.reason : "";
      return reason ? `${name}：${reason}` : null;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
}

function recentRecordDetails(record: RecentRecord): string[] {
  const data = record.data;
  const details: string[] = [];
  const connection = dataString(data, "connectionName") ?? dataString(data, "connectionId");
  const profileName = dataString(data, "profileName");
  const chat = dataString(data, "chatName") ?? dataString(data, "chatId");
  const sender = dataString(data, "senderName") ?? dataString(data, "senderOpenId");
  const route = dataString(data, "routeName") ?? dataString(data, "routeId");
  const agent = dataString(data, "targetAgentName");
  const preview = dataString(data, "textPreview");

  if (connection) details.push(`机器人：${connection}${profileName ? `（${profileName}）` : ""}`);
  if (route) details.push(`入口：${route}${agent ? ` → ${agent}` : ""}`);
  if (chat) details.push(`会话：${chat}`);
  if (sender) details.push(`提出人：${sender}`);
  if (preview) details.push(`消息：${preview}`);
  details.push(...routeDiagnosticReasons(data));
  return details;
}

function isInboundMessageRecord(record: RecentRecord): boolean {
  if (dataString(record.data, "messageId")) return true;
  return record.message.includes("飞书入口测试") || record.message.includes("快捷测试回复");
}

function RecentEventList({ records, emptyText = "还没有收到飞书消息事件。" }: { records: RecentRecord[]; emptyText?: string }) {
  if (records.length === 0) {
    return <div style={helpStyle}>{emptyText}</div>;
  }
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      {records.map((record, index) => {
        const color = record.level === "error"
          ? "var(--destructive)"
          : record.level === "warning"
            ? "#b45309"
            : "var(--foreground)";
        const details = recentRecordDetails(record);
        return (
          <div
            key={`${record.createdAt}-${index}`}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "10px 12px",
              display: "grid",
              gap: "6px",
              background: "var(--background)",
            }}
          >
            <div key="head" style={{ ...rowStyle, justifyContent: "space-between", gap: "12px" }}>
              <strong key="message" style={{ color }}>{record.message}</strong>
              <span key="time" style={helpStyle}>{record.createdAt}</span>
            </div>
            {details.length ? (
              <div key="details" style={{ ...helpStyle, display: "grid", gap: "3px" }}>
                {details.map((detail, detailIndex) => (
                  <span key={`${detail}-${detailIndex}`}>{detail}</span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function InlineCheckReport({ items, checkedAt }: { items: CheckReportItem[]; checkedAt?: string }) {
  return (
    <div style={{ display: "grid", gap: "8px", marginTop: "4px" }}>
      {checkedAt ? <div key="checked-at" style={helpStyle}>检查时间：{checkedAt}</div> : null}
      {items.map((item, index) => {
        const mark = item.tone === "success" ? "✓" : item.tone === "warning" ? "!" : "×";
        const color = item.tone === "error"
          ? "var(--destructive)"
          : item.tone === "warning"
            ? "#b45309"
            : "var(--foreground)";
        return (
          <div
            key={`${item.title}-${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "22px minmax(0, 1fr)",
              gap: "8px",
              alignItems: "start",
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--muted)",
            }}
          >
            <strong key="mark" style={{ color }}>{mark}</strong>
            <div key="copy" style={{ display: "grid", gap: "2px" }}>
              <strong key="title" style={{ fontSize: "13px", color }}>{item.title}</strong>
              <span key="detail" style={helpStyle}>{item.detail}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChatSearchControl(props: {
  query: string;
  onQueryChange: (value: string) => void;
  chats: DirectoryChatOption[];
  loading: boolean;
  error?: string;
  currentChatId?: string;
  currentChatName?: string;
  profileName?: string | null;
  onSelect: (chat: DirectoryChatOption) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <input
        style={inputStyle}
        placeholder="输入群名或单聊名称，例如“老板群”“智能体团队”"
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
      />
      <div style={helpStyle}>
        用 {props.profileName || "当前飞书账号"} 搜索可见会话。选中后自动填入会话 ID。
      </div>
      {props.currentChatId ? (
        <div style={helpStyle}>
          当前选择：{props.currentChatName || props.currentChatId}
        </div>
      ) : null}
      {props.loading ? <div style={helpStyle}>正在搜索飞书会话...</div> : null}
      {props.error ? <div style={{ ...helpStyle, color: "var(--destructive)" }}>搜索失败：{props.error}</div> : null}
      {!props.loading && !props.error && props.query && props.chats.length === 0 ? (
        <div style={helpStyle}>没有搜到。确认你有权限看到这个群，或先把飞书机器人加进群里。</div>
      ) : null}
      <div style={stepGridStyle}>
        {props.chats.map((chat) => (
          <button
            key={chat.chatId}
            type="button"
            style={{
              ...buttonStyle,
              height: "auto",
              minHeight: "54px",
              padding: "10px 12px",
              textAlign: "left",
              justifyContent: "flex-start",
              border: chat.chatId === props.currentChatId ? "1px solid var(--primary)" : buttonStyle.border,
            }}
            onClick={() => props.onSelect(chat)}
          >
            <strong style={{ display: "block" }}>{chat.name}</strong>
            <span style={{ ...helpStyle, display: "block" }}>{chat.external ? "外部群" : "内部会话"} · {chat.chatId}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserSearchControl(props: {
  query: string;
  onQueryChange: (value: string) => void;
  users: DirectoryUserOption[];
  loading: boolean;
  error?: string;
  currentUserOpenId?: string;
  currentUserName?: string;
  profileName?: string | null;
  onSelect: (user: DirectoryUserOption) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <input
        style={inputStyle}
        placeholder="输入姓名、邮箱或工号，例如“张洪丹”"
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
      />
      <div style={helpStyle}>
        用 {props.profileName || "当前飞书账号"} 搜索通讯录。选中后自动填入 OpenID。
      </div>
      {props.currentUserOpenId ? (
        <div style={helpStyle}>
          当前选择：{props.currentUserName || props.currentUserOpenId}
        </div>
      ) : null}
      {props.loading ? <div style={helpStyle}>正在搜索飞书联系人...</div> : null}
      {props.error ? <div style={{ ...helpStyle, color: "var(--destructive)" }}>搜索失败：{props.error}</div> : null}
      {!props.loading && !props.error && props.query && props.users.length === 0 ? (
        <div style={helpStyle}>没有搜到。确认飞书应用可见范围和通讯录权限。</div>
      ) : null}
      <div style={stepGridStyle}>
        {props.users.map((user) => (
          <button
            key={user.openId}
            type="button"
            style={{
              ...buttonStyle,
              height: "auto",
              minHeight: "54px",
              padding: "10px 12px",
              textAlign: "left",
              justifyContent: "flex-start",
              border: user.openId === props.currentUserOpenId ? "1px solid var(--primary)" : buttonStyle.border,
            }}
            onClick={() => props.onSelect(user)}
          >
            <strong style={{ display: "block" }}>{user.name}</strong>
            <span style={{ ...helpStyle, display: "block" }}>
              {user.userId ? `工号：${user.userId} · ` : ""}{user.openId}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: "18px",
        height: "18px",
        borderRadius: "999px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        border: "1px solid var(--border)",
        background: done ? "var(--primary)" : "var(--background)",
        color: done ? "var(--primary-foreground)" : "var(--muted-foreground)",
        fontSize: "12px",
        lineHeight: 1,
      }}
    >
      {done ? "✓" : "•"}
    </span>
  );
}

function ChecklistItem({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "10px",
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        background: done ? "color-mix(in oklab, var(--primary) 6%, var(--background))" : "var(--background)",
      }}
    >
      <StatusDot key="dot" done={done} />
      <div key="body">
        <div key="title" style={{ fontWeight: 700, fontSize: "13px" }}>{title}</div>
        <div key="detail" style={helpStyle}>{detail}</div>
      </div>
    </div>
  );
}

function FlowStep({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <div style={flowStepStyle}>
      <div key="title" style={{ ...helpStyle, marginBottom: "6px" }}>{title}</div>
      <div key="value" style={{ fontWeight: 700, lineHeight: 1.35 }}>{value}</div>
      {detail ? <div key="detail" style={{ ...helpStyle, marginTop: "6px" }}>{detail}</div> : null}
    </div>
  );
}

function SetupStep({
  index,
  done,
  title,
  detail,
  action,
}: {
  index: number;
  done: boolean;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        ...setupStepStyle,
        border: done ? "1px solid color-mix(in oklab, var(--primary) 34%, var(--border))" : setupStepStyle.border,
        background: done ? "color-mix(in oklab, var(--primary) 5%, var(--background))" : setupStepStyle.background,
      }}
    >
      <div key="head" style={{ ...rowStyle, justifyContent: "space-between" }}>
        <span key="number" style={{ ...compactPillStyle, color: done ? "var(--foreground)" : "var(--muted-foreground)" }}>
          {done ? "完成" : `第 ${index} 步`}
        </span>
        <StatusDot key="dot" done={done} />
      </div>
      <div key="title" style={{ fontWeight: 900, fontSize: "15px" }}>{title}</div>
      <div key="detail" style={helpStyle}>{detail}</div>
      {action ? <div key="action" style={{ marginTop: "auto" }}>{action}</div> : null}
    </div>
  );
}

function PipelineStep({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div
      style={{
        ...pipelineStepStyle,
        border: done ? "1px solid color-mix(in oklab, var(--primary) 36%, var(--border))" : pipelineStepStyle.border,
      }}
    >
      <div key="head" style={rowStyle}>
        <StatusDot key="dot" done={done} />
        <strong key="label">{label}</strong>
      </div>
      <div key="detail" style={helpStyle}>{detail}</div>
    </div>
  );
}

function FieldPath({ items }: { items: string[] }) {
  return (
    <div style={{ ...rowStyle, gap: "6px" }}>
      {items.map((item, index) => (
        <span key={`${item}-${index}`} style={{ ...rowStyle, gap: "6px" }}>
          <Badge key="item">{item}</Badge>
          {index < items.length - 1 ? <span key="arrow" style={helpStyle}>→</span> : null}
        </span>
      ))}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div style={fieldStyle}>
      <span key="label" style={labelStyle}>{label}</span>
      <span key="control" style={{ display: "contents" }}>{Children.toArray(children)}</span>
      {help ? <span key="help" style={helpStyle}>{help}</span> : null}
    </div>
  );
}

function ToggleField({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div style={fieldStyle}>
      <div key="row" style={actionBarStyle}>
        <span key="label" style={labelStyle}>{label}</span>
        <button
          key="switch"
          type="button"
          aria-pressed={checked}
          onClick={() => onChange(!checked)}
          style={{
            width: "44px",
            height: "24px",
            borderRadius: "999px",
            border: "1px solid var(--border)",
            padding: "2px",
            background: checked ? "var(--primary)" : "var(--muted)",
            cursor: "pointer",
            display: "flex",
            justifyContent: checked ? "flex-end" : "flex-start",
            alignItems: "center",
          }}
        >
          <span key="knob" style={{
            width: "18px",
            height: "18px",
            borderRadius: "999px",
            background: checked ? "var(--primary-foreground)" : "var(--background)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.16)",
          }} />
        </button>
      </div>
      {help ? <span key="help" style={helpStyle}>{help}</span> : null}
    </div>
  );
}

function NoticeBanner({ notice, meta }: { notice: { tone: "success" | "error" | "info"; text: string }; meta?: string | null }) {
  const border = notice.tone === "error"
    ? "1px solid var(--destructive)"
    : notice.tone === "success"
      ? "1px solid color-mix(in oklab, var(--primary) 45%, var(--border))"
      : "1px solid var(--border)";
  const background = notice.tone === "error"
    ? "color-mix(in oklab, var(--destructive) 8%, var(--background))"
    : notice.tone === "success"
      ? "color-mix(in oklab, var(--primary) 8%, var(--background))"
      : "var(--background)";
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        border,
        borderRadius: "8px",
        padding: "10px 12px",
        background,
        display: "grid",
        gap: "4px",
      }}
    >
      <div key="text" style={{ fontWeight: 700 }}>{notice.text}</div>
      {meta ? <div key="meta" style={helpStyle}>{meta}</div> : null}
    </div>
  );
}

function normalizeText(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeUiConfig(input: Record<string, unknown> | null | undefined): ConfigRecord {
  const source = (input ?? {}) as ConfigRecord;
  return {
    ...DEFAULT_CONFIG,
    ...source,
    connections: Array.isArray(source.connections) ? source.connections : [],
    routes: Array.isArray(source.routes) ? source.routes : [],
    baseSinks: Array.isArray(source.baseSinks) ? source.baseSinks : [],
  };
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") {
    const trimmed = error.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as { message?: unknown; error?: { message?: unknown; hint?: unknown } };
        const message = typeof parsed.error?.message === "string"
          ? parsed.error.message
          : typeof parsed.message === "string"
            ? parsed.message
            : trimmed;
        const hint = typeof parsed.error?.hint === "string" ? parsed.error.hint : "";
        return hint ? `${message}。${hint}` : message;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof error === "object" && error !== null) {
    const record = error as { message?: unknown; error?: { message?: unknown; hint?: unknown } };
    if (typeof record.error?.message === "string") {
      const hint = typeof record.error.hint === "string" ? record.error.hint : "";
      return hint ? `${record.error.message}。${hint}` : record.error.message;
    }
    if (typeof record.message === "string") return readableError(record.message);
  }
  return "操作失败，请刷新后重试。";
}

function companyLabel(company: CompanyOption): string {
  return company.issuePrefix ? `${company.name}（${company.issuePrefix}）` : company.name;
}

function agentLabel(agent: AgentOption): string {
  return agent.title ? `${agent.name} - ${agent.title}` : agent.name;
}

function profileLabel(profile: ProfileOption): string {
  const parts = [profileDisplayName(profile)];
  parts.push(profileAuthLabel(profile));
  if (profile.appId) parts.push(`App ID：${profile.appId}`);
  if (profile.name && profile.name !== profile.appId) parts.push(`配置：${profile.name}`);
  if (profile.active) parts.push("当前默认");
  return parts.join(" · ");
}

function profileAuthLabel(profile?: ProfileOption | null): string {
  if (profile?.user) return `个人授权：${profile.user}`;
  return "机器人身份：已用于收发消息";
}

function profileAuthDetail(profile?: ProfileOption | null): string {
  if (profile?.user) return "已经完成用户授权，可按授权范围访问个人飞书资源。";
  return "这是正常状态：收消息、回消息、写多维表格走机器人身份，不需要个人授权。只有访问个人文档、日历、邮箱时才单独授权。";
}

function missingProfileHelp(connection?: FeishuConnectionConfig | null): string {
  const label = connection?.name || connection?.profileName || "这个机器人";
  return `当前页面还保留“${label}”，但这台机器/服务器没有读到对应的 lark-cli 授权。先点“刷新机器人列表”；如果还没有，就点“重新绑定”重新走一次飞书授权。云服务器部署时，本地绑定不会自动带过去，服务器上也要绑定或注入同一套密钥。`;
}

function profileDisplayName(profile?: ProfileOption | null): string {
  if (!profile) return "飞书应用";
  return profile.botName || (profile.user ? `飞书应用（${profile.user}）` : profile.name || "飞书应用");
}

function appLabel(connection?: FeishuConnectionConfig, profile?: ProfileOption | null): string {
  const realBotName = profile?.botName ?? null;
  const connectionName = connection?.name?.trim();
  if (realBotName) return realBotName;
  if (connectionName) return connectionName;
  if (profile?.user) return `飞书应用（${profile.user}）`;
  if (profile?.name) return profile.name;
  return "飞书应用";
}

function appMeta(connection?: FeishuConnectionConfig, profile?: ProfileOption | null): string {
  const parts: string[] = [];
  if (connection?.name && profile?.botName && connection.name !== profile.botName) parts.push(`页面备注：${connection.name}`);
  if (profile?.user) parts.push(`授权用户：${profile.user}`);
  const appId = connection?.appId || profile?.appId;
  if (appId) parts.push(`App ID：${appId}`);
  if (profile?.active) parts.push("当前默认");
  return parts.join(" · ");
}

function routeTitle(route: FeishuRouteConfig, index: number): string {
  if (route.matchType === "keyword" && route.keyword) {
    return `包含“${route.keyword}”的飞书消息`;
  }
  if (route.matchType === "regex") {
    if (route.regex?.includes("锐思") && route.regex?.includes("paperclip")) {
      return "高级入口：关键词“锐思 / paperclip”";
    }
    return "匹配高级规则的飞书消息";
  }
  if (route.matchType === "chat") {
    return route.chatName ? `来自“${route.chatName}”的消息` : route.chatId ? `来自指定会话的消息` : "指定飞书会话里的消息";
  }
  if (route.matchType === "user") {
    return route.userName ? `${route.userName} 发来的消息` : route.userOpenId ? "指定人员发来的消息" : "指定发消息人的需求";
  }
  if (route.matchType === "default") return "其他未匹配消息";
  return `接收规则 ${index + 1}`;
}

function routeSourceLabel(route: FeishuRouteConfig): string {
  if (route.matchType === "chat") return route.chatName ? `飞书会话“${route.chatName}”` : route.chatId ? `指定会话 ${route.chatId}` : "指定群或单聊";
  if (route.matchType === "user") return route.userName ? `指定人员“${route.userName}”` : route.userOpenId ? `指定人员 ${route.userOpenId}` : "指定发消息人";
  if (route.matchType === "keyword") return route.keyword ? `消息包含“${route.keyword}”` : "消息包含关键词";
  if (route.matchType === "regex") return route.regex ? "按高级规则匹配" : "高级规则";
  return "未被其他规则接走的消息";
}

function routeTargetLabel(company: CompanyOption | null, agent: AgentOption | null): string {
  if (!company && !agent) return "还没选择";
  if (company && agent) return `${agentLabel(agent)}（${companyLabel(company)}）`;
  if (company) return `${companyLabel(company)}里的智能体`;
  return agent ? agentLabel(agent) : "还没选择";
}

function baseSinkLabel(baseSinks: FeishuBaseSinkConfig[], sinkId?: string): string {
  if (!sinkId) return "不写入多维表格";
  const sink = baseSinks.find((item) => item.id === sinkId);
  if (!sink) return `${sinkId}（未找到）`;
  return `${sink.tableIdOrName || sink.id}`;
}

function feishuSmokeText(route?: FeishuRouteConfig | null): string {
  if (!route) return "@paperclip 只回复 ok";
  if (route.matchType === "keyword") return `@${route.keyword || "paperclip"} 只回复 ok`;
  if (route.matchType === "regex" && route.regex?.includes("paperclip")) return "paperclip 只回复 ok";
  return "@paperclip 只回复 ok";
}

function feishuTaskTestText(route?: FeishuRouteConfig | null): string {
  const trigger = route?.matchType === "keyword"
    ? `@${route.keyword || "paperclip"}`
    : route?.matchType === "regex" && route.regex?.includes("paperclip")
      ? "paperclip"
      : "@paperclip";
  return `${trigger} 请创建一个 Paperclip 测试任务，完成后回复我；如果我带了图片或文件，也请一起处理。`;
}

function routeTestHint(route?: FeishuRouteConfig | null): string {
  if (!route) return "先新增一条飞书入口，再去飞书里发测试消息。";
  if (route.matchType === "chat") return "请在这条入口绑定的飞书群或单聊里发送。";
  if (route.matchType === "user") return "请用这条入口指定的飞书用户账号发送。";
  if (route.matchType === "keyword") return "消息里必须包含入口关键词，机器人被 @ 时更容易触发。";
  if (route.matchType === "regex") return "消息要匹配高级规则。普通用户建议改成关键词入口。";
  return "这条入口会接收没有被其他规则匹配的消息。";
}

function deploymentHint(): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host === "localhost" || host === "127.0.0.1") {
    return "当前是本地测试：这个飞书应用绑在这台 Mac 上。未来部署到云服务器后，要把同一个飞书应用绑定到服务器上。";
  }
  return "当前是服务器环境：飞书应用配置来自 Paperclip 服务器，不会读取用户电脑。";
}

function isLocalRuntime(): boolean {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  return host === "localhost" || host === "127.0.0.1";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function serverProfileName(connection?: FeishuConnectionConfig): string {
  return connection?.profileName?.trim() || "paperclip-feishu-bot";
}

function buildServerDeployCommands(connection?: FeishuConnectionConfig): string {
  const profileName = serverProfileName(connection);
  const appId = connection?.appId?.trim() || "<App ID>";
  return [
    "# 1. 在 Paperclip 服务器上确认 lark-cli 可用",
    "lark-cli --version",
    "lark-cli doctor",
    "",
    "# 2. 在服务器上绑定同一个飞书应用。App Secret 不要发到聊天或截图里。",
    `lark-cli config init --new --name ${shellQuote(profileName)} --brand feishu --lang zh`,
    `printf '<App Secret>' | lark-cli profile add --name ${shellQuote(profileName)} --app-id ${shellQuote(appId)} --brand feishu --app-secret-stdin --use`,
    "",
    "# 3. 回到 Paperclip 飞书连接器页面，刷新机器人列表，确认同名 profile 出现后再保存配置。",
  ].join("\n");
}

function connectionOptionNodes(
  connections: FeishuConnectionConfig[],
  prefix: string,
  defaultLabel = "默认第一个可用机器人",
  profiles: ProfileOption[] = [],
): ReactNode {
  return Children.toArray([
    <option key={`${prefix}-default`} value="">{defaultLabel}</option>,
    ...connections.map((connection, optionIndex) => {
      const profile = profiles.find((item) => item.name === connection.profileName) ?? null;
      return (
        <option key={`${prefix}-connection-${optionIndex}-${connection.id}`} value={connection.id}>
          {appLabel(connection, profile)}
        </option>
      );
    }),
  ]);
}

function companyOptionNodes(companies: CompanyOption[], prefix: string): ReactNode {
  return Children.toArray([
    <option key={`${prefix}-empty-company`} value="">请选择公司</option>,
    ...companies.map((item, optionIndex) => (
      <option key={`${prefix}-company-${optionIndex}-${item.id}`} value={item.id}>
        {companyLabel(item)}
      </option>
    )),
  ]);
}

function agentOptionNodes(agents: AgentOption[], prefix: string): ReactNode {
  return Children.toArray([
    <option key={`${prefix}-empty-agent`} value="">请选择智能体</option>,
    ...agents.map((item, optionIndex) => (
      <option key={`${prefix}-agent-${optionIndex}-${item.id}`} value={item.id}>
        {agentLabel(item)}
      </option>
    )),
  ]);
}

function baseSinkOptionNodes(baseSinks: FeishuBaseSinkConfig[], prefix: string): ReactNode {
  return Children.toArray([
    <option key={`${prefix}-empty-base-sink`} value="">不写入多维表格</option>,
    ...baseSinks.map((sink, optionIndex) => (
      <option key={`${prefix}-base-sink-${optionIndex}-${sink.id}`} value={sink.id}>
        {sink.id}
      </option>
    )),
  ]);
}

function profileOptionNodes(
  profiles: ProfileOption[],
  currentProfileName: string | undefined,
  prefix: string,
): ReactNode {
  const hasCurrent = currentProfileName
    ? profiles.some((profile) => profile.name === currentProfileName)
    : false;
  return Children.toArray([
    <option key={`${prefix}-empty-profile`} value="">请选择已登录 profile</option>,
    ...profiles.map((profile, optionIndex) => (
        <option key={`${prefix}-profile-${optionIndex}-${profile.name}`} value={profile.name}>
          {profileLabel(profile)}
        </option>
    )),
    ...(currentProfileName && !hasCurrent
      ? [
        <option key={`${prefix}-current-profile`} value={currentProfileName}>
          {currentProfileName}（当前配置，未在本机列表中）
        </option>,
      ]
      : []),
  ]);
}

function resolveCompany(route: FeishuRouteConfig, companies: CompanyOption[]): CompanyOption | null {
  const id = normalizeText(route.companyId);
  if (id) {
    const byId = companies.find((company) => normalizeText(company.id) === id);
    if (byId) return byId;
  }

  const ref = normalizeText(route.companyRef);
  if (!ref) return null;
  return companies.find((company) =>
    normalizeText(company.id) === ref ||
    normalizeText(company.name) === ref ||
    normalizeText(company.issuePrefix) === ref
  ) ?? null;
}

function resolveAgent(route: FeishuRouteConfig, company: CompanyOption | null): AgentOption | null {
  if (!company) return null;
  const id = normalizeText(route.targetAgentId);
  if (id) {
    const byId = company.agents.find((agent) => normalizeText(agent.id) === id);
    if (byId) return byId;
  }

  const ref = normalizeText(route.targetAgentRef ?? route.targetAgentName);
  if (!ref) return null;
  return company.agents.find((agent) =>
    normalizeText(agent.id) === ref ||
    normalizeText(agent.name) === ref ||
    normalizeText(agent.title) === ref ||
    normalizeText(agent.urlKey) === ref
  ) ?? null;
}

async function hostFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return await response.json() as T;
}

function useSettingsConfig() {
  const [configJson, setConfigJson] = useState<ConfigRecord>(() => normalizeUiConfig({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    hostFetchJson<{ configJson?: Record<string, unknown> | null } | null>(`/api/plugins/${PLUGIN_ID}/config`)
      .then((result) => {
        if (cancelled) return;
        setConfigJson(normalizeUiConfig(result?.configJson ?? {}));
        setError(null);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(readableError(nextError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(nextConfig: ConfigRecord) {
    setSaving(true);
    try {
      await hostFetchJson(`/api/plugins/${PLUGIN_ID}/config`, {
        method: "POST",
        body: JSON.stringify({ configJson: nextConfig }),
      });
      setConfigJson(normalizeUiConfig(nextConfig));
      setError(null);
    } catch (nextError) {
      setError(readableError(nextError));
      throw nextError;
    } finally {
      setSaving(false);
    }
  }

  async function test(nextConfig: ConfigRecord) {
    return await hostFetchJson<{ valid: boolean; message?: string }>(`/api/plugins/${PLUGIN_ID}/config/test`, {
      method: "POST",
      body: JSON.stringify({ configJson: nextConfig }),
    });
  }

  return { configJson, setConfigJson, loading, saving, error, save, test };
}

function connectionFromProfile(input: {
  index: number;
  profileName: string;
  appId?: string;
  displayName?: string;
}): FeishuConnectionConfig {
  const baseId = input.profileName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "feishu-bot";
  return {
    id: input.index === 0 ? baseId : `${baseId}-${input.index + 1}`,
    name: input.displayName?.trim() || `飞书机器人 ${input.index + 1}`,
    profileName: input.profileName,
    appId: input.appId,
    enabled: true,
  };
}

function suggestedBindProfileName(profiles: ProfileOption[]): string {
  const existing = new Set(profiles.map((profile) => profile.name));
  if (!existing.has("paperclip-feishu-bot")) return "paperclip-feishu-bot";
  for (let index = 2; index < 100; index += 1) {
    const candidate = `paperclip-feishu-bot-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `paperclip-feishu-bot-${Date.now()}`;
}

function defaultRoute(
  index: number,
  connection: FeishuConnectionConfig | undefined,
  company: CompanyOption | undefined,
): FeishuRouteConfig {
  const agent = company?.agents[0];
  return {
    id: index === 0 ? "feishu-to-agent" : `feishu-to-agent-${index + 1}`,
    connectionId: connection?.id,
    enabled: true,
    priority: 10,
    matchType: "keyword",
    keyword: "paperclip",
    companyId: company?.id,
    companyRef: company?.issuePrefix ?? company?.name,
    targetAgentId: agent?.id,
    targetAgentName: agent?.name,
    replyMode: "thread",
  };
}

export function FeishuSettingsPage(_props: PluginSettingsPageProps) {
  const catalog = usePluginData<CatalogData>(DATA_KEYS.catalog);
  const profileCatalog = usePluginData<ProfilesData>(DATA_KEYS.profiles);
  const connectorStatus = usePluginData<ConnectorStatus>(DATA_KEYS.status);
  const bindProfile = usePluginAction(ACTION_KEYS.bindProfile);
  const startGuidedBind = usePluginAction(ACTION_KEYS.startGuidedBind);
  const finishGuidedBind = usePluginAction(ACTION_KEYS.finishGuidedBind);
  const startUserAuth = usePluginAction(ACTION_KEYS.startUserAuth);
  const finishUserAuth = usePluginAction(ACTION_KEYS.finishUserAuth);
  const testRoute = usePluginAction(ACTION_KEYS.testRoute);
  const {
    configJson,
    setConfigJson,
    loading,
    saving,
    error,
    save,
    test,
  } = useSettingsConfig();
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [showBindPanel, setShowBindPanel] = useState(false);
  const [bindPanelTitle, setBindPanelTitle] = useState("绑定新的飞书机器人");
  const [bindMethod, setBindMethod] = useState<BindMethod>("guided");
  const [binding, setBinding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(null);
  const [checkReportItems, setCheckReportItems] = useState<CheckReportItem[]>([]);
  const [startingGuidedBind, setStartingGuidedBind] = useState(false);
  const [finishingGuidedBind, setFinishingGuidedBind] = useState(false);
  const [startingUserAuthProfileName, setStartingUserAuthProfileName] = useState<string | null>(null);
  const [finishingUserAuthProfileName, setFinishingUserAuthProfileName] = useState<string | null>(null);
  const [userAuthResults, setUserAuthResults] = useState<Record<string, UserAuthResult>>({});
  const [guidedBindResult, setGuidedBindResult] = useState<GuidedBindResult | null>(null);
  const [testingRouteId, setTestingRouteId] = useState<string | null>(null);
  const [fixingRouteId, setFixingRouteId] = useState<string | null>(null);
  const [routeTestResults, setRouteTestResults] = useState<Record<string, { tone: "success" | "error"; text: string }>>({});
  const [checkingConnectionId, setCheckingConnectionId] = useState<string | null>(null);
  const [connectionCheckResults, setConnectionCheckResults] = useState<Record<string, BotCheckState>>({});
  const [showFeishuTestGuide, setShowFeishuTestGuide] = useState(false);
  const [bindForm, setBindForm] = useState<BindFormState>({
    displayName: "飞书机器人",
    profileName: "",
    appId: "",
    appSecret: "",
  });
  const [showEntryWizard, setShowEntryWizard] = useState(false);
  const [savedEntry, setSavedEntry] = useState<{ routeId: string; at: string } | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [activeAdvancedPanel, setActiveAdvancedPanel] = useState<AdvancedPanelKey>("auth");
  const [activeMainTab, setActiveMainTab] = useState<MainTabKey>(() => initialMainTab());
  const [expandedEntryRouteId, setExpandedEntryRouteId] = useState<string | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState("智能体");
  const [userSearchQuery, setUserSearchQuery] = useState("张");
  const [wizardDraft, setWizardDraft] = useState<EntryWizardDraft>({
    matchType: "keyword",
    keyword: "paperclip",
    replyMode: "thread",
  });

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const syncFromHash = () => setActiveMainTab(mainTabFromHash(window.location.hash));
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const companies = catalog.data?.companies ?? [];
  const connections = configJson.connections ?? [];
  const routes = configJson.routes ?? [];
  const baseSinks = configJson.baseSinks ?? [];
  const profiles = profileCatalog.data?.profiles ?? [];
  const profileError = profileCatalog.data?.error ?? profileCatalog.error?.message;
  const suggestedNewProfileName = suggestedBindProfileName(profiles);
  const activeConnections = connections.filter((connection) => connection.enabled !== false);
  const availableProfileNames = new Set(profiles.map((profile) => profile.name));
  const usableConnections = activeConnections.filter((connection) => availableProfileNames.has(connection.profileName));
  const missingProfileConnections = activeConnections.filter((connection) => !availableProfileNames.has(connection.profileName));
  const firstEnabledConnection = activeConnections[0] ?? connections[0];
  const preferredConnection = usableConnections[0] ?? firstEnabledConnection;
  const suggestedProfileName = firstEnabledConnection?.profileName || "paperclip-feishu-bot";
  const runtimeHint = deploymentHint();
  const connectedProfile = profiles.find((profile) => profile.name === firstEnabledConnection?.profileName);
  const directoryProfileName = profiles.find((profile) => profile.user)?.name
    ?? connectedProfile?.name
    ?? firstEnabledConnection?.profileName
    ?? "";
  const directoryParams = useMemo(() => ({
    profileName: directoryProfileName,
    chatQuery: chatSearchQuery,
    userQuery: userSearchQuery,
  }), [directoryProfileName, chatSearchQuery, userSearchQuery]);
  const directoryCatalog = usePluginData<DirectoryData>(DATA_KEYS.directory, directoryParams);
  const hasConnection = activeConnections.some((connection) => connection.profileName);
  const hasUsableConnection = usableConnections.length > 0;
  const enabledRouteCount = routes.filter((route) => route.enabled !== false).length;
  const isSendingRealMessages = configJson.dryRunCli !== true;
  const isListening = configJson.enableEventSubscriber === true;
  const runningOnLocalhost = isLocalRuntime();

  const routeSummaries = useMemo(() => routes.map((route) => {
    const company = resolveCompany(route, companies);
    const agent = resolveAgent(route, company);
    return { route, company, agent };
  }), [companies, routes]);
  const enabledRouteSummaries = routeSummaries.filter(({ route }) => route.enabled !== false);
  const firstEnabledRouteSummary = routeSummaries.find(({ route }) => route.enabled !== false) ?? routeSummaries[0] ?? null;
  const firstRouteConnection = firstEnabledRouteSummary?.route.connectionId
    ? connections.find((connection) => connection.id === firstEnabledRouteSummary.route.connectionId) ?? preferredConnection
    : preferredConnection;
  const firstRouteProfile = profiles.find((profile) => profile.name === firstRouteConnection?.profileName);
  const firstRouteConnectionReady = Boolean(firstRouteConnection?.profileName && availableProfileNames.has(firstRouteConnection.profileName));
  const enabledRoutesWithMissingConnection = enabledRouteSummaries.filter(({ route }) => {
    const connection = route.connectionId
      ? connections.find((candidate) => candidate.id === route.connectionId)
      : preferredConnection;
    return !connection?.profileName || !availableProfileNames.has(connection.profileName);
  }).length;
  const firstMissingRouteSummary = enabledRouteSummaries.find(({ route }) => {
    const connection = route.connectionId
      ? connections.find((candidate) => candidate.id === route.connectionId)
      : preferredConnection;
    return !connection?.profileName || !availableProfileNames.has(connection.profileName);
  }) ?? null;
  const connectionToFix = firstMissingRouteSummary?.route.connectionId
    ? connections.find((connection) => connection.id === firstMissingRouteSummary.route.connectionId)
    : missingProfileConnections[0] ?? null;
  const quickSmokeText = feishuSmokeText(firstEnabledRouteSummary?.route);
  const smokeText = feishuTaskTestText(firstEnabledRouteSummary?.route);
  const currentBotName = firstRouteProfile?.botName ?? connectedProfile?.botName ?? null;
  const routeUsesOldBotKeyword = Boolean(
    firstEnabledRouteSummary?.route.matchType === "regex"
      && firstEnabledRouteSummary.route.regex?.includes("锐思")
      && currentBotName
      && !firstEnabledRouteSummary.route.regex.includes(currentBotName),
  );
  const canTryFeishuSmokeTest = firstRouteConnectionReady && enabledRouteCount > 0 && isListening && isSendingRealMessages;
  const connectionUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const fallbackConnectionId = preferredConnection?.id;
    for (const route of routes) {
      if (route.enabled === false) continue;
      const connectionId = route.connectionId || fallbackConnectionId;
      if (!connectionId) continue;
      counts.set(connectionId, (counts.get(connectionId) ?? 0) + 1);
    }
    return counts;
  }, [routes, preferredConnection?.id]);
  const activeConnectionLabels = activeConnections
    .map((connection) => {
      const label = appLabel(connection, profiles.find((profile) => profile.name === connection.profileName));
      const routeCount = connectionUsageCounts.get(connection.id) ?? 0;
      const profileReady = availableProfileNames.has(connection.profileName);
      return `${label}（${profileReady ? `${routeCount} 条入口` : "profile 缺失"}）`;
    })
    .filter(Boolean);
  const runtimeStatusLabel = isListening && isSendingRealMessages
    ? "监听中"
    : isListening
      ? "监听中，模拟回复"
      : "未监听";
  const runtimeStatusDetail = isListening && isSendingRealMessages
    ? "真实回复已开启"
    : `${isListening ? "已接收事件" : "不会自动接收飞书消息"} · ${isSendingRealMessages ? "真实回复" : "测试模式"}`;
  const feishuEventRecords = useMemo(() => {
    const records = connectorStatus.data?.recentRecords ?? [];
    return records.filter(isInboundMessageRecord);
  }, [connectorStatus.data?.recentRecords]);
  const latestFeishuEvent = feishuEventRecords[0] ?? null;
  const statusTitle = !hasConnection
    ? "待接入飞书机器人"
    : !hasUsableConnection
      ? "已配置机器人，但当前运行环境缺少授权"
    : enabledRouteCount === 0
      ? "已添加飞书机器人，待配置消息入口"
      : enabledRoutesWithMissingConnection > 0
        ? "有入口使用的飞书机器人不可运行，需要重新绑定或换机器人"
      : !isListening
        ? "已配置入口，待开启飞书消息监听"
        : !isSendingRealMessages
      ? "当前为测试模式，暂不会真实回复飞书"
      : "配置已就绪，等待飞书实测确认";
  const overviewTitle = !hasConnection
    ? "先接入一个飞书机器人"
    : enabledRoutesWithMissingConnection > 0
      ? "飞书入口需要修复"
      : hasUsableConnection
        ? "飞书已经连接到 Paperclip"
        : "飞书机器人还没有授权到当前环境";
  const nextStepKind: NextStepKind = !hasConnection
    ? "bind"
    : !hasUsableConnection
      ? "rebind"
      : enabledRouteCount === 0
        ? "entry"
        : enabledRoutesWithMissingConnection > 0
          ? "edit-entry"
          : !isListening
            ? "enable-listen"
            : !isSendingRealMessages
              ? "enable-real"
              : "test";
  const nextStepCopy = (() => {
    if (nextStepKind === "bind") {
      return {
        title: "下一步：先接入飞书机器人",
        detail: "这是唯一必须先做的事。接入后再选择“哪些消息进来、交给哪个智能体”。",
      };
    }
    if (nextStepKind === "rebind") {
      const label = appLabel(connectionToFix ?? firstEnabledConnection, profiles.find((profile) => profile.name === connectionToFix?.profileName));
      return {
        title: "下一步：修复机器人授权",
        detail: `当前运行环境没有读到“${label}”。先刷新列表；如果仍然没有，就在弹窗里重新绑定这个机器人。`,
      };
    }
    if (nextStepKind === "entry") {
      return {
        title: "下一步：新增一条业务入口",
        detail: "入口决定“哪个飞书群或关键词进来、用哪个机器人收、交给哪个 Paperclip 智能体”。",
      };
    }
    if (nextStepKind === "edit-entry") {
      return {
        title: "下一步：修复入口使用的机器人",
        detail: "有入口还指向不可运行的机器人。编辑这条入口，换成可运行机器人，或重新绑定原机器人。",
      };
    }
    if (nextStepKind === "enable-listen") {
      return {
        title: "下一步：开启自动监听",
        detail: "不开监听时，飞书里发消息不会自动进入 Paperclip。开启后再去飞书实测。",
      };
    }
    if (nextStepKind === "enable-real") {
      return {
        title: "下一步：开启真实回复",
        detail: "当前只是模拟模式。要看到飞书里真实回复，需要开启真实发送。",
      };
    }
    return {
      title: "下一步：去飞书里发一句真实测试",
      detail: `把测试话术发到目标会话：${smokeText}`,
    };
  })();
  const serverDeployConnection = firstRouteConnection ?? preferredConnection ?? firstEnabledConnection;
  const serverDeployCommands = buildServerDeployCommands(serverDeployConnection);
  const activeSubscriberCount = connectorStatus.data?.subscribers
    ?.filter((subscriber) => activeConnections.some((connection) => connection.id === subscriber.connectionId))
    .length ?? 0;
  const capabilityChecks: CheckReportItem[] = [
    {
      tone: hasUsableConnection && !profileError && missingProfileConnections.length === 0
        ? "success"
        : hasConnection
          ? "warning"
          : "error",
      title: "飞书应用授权",
      detail: hasUsableConnection && !profileError
        ? missingProfileConnections.length > 0
          ? `已发现 ${profiles.length} 个 lark-cli profile；${usableConnections.length} 个机器人可运行，${missingProfileConnections.length} 个机器人缺少当前环境授权。`
          : `已发现 ${profiles.length} 个 lark-cli profile，机器人池 ${usableConnections.length} 个可运行。`
        : hasConnection
          ? `已配置机器人，但读取 lark-cli profile 异常：${profileError ?? "当前环境未返回授权列表"}`
          : "还没有把飞书机器人加入机器人池。",
    },
    {
      tone: isListening && activeSubscriberCount > 0 ? "success" : isListening ? "warning" : "warning",
      title: "接收飞书消息",
      detail: isListening
        ? activeSubscriberCount > 0
          ? `已看到 ${activeSubscriberCount} 个监听进程。`
          : "监听开关已开，但暂时没看到监听进程；保存配置或重启服务后再检查。"
        : "监听开关未开启，飞书消息不会自动进入 Paperclip。",
    },
    {
      tone: isSendingRealMessages ? "success" : "warning",
      title: "回复飞书消息",
      detail: isSendingRealMessages ? "真实回复已开启。" : "当前是模拟模式，只验证流程不真正发回飞书。",
    },
    {
      tone: isSendingRealMessages ? "success" : "warning",
      title: "下载飞书附件",
      detail: isSendingRealMessages
        ? "真实任务里会把飞书图片、文件、音频和视频上传成 Paperclip 附件。"
        : "模拟模式只记录附件名称，不会下载上传。",
    },
    {
      tone: directoryCatalog.error || directoryCatalog.data?.chatError || directoryCatalog.data?.userError ? "warning" : "success",
      title: "搜索群和联系人",
      detail: directoryCatalog.error || directoryCatalog.data?.chatError || directoryCatalog.data?.userError
        ? "当前搜索目录有报错，可能影响选择群/联系人。已建好的入口不受影响。"
        : "可以读取当前 profile 可见的群和联系人，用于新增入口。",
    },
    {
      tone: baseSinks.length > 0 ? "success" : "warning",
      title: "写入多维表格",
      detail: baseSinks.length > 0
        ? `已配置 ${baseSinks.length} 条多维表格写入规则。`
        : "未配置。没有需求沉淀到 Base 的场景时可以留空。",
    },
  ];
  const productionMonitor = connectorStatus.data?.monitor;
  const productionMonitorChecks = productionMonitor?.checks ?? [];
  const primaryRouteSummary = firstEnabledRouteSummary;
  const primaryRouteConnectionLabel = appLabel(firstRouteConnection, firstRouteProfile ?? connectedProfile);
  const setupProgressSteps = [
    {
      done: hasUsableConnection,
      title: "选择飞书机器人",
      detail: hasUsableConnection
        ? `${primaryRouteConnectionLabel} 可用于收发飞书消息。`
        : "先绑定一个公司通用机器人或业务专用机器人。",
      action: hasUsableConnection ? (
        <button key="view-bots" type="button" style={buttonStyle} onClick={() => selectMainTab("robots")}>查看机器人</button>
      ) : (
        <button key="bind-bot" type="button" style={primaryButtonStyle} onClick={() => openBindPanel(undefined, "guided")}>绑定机器人</button>
      ),
    },
    {
      done: enabledRouteCount > 0,
      title: "建立业务入口",
      detail: enabledRouteCount > 0
        ? `${enabledRouteCount} 条入口正在把飞书消息交给 Paperclip。`
        : "决定哪个群、关键词或联系人进入哪个智能体。",
      action: (
        <button key="manage-entry" type="button" style={enabledRouteCount > 0 ? buttonStyle : primaryButtonStyle} onClick={() => openEntryWizard()}>
          {enabledRouteCount > 0 ? "管理入口" : "新增入口"}
        </button>
      ),
    },
    {
      done: canTryFeishuSmokeTest,
      title: "飞书里真实测试",
      detail: canTryFeishuSmokeTest
        ? "监听和真实回复已开启，可以去飞书发测试话术。"
        : "确认监听、真实回复和入口机器人都就绪后再实测。",
      action: (
        <button key="go-test" type="button" style={canTryFeishuSmokeTest ? primaryButtonStyle : buttonStyle} onClick={() => selectMainTab("test")}>
          去测试
        </button>
      ),
    },
  ];
  const realTestPipeline = [
    {
      done: firstRouteConnectionReady,
      label: "机器人可用",
      detail: firstRouteConnectionReady ? primaryRouteConnectionLabel : "当前入口机器人未在运行环境中读到。",
    },
    {
      done: enabledRouteCount > 0,
      label: "入口已建",
      detail: primaryRouteSummary ? routeTitle(primaryRouteSummary.route, 0) : "还没有飞书消息入口。",
    },
    {
      done: isListening,
      label: "正在监听",
      detail: isListening ? runtimeStatusLabel : "未开启监听，飞书消息不会自动进入。",
    },
    {
      done: isSendingRealMessages,
      label: "真实回复",
      detail: isSendingRealMessages ? "智能体完成后会回复飞书。" : "当前是模拟模式。",
    },
    {
      done: isSendingRealMessages,
      label: "附件入库",
      detail: isSendingRealMessages ? "图片和文件会作为任务附件。" : "模拟模式不下载附件。",
    },
  ];

  function patchWizardDraft(patch: Partial<EntryWizardDraft>) {
    setWizardDraft((prev) => ({ ...prev, ...patch }));
    setNotice(null);
  }

  function selectChatForWizard(chat: DirectoryChatOption) {
    patchWizardDraft({
      matchType: "chat",
      chatId: chat.chatId,
      chatName: chat.name,
    });
    setNotice({ tone: "success", text: `已选择飞书会话：${chat.name}` });
  }

  function selectUserForWizard(user: DirectoryUserOption) {
    patchWizardDraft({
      matchType: "user",
      userOpenId: user.openId,
      userName: user.name,
    });
    setNotice({ tone: "success", text: `已选择发消息人：${user.name}` });
  }

  function patchConfig(patch: Partial<ConfigRecord>) {
    setConfigJson((prev) => normalizeUiConfig({ ...prev, ...patch }));
    setNotice(null);
    setCheckReportItems([]);
  }

  function selectMainTab(tab: MainTabKey) {
    setActiveMainTab(tab);
    if (tab !== "advanced") {
      setShowAdvancedSettings(false);
    }
    const hash = mainTabs.find((item) => item.key === tab)?.hash;
    if (hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${hash}`);
    }
  }

  function patchRoute(index: number, patch: Partial<FeishuRouteConfig>) {
    const next = [...routes];
    next[index] = { ...next[index], ...patch } as FeishuRouteConfig;
    patchConfig({ routes: next });
  }

  function patchBaseSink(index: number, patch: Partial<FeishuBaseSinkConfig>) {
    const next = [...baseSinks];
    next[index] = { ...next[index], ...patch } as FeishuBaseSinkConfig;
    patchConfig({ baseSinks: next });
  }

  async function addProfileToPool(profile: ProfileOption, options: { useForCurrentEntry?: boolean } = {}) {
    const existing = connections.find((connection) => connection.profileName === profile.name);
    const displayName = profileDisplayName(profile);
    const selected = existing
      ? {
        ...existing,
        enabled: true,
        appId: profile.appId ?? existing.appId,
        name: existing.name && existing.name !== existing.profileName ? existing.name : displayName,
      }
      : connectionFromProfile({
        index: connections.length,
        profileName: profile.name,
        appId: profile.appId ?? undefined,
        displayName,
      });
    const firstRouteId = firstEnabledRouteSummary?.route.id;
    const updatedConnections = existing
      ? connections.map((connection) => connection.profileName === profile.name ? selected : connection)
      : [...connections, selected];
    const nextConnections = !firstEnabledConnection || (options.useForCurrentEntry && !firstRouteId)
      ? [
        selected,
        ...updatedConnections.filter((connection) => connection.profileName !== profile.name),
      ]
      : updatedConnections;
    const nextRoutes = firstRouteId
      ? routes.map((route) => options.useForCurrentEntry && route.id === firstRouteId ? { ...route, connectionId: selected.id } : route)
      : routes;
    const nextConfig = normalizeUiConfig({
      ...configJson,
      connections: nextConnections,
      routes: nextRoutes,
    });
    setNotice({
      tone: "info",
      text: options.useForCurrentEntry
        ? `正在把指定入口改用“${appLabel(selected, profile)}”...`
        : `正在把“${appLabel(selected, profile)}”加入机器人池...`,
    });
    try {
      await save(nextConfig);
      setConfigJson(nextConfig);
      profileCatalog.refresh();
      setNotice({
        tone: "success",
        text: options.useForCurrentEntry && firstRouteId
          ? `已保存：指定入口已改用“${appLabel(selected, profile)}”。其他飞书机器人仍然保留，可给其他入口使用。`
          : `已保存：已添加“${appLabel(selected, profile)}”。后续每条飞书入口都可以单独选择机器人。`,
      });
    } catch (nextError) {
      setNotice({ tone: "error", text: readableError(nextError) });
    }
  }

  function addConnectionFromProfile(profile: ProfileOption) {
    void addProfileToPool(profile);
  }

  function openBindPanel(connection?: FeishuConnectionConfig, method: BindMethod = "guided") {
    const title = connection ? `重新绑定：${connection.name || connection.profileName}` : "绑定新的飞书机器人";
    setBindForm((prev) => ({
      ...prev,
      displayName: connection?.name || prev.displayName || "飞书机器人",
      profileName: connection?.profileName || prev.profileName || suggestedNewProfileName,
      appId: connection?.appId || prev.appId,
      appSecret: "",
    }));
    setGuidedBindResult(null);
    setBindMethod(method);
    setBindPanelTitle(title);
    setShowBindPanel(true);
    setNotice(null);
  }

  function openEntryWizard(connectionId?: string) {
    if (!hasConnection) {
      openBindPanel();
      setNotice({ tone: "info", text: "先选择或绑定一个飞书机器人，然后再新增飞书入口。" });
      return;
    }
    selectMainTab("entries");
    const existingSummary = routeSummaries.find((summary) => summary.company && summary.agent) ?? null;
    const company = existingSummary?.company ?? companies[0];
    const agent = existingSummary?.agent ?? company?.agents[0];
    const existingConnection = existingSummary?.route.connectionId
      ? connections.find((connection) => connection.id === existingSummary.route.connectionId)
      : null;
    setWizardDraft({
      connectionId: connectionId ?? existingConnection?.id ?? preferredConnection?.id,
      matchType: "keyword",
      keyword: "paperclip",
      replyMode: "thread",
      companyId: company?.id,
      targetAgentId: agent?.id,
    });
    setShowEntryWizard(true);
    setNotice(null);
  }

  function openEntryEditor(routeId?: string) {
    const route = routeId
      ? routes.find((item) => item.id === routeId)
      : firstEnabledRouteSummary?.route;
    if (!route) {
      openEntryWizard();
      return;
    }
    selectMainTab("entries");
    setShowEntryWizard(false);
    setExpandedEntryRouteId(route.id);
    setNotice({ tone: "info", text: "已打开入口编辑区，可以改关键词、处理人或回复方式。" });
    window.setTimeout(() => {
      document.getElementById(`product-entry-${route.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 30);
  }

  function refreshProfilesWithNotice() {
    profileCatalog.refresh();
    setToast({ tone: "info", text: "正在刷新飞书机器人列表。" });
    setNotice({ tone: "info", text: "正在刷新飞书机器人列表。授权完成后，如果这里还没出现，通常是当前机器/服务器还没有完成 lark-cli 授权。" });
  }

  function openFeishuTestGuide() {
    selectMainTab("test");
    setShowFeishuTestGuide((value) => !value);
    window.setTimeout(() => {
      document.getElementById("feishu-test-guide")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 30);
  }

  async function copySmokeText() {
    try {
      await navigator.clipboard.writeText(smokeText);
      setNotice({ tone: "success", text: `已复制测试话术：${smokeText}` });
    } catch {
      setNotice({ tone: "info", text: `请复制这句话到飞书发送：${smokeText}` });
    }
  }

  async function copyServerDeployCommands() {
    try {
      await navigator.clipboard.writeText(serverDeployCommands);
      setNotice({ tone: "success", text: "已复制服务器部署命令。App Secret 仍需工程师在服务器安全输入。" });
    } catch {
      setNotice({ tone: "info", text: "复制失败，请在云服务器部署面板里手动复制命令。" });
    }
  }

  function createEntryFromWizard() {
    const company = companies.find((item) => item.id === wizardDraft.companyId) ?? companies[0] ?? null;
    const agent = company?.agents.find((item) => item.id === wizardDraft.targetAgentId) ?? company?.agents[0] ?? null;
    const connection = connections.find((item) => item.id === wizardDraft.connectionId) ?? preferredConnection ?? connections[0] ?? null;

    if (!connection) {
      setNotice({ tone: "error", text: "还没有可用的飞书机器人。请先在“飞书应用与机器人绑定”里绑定或添加机器人。" });
      return;
    }
    if (!company || !agent) {
      setNotice({ tone: "error", text: "还没有可用的 Paperclip 公司或智能体。请先在实例里创建智能体，再回来新增飞书入口。" });
      return;
    }

    const matchType = wizardDraft.matchType;
    const nextRoute: FeishuRouteConfig = {
      id: `feishu-entry-${Date.now().toString(36)}`,
      connectionId: connection.id,
      enabled: true,
      priority: 10,
      matchType,
      companyId: company.id,
      companyRef: company.issuePrefix ?? company.name,
      targetAgentId: agent.id,
      targetAgentName: agent.name,
      replyMode: wizardDraft.replyMode,
      baseSinkId: wizardDraft.baseSinkId || undefined,
      ...(matchType === "chat" ? { chatId: wizardDraft.chatId ?? "", chatName: wizardDraft.chatName } : {}),
      ...(matchType === "user" ? { userOpenId: wizardDraft.userOpenId ?? "", userName: wizardDraft.userName } : {}),
      ...(matchType === "keyword" ? { keyword: wizardDraft.keyword || "paperclip" } : {}),
      ...(matchType === "regex" ? { regex: wizardDraft.regex ?? "" } : {}),
    };

    patchConfig({ routes: [...routes, nextRoute] });
    setShowEntryWizard(false);
    setNotice({ tone: "success", text: "已新增飞书入口。保存配置后，就可以按这个入口接收飞书消息。" });
  }

  async function fixOldBotKeywordRoute() {
    const routeId = firstEnabledRouteSummary?.route.id;
    if (!routeId) return;
    const routeIndex = routes.findIndex((route) => route.id === routeId);
    if (routeIndex < 0) return;
    const nextRoutes = routes.map((route, index) => index === routeIndex
      ? {
        ...route,
        matchType: "keyword" as const,
        keyword: "paperclip",
        regex: undefined,
      }
      : route);
    const nextConfig = normalizeUiConfig({ ...configJson, routes: nextRoutes });
    setFixingRouteId(routeId);
    setNotice({ tone: "info", text: "正在把旧触发词改成 paperclip..." });
    try {
      await save(nextConfig);
      setConfigJson(nextConfig);
      setExpandedEntryRouteId(routeId);
      setNotice({ tone: "success", text: "已保存：这个入口现在按关键词 paperclip 触发。" });
    } catch (nextError) {
      setNotice({ tone: "error", text: readableError(nextError) });
    } finally {
      setFixingRouteId(null);
    }
  }

  async function startOfficialBindWizard() {
    const profileName = bindForm.profileName.trim() || suggestedNewProfileName;
    setStartingGuidedBind(true);
    setGuidedBindResult(null);
    setNotice(null);
    try {
      const result = await startGuidedBind({
        profileName,
        brand: "feishu",
      }) as GuidedBindResult;
      setGuidedBindResult(result);
      setBindForm((prev) => ({ ...prev, profileName }));
      setNotice({
        tone: "info",
        text: result.url
          ? "已生成飞书授权链接。打开链接完成后，回到这里点“我已完成授权”。"
          : "已启动飞书官方绑定向导。如果没有看到链接，请查看下方输出或稍后刷新已绑定应用。",
      });
    } catch (nextError) {
      setNotice({ tone: "error", text: readableError(nextError) });
    } finally {
      setStartingGuidedBind(false);
    }
  }

  async function finishOfficialBindWizard() {
    const profileName = bindForm.profileName.trim() || guidedBindResult?.profileName || suggestedNewProfileName;
    if (!profileName) {
      setNotice({ tone: "error", text: "请先获取飞书授权链接。" });
      return;
    }

    setFinishingGuidedBind(true);
    setNotice(null);
    try {
      const result = await finishGuidedBind({ profileName }) as FinishGuidedBindResult;
      if (!result.profile?.name) {
        throw new Error("没有读取到刚刚绑定的飞书机器人。请稍后刷新再试。");
      }
      await addProfileToPool(result.profile);
      profileCatalog.refresh();
      setShowBindPanel(false);
      setNotice({
        tone: result.warning ? "info" : "success",
        text: result.warning ?? "飞书机器人已确认并加入当前配置。下一步可以新增飞书入口。",
      });
    } catch (nextError) {
      setNotice({ tone: "error", text: readableError(nextError) });
    } finally {
      setFinishingGuidedBind(false);
    }
  }

  async function startUserAuthFlow(profileName: string) {
    if (!profileName) {
      setNotice({ tone: "error", text: "请先选择一个飞书机器人。" });
      return;
    }
    setStartingUserAuthProfileName(profileName);
    setNotice({ tone: "info", text: "正在生成飞书用户授权链接..." });
    try {
      const result = await startUserAuth({ profileName }) as UserAuthResult;
      setUserAuthResults((prev) => ({ ...prev, [profileName]: result }));
      setNotice({
        tone: "info",
        text: "已生成用户授权链接。只有要访问个人文档、日历、邮箱时才需要补；普通机器人收发消息不用补。",
      });
    } catch (nextError) {
      setNotice({ tone: "error", text: readableError(nextError) });
    } finally {
      setStartingUserAuthProfileName(null);
    }
  }

  async function finishUserAuthFlow(profileName: string) {
    if (!profileName) {
      setNotice({ tone: "error", text: "请先选择一个飞书机器人。" });
      return;
    }
    setFinishingUserAuthProfileName(profileName);
    setNotice({ tone: "info", text: "正在确认飞书用户授权..." });
    try {
      const result = await finishUserAuth({ profileName }) as UserAuthResult;
      setUserAuthResults((prev) => {
        const next = { ...prev };
        delete next[profileName];
        return next;
      });
      profileCatalog.refresh();
      const userName = result.profile?.user;
      setNotice({
        tone: userName ? "success" : "info",
        text: userName
          ? `已补充用户授权：${userName}。`
          : "已确认授权流程，但 lark-cli 暂时没有返回用户姓名；机器人收发消息不受影响，可刷新列表再看。",
      });
    } catch (nextError) {
      setNotice({ tone: "error", text: readableError(nextError) });
    } finally {
      setFinishingUserAuthProfileName(null);
    }
  }

  async function bindNewFeishuApp() {
    const profileName = bindForm.profileName.trim() || suggestedNewProfileName;
    const displayName = bindForm.displayName.trim() || "飞书机器人";
    const appId = bindForm.appId.trim();
    const appSecret = bindForm.appSecret.trim();
    if (!appId || !appSecret) {
      setNotice({ tone: "error", text: "请填写飞书 App ID 和 App Secret。它们在飞书开放平台的“凭证与基础信息”里。" });
      return;
    }

    setBinding(true);
    setNotice(null);
    try {
      await bindProfile({
        profileName,
        appId,
        appSecret,
        brand: "feishu",
      });

      const existingConnection = connections.find((connection) => connection.profileName === profileName);
      const nextConnection = existingConnection
        ? {
          ...existingConnection,
          appId,
          name: displayName,
          enabled: true,
        }
        : connectionFromProfile({
          index: connections.length,
          profileName,
          appId,
          displayName,
        });
      const nextConfig = normalizeUiConfig({
        ...configJson,
        connections: existingConnection
          ? connections.map((connection) => connection.profileName === profileName ? nextConnection : connection)
          : [...connections, nextConnection],
      });
      await save(nextConfig);
      setConfigJson(nextConfig);
      profileCatalog.refresh();
      setBindForm({
        displayName: "飞书机器人",
        profileName: "",
        appId: "",
        appSecret: "",
      });
      setShowBindPanel(false);
      setNotice({ tone: "success", text: "飞书应用已绑定，并已添加到“飞书机器人”。下一步配置接收规则即可测试。" });
    } catch (nextError) {
      setNotice({ tone: "error", text: readableError(nextError) });
    } finally {
      setBinding(false);
    }
  }

  async function saveCurrentConfig(options: { successText?: string; routeId?: string } = {}) {
    setNotice(null);
    try {
      await save(configJson);
      connectorStatus.refresh();
      const text = options.successText ?? "已保存。新的飞书监听配置会自动生效。";
      if (options.routeId) {
        setSavedEntry({ routeId: options.routeId, at: new Date().toLocaleTimeString() });
      }
      setToast({ tone: "success", text });
      setNotice({ tone: "success", text });
    } catch (nextError) {
      const text = readableError(nextError);
      setToast({ tone: "error", text });
      setNotice({ tone: "error", text });
    }
  }

  async function patchRuntimeAndSave(patch: Partial<ConfigRecord>, successText: string) {
    const nextConfig = normalizeUiConfig({ ...configJson, ...patch });
    setNotice(null);
    try {
      await save(nextConfig);
      setConfigJson(nextConfig);
      connectorStatus.refresh();
      setToast({ tone: "success", text: successText });
      setNotice({ tone: "success", text: successText });
    } catch (nextError) {
      const text = readableError(nextError);
      setToast({ tone: "error", text });
      setNotice({ tone: "error", text });
    }
  }

  function buildCheckReport(result: { valid: boolean; message?: string }): CheckReportItem[] {
    const activeSubscriberCount = connectorStatus.data?.subscribers
      ?.filter((subscriber) => activeConnections.some((connection) => connection.id === subscriber.connectionId))
      .length ?? 0;
    const latestRecord = connectorStatus.data?.recentRecords?.[0];
    const selectedProfileName = firstRouteConnection?.profileName ?? firstEnabledConnection?.profileName ?? "";
    const selectedProfile = firstEnabledRouteSummary ? firstRouteProfile : connectedProfile;
    const selectedConnectionLabel = appLabel(firstRouteConnection ?? firstEnabledConnection, selectedProfile);
    const routeTargetReady = Boolean(firstEnabledRouteSummary?.company && firstEnabledRouteSummary.agent && firstRouteConnectionReady);
    const items: CheckReportItem[] = [
      {
        tone: result.valid ? "success" : "error",
        title: "Paperclip 配置",
        detail: result.valid ? "基础配置格式正常，可以继续检查飞书链路。" : result.message ?? "配置格式检查未通过。",
      },
    ];

    if (!hasConnection) {
      items.push({
        tone: "error",
        title: "飞书机器人",
        detail: "还没有选择飞书机器人。先点“更换”或“绑定新的”。",
      });
    } else if (profileError) {
      items.push({
        tone: "error",
        title: "飞书机器人",
        detail: `lark-cli 读取失败：${profileError}`,
      });
    } else if (!selectedProfile) {
      items.push({
        tone: "warning",
        title: "飞书机器人",
        detail: `当前入口使用“${selectedConnectionLabel}”（${selectedProfileName || "未配置 profile"}），但当前运行环境没有读到它。请换成可运行机器人，或重新绑定这个机器人。`,
      });
    } else if (!selectedProfile.botName && selectedConnectionLabel !== "飞书应用" && selectedConnectionLabel !== selectedProfile.name) {
      items.push({
        tone: "success",
        title: "飞书机器人",
        detail: `已看到 ${selectedProfileName}，页面显示为“${selectedConnectionLabel}”。飞书未返回官方机器人名时先用页面名称展示，不影响收发消息。`,
      });
    } else if (!selectedProfile.botName) {
      items.push({
        tone: "warning",
        title: "飞书机器人",
        detail: `已看到 ${selectedProfileName}，但没有读到飞书机器人显示名。App 权限或 token 可能需要确认。`,
      });
    } else {
      items.push({
        tone: "success",
        title: "飞书机器人",
        detail: `已绑定 ${activeConnections.length} 个机器人；第一条入口使用“${selectedProfile.botName}”。App ID：${selectedProfile.appId ?? firstRouteConnection?.appId ?? "未返回"}`,
      });
    }

    if (enabledRouteCount === 0) {
      items.push({
        tone: "error",
        title: "消息入口",
        detail: "还没有启用的入口，飞书消息不会进入 Paperclip。",
      });
    } else {
      items.push({
        tone: routeTargetReady ? "success" : "warning",
        title: "消息入口",
        detail: !firstRouteConnectionReady
          ? "入口存在，但它绑定的飞书机器人当前不可运行。请先点入口的“编辑”，把机器人换成可运行的，或重新绑定缺失机器人。"
          : routeTargetReady
          ? `${routeTitle(firstEnabledRouteSummary!.route, 0)} 会交给 ${routeTargetLabel(firstEnabledRouteSummary!.company, firstEnabledRouteSummary!.agent)}。`
          : "入口存在，但公司或智能体没有完全匹配到。请点“编辑入口”确认处理人。",
      });
    }

    items.push({
      tone: routeUsesOldBotKeyword ? "warning" : "success",
      title: "触发词",
      detail: routeUsesOldBotKeyword
        ? "入口里还有旧触发词“锐思”。建议点“一键改成 paperclip”，避免误以为机器人没换成功。"
        : "触发词和当前机器人显示没有明显冲突。",
    });

    if (!isListening) {
      items.push({
        tone: "warning",
        title: "监听飞书消息",
        detail: "监听开关未开启。飞书里发消息不会自动进入 Paperclip。",
      });
    } else if (activeSubscriberCount > 0) {
      items.push({
        tone: "success",
        title: "监听飞书消息",
        detail: `监听已开启，当前看到 ${activeSubscriberCount} 个监听进程。`,
      });
    } else {
      items.push({
        tone: "warning",
        title: "监听飞书消息",
        detail: "监听开关已开启，但暂时没有看到运行中的监听进程。保存配置或重启服务后再检查。",
      });
    }

    items.push({
      tone: isSendingRealMessages ? "success" : "warning",
      title: "真实回复飞书",
      detail: isSendingRealMessages
        ? "当前会真实调用 lark-cli 回复飞书。"
        : "当前是模拟模式，只会在页面里验证，不会真的回飞书。",
    });

    items.push({
      tone: isSendingRealMessages ? "success" : "warning",
      title: "飞书附件入库",
      detail: isSendingRealMessages
        ? "飞书图片、文件、音频和视频会下载并作为 Paperclip 任务附件交给智能体。"
        : "模拟模式只会记录附件名称，不会真正下载或上传附件。",
    });

    items.push({
      tone: canTryFeishuSmokeTest ? "success" : "warning",
      title: "飞书端实测",
      detail: canTryFeishuSmokeTest
        ? `去目标飞书会话发送：${smokeText}`
        : "机器人、入口、监听、真实回复全部就绪后，再去飞书里做真实测试。",
    });

    if (connectorStatus.error) {
      items.push({
        tone: "warning",
        title: "运行日志",
        detail: `状态读取失败：${connectorStatus.error.message}`,
      });
    } else if (latestRecord) {
      items.push({
        tone: latestRecord.level === "error" ? "error" : latestRecord.level === "warning" ? "warning" : "success",
        title: "最近事件",
        detail: latestRecord.message,
      });
    } else {
      items.push({
        tone: "success",
        title: "最近事件",
        detail: "暂时没有异常记录。",
      });
    }

    return items;
  }

  function buildConnectionCheckReport(
    connection: FeishuConnectionConfig,
    result?: { valid: boolean; message?: string },
  ): CheckReportItem[] {
    const profile = profiles.find((item) => item.name === connection.profileName) ?? null;
    const routeCount = connectionUsageCounts.get(connection.id) ?? 0;
    const subscriber = connectorStatus.data?.subscribers?.find((item) => item.connectionId === connection.id);
    const appId = profile?.appId ?? connection.appId;
    const displayName = appLabel(connection, profile);
    const hasReadableDisplayName = Boolean(displayName && displayName !== "飞书应用" && displayName !== profile?.name);
    const items: CheckReportItem[] = [];

    if (result && !result.valid) {
      items.push({
        tone: "error",
        title: "Paperclip 配置",
        detail: result.message ?? "当前配置格式没有通过检查。",
      });
    }

    if (profileError) {
      items.push({
        tone: "error",
        title: "授权信息",
        detail: `读取飞书机器人失败：${profileError}`,
      });
    } else if (!profile) {
      items.push({
        tone: "warning",
        title: "授权信息",
        detail: missingProfileHelp(connection),
      });
    } else {
      items.push({
        tone: "success",
        title: "授权信息",
        detail: `已读到“${appLabel(connection, profile)}”。${appId ? `App ID：${appId}` : "飞书没有返回 App ID。"}`
      });
    }

    if (profile?.botName) {
      items.push({
        tone: "success",
        title: "机器人名称",
        detail: `飞书返回的机器人名称是“${profile.botName}”。`,
      });
    } else if (profile && hasReadableDisplayName) {
      items.push({
        tone: "success",
        title: "机器人名称",
        detail: `当前页面显示为“${displayName}”。飞书没有返回官方机器人名时，会先用这个页面名称展示；不影响收消息和回消息。`,
      });
    } else {
      items.push({
        tone: "warning",
        title: "机器人名称",
        detail: "没有从飞书读到机器人显示名，页面只能用配置备注显示。通常是机器人信息权限或 token 需要确认。",
      });
    }

    items.push({
      tone: routeCount > 0 ? "success" : "warning",
      title: "业务入口",
      detail: routeCount > 0
        ? `当前有 ${routeCount} 条入口使用这个机器人。`
        : "当前还没有入口使用这个机器人。它在池子里，但不会处理任何飞书消息。",
    });

    if (!isListening) {
      items.push({
        tone: "warning",
        title: "监听状态",
        detail: "全局监听未开启，飞书新消息不会自动进入 Paperclip。",
      });
    } else if (subscriber) {
      items.push({
        tone: "success",
        title: "监听状态",
        detail: `已看到这个机器人的监听进程${subscriber.pid ? `，PID ${subscriber.pid}` : ""}。`,
      });
    } else {
      items.push({
        tone: "warning",
        title: "监听状态",
        detail: "全局监听已开启，但暂时没看到这个机器人的监听进程。保存配置或重启服务后再检查。",
      });
    }

    items.push({
      tone: isSendingRealMessages ? "success" : "warning",
      title: "真实回复",
      detail: isSendingRealMessages
        ? "真实回复已开启，智能体完成后会回到飞书。"
        : "当前是页面模拟模式，不会真实回复飞书。",
    });

    items.push({
      tone: isSendingRealMessages ? "success" : "warning",
      title: "附件入库",
      detail: isSendingRealMessages
        ? "飞书文件和图片会作为 Paperclip 任务附件上传。"
        : "模拟模式不会真正下载飞书附件。",
    });

    return items;
  }

  async function checkConnection(connection: FeishuConnectionConfig) {
    setCheckingConnectionId(connection.id);
    setNotice({ tone: "info", text: `正在检查“${appLabel(connection, profiles.find((item) => item.name === connection.profileName))}”...` });
    try {
      const result = await test(configJson);
      profileCatalog.refresh();
      connectorStatus.refresh();
      const items = buildConnectionCheckReport(connection, result);
      setConnectionCheckResults((prev) => ({
        ...prev,
        [connection.id]: {
          checkedAt: new Date().toLocaleTimeString(),
          items,
        },
      }));
      const hasError = items.some((item) => item.tone === "error");
      const hasWarning = items.some((item) => item.tone === "warning");
      setNotice({
        tone: hasError ? "error" : hasWarning ? "info" : "success",
        text: hasError
          ? "这个机器人还有阻塞项。"
          : hasWarning
            ? "这个机器人基本可用，但还有需要确认的项目。"
            : "这个机器人检查通过，可以用于飞书入口。",
      });
    } catch (nextError) {
      setNotice({ tone: "error", text: readableError(nextError) });
    } finally {
      setCheckingConnectionId(null);
    }
  }

  async function testCurrentConfig() {
    setChecking(true);
    setLastCheckAt(null);
    setNotice({ tone: "info", text: "正在检查机器人、消息入口和运行开关..." });
    try {
      const result = await test(configJson);
      profileCatalog.refresh();
      connectorStatus.refresh();
      const nextReport = buildCheckReport(result);
      setCheckReportItems(nextReport);
      setLastCheckAt(new Date().toLocaleTimeString());
      setNotice({
        tone: nextReport.some((item) => item.tone === "error") ? "error" : nextReport.some((item) => item.tone === "warning") ? "info" : "success",
        text: nextReport.some((item) => item.tone === "error")
          ? "检查发现阻塞项，按下方体检报告处理。"
          : nextReport.some((item) => item.tone === "warning")
            ? "基础可用，但还有需要确认的风险项。"
            : "检查通过。下一步去飞书里发送测试话术确认真实效果。",
      });
    } catch (nextError) {
      setNotice({ tone: "error", text: readableError(nextError) });
    } finally {
      setChecking(false);
    }
  }

  async function testEntryRoute(route: FeishuRouteConfig) {
    setTestingRouteId(route.id);
    setNotice(null);
    setRouteTestResults((prev) => {
      const next = { ...prev };
      delete next[route.id];
      return next;
    });
    try {
      const result = await testRoute({ routeId: route.id }) as RouteTestResult;
      const text = result.message
        ? `${result.message}${result.sampleText ? ` 测试消息：${result.sampleText}` : ""}`
        : "入口测试完成。";
      setRouteTestResults((prev) => ({
        ...prev,
        [route.id]: {
          tone: result.ok ? "success" : "error",
          text,
        },
      }));
      setNotice({ tone: result.ok ? "success" : "error", text });
    } catch (nextError) {
      const text = readableError(nextError);
      setRouteTestResults((prev) => ({
        ...prev,
        [route.id]: { tone: "error", text },
      }));
      setNotice({ tone: "error", text });
    } finally {
      setTestingRouteId(null);
    }
  }

  if (loading) return <div style={helpStyle}>正在读取飞书连接器配置...</div>;

  return (
    <div style={pageStyle}>
      <nav key="local-tabs" style={tabNavStyle} aria-label="飞书连接器页面导航">
        {mainTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            style={activeMainTab === tab.key ? activeTabLinkStyle : tabLinkStyle}
            onClick={() => selectMainTab(tab.key)}
          >
            <span key="label">{tab.label}</span>
            <span key="detail" style={tabDetailStyle}>{tab.detail}</span>
          </button>
        ))}
      </nav>
      {showBindPanel ? (
        <div
          key="bind-modal"
          style={modalBackdropStyle}
          role="dialog"
          aria-modal="true"
          aria-label={bindPanelTitle}
          onClick={() => setShowBindPanel(false)}
        >
          <div key="panel" style={modalPanelStyle} onClick={(event) => event.stopPropagation()}>
            <div key="head" style={sectionHeaderStyle}>
              <div key="copy">
                <div key="title" style={{ fontWeight: 900, fontSize: "18px" }}>{bindPanelTitle}</div>
                <div key="help" style={helpStyle}>
                  支持两种方式：普通用户优先用飞书授权链接；管理员也可以直接填 App ID 和 App Secret。App Secret 只交给 lark-cli 建立 profile，不会保存到 Paperclip 配置里。
                </div>
              </div>
              <button key="close" type="button" style={buttonStyle} onClick={() => setShowBindPanel(false)}>
                关闭
              </button>
            </div>
            <div key="method" style={gridTwoStyle}>
              <button
                key="guided"
                type="button"
                style={bindMethod === "guided" ? primaryButtonStyle : buttonStyle}
                onClick={() => {
                  setBindMethod("guided");
                  setNotice(null);
                }}
              >
                用飞书授权链接绑定
              </button>
              <button
                key="secret"
                type="button"
                style={bindMethod === "secret" ? primaryButtonStyle : buttonStyle}
                onClick={() => {
                  setBindMethod("secret");
                  setGuidedBindResult(null);
                  setNotice(null);
                }}
              >
                用 App ID / App Secret 绑定
              </button>
            </div>
            <div key="fields" style={gridTwoStyle}>
              <Field key="displayName" label="给这个机器人起个名字" help="给人看的名字，例如“老板资讯机器人”。">
                <input style={inputStyle} value={bindForm.displayName} onChange={(event) => setBindForm((prev) => ({ ...prev, displayName: event.target.value }))} />
              </Field>
              <Field key="profileName" label="保存代号（自动生成）" help="工程师排障时才需要看。普通用户不用改。">
                <input style={inputStyle} value={bindForm.profileName || suggestedNewProfileName} onChange={(event) => setBindForm((prev) => ({ ...prev, profileName: event.target.value }))} />
              </Field>
            </div>
            {bindMethod === "guided" ? (
              <Fragment key="guided-bind-flow">
                <div key="steps" style={checklistGridStyle}>
                  <ChecklistItem key="one" done={Boolean(guidedBindResult?.url)} title="1 获取授权链接" detail="打开飞书官方页面完成应用授权。" />
                  <ChecklistItem key="two" done={Boolean(guidedBindResult?.url)} title="2 回到这里确认" detail="授权完成后点“我已完成授权，显示到列表”。" />
                  <ChecklistItem key="three" done={false} title="3 选择入口使用" detail="每条业务入口可以单独选择这个机器人。" />
                </div>
                <div key="guided-visual" style={heroCommandStyle}>
                  <div key="title" style={{ fontWeight: 900 }}>普通用户推荐：用飞书官方授权链接</div>
                  <div key="body" style={helpStyle}>
                    你不需要记 App ID，也不需要看到 App Secret。点击下面的“获取飞书授权链接”，在飞书页面完成授权，再回到这里确认即可。
                  </div>
                  <div key="flow" style={flowGridStyle}>
                    <FlowStep key="link" title="1. Paperclip 生成链接" value={guidedBindResult?.url ? "已生成" : "待生成"} detail="链接由当前运行环境的 lark-cli 创建。" />
                    <FlowStep key="feishu" title="2. 去飞书确认" value="扫码或打开链接" detail="如果飞书要求管理员审批，需要先完成审批。" />
                    <FlowStep key="back" title="3. 回到 Paperclip" value="显示到机器人池" detail="新机器人出现后，就可以被不同入口分别选择。" />
                  </div>
                </div>
                {guidedBindResult?.url ? (
                  <div key="url-box" style={successBoxStyle}>
                    <div key="title" style={{ fontWeight: 800 }}>授权链接已生成</div>
                    <div key="help" style={helpStyle}>如果飞书页面已经完成授权，就点下面的确认按钮。</div>
                    <a key="url" href={guidedBindResult.url} target="_blank" rel="noreferrer" style={{ ...linkButtonStyle, marginTop: "10px" }}>
                      打开飞书授权链接
                    </a>
                  </div>
                ) : null}
                <div key="bind-troubleshooting" style={subtleBoxStyle}>
                  <div key="title" style={{ fontWeight: 800 }}>如果完成授权后列表里没出现</div>
                  <div key="help" style={helpStyle}>
                    先点“刷新机器人列表”。如果还是没有，通常是飞书授权没有点完、lark-cli 没把 profile 写到当前运行环境，或本地测试和云服务器不是同一台机器。
                  </div>
                </div>
                <div key="actions" style={rowStyle}>
                  <button key="start" type="button" style={primaryButtonStyle} disabled={startingGuidedBind} onClick={() => void startOfficialBindWizard()}>
                    {startingGuidedBind ? "正在生成..." : "获取飞书授权链接"}
                  </button>
                  <button key="finish" type="button" style={buttonStyle} disabled={finishingGuidedBind} onClick={() => void finishOfficialBindWizard()}>
                    {finishingGuidedBind ? "正在确认..." : "我已完成授权，显示到列表"}
                  </button>
                  <button key="refresh" type="button" style={buttonStyle} onClick={refreshProfilesWithNotice}>
                    刷新机器人列表
                  </button>
                  <button key="cancel" type="button" style={buttonStyle} onClick={() => setShowBindPanel(false)}>
                    取消
                  </button>
                </div>
              </Fragment>
            ) : (
              <div key="secret-flow" style={{ display: "grid", gap: "12px" }}>
                <div key="secret-help" style={recommendedBoxStyle}>
                  <div key="title" style={{ fontWeight: 800 }}>管理员直接绑定</div>
                  <div key="body" style={helpStyle}>
                    App ID 和 App Secret 在飞书开放平台的“凭证与基础信息”里。这里保存完成后，Paperclip 只记录机器人显示名和 profile 代号，不保存 Secret 明文。
                  </div>
                  <a key="platform" href="https://open.feishu.cn/app" target="_blank" rel="noreferrer" style={{ ...linkButtonStyle, marginTop: "10px" }}>
                    打开飞书开放平台
                  </a>
                </div>
                <div key="secret-fields" style={gridTwoStyle}>
                  <Field key="appId" label="飞书 App ID" help="通常以 cli_ 开头。">
                    <input style={inputStyle} value={bindForm.appId} placeholder="cli_xxxxxxxxxxxxx" onChange={(event) => setBindForm((prev) => ({ ...prev, appId: event.target.value }))} />
                  </Field>
                  <Field key="appSecret" label="飞书 App Secret" help="只在本次绑定时发送给 lark-cli。不要截图外发。">
                    <input style={inputStyle} type="password" autoComplete="off" value={bindForm.appSecret} placeholder="输入 App Secret" onChange={(event) => setBindForm((prev) => ({ ...prev, appSecret: event.target.value }))} />
                  </Field>
                </div>
                <div key="actions" style={rowStyle}>
                  <button key="bind" type="button" style={primaryButtonStyle} disabled={binding} onClick={() => void bindNewFeishuApp()}>
                    {binding ? "正在绑定..." : "立即绑定并加入机器人池"}
                  </button>
                  <button key="cancel" type="button" style={buttonStyle} onClick={() => setShowBindPanel(false)}>
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {toast ? (
        <div key="toast" style={floatingToastStyle}>
          <NoticeBanner notice={toast} />
        </div>
      ) : null}
      {notice && activeMainTab !== "overview" ? (
        <NoticeBanner
          key="tab-notice"
          notice={notice}
          meta={lastCheckAt ? `最近检查时间：${lastCheckAt}` : null}
        />
      ) : null}
      {activeMainTab === "overview" ? (
      <div id="feishu-overview" key="intro" style={heroStyle}>
        <div key="top" style={actionBarStyle}>
          <div key="copy">
            <div key="intro-title" style={{ fontWeight: 800, marginBottom: "6px", fontSize: "18px" }}>
              {overviewTitle}
            </div>
            <div key="intro-body" style={helpStyle}>
              {statusTitle}。多个飞书机器人可以同时存在；每条业务入口单独选择机器人、公司和智能体。
            </div>
          </div>
          <div key="actions" style={rowStyle}>
            <button key="add-entry" type="button" style={primaryButtonStyle} onClick={() => openEntryWizard()}>
              新增入口
            </button>
            <button key="test" type="button" style={buttonStyle} disabled={saving || checking} onClick={() => void testCurrentConfig()}>
              {checking ? "正在检查..." : "检查连接"}
            </button>
            <button key="copy" type="button" style={buttonStyle} onClick={() => void copySmokeText()}>
              复制测试话术
            </button>
          </div>
        </div>
        {notice ? (
          <NoticeBanner
            key="top-notice"
            notice={notice}
            meta={lastCheckAt ? `最近检查时间：${lastCheckAt}` : null}
          />
        ) : null}
        {checkReportItems.length > 0 ? (
          <CheckReport key="check-report" items={checkReportItems} />
        ) : null}
        <div key="next-step" style={nextStepStyle}>
          <div key="copy">
            <div key="title" style={{ fontWeight: 900, fontSize: "16px" }}>{nextStepCopy.title}</div>
            <div key="detail" style={helpStyle}>{nextStepCopy.detail}</div>
          </div>
          <div key="actions" style={rowStyle}>
            {nextStepKind === "bind" ? (
              <button key="bind" type="button" style={primaryButtonStyle} onClick={() => openBindPanel()}>
                接入飞书机器人
              </button>
            ) : null}
            {nextStepKind === "rebind" ? (
              <Fragment key="next-rebind-actions">
                <button key="rebind" type="button" style={primaryButtonStyle} onClick={() => openBindPanel(connectionToFix ?? firstEnabledConnection)}>
                  重新绑定机器人
                </button>
                <button key="refresh" type="button" style={buttonStyle} onClick={refreshProfilesWithNotice}>
                  刷新机器人列表
                </button>
              </Fragment>
            ) : null}
            {nextStepKind === "entry" ? (
              <button key="entry" type="button" style={primaryButtonStyle} onClick={() => openEntryWizard()}>
                新增业务入口
              </button>
            ) : null}
            {nextStepKind === "edit-entry" ? (
              <Fragment key="next-edit-entry-actions">
                <button key="edit" type="button" style={primaryButtonStyle} onClick={() => openEntryEditor(firstMissingRouteSummary?.route.id)}>
                  编辑这条入口
                </button>
                <button key="rebind" type="button" style={buttonStyle} onClick={() => openBindPanel(connectionToFix ?? undefined)}>
                  重新绑定机器人
                </button>
              </Fragment>
            ) : null}
            {nextStepKind === "enable-listen" ? (
              <button key="listen" type="button" style={primaryButtonStyle} disabled={saving} onClick={() => void patchRuntimeAndSave({ enableEventSubscriber: true }, "已开启飞书消息监听并保存。现在可以去飞书里发测试话术。")}>
                开启监听并保存
              </button>
            ) : null}
            {nextStepKind === "enable-real" ? (
              <button key="real" type="button" style={primaryButtonStyle} disabled={saving} onClick={() => void patchRuntimeAndSave({ dryRunCli: false }, "已开启真实飞书回复并保存。下一步去飞书实测。")}>
                开启真实回复并保存
              </button>
            ) : null}
            {nextStepKind === "test" ? (
              <Fragment key="next-test-actions">
                <button key="copy" type="button" style={primaryButtonStyle} onClick={() => void copySmokeText()}>
                  复制飞书测试话术
                </button>
                <button key="check" type="button" style={buttonStyle} disabled={checking} onClick={() => void testCurrentConfig()}>
                  {checking ? "检查中..." : "检查连接"}
                </button>
              </Fragment>
            ) : null}
          </div>
        </div>
        <div key="metric-grid" style={metricGridStyle}>
          <div key="metric-bots" style={metricCardStyle}>
            <div key="label" style={metricHeaderStyle}>
              <span key="icon" style={{ ...metricIconStyle, background: "color-mix(in oklab, #2563eb 14%, var(--background))", color: "#2563eb" }}>机</span>
              <span key="text">机器人池</span>
            </div>
            <div key="value" style={{ fontWeight: 900, fontSize: "22px" }}>
              {missingProfileConnections.length > 0
                ? `${usableConnections.length} 个可运行 / ${activeConnections.length} 个已配置`
                : `${activeConnections.length} 个可用`}
            </div>
            <div key="detail" style={helpStyle}>{activeConnectionLabels.join("、") || "尚未绑定机器人"}</div>
          </div>
          <div key="metric-routes" style={metricCardStyle}>
            <div key="label" style={metricHeaderStyle}>
              <span key="icon" style={{ ...metricIconStyle, background: "color-mix(in oklab, #16a34a 14%, var(--background))", color: "#16a34a" }}>入</span>
              <span key="text">业务入口</span>
            </div>
            <div key="value" style={{ fontWeight: 900, fontSize: "22px" }}>{routes.length} 条入口</div>
            <div key="detail" style={helpStyle}>
              {routeSummaries.slice(0, 3).map(({ route }, index) => routeTitle(route, index)).join(" / ") || "还没有业务入口"}
            </div>
          </div>
          <div key="metric-runtime" style={metricCardStyle}>
            <div key="label" style={metricHeaderStyle}>
              <span key="icon" style={{ ...metricIconStyle, background: "color-mix(in oklab, #22c55e 14%, var(--background))", color: "#16a34a" }}>听</span>
              <span key="text">运行状态</span>
            </div>
            <div key="value" style={{ fontWeight: 900, fontSize: "22px" }}>{runtimeStatusLabel}</div>
            <div key="detail" style={helpStyle}>{runtimeStatusDetail}</div>
          </div>
        </div>
        <div key="event-diagnostics" style={subtleBoxStyle}>
          <div key="header" style={sectionHeaderStyle}>
            <div key="copy">
              <div key="title" style={{ fontWeight: 900, fontSize: "16px" }}>最近飞书事件诊断</div>
              <div key="body" style={helpStyle}>
                {latestFeishuEvent
                  ? "这里显示最近收到的飞书消息、命中的入口和未命中原因。"
                  : "如果你刚在飞书里发了测试消息，但这里没有新记录，说明消息没有进入当前插件监听的飞书机器人。"}
              </div>
            </div>
            <button key="refresh" type="button" style={buttonStyle} onClick={() => connectorStatus.refresh()}>
              刷新
            </button>
          </div>
          <RecentEventList
            key="events"
            records={feishuEventRecords.slice(0, 3)}
            emptyText="还没有收到飞书消息事件。请确认你 @ 的机器人就是下方入口选择的机器人。"
          />
        </div>
        <div key="setup-progress" style={heroCommandStyle}>
          <div key="header" style={sectionHeaderStyle}>
            <div key="copy">
              <div key="title" style={{ fontWeight: 900, fontSize: "16px" }}>接入进度</div>
              <div key="body" style={helpStyle}>
                新用户只看这里就够了：先选机器人，再建业务入口，最后到飞书里真实测试。更多工程配置放在“高级”页。
              </div>
            </div>
            <div key="actions" style={rowStyle}>
              <button key="guided" type="button" style={buttonStyle} onClick={() => openBindPanel(undefined, "guided")}>
                绑定机器人
              </button>
              <button key="secret" type="button" style={buttonStyle} onClick={() => openBindPanel(undefined, "secret")}>
                管理员绑定
              </button>
            </div>
          </div>
          <div key="steps" style={stepGridStyle}>
            {setupProgressSteps.map((step, index) => (
              <SetupStep
                key={step.title}
                index={index + 1}
                done={step.done}
                title={step.title}
                detail={step.detail}
                action={step.action}
              />
            ))}
          </div>
        </div>
      </div>
      ) : null}

      {activeMainTab === "entries" ? (
      <Fragment key="entries-list-tab">
      <section id="feishu-entries" key="product-entries" style={productSectionStyle}>
        <div key="header" style={sectionHeaderStyle}>
          <h3 key="title" style={{ margin: 0, fontSize: "18px" }}>1. 业务入口</h3>
          <button key="add" type="button" style={buttonStyle} onClick={() => openEntryWizard()}>
            新增业务入口
          </button>
        </div>
        <div key="list" style={{ display: "grid", gap: "12px" }}>
          {routeSummaries.length === 0 ? (
            <div key="empty" style={productEntryStyle}>
              <div key="title" style={{ fontWeight: 800 }}>还没有业务入口</div>
              <div key="body" style={helpStyle}>先建一条“包含 paperclip 的飞书消息 → 指定智能体”的测试入口。</div>
            </div>
          ) : null}
          {routeSummaries.map(({ route, company, agent }, index) => {
            const routeIndex = routes.findIndex((item) => item.id === route.id);
            const connection = connections.find((item) => item.id === route.connectionId) ?? preferredConnection;
            const profile = profiles.find((item) => item.name === connection?.profileName) ?? null;
            const testResult = routeTestResults[route.id];
            const agents = company?.agents ?? [];
            const matchType = route.matchType ?? "keyword";
            return (
              <div id={`product-entry-${route.id}`} key={`product-entry-${route.id}`} style={productEntryStyle}>
                <div key="top" style={sectionHeaderStyle}>
                  <div key="copy" style={{ minWidth: 0 }}>
                    <div key="title-row" style={rowStyle}>
                      <strong key="title" style={{ fontSize: "16px" }}>{routeTitle(route, index)}</strong>
                      <StatusBadge key="status" tone={route.enabled === false ? "neutral" : "success"}>
                        {route.enabled === false ? "已暂停" : "启用中"}
                      </StatusBadge>
                    </div>
                    <div key="meta" style={{ ...helpStyle, marginTop: "6px" }}>
                      飞书群：{route.chatName || "任意消息"} → 机器人：{appLabel(connection, profile)} → 公司：{company ? companyLabel(company) : "未选择"} → 智能体：{agent ? agentLabel(agent) : "未选择"}
                    </div>
                  </div>
                  <div key="actions" style={rowStyle}>
                    <button key="test" type="button" style={buttonStyle} disabled={testingRouteId === route.id} onClick={() => void testEntryRoute(route)}>
                      {testingRouteId === route.id ? "测试中..." : "测试"}
                    </button>
                    <button key="edit" type="button" style={buttonStyle} onClick={() => openEntryEditor(route.id)}>
                      编辑
                    </button>
                    <button key="pause" type="button" style={buttonStyle} onClick={() => routeIndex >= 0 && patchRoute(routeIndex, { enabled: route.enabled === false })}>
                      {route.enabled === false ? "启用" : "暂停"}
                    </button>
                  </div>
                </div>
                <div key="chips" style={rowStyle}>
                  <span key="source" style={compactPillStyle}>触发条件　{routeSourceLabel(route)}</span>
                  <span key="reply" style={compactPillStyle}>回复方式　{replyModeLabels[route.replyMode ?? "thread"]}</span>
                  {route.baseSinkId ? <span key="base" style={compactPillStyle}>写入多维表格</span> : null}
                </div>
                {testResult ? (
                  <div key="result" style={{ ...helpStyle, color: testResult.tone === "success" ? "var(--foreground)" : "var(--destructive)" }}>
                    {testResult.text}
                  </div>
                ) : null}
                {expandedEntryRouteId === route.id && routeIndex >= 0 ? (
                  <div key="editor" style={productEntryEditorStyle}>
                    <div key="editor-head" style={sectionHeaderStyle}>
                      <div key="copy">
                        <div key="title" style={{ fontWeight: 800 }}>编辑这个入口</div>
                        <div key="help" style={helpStyle}>只改这条业务入口，不影响其他飞书机器人和其他公司。</div>
                      </div>
                      <button key="close" type="button" style={buttonStyle} onClick={() => setExpandedEntryRouteId(null)}>
                        收起
                      </button>
                    </div>
                    <div key="editor-fields" style={gridTwoStyle}>
                      <Field key="connectionId" label="使用哪个飞书机器人">
                        <select
                          style={selectStyle}
                          value={route.connectionId ?? preferredConnection?.id ?? ""}
                          onChange={(event) => patchRoute(routeIndex, { connectionId: event.target.value })}
                        >
                          {connectionOptionNodes(connections, `product-route-${routeIndex}`, undefined, profiles)}
                        </select>
                      </Field>
                      <Field key="matchType" label="哪些消息进入 Paperclip">
                        <select
                          style={selectStyle}
                          value={matchType}
                          onChange={(event) => patchRoute(routeIndex, { matchType: event.target.value as FeishuRouteConfig["matchType"] })}
                        >
                          {Object.entries(matchTypeLabels).map(([value, label], optionIndex) => (
                            <option key={`product-match-${routeIndex}-${optionIndex}-${value}`} value={value}>{label}</option>
                          ))}
                        </select>
                      </Field>
                      {matchType === "keyword" ? (
                        <Field key="keyword" label="关键词">
                          <input style={inputStyle} value={route.keyword ?? ""} onChange={(event) => patchRoute(routeIndex, { keyword: event.target.value })} />
                        </Field>
                      ) : null}
                      {matchType === "regex" ? (
                        <Field key="regex" label="高级规则">
                          <input style={inputStyle} value={route.regex ?? ""} onChange={(event) => patchRoute(routeIndex, { regex: event.target.value })} />
                        </Field>
                      ) : null}
                      <Field key="company" label="Paperclip 公司">
                        <select
                          style={selectStyle}
                          value={company?.id ?? ""}
                          onChange={(event) => {
                            const nextCompany = companies.find((item) => item.id === event.target.value);
                            const nextAgent = nextCompany?.agents[0];
                            patchRoute(routeIndex, {
                              companyId: nextCompany?.id,
                              companyRef: nextCompany?.issuePrefix ?? nextCompany?.name,
                              targetAgentId: nextAgent?.id,
                              targetAgentName: nextAgent?.name,
                            });
                          }}
                        >
                          {companyOptionNodes(companies, `product-route-${routeIndex}`)}
                        </select>
                      </Field>
                      <Field key="agent" label="交给哪个智能体">
                        <select
                          style={selectStyle}
                          value={agent?.id ?? ""}
                          disabled={!company}
                          onChange={(event) => {
                            const nextAgent = agents.find((item) => item.id === event.target.value);
                            patchRoute(routeIndex, {
                              targetAgentId: nextAgent?.id,
                              targetAgentName: nextAgent?.name,
                            });
                          }}
                        >
                          {agentOptionNodes(agents, `product-route-${routeIndex}`)}
                        </select>
                      </Field>
                      <Field key="replyMode" label="回复方式">
                        <select
                          style={selectStyle}
                          value={route.replyMode ?? "thread"}
                          onChange={(event) => patchRoute(routeIndex, { replyMode: event.target.value as FeishuRouteConfig["replyMode"] })}
                        >
                          {Object.entries(replyModeLabels).map(([value, label], optionIndex) => (
                            <option key={`product-reply-${routeIndex}-${optionIndex}-${value}`} value={value}>{label}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div key="editor-actions" style={rowStyle}>
                      <button
                        key="save"
                        type="button"
                        style={primaryButtonStyle}
                        disabled={saving}
                        onClick={() => void saveCurrentConfig({
                          routeId: route.id,
                          successText: `已保存入口“${routeTitle(route, routeIndex)}”。新的飞书消息会按这个入口处理。`,
                        })}
                      >
                        {saving ? "正在保存..." : "保存这个入口"}
                      </button>
                      <button key="test" type="button" style={buttonStyle} disabled={testingRouteId === route.id} onClick={() => void testEntryRoute(route)}>
                        {testingRouteId === route.id ? "测试中..." : "测试这个入口"}
                      </button>
                    </div>
                    {savedEntry?.routeId === route.id ? (
                      <div key="entry-save-ok" style={{ ...successBoxStyle, marginTop: "2px" }}>
                        <div key="title" style={{ fontWeight: 800 }}>这个入口已保存</div>
                        <div key="detail" style={helpStyle}>
                          保存时间：{savedEntry.at}。现在飞书消息会交给 {routeTargetLabel(company, agent)} 处理。
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      </Fragment>
      ) : null}

      {activeMainTab === "robots" ? (
      <section id="feishu-robots" key="product-robots" style={productSectionStyle}>
        <div key="header" style={sectionHeaderStyle}>
          <h3 key="title" style={{ margin: 0, fontSize: "18px" }}>2. 飞书机器人池</h3>
          <button key="bind" type="button" style={buttonStyle} onClick={() => openBindPanel()}>
            绑定新机器人
          </button>
        </div>
        <div key="cards" style={gridTwoStyle}>
          {activeConnections.length === 0 ? (
            <div key="empty" style={productEntryStyle}>
              <div key="title" style={{ fontWeight: 800 }}>还没有可用机器人</div>
              <div key="body" style={helpStyle}>绑定公司通用机器人后，再为业务入口选择它。</div>
            </div>
          ) : null}
          {activeConnections.map((connection, index) => {
            const profile = profiles.find((item) => item.name === connection.profileName) ?? null;
            const routeCount = connectionUsageCounts.get(connection.id) ?? 0;
            const connectionCheck = connectionCheckResults[connection.id];
            const authResult = userAuthResults[connection.profileName];
            const isStartingUserAuth = startingUserAuthProfileName === connection.profileName;
            const isFinishingUserAuth = finishingUserAuthProfileName === connection.profileName;
            return (
              <div key={`product-bot-${connection.id}-${index}`} style={productEntryStyle}>
                <div key="top" style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                  <div key="icon" style={{ ...botIconStyle, background: index % 2 === 0 ? "#2563eb" : "#5b21b6", color: "#fff" }}>
                    飞
                  </div>
                  <div key="copy" style={{ minWidth: 0 }}>
                    <div key="name" style={{ ...rowStyle, marginBottom: "4px" }}>
                      <strong key="label" style={{ fontSize: "16px" }}>{appLabel(connection, profile)}</strong>
                      <StatusBadge key="status" tone={profile ? "success" : "warning"}>{profile ? "已启用" : "需重新绑定"}</StatusBadge>
                      <span key="count" style={compactPillStyle}>{routeCount} 条入口使用</span>
                    </div>
                    <div key="appid" style={helpStyle}>App ID：{connection.appId ?? profile?.appId ?? "未返回"}</div>
                    <div key="user" style={helpStyle}>
                      {profile ? profileAuthLabel(profile) : "当前运行环境未读到这个机器人 profile"}
                    </div>
                    <div key="auth-detail" style={helpStyle}>
                      {profile
                        ? profileAuthDetail(profile)
                        : missingProfileHelp(connection)}
                    </div>
                    <div key="state" style={helpStyle}>状态：{profile ? "可发送 / 可监听" : "当前不可运行，先重新绑定或换用其他机器人"}</div>
                  </div>
                </div>
                <div key="actions" style={rowStyle}>
                  <button key="entries" type="button" style={buttonStyle} onClick={() => selectMainTab("entries")}>
                    查看入口
                  </button>
                  <button key="check" type="button" style={buttonStyle} disabled={checkingConnectionId === connection.id} onClick={() => void checkConnection(connection)}>
                    {checkingConnectionId === connection.id ? "检查中..." : "检查这个机器人"}
                  </button>
                  {profile && !profile.user ? (
                    <button key="user-auth" type="button" style={buttonStyle} disabled={isStartingUserAuth} onClick={() => void startUserAuthFlow(connection.profileName)}>
                      {isStartingUserAuth ? "生成中..." : "访问个人资源时授权"}
                    </button>
                  ) : null}
                  {!profile ? (
                    <button key="refresh" type="button" style={buttonStyle} onClick={refreshProfilesWithNotice}>
                      刷新机器人列表
                    </button>
                  ) : null}
                  {!profile ? (
                    <button key="rebind" type="button" style={buttonStyle} onClick={() => openBindPanel(connection)}>
                      重新绑定
                    </button>
                  ) : null}
                </div>
                {authResult?.url ? (
                  <div key="user-auth-result" style={successBoxStyle}>
                    <div key="title" style={{ fontWeight: 800 }}>需要访问个人资源时，打开这个链接授权</div>
                    <div key="help" style={helpStyle}>
                      收发飞书消息不需要这一步。只有让机器人访问你的个人云文档、日历、邮箱等资源时才需要个人授权。
                    </div>
                    <div key="actions" style={{ ...rowStyle, marginTop: "10px" }}>
                      <a key="open" href={authResult.url} target="_blank" rel="noreferrer" style={linkButtonStyle}>
                        打开授权链接
                      </a>
                      <button key="finish" type="button" style={buttonStyle} disabled={isFinishingUserAuth} onClick={() => void finishUserAuthFlow(connection.profileName)}>
                        {isFinishingUserAuth ? "确认中..." : "我已完成授权，刷新状态"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {connectionCheck ? (
                  <InlineCheckReport key="check-result" items={connectionCheck.items} checkedAt={connectionCheck.checkedAt} />
                ) : null}
              </div>
            );
          })}
        </div>
        <div key="hint" style={helpStyle}>机器人只是账号池；真正用哪个机器人，在每条入口里选择。</div>
      </section>
      ) : null}

      {activeMainTab === "entries" ? (
      <Fragment key="entries-wizard-tab">
      <section id="feishu-entry-wizard" key="product-wizard" style={productSectionStyle}>
        <div key="header" style={sectionHeaderStyle}>
          <h3 key="title" style={{ margin: 0, fontSize: "18px" }}>3. 新增入口向导</h3>
          <button key="toggle" type="button" style={buttonStyle} onClick={() => showEntryWizard ? setShowEntryWizard(false) : openEntryWizard()}>
            {showEntryWizard ? "收起向导" : "展开向导"}
          </button>
        </div>
        <div key="steps" style={wizardStepperStyle}>
          <FlowStep key="source" title="1  选择消息来源" value={matchTypeLabels[wizardDraft.matchType]} detail="群/单聊/发消息人/关键词" />
          <FlowStep key="bot" title="2  选择机器人" value={appLabel(connections.find((connection) => connection.id === wizardDraft.connectionId) ?? preferredConnection, profiles.find((profile) => profile.name === (connections.find((connection) => connection.id === wizardDraft.connectionId) ?? preferredConnection)?.profileName))} detail="从机器人池里挑选" />
          <FlowStep key="agent" title="3  选择 Paperclip 公司和智能体" value={(() => {
            const company = companies.find((item) => item.id === wizardDraft.companyId)
              ?? firstEnabledRouteSummary?.company
              ?? companies[0]
              ?? null;
            const agent = company?.agents.find((item) => item.id === wizardDraft.targetAgentId)
              ?? (company?.id === firstEnabledRouteSummary?.company?.id ? firstEnabledRouteSummary.agent : null)
              ?? company?.agents[0]
              ?? null;
            return routeTargetLabel(company, agent);
          })()} detail="指定公司与智能体处理" />
          <FlowStep key="reply" title="4  回复与沉淀" value={replyModeLabels[wizardDraft.replyMode]} detail="回复方式与写入规则" />
        </div>
        <div key="compact-fields" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
          <Field key="matchType" label="消息来源">
            <select style={selectStyle} value={wizardDraft.matchType} onChange={(event) => patchWizardDraft({ matchType: event.target.value as FeishuRouteConfig["matchType"] })}>
              {Object.entries(matchTypeLabels).map(([value, label], optionIndex) => (
                <option key={`product-wizard-match-${optionIndex}-${value}`} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field key="connection" label="飞书机器人">
            <select style={selectStyle} value={wizardDraft.connectionId ?? preferredConnection?.id ?? ""} onChange={(event) => patchWizardDraft({ connectionId: event.target.value })}>
              {connectionOptionNodes(activeConnections.length > 0 ? activeConnections : connections, "product-wizard-connection", undefined, profiles)}
            </select>
          </Field>
          <Field key="company" label="Paperclip 公司">
            <select
              style={selectStyle}
              value={(companies.find((item) => item.id === wizardDraft.companyId) ?? firstEnabledRouteSummary?.company ?? companies[0])?.id ?? ""}
              onChange={(event) => {
                const nextCompany = companies.find((item) => item.id === event.target.value);
                const nextAgent = nextCompany?.agents[0];
                patchWizardDraft({ companyId: nextCompany?.id, targetAgentId: nextAgent?.id });
              }}
            >
              {companyOptionNodes(companies, "product-wizard-company")}
            </select>
          </Field>
          <Field key="agent" label="智能体">
            {(() => {
              const company = companies.find((item) => item.id === wizardDraft.companyId)
                ?? firstEnabledRouteSummary?.company
                ?? companies[0]
                ?? null;
              const agents = company?.agents ?? [];
              const agent = agents.find((item) => item.id === wizardDraft.targetAgentId)
                ?? (company?.id === firstEnabledRouteSummary?.company?.id ? firstEnabledRouteSummary.agent : null)
                ?? agents[0]
                ?? null;
              return (
                <select style={selectStyle} value={agent?.id ?? ""} disabled={!company} onChange={(event) => patchWizardDraft({ targetAgentId: event.target.value })}>
                  {agentOptionNodes(agents, "product-wizard-agent")}
                </select>
              );
            })()}
          </Field>
          <Field key="reply" label="回复方式">
            <select style={selectStyle} value={wizardDraft.replyMode} onChange={(event) => patchWizardDraft({ replyMode: event.target.value as NonNullable<FeishuRouteConfig["replyMode"]> })}>
              {Object.entries(replyModeLabels).map(([value, label], optionIndex) => (
                <option key={`product-wizard-reply-${optionIndex}-${value}`} value={value}>{label}</option>
              ))}
            </select>
          </Field>
        </div>
        {showEntryWizard ? (
          <div key="detail-fields" style={gridTwoStyle}>
            {wizardDraft.matchType === "keyword" ? (
              <Field key="keyword" label="关键词" help="消息里包含这个词才进入 Paperclip。">
                <input style={inputStyle} value={wizardDraft.keyword ?? ""} onChange={(event) => patchWizardDraft({ keyword: event.target.value })} />
              </Field>
            ) : null}
            {wizardDraft.matchType === "regex" ? (
              <Field key="regex" label="高级规则" help="工程师用。普通场景建议优先选择关键词或指定群。">
                <input style={inputStyle} value={wizardDraft.regex ?? ""} onChange={(event) => patchWizardDraft({ regex: event.target.value })} />
              </Field>
            ) : null}
            {showEntryWizard && wizardDraft.matchType === "chat" ? (
              <Field key="chat" label="选择飞书群或单聊">
                <ChatSearchControl
                  query={chatSearchQuery}
                  onQueryChange={setChatSearchQuery}
                  chats={directoryCatalog.data?.chats ?? []}
                  loading={directoryCatalog.loading}
                  error={directoryCatalog.data?.chatError ?? directoryCatalog.error?.message}
                  currentChatId={wizardDraft.chatId}
                  currentChatName={wizardDraft.chatName}
                  profileName={directoryCatalog.data?.profileName ?? directoryProfileName}
                  onSelect={selectChatForWizard}
                />
              </Field>
            ) : null}
            {showEntryWizard && wizardDraft.matchType === "user" ? (
              <Field key="user" label="选择发消息人">
                <UserSearchControl
                  query={userSearchQuery}
                  onQueryChange={setUserSearchQuery}
                  users={directoryCatalog.data?.users ?? []}
                  loading={directoryCatalog.loading}
                  error={directoryCatalog.data?.userError ?? directoryCatalog.error?.message}
                  currentUserOpenId={wizardDraft.userOpenId}
                  currentUserName={wizardDraft.userName}
                  profileName={directoryCatalog.data?.profileName ?? directoryProfileName}
                  onSelect={selectUserForWizard}
                />
              </Field>
            ) : null}
          </div>
        ) : null}
        {showEntryWizard ? (
          <div key="actions" style={rowStyle}>
            <button key="create" type="button" style={primaryButtonStyle} onClick={createEntryFromWizard}>
              创建入口
            </button>
            <span key="hint" style={helpStyle}>创建后保存配置，再去飞书里发送测试话术。</span>
          </div>
        ) : null}
      </section>
      </Fragment>
      ) : null}

      {activeMainTab === "test" ? (
      <section id="feishu-test" key="product-test" style={productSectionStyle}>
        <h3 key="title" style={{ margin: 0, fontSize: "18px" }}>4. 真实测试</h3>
        <Field key="smoke" label="测试话术（复制到群里发送）">
          <div key="copy-row" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "10px" }}>
            <code key="text" style={{ ...codeStyle, fontSize: "14px", padding: "11px 12px" }}>{smokeText}</code>
            <button key="copy" type="button" style={buttonStyle} onClick={() => void copySmokeText()}>
              复制
            </button>
          </div>
          <div key="quick-hint" style={helpStyle}>
            “运行页面模拟测试”只验证入口规则，会使用连通性口令：{quickSmokeText}。要确认真实任务和附件，请把上面这句话发到飞书。
          </div>
        </Field>
        <div key="real-test-pipeline" style={heroCommandStyle}>
          <div key="header" style={sectionHeaderStyle}>
            <div key="copy">
              <div key="title" style={{ fontWeight: 900, fontSize: "16px" }}>真实测试链路</div>
              <div key="help" style={helpStyle}>
                这些都变成“完成”后，再去飞书发测试消息。页面模拟只证明规则能匹配，最终以飞书会话里的真实回复为准。
              </div>
            </div>
            <button key="check" type="button" style={buttonStyle} disabled={checking} onClick={() => void testCurrentConfig()}>
              {checking ? "检查中..." : "检查连接"}
            </button>
          </div>
          <div key="pipeline" style={pipelineStyle}>
            {realTestPipeline.map((step) => (
              <PipelineStep key={step.label} done={step.done} label={step.label} detail={step.detail} />
            ))}
          </div>
        </div>
        <div key="checks" style={checklistGridStyle}>
          <ChecklistItem
            key="bot"
            done={firstRouteConnectionReady}
            title="当前入口机器人可运行"
            detail={firstRouteConnectionReady
              ? "测试入口绑定的机器人在当前运行环境可用。"
              : hasUsableConnection
                ? "有其他机器人可用，但当前入口绑定的机器人不可运行。请先编辑入口换机器人。"
              : hasConnection
                ? "配置里有机器人，但当前 lark-cli 没有读到对应 profile。"
                : "先绑定机器人。"}
          />
          <ChecklistItem key="event" done={isListening} title="监听开关已开启" detail={isListening ? "监听已开启。" : "打开监听后再实测。"} />
          <ChecklistItem key="listen" done={isListening} title="监听进程运行中" detail={runtimeStatusLabel} />
          <ChecklistItem key="send" done={isSendingRealMessages} title="真实回复开启" detail={isSendingRealMessages ? "会回到飞书。" : "当前是测试模式。"} />
          <ChecklistItem key="attachments" done={isSendingRealMessages} title="附件进入任务" detail={isSendingRealMessages ? "飞书图片/文件会作为任务附件。" : "测试模式只记录附件名。"} />
        </div>
        <CheckReport key="capability-checks" title="能力体检" items={capabilityChecks} />
        {productionMonitor ? (
          <CheckReport
            key="production-monitor"
            title={`生产监控：${productionMonitor.message}`}
            items={productionMonitorChecks}
          />
        ) : null}
        <div key="actions" style={rowStyle}>
          <button
            key="test"
            type="button"
            style={primaryButtonStyle}
            disabled={!firstEnabledRouteSummary || testingRouteId === firstEnabledRouteSummary.route.id}
            onClick={() => firstEnabledRouteSummary && void testEntryRoute(firstEnabledRouteSummary.route)}
          >
            {firstEnabledRouteSummary && testingRouteId === firstEnabledRouteSummary.route.id ? "测试中..." : "运行页面模拟测试"}
          </button>
          <button key="doc" type="button" style={buttonStyle} onClick={openFeishuTestGuide}>
            {showFeishuTestGuide ? "收起测试说明" : "查看飞书测试说明"}
          </button>
        </div>
        {showFeishuTestGuide ? (
          <div id="feishu-test-guide" key="guide" style={successBoxStyle}>
            <div key="title" style={{ fontWeight: 800, marginBottom: "8px" }}>飞书里怎么确认真的生效</div>
            <div key="steps" style={flowGridStyle}>
              <FlowStep key="step-1" title="1. 先看机器人" value="机器人在目标群里" detail="如果群里没有这个机器人，飞书不会把消息交给它。" />
              <FlowStep key="step-2" title="2. 复制话术" value={smokeText} detail="粘贴到目标飞书群或单聊里发送。" />
              <FlowStep key="step-3" title="3. 可带一个附件" value="图片或文件会进任务附件" detail="真实发送时，附件会下载到 Paperclip 任务里，智能体能看到附件名称和上传结果。" />
              <FlowStep key="step-4" title="4. 回来看 Paperclip" value="会生成任务或显示测试结果" detail="页面模拟通过只证明规则能匹配，真实效果以飞书消息为准。" />
              <FlowStep key="step-5" title="5. 没回复时" value="先检查机器人卡片" detail="看授权、入口、监听、真实回复四项是否都通过。" />
            </div>
            <div key="actions" style={{ ...rowStyle, marginTop: "12px" }}>
              <button key="copy" type="button" style={primaryButtonStyle} onClick={() => void copySmokeText()}>
                复制测试话术
              </button>
              <button key="check" type="button" style={buttonStyle} disabled={checking} onClick={() => void testCurrentConfig()}>
                {checking ? "检查中..." : "检查整体连接"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {activeMainTab === "advanced" ? (
      <section id="feishu-advanced" key="product-advanced-links" style={productSectionStyle}>
        <div key="header" style={sectionHeaderStyle}>
          <div key="copy">
            <h3 key="title" style={{ margin: 0, fontSize: "18px" }}>5. 高级设置（工程师）</h3>
            <div key="help" style={helpStyle}>
              日常不用打开。这里按主题拆开，点哪一项只看哪一项，不再出现整页原始配置。
            </div>
          </div>
          <div key="actions" style={rowStyle}>
            <button key="save" type="button" style={primaryButtonStyle} disabled={saving} onClick={() => void saveCurrentConfig()}>
              {saving ? "正在保存..." : "保存配置"}
            </button>
            <button key="check" type="button" style={buttonStyle} disabled={saving || checking} onClick={() => void testCurrentConfig()}>
              {checking ? "正在检查..." : "检查连接"}
            </button>
          </div>
        </div>

        <div key="advanced-links" style={settingsShellStyle}>
          {[
            { key: "auth" as const, label: "飞书应用授权与 App Secret", detail: `${profiles.length} 个 lark-cli profile，${activeConnections.length} 个已加入机器人池` },
            { key: "deploy" as const, label: "本地测试 / 云服务器部署", detail: `${runningOnLocalhost ? "当前在本地测试" : "当前在服务器运行"} · profile ${serverProfileName(serverDeployConnection)}` },
            { key: "runtime" as const, label: "lark-cli 运行环境", detail: `${isSendingRealMessages ? "真实发送" : "模拟发送"} · ${isListening ? "监听已开启" : "监听未开启"}` },
            { key: "events" as const, label: "事件订阅与日志", detail: `${connectorStatus.data?.subscribers?.length ?? 0} 个监听进程 · 最近事件 ${connectorStatus.data?.recentRecords?.length ?? 0} 条` },
            { key: "base" as const, label: "多维表格同步", detail: baseSinks.length > 0 ? `${baseSinks.length} 条写入规则` : "未配置，可留空" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              style={{
                ...buttonStyle,
                height: "auto",
                minHeight: "52px",
                justifyContent: "space-between",
                textAlign: "left",
                width: "100%",
                display: "flex",
                padding: "10px 12px",
                border: showAdvancedSettings && activeAdvancedPanel === item.key ? "1px solid var(--foreground)" : buttonStyle.border,
                background: showAdvancedSettings && activeAdvancedPanel === item.key ? "var(--muted)" : buttonStyle.background,
              }}
              onClick={() => {
                setShowAdvancedSettings(true);
                setActiveAdvancedPanel(item.key);
              }}
            >
              <span key="label" style={{ display: "grid", gap: "2px" }}>
                <strong key="title">{item.label}</strong>
                <span key="detail" style={helpStyle}>{item.detail}</span>
              </span>
              <span key="chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </div>

        {showAdvancedSettings ? (
          <div key="advanced-panel" style={productEntryEditorStyle}>
            <div key="advanced-panel-head" style={sectionHeaderStyle}>
              <div key="copy">
                <div key="title" style={{ fontWeight: 800 }}>
                  {activeAdvancedPanel === "auth" ? "飞书应用授权与 App Secret" : null}
                  {activeAdvancedPanel === "deploy" ? "本地测试 / 云服务器部署" : null}
                  {activeAdvancedPanel === "runtime" ? "lark-cli 运行环境" : null}
                  {activeAdvancedPanel === "events" ? "事件订阅与日志" : null}
                  {activeAdvancedPanel === "base" ? "多维表格同步" : null}
                </div>
                <div key="help" style={helpStyle}>
                  {activeAdvancedPanel === "auth" ? "普通用户只需要确认机器人可用；App Secret 不在页面展示，避免误截图泄露。" : null}
                  {activeAdvancedPanel === "deploy" ? "本地能跑通不等于云端已经可用；云服务器也要绑定同一个飞书应用，并且只保留一个正式监听实例。" : null}
                  {activeAdvancedPanel === "runtime" ? "控制是否监听飞书消息、是否真实回复，以及本机 lark-cli 路径。" : null}
                  {activeAdvancedPanel === "events" ? "看监听是否在跑，以及最近有没有错误。这里不要求普通用户填写任何内部 ID。" : null}
                  {activeAdvancedPanel === "base" ? "需要把需求沉淀到飞书多维表格时再配置；不需要就保持为空。" : null}
                </div>
              </div>
              <button key="close" type="button" style={buttonStyle} onClick={() => setShowAdvancedSettings(false)}>
                回到高级列表
              </button>
            </div>

            {activeAdvancedPanel === "auth" ? (
              <div key="auth-panel" style={{ display: "grid", gap: "12px" }}>
                <div key="auth-actions" style={rowStyle}>
                  <button key="refresh" type="button" style={buttonStyle} onClick={refreshProfilesWithNotice}>
                    刷新机器人列表
                  </button>
                  <button key="bind" type="button" style={primaryButtonStyle} onClick={() => openBindPanel()}>
                    绑定新的飞书机器人
                  </button>
                  <a key="platform" href="https://open.feishu.cn/app" target="_blank" rel="noreferrer" style={linkButtonStyle}>
                    打开飞书开放平台
                  </a>
                </div>
                <div key="profiles" style={gridTwoStyle}>
                  {profiles.length === 0 ? (
                    <div key="empty" style={subtleBoxStyle}>
                      <div key="title" style={{ fontWeight: 700 }}>还没有发现飞书机器人</div>
                      <div key="help" style={helpStyle}>点击“绑定新的飞书机器人”，按官方链接完成授权后再刷新。</div>
                    </div>
                  ) : null}
                  {profiles.map((profile, index) => {
                    const connection = connections.find((item) => item.profileName === profile.name);
                    const enabled = connection?.enabled !== false && Boolean(connection);
                    const authResult = userAuthResults[profile.name];
                    const isStartingUserAuth = startingUserAuthProfileName === profile.name;
                    const isFinishingUserAuth = finishingUserAuthProfileName === profile.name;
                    return (
                      <div key={`${profile.name}-${index}`} style={guideCardStyle}>
                        <div key="title" style={{ fontWeight: 800 }}>{appLabel(connection, profile)}</div>
                        <div key="meta" style={helpStyle}>{profileLabel(profile)}</div>
                        <div key="state" style={helpStyle}>App ID：{profile.appId ?? connection?.appId ?? "未返回"}</div>
                        <div key="auth-detail" style={helpStyle}>{profileAuthDetail(profile)}</div>
                        <div key="actions" style={rowStyle}>
                          <StatusBadge key="status" tone={enabled ? "success" : "warning"}>
                            {enabled ? "已加入机器人池" : "未加入机器人池"}
                          </StatusBadge>
                          {!enabled ? (
                            <button key="add" type="button" style={buttonStyle} onClick={() => addConnectionFromProfile(profile)}>
                              加入机器人池
                            </button>
                          ) : null}
                          {!profile.user ? (
                            <button key="user-auth" type="button" style={buttonStyle} disabled={isStartingUserAuth} onClick={() => void startUserAuthFlow(profile.name)}>
                              {isStartingUserAuth ? "生成中..." : "访问个人资源时授权"}
                            </button>
                          ) : null}
                        </div>
                        {authResult?.url ? (
                          <div key="user-auth-result" style={{ ...successBoxStyle, marginTop: "10px" }}>
                            <div key="title" style={{ fontWeight: 800 }}>已生成用户授权链接</div>
                            <div key="help" style={helpStyle}>授权后这里会显示授权用户姓名；不补也不影响机器人收发消息。</div>
                            <div key="actions" style={{ ...rowStyle, marginTop: "10px" }}>
                              <a key="open" href={authResult.url} target="_blank" rel="noreferrer" style={linkButtonStyle}>
                                打开授权链接
                              </a>
                              <button key="finish" type="button" style={buttonStyle} disabled={isFinishingUserAuth} onClick={() => void finishUserAuthFlow(profile.name)}>
                                {isFinishingUserAuth ? "确认中..." : "我已完成授权，刷新状态"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {!showBindPanel && !profileCatalog.loading && !profileError && profiles.length === 0 ? (
                  <div key="bind-panel" style={subtleBoxStyle}>
                    <div key="title" style={{ fontWeight: 800, marginBottom: "8px" }}>还没有发现飞书机器人</div>
                    <div key="bind-help" style={{ ...helpStyle, marginBottom: "10px" }}>
                      点击“绑定新的飞书机器人”会弹出绑定窗口，不需要在这里手填 App ID 或 App Secret。
                    </div>
                    <button key="open" type="button" style={primaryButtonStyle} onClick={() => openBindPanel()}>
                      绑定新的飞书机器人
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeAdvancedPanel === "deploy" ? (
              <div key="deploy-panel" style={{ display: "grid", gap: "12px" }}>
                <div key="runtime-position" style={subtleBoxStyle}>
                  <div key="title" style={{ fontWeight: 800, marginBottom: "6px" }}>当前运行位置</div>
                  <div key="hint" style={helpStyle}>{runtimeHint}</div>
                  <div key="mode" style={{ ...rowStyle, marginTop: "10px" }}>
                    <StatusBadge key="mode-badge" tone={runningOnLocalhost ? "warning" : "success"}>
                      {runningOnLocalhost ? "本地测试环境" : "云端正式环境"}
                    </StatusBadge>
                    <span key="profile" style={compactPillStyle}>profile：{serverProfileName(serverDeployConnection)}</span>
                  </div>
                </div>

                <div key="deploy-cards" style={gridTwoStyle}>
                  <div key="local" style={guideCardStyle}>
                    <div key="title" style={{ fontWeight: 800 }}>本地测试</div>
                    <div key="body" style={helpStyle}>
                      适合现在验证飞书是否能收消息、回消息、创建任务和上传附件。读取的是这台 Mac 上的 lark-cli profile。
                    </div>
                  </div>
                  <div key="server" style={guideCardStyle}>
                    <div key="title" style={{ fontWeight: 800 }}>云端正式部署</div>
                    <div key="body" style={helpStyle}>
                      Paperclip 跑到服务器后，页面只会读取服务器上的 lark-cli profile。业务入口配置可以沿用，但飞书应用授权必须在服务器上也完成一次。
                    </div>
                  </div>
                </div>

                <div key="checklist" style={checklistGridStyle}>
                  <ChecklistItem key="same-profile" done={hasConnection} title="同名 profile" detail={`服务器上也要有 ${serverProfileName(serverDeployConnection)}`} />
                  <ChecklistItem key="secret" done={true} title="App Secret 不进页面" detail="只在服务器或密钥系统里输入，不截图、不发聊天。" />
                  <ChecklistItem key="single-listener" done={(connectorStatus.data?.subscribers?.length ?? 0) <= activeConnections.length} title="只保留正式监听" detail="上云后不要让本机和服务器同时监听同一个机器人。" />
                  <ChecklistItem key="recheck" done={!runningOnLocalhost} title="服务器上重新检查" detail={runningOnLocalhost ? "部署到服务器后，再在服务器页面点检查连接。" : "当前页面已在服务器环境。"} />
                </div>

                <div key="commands" style={subtleBoxStyle}>
                  <div key="head" style={sectionHeaderStyle}>
                    <div key="copy">
                      <div key="title" style={{ fontWeight: 800 }}>给工程师的服务器绑定命令</div>
                      <div key="help" style={helpStyle}>
                        在 Paperclip 服务器上执行。命令里的 App Secret 占位符必须由管理员在服务器安全输入。
                      </div>
                    </div>
                    <button key="copy" type="button" style={buttonStyle} onClick={() => void copyServerDeployCommands()}>
                      复制命令
                    </button>
                  </div>
                  <code key="code" style={{ ...codeStyle, marginTop: "10px" }}>{serverDeployCommands}</code>
                </div>

                <div key="after-deploy" style={successBoxStyle}>
                  <div key="title" style={{ fontWeight: 800, marginBottom: "6px" }}>上云后怎么确认真的生效</div>
                  <div key="body" style={helpStyle}>
                    在服务器页面刷新机器人列表，确认机器人池里能看到同名机器人；保存配置；打开“自动监听飞书新消息”和“正式发送飞书消息”；最后在飞书群里发送真实测试话术。
                  </div>
                </div>
              </div>
            ) : null}

            {activeAdvancedPanel === "runtime" ? (
              <div key="runtime-panel" style={gridTwoStyle}>
                <ToggleField key="dryRunCli" label="正式发送飞书消息" checked={configJson.dryRunCli !== true} onChange={(checked) => patchConfig({ dryRunCli: !checked })} help="关闭时只是页面模拟，不会真的回复飞书。" />
                <ToggleField key="enableEventSubscriber" label="自动监听飞书新消息" checked={configJson.enableEventSubscriber === true} onChange={(checked) => patchConfig({ enableEventSubscriber: checked })} help="本地测试可以打开；上云后只保留服务器监听。" />
                <ToggleField key="ackOnInbound" label="收到需求后先回“已收到”" checked={configJson.ackOnInbound === true} onChange={(checked) => patchConfig({ ackOnInbound: checked })} />
                <ToggleField key="enableQuickReply" label="测试口令“只回复 ok”" checked={configJson.enableQuickReply !== false} onChange={(checked) => patchConfig({ enableQuickReply: checked })} />
                <Field key="larkCliBin" label="lark-cli 命令路径" help="普通用户不用改。系统找不到 lark-cli 时才填完整路径。">
                  <input style={inputStyle} value={configJson.larkCliBin ?? DEFAULT_CONFIG.larkCliBin} onChange={(event) => patchConfig({ larkCliBin: event.target.value })} />
                </Field>
                <Field key="completionMessageTemplate" label="智能体完成后的飞书回复">
                  <input style={inputStyle} value={configJson.completionMessageTemplate ?? DEFAULT_CONFIG.completionMessageTemplate} onChange={(event) => patchConfig({ completionMessageTemplate: event.target.value })} />
                </Field>
              </div>
            ) : null}

            {activeAdvancedPanel === "events" ? (
              <div key="events-panel" style={{ display: "grid", gap: "12px" }}>
                {productionMonitor ? (
                  <div key="monitor-summary" style={subtleBoxStyle}>
                    <div key="title" style={{ fontWeight: 800, marginBottom: "8px" }}>生产监控</div>
                    <div key="body" style={helpStyle}>
                      {productionMonitor.message}。监听进程 {productionMonitor.activeSubscriberCount}/{productionMonitor.expectedSubscriberCount}，
                      最近 30 分钟错误 {productionMonitor.recentErrorCount} 条、提醒 {productionMonitor.recentWarningCount} 条。
                      {productionMonitor.lastWatchdogAt ? ` 最近自检：${productionMonitor.lastWatchdogAt}` : " 自检会在服务运行后自动开始。"}
                    </div>
                  </div>
                ) : null}
                {productionMonitorChecks.length > 0 ? (
                  <CheckReport key="monitor-checks" title="监控检查项" items={productionMonitorChecks} />
                ) : null}
                <div key="state" style={checklistGridStyle}>
                  <ChecklistItem key="listener" done={isListening} title="监听开关" detail={isListening ? "已开启" : "未开启"} />
                  <ChecklistItem key="subscriber" done={(connectorStatus.data?.subscribers?.length ?? 0) > 0} title="监听进程" detail={`${connectorStatus.data?.subscribers?.length ?? 0} 个`} />
                  <ChecklistItem key="reply" done={isSendingRealMessages} title="真实回复" detail={isSendingRealMessages ? "已开启" : "模拟模式"} />
                  <ChecklistItem key="attachment-upload" done={isSendingRealMessages} title="附件上传" detail={isSendingRealMessages ? "真实下载并挂到任务" : "只做附件模拟记录"} />
                </div>
                <div key="logs" style={subtleBoxStyle}>
                  <div key="title" style={{ fontWeight: 800, marginBottom: "8px" }}>最近事件</div>
                  <RecentEventList
                    records={(connectorStatus.data?.recentRecords ?? []).slice(0, 8)}
                    emptyText="暂无事件日志。"
                  />
                </div>
              </div>
            ) : null}

            {activeAdvancedPanel === "base" ? (
              <div key="base-panel" style={{ display: "grid", gap: "12px" }}>
                <div key="header" style={sectionHeaderStyle}>
                  <div key="copy" style={helpStyle}>没有需求池沉淀要求时可以不配。需要时新增一张飞书多维表格写入规则。</div>
                  <button
                    key="add"
                    type="button"
                    style={buttonStyle}
                    onClick={() => patchConfig({
                      baseSinks: [
                        ...baseSinks,
                        {
                          id: baseSinks.length === 0 ? "feishu-base" : `feishu-base-${baseSinks.length + 1}`,
                          connectionId: preferredConnection?.id,
                          enabled: true,
                          baseToken: "",
                          tableIdOrName: "需求池",
                          identity: "bot",
                          fieldMap: {},
                        },
                      ],
                    })}
                  >
                    添加多维表格规则
                  </button>
                </div>
                {baseSinks.length === 0 ? <div key="empty" style={subtleBoxStyle}>当前没有配置多维表格同步。</div> : null}
                {baseSinks.map((sink, index) => (
                  <div key={`${sink.id}-${index}`} style={subtleBoxStyle}>
                    <div key="fields" style={gridTwoStyle}>
                      <Field key="id" label="规则名称">
                        <input style={inputStyle} value={sink.id ?? ""} onChange={(event) => patchBaseSink(index, { id: event.target.value })} />
                      </Field>
                      <Field key="baseToken" label="Base Token">
                        <input style={inputStyle} value={sink.baseToken ?? ""} onChange={(event) => patchBaseSink(index, { baseToken: event.target.value })} />
                      </Field>
                      <Field key="tableIdOrName" label="数据表名称或 ID">
                        <input style={inputStyle} value={sink.tableIdOrName ?? ""} onChange={(event) => patchBaseSink(index, { tableIdOrName: event.target.value })} />
                      </Field>
                      <Field key="connectionId" label="使用哪个飞书机器人">
                        <select style={selectStyle} value={sink.connectionId ?? preferredConnection?.id ?? ""} onChange={(event) => patchBaseSink(index, { connectionId: event.target.value })}>
                          {connectionOptionNodes(connections, `base-sink-${index}`, undefined, profiles)}
                        </select>
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {error ? <div key="error" style={{ ...subtleBoxStyle, color: "var(--destructive)" }}>{error}</div> : null}
          </div>
        ) : (
          <div key="advanced-empty" style={subtleBoxStyle}>
            <div key="title" style={{ fontWeight: 800, marginBottom: "6px" }}>点开一项再看细节</div>
            <div key="help" style={helpStyle}>
              普通用户通常不用进入这里。需要处理 App Secret、服务器部署、监听日志或多维表格同步时，再选择对应项目。
            </div>
          </div>
        )}
      </section>
      ) : null}

    </div>
  );
}

export function DashboardWidget(_props: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<ConnectorStatus>(DATA_KEYS.status);

  if (loading) return <div>正在读取飞书连接器状态...</div>;
  if (error) return <div>飞书连接器状态读取失败：{error.message}</div>;

  const latest = data?.recentRecords?.[0];
  return (
    <div style={cardStyle}>
      <strong>飞书连接器</strong>
      <div style={rowStyle}>
        <Badge>{data?.dryRunCli ? "测试模式" : "正式发送"}</Badge>
        <Badge>{data?.eventSubscriberEnabled ? "正在监听飞书消息" : "未开启监听"}</Badge>
        <Badge>{data?.monitor?.health === "ok" ? "监控正常" : data?.monitor?.health === "error" ? "监控有阻塞" : "监控有提醒"}</Badge>
        <Badge>{`${data?.connectionCount ?? 0} 个机器人`}</Badge>
        <Badge>{`${data?.routeCount ?? 0} 条接收规则`}</Badge>
        <Badge>{`${data?.baseSinkCount ?? 0} 个多维表格规则`}</Badge>
      </div>
      <div>正在运行的监听进程：{data?.subscribers?.length ?? 0}</div>
      {latest ? <div>最近状态：{latest.message}</div> : <div>暂无事件。</div>}
    </div>
  );
}
