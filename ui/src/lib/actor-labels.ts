import { getRuntimeLocaleConfig } from "./runtime-locale";

export type ActorLabelKey =
  | "me"
  | "you"
  | "board"
  | "system"
  | "unknown"
  | "agent"
  | "unassigned";

const actorLabels = {
  en: {
    me: "Me",
    you: "You",
    board: "Board",
    system: "System",
    unknown: "Unknown",
    agent: "Agent",
    unassigned: "Unassigned",
  },
  "zh-CN": {
    me: "我",
    you: "你",
    board: "董事会",
    system: "系统",
    unknown: "未知",
    agent: "智能体",
    unassigned: "未分配",
  },
} as const;

function resolveLocale(locale?: string | null) {
  return locale === "zh-CN" ? "zh-CN" : "en";
}

export function localizedActorLabel(key: ActorLabelKey, locale?: string | null): string {
  return actorLabels[resolveLocale(locale)][key];
}

export function runtimeActorLabel(key: ActorLabelKey): string {
  return localizedActorLabel(key, getRuntimeLocaleConfig().locale);
}
