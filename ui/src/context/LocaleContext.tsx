import { createContext, Fragment, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE,
  DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE,
  DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE,
  type InstanceGeneralSettings,
  type PaperclipCurrencyCode,
  type PaperclipCurrencyPreference,
  type PaperclipUiLocale,
  type PaperclipUiLocalePreference,
} from "@paperclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { queryKeys } from "@/lib/queryKeys";
import {
  resolveCurrencyCode,
  resolveRuntimeLocaleConfig,
  setRuntimeLocaleConfig,
  type RuntimeLocalePreferences,
} from "@/lib/runtime-locale";

type MessageKey =
  | "common.loading"
  | "common.loadingGeneralSettings"
  | "common.loadingExperimentalSettings"
  | "common.failedLoadAppState"
  | "common.failedLoadGeneralSettings"
  | "common.failedLoadExperimentalSettings"
  | "common.failedUpdateGeneralSettings"
  | "common.failedUpdateExperimentalSettings"
  | "common.failedSignOut"
  | "instance.sidebar.title"
  | "instance.sidebar.general"
  | "instance.sidebar.heartbeats"
  | "instance.sidebar.experimental"
  | "instance.sidebar.plugins"
  | "instance.sidebar.adapters"
  | "app.bootstrapPending.title"
  | "app.bootstrapPending.activeInvite"
  | "app.bootstrapPending.noInvite"
  | "app.onboarding.addAnotherAgentTitle"
  | "app.onboarding.createAnotherCompanyTitle"
  | "app.onboarding.createFirstCompanyTitle"
  | "app.onboarding.addAnotherAgentDescription"
  | "app.onboarding.createAnotherCompanyDescription"
  | "app.onboarding.createFirstCompanyDescription"
  | "app.onboarding.addAgent"
  | "app.onboarding.start"
  | "app.noCompanies.title"
  | "app.noCompanies.description"
  | "app.noCompanies.newCompany"
  | "settings.general.instanceTitle"
  | "settings.general.title"
  | "settings.general.description"
  | "settings.general.languageTitle"
  | "settings.general.languageDescription"
  | "settings.general.languageHelp"
  | "settings.general.timeZoneTitle"
  | "settings.general.timeZoneDescription"
  | "settings.general.timeZoneHelp"
  | "settings.general.currencyTitle"
  | "settings.general.currencyDescription"
  | "settings.general.currencyHelp"
  | "settings.general.preview"
  | "settings.general.previewValue"
  | "settings.general.censorTitle"
  | "settings.general.censorDescription"
  | "settings.general.keyboardTitle"
  | "settings.general.keyboardDescription"
  | "settings.general.feedbackTitle"
  | "settings.general.feedbackDescription"
  | "settings.general.feedbackTerms"
  | "settings.general.feedbackPromptNotice"
  | "settings.general.feedbackAllowed"
  | "settings.general.feedbackAllowedDescription"
  | "settings.general.feedbackNotAllowed"
  | "settings.general.feedbackNotAllowedDescription"
  | "settings.general.feedbackResetNote"
  | "settings.general.signOutTitle"
  | "settings.general.signOutDescription"
  | "settings.general.signOut"
  | "settings.general.signingOut"
  | "settings.general.locale.system"
  | "settings.general.locale.en"
  | "settings.general.locale.zh-CN"
  | "settings.general.timeZone.system"
  | "settings.general.currency.default"
  | "settings.general.currency.USD"
  | "settings.general.currency.CNY"
  | "settings.experimental.title"
  | "settings.experimental.description"
  | "settings.experimental.enableIsolatedWorkspacesTitle"
  | "settings.experimental.enableIsolatedWorkspacesDescription"
  | "settings.experimental.autoRestartTitle"
  | "settings.experimental.autoRestartDescription";

type MessageTable = Record<MessageKey, string>;

