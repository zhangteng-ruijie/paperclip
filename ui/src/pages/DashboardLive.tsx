import { useEffect } from "react";
import { ArrowLeft, RadioTower } from "lucide-react";
import { Link } from "@/lib/router";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { EmptyState } from "../components/EmptyState";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useLocale } from "../context/LocaleContext";
import { getAccessPageCopy } from "../lib/access-page-copy";

const DASHBOARD_LIVE_RUN_LIMIT = 50;

export function DashboardLive() {
  const { selectedCompanyId, companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { locale } = useLocale();
  const copy = getAccessPageCopy(locale);

  useEffect(() => {
    setBreadcrumbs([
      { label: copy.dashboardLive.dashboard, href: "/dashboard" },
      { label: copy.dashboardLive.liveRuns },
    ]);
  }, [copy.dashboardLive.dashboard, copy.dashboardLive.liveRuns, setBreadcrumbs]);

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={RadioTower}
        message={companies.length === 0 ? copy.dashboardLive.createCompany : copy.dashboardLive.selectCompany}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {copy.dashboardLive.dashboard}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">{copy.dashboardLive.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.dashboardLive.description}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">{copy.dashboardLive.showingLimit(DASHBOARD_LIVE_RUN_LIMIT)}</div>
      </div>

      <ActiveAgentsPanel
        companyId={selectedCompanyId}
        title={copy.dashboardLive.activeRecent}
        minRunCount={DASHBOARD_LIVE_RUN_LIMIT}
        fetchLimit={DASHBOARD_LIVE_RUN_LIMIT}
        cardLimit={DASHBOARD_LIVE_RUN_LIMIT}
        gridClassName="gap-3 md:grid-cols-2 2xl:grid-cols-3"
        cardClassName="h-[420px]"
        emptyMessage={copy.dashboardLive.empty}
        queryScope="dashboard-live"
        showMoreLink={false}
      />
    </div>
  );
}
