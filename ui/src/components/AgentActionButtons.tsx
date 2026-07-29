import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "@/lib/router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pause,
  Play,
  Plus,
  MoreHorizontal,
  Loader2,
  Copy,
  RotateCcw,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "../context/LocaleContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AgentStatusBadge } from "./StatusBadge";
import { agentsApi } from "../api/agents";
import { ApiError } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { agentRouteRef } from "../lib/utils";
import { useDialogActions } from "../context/DialogContext";
import { useToastActions } from "../context/ToastContext";
import {
  buildDuplicateAgentPayload,
  duplicateAgentName,
  type DuplicateInstructionsBundle,
} from "../lib/duplicate-agent-payload";
import type {
  Agent,
  AgentInstructionsBundle,
  AgentInstructionsFileSummary,
  HeartbeatRun,
} from "@paperclipai/shared";

export function RunButton({
  onClick,
  disabled,
  label,
  size = "sm",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "default";
}) {
  const { locale } = useLocale();
  const resolvedLabel = label ?? (locale === "zh-CN" ? "立即运行" : "Run now");
  return (
    <Button variant="outline" size={size} onClick={onClick} disabled={disabled}>
      <Play className="h-3.5 w-3.5 sm:mr-1" />
      <span className="hidden sm:inline">{resolvedLabel}</span>
    </Button>
  );
}

export function PauseResumeButton({
  isPaused,
  onPause,
  onResume,
  disabled,
  size = "sm",
}: {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  disabled?: boolean;
  size?: "sm" | "default";
}) {
  const { locale } = useLocale();
  if (isPaused) {
    return (
      <Button variant="outline" size={size} onClick={onResume} disabled={disabled}>
        <Play className="h-3.5 w-3.5 sm:mr-1" />
        <span className="hidden sm:inline">{locale === "zh-CN" ? "继续" : "Resume"}</span>
      </Button>
    );
  }

  return (
    <Button variant="outline" size={size} onClick={onPause} disabled={disabled}>
      <Pause className="h-3.5 w-3.5 sm:mr-1" />
      <span className="hidden sm:inline">{locale === "zh-CN" ? "暂停" : "Pause"}</span>
    </Button>
  );
}

export function ClearErrorButton({
  onClick,
  disabled,
  size = "sm",
}: {
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "default";
}) {
  return (
    <Button
      variant="outline"
      size={size}
      onClick={onClick}
      disabled={disabled}
      className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/50"
      aria-label="Clear error and return agent to idle"
    >
      <CheckCircle2 className="h-3.5 w-3.5 sm:mr-1" />
      <span className="hidden sm:inline">Clear error</span>
    </Button>
  );
}

function duplicateInstructionFilePath(
  _bundle: AgentInstructionsBundle,
  summary: AgentInstructionsFileSummary,
): string | null {
  if (summary.deprecated || summary.virtual) return null;
  return summary.path;
}

export async function loadDuplicateInstructionsBundle(
  agentId: string,
  companyId?: string,
): Promise<DuplicateInstructionsBundle | null> {
  const bundle = await agentsApi.instructionsBundle(agentId, companyId);
  const files: Record<string, string> = {};

  for (const summary of bundle.files) {
    const path = duplicateInstructionFilePath(bundle, summary);
    if (!path) continue;
    const file = await agentsApi.instructionsFile(agentId, summary.path, companyId);
    files[path] = file.content;
  }

  const entryFile = Object.prototype.hasOwnProperty.call(files, bundle.entryFile)
    ? bundle.entryFile
    : Object.keys(files)[0] ?? "AGENTS.md";
  return Object.keys(files).length > 0 ? { entryFile, files } : null;
}

/**
 * Shared agent action cluster used by both the agent detail header and the
 * agents list rows. Encapsulates the invoke / pause / resume / terminate /
 * duplicate / reset-session mutations so callers do not diverge in behavior.
 */
