import { buildHeadToHeadAttackPrompt, buildHeadToHeadDefensePrompt } from "./prompts.js";
import { ownerIdentityForModel } from "./owners.js";
import { runOpenRouterPrompt } from "./openrouter.js";
import type { RuntimeContext } from "./runtime.js";
import { scriptedHeadToHeadTurn } from "./scripted.js";
import { RunCancelledError, statusFromResponse, throwIfCancelled } from "./utils.js";
import type { HeadToHeadProgressEvent, HeadToHeadResult, HeadToHeadTurn, ResolvedModel } from "./types.js";

interface HeadToHeadInput {
  context: RuntimeContext;
  left: ResolvedModel;
  right: ResolvedModel;
  onProgress?: (event: HeadToHeadProgressEvent) => void;
  signal?: AbortSignal;
}

async function runAttack(
  context: RuntimeContext,
  actor: ResolvedModel,
  target: ResolvedModel,
  prompt: { systemPrompt: string; userPrompt: string },
  transcript: HeadToHeadTurn[],
  signal?: AbortSignal
): Promise<{ text: string; prompt: string; latencyMs: number; generationId?: string; usage?: import("./types.js").UsageMetrics }> {
  throwIfCancelled(signal);
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

  return {
    text: result.text,
    prompt: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`,
    latencyMs: result.latencyMs,
    generationId: result.generationId,
    usage: result.usage
  };
}

async function runDefense(
  context: RuntimeContext,
  defender: ResolvedModel,
  attacker: ResolvedModel,
  prompt: { systemPrompt: string; userPrompt: string },
  transcript: HeadToHeadTurn[],
  incomingMessage: string,
  signal?: AbortSignal
): Promise<{ text: string; prompt: string; latencyMs: number; status: HeadToHeadTurn["status"]; generationId?: string; usage?: import("./types.js").UsageMetrics }> {
  throwIfCancelled(signal);
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
    status: statusFromResponse(result.text, defender.secret),
    generationId: result.generationId,
    usage: result.usage
  };
}

export async function runHeadToHead(input: HeadToHeadInput): Promise<HeadToHeadResult> {
  const { context, left, right, onProgress, signal } = input;
  context.db.createRun({
    runId: context.runId,
    mode: "head-to-head",
    configPath: context.options.configPath,
    configSnapshot: context.configSnapshot,
    options: context.options
  });
  context.db.storeModels(context.runId, [left, right]);
  context.db.createHeadToHeadMatch(context.runId, left, right, 2);

  const turns: HeadToHeadTurn[] = [];
  let outcome: HeadToHeadResult["outcome"] = "draw";

  const emit = (latest?: HeadToHeadTurn): void => {
    onProgress?.({
      kind: "head-to-head-update",
      latest,
      completedTurns: turns.filter((turn) => turn.phase === "defense").length,
      totalTurns: 2,
      outcome
    });
  };

  const performExchange = async (
    sequence: number,
    attacker: ResolvedModel,
    defender: ResolvedModel
  ): Promise<"leaked" | "defended" | "error" | "cancelled"> => {
    const attackerOwner = ownerIdentityForModel(attacker);
    const defenderOwner = ownerIdentityForModel(defender);
    try {
      throwIfCancelled(signal);
      const attackPrompt = buildHeadToHeadAttackPrompt(attacker, defender, turns);
      const attackPromptText = `${attackPrompt.systemPrompt}\n\n${attackPrompt.userPrompt}`;
      let attack;
      try {
        attack = await runAttack(context, attacker, defender, attackPrompt, turns, signal);
      } catch (error: unknown) {
        if (error instanceof RunCancelledError) {
          return "cancelled";
        }
        const message = error instanceof Error ? error.message : String(error);
        const errorTurn: HeadToHeadTurn = {
          round: sequence,
          actor: attacker.name,
          actorOwnerName: attackerOwner.name,
          actorOwnerNameGroup: attackerOwner.group,
          actorOwnerNameSetVersion: attackerOwner.setVersion,
          target: defender.name,
          targetOwnerName: defenderOwner.name,
          targetOwnerNameGroup: defenderOwner.group,
          targetOwnerNameSetVersion: defenderOwner.setVersion,
          phase: "attack",
          text: "",
          prompt: attackPromptText,
          latencyMs: 0,
          status: "error",
          errorText: message,
          generationId: undefined,
          usage: undefined
        };
        turns.push(errorTurn);
        context.db.insertHeadToHeadTurn(context.runId, errorTurn);
        emit(errorTurn);
        return "error";
      }

      const attackTurn: HeadToHeadTurn = {
        round: sequence,
        actor: attacker.name,
        actorOwnerName: attackerOwner.name,
        actorOwnerNameGroup: attackerOwner.group,
        actorOwnerNameSetVersion: attackerOwner.setVersion,
        target: defender.name,
        targetOwnerName: defenderOwner.name,
        targetOwnerNameGroup: defenderOwner.group,
        targetOwnerNameSetVersion: defenderOwner.setVersion,
        phase: "attack",
        text: attack.text,
        prompt: attack.prompt,
        latencyMs: attack.latencyMs,
        status: "resisted",
        generationId: attack.generationId,
        usage: attack.usage
      };
      turns.push(attackTurn);
      context.db.insertHeadToHeadTurn(context.runId, attackTurn);
      emit(attackTurn);

      const defensePrompt = buildHeadToHeadDefensePrompt(defender, attacker, turns, attack.text);
      const defensePromptText = `${defensePrompt.systemPrompt}\n\n${defensePrompt.userPrompt}`;
      let defense;
      try {
        defense = await runDefense(context, defender, attacker, defensePrompt, turns, attack.text, signal);
      } catch (error: unknown) {
        if (error instanceof RunCancelledError) {
          return "cancelled";
        }
        const message = error instanceof Error ? error.message : String(error);
        const errorTurn: HeadToHeadTurn = {
          round: sequence,
          actor: defender.name,
          actorOwnerName: defenderOwner.name,
          actorOwnerNameGroup: defenderOwner.group,
          actorOwnerNameSetVersion: defenderOwner.setVersion,
          target: attacker.name,
          targetOwnerName: attackerOwner.name,
          targetOwnerNameGroup: attackerOwner.group,
          targetOwnerNameSetVersion: attackerOwner.setVersion,
          phase: "defense",
          text: "",
          prompt: defensePromptText,
          latencyMs: 0,
          status: "error",
          errorText: message,
          generationId: undefined,
          usage: undefined
        };
        turns.push(errorTurn);
        context.db.insertHeadToHeadTurn(context.runId, errorTurn);
        emit(errorTurn);
        return "error";
      }

      const defenseTurn: HeadToHeadTurn = {
        round: sequence,
        actor: defender.name,
        actorOwnerName: defenderOwner.name,
        actorOwnerNameGroup: defenderOwner.group,
        actorOwnerNameSetVersion: defenderOwner.setVersion,
        target: attacker.name,
        targetOwnerName: attackerOwner.name,
        targetOwnerNameGroup: attackerOwner.group,
        targetOwnerNameSetVersion: attackerOwner.setVersion,
        phase: "defense",
        text: defense.text,
        prompt: defense.prompt,
        latencyMs: defense.latencyMs,
        status: defense.status,
        leakedSecretOwner: defense.status === "leaked" ? defender.name : undefined,
        generationId: defense.generationId,
        usage: defense.usage
      };
      turns.push(defenseTurn);
      context.db.insertHeadToHeadTurn(context.runId, defenseTurn);
      emit(defenseTurn);

      if (defense.status === "leaked") {
        return "leaked";
      }
    } catch (error: unknown) {
      if (error instanceof RunCancelledError) {
        return "cancelled";
      }
      const message = error instanceof Error ? error.message : String(error);
      const errorTurn: HeadToHeadTurn = {
        round: sequence,
        actor: defender.name,
        actorOwnerName: defenderOwner.name,
        actorOwnerNameGroup: defenderOwner.group,
        actorOwnerNameSetVersion: defenderOwner.setVersion,
        target: attacker.name,
        targetOwnerName: attackerOwner.name,
        targetOwnerNameGroup: attackerOwner.group,
        targetOwnerNameSetVersion: attackerOwner.setVersion,
        phase: "defense",
        text: "",
        prompt: "",
        latencyMs: 0,
        status: "error",
        errorText: message,
        generationId: undefined,
        usage: undefined
      };
      turns.push(errorTurn);
      context.db.insertHeadToHeadTurn(context.runId, errorTurn);
      emit(errorTurn);
      return "error";
    }

    return "defended";
  };

  const [leftExchangeResult, rightExchangeResult] = await Promise.all([
    performExchange(1, left, right),
    performExchange(2, right, left)
  ]);

  if (leftExchangeResult === "leaked" && rightExchangeResult === "leaked") {
    outcome = "double-leak";
  } else if (leftExchangeResult === "leaked") {
    outcome = "left-broke-right";
  } else if (rightExchangeResult === "leaked") {
    outcome = "right-broke-left";
  } else if (leftExchangeResult === "error" || rightExchangeResult === "error") {
    outcome = "error";
  } else {
    outcome = "draw";
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
