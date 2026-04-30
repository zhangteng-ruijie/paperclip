export const type = "anthropic_cloud";
export const label = "Anthropic Cloud API";

export const models = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-6", label: "Claude Haiku 4.6" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  { id: "claude-3-opus-20240229", label: "Claude 3 Opus" },
  { id: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet" },
  { id: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
];

export const agentConfigurationDoc = `# anthropic_cloud agent configuration

Adapter: anthropic_cloud

Use when:
- You want to use Claude models via the Anthropic API directly.
- You need streaming responses.
- You want token usage tracking and cost reporting.

Don't use when:
- You want to run Claude Code CLI locally (use claude_local instead).
- You need workspace/file operations (use claude_local instead).

Core fields:
- apiKey (string, required): Anthropic API key
- model (string, optional): Claude model id (default: claude-sonnet-4-6)
- maxTokens (number, optional): max output tokens (default: 8192)
- temperature (number, optional): sampling temperature (default: 1)
- streaming (boolean, optional): enable streaming responses (default: true)

Request behavior fields:
- timeoutSec (number, optional): request timeout in seconds (default: 120)
- baseUrl (string, optional): custom API base URL (default: https://api.anthropic.com)
- workspaceRuntime (object, optional): reserved workspace runtime metadata

Streaming:
- When streaming is enabled, response is sent as server-sent events
- Each chunk contains delta text updates
- Final message includes complete usage and billing info

Billing:
- billingType: "api"
- provider: "anthropic"
- costUsd: calculated from input/output tokens
`;
