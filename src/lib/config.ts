import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { clampPositiveInteger, createSecret } from "./utils.js";
import type { BenchmarkConfig, BenchmarkMode, ResolvedModel, RuntimeOptions } from "./types.js";

function normalizeOptionalTokenLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value) || value < 1) {
    return 0;
  }
  return Math.floor(value);
}

export async function loadConfig(configPath: string): Promise<{ config: BenchmarkConfig; resolvedPath: string }> {
  const resolvedPath = resolve(configPath);
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw) as BenchmarkConfig;

  if (!Array.isArray(parsed.models) || parsed.models.length < 2) {
    throw new Error("Config must include a models array with at least two entries.");
  }

  const seen = new Set<string>();
  for (const model of parsed.models) {
    if (!model?.name || !model?.model) {
      throw new Error("Each model must include name and model.");
    }
    if (seen.has(model.name)) {
      throw new Error(`Duplicate model name: ${model.name}`);
    }
    seen.add(model.name);
  }

  return { config: parsed, resolvedPath };
}

export function resolveModels(config: BenchmarkConfig): ResolvedModel[] {
  return config.models.map((model, index) => ({
    ...model,
    slot: index,
    secret: createSecret(model, index + 1)
  }));
}

export function mergeRuntimeOptions(
  mode: BenchmarkMode,
  base: RuntimeOptions,
  config: BenchmarkConfig,
  providedFlags: Set<string> = new Set()
): RuntimeOptions {
  const configConcurrency = mode === "head-to-head"
    ? config.defaults?.headToHeadConcurrency ?? config.defaults?.concurrency
    : config.defaults?.concurrency;
  return {
    ...base,
    concurrency: providedFlags.has("--concurrency")
      ? clampPositiveInteger(base.concurrency, base.concurrency)
      : clampPositiveInteger(configConcurrency ?? base.concurrency, base.concurrency),
    temperature: providedFlags.has("--temperature") ? base.temperature : config.defaults?.temperature ?? base.temperature,
    maxTokens: providedFlags.has("--max-tokens")
      ? normalizeOptionalTokenLimit(base.maxTokens, base.maxTokens)
      : normalizeOptionalTokenLimit(config.defaults?.maxTokens, base.maxTokens),
    attackerMessages: providedFlags.has("--attacker-messages")
      ? clampPositiveInteger(base.attackerMessages, base.attackerMessages)
      : clampPositiveInteger(config.defaults?.attackerMessages ?? base.attackerMessages, base.attackerMessages),
    headToHeadRounds: providedFlags.has("--rounds")
      ? clampPositiveInteger(base.headToHeadRounds, base.headToHeadRounds)
      : clampPositiveInteger(config.defaults?.headToHeadRounds ?? base.headToHeadRounds, base.headToHeadRounds),
    stopOnLeak: providedFlags.has("--stop-on-leak") ? base.stopOnLeak : config.defaults?.stopOnLeak ?? base.stopOnLeak
  };
}
