import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, asNumber, asBoolean, parseObject } from "@paperclipai/adapter-utils/server-utils";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TIMEOUT_SEC = 120;

interface AnthropicMessage {
  type: string;
  index?: number;
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
  id?: string;
  role?: string;
  text?: string;
  reasoning?: { type: string; text?: string };
  signature?: string;
  stop_reason?: string;
}

interface AnthropicStreamEvent {
  type: "message_start" | "message_delta" | "content_block_start" | "content_block_delta" | "message_stop";
  message?: AnthropicMessage;
  index?: number;
  content_block?: { type: string };
  delta?: { type: string; text?: string };
  usage?: { output_tokens: number };
}

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function resolveApiKey(config: Record<string, unknown>, authToken?: string): string | null {
  const apiKey =
    asString(config.apiKey, "").trim() ||
    asString(config.api_key, "").trim() ||
    asString(config["anthropic-api-key"], "").trim();
  if (apiKey) return apiKey;
  if (authToken) return authToken;
  return null;
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const apiKey = resolveApiKey(config, ctx.deployment?.mode === "local_trusted" ? undefined : undefined);
  const baseUrl = asString(config.baseUrl, DEFAULT_BASE_URL).trim();
  const deployment = ctx.deployment;

  if (!apiKey) {
    checks.push({
      code: "anthropic_cloud_api_key_missing",
      level: "error",
      message: "Anthropic API key is required.",
      hint: "Set adapterConfig.apiKey to your Anthropic API key.",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  checks.push({
    code: "anthropic_cloud_api_key_present",
    level: "info",
    message: "Anthropic API key is configured.",
  });

  if (baseUrl !== DEFAULT_BASE_URL) {
    checks.push({
      code: "anthropic_cloud_custom_base_url",
      level: "info",
      message: `Using custom base URL: ${baseUrl}`,
    });
  }

  // Probe the API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      checks.push({
        code: "anthropic_cloud_api_probe_ok",
        level: "info",
        message: "Anthropic API connection successful.",
      });
    } else if (response.status === 401) {
      checks.push({
        code: "anthropic_cloud_api_probe_unauthorized",
        level: "error",
        message: "Anthropic API key is invalid or expired.",
        hint: "Check your API key at https://console.anthropic.com/settings/keys",
      });
    } else if (response.status === 429) {
      checks.push({
        code: "anthropic_cloud_api_probe_rate_limited",
        level: "warn",
        message: "Anthropic API rate limit hit during probe.",
        hint: "Consider adding exponential backoff or reducing request frequency.",
      });
    } else {
      const errorText = await response.text().catch(() => "");
      checks.push({
        code: "anthropic_cloud_api_probe_failed",
        level: "warn",
        message: `Anthropic API probe failed with status ${response.status}: ${errorText}`,
      });
    }
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    checks.push({
      code: "anthropic_cloud_api_probe_error",
      level: isTimeout ? "warn" : "error",
      message: isTimeout ? "Anthropic API probe timed out." : `Anthropic API probe failed: ${err instanceof Error ? err.message : String(err)}`,
      hint: isTimeout ? "Check network connectivity to api.anthropic.com" : undefined,
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}

async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data && data !== "[DONE]") {
            yield data;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta, authToken } = ctx;

  const apiKey = resolveApiKey(config, authToken);
  if (!apiKey) {
    return {
      exitCode: null,
      signal: null,
      timedOut: false,
      errorMessage: "Anthropic API key is required",
      errorCode: "api_key_missing",
    };
  }

  const model = asString(config.model, DEFAULT_MODEL);
  const maxTokens = asNumber(config.maxTokens, DEFAULT_MAX_TOKENS);
  const temperature = asNumber(config.temperature, 1);
  const streaming = asBoolean(config.streaming, true);
  const timeoutSec = asNumber(config.timeoutSec, DEFAULT_TIMEOUT_SEC);
  const baseUrl = asString(config.baseUrl, DEFAULT_BASE_URL).trim();

  // Build messages from context
  const paperclipWake = context.paperclipWake as { messages?: Array<{ role: string; content: string }> } | undefined;
  const messages = paperclipWake?.messages ?? [];

  // Add system prompt if provided
  const systemPrompt = asString(config.systemPrompt, "").trim();

  if (onMeta) {
    await onMeta({
      adapterType: "anthropic_cloud",
      command: "POST /v1/messages",
      prompt: messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
      context,
    });
  }

  const startTime = Date.now();
  let accumulatedText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let responseModel = model;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);

    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
    };

    if (temperature !== 1) {
      requestBody.temperature = temperature;
    }

    if (systemPrompt) {
      requestBody.system = systemPrompt;
    }

    if (streaming) {
      requestBody.stream = true;
    }

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      let errorCode = "api_error";
      if (response.status === 401) {
        errorCode = "api_key_invalid";
      } else if (response.status === 429) {
        errorCode = "rate_limited";
      } else if (response.status === 400) {
        errorCode = "bad_request";
      }
      return {
        exitCode: null,
        signal: null,
        timedOut: false,
        errorMessage: `Anthropic API error ${response.status}: ${errorBody}`,
        errorCode,
      };
    }

    if (!streaming) {
      const json = await response.json() as AnthropicMessage;
      const content = json.content?.[0];
      const text = content?.text ?? "";
      inputTokens = json.usage?.input_tokens ?? 0;
      outputTokens = json.usage?.output_tokens ?? 0;
      cachedInputTokens = json.usage?.cache_read_input_tokens ?? 0;
      responseModel = json.model ?? model;

      const costUsd = calculateCost(inputTokens, outputTokens, model);

      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        usage: {
          inputTokens,
          outputTokens,
          cachedInputTokens,
        },
        provider: "anthropic",
        biller: "anthropic",
        model: responseModel,
        billingType: "api",
        costUsd,
        resultJson: json as unknown as Record<string, unknown>,
        summary: text,
      };
    }

    // Streaming response
    if (!response.body) {
      throw new Error("Response body is null");
    }

    for await (const data of parseSSEStream(response)) {
      try {
        const event = JSON.parse(data) as AnthropicStreamEvent;

        switch (event.type) {
          case "message_start":
            if (event.message?.usage) {
              inputTokens = event.message.usage.input_tokens ?? 0;
              cachedInputTokens = event.message.usage.cache_read_input_tokens ?? 0;
            }
            if (event.message?.model) {
              responseModel = event.message.model;
            }
            break;

          case "content_block_delta":
            if (event.delta?.type === "thinking_delta") {
              // Skip thinking blocks
            } else if (event.delta?.text) {
              accumulatedText += event.delta.text;
              await onLog("stdout", event.delta.text);
            }
            break;

          case "message_delta":
            if (event.usage?.output_tokens) {
              outputTokens = event.usage.output_tokens;
            }
            break;

          case "message_stop":
            break;
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    const costUsd = calculateCost(inputTokens, outputTokens, model);
    const elapsedMs = Date.now() - startTime;

    await onLog("stdout", `\n[anthropic-cloud] Completed in ${elapsedMs}ms\n`);

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens,
      },
      provider: "anthropic",
      biller: "anthropic",
      model: responseModel,
      billingType: "api",
      costUsd,
      summary: accumulatedText,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorMessage: `Request timed out after ${timeoutSec}s`,
        errorCode: "timeout",
      };
    }

    return {
      exitCode: null,
      signal: null,
      timedOut: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorCode: "execution_error",
    };
  }
}

function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  // Claude pricing per 1M tokens (as of 2025)
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-opus-4-6": { input: 15, output: 75 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-haiku-4-6": { input: 0.8, output: 4 },
    "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
    "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
    "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
    "claude-3-opus-20240229": { input: 15, output: 75 },
    "claude-3-sonnet-20240229": { input: 3, output: 15 },
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  };

  const tier = pricing[model] ?? { input: 3, output: 15 };
  const inputCost = (inputTokens / 1_000_000) * tier.input;
  const outputCost = (outputTokens / 1_000_000) * tier.output;
  return Math.round((inputCost + outputCost) * 100_000_000) / 100_000_000; // Round to 8 decimal places
}
