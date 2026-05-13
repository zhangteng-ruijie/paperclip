import { getEnabledConnections } from "./config.js";
import type { FeishuConnectionConfig, FeishuConnectorConfig } from "./types.js";

export interface FeishuSubscriberPlan {
  key: string;
  primaryConnectionId: string;
  profileName: string;
  appId?: string;
  connectionIds: string[];
  connectionNames: string[];
}

export function subscriberKeyForConnection(connection: FeishuConnectionConfig): string {
  const appId = connection.appId?.trim();
  return appId ? `app:${appId}` : `profile:${connection.profileName}`;
}

export function routeListeningConnections(config: FeishuConnectorConfig): FeishuConnectionConfig[] {
  const connections = getEnabledConnections(config);
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
  const defaultConnection = connections[0] ?? null;
  const connectionIds = new Set<string>();
  for (const route of (config.routes ?? []).filter((route) => route.enabled !== false)) {
    const connectionId = route.connectionId ?? defaultConnection?.id;
    if (connectionId && connectionById.has(connectionId)) connectionIds.add(connectionId);
  }
  return connections.filter((connection) => connectionIds.has(connection.id));
}

export function planEventSubscribers(config: FeishuConnectorConfig): FeishuSubscriberPlan[] {
  const groups = new Map<string, FeishuSubscriberPlan>();
  for (const connection of routeListeningConnections(config)) {
    const key = subscriberKeyForConnection(connection);
    const existing = groups.get(key);
    if (existing) {
      existing.connectionIds.push(connection.id);
      existing.connectionNames.push(connection.name?.trim() || connection.id);
      continue;
    }
    groups.set(key, {
      key,
      primaryConnectionId: connection.id,
      profileName: connection.profileName,
      appId: connection.appId,
      connectionIds: [connection.id],
      connectionNames: [connection.name?.trim() || connection.id],
    });
  }
  return [...groups.values()];
}
