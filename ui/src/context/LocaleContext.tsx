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
  | "settings.experimental.autoRestartDescription"
  | "invite.invalidToken"
  | "invite.loading"
  | "invite.notAvailable"
  | "invite.expiredOrRevoked"
  | "invite.bootstrapComplete"
  | "invite.bootstrapCompleteDescription"
  | "invite.openBoard"
  | "invite.joinRequestSubmitted"
  | "invite.pendingApproval"
  | "invite.requestId"
  | "invite.claimSecret"
  | "invite.paperclipSkillBootstrap"
  | "invite.installTo"
  | "invite.agentOnboardingText"
  | "invite.connectivityDiagnostics"
  | "invite.bootstrapInstance"
  | "invite.joinCompany"
  | "invite.joinThisCompany"
  | "invite.invitedToJoin"
  | "invite.expiresAt"
  | "invite.joinAsHuman"
  | "invite.joinAsAgent"
  | "invite.agentName"
  | "invite.adapterType"
  | "invite.capabilitiesOptional"
  | "invite.comingSoon"
  | "invite.signInRequired"
  | "invite.signInCreateAccount"
  | "invite.submitting"
  | "invite.acceptBootstrapInvite"
  | "invite.submitJoinRequest"
  | "cli.invalidUrl"
  | "cli.loadingChallenge"
  | "cli.challengeUnavailable"
  | "cli.challengeInvalidOrExpired"
  | "cli.accessApproved"
  | "cli.canFinishAuth"
  | "cli.command"
  | "cli.challengeExpired"
  | "cli.challengeCancelled"
  | "cli.startAgain"
  | "cli.signInRequired"
  | "cli.signInToApprove"
  | "cli.signInCreateAccount"
  | "cli.approveAccess"
  | "cli.requestingBoardAccess"
  | "cli.client"
  | "cli.requestedAccess"
  | "cli.requestedCompany"
  | "cli.instanceAdmin"
  | "cli.board"
  | "cli.requiresInstanceAdmin"
  | "cli.approve"
  | "cli.approving"
  | "cli.cancel"
  | "cli.cancelling"
  | "cli.failedUpdate"
  | "notFound.breadcrumb"
  | "notFound.companyNotFound"
  | "notFound.pageNotFound"
  | "notFound.noCompanyMatches"
  | "notFound.routeNotExist"
  | "notFound.requestedPath"
  | "notFound.openDashboard"
  | "notFound.goHome"
  | "board.invalidClaimUrl"
  | "board.loadingClaim"
  | "board.claimUnavailable"
  | "board.challengeInvalidOrExpired"
  | "board.ownershipClaimed"
  | "board.linkedToUser"
  | "board.openBoard"
  | "board.signInRequired"
  | "board.signInToClaim"
  | "board.signInCreateAccount"
  | "board.claimOwnership"
  | "board.promoteToAdmin"
  | "board.failedToClaim"
  | "board.claiming"
  | "auth.loading"
  | "auth.signInTitle"
  | "auth.signUpTitle"
  | "auth.signInDescription"
  | "auth.signUpDescription"
  | "auth.fillRequiredFields"
  | "auth.name"
  | "auth.email"
  | "auth.password"
  | "auth.working"
  | "auth.signIn"
  | "auth.createAccount"
  | "auth.needAccount"
  | "auth.haveAccount"
  | "auth.createOne"
  | "auth.signInLink"
  | "auth.authenticationFailed"
  | "onboarding.close"
  | "onboarding.stepCompany"
  | "onboarding.stepAgent"
  | "onboarding.stepTask"
  | "onboarding.stepLaunch"
  | "onboarding.nameYourCompany"
  | "onboarding.companyDescription"
  | "onboarding.companyName"
  | "onboarding.companyNamePlaceholder"
  | "onboarding.missionGoalOptional"
  | "onboarding.missionGoalPlaceholder"
  | "onboarding.createFirstAgent"
  | "onboarding.agentDescription"
  | "onboarding.agentName"
  | "onboarding.agentNamePlaceholder"
  | "onboarding.adapterType"
  | "onboarding.recommended"
  | "onboarding.moreAgentAdapterTypes"
  | "onboarding.comingSoon"
  | "onboarding.default"
  | "onboarding.selectModelRequired"
  | "onboarding.searchModels"
  | "onboarding.noModelsDiscovered"
  | "onboarding.model"
  | "onboarding.adapterEnvironmentCheck"
  | "onboarding.adapterEnvironmentCheckDescription"
  | "onboarding.testNow"
  | "onboarding.testing"
  | "onboarding.passed"
  | "onboarding.warnings"
  | "onboarding.failed"
  | "onboarding.manualDebug"
  | "onboarding.unsetAnthropicApiKey"
  | "onboarding.retrying"
  | "onboarding.gatewayUrl"
  | "onboarding.webhookUrl"
  | "onboarding.giveItSomethingToDo"
  | "onboarding.giveAgentSmallTask"
  | "onboarding.taskTitle"
  | "onboarding.taskTitlePlaceholder"
  | "onboarding.descriptionOptional"
  | "onboarding.descriptionPlaceholder"
  | "onboarding.readyToLaunch"
  | "onboarding.everythingSetUp"
  | "onboarding.back"
  | "onboarding.next"
  | "onboarding.creating"
  | "onboarding.createAndOpenIssue"
  | "onboarding.createOrSelectCompanyFirst"
  | "onboarding.adapterEnvironmentTestFailed"
  | "onboarding.failedToCreateCompany"
  | "onboarding.failedToLoadOpenCodeModels"
  | "onboarding.failedToCreateAgent"
  | "onboarding.openCodeRequiresExplicitModel"
  | "onboarding.openCodeModelsLoading"
  | "onboarding.noOpenCodeModelsDiscovered"
  | "onboarding.configuredOpenCodeModelUnavailable"
  | "onboarding.retryWithUnsetAnthropicApiKeyFailed"
  | "onboarding.failedToUnsetAndRetry"
  | "onboarding.failedToCreateTask"
  | "onboarding.taskDescriptionPlaceholder";

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
      "No instance admin exists yet. A bootstrap invite is already active. Check your 锐捷网络-数字员工平台 startup logs for the first admin invite URL, or run this command to rotate it:",
    "app.bootstrapPending.noInvite":
      "No instance admin exists yet. Run this command in your 锐捷网络-数字员工平台 environment to generate the first admin invite URL:",
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
      "Choose how 锐捷网络-数字员工平台 renders copy, labels, and interface text across the board UI.",
    "settings.general.languageHelp":
      "Use System default to follow each operator browser, or pin the UI to a single language for the whole instance.",
    "settings.general.timeZoneTitle": "Time zone",
    "settings.general.timeZoneDescription":
      "Control how schedules and timestamps are formatted in operator-visible surfaces.",
    "settings.general.timeZoneHelp":
      "Use System default to follow the current browser time zone, or pin the instance to a single zone such as Asia/Shanghai.",
    "settings.general.currencyTitle": "Currency",
    "settings.general.currencyDescription":
      "Set the default currency used when 锐捷网络-数字员工平台 displays costs, budgets, and spend summaries.",
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
      "Control whether thumbs up and thumbs down votes can send the voted AI output to 锐捷网络-数字员工平台 Labs. Votes are always saved locally.",
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
      "Sign out of this 锐捷网络-数字员工平台 instance. You will be redirected to the login page.",
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
    "auth.loading": "Loading…",
    "auth.signInTitle": "Sign in to 锐捷网络",
    "auth.signUpTitle": "Create your 锐捷网络 account",
    "auth.signInDescription": "Use your email and password to access this instance.",
    "auth.signUpDescription": "Create an account for this instance. Email confirmation is not required in v1.",
    "auth.fillRequiredFields": "Please fill in all required fields.",
    "auth.name": "Name",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.working": "Working…",
    "auth.signIn": "Sign In",
    "auth.createAccount": "Create Account",
    "auth.needAccount": "Need an account?",
    "auth.haveAccount": "Already have an account?",
    "auth.createOne": "Create one",
    "auth.signInLink": "Sign in",
    "auth.authenticationFailed": "Authentication failed",
    "onboarding.close": "Close",
    "onboarding.stepCompany": "Company",
    "onboarding.stepAgent": "Agent",
    "onboarding.stepTask": "Task",
    "onboarding.stepLaunch": "Launch",
    "onboarding.nameYourCompany": "Name your company",
    "onboarding.companyDescription": "This is the organization your agents will work for.",
    "onboarding.companyName": "Company name",
    "onboarding.companyNamePlaceholder": "Acme Corp",
    "onboarding.missionGoalOptional": "Mission / goal (optional)",
    "onboarding.missionGoalPlaceholder": "What is this company trying to achieve?",
    "onboarding.createFirstAgent": "Create your first agent",
    "onboarding.agentDescription": "Choose how this agent will run tasks.",
    "onboarding.agentName": "Agent name",
    "onboarding.agentNamePlaceholder": "CEO",
    "onboarding.adapterType": "Adapter type",
    "onboarding.recommended": "Recommended",
    "onboarding.moreAgentAdapterTypes": "More Agent Adapter Types",
    "onboarding.comingSoon": "Coming soon",
    "onboarding.default": "Default",
    "onboarding.selectModelRequired": "Select model (required)",
    "onboarding.searchModels": "Search models...",
    "onboarding.noModelsDiscovered": "No models discovered.",
    "onboarding.model": "Model",
    "onboarding.adapterEnvironmentCheck": "Adapter environment check",
    "onboarding.adapterEnvironmentCheckDescription": "Runs a live probe that asks the adapter CLI to respond with hello.",
    "onboarding.testNow": "Test now",
    "onboarding.testing": "Testing...",
    "onboarding.passed": "Passed",
    "onboarding.warnings": "Warnings",
    "onboarding.failed": "Failed",
    "onboarding.manualDebug": "Manual debug",
    "onboarding.unsetAnthropicApiKey": "Unset ANTHROPIC_API_KEY",
    "onboarding.retrying": "Retrying...",
    "onboarding.gatewayUrl": "Gateway URL",
    "onboarding.webhookUrl": "Webhook URL",
    "onboarding.giveItSomethingToDo": "Give it something to do",
    "onboarding.giveAgentSmallTask": "Give your agent a small task to start with — a bug fix, a research question, writing a script.",
    "onboarding.taskTitle": "Task title",
    "onboarding.taskTitlePlaceholder": "e.g. Research competitor pricing",
    "onboarding.descriptionOptional": "Description (optional)",
    "onboarding.descriptionPlaceholder": "Add more detail about what the agent should do...",
    "onboarding.readyToLaunch": "Ready to launch",
    "onboarding.everythingSetUp": "Everything is set up. Launching now will create the starter task, wake the agent, and open the issue.",
    "onboarding.back": "Back",
    "onboarding.next": "Next",
    "onboarding.creating": "Creating...",
    "onboarding.createAndOpenIssue": "Create & Open Issue",
    "onboarding.createOrSelectCompanyFirst": "Create or select a company before testing adapter environment.",
    "onboarding.adapterEnvironmentTestFailed": "Adapter environment test failed",
    "onboarding.failedToCreateCompany": "Failed to create company",
    "onboarding.failedToLoadOpenCodeModels": "Failed to load OpenCode models.",
    "onboarding.failedToCreateAgent": "Failed to create agent",
    "onboarding.openCodeRequiresExplicitModel": "OpenCode requires an explicit model in provider/model format.",
    "onboarding.openCodeModelsLoading": "OpenCode models are still loading. Please wait and try again.",
    "onboarding.noOpenCodeModelsDiscovered": "No OpenCode models discovered. Run `opencode models` and authenticate providers.",
    "onboarding.configuredOpenCodeModelUnavailable": "Configured OpenCode model is unavailable: {model}",
    "onboarding.retryWithUnsetAnthropicApiKeyFailed": "Retried with ANTHROPIC_API_KEY unset in adapter config, but the environment test is still failing.",
    "onboarding.failedToUnsetAndRetry": "Failed to unset ANTHROPIC_API_KEY and retry.",
    "onboarding.failedToCreateTask": "Failed to create task",
    "onboarding.taskDescriptionPlaceholder": "You are the CEO. You set the direction for the company.\n\n- hire a founding engineer\n- write a hiring plan\n- break the roadmap into concrete tasks and start delegating work",
    "invite.invalidToken": "Invalid invite token.",
    "invite.loading": "Loading invite...",
    "invite.notAvailable": "Invite not available",
    "invite.expiredOrRevoked": "This invite may be expired, revoked, or already used.",
    "invite.bootstrapComplete": "Bootstrap complete",
    "invite.bootstrapCompleteDescription": "The first instance admin is now configured. You can continue to the board.",
    "invite.openBoard": "Open board",
    "invite.joinRequestSubmitted": "Join request submitted",
    "invite.pendingApproval": "Your request is pending admin approval. You will not have access until approved.",
    "invite.requestId": "Request ID:",
    "invite.claimSecret": "One-time claim secret (save now)",
    "invite.paperclipSkillBootstrap": "锐捷网络-数字员工平台 skill bootstrap",
    "invite.installTo": "Install to",
    "invite.agentOnboardingText": "Agent-readable onboarding text",
    "invite.connectivityDiagnostics": "Connectivity diagnostics",
    "invite.bootstrapInstance": "Bootstrap your 锐捷网络-数字员工平台 instance",
    "invite.joinCompany": "Join {company}",
    "invite.joinThisCompany": "Join this 锐捷网络-数字员工平台 company",
    "invite.invitedToJoin": "You were invited to join {company}.",
    "invite.expiresAt": "Invite expires {dateTime}.",
    "invite.joinAsHuman": "Join as human",
    "invite.joinAsAgent": "Join as agent",
    "invite.agentName": "Agent name",
    "invite.adapterType": "Adapter type",
    "invite.capabilitiesOptional": "Capabilities (optional)",
    "invite.comingSoon": "Coming soon",
    "invite.signInRequired": "Sign in or create an account before submitting a human join request.",
    "invite.signInCreateAccount": "Sign in / Create account",
    "invite.submitting": "Submitting…",
    "invite.acceptBootstrapInvite": "Accept bootstrap invite",
    "invite.submitJoinRequest": "Submit join request",
    "cli.invalidUrl": "Invalid CLI auth URL.",
    "cli.loadingChallenge": "Loading CLI auth challenge...",
    "cli.challengeUnavailable": "CLI auth challenge unavailable",
    "cli.challengeInvalidOrExpired": "Challenge is invalid or expired.",
    "cli.accessApproved": "CLI access approved",
    "cli.canFinishAuth": "The 锐捷网络-数字员工平台 CLI can now finish authentication on the requesting machine.",
    "cli.command": "Command",
    "cli.challengeExpired": "CLI auth challenge expired",
    "cli.challengeCancelled": "CLI auth challenge cancelled",
    "cli.startAgain": "Start the CLI auth flow again from your terminal to generate a new approval request.",
    "cli.signInRequired": "Sign in required",
    "cli.signInToApprove": "Sign in or create an account, then return to this page to approve the CLI access request.",
    "cli.signInCreateAccount": "Sign in / Create account",
    "cli.approveAccess": "Approve 锐捷网络-数字员工平台 CLI access",
    "cli.requestingBoardAccess": "A local 锐捷网络-数字员工平台 CLI process is requesting board access to this instance.",
    "cli.client": "Client",
    "cli.requestedAccess": "Requested access",
    "cli.requestedCompany": "Requested company",
    "cli.instanceAdmin": "Instance admin",
    "cli.board": "Board",
    "cli.requiresInstanceAdmin": "This challenge requires instance-admin access. Sign in with an instance admin account to approve it.",
    "cli.approve": "Approve CLI access",
    "cli.approving": "Approving...",
    "cli.cancel": "Cancel",
    "cli.cancelling": "Cancelling...",
    "cli.failedUpdate": "Failed to update CLI auth challenge",
    "notFound.breadcrumb": "Not Found",
    "notFound.companyNotFound": "Company not found",
    "notFound.pageNotFound": "Page not found",
    "notFound.noCompanyMatches": 'No company matches prefix "{prefix}".',
    "notFound.routeNotExist": "This route does not exist.",
    "notFound.requestedPath": "Requested path:",
    "notFound.openDashboard": "Open dashboard",
    "notFound.goHome": "Go home",
    "board.invalidClaimUrl": "Invalid board claim URL.",
    "board.loadingClaim": "Loading claim challenge...",
    "board.claimUnavailable": "Claim challenge unavailable",
    "board.challengeInvalidOrExpired": "Challenge is invalid or expired.",
    "board.ownershipClaimed": "Board ownership claimed",
    "board.linkedToUser": "This instance is now linked to your authenticated user.",
    "board.openBoard": "Open board",
    "board.signInRequired": "Sign in required",
    "board.signInToClaim": "Sign in or create an account, then return to this page to claim Board ownership.",
    "board.signInCreateAccount": "Sign in / Create account",
    "board.claimOwnership": "Claim Board ownership",
    "board.promoteToAdmin": "This will promote your user to instance admin and migrate company ownership access from local trusted mode.",
    "board.failedToClaim": "Failed to claim board ownership",
    "board.claiming": "Claiming…",
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
      "当前还没有实例管理员，但已经存在一个初始化邀请。请查看锐捷网络-数字员工平台启动日志中的首个管理员邀请链接，或运行下面的命令重新生成：",
    "app.bootstrapPending.noInvite":
      "当前还没有实例管理员。请在锐捷网络-数字员工平台运行环境中执行下面的命令，生成首个管理员邀请链接：",
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
      "设置锐捷网络-数字员工平台展示成本、预算和花费汇总时使用的默认币种。",
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
      "控制点赞/点踩时，是否可以把被投票的 AI 输出同步给锐捷网络-数字员工平台 Labs。投票始终会保存在本地。",
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
      "退出当前锐捷网络-数字员工平台实例登录，随后会跳转到登录页。",
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
    "auth.loading": "加载中…",
    "auth.signInTitle": "登录到锐捷网络",
    "auth.signUpTitle": "创建锐捷网络账号",
    "auth.signInDescription": "使用邮箱和密码访问此实例。",
    "auth.signUpDescription": "为此实例创建账号。v1 版本无需邮箱验证。",
    "auth.fillRequiredFields": "请填写所有必填项。",
    "auth.name": "姓名",
    "auth.email": "邮箱",
    "auth.password": "密码",
    "auth.working": "处理中…",
    "auth.signIn": "登录",
    "auth.createAccount": "创建账号",
    "auth.needAccount": "还没有账号？",
    "auth.haveAccount": "已有账号？",
    "auth.createOne": "立即注册",
    "auth.signInLink": "登录",
    "auth.authenticationFailed": "认证失败",
    "onboarding.close": "关闭",
    "onboarding.stepCompany": "公司",
    "onboarding.stepAgent": "Agent",
    "onboarding.stepTask": "任务",
    "onboarding.stepLaunch": "启动",
    "onboarding.nameYourCompany": "为公司命名",
    "onboarding.companyDescription": "这是您的 Agent 将为之工作的组织。",
    "onboarding.companyName": "公司名称",
    "onboarding.companyNamePlaceholder": "示例公司",
    "onboarding.missionGoalOptional": "使命 / 目标（可选）",
    "onboarding.missionGoalPlaceholder": "这家公司想要实现什么？",
    "onboarding.createFirstAgent": "创建您的第一个 Agent",
    "onboarding.agentDescription": "选择此 Agent 将如何运行任务。",
    "onboarding.agentName": "Agent 名称",
    "onboarding.agentNamePlaceholder": "CEO",
    "onboarding.adapterType": "适配器类型",
    "onboarding.recommended": "推荐",
    "onboarding.moreAgentAdapterTypes": "更多 Agent 适配器类型",
    "onboarding.comingSoon": "即将推出",
    "onboarding.default": "默认",
    "onboarding.selectModelRequired": "选择模型（必填）",
    "onboarding.searchModels": "搜索模型...",
    "onboarding.noModelsDiscovered": "未发现模型。",
    "onboarding.model": "模型",
    "onboarding.adapterEnvironmentCheck": "适配器环境检查",
    "onboarding.adapterEnvironmentCheckDescription": "运行一个实时探测，让适配器 CLI 响应 hello。",
    "onboarding.testNow": "立即测试",
    "onboarding.testing": "测试中...",
    "onboarding.passed": "通过",
    "onboarding.warnings": "警告",
    "onboarding.failed": "失败",
    "onboarding.manualDebug": "手动调试",
    "onboarding.unsetAnthropicApiKey": "取消设置 ANTHROPIC_API_KEY",
    "onboarding.retrying": "重试中...",
    "onboarding.gatewayUrl": "网关 URL",
    "onboarding.webhookUrl": "Webhook URL",
    "onboarding.giveItSomethingToDo": "给它分配任务",
    "onboarding.giveAgentSmallTask": "给您的 Agent 一个小任务开始——比如修复一个 bug、调研一个问题、编写一个脚本。",
    "onboarding.taskTitle": "任务标题",
    "onboarding.taskTitlePlaceholder": "例如：调研竞品定价",
    "onboarding.descriptionOptional": "描述（可选）",
    "onboarding.descriptionPlaceholder": "添加更多关于 Agent 应该做什么的细节...",
    "onboarding.readyToLaunch": "准备启动",
    "onboarding.everythingSetUp": "一切已就绪。立即启动将创建起始任务、唤醒 Agent 并打开任务单。",
    "onboarding.back": "返回",
    "onboarding.next": "下一步",
    "onboarding.creating": "创建中...",
    "onboarding.createAndOpenIssue": "创建并打开任务",
    "onboarding.createOrSelectCompanyFirst": "创建或选择公司后再测试适配器环境。",
    "onboarding.adapterEnvironmentTestFailed": "适配器环境测试失败",
    "onboarding.failedToCreateCompany": "创建公司失败",
    "onboarding.failedToLoadOpenCodeModels": "加载 OpenCode 模型失败。",
    "onboarding.failedToCreateAgent": "创建 Agent 失败",
    "onboarding.openCodeRequiresExplicitModel": "OpenCode 需要明确的 provider/model 格式模型。",
    "onboarding.openCodeModelsLoading": "OpenCode 模型仍在加载中。请稍后重试。",
    "onboarding.noOpenCodeModelsDiscovered": "未发现 OpenCode 模型。运行 `opencode models` 并验证提供商身份。",
    "onboarding.configuredOpenCodeModelUnavailable": "配置的 OpenCode 模型不可用：{model}",
    "onboarding.retryWithUnsetAnthropicApiKeyFailed": "已在适配器配置中取消设置 ANTHROPIC_API_KEY 后重试，但环境测试仍然失败。",
    "onboarding.failedToUnsetAndRetry": "取消设置 ANTHROPIC_API_KEY 并重试失败。",
    "onboarding.failedToCreateTask": "创建任务失败",
    "onboarding.taskDescriptionPlaceholder": "你是 CEO。你为公司指明方向。\n\n- 招聘一名创始工程师\n- 制定招聘计划\n- 将路线图分解为具体任务并开始委派工作",
    "invite.invalidToken": "邀请无效。",
    "invite.loading": "正在加载邀请…",
    "invite.notAvailable": "邀请不可用",
    "invite.expiredOrRevoked": "此邀请可能已过期、已撤销或已使用。",
    "invite.bootstrapComplete": "初始化完成",
    "invite.bootstrapCompleteDescription": "首个实例管理员已配置完成。你可以继续使用看板了。",
    "invite.openBoard": "打开看板",
    "invite.joinRequestSubmitted": "加入请求已提交",
    "invite.pendingApproval": "你的请求正在等待管理员审批。在审批通过之前你将无法访问。",
    "invite.requestId": "请求 ID：",
    "invite.claimSecret": "一次性认领密钥（请立即保存）",
    "invite.paperclipSkillBootstrap": "锐捷网络-数字员工平台技能引导",
    "invite.installTo": "安装到",
    "invite.agentOnboardingText": "Agent 可读的引导文本",
    "invite.connectivityDiagnostics": "连接诊断",
    "invite.bootstrapInstance": "初始化你的锐捷网络-数字员工平台实例",
    "invite.joinCompany": "加入 {company}",
    "invite.joinThisCompany": "加入此锐捷网络-数字员工平台公司",
    "invite.invitedToJoin": "你被邀请加入 {company}。",
    "invite.expiresAt": "邀请将在 {dateTime} 过期。",
    "invite.joinAsHuman": "作为人类加入",
    "invite.joinAsAgent": "作为 Agent 加入",
    "invite.agentName": "Agent 名称",
    "invite.adapterType": "适配器类型",
    "invite.capabilitiesOptional": "能力（可选）",
    "invite.comingSoon": "即将推出",
    "invite.signInRequired": "提交人工加入请求前请先登录或创建账号。",
    "invite.signInCreateAccount": "登录 / 创建账号",
    "invite.submitting": "提交中…",
    "invite.acceptBootstrapInvite": "接受初始化邀请",
    "invite.submitJoinRequest": "提交加入请求",
    "cli.invalidUrl": "CLI 认证 URL 无效。",
    "cli.loadingChallenge": "正在加载 CLI 认证挑战…",
    "cli.challengeUnavailable": "CLI 认证挑战不可用",
    "cli.challengeInvalidOrExpired": "挑战无效或已过期。",
    "cli.accessApproved": "CLI 访问已批准",
    "cli.canFinishAuth": "锐捷网络-数字员工平台 CLI 现可以在请求的机器上完成认证。",
    "cli.command": "命令",
    "cli.challengeExpired": "CLI 认证挑战已过期",
    "cli.challengeCancelled": "CLI 认证挑战已取消",
    "cli.startAgain": "请从终端重新启动 CLI 认证流程以生成新的批准请求。",
    "cli.signInRequired": "需要登录",
    "cli.signInToApprove": "请登录或创建账号，然后返回此页面批准 CLI 访问请求。",
    "cli.signInCreateAccount": "登录 / 创建账号",
    "cli.approveAccess": "批准锐捷网络-数字员工平台 CLI 访问",
    "cli.requestingBoardAccess": "本地锐捷网络-数字员工平台 CLI 进程正在请求访问此实例的看板。",
    "cli.client": "客户端",
    "cli.requestedAccess": "请求的访问权限",
    "cli.requestedCompany": "请求的公司",
    "cli.instanceAdmin": "实例管理员",
    "cli.board": "看板",
    "cli.requiresInstanceAdmin": "此挑战需要实例管理员权限。请使用实例管理员账号登录以批准。",
    "cli.approve": "批准 CLI 访问",
    "cli.approving": "正在批准…",
    "cli.cancel": "取消",
    "cli.cancelling": "正在取消…",
    "cli.failedUpdate": "更新 CLI 认证挑战失败",
    "notFound.breadcrumb": "未找到",
    "notFound.companyNotFound": "公司未找到",
    "notFound.pageNotFound": "页面未找到",
    "notFound.noCompanyMatches": "没有匹配前缀 \"{prefix}\" 的公司。",
    "notFound.routeNotExist": "此路由不存在。",
    "notFound.requestedPath": "请求的路径：",
    "notFound.openDashboard": "打开仪表板",
    "notFound.goHome": "返回首页",
    "board.invalidClaimUrl": "看板认领 URL 无效。",
    "board.loadingClaim": "正在加载认领挑战…",
    "board.claimUnavailable": "认领挑战不可用",
    "board.challengeInvalidOrExpired": "挑战无效或已过期。",
    "board.ownershipClaimed": "看板所有权已认领",
    "board.linkedToUser": "此实例现已关联到你的认证用户。",
    "board.openBoard": "打开看板",
    "board.signInRequired": "需要登录",
    "board.signInToClaim": "请登录或创建账号，然后返回此页面认领看板所有权。",
    "board.signInCreateAccount": "登录 / 创建账号",
    "board.claimOwnership": "认领看板所有权",
    "board.promoteToAdmin": "这将把你的用户提升为实例管理员，并从本地信任模式迁移公司所有权访问权限。",
    "board.failedToClaim": "认领看板所有权失败",
    "board.claiming": "正在认领…",
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
  t: (key, values) => interpolate(messages.en[key], values),
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
