import {
  DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE,
  DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE,
  DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE,
  resolvePaperclipCurrencyCode,
  type PaperclipCurrencyCode,
  type PaperclipCurrencyPreference,
  type PaperclipUiLocale,
  type PaperclipUiLocalePreference,
} from "@paperclipai/shared";

export type RuntimeLocalePreferences = {
  locale: PaperclipUiLocalePreference;
  timeZone: string;
  currencyCode: PaperclipCurrencyPreference;
};

export type RuntimeLocaleConfig = {
  locale: PaperclipUiLocale;
  timeZone: string;
  currencyCode: PaperclipCurrencyCode;
};

const DEFAULT_RUNTIME_LOCALE_CONFIG: RuntimeLocaleConfig = {
  locale: "en",
  timeZone: "UTC",
  currencyCode: "USD",
};

let runtimeLocaleConfig: RuntimeLocaleConfig = DEFAULT_RUNTIME_LOCALE_CONFIG;

function normalizeDetectedLocale(value: string | null | undefined): PaperclipUiLocale {
  if (!value) return "en";
  return value.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function detectSystemUiLocale(candidates?: readonly string[]): PaperclipUiLocale {
  if (candidates && candidates.length > 0) {
    for (const candidate of candidates) {
      const normalized = normalizeDetectedLocale(candidate);
      if (normalized === "zh-CN") return normalized;
    }
    return normalizeDetectedLocale(candidates[0]);
  }

  if (typeof navigator !== "undefined") {
    const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
    return detectSystemUiLocale(languages);
  }

  return DEFAULT_RUNTIME_LOCALE_CONFIG.locale;
}

export function resolveUiLocale(localePreference?: PaperclipUiLocalePreference): PaperclipUiLocale {
  if (localePreference === "en" || localePreference === "zh-CN") {
    return localePreference;
  }
  return detectSystemUiLocale();
}

export function resolveTimeZone(timeZonePreference?: string): string {
  if (timeZonePreference && timeZonePreference !== DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE) {
    return timeZonePreference;
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_RUNTIME_LOCALE_CONFIG.timeZone;
  } catch {
    return DEFAULT_RUNTIME_LOCALE_CONFIG.timeZone;
  }
}

export function resolveCurrencyCode(
  currencyPreference: PaperclipCurrencyPreference | undefined,
  locale: PaperclipUiLocale,
): PaperclipCurrencyCode {
  if (currencyPreference === "USD" || currencyPreference === "CNY") {
    return currencyPreference;
  }
  return resolvePaperclipCurrencyCode(locale);
}

export function resolveRuntimeLocaleConfig(
  preferences: Partial<RuntimeLocalePreferences> = {},
): RuntimeLocaleConfig {
  const locale = resolveUiLocale(preferences.locale);
  return {
    locale,
    timeZone: resolveTimeZone(preferences.timeZone),
    currencyCode: resolveCurrencyCode(preferences.currencyCode, locale),
  };
}

export function setRuntimeLocaleConfig(next: RuntimeLocaleConfig): void {
  runtimeLocaleConfig = next;
}

export function getRuntimeLocaleConfig(): RuntimeLocaleConfig {
  return runtimeLocaleConfig;
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatLocalizedDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions,
): string {
  const { locale, timeZone } = runtimeLocaleConfig;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(toDate(value));
}

export function formatLocalizedTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions,
): string {
  return formatLocalizedDate(value, options);
}

export function formatLocalizedCurrency(value: number, currencyCode?: PaperclipCurrencyCode): string {
  const { locale, currencyCode: defaultCurrencyCode } = runtimeLocaleConfig;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode ?? defaultCurrencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatLocalizedRelativeTime(value: Date | string | number): string {
  const date = toDate(value);
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);

  if (Math.abs(diffSeconds) < 5) {
    return runtimeLocaleConfig.locale === "zh-CN" ? "刚刚" : "just now";
  }

  const formatter = new Intl.RelativeTimeFormat(runtimeLocaleConfig.locale, { numeric: "auto" });

  if (Math.abs(diffSeconds) < 60) {
    return formatter.format(diffSeconds, "second");
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return formatter.format(diffDays, "day");
  }

  return formatLocalizedDate(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
