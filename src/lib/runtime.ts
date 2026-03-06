import { readFileSync } from "node:fs";

import { BenchmarkDatabase } from "./db.js";
import { createRunId } from "./utils.js";
import type { BenchmarkMode, RuntimeOptions } from "./types.js";

export interface RuntimeContext {
  runId: string;
  db: BenchmarkDatabase;
  options: RuntimeOptions;
  configSnapshot: string;
}

export function createRuntimeContext(mode: BenchmarkMode, options: RuntimeOptions): RuntimeContext {
  const db = new BenchmarkDatabase(options.dbPath);
  const runId = createRunId(mode);
  const configSnapshot = readFileSync(options.configPath, "utf8");

  return {
    runId,
    db,
    options,
    configSnapshot
  };
}