const messages: Record<PaperclipUiLocale, MessageTable> = {
  en: {
    "common.loading": "Loading...",
    "common.loadingGeneralSettings": "Loading general settings...",
    "common.loadingExperimentalSettings": "Loading experimental settings...",
    "common.failedLoadAppState": "Failed to load app state",
    "common.failedLoadGeneralSettings": "Failed to load general settings.",
    "common.failedLoadExperimentalSettings": "Failed to load experimental settings.",
    "common.failedUpdateGeneralSettings": "Failed to update general settings.",
    "common.failedUpdateExperimentalSettings": "Failed to update experimental settings.",
    "common.failedSignOut": "Failed to sign out.",
    "instance.sidebar.title": "Instance Settings",
    "instance.sidebar.general": "General",
    "instance.sidebar.heartbeats": "Heartbeats",
    "instance.sidebar.experimental": "Experimental",
    "instance.sidebar.plugins": "Plugins",
    "instance.sidebar.adapters": "Adapters",
    "app.bootstrapPending.title": "Instance setup required",
    "app.bootstrapPending.activeInvite":
      "No instance admin exists yet. A bootstrap invite is already active. Check your Paperclip startup logs for the first admin invite URL, or run this command to rotate it:",
    "app.bootstrapPending.noInvite":
      "No instance admin exists yet. Run this command in your Paperclip environment to generate the first admin invite URL:",
    "app.onboarding.addAnotherAgentTitle": "Add another agent to {company}",
    "app.onboarding.createAnotherCompanyTitle": "Create another company",
    "app.onboarding.createFirstCompanyTitle": "Create your first company",
    "app.onboarding.addAnotherAgentDescription":
      "Run onboarding again to add an agent and a starter task for this company.",
    "app.onboarding.createAnotherCompanyDescription":
      "Run onboarding again to create another company and seed its first agent.",
    "app.onboarding.createFirstCompanyDescription":
      "Get started by creating a company and your first agent.",
    "app.onboarding.addAgent": "Add Agent",
    "app.onboarding.start": "Start Onboarding",
    "app.noCompanies.title": "Create your first company",
    "app.noCompanies.description": "Get started by creating a company.",
    "app.noCompanies.newCompany": "New Company",
    "settings.general.instanceTitle": "Instance Settings",
    "settings.general.title": "General",
    "settings.general.description":
      "Configure instance-wide defaults for language, time zone, currency, and operator-visible logs.",
    "settings.general.languageTitle": "Language",
    "settings.general.languageDescription":
      "Choose how Paperclip renders copy, labels, and interface text across the board UI.",
    "settings.general.languageHelp":
      "Use System default to follow each operator browser, or pin the UI to a single language for the whole instance.",
    "settings.general.timeZoneTitle": "Time zone",
    "settings.general.timeZoneDescription":
      "Control how schedules and timestamps are formatted in operator-visible surfaces.",
    "settings.general.timeZoneHelp":
      "Use System default to follow the current browser time zone, or pin the instance to a single zone such as Asia/Shanghai.",
    "settings.general.currencyTitle": "Currency",
    "settings.general.currencyDescription":
      "Set the default currency used when Paperclip displays costs, budgets, and spend summaries.",
    "settings.general.currencyHelp":
      "Default for language uses USD for English and CNY for Simplified Chinese.",
    "settings.general.preview": "Preview",
    "settings.general.previewValue": "Resolved UI: {locale} · {timeZone} · {currency}",
    "settings.general.censorTitle": "Censor username in logs",
    "settings.general.censorDescription":
      "Hide the username segment in home-directory paths and similar operator-visible log output. Standalone username mentions outside of paths are not yet masked in the live transcript view. This is off by default.",
    "settings.general.keyboardTitle": "Keyboard shortcuts",
    "settings.general.keyboardDescription":
      "Enable app keyboard shortcuts, including inbox navigation and global shortcuts like creating issues or toggling panels. This is off by default.",
    "settings.general.feedbackTitle": "AI feedback sharing",
    "settings.general.feedbackDescription":
      "Control whether thumbs up and thumbs down votes can send the voted AI output to Paperclip Labs. Votes are always saved locally.",
    "settings.general.feedbackTerms": "Read our terms of service",
    "settings.general.feedbackPromptNotice":
      "No default is saved yet. The next thumbs up or thumbs down choice will ask once and then save the answer here.",
    "settings.general.feedbackAllowed": "Always allow",
    "settings.general.feedbackAllowedDescription": "Share voted AI outputs automatically.",
    "settings.general.feedbackNotAllowed": "Don't allow",
    "settings.general.feedbackNotAllowedDescription": "Keep voted AI outputs local only.",
    "settings.general.feedbackResetNote":
      'To retest the first-use prompt in local dev, remove the `feedbackDataSharingPreference` key from the `instance_settings.general` JSON row for this instance, or set it back to `"prompt"`. Unset and `"prompt"` both mean no default has been chosen yet.',
    "settings.general.signOutTitle": "Sign out",
    "settings.general.signOutDescription":
      "Sign out of this Paperclip instance. You will be redirected to the login page.",
    "settings.general.signOut": "Sign out",
    "settings.general.signingOut": "Signing out...",
    "settings.general.locale.system": "System default",
    "settings.general.locale.en": "English",
    "settings.general.locale.zh-CN": "Simplified Chinese",
    "settings.general.timeZone.system": "System default",
    "settings.general.currency.default": "Default for language",
    "settings.general.currency.USD": "USD ($)",
    "settings.general.currency.CNY": "CNY (¥)",
    "settings.experimental.title": "Experimental",
    "settings.experimental.description":
      "Opt into features that are still being evaluated before they become default behavior.",
    "settings.experimental.enableIsolatedWorkspacesTitle": "Enable Isolated Workspaces",
    "settings.experimental.enableIsolatedWorkspacesDescription":
      "Show execution workspace controls in project configuration and allow isolated workspace behavior for new and existing issue runs.",
    "settings.experimental.autoRestartTitle": "Auto-Restart Dev Server When Idle",
    "settings.experimental.autoRestartDescription":
      "In `pnpm dev:once`, wait for all queued and running local agent runs to finish, then restart the server automatically when backend changes or migrations make the current boot stale.",
  },
  "zh-CN": {
    "common.loading": "加载中…",
    "common.loadingGeneralSettings": "正在加载通用设置…",
    "common.loadingExperimentalSettings": "正在加载实验性设置…",
    "common.failedLoadAppState": "加载应用状态失败",
    "common.failedLoadGeneralSettings": "加载通用设置失败。",
    "common.failedLoadExperimentalSettings": "加载实验性设置失败。",
    "common.failedUpdateGeneralSettings": "更新通用设置失败。",
    "common.failedUpdateExperimentalSettings": "更新实验性设置失败。",
    "common.failedSignOut": "退出登录失败。",
    "instance.sidebar.title": "实例设置",
    "instance.sidebar.general": "通用",
    "instance.sidebar.heartbeats": "心跳",
    "instance.sidebar.experimental": "实验功能",
    "instance.sidebar.plugins": "插件",
    "instance.sidebar.adapters": "适配器",
    "app.bootstrapPending.title": "需要完成实例初始化",
    "app.bootstrapPending.activeInvite":
      "当前还没有实例管理员，但已经存在一个初始化邀请。请查看 Paperclip 启动日志中的首个管理员邀请链接，或运行下面的命令重新生成：",
    "app.bootstrapPending.noInvite":
      "当前还没有实例管理员。请在 Paperclip 运行环境中执行下面的命令，生成首个管理员邀请链接：",
    "app.onboarding.addAnotherAgentTitle": "为 {company} 再添加一个 Agent",
    "app.onboarding.createAnotherCompanyTitle": "再创建一个公司",
    "app.onboarding.createFirstCompanyTitle": "创建你的第一个公司",
    "app.onboarding.addAnotherAgentDescription":
      "重新运行引导，为这个公司补充一个 Agent 和一条起始任务。",
    "app.onboarding.createAnotherCompanyDescription":
      "重新运行引导，创建另一个公司并初始化首个 Agent。",
    "app.onboarding.createFirstCompanyDescription": "从创建公司和第一个 Agent 开始。",
    "app.onboarding.addAgent": "添加 Agent",
    "app.onboarding.start": "开始引导",
    "app.noCompanies.title": "创建你的第一个公司",
    "app.noCompanies.description": "从创建一个公司开始。",
    "app.noCompanies.newCompany": "新建公司",
    "settings.general.instanceTitle": "实例设置",
    "settings.general.title": "通用",
    "settings.general.description":
      "配置实例级默认项，包括语言、时区、币种，以及所有面向运营者的日志展示方式。",
    "settings.general.languageTitle": "语言",
    "settings.general.languageDescription":
      "控制看板 UI 中的文案、标签和界面文本如何呈现。",
    "settings.general.languageHelp":
      "选择“跟随系统”时会跟随操作者浏览器；固定语言后，整个实例都会统一显示该语言。",
    "settings.general.timeZoneTitle": "时区",
    "settings.general.timeZoneDescription":
      "控制计划任务和时间戳在运营界面中的展示方式。",
    "settings.general.timeZoneHelp":
      "选择“跟随系统”时会跟随当前浏览器时区；也可以固定为 `Asia/Shanghai` 这类统一时区。",
    "settings.general.currencyTitle": "币种",
    "settings.general.currencyDescription":
      "设置 Paperclip 展示成本、预算和花费汇总时使用的默认币种。",
    "settings.general.currencyHelp": "“跟随语言”会在英文下使用 USD，在简体中文下使用 CNY。",
    "settings.general.preview": "预览",
    "settings.general.previewValue": "当前解析结果：{locale} · {timeZone} · {currency}",
    "settings.general.censorTitle": "日志中隐藏用户名",
    "settings.general.censorDescription":
      "隐藏主目录路径等面向运营者日志中的用户名片段。当前实时转录视图中，路径之外的独立用户名还不会被遮蔽。默认关闭。",
    "settings.general.keyboardTitle": "键盘快捷键",
    "settings.general.keyboardDescription":
      "启用应用级快捷键，包括收件箱导航，以及创建任务、切换面板等全局快捷操作。默认关闭。",
    "settings.general.feedbackTitle": "AI 反馈共享",
    "settings.general.feedbackDescription":
      "控制点赞/点踩时，是否可以把被投票的 AI 输出同步给 Paperclip Labs。投票始终会保存在本地。",
    "settings.general.feedbackTerms": "查看服务条款",
    "settings.general.feedbackPromptNotice":
      "当前还没有保存默认值。下次点赞或点踩时会再询问一次，之后会把选择保存到这里。",
    "settings.general.feedbackAllowed": "始终允许",
    "settings.general.feedbackAllowedDescription": "自动共享被投票的 AI 输出。",
    "settings.general.feedbackNotAllowed": "不允许",
    "settings.general.feedbackNotAllowedDescription": "被投票的 AI 输出仅保存在本地。",
    "settings.general.feedbackResetNote":
      "如果要在本地开发环境重新触发首次询问，可删除当前实例 `instance_settings.general` JSON 行中的 `feedbackDataSharingPreference` 键，或把它重新设为 `\"prompt\"`。未设置和 `\"prompt\"` 都表示尚未选择默认值。",
    "settings.general.signOutTitle": "退出登录",
    "settings.general.signOutDescription":
      "退出当前 Paperclip 实例登录，随后会跳转到登录页。",
    "settings.general.signOut": "退出登录",
    "settings.general.signingOut": "正在退出…",
    "settings.general.locale.system": "跟随系统",
    "settings.general.locale.en": "English",
    "settings.general.locale.zh-CN": "简体中文",
    "settings.general.timeZone.system": "跟随系统",
    "settings.general.currency.default": "跟随语言",
    "settings.general.currency.USD": "美元（USD）",
    "settings.general.currency.CNY": "人民币（CNY）",
    "settings.experimental.title": "实验功能",
    "settings.experimental.description": "这里的能力仍在验证中，尚未成为默认行为。",
    "settings.experimental.enableIsolatedWorkspacesTitle": "启用隔离工作区",
    "settings.experimental.enableIsolatedWorkspacesDescription":
      "在项目配置中显示执行工作区控制项，并允许新的或已有任务运行使用隔离工作区能力。",
    "settings.experimental.autoRestartTitle": "空闲时自动重启开发服务器",
    "settings.experimental.autoRestartDescription":
      "在 `pnpm dev:once` 模式下，等待所有本地 Agent 运行结束后，如果后端改动或迁移让当前启动实例过期，就自动重启服务。",
  },
};

