import React from "react";
import { render } from "ink";

import { parseArgs } from "./lib/args.js";
import { loadConfig, mergeRuntimeOptions, resolveModels } from "./lib/config.js";
import { BenchmarkDatabase } from "./lib/db.js";
import { createRuntimeContext } from "./lib/runtime.js";
import { App } from "./ui/app.js";

function findModel(name: string | undefined, models: ReturnType<typeof resolveModels>): ReturnType<typeof resolveModels>[number] | undefined {
  if (!name) {
    return undefined;
  }

  return models.find((model) => model.name.toLowerCase() === name.toLowerCase());
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.mode === "history" || parsed.mode === "leaks") {
    const db = new BenchmarkDatabase(parsed.options.dbPath);
    render(
      <App
        mode={parsed.mode}
        db={db}
        dbPath={parsed.options.dbPath}
      />
    );
    return;
  }

  const { config, resolvedPath } = await loadConfig(parsed.options.configPath);
  const runtimeOptions = mergeRuntimeOptions(parsed.mode, { ...parsed.options, configPath: resolvedPath }, config, parsed.providedFlags);
  const models = resolveModels(config);
  const context = createRuntimeContext(parsed.mode, runtimeOptions);

  const left = parsed.mode === "head-to-head" ? findModel(parsed.leftName ?? models[0]?.name, models) : undefined;
  const right = parsed.mode === "head-to-head" ? findModel(parsed.rightName ?? models[1]?.name, models) : undefined;

  if (parsed.mode === "head-to-head" && (!left || !right)) {
    throw new Error("Head-to-head mode requires valid --left and --right model names from the config.");
  }

  render(
    <App
      mode={parsed.mode}
      context={context}
      models={models}
      runtimeOptions={runtimeOptions}
      left={left}
      right={right}
    />
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
