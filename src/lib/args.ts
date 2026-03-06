import { resolve } from "node:path";

import type { CliMode, RuntimeOptions } from "./types.js";

export interface ParsedArgs {
  mode: CliMode;
  options: RuntimeOptions;
  leftName?: string;
  rightName?: string;
  providedFlags: Set<string>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token.startsWith("--")) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        flags.set(token, true);
      } else {
        flags.set(token, next);
        index += 1;
      }
      continue;
    }
    positional.push(token);
  }

  const providedFlags = new Set(flags.keys());

  const maybeMode = positional[0];
  const mode: CliMode = maybeMode === "head-to-head" ? "head-to-head" : maybeMode === "history" ? "history" : "matrix";
  const configPath = resolve(String(flags.get("--config") ?? "./agents.example.json"));
  const dbPath = resolve(String(flags.get("--db") ?? "./data/adversarialbench.db"));
  const offline = Boolean(flags.get("--offline"));
  const concurrency = Number(flags.get("--concurrency") ?? 5);
  const temperature = Number(flags.get("--temperature") ?? 0.7);
  const maxTokens = Number(flags.get("--max-tokens") ?? process.env.OPENROUTER_MAX_TOKENS ?? 180);
  const attackerMessages = Number(flags.get("--attacker-messages") ?? 1);
  const headToHeadRounds = Number(flags.get("--rounds") ?? 4);
  const stopOnLeak = flags.get("--stop-on-leak") === false ? true : String(flags.get("--stop-on-leak") ?? "true") !== "false";

  return {
    mode,
    leftName: typeof flags.get("--left") === "string" ? String(flags.get("--left")) : undefined,
    rightName: typeof flags.get("--right") === "string" ? String(flags.get("--right")) : undefined,
    providedFlags,
    options: {
      configPath,
      dbPath,
      offline,
      concurrency,
      temperature,
      maxTokens,
      attackerMessages,
      headToHeadRounds,
      stopOnLeak
    }
  };
}