type LocaleContextValue = {
  localePreference: PaperclipUiLocalePreference;
  timeZonePreference: string;
  currencyPreference: PaperclipCurrencyPreference;
  locale: PaperclipUiLocale;
  timeZone: string;
  currencyCode: PaperclipCurrencyCode;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
};

const LOCALE_SETTINGS_STORAGE_KEY = "paperclip.locale-settings.v1";

const LocaleContext = createContext<LocaleContextValue>({
  localePreference: DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE,
  timeZonePreference: DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE,
  currencyPreference: DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE,
  locale: "en",
  timeZone: "UTC",
  currencyCode: "USD",
  t: (key) => messages.en[key],
});

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? `{${key}}`));
}

function normalizeStoredPreferences(raw: unknown): RuntimeLocalePreferences | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const locale = typeof value.locale === "string" ? value.locale : DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE;
  const timeZone = typeof value.timeZone === "string" ? value.timeZone : DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE;
  const currencyCode =
    typeof value.currencyCode === "string" ? value.currencyCode : DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE;

  if (
    (locale !== "system" && locale !== "en" && locale !== "zh-CN") ||
    (currencyCode !== "default" && currencyCode !== "USD" && currencyCode !== "CNY")
  ) {
    return null;
  }

  return {
    locale: locale as PaperclipUiLocalePreference,
    timeZone,
    currencyCode: currencyCode as PaperclipCurrencyPreference,
  };
}

