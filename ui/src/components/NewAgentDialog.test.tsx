// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewAgentDialog } from "./NewAgentDialog";

const dialogState = vi.hoisted(() => ({
  newAgentOpen: true,
  closeNewAgent: vi.fn(),
  openNewIssue: vi.fn(),
}));

const companyState = vi.hoisted(() => ({
  selectedCompanyId: "company-1",
}));

const localeState = vi.hoisted(() => ({
  locale: "zh-CN",
}));

const mockNavigate = vi.hoisted(() => vi.fn());

const mockAgentsApi = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockAdaptersApi = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("../context/DialogContext", () => ({
  useDialog: () => dialogState,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => companyState,
}));

vi.mock("../context/LocaleContext", () => ({
  useLocale: () => ({
    locale: localeState.locale,
    t: (key: string) => key,
  }),
}));

vi.mock("../api/agents", () => ({
  agentsApi: mockAgentsApi,
}));

vi.mock("../api/adapters", () => ({
  adaptersApi: mockAdaptersApi,
}));

vi.mock("@/lib/router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../adapters", () => ({
  listUIAdapters: () => [{ type: "codex_local" }],
}));

vi.mock("../adapters/use-disabled-adapters", () => ({
  useDisabledAdaptersSync: () => new Set<string>(),
}));

vi.mock("../adapters/adapter-display-registry", () => ({
  getAdapterDisplay: (_type: string, locale?: string | null) => ({
    label: "Codex",
    description: locale === "zh-CN" ? "本地 Codex Agent" : "Local Codex agent",
    icon: () => null,
    recommended: true,
    comingSoon: false,
    disabledLabel: undefined,
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
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
    dialogState.newAgentOpen = true;
    dialogState.closeNewAgent.mockReset();
    dialogState.openNewIssue.mockReset();
    mockNavigate.mockReset();
    mockAgentsApi.list.mockResolvedValue([
      { id: "agent-ceo", role: "ceo" },
    ]);
    mockAdaptersApi.list.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the CEO recommendation flow in Chinese and creates a localized issue draft", async () => {
    const { root } = renderDialog(container);
    await flush();
    await flush();

    expect(container.textContent).toContain("添加新智能体");
    expect(container.textContent).toContain("建议由 CEO 来完成智能体初始配置");
    expect(container.textContent).toContain("让 CEO 创建新智能体");
    expect(container.textContent).toContain("我想自己做高级配置");

    const askCeoButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("让 CEO 创建新智能体"),
    );

    expect(askCeoButton).toBeTruthy();

    await act(async () => {
      askCeoButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dialogState.openNewIssue).toHaveBeenCalledWith({
      assigneeAgentId: "agent-ceo",
      title: "创建一个新的智能体",
      description: "请在这里说明你想创建什么样的智能体",
    });

    act(() => {
      root.unmount();
    });
  });
});
