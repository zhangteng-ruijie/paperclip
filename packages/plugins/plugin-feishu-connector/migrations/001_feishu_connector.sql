CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_bots (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  app_id text,
  profile_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'configured',
  bot_aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_entries (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  connection_id text REFERENCES plugin_feishu_connector_6f7b627c73.feishu_bots(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  match_type text NOT NULL,
  trigger_label text NOT NULL,
  company_ref text,
  company_id text,
  project_id text,
  target_agent_id text,
  target_agent_name text,
  reply_mode text NOT NULL DEFAULT 'thread',
  base_sink_id text,
  priority integer NOT NULL DEFAULT 10,
  raw_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_capabilities (
  key text PRIMARY KEY,
  title text NOT NULL,
  group_name text NOT NULL,
  implemented boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  risk text NOT NULL DEFAULT 'medium',
  tool_name text,
  lark_cli_commands jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_entry_capabilities (
  entry_id text NOT NULL REFERENCES plugin_feishu_connector_6f7b627c73.feishu_entries(id) ON DELETE CASCADE,
  capability_key text NOT NULL REFERENCES plugin_feishu_connector_6f7b627c73.feishu_capabilities(key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  raw_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, capability_key)
);

CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_agent_capabilities (
  agent_id text NOT NULL,
  capability_key text NOT NULL REFERENCES plugin_feishu_connector_6f7b627c73.feishu_capabilities(key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  raw_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, capability_key)
);

CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_conversations (
  chat_id text PRIMARY KEY,
  connection_id text REFERENCES plugin_feishu_connector_6f7b627c73.feishu_bots(id) ON DELETE SET NULL,
  name text,
  conversation_type text,
  last_active_at timestamptz,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_message_routes (
  id text PRIMARY KEY,
  connection_id text REFERENCES plugin_feishu_connector_6f7b627c73.feishu_bots(id) ON DELETE SET NULL,
  entry_id text REFERENCES plugin_feishu_connector_6f7b627c73.feishu_entries(id) ON DELETE SET NULL,
  company_id text,
  issue_id text,
  issue_identifier text,
  agent_id text,
  chat_id text,
  requester_open_id text,
  requester_name text,
  message_id text NOT NULL,
  root_message_id text,
  thread_id text,
  reply_mode text,
  session_key text NOT NULL,
  raw_session jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_event_logs (
  id text PRIMARY KEY,
  level text NOT NULL,
  message text NOT NULL,
  connection_id text,
  entry_id text,
  issue_id text,
  feishu_message_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_conflicts (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'open',
  conflict_type text NOT NULL DEFAULT 'routing',
  connection_id text,
  selected_entry_id text,
  feishu_message_id text,
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_feishu_connector_6f7b627c73.feishu_permission_checks (
  id text PRIMARY KEY,
  connection_id text REFERENCES plugin_feishu_connector_6f7b627c73.feishu_bots(id) ON DELETE SET NULL,
  profile_name text,
  ok boolean NOT NULL DEFAULT false,
  missing_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  granted_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
