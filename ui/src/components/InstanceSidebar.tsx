import { useQuery } from "@tanstack/react-query";
import { Clock3, Cpu, FlaskConical, Puzzle, Settings, Shield, SlidersHorizontal, UserRoundPen } from "lucide-react";
import { NavLink } from "@/lib/router";
import { pluginsApi } from "@/api/plugins";
import { queryKeys } from "@/lib/queryKeys";
import { SIDEBAR_SCROLL_RESET_STATE } from "@/lib/navigation-scroll";
import { SidebarNavItem } from "./SidebarNavItem";

type SidebarPluginRecord = {
  pluginKey?: string | null;
  packageName?: string | null;
  manifestJson?: {
    displayName?: string | null;
  } | null;
};

function isFeishuPlugin(plugin: SidebarPluginRecord): boolean {
  const haystack = [
    plugin.pluginKey,
    plugin.packageName,
    plugin.manifestJson?.displayName,
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes("feishu") || haystack.includes("lark") || haystack.includes("飞书");
}

function PluginNavIcon({ plugin }: { plugin: SidebarPluginRecord }) {
  if (isFeishuPlugin(plugin)) {
    return (
      <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] bg-blue-600 text-[10px] font-bold leading-[14px] text-white text-center">
        飞
      </span>
    );
  }
  return <Puzzle className="h-3.5 w-3.5 shrink-0" />;
}

export function InstanceSidebar() {
  const { data: plugins } = useQuery({
    queryKey: queryKeys.plugins.all,
    queryFn: () => pluginsApi.list(),
  });

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      <div className="flex items-center gap-2 px-3 h-12 shrink-0">
        <Settings className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
        <span className="flex-1 text-sm font-bold text-foreground truncate">
          Instance Settings
        </span>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem to="/instance/settings/profile" label="Profile" icon={UserRoundPen} end />
          <SidebarNavItem to="/instance/settings/general" label="General" icon={SlidersHorizontal} end />
          <SidebarNavItem to="/instance/settings/access" label="Access" icon={Shield} end />
          <SidebarNavItem to="/instance/settings/heartbeats" label="Heartbeats" icon={Clock3} end />
          <SidebarNavItem to="/instance/settings/experimental" label="Experimental" icon={FlaskConical} />
          <SidebarNavItem to="/instance/settings/plugins" label="Plugins" icon={Puzzle} />
          <SidebarNavItem to="/instance/settings/adapters" label="Adapters" icon={Cpu} />
          {(plugins ?? []).length > 0 ? (
            <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-border/70 pl-3">
              {(plugins ?? []).map((plugin) => (
                <NavLink
                  key={plugin.id}
                  to={`/instance/settings/plugins/${plugin.id}`}
                  state={SIDEBAR_SCROLL_RESET_STATE}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    ].join(" ")
                  }
                >
                  <PluginNavIcon plugin={plugin} />
                  <span className="min-w-0 flex-1 truncate">
                    {plugin.manifestJson.displayName ?? plugin.packageName}
                  </span>
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>
      </nav>
    </aside>
  );
}
