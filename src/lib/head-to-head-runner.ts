import { buildHeadToHeadAttackPrompt, buildHeadToHeadDefensePrompt } from "./prompts.js";
import { runOpenRouterPrompt } from "./openrouter.js";
import type { RuntimeContext } from "./runtime.js";
import { scriptedHeadToHeadTurn } from "./scripted.js";
import { RunCancelledError, statusFromResponse, throwIfCancelled } from "./utils.js";
import type { HeadToHeadProgressEvent, HeadToHeadResult, HeadToHeadTurn, ResolvedModel } from "./types.js";

interface HeadToHeadInput {
  context: RuntimeContext;
  left: ResolvedModel;
  right: ResolvedModel;
  rounds: number;
  onProgress?: (event: HeadToHeadProgressEvent) => void;
  signal?: AbortSignal;
}

async function runAttack(context: RuntimeContext, actor: ResolvedModel, target: ResolvedModel, round: number, transcript: HeadToHeadTurn[], signal?: AbortSignal): Promise<{ text: string; prompt: string; latencyMs: number }> {
  throwIfCancelled(signal);
  const prompt = buildHeadToHeadAttackPrompt(actor, target, round, transcript);
  if (context.options.offline || actor.model.startsWith("scripted:")) {
    const result = await scriptedHeadToHeadTurn({ actor, target, transcript, phase: "attack" });
    return { text: result.text, prompt: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`, latencyMs: result.latencyMs };
  }

  const result = await runOpenRouterPrompt({
    model: actor.model,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    temperature: context.options.temperature,
    maxTokens: context.options.maxTokens,
    signal
  });

  return { text: result.text, prompt: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`, latencyMs: result.latencyMs };
}

async function runDefense(context: RuntimeContext, defender: ResolvedModel, attacker: ResolvedModel, round: number, transcript: HeadToHeadTurn[], incomingMessage: string, signal?: AbortSignal): Promise<{ text: string; prompt: string; latencyMs: number; status: HeadToHeadTurn["status"] }> {
  throwIfCancelled(signal);
  const prompt = buildHeadToHeadDefensePrompt(defender, attacker, round, transcript, incomingMessage);
  if (context.options.offline || defender.model.startsWith("scripted:")) {
    const result = await scriptedHeadToHeadTurn({ actor: defender, target: attacker, transcript, phase: "defense", incomingText: incomingMessage });
    return {
      text: result.text,
      prompt: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`,
      latencyMs: result.latencyMs,
      status: statusFromResponse(result.text, defender.secret)
    };
  }

  const result = await runOpenRouterPrompt({
    model: defender.model,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    temperature: context.options.temperature,
    maxTokens: context.options.maxTokens,
    signal
  });

  return {
    text: result.text,
    prompt: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`,
    latencyMs: result.latencyMs,
    status: statusFromResponse(result.text, defender.secret)
  };
}

export async function runHeadToHead(input: HeadToHeadInput): Promise<HeadToHeadResult> {
  const { context, left, right, rounds, onProgress, signal } = input;
  context.db.createRun({
    runId: context.runId,
    mode: "head-to-head",
    configPath: context.options.configPath,
    configSnapshot: context.configSnapshot,
    options: context.options
  });
  context.db.storeModels(context.runId, [left, right]);
  context.db.createHeadToHeadMatch(context.runId, left, right, rounds);

  const turns: HeadToHeadTurn[] = [];
  let outcome: HeadToHeadResult["outcome"] = "draw";

  const emit = (latest?: HeadToHeadTurn): void => {
    onProgress?.({
      kind: "head-to-head-update",
      latest,
      completedTurns: turns.length,
      totalTurns: rounds * 4,
      outcome
    });
  };

  const performExchange = async (round: number, attacker: ResolvedModel, defender: ResolvedModel): Promise<boolean> => {
    try {
      throwIfCancelled(signal);
      const attack = await runAttack(context, attacker, defender, round, turns, signal);
      const attackTurn: HeadToHeadTurn = {
        round,
        actor: attacker.name,
        target: defender.name,
        phase: "attack",
        text: attack.text,
        prompt: attack.prompt,
        latencyMs: attack.latencyMs,
        status: "resisted"
      };
      turns.push(attackTurn);
      context.db.insertHeadToHeadTurn(context.runId, attackTurn);
      emit(attackTurn);

      const defense = await runDefense(context, defender, attacker, round, turns, attack.text, signal);
      const defenseTurn: HeadToHeadTurn = {
        round,
        actor: defender.name,
        target: attacker.name,
        phase: "defense",
        text: defense.text,
        prompt: defense.prompt,
        latencyMs: defense.latencyMs,
        status: defense.status,
        leakedSecretOwner: defense.status === "leaked" ? defender.name : undefined
      };
      turns.push(defenseTurn);
      context.db.insertHeadToHeadTurn(context.runId, defenseTurn);
      emit(defenseTurn);

      if (defense.status === "leaked") {
        outcome = attacker.name === left.name ? "left-broke-right" : "right-broke-left";
        return true;
      }
    } catch (error: unknown) {
      if (error instanceof RunCancelledError) {
        return true;
      }
      const message = error instanceof Error ? error.message : String(error);
      const errorTurn: HeadToHeadTurn = {
        round,
        actor: defender.name,
        target: attacker.name,
        phase: "defense",
        text: "",
        prompt: "",
        latencyMs: 0,
        status: "error",
        errorText: message
      };
      turns.push(errorTurn);
      context.db.insertHeadToHeadTurn(context.runId, errorTurn);
      outcome = "error";
      emit(errorTurn);
      return true;
    }

    return false;
  };

  for (let round = 1; round <= rounds; round += 1) {
    const leftWon = await performExchange(round, left, right);
    if (leftWon && context.options.stopOnLeak) {
      break;
    }

    const rightWon = await performExchange(round, right, left);
    if (rightWon && context.options.stopOnLeak) {
      break;
    }
  }

  const result: HeadToHeadResult = {
    runId: context.runId,
    mode: "head-to-head",
    status: signal?.aborted ? "cancelled" : turns.some((turn) => turn.status === "error") ? "failed" : "completed",
    left,
    right,
    outcome,
    turns
  };

  context.db.updateHeadToHeadMatch(result);
  context.db.finishRun(
    context.runId,
    result.status,
    result.status === "cancelled" ? "cancelled by user" : outcome
  );
  return result;
}
