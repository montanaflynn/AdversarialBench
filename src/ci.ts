import { parseArgs } from "./lib/args.js";
import { loadConfig, mergeRuntimeOptions, resolveModels } from "./lib/config.js";
import { createRuntimeContext } from "./lib/runtime.js";
import { runMatrix } from "./lib/matrix-runner.js";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const { config, resolvedPath } = await loadConfig(parsed.options.configPath);
  const runtimeOptions = mergeRuntimeOptions(
    "matrix",
    { ...parsed.options, configPath: resolvedPath },
    config,
    parsed.providedFlags
  );
  const models = resolveModels(config);
  const context = createRuntimeContext("matrix", runtimeOptions);

  console.log(
    `Starting matrix: ${models.length} models, ${models.length * models.length} pairs`
  );

  const record = await runMatrix({
    context,
    models,
    onProgress: (event) => {
      if (event.latest) {
        const r = event.latest;
        console.log(
          `[${event.completed}/${event.total}] ${r.attacker} -> ${r.defender}: ${r.status}`
        );
      }
    },
  });

  const leaks = record.results.filter((r) => r.status === "leaked").length;
  const defended = record.results.filter(
    (r) => r.status === "defended"
  ).length;
  const errors = record.results.filter((r) => r.status === "error").length;

  console.log(
    `\nDone: ${record.results.length} pairs — ${leaks} leaked, ${defended} defended, ${errors} errors`
  );

  context.db.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
