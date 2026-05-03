const FALLBACK_LOCALE = "en-US";

export function resolveRuntimeLocale(): string {
  if (typeof navigator === "undefined") return FALLBACK_LOCALE;
  return navigator.language || FALLBACK_LOCALE;
}

export function formatRuntimeNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(resolveRuntimeLocale(), options);
}

export function formatRuntimeDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleDateString(resolveRuntimeLocale(), options);
}

export function formatRuntimeDateTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleString(resolveRuntimeLocale(), options);
}

export function formatRuntimeTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleTimeString(resolveRuntimeLocale(), options);
}

export function getRuntimeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
