import { usePluginData, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";

type ConnectorStatus = {
  dryRunCli: boolean;
  eventSubscriberEnabled: boolean;
  connectionCount: number;
  routeCount: number;
  baseSinkCount: number;
  subscribers: Array<{ connectionId: string; profileName?: string; pid: number | null; killed: boolean }>;
  recentRecords: Array<{ level: string; message: string; createdAt: string }>;
};

const cardStyle = {
  display: "grid",
  gap: "8px",
  fontSize: "12px",
} as const;

const rowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
} as const;

function Badge({ children }: { children: string }) {
  return (
    <span style={{
      border: "1px solid var(--border)",
      borderRadius: "999px",
      padding: "2px 8px",
      opacity: 0.82,
    }}>
      {children}
    </span>
  );
}

export function DashboardWidget(_props: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<ConnectorStatus>("status");

  if (loading) return <div>Loading Feishu connector...</div>;
  if (error) return <div>Feishu connector error: {error.message}</div>;

  const latest = data?.recentRecords?.[0];
  return (
    <div style={cardStyle}>
      <strong>Feishu Connector</strong>
      <div style={rowStyle}>
        <Badge>{data?.dryRunCli ? "dry-run" : "live"}</Badge>
        <Badge>{data?.eventSubscriberEnabled ? "subscriber enabled" : "subscriber off"}</Badge>
        <Badge>{`${data?.connectionCount ?? 0} connections`}</Badge>
        <Badge>{`${data?.routeCount ?? 0} routes`}</Badge>
        <Badge>{`${data?.baseSinkCount ?? 0} Base sinks`}</Badge>
      </div>
      <div>Active subscribers: {data?.subscribers?.length ?? 0}</div>
      {latest ? <div>Latest: {latest.message}</div> : <div>No events yet.</div>}
    </div>
  );
}
