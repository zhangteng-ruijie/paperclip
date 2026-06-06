import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Boxes,
  Repeat,
  GitBranch,
  Package,
  Settings,
  FolderOpen,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "@/lib/router";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarAgents } from "./SidebarAgents";
import { SidebarProjects } from "./SidebarProjects";
import { useDialogActions } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { useLocale } from "../context/LocaleContext";
import { heartbeatsApi } from "../api/heartbeats";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { getShellCopy } from "../lib/shell-copy";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";

export function Sidebar() {
  const { openNewIssue } = useDialogActions();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { locale } = useLocale();
  const copy = getShellCopy(locale);
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;
  const showWorkspacesLink = experimentalSettings?.enableIsolatedWorkspaces === true;
  // IA flag (PAP-89): branch the sidebar nav presentation. Default OFF = classic
  // (per-project collapsible, no Projects nav link). ON = streamlined
  // (top-level Projects link). Issue/Task wording is split to PR #7651.
  // Gating is navigation-only; all routes stay registered in both modes.
  const streamlined = experimentalSettings?.enableStreamlinedLeftNavigation === true;

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="w-full h-full min-h-0 border-r border-border bg-background flex flex-col">
      {/* Top bar: Company name (bold) + Search — aligned with top sections (no visible border) */}
      <div className="flex items-center gap-1 px-3 h-12 shrink-0">
        {selectedCompany?.brandColor && (
          <div
            className="w-4 h-4 rounded-sm shrink-0 ml-1"
            style={{ backgroundColor: selectedCompany.brandColor }}
          />
        )}
        <SidebarCompanyMenu />
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          aria-label="Open search"
          title="Open search"
        >
          <NavLink to="/search">
            <Search className="h-4 w-4" />
          </NavLink>
        </Button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 pointer-coarse:gap-3 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {/* New Task button aligned with nav items */}
          <button
            onClick={() => openNewIssue()}
            data-slot="icon-button"
            className="flex items-center gap-2.5 px-3 py-2 pointer-coarse:py-1.5 text-[13px] font-medium text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">{copy.newIssue}</span>
          </button>
          <SidebarNavItem
            to="/dashboard"
            label={copy.dashboard}
            icon={LayoutDashboard}
            liveCount={liveRunCount}
          />
          <SidebarNavItem
            to="/inbox"
            label={copy.inbox}
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
        </div>

        <SidebarSection label={copy.work}>
          <SidebarNavItem to="/issues" label={copy.issues} icon={CircleDot} />
          <SidebarNavItem
            to="/routines"
            label={copy.routines}
            icon={Repeat}
            textBadge={copy.beta}
            textBadgeTone="amber"
          />
          <SidebarNavItem to="/goals" label={copy.goals} icon={Target} />
          <SidebarNavItem to="/artifacts" label={locale === "zh-CN" ? "产物" : "Artifacts"} icon={Package} />
          {showWorkspacesLink ? (
            <SidebarNavItem to="/workspaces" label="Workspaces" icon={GitBranch} />
          ) : null}
          {streamlined ? (
            <SidebarNavItem to="/projects" label="Projects" icon={FolderOpen} />
          ) : null}
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
          <PluginLauncherOutlet
            placementZones={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
          />
        </SidebarSection>

        {/* Classic mode restores the per-project collapsible below Work. */}
        {streamlined ? null : <SidebarProjects />}

        <SidebarAgents streamlined={streamlined} />

        <SidebarSection label={copy.company}>
          <SidebarNavItem to="/org" label={copy.org} icon={Network} />
          <SidebarNavItem to="/skills" label={copy.skills} icon={Boxes} />
          <SidebarNavItem to="/costs" label={copy.costs} icon={DollarSign} />
          <SidebarNavItem to="/activity" label={copy.activity} icon={History} />
          <SidebarNavItem to="/company/settings" label={copy.settings} icon={Settings} />
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>
    </aside>
  );
}
