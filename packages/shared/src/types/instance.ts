import type { FeedbackDataSharingPreference } from "./feedback.js";
import type {
  PaperclipCurrencyPreference,
  PaperclipUiLocalePreference,
} from "./locale.js";

export interface InstanceGeneralSettings {
  censorUsernameInLogs: boolean;
  keyboardShortcuts: boolean;
  feedbackDataSharingPreference: FeedbackDataSharingPreference;
  locale: PaperclipUiLocalePreference;
  timeZone: string;
  currencyCode: PaperclipCurrencyPreference;
}

export interface InstanceExperimentalSettings {
  enableIsolatedWorkspaces: boolean;
  autoRestartDevServerWhenIdle: boolean;
}

export interface InstanceSettings {
  id: string;
  general: InstanceGeneralSettings;
  experimental: InstanceExperimentalSettings;
  createdAt: Date;
  updatedAt: Date;
}
