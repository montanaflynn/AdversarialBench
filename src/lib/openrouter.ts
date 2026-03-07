import { performance } from "node:perf_hooks";

import type { PromptResult, UsageMetrics } from "./types.js";
import { RunCancelledError } from "./utils.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface OpenRouterMessage {
  content?: JsonValue;
  refusal?: JsonValue;
  reasoning?: JsonValue;
  reasoning_details?: JsonValue;
  [key: string]: JsonValue | undefined;
}

interface OpenRouterChoice {
  message?: OpenRouterMessage;
}

interface OpenRouterResponse {
  id?: string;
  choices?: OpenRouterChoice[];
  usage?: JsonValue;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const IGNORED_STRING_KEYS = new Set([
  "role",
  "type",
  "id",
  "finish_reason",
  "native_finish_reason"
]);

function extractStringList(value: JsonValue, parentKey?: string): string[] {
  if (value === null) {
    return [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (parentKey && IGNORED_STRING_KEYS.has(parentKey)) {
      return [];
    }
    return [trimmed];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractStringList(entry, parentKey));
  }

  return Object.entries(value).flatMap(([key, child]) => extractStringList(child, key));
}

function normalizeExtractedStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact || seen.has(compact)) {
      continue;
    }
    seen.add(compact);
    normalized.push(compact);
  }

  return normalized;
}

export function extractMessageText(message?: OpenRouterMessage): {
  text: string;
  source?: PromptResult["source"];
} {
  if (!message) {
    return { text: "" };
  }

  const contentText = normalizeExtractedStrings(extractStringList(message.content ?? null));
  if (contentText.length > 0) {
    return { text: contentText.join("\n\n"), source: "content" };
  }

  const refusalText = normalizeExtractedStrings(extractStringList(message.refusal ?? null));
  if (refusalText.length > 0) {
    return { text: refusalText.join("\n\n"), source: "refusal" };
  }

  const reasoningText = normalizeExtractedStrings([
    ...extractStringList(message.reasoning ?? null),
    ...extractStringList(message.reasoning_details ?? null)
  ]);
  if (reasoningText.length > 0) {
    return { text: reasoningText.join("\n\n"), source: "reasoning" };
  }

  const fallbackText = normalizeExtractedStrings(extractStringList(message as JsonValue));
  if (fallbackText.length > 0) {
    return { text: fallbackText.join("\n\n"), source: "fallback" };
  }

  return { text: "" };
}

function numberOrUndefined(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function extractUsageMetrics(value: JsonValue | undefined): UsageMetrics | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, JsonValue>;
  const promptTokens =
    numberOrUndefined(record.prompt_tokens) ??
    numberOrUndefined(record.input_tokens) ??
    numberOrUndefined(record.tokens_prompt);
  const completionTokens =
    numberOrUndefined(record.completion_tokens) ??
    numberOrUndefined(record.output_tokens) ??
    numberOrUndefined(record.tokens_completion);
  const totalTokens =
    numberOrUndefined(record.total_tokens) ??
    ((promptTokens ?? 0) + (completionTokens ?? 0) > 0 ? (promptTokens ?? 0) + (completionTokens ?? 0) : undefined);
  const reasoningTokens =
    numberOrUndefined(record.reasoning_tokens) ??
    numberOrUndefined(record.completion_tokens_details && !Array.isArray(record.completion_tokens_details) && typeof record.completion_tokens_details === "object"
      ? (record.completion_tokens_details as Record<string, JsonValue>).reasoning_tokens
      : undefined);
  const cachedTokens =
    numberOrUndefined(record.cached_tokens) ??
    numberOrUndefined(record.cache_read_tokens) ??
    numberOrUndefined(record.prompt_tokens_details && !Array.isArray(record.prompt_tokens_details) && typeof record.prompt_tokens_details === "object"
      ? (record.prompt_tokens_details as Record<string, JsonValue>).cached_tokens
      : undefined);
  const cacheWriteTokens = numberOrUndefined(record.cache_write_tokens);
  const cost =
    numberOrUndefined(record.cost) ??
    numberOrUndefined(record.total_cost) ??
    numberOrUndefined(record.usage_cost);
  const upstreamInferenceCost =
    numberOrUndefined(record.upstream_inference_cost) ??
    numberOrUndefined(record.native_cost);

  const usage: UsageMetrics = {
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens,
    cachedTokens,
    cacheWriteTokens,
    cost,
    upstreamInferenceCost,
    rawJson: JSON.stringify(value)
  };

  if (Object.values(usage).every((entry) => entry === undefined)) {
    return undefined;
  }

  return usage;
}

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;

function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export async function runOpenRouterPrompt(input: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<PromptResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required for live runs.");
  }

  const requestBody = JSON.stringify({
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt }
    ],
    temperature: input.temperature,
    ...(input.maxTokens > 0 ? { max_tokens: input.maxTokens } : {}),
    usage: {
      include: true
    }
  });

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://github.com/montanaflynn/AdversarialBench",
    "X-Title": "AdversarialBench"
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }

    const started = performance.now();
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

    const combinedSignal = input.signal
      ? AbortSignal.any([input.signal, timeoutController.signal])
      : timeoutController.signal;

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",
        signal: combinedSignal,
        headers,
        body: requestBody
      });
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === "AbortError") {
        if (input.signal?.aborted) {
          throw new RunCancelledError();
        }
        lastError = new Error(`OpenRouter request timed out after ${REQUEST_TIMEOUT_MS / 1000}s for ${input.model}`);
        continue;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text();
      lastError = new Error(`OpenRouter error ${response.status}: ${body}`);
      if (isRetryable(response.status)) {
        continue;
      }
      throw lastError;
    }

    const data = (await response.json()) as OpenRouterResponse;
    const message = data.choices?.[0]?.message;
    const extracted = extractMessageText(message);

    if (!extracted.text) {
      throw new Error(`OpenRouter response missing searchable text: ${JSON.stringify(message ?? null)}`);
    }

    return {
      text: extracted.text,
      source: extracted.source,
      latencyMs: Math.round(performance.now() - started),
      generationId: data.id,
      usage: extractUsageMetrics(data.usage)
    };
  }

  throw lastError ?? new Error(`OpenRouter request failed after ${MAX_RETRIES + 1} attempts`);
}
