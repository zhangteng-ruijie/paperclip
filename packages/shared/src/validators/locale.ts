import { z } from "zod";
import {
  DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE,
  DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE,
  DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE,
  PAPERCLIP_CURRENCY_PREFERENCES,
  PAPERCLIP_UI_LOCALE_PREFERENCES,
} from "../types/locale.js";

export const paperclipUiLocalePreferenceSchema = z
  .enum(PAPERCLIP_UI_LOCALE_PREFERENCES)
  .default(DEFAULT_PAPERCLIP_UI_LOCALE_PREFERENCE);

export const paperclipTimeZonePreferenceSchema = z
  .string()
  .trim()
  .min(1)
  .default(DEFAULT_PAPERCLIP_TIME_ZONE_PREFERENCE);

export const paperclipCurrencyPreferenceSchema = z
  .enum(PAPERCLIP_CURRENCY_PREFERENCES)
  .default(DEFAULT_PAPERCLIP_CURRENCY_PREFERENCE);

export type PaperclipUiLocalePreference = z.infer<typeof paperclipUiLocalePreferenceSchema>;
export type PaperclipTimeZonePreference = z.infer<typeof paperclipTimeZonePreferenceSchema>;
export type PaperclipCurrencyPreference = z.infer<typeof paperclipCurrencyPreferenceSchema>;
