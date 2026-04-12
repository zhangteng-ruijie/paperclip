export const PAPERCLIP_UI_LOCALES = ["en", "zh-CN"] as const;
export type PaperclipUiLocale = (typeof PAPERCLIP_UI_LOCALES)[number];

export const PAPERCLIP_UI_LOCALE_PREFERENCES = ["system", ...PAPERCLIP_UI_LOCALES] as const;
export type PaperclipUiLocalePreference = (typeof PAPERCLIP_UI_LOCALE_PREFERENCES)[number];

export const PAPERCLIP_CURRENCY_CODES = ["USD", "CNY"] as const;
export type PaperclipCurrencyCode = (typeof PAPERCLIP_CURRENCY_CODES)[number];

export const PAPERCLIP_CURRENCY_PREFERENCES = ["default", ...PAPERCLIP_CURRENCY_CODES] as const;
export type PaperclipCurrencyPreference = (typeof PAPERCLIP_CURRENCY_PREFERENCES)[number];

export const DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE: PaperclipUiLocalePreference = "system";
export const DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE = "system";
export const DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE: PaperclipCurrencyPreference = "default";

export function resolvePaperclipCurrencyCode(locale: PaperclipUiLocale): PaperclipCurrencyCode {
  return locale === "zh-CN" ? "CNY" : "USD";
}
