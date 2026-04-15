import { NavLink } from "@/lib/router";
import { Clock3, Cpu, FlaskConical, Settings, SlidersHorizontal } from "lucide-react";
import { SIDEBAR_SCROLL_RESET_STATE } from "@/lib/navigation-scroll";
import { SidebarNavItem } from "./SidebarNavItem";
import { useLocale } from "@/context/LocaleContext";

export function InstanceSidebar() {
  const { t } = useLocale();

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      <div className="flex items-center gap-2 px-3 h-12 shrink-0">
        <Settings className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
        <span className="flex-1 text-sm font-bold text-foreground truncate">
          {t("instance.sidebar.title")}
        </span>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem to="/instance/settings/general" label={t("instance.sidebar.general")} icon={SlidersHorizontal} end />
          <SidebarNavItem to="/instance/settings/heartbeats" label={t("instance.sidebar.heartbeats")} icon={Clock3} end />
          <SidebarNavItem to="/instance/settings/experimental" label={t("instance.sidebar.experimental")} icon={FlaskConical} />
          <SidebarNavItem to="/instance/settings/adapters" label={t("instance.sidebar.adapters")} icon={Cpu} />
        </div>
      </nav>
    </aside>
  );
}
