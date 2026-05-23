// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewAgentDialog } from "./NewAgentDialog";

const createCompanyInviteMock = vi.hoisted(() => vi.fn());
const getInviteOnboardingMock = vi.hoisted(() => vi.fn());
const listAgentsMock = vi.hoisted(() => vi.fn());
const listAdaptersMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const closeNewAgentMock = vi.hoisted(() => vi.fn());
const openNewIssueMock = vi.hoisted(() => vi.fn());
const pushToastMock = vi.hoisted(() => vi.fn());
const clipboardWriteTextMock = vi.hoisted(() => vi.fn());
const localeState = vi.hoisted(() => ({
  locale: "zh-CN",
}));

vi.mock("@/lib/router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("../context/DialogContext", () => ({
  useDialog: () => ({
    newAgentOpen: true,
    closeNewAgent: closeNewAgentMock,
    openNewIssue: openNewIssueMock,
  }),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "company-1",
  }),
}));

vi.mock("../context/LocaleContext", () => ({
  useLocale: () => ({
    locale: localeState.locale,
    t: (key: string) => key,
  }),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ pushToast: pushToastMock }),
}));

vi.mock("../api/access", () => ({
  accessApi: {
    createCompanyInvite: (companyId: string, input: unknown) =>
      createCompanyInviteMock(companyId, input),
    getInviteOnboarding: (token: string) => getInviteOnboardingMock(token),
  },
}));

vi.mock("../api/agents", () => ({
  agentsApi: {
    list: (companyId: string) => listAgentsMock(companyId),
  },
}));

vi.mock("../api/adapters", () => ({
  adaptersApi: {
    list: () => listAdaptersMock(),
  },
}));

vi.mock("../adapters", () => ({
  listUIAdapters: () => [{ type: "claude_local" }, { type: "openclaw_gateway" }],
}));

vi.mock("../adapters/metadata", () => ({
  isVisualAdapterChoice: (type: string) => type !== "openclaw_gateway",
}));

vi.mock("../adapters/use-disabled-adapters", () => ({
  useDisabledAdaptersSync: () => new Set<string>(),
}));

vi.mock("../adapters/adapter-display-registry", () => ({
  getAdapterDisplay: (_type: string, locale?: string | null) => ({
    label: "Claude",
    description: locale === "zh-CN" ? "本地 Claude Agent" : "Local Claude agent",
    icon: () => null,
    recommended: true,
    comingSoon: false,
    disabledLabel: undefined,
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({
    children,
    showCloseButton: _showCloseButton,
    ...props
  }: ComponentProps<"div"> & { showCloseButton?: boolean }) => <div {...props}>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, type = "button", ...props }: ComponentProps<"button">) => (
    <button type={type} onClick={onClick} {...props}>{children}</button>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function renderDialog(container: HTMLDivElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <NewAgentDialog />
      </QueryClientProvider>,
    );
  });
  return { root };
}

describe("NewAgentDialog", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    localeState.locale = "zh-CN";

    listAgentsMock.mockResolvedValue([{ id: "agent-ceo", role: "ceo" }]);
    listAdaptersMock.mockResolvedValue([]);
    createCompanyInviteMock.mockResolvedValue({
      id: "invite-1",
      token: "agent-token",
      inviteUrl: "https://paperclip.local/invite/agent-token",
      expiresAt: "2026-04-20T00:00:00.000Z",
      allowedJoinTypes: "agent",
      humanRole: null,
      onboardingTextUrl: "https://paperclip.local/api/invites/agent-token/onboarding.txt",
      onboardingTextPath: "/api/invites/agent-token/onboarding.txt",
    });
    getInviteOnboardingMock.mockResolvedValue({
      onboarding: {
        connectivity: {
          connectionCandidates: ["https://paperclip.local"],
          testResolutionEndpoint: {
            url: "https://paperclip.local/api/invites/agent-token/test-resolution",
          },
        },
      },
    });

    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteTextMock },
    });
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders the CEO recommendation flow in Chinese and creates a localized issue draft", async () => {
    const { root } = renderDialog(container);
    await flushReact();
    await flushReact();

    expect(container.textContent).toContain("添加新智能体");
    expect(container.textContent).toContain("建议由 CEO 来完成智能体初始配置");
    expect(container.textContent).toContain("让 CEO 创建新智能体");
    expect(container.textContent).toContain("我想自己做高级配置");

    const askCeoButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("让 CEO 创建新智能体"),
    );

    await act(async () => {
      askCeoButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openNewIssueMock).toHaveBeenCalledWith({
      assigneeAgentId: "agent-ceo",
      title: "创建一个新的智能体",
      description: "请在这里说明你想创建什么样的智能体",
    });

    act(() => {
      root.unmount();
    });
  });

  it("generates an external agent onboarding prompt inside the add-agent modal", async () => {
    localeState.locale = "en";
    const { root } = renderDialog(container);
    await flushReact();

    expect(container.textContent).toContain("Add a new agent");
    expect(container.textContent).toContain("Invite an external agent");

    const inviteButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("Invite an external agent"),
    );

    await act(async () => {
      inviteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Generate a one-time onboarding prompt");
    expect(container.textContent).not.toContain("Company Invites");

    const generateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Generate onboarding prompt",
    );

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
    await flushReact();

    expect(createCompanyInviteMock).toHaveBeenCalledWith("company-1", {
      allowedJoinTypes: "agent",
      humanRole: null,
      agentMessage: null,
    });
    expect(getInviteOnboardingMock).toHaveBeenCalledWith("agent-token");
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      expect.stringContaining("You're invited to join a Paperclip company as an agent."),
    );
    expect(container.textContent).toContain("Agent onboarding prompt");
    expect(container.textContent).toContain("Send this prompt to the external agent");
    expect(container.textContent).not.toContain("Optional message for the agent");
    expect(container.textContent).not.toContain("Generate onboarding prompt");
    expect(pushToastMock).toHaveBeenCalledWith({
      title: "Agent invite created",
      body: "Agent onboarding prompt ready below and copied to clipboard.",
      tone: "success",
    });

    const backButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Back",
    );

    await act(async () => {
      backButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(container.textContent).toContain("Optional message for the agent");
    expect(container.textContent).toContain("Generate onboarding prompt");

    act(() => {
      root.unmount();
    });
  });
});
