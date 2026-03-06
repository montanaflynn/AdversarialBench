import { resolve } from "node:path";

import { appendModel, defaultAssistantPersona, deriveModelName, readEditableConfig, writeEditableConfig } from "./lib/config-editor.js";

interface AddModelArgs {
  configPath: string;
  modelRef?: string;
  name?: string;
  persona?: string;
  secret?: string;
  secretPrefix?: string;
}

function parseArgs(argv: string[]): AddModelArgs {
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith("--")) {
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${token}.`);
    }
    flags.set(token, next);
    index += 1;
  }

  return {
    configPath: resolve(String(flags.get("--config") ?? "./agents.example.json")),
    modelRef: flags.get("--model"),
    name: flags.get("--name"),
    persona: flags.get("--persona"),
    secret: flags.get("--secret"),
    secretPrefix: flags.get("--secret-prefix")
  };
}

function usage(): string {
  return [
    "Usage:",
    "  node dist/add-model.js --config ./agents.custom.json --model openai/gpt-5.4 [--name GPT54] [--persona \"Personal assistant AI agent for GPT54.\"]",
    "",
    "Flags:",
    "  --config         Path to the JSON config file to edit. Defaults to ./agents.example.json",
    "  --model          Required. Model ref, for example openai/gpt-5.4",
    "  --name           Optional display name. If omitted, one is derived from the model ref",
    "  --persona        Optional persona string",
    "  --secret         Optional fixed secret token",
    "  --secret-prefix  Optional secret prefix used when secrets are generated at runtime"
  ].join("\n");
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.modelRef) {
    throw new Error(`Missing required --model.\n\n${usage()}`);
  }

  const { config, resolvedPath, existed } = await readEditableConfig(parsed.configPath);
  const name = parsed.name?.trim() || deriveModelName(parsed.modelRef);
  const persona = parsed.persona?.trim() || defaultAssistantPersona(name);
  const updated = appendModel(config, {
    name,
    model: parsed.modelRef,
    persona,
    secret: parsed.secret,
    secretPrefix: parsed.secretPrefix
  });

  await writeEditableConfig(resolvedPath, updated);

  console.log(`${existed ? "Updated" : "Created"} ${resolvedPath}`);
  console.log(`Added model ${name} -> ${parsed.modelRef}`);
  console.log(`Persona: ${persona}`);
  if (parsed.secretPrefix) {
    console.log(`Secret prefix: ${parsed.secretPrefix}`);
  }
  if (parsed.secret) {
    console.log("Secret: [provided]");
  }
  console.log(`Total models: ${updated.models.length}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