function readStoredPreferences(): RuntimeLocalePreferences {
  if (typeof window === "undefined") {
    return {
      locale: DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE,
      timeZone: DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE,
      currencyCode: DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE,
    };
  }
  try {
    const raw = window.localStorage.getItem(LOCALE_SETTINGS_STORAGE_KEY);
    const parsed = raw ? normalizeStoredPreferences(JSON.parse(raw)) : null;
    return (
      parsed ?? {
        locale: DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE,
        timeZone: DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE,
        currencyCode: DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE,
      }
    );
  } catch {
    return {
      locale: DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE,
      timeZone: DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE,
      currencyCode: DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE,
    };
  }
}

function writeStoredPreferences(settings: Pick<InstanceGeneralSettings, "locale" | "timeZone" | "currencyCode">) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore local storage failures and fall back to query-backed settings.
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [storedPreferences] = useState(readStoredPreferences);

  const generalSettingsQuery = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
    retry: false,
    staleTime: 60_000,
  });

  const localePreference = generalSettingsQuery.data?.locale ?? storedPreferences.locale;
  const timeZonePreference = generalSettingsQuery.data?.timeZone ?? storedPreferences.timeZone;
  const currencyPreference = generalSettingsQuery.data?.currencyCode ?? storedPreferences.currencyCode;

  const runtimeConfig = useMemo(
    () =>
      resolveRuntimeLocaleConfig({
        locale: localePreference,
        timeZone: timeZonePreference,
        currencyCode: currencyPreference,
      }),
    [currencyPreference, localePreference, timeZonePreference],
  );

  setRuntimeLocaleConfig(runtimeConfig);

  useEffect(() => {
    if (!generalSettingsQuery.data) return;
    writeStoredPreferences(generalSettingsQuery.data);
  }, [generalSettingsQuery.data]);

  const value = useMemo<LocaleContextValue>(() => {
    const table = messages[runtimeConfig.locale];
    return {
      localePreference,
      timeZonePreference,
      currencyPreference,
      locale: runtimeConfig.locale,
      timeZone: runtimeConfig.timeZone,
      currencyCode: resolveCurrencyCode(currencyPreference, runtimeConfig.locale),
      t: (key, values) => interpolate(table[key] ?? messages.en[key], values),
    };
  }, [currencyPreference, localePreference, runtimeConfig.locale, runtimeConfig.timeZone, timeZonePreference]);

  return (
    <LocaleContext.Provider value={value}>
      <Fragment key={`${runtimeConfig.locale}:${runtimeConfig.timeZone}:${runtimeConfig.currencyCode}`}>{children}</Fragment>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
