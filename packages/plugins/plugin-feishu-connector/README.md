# Paperclip Feishu Connector

Paperclip plugin/connector for routing Feishu/Lark messages into Paperclip
issues and agents while reusing the official `lark-cli` for Feishu operations.

This package intentionally keeps Feishu API coverage in `lark-cli`. The plugin
owns only Paperclip-specific concerns: connection profiles, routes, sessions,
deduplication, Base sinks, and agent wakeups.

## Local MVP

- Listen to Feishu IM events through `lark-cli event +subscribe`.
- Route inbound messages to Paperclip issues and agent sessions.
- Reuse the same Paperclip agent session for follow-up Feishu replies in the
  same thread/root message.
- Reply with `lark-cli im +messages-send` / `+messages-reply`.
- Write demand records with `lark-cli base +record-upsert`.
- Keep event/session state in Paperclip plugin state/entities.
- Reply to Feishu when the Paperclip agent session reaches a terminal state.

## Configuration Model

- `connections[]`: maps a Paperclip connection id to a `lark-cli` profile.
  Use one connection per Feishu bot/app profile.
- `routes[]`: chooses which Paperclip company/project/agent handles an inbound
  message. Routes can match by chat id, sender open_id, keyword, regex, or
  default fallback, and higher `priority` wins.
- `baseSinks[]`: optional Feishu Base targets. A route can reference one
  `baseSinkId` to write the inbound demand into a specific Base/table.
- `dryRunCli`: when `true`, the plugin returns the exact `lark-cli` argv without
  sending real Feishu messages or writing Base records.
- `enableEventSubscriber`: local/singleton-only switch that starts
  `lark-cli event +subscribe` in the plugin worker.

For production, keep route ownership explicit. Different Paperclip agents or
tasks should use different route ids and can point to different connection ids
and Base sinks.

## Local Development

```bash
pnpm --filter @paperclipai/plugin-feishu-connector test
pnpm --filter @paperclipai/plugin-feishu-connector typecheck
pnpm --filter @paperclipai/plugin-feishu-connector build
pnpm paperclipai plugin install ./packages/plugins/plugin-feishu-connector --local
```

If the plugin is already installed and the manifest capabilities changed, soft
uninstall first, then install again:

```bash
pnpm paperclipai plugin uninstall paperclipai.feishu-connector
pnpm paperclipai plugin install ./packages/plugins/plugin-feishu-connector --local
```

## Cloud Deployment Note

For cloud deployments, run the event subscriber as a singleton sidecar per
Feishu profile. Do not run multiple subscribers for the same profile: Feishu may
split events across connections, causing partial delivery.

The plugin worker can start a subscriber for local tests, but cloud deployments
should expose one controlled inbound path per Feishu app/profile, then call the
same plugin action (`simulate-inbound-message`) or a future webhook endpoint.
