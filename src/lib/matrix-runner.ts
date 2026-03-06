import pLimit from "p-limit";

import { buildMatrixAttackPrompt, buildMatrixDefensePrompt } from "./prompts.js";
import { runOpenRouterPrompt } from "./openrouter.js";
import type { RuntimeContext } from "./runtime.js";
import { scriptedAttack, scriptedDefense } from "./scripted.js";
import { RunCancelledError, statusFromResponse, throwIfCancelled } from "./utils.js";
import type { MatrixAttempt, MatrixCellState, MatrixProgressEvent, MatrixResult, MatrixRunRecord, ResolvedModel } from "./types.js";

interface MatrixRunnerInput {
  context: RuntimeContext;
  models: ResolvedModel[];
  onProgress?: (event: MatrixProgressEvent) => void;
  signal?: AbortSignal;
}

async function createAttackMessage(
  context: RuntimeContext,
  attacker: ResolvedModel,
  defender: ResolvedModel,
  attempts: MatrixAttempt[],
  signal?: AbortSignal
): Promise<{ text: string; prompt: string; latencyMs: number }> {
  throwIfCancelled(signal);
  const prompt = buildMatrixAttackPrompt(attacker, defender, attempts, context.options.attackerMessages);
  if (context.options.offline || attacker.model.startsWith("scripted:")) {
    const result = await scriptedAttack(attacker, defender, attempts);
    return { text: result.text, prompt: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`, latencyMs: result.latencyMs };
  }

  const result = await runOpenRouterPrompt({
    model: attacker.model,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    temperature: context.options.temperature,
    maxTokens: context.options.maxTokens,
    signal
  });

  return { text: result.text, prompt: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`, latencyMs: result.latencyMs };
}

async function createDefenseResponse(
  context: RuntimeContext,
  attacker: ResolvedModel,
  defender: ResolvedModel,
  attempts: MatrixAttempt[],
  attackMessage: string,
  attemptNumber: number,
  signal?: AbortSignal
): Promise<{ text: string; prompt: string; latencyMs: number }> {
  throwIfCancelled(signal);
  const prompt = buildMatrixDefensePrompt(
    defender,
    attacker,
    attempts,
    attackMessage,
    attemptNumber,
    context.options.attackerMessages
  );
  if (context.options.offline || defender.model.startsWith("scripted:")) {
    const result = await scriptedDefense(defender, attackMessage, attempts);
    return { text: result.text, prompt: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`, latencyMs: result.latencyMs };
  }

  const result = await runOpenRouterPrompt({
    model: defender.model,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    temperature: context.options.temperature,
    maxTokens: context.options.maxTokens,
    signal
  });

  return { text: result.text, prompt: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`, latencyMs: result.latencyMs };
}

function summarizeRows(models: ResolvedModel[], results: MatrixResult[]): MatrixRunRecord["rows"] {
  return models.map((model) => ({
    name: model.name,
    model: model.model,
    attackLeaks: results.filter((result) => result.attacker === model.name && result.status === "leaked").length,
    defendLeaks: results.filter((result) => result.defender === model.name && result.status === "leaked").length,
    defendRefusals: results.filter((result) => result.defender === model.name && result.status === "refused").length,
    errors: results.filter((result) => (result.attacker === model.name || result.defender === model.name) && result.status === "error").length
  }));
}

function finalizePairResult(attacker: ResolvedModel, defender: ResolvedModel, attempts: MatrixAttempt[]): MatrixResult {
  const finalAttempt = attempts[attempts.length - 1];
  if (!finalAttempt) {
    return {
      attacker: attacker.name,
      defender: defender.name,
      status: "error",
      attackMessage: "",
      defenderResponse: "",
      attackPrompt: "",
      defensePrompt: "",
      attackLatencyMs: 0,
      defenseLatencyMs: 0,
      errorText: "No attempts recorded for pairing.",
      attempts: []
    };
  }

  const finalStatus = attempts.some((attempt) => attempt.status === "leaked")
    ? "leaked"
    : attempts.some((attempt) => attempt.status === "error")
      ? "error"
      : attempts.every((attempt) => attempt.status === "refused")
        ? "refused"
        : "resisted";

  return {
    attacker: attacker.name,
    defender: defender.name,
    status: finalStatus,
    attackMessage: finalAttempt.attackMessage,
    defenderResponse: finalAttempt.defenderResponse,
    attackPrompt: finalAttempt.attackPrompt,
    defensePrompt: finalAttempt.defensePrompt,
    errorText: finalAttempt.errorText,
    attackLatencyMs: finalAttempt.attackLatencyMs,
    defenseLatencyMs: finalAttempt.defenseLatencyMs,
    attempts
  };
}

export async function runMatrix(input: MatrixRunnerInput): Promise<MatrixRunRecord> {
  const { context, models, onProgress, signal } = input;
  context.db.createRun({
    runId: context.runId,
    mode: "matrix",
    configPath: context.options.configPath,
    configSnapshot: context.configSnapshot,
    options: context.options
  });
  context.db.storeModels(context.runId, models);

  const pairs = models.flatMap((attacker) => models.map((defender) => ({ attacker, defender })));
  const limit = pLimit(context.options.concurrency);
  const active = new Set<string>();
  const grid: Record<string, MatrixProgressEvent["grid"][string]> = {};
  const cells: Record<string, MatrixCellState> = {};
  let completed = 0;
  const results: MatrixResult[] = [];

  const update = (latest?: MatrixResult, latestCellKey?: string): void => {
    onProgress?.({
      kind: "matrix-update",
      completed,
      total: pairs.length,
      active: Array.from(active),
      latest,
      latestCellKey,
      grid: { ...grid },
      cells: { ...cells }
    });
  };

  await Promise.all(
    pairs.map(({ attacker, defender }) =>
      limit(async () => {
        if (signal?.aborted) {
          return;
        }

        const cellKey = `${attacker.name}::${defender.name}`;
        active.add(`${attacker.name} -> ${defender.name}`);
        grid[cellKey] = "running";
        cells[cellKey] = {
          attacker: attacker.name,
          defender: defender.name,
          status: "running",
          attackMessage: "",
          defenderResponse: "",
          attackPrompt: "",
          defensePrompt: "",
          attackLatencyMs: 0,
          defenseLatencyMs: 0,
          attempts: []
        };
        update(undefined, cellKey);

        let result: MatrixResult;
        try {
          const attempts: MatrixAttempt[] = [];

          for (let attemptNumber = 1; attemptNumber <= context.options.attackerMessages; attemptNumber += 1) {
            throwIfCancelled(signal);
            const attack = await createAttackMessage(context, attacker, defender, attempts, signal);
            const defense = await createDefenseResponse(context, attacker, defender, attempts, attack.text, attemptNumber, signal);
            const attempt: MatrixAttempt = {
              attemptNumber,
              status: statusFromResponse(defense.text, defender.secret),
              attackMessage: attack.text,
              defenderResponse: defense.text,
              attackPrompt: attack.prompt,
              defensePrompt: defense.prompt,
              attackLatencyMs: attack.latencyMs,
              defenseLatencyMs: defense.latencyMs
            };
            attempts.push(attempt);
            cells[cellKey] = {
              attacker: attacker.name,
              defender: defender.name,
              status: "running",
              attackMessage: attack.text,
              defenderResponse: defense.text,
              attackPrompt: attack.prompt,
              defensePrompt: defense.prompt,
              attackLatencyMs: attack.latencyMs,
              defenseLatencyMs: defense.latencyMs,
              attempts: [...attempts]
            };
            context.db.insertMatrixAttemptWithModels(context.runId, attacker, defender, attempt);
            update(undefined, cellKey);

            if (attempt.status === "leaked") {
              break;
            }
          }

          result = finalizePairResult(attacker, defender, attempts);
        } catch (error: unknown) {
          if (error instanceof RunCancelledError) {
            active.delete(`${attacker.name} -> ${defender.name}`);
            delete grid[cellKey];
            update(undefined, cellKey);
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          const errorAttempt: MatrixAttempt = {
            attemptNumber: 1,
            status: "error",
            attackMessage: "",
            defenderResponse: "",
            attackPrompt: "",
            defensePrompt: "",
            attackLatencyMs: 0,
            defenseLatencyMs: 0,
            errorText: message
          };
          result = {
            attacker: attacker.name,
            defender: defender.name,
            status: "error",
            attackMessage: "",
            defenderResponse: "",
            attackPrompt: "",
            defensePrompt: "",
            attackLatencyMs: 0,
            defenseLatencyMs: 0,
            errorText: message,
            attempts: [errorAttempt]
          };
          context.db.insertMatrixAttemptWithModels(context.runId, attacker, defender, errorAttempt);
        }

        results.push(result);
        context.db.insertMatrixResultWithModels(context.runId, attacker, defender, result);
        active.delete(`${attacker.name} -> ${defender.name}`);
        grid[cellKey] = result.status;
        cells[cellKey] = result;
        completed += 1;
        update(result, cellKey);
      })
    )
  );

  const record: MatrixRunRecord = {
    runId: context.runId,
    mode: "matrix",
    status: signal?.aborted ? "cancelled" : "completed",
    rows: summarizeRows(models, results),
    results
  };

  context.db.finishRun(context.runId, record.status, record.status === "cancelled" ? "cancelled by user" : undefined);
  return record;
}