export function AgentActionButtons({
  agent,
  companyId,
  size = "sm",
  assignLabel,
  runLabel,
  showStatus = true,
  actionsDisabled = false,
  workActionsDisabled = false,
  workActionsDisabledReason,
  navigateToRunOnInvoke = true,
  onActionError,
  onTerminateSuccess,
  pauseConfirm,
  hideTerminate = false,
  children,
  className,
}: {
  agent: Agent;
  companyId?: string | null;
  size?: "sm" | "default";
  assignLabel?: string;
  runLabel?: string;
  showStatus?: boolean;
  actionsDisabled?: boolean;
  workActionsDisabled?: boolean;
  workActionsDisabledReason?: string;
  navigateToRunOnInvoke?: boolean;
  /**
   * When set, pausing prompts a confirmation dialog first (e.g. for built-in
   * agents that power a feature). Omit for the immediate-pause default.
   */
  pauseConfirm?: { title: string; description: ReactNode };
  /** Hide the Terminate action (e.g. built-in agents are undeletable). */
  hideTerminate?: boolean;
  /**
   * Optional inline error reporter. When provided it is used instead of a toast
   * for action failures (preserves the detail page's inline error banner). When
   * omitted, failures surface as toasts (used by the list view).
   */
  onActionError?: (message: string | null) => void;
  /** Called after termination succeeds so callers can leave now-hidden detail routes. */
  onTerminateSuccess?: (agent: Agent) => void;
  /** Extra content rendered just before the overflow menu (e.g. live-run link). */
  children?: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale } = useLocale();
  const { openNewIssue } = useDialogActions();
  const { pushToast } = useToastActions();
  const [moreOpen, setMoreOpen] = useState(false);
  const copy =
    locale === "zh-CN"
      ? {
        actionFailed: "操作失败",
        assignTask: "分配任务",
        copyAgentId: "复制智能体 ID",
        couldNotDuplicateAgent: "无法复制智能体",
        duplicateAgent: "复制智能体",
        duplicateConfirm: (name: string, nextName: string) => `将 ${name} 复制为 ${nextName}？`,
        duplicated: "智能体已复制",
        failedToDuplicateAgent: "复制智能体失败",
        failedToResetSession: "重置会话失败",
        notReadyToDuplicate: "智能体尚未准备好复制",
        openActions: (name: string) => `打开 ${name} 的操作菜单`,
        resetSessions: "重置会话",
        terminate: "终止",
      }
      : {
        actionFailed: "Action failed",
        assignTask: "Assign Task",
        copyAgentId: "Copy Agent ID",
        couldNotDuplicateAgent: "Could not duplicate agent",
        duplicateAgent: "Duplicate Agent",
        duplicateConfirm: (name: string, nextName: string) => `Duplicate ${name} as ${nextName}?`,
        duplicated: "Agent duplicated",
        failedToDuplicateAgent: "Failed to duplicate agent",
        failedToResetSession: "Failed to reset session",
        notReadyToDuplicate: "Agent is not ready to duplicate",
        openActions: (name: string) => `Open actions for ${name}`,
        resetSessions: "Reset Sessions",
        terminate: "Terminate",
      };
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);

  const resolvedCompanyId = companyId ?? agent.companyId;
  const canonicalAgentRef = agentRouteRef(agent);
  const isPaused = agent.status === "paused";
  const isError = agent.status === "error";

  const reportError = useCallback(
    (message: string) => {
      if (onActionError) {
        onActionError(message);
      } else {
        pushToast({ title: copy.actionFailed, body: message, tone: "error" });
      }
    },
    [copy.actionFailed, onActionError, pushToast],
  );

  const invalidateAgent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(canonicalAgentRef) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.runtimeState(agent.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.taskSessions(agent.id) });
    if (resolvedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(resolvedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(resolvedCompanyId, agent.id) });
    }
  }, [agent.id, canonicalAgentRef, queryClient, resolvedCompanyId]);

  const agentAction = useMutation({
    mutationFn: async (action: "invoke" | "pause" | "resume" | "clear_error" | "approve" | "terminate") => {
      switch (action) {
        case "invoke": return agentsApi.invoke(agent.id, resolvedCompanyId ?? undefined);
        case "pause": return agentsApi.pause(agent.id, resolvedCompanyId ?? undefined);
        case "resume": return agentsApi.resume(agent.id, resolvedCompanyId ?? undefined);
        case "clear_error": return agentsApi.clearError(agent.id, resolvedCompanyId ?? undefined);
        case "approve": return agentsApi.approve(agent.id, resolvedCompanyId ?? undefined);
        case "terminate": return agentsApi.terminate(agent.id, resolvedCompanyId ?? undefined);
      }
    },
    onSuccess: (data, action) => {
      onActionError?.(null);
      invalidateAgent();
      if (action === "terminate") {
        onTerminateSuccess?.(data as Agent);
      }
      if (action === "invoke" && navigateToRunOnInvoke && data && typeof data === "object" && "id" in data) {
        navigate(`/agents/${canonicalAgentRef}/runs/${(data as HeartbeatRun).id}`);
      }
    },
    onError: (err) => {
      reportError(err instanceof Error ? err.message : "Action failed");
    },
  });

  const duplicateAgent = useMutation({
    mutationFn: async () => {
      if (!resolvedCompanyId) {
        throw new Error(copy.notReadyToDuplicate);
      }
      const instructionsBundle = await loadDuplicateInstructionsBundle(agent.id, resolvedCompanyId);
      const payload = buildDuplicateAgentPayload(agent, instructionsBundle);
      try {
        return await agentsApi.create(resolvedCompanyId, payload);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.message.includes("requires board approval")) {
          const hire = await agentsApi.hire(resolvedCompanyId, payload);
          return hire.agent;
        }
        throw error;
      }
    },
    onSuccess: async (createdAgent) => {
      onActionError?.(null);
      if (resolvedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
      }
      pushToast({ title: copy.duplicated, body: createdAgent.name, tone: "success" });
      navigate(`/agents/${agentRouteRef(createdAgent)}/dashboard`);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : copy.failedToDuplicateAgent;
      onActionError?.(message);
      pushToast({ title: copy.couldNotDuplicateAgent, body: message, tone: "error" });
    },
  });

  const handleDuplicateAgent = useCallback(() => {
    if (duplicateAgent.isPending) return;
    const nextName = duplicateAgentName(agent.name);
    const confirmed = window.confirm(copy.duplicateConfirm(agent.name, nextName));
    setMoreOpen(false);
    if (!confirmed) return;
    duplicateAgent.mutate();
  }, [agent.name, copy, duplicateAgent]);

  const resetTaskSession = useMutation({
    mutationFn: () => agentsApi.resetSession(agent.id, null, resolvedCompanyId ?? undefined),
    onSuccess: () => {
      onActionError?.(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.runtimeState(agent.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.taskSessions(agent.id) });
    },
    onError: (err) => {
      reportError(err instanceof Error ? err.message : copy.failedToResetSession);
    },
  });

  const isPendingApproval = agent.status === "pending_approval";
  const disabled = actionsDisabled || agentAction.isPending;
  const assignAndRunDisabled = disabled || isPendingApproval || workActionsDisabled;
  const pauseResumeDisabled = disabled || isPendingApproval || (isPaused && workActionsDisabled);
  const clearErrorDisabled = disabled;

  return (
    <div className={className ?? "flex items-center gap-1 sm:gap-2 shrink-0"}>
      <Button
        variant="outline"
        size={size}
        onClick={() => openNewIssue({ assigneeAgentId: agent.id })}
        disabled={assignAndRunDisabled}
        title={workActionsDisabled ? workActionsDisabledReason : undefined}
      >
        <Plus className="h-3.5 w-3.5 sm:mr-1" />
        <span className="hidden sm:inline">{assignLabel ?? copy.assignTask}</span>
      </Button>
      <RunButton
        onClick={() => agentAction.mutate("invoke")}
        disabled={assignAndRunDisabled}
        label={runLabel}
        size={size}
      />
      {isError ? (
        <ClearErrorButton
          onClick={() => agentAction.mutate("clear_error")}
          disabled={clearErrorDisabled}
          size={size}
        />
      ) : (
        <PauseResumeButton
          isPaused={isPaused}
          onPause={() => (pauseConfirm ? setPauseConfirmOpen(true) : agentAction.mutate("pause"))}
          onResume={() => agentAction.mutate("resume")}
          disabled={pauseResumeDisabled}
          size={size}
        />
      )}
      {pauseConfirm && (
        <AlertDialog open={pauseConfirmOpen} onOpenChange={setPauseConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pauseConfirm.title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>{pauseConfirm.description}</div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => agentAction.mutate("pause")}>
                Pause anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {showStatus && (
        <span className="hidden sm:inline">
          <AgentStatusBadge status={agent.status} />
        </span>
      )}
      {children}
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={copy.openActions(agent.name)}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" align="end">
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
            disabled={duplicateAgent.isPending}
            onClick={handleDuplicateAgent}
          >
            {duplicateAgent.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copy.duplicateAgent}
          </button>
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
            onClick={() => {
              navigator.clipboard.writeText(agent.id);
              setMoreOpen(false);
            }}
          >
            <Copy className="h-3 w-3" />
            {copy.copyAgentId}
          </button>
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
            onClick={() => {
              resetTaskSession.mutate();
              setMoreOpen(false);
            }}
          >
            <RotateCcw className="h-3 w-3" />
            {copy.resetSessions}
          </button>
          {!hideTerminate && (
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-destructive"
              onClick={() => {
                agentAction.mutate("terminate");
                setMoreOpen(false);
              }}
            >
              <Trash2 className="h-3 w-3" />
              {copy.terminate}
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
