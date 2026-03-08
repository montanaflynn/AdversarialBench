import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import { ownerIdentityForModel } from "./owners.js";
import { nowIso } from "./utils.js";
import type {
  BenchmarkMode,
  HeadToHeadResult,
  HeadToHeadHistoryTurnDetail,
  HeadToHeadTurn,
  HistoryLeaderboardRow,
  LeakMatrixResultSummary,
  HistoryRunDetail,
  HistoryRunSummary,
  MatrixAttempt,
  MatrixHistoryAttemptDetail,
  MatrixHistoryResultSummary,
  MatrixResult,
  ResolvedModel,
  RunModelRow,
  RunRow,
  RunStatus,
  RuntimeOptions
} from "./types.js";

export class BenchmarkDatabase {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const resolvedPath = resolve(dbPath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        config_path TEXT NOT NULL,
        config_snapshot TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        concurrency INTEGER NOT NULL,
        temperature REAL NOT NULL,
        max_tokens INTEGER NOT NULL,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS run_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        slot INTEGER NOT NULL,
        name TEXT NOT NULL,
        model_ref TEXT NOT NULL,
        owner_name TEXT,
        owner_name_group TEXT,
        owner_name_set_version TEXT,
        persona TEXT,
        secret TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS matrix_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        attacker_name TEXT NOT NULL,
        attacker_model TEXT NOT NULL,
        attacker_owner_name TEXT,
        attacker_owner_name_group TEXT,
        attacker_owner_name_set_version TEXT,
        defender_name TEXT NOT NULL,
        defender_model TEXT NOT NULL,
        defender_owner_name TEXT,
        defender_owner_name_group TEXT,
        defender_owner_name_set_version TEXT,
        status TEXT NOT NULL,
        attack_prompt TEXT NOT NULL,
        attack_message TEXT NOT NULL,
        defense_prompt TEXT NOT NULL,
        defense_response TEXT NOT NULL,
        attack_latency_ms INTEGER NOT NULL,
        defense_latency_ms INTEGER NOT NULL,
        attack_generation_id TEXT,
        defense_generation_id TEXT,
        attack_prompt_tokens INTEGER,
        attack_completion_tokens INTEGER,
        attack_total_tokens INTEGER,
        attack_cost REAL,
        attack_usage_json TEXT,
        defense_prompt_tokens INTEGER,
        defense_completion_tokens INTEGER,
        defense_total_tokens INTEGER,
        defense_cost REAL,
        defense_usage_json TEXT,
        error_text TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS matrix_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        attacker_name TEXT NOT NULL,
        attacker_model TEXT NOT NULL,
        attacker_owner_name TEXT,
        attacker_owner_name_group TEXT,
        attacker_owner_name_set_version TEXT,
        defender_name TEXT NOT NULL,
        defender_model TEXT NOT NULL,
        defender_owner_name TEXT,
        defender_owner_name_group TEXT,
        defender_owner_name_set_version TEXT,
        attempt_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        attack_prompt TEXT NOT NULL,
        attack_message TEXT NOT NULL,
        defense_prompt TEXT NOT NULL,
        defense_response TEXT NOT NULL,
        attack_latency_ms INTEGER NOT NULL,
        defense_latency_ms INTEGER NOT NULL,
        attack_generation_id TEXT,
        defense_generation_id TEXT,
        attack_prompt_tokens INTEGER,
        attack_completion_tokens INTEGER,
        attack_total_tokens INTEGER,
        attack_cost REAL,
        attack_usage_json TEXT,
        defense_prompt_tokens INTEGER,
        defense_completion_tokens INTEGER,
        defense_total_tokens INTEGER,
        defense_cost REAL,
        defense_usage_json TEXT,
        error_text TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS head_to_head_matches (
        run_id TEXT PRIMARY KEY,
        left_name TEXT NOT NULL,
        left_model TEXT NOT NULL,
        left_owner_name TEXT,
        left_owner_name_group TEXT,
        left_owner_name_set_version TEXT,
        left_secret TEXT NOT NULL,
        right_name TEXT NOT NULL,
        right_model TEXT NOT NULL,
        right_owner_name TEXT,
        right_owner_name_group TEXT,
        right_owner_name_set_version TEXT,
        right_secret TEXT NOT NULL,
        rounds_planned INTEGER NOT NULL,
        rounds_completed INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error_text TEXT
      );

      CREATE TABLE IF NOT EXISTS head_to_head_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        actor_name TEXT NOT NULL,
        actor_owner_name TEXT,
        actor_owner_name_group TEXT,
        actor_owner_name_set_version TEXT,
        target_name TEXT NOT NULL,
        target_owner_name TEXT,
        target_owner_name_group TEXT,
        target_owner_name_set_version TEXT,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        response_text TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        generation_id TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        cost REAL,
        usage_json TEXT,
        leaked_secret_owner TEXT,
        error_text TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_matrix_results_run_id ON matrix_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_matrix_attempts_run_id ON matrix_attempts(run_id);
      CREATE INDEX IF NOT EXISTS idx_head_to_head_turns_run_id ON head_to_head_turns(run_id);
    `);

    this.ensureColumn("run_models", "owner_name", "TEXT");
    this.ensureColumn("run_models", "owner_name_group", "TEXT");
    this.ensureColumn("run_models", "owner_name_set_version", "TEXT");

    this.ensureColumn("matrix_results", "attacker_owner_name", "TEXT");
    this.ensureColumn("matrix_results", "attacker_owner_name_group", "TEXT");
    this.ensureColumn("matrix_results", "attacker_owner_name_set_version", "TEXT");
    this.ensureColumn("matrix_results", "defender_owner_name", "TEXT");
    this.ensureColumn("matrix_results", "defender_owner_name_group", "TEXT");
    this.ensureColumn("matrix_results", "defender_owner_name_set_version", "TEXT");
    this.ensureColumn("matrix_results", "attack_generation_id", "TEXT");
    this.ensureColumn("matrix_results", "defense_generation_id", "TEXT");
    this.ensureColumn("matrix_results", "attack_prompt_tokens", "INTEGER");
    this.ensureColumn("matrix_results", "attack_completion_tokens", "INTEGER");
    this.ensureColumn("matrix_results", "attack_total_tokens", "INTEGER");
    this.ensureColumn("matrix_results", "attack_cost", "REAL");
    this.ensureColumn("matrix_results", "attack_usage_json", "TEXT");
    this.ensureColumn("matrix_results", "defense_prompt_tokens", "INTEGER");
    this.ensureColumn("matrix_results", "defense_completion_tokens", "INTEGER");
    this.ensureColumn("matrix_results", "defense_total_tokens", "INTEGER");
    this.ensureColumn("matrix_results", "defense_cost", "REAL");
    this.ensureColumn("matrix_results", "defense_usage_json", "TEXT");

    this.ensureColumn("matrix_attempts", "attacker_owner_name", "TEXT");
    this.ensureColumn("matrix_attempts", "attacker_owner_name_group", "TEXT");
    this.ensureColumn("matrix_attempts", "attacker_owner_name_set_version", "TEXT");
    this.ensureColumn("matrix_attempts", "defender_owner_name", "TEXT");
    this.ensureColumn("matrix_attempts", "defender_owner_name_group", "TEXT");
    this.ensureColumn("matrix_attempts", "defender_owner_name_set_version", "TEXT");
    this.ensureColumn("matrix_attempts", "attack_generation_id", "TEXT");
    this.ensureColumn("matrix_attempts", "defense_generation_id", "TEXT");
    this.ensureColumn("matrix_attempts", "attack_prompt_tokens", "INTEGER");
    this.ensureColumn("matrix_attempts", "attack_completion_tokens", "INTEGER");
    this.ensureColumn("matrix_attempts", "attack_total_tokens", "INTEGER");
    this.ensureColumn("matrix_attempts", "attack_cost", "REAL");
    this.ensureColumn("matrix_attempts", "attack_usage_json", "TEXT");
    this.ensureColumn("matrix_attempts", "defense_prompt_tokens", "INTEGER");
    this.ensureColumn("matrix_attempts", "defense_completion_tokens", "INTEGER");
    this.ensureColumn("matrix_attempts", "defense_total_tokens", "INTEGER");
    this.ensureColumn("matrix_attempts", "defense_cost", "REAL");
    this.ensureColumn("matrix_attempts", "defense_usage_json", "TEXT");

    this.ensureColumn("head_to_head_matches", "left_owner_name", "TEXT");
    this.ensureColumn("head_to_head_matches", "left_owner_name_group", "TEXT");
    this.ensureColumn("head_to_head_matches", "left_owner_name_set_version", "TEXT");
    this.ensureColumn("head_to_head_matches", "right_owner_name", "TEXT");
    this.ensureColumn("head_to_head_matches", "right_owner_name_group", "TEXT");
    this.ensureColumn("head_to_head_matches", "right_owner_name_set_version", "TEXT");

    this.ensureColumn("head_to_head_turns", "actor_owner_name", "TEXT");
    this.ensureColumn("head_to_head_turns", "actor_owner_name_group", "TEXT");
    this.ensureColumn("head_to_head_turns", "actor_owner_name_set_version", "TEXT");
    this.ensureColumn("head_to_head_turns", "target_owner_name", "TEXT");
    this.ensureColumn("head_to_head_turns", "target_owner_name_group", "TEXT");
    this.ensureColumn("head_to_head_turns", "target_owner_name_set_version", "TEXT");
    this.ensureColumn("head_to_head_turns", "generation_id", "TEXT");
    this.ensureColumn("head_to_head_turns", "prompt_tokens", "INTEGER");
    this.ensureColumn("head_to_head_turns", "completion_tokens", "INTEGER");
    this.ensureColumn("head_to_head_turns", "total_tokens", "INTEGER");
    this.ensureColumn("head_to_head_turns", "cost", "REAL");
    this.ensureColumn("head_to_head_turns", "usage_json", "TEXT");

    // Split prompt columns
    this.ensureColumn("matrix_results", "attack_system_prompt", "TEXT");
    this.ensureColumn("matrix_results", "attack_user_prompt", "TEXT");
    this.ensureColumn("matrix_results", "defense_system_prompt", "TEXT");
    this.ensureColumn("matrix_results", "defense_user_prompt", "TEXT");

    this.ensureColumn("matrix_attempts", "attack_system_prompt", "TEXT");
    this.ensureColumn("matrix_attempts", "attack_user_prompt", "TEXT");
    this.ensureColumn("matrix_attempts", "defense_system_prompt", "TEXT");
    this.ensureColumn("matrix_attempts", "defense_user_prompt", "TEXT");

    this.ensureColumn("head_to_head_turns", "system_prompt", "TEXT");
    this.ensureColumn("head_to_head_turns", "user_prompt", "TEXT");

    // Auto-migrate: split existing concatenated prompts on first \n\n
    this.db.exec(`
      UPDATE matrix_results SET
        attack_system_prompt = substr(attack_prompt, 1, instr(attack_prompt, char(10)||char(10)) - 1),
        attack_user_prompt = substr(attack_prompt, instr(attack_prompt, char(10)||char(10)) + 2)
      WHERE attack_system_prompt IS NULL AND attack_prompt != '' AND instr(attack_prompt, char(10)||char(10)) > 0;

      UPDATE matrix_results SET
        defense_system_prompt = substr(defense_prompt, 1, instr(defense_prompt, char(10)||char(10)) - 1),
        defense_user_prompt = substr(defense_prompt, instr(defense_prompt, char(10)||char(10)) + 2)
      WHERE defense_system_prompt IS NULL AND defense_prompt != '' AND instr(defense_prompt, char(10)||char(10)) > 0;

      UPDATE matrix_attempts SET
        attack_system_prompt = substr(attack_prompt, 1, instr(attack_prompt, char(10)||char(10)) - 1),
        attack_user_prompt = substr(attack_prompt, instr(attack_prompt, char(10)||char(10)) + 2)
      WHERE attack_system_prompt IS NULL AND attack_prompt != '' AND instr(attack_prompt, char(10)||char(10)) > 0;

      UPDATE matrix_attempts SET
        defense_system_prompt = substr(defense_prompt, 1, instr(defense_prompt, char(10)||char(10)) - 1),
        defense_user_prompt = substr(defense_prompt, instr(defense_prompt, char(10)||char(10)) + 2)
      WHERE defense_system_prompt IS NULL AND defense_prompt != '' AND instr(defense_prompt, char(10)||char(10)) > 0;

      UPDATE head_to_head_turns SET
        system_prompt = substr(prompt_text, 1, instr(prompt_text, char(10)||char(10)) - 1),
        user_prompt = substr(prompt_text, instr(prompt_text, char(10)||char(10)) + 2)
      WHERE system_prompt IS NULL AND prompt_text != '' AND instr(prompt_text, char(10)||char(10)) > 0;
    `);
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }
    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  createRun(input: {
    runId: string;
    mode: BenchmarkMode;
    configPath: string;
    configSnapshot: string;
    options: RuntimeOptions;
  }): void {
    this.db.prepare(`
      INSERT INTO runs (run_id, mode, status, config_path, config_snapshot, started_at, finished_at, concurrency, temperature, max_tokens, notes)
      VALUES (@runId, @mode, 'running', @configPath, @configSnapshot, @startedAt, NULL, @concurrency, @temperature, @maxTokens, NULL)
    `).run({
      ...input,
      startedAt: nowIso(),
      concurrency: input.options.concurrency,
      temperature: input.options.temperature,
      maxTokens: input.options.maxTokens
    });
  }

  storeModels(runId: string, models: ResolvedModel[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO run_models (run_id, slot, name, model_ref, owner_name, owner_name_group, owner_name_set_version, persona, secret)
      VALUES (@runId, @slot, @name, @model, @ownerName, @ownerNameGroup, @ownerNameSetVersion, @persona, @secret)
    `);
    const transaction = this.db.transaction((entries: ResolvedModel[]) => {
      for (const model of entries) {
        const owner = ownerIdentityForModel(model);
        stmt.run({
          runId,
          ...model,
          ownerName: owner.name,
          ownerNameGroup: owner.group,
          ownerNameSetVersion: owner.setVersion
        });
      }
    });
    transaction(models);
  }

  finishRun(runId: string, status: RunStatus, notes?: string): void {
    this.db.prepare(`
      UPDATE runs
      SET status = @status,
          finished_at = @finishedAt,
          notes = @notes
      WHERE run_id = @runId
    `).run({
      runId,
      status,
      finishedAt: nowIso(),
      notes: notes ?? null
    });
  }

  insertMatrixResult(runId: string, result: MatrixResult): void {
    this.db.prepare(`
      INSERT INTO matrix_results (
        run_id, attacker_name, attacker_model, defender_name, defender_model, status,
        attacker_owner_name, attacker_owner_name_group, attacker_owner_name_set_version,
        defender_owner_name, defender_owner_name_group, defender_owner_name_set_version,
        attack_prompt, attack_system_prompt, attack_user_prompt,
        attack_message, defense_prompt, defense_system_prompt, defense_user_prompt,
        defense_response,
        attack_latency_ms, defense_latency_ms,
        attack_generation_id, defense_generation_id,
        attack_prompt_tokens, attack_completion_tokens, attack_total_tokens, attack_cost, attack_usage_json,
        defense_prompt_tokens, defense_completion_tokens, defense_total_tokens, defense_cost, defense_usage_json,
        error_text, started_at, finished_at
      ) VALUES (
        @runId, @attackerName, @attackerModel, @defenderName, @defenderModel, @status,
        @attackerOwnerName, @attackerOwnerNameGroup, @attackerOwnerNameSetVersion,
        @defenderOwnerName, @defenderOwnerNameGroup, @defenderOwnerNameSetVersion,
        @attackPrompt, @attackSystemPrompt, @attackUserPrompt,
        @attackMessage, @defensePrompt, @defenseSystemPrompt, @defenseUserPrompt,
        @defenseResponse,
        @attackLatencyMs, @defenseLatencyMs,
        @attackGenerationId, @defenseGenerationId,
        @attackPromptTokens, @attackCompletionTokens, @attackTotalTokens, @attackCost, @attackUsageJson,
        @defensePromptTokens, @defenseCompletionTokens, @defenseTotalTokens, @defenseCost, @defenseUsageJson,
        @errorText, @startedAt, @finishedAt
      )
    `).run({
      runId,
      attackerName: result.attacker,
      attackerModel: "",
      defenderName: result.defender,
      defenderModel: "",
      attackerOwnerName: null,
      attackerOwnerNameGroup: null,
      attackerOwnerNameSetVersion: null,
      defenderOwnerName: null,
      defenderOwnerNameGroup: null,
      defenderOwnerNameSetVersion: null,
      status: result.status,
      attackPrompt: result.attackPrompt,
      attackSystemPrompt: result.attackSystemPrompt ?? null,
      attackUserPrompt: result.attackUserPrompt ?? null,
      attackMessage: result.attackMessage,
      defensePrompt: result.defensePrompt,
      defenseSystemPrompt: result.defenseSystemPrompt ?? null,
      defenseUserPrompt: result.defenseUserPrompt ?? null,
      defenseResponse: result.defenderResponse,
      attackLatencyMs: result.attackLatencyMs,
      defenseLatencyMs: result.defenseLatencyMs,
      attackGenerationId: result.attackGenerationId ?? null,
      defenseGenerationId: result.defenseGenerationId ?? null,
      attackPromptTokens: result.attackUsage?.promptTokens ?? null,
      attackCompletionTokens: result.attackUsage?.completionTokens ?? null,
      attackTotalTokens: result.attackUsage?.totalTokens ?? null,
      attackCost: result.attackUsage?.cost ?? null,
      attackUsageJson: result.attackUsage?.rawJson ?? null,
      defensePromptTokens: result.defenseUsage?.promptTokens ?? null,
      defenseCompletionTokens: result.defenseUsage?.completionTokens ?? null,
      defenseTotalTokens: result.defenseUsage?.totalTokens ?? null,
      defenseCost: result.defenseUsage?.cost ?? null,
      defenseUsageJson: result.defenseUsage?.rawJson ?? null,
      errorText: result.errorText ?? null,
      startedAt: nowIso(),
      finishedAt: nowIso()
    });
  }

  insertMatrixResultWithModels(runId: string, attackerModel: ResolvedModel, defenderModel: ResolvedModel, result: MatrixResult): void {
    const attackerOwner = ownerIdentityForModel(attackerModel);
    const defenderOwner = ownerIdentityForModel(defenderModel);
    this.db.prepare(`
      INSERT INTO matrix_results (
        run_id, attacker_name, attacker_model, defender_name, defender_model, status,
        attacker_owner_name, attacker_owner_name_group, attacker_owner_name_set_version,
        defender_owner_name, defender_owner_name_group, defender_owner_name_set_version,
        attack_prompt, attack_system_prompt, attack_user_prompt,
        attack_message, defense_prompt, defense_system_prompt, defense_user_prompt,
        defense_response,
        attack_latency_ms, defense_latency_ms,
        attack_generation_id, defense_generation_id,
        attack_prompt_tokens, attack_completion_tokens, attack_total_tokens, attack_cost, attack_usage_json,
        defense_prompt_tokens, defense_completion_tokens, defense_total_tokens, defense_cost, defense_usage_json,
        error_text, started_at, finished_at
      ) VALUES (
        @runId, @attackerName, @attackerModel, @defenderName, @defenderModel, @status,
        @attackerOwnerName, @attackerOwnerNameGroup, @attackerOwnerNameSetVersion,
        @defenderOwnerName, @defenderOwnerNameGroup, @defenderOwnerNameSetVersion,
        @attackPrompt, @attackSystemPrompt, @attackUserPrompt,
        @attackMessage, @defensePrompt, @defenseSystemPrompt, @defenseUserPrompt,
        @defenseResponse,
        @attackLatencyMs, @defenseLatencyMs,
        @attackGenerationId, @defenseGenerationId,
        @attackPromptTokens, @attackCompletionTokens, @attackTotalTokens, @attackCost, @attackUsageJson,
        @defensePromptTokens, @defenseCompletionTokens, @defenseTotalTokens, @defenseCost, @defenseUsageJson,
        @errorText, @startedAt, @finishedAt
      )
    `).run({
      runId,
      attackerName: attackerModel.name,
      attackerModel: attackerModel.model,
      attackerOwnerName: attackerOwner.name,
      attackerOwnerNameGroup: attackerOwner.group,
      attackerOwnerNameSetVersion: attackerOwner.setVersion,
      defenderName: defenderModel.name,
      defenderModel: defenderModel.model,
      defenderOwnerName: defenderOwner.name,
      defenderOwnerNameGroup: defenderOwner.group,
      defenderOwnerNameSetVersion: defenderOwner.setVersion,
      status: result.status,
      attackPrompt: result.attackPrompt,
      attackSystemPrompt: result.attackSystemPrompt ?? null,
      attackUserPrompt: result.attackUserPrompt ?? null,
      attackMessage: result.attackMessage,
      defensePrompt: result.defensePrompt,
      defenseSystemPrompt: result.defenseSystemPrompt ?? null,
      defenseUserPrompt: result.defenseUserPrompt ?? null,
      defenseResponse: result.defenderResponse,
      attackLatencyMs: result.attackLatencyMs,
      defenseLatencyMs: result.defenseLatencyMs,
      attackGenerationId: result.attackGenerationId ?? null,
      defenseGenerationId: result.defenseGenerationId ?? null,
      attackPromptTokens: result.attackUsage?.promptTokens ?? null,
      attackCompletionTokens: result.attackUsage?.completionTokens ?? null,
      attackTotalTokens: result.attackUsage?.totalTokens ?? null,
      attackCost: result.attackUsage?.cost ?? null,
      attackUsageJson: result.attackUsage?.rawJson ?? null,
      defensePromptTokens: result.defenseUsage?.promptTokens ?? null,
      defenseCompletionTokens: result.defenseUsage?.completionTokens ?? null,
      defenseTotalTokens: result.defenseUsage?.totalTokens ?? null,
      defenseCost: result.defenseUsage?.cost ?? null,
      defenseUsageJson: result.defenseUsage?.rawJson ?? null,
      errorText: result.errorText ?? null,
      startedAt: nowIso(),
      finishedAt: nowIso()
    });
  }

  insertMatrixAttemptWithModels(
    runId: string,
    attackerModel: ResolvedModel,
    defenderModel: ResolvedModel,
    attempt: MatrixAttempt
  ): void {
    const attackerOwner = ownerIdentityForModel(attackerModel);
    const defenderOwner = ownerIdentityForModel(defenderModel);
    this.db.prepare(`
      INSERT INTO matrix_attempts (
        run_id, attacker_name, attacker_model, defender_name, defender_model, attempt_number, status,
        attacker_owner_name, attacker_owner_name_group, attacker_owner_name_set_version,
        defender_owner_name, defender_owner_name_group, defender_owner_name_set_version,
        attack_prompt, attack_system_prompt, attack_user_prompt,
        attack_message, defense_prompt, defense_system_prompt, defense_user_prompt,
        defense_response,
        attack_latency_ms, defense_latency_ms,
        attack_generation_id, defense_generation_id,
        attack_prompt_tokens, attack_completion_tokens, attack_total_tokens, attack_cost, attack_usage_json,
        defense_prompt_tokens, defense_completion_tokens, defense_total_tokens, defense_cost, defense_usage_json,
        error_text, created_at
      ) VALUES (
        @runId, @attackerName, @attackerModel, @defenderName, @defenderModel, @attemptNumber, @status,
        @attackerOwnerName, @attackerOwnerNameGroup, @attackerOwnerNameSetVersion,
        @defenderOwnerName, @defenderOwnerNameGroup, @defenderOwnerNameSetVersion,
        @attackPrompt, @attackSystemPrompt, @attackUserPrompt,
        @attackMessage, @defensePrompt, @defenseSystemPrompt, @defenseUserPrompt,
        @defenseResponse,
        @attackLatencyMs, @defenseLatencyMs,
        @attackGenerationId, @defenseGenerationId,
        @attackPromptTokens, @attackCompletionTokens, @attackTotalTokens, @attackCost, @attackUsageJson,
        @defensePromptTokens, @defenseCompletionTokens, @defenseTotalTokens, @defenseCost, @defenseUsageJson,
        @errorText, @createdAt
      )
    `).run({
      runId,
      attackerName: attackerModel.name,
      attackerModel: attackerModel.model,
      attackerOwnerName: attackerOwner.name,
      attackerOwnerNameGroup: attackerOwner.group,
      attackerOwnerNameSetVersion: attackerOwner.setVersion,
      defenderName: defenderModel.name,
      defenderModel: defenderModel.model,
      defenderOwnerName: defenderOwner.name,
      defenderOwnerNameGroup: defenderOwner.group,
      defenderOwnerNameSetVersion: defenderOwner.setVersion,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      attackPrompt: attempt.attackPrompt,
      attackSystemPrompt: attempt.attackSystemPrompt ?? null,
      attackUserPrompt: attempt.attackUserPrompt ?? null,
      attackMessage: attempt.attackMessage,
      defensePrompt: attempt.defensePrompt,
      defenseSystemPrompt: attempt.defenseSystemPrompt ?? null,
      defenseUserPrompt: attempt.defenseUserPrompt ?? null,
      defenseResponse: attempt.defenderResponse,
      attackLatencyMs: attempt.attackLatencyMs,
      defenseLatencyMs: attempt.defenseLatencyMs,
      attackGenerationId: attempt.attackGenerationId ?? null,
      defenseGenerationId: attempt.defenseGenerationId ?? null,
      attackPromptTokens: attempt.attackUsage?.promptTokens ?? null,
      attackCompletionTokens: attempt.attackUsage?.completionTokens ?? null,
      attackTotalTokens: attempt.attackUsage?.totalTokens ?? null,
      attackCost: attempt.attackUsage?.cost ?? null,
      attackUsageJson: attempt.attackUsage?.rawJson ?? null,
      defensePromptTokens: attempt.defenseUsage?.promptTokens ?? null,
      defenseCompletionTokens: attempt.defenseUsage?.completionTokens ?? null,
      defenseTotalTokens: attempt.defenseUsage?.totalTokens ?? null,
      defenseCost: attempt.defenseUsage?.cost ?? null,
      defenseUsageJson: attempt.defenseUsage?.rawJson ?? null,
      errorText: attempt.errorText ?? null,
      createdAt: nowIso()
    });
  }

  createHeadToHeadMatch(runId: string, left: ResolvedModel, right: ResolvedModel, rounds: number): void {
    const leftOwner = ownerIdentityForModel(left);
    const rightOwner = ownerIdentityForModel(right);
    this.db.prepare(`
      INSERT INTO head_to_head_matches (
        run_id, left_name, left_model, left_secret, right_name, right_model, right_secret,
        left_owner_name, left_owner_name_group, left_owner_name_set_version,
        right_owner_name, right_owner_name_group, right_owner_name_set_version,
        rounds_planned, rounds_completed, outcome, started_at, finished_at, error_text
      ) VALUES (
        @runId, @leftName, @leftModel, @leftSecret, @rightName, @rightModel, @rightSecret,
        @leftOwnerName, @leftOwnerNameGroup, @leftOwnerNameSetVersion,
        @rightOwnerName, @rightOwnerNameGroup, @rightOwnerNameSetVersion,
        @roundsPlanned, 0, 'draw', @startedAt, NULL, NULL
      )
    `).run({
      runId,
      leftName: left.name,
      leftModel: left.model,
      leftOwnerName: leftOwner.name,
      leftOwnerNameGroup: leftOwner.group,
      leftOwnerNameSetVersion: leftOwner.setVersion,
      leftSecret: left.secret,
      rightName: right.name,
      rightModel: right.model,
      rightOwnerName: rightOwner.name,
      rightOwnerNameGroup: rightOwner.group,
      rightOwnerNameSetVersion: rightOwner.setVersion,
      rightSecret: right.secret,
      roundsPlanned: rounds,
      startedAt: nowIso()
    });
  }

  updateHeadToHeadMatch(result: HeadToHeadResult): void {
    this.db.prepare(`
      UPDATE head_to_head_matches
      SET rounds_completed = @roundsCompleted,
          outcome = @outcome,
          finished_at = @finishedAt,
          error_text = @errorText
      WHERE run_id = @runId
    `).run({
      runId: result.runId,
      roundsCompleted: Math.max(0, ...result.turns.map((turn) => turn.round)),
      outcome: result.outcome,
      finishedAt: nowIso(),
      errorText: result.outcome === "error" ? "head-to-head failed" : null
    });
  }

  insertHeadToHeadTurn(runId: string, turn: HeadToHeadTurn): void {
    this.db.prepare(`
      INSERT INTO head_to_head_turns (
        run_id, round_number, actor_name, target_name, phase, status,
        actor_owner_name, actor_owner_name_group, actor_owner_name_set_version,
        target_owner_name, target_owner_name_group, target_owner_name_set_version,
        prompt_text, system_prompt, user_prompt, response_text, latency_ms,
        generation_id, prompt_tokens, completion_tokens, total_tokens, cost, usage_json,
        leaked_secret_owner, error_text, created_at
      ) VALUES (
        @runId, @roundNumber, @actorName, @targetName, @phase, @status,
        @actorOwnerName, @actorOwnerNameGroup, @actorOwnerNameSetVersion,
        @targetOwnerName, @targetOwnerNameGroup, @targetOwnerNameSetVersion,
        @promptText, @systemPrompt, @userPrompt, @responseText, @latencyMs,
        @generationId, @promptTokens, @completionTokens, @totalTokens, @cost, @usageJson,
        @leakedSecretOwner, @errorText, @createdAt
      )
    `).run({
      runId,
      roundNumber: turn.round,
      actorName: turn.actor,
      actorOwnerName: turn.actorOwnerName ?? null,
      actorOwnerNameGroup: turn.actorOwnerNameGroup ?? null,
      actorOwnerNameSetVersion: turn.actorOwnerNameSetVersion ?? null,
      targetName: turn.target,
      targetOwnerName: turn.targetOwnerName ?? null,
      targetOwnerNameGroup: turn.targetOwnerNameGroup ?? null,
      targetOwnerNameSetVersion: turn.targetOwnerNameSetVersion ?? null,
      phase: turn.phase,
      status: turn.status,
      promptText: turn.prompt,
      systemPrompt: turn.systemPrompt ?? null,
      userPrompt: turn.userPrompt ?? null,
      responseText: turn.text,
      latencyMs: turn.latencyMs,
      generationId: turn.generationId ?? null,
      promptTokens: turn.usage?.promptTokens ?? null,
      completionTokens: turn.usage?.completionTokens ?? null,
      totalTokens: turn.usage?.totalTokens ?? null,
      cost: turn.usage?.cost ?? null,
      usageJson: turn.usage?.rawJson ?? null,
      leakedSecretOwner: turn.leakedSecretOwner ?? null,
      errorText: turn.errorText ?? null,
      createdAt: nowIso()
    });
  }

  getRun(runId: string): RunRow | undefined {
    return this.db.prepare(`SELECT * FROM runs WHERE run_id = ?`).get(runId) as RunRow | undefined;
  }

  getRunModels(runId: string): RunModelRow[] {
    return this.db.prepare(`
      SELECT
        slot,
        name,
        model_ref AS modelRef,
        owner_name AS ownerName,
        owner_name_group AS ownerNameGroup,
        owner_name_set_version AS ownerNameSetVersion,
        persona,
        secret
      FROM run_models
      WHERE run_id = ?
      ORDER BY slot ASC
    `).all(runId) as RunModelRow[];
  }

  listHistoryRuns(limit = 50): HistoryRunSummary[] {
    return this.db.prepare(`
      SELECT
        runs.run_id AS runId,
        runs.mode AS mode,
        runs.status AS status,
        runs.started_at AS startedAt,
        runs.finished_at AS finishedAt,
        runs.config_path AS configPath,
        COALESCE(matrix_counts.total_items, head_counts.total_items, 0) AS totalItems,
        COALESCE(matrix_counts.leak_count, head_counts.leak_count, 0) AS leakCount,
        COALESCE(matrix_counts.defended_count, head_counts.defended_count, 0) AS defendedCount,
        COALESCE(matrix_counts.error_count, head_counts.error_count, 0) AS errorCount
      FROM runs
      LEFT JOIN (
        SELECT
          run_id,
          COUNT(*) AS total_items,
          SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
          SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM matrix_results
        GROUP BY run_id
      ) AS matrix_counts ON matrix_counts.run_id = runs.run_id
      LEFT JOIN (
        SELECT
          run_id,
          COUNT(*) AS total_items,
          SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
          SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM head_to_head_turns
        GROUP BY run_id
      ) AS head_counts ON head_counts.run_id = runs.run_id
      ORDER BY runs.started_at DESC
      LIMIT ?
    `).all(limit) as HistoryRunSummary[];
  }

  getHistoryRunDetail(runId: string): HistoryRunDetail | undefined {
    return this.db.prepare(`
      SELECT
        runs.run_id AS runId,
        runs.mode AS mode,
        runs.status AS status,
        runs.started_at AS startedAt,
        runs.finished_at AS finishedAt,
        runs.config_path AS configPath,
        runs.concurrency AS concurrency,
        runs.temperature AS temperature,
        runs.max_tokens AS maxTokens,
        runs.notes AS notes,
        COALESCE(matrix_counts.total_items, head_counts.total_items, 0) AS totalItems,
        COALESCE(matrix_counts.leak_count, head_counts.leak_count, 0) AS leakCount,
        COALESCE(matrix_counts.defended_count, head_counts.defended_count, 0) AS defendedCount,
        COALESCE(matrix_counts.error_count, head_counts.error_count, 0) AS errorCount
      FROM runs
      LEFT JOIN (
        SELECT
          run_id,
          COUNT(*) AS total_items,
          SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
          SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM matrix_results
        GROUP BY run_id
      ) AS matrix_counts ON matrix_counts.run_id = runs.run_id
      LEFT JOIN (
        SELECT
          run_id,
          COUNT(*) AS total_items,
          SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
          SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM head_to_head_turns
        GROUP BY run_id
      ) AS head_counts ON head_counts.run_id = runs.run_id
      WHERE runs.run_id = ?
    `).get(runId) as HistoryRunDetail | undefined;
  }

  private computeEloRatings(): { attack: Map<string, number>; defense: Map<string, number>; combined: Map<string, number> } {
    const matches = this.db.prepare(`
      SELECT attacker_name AS attacker, defender_name AS defender, status, finished_at AS ts
      FROM matrix_results
      WHERE status != 'error'
      UNION ALL
      SELECT target_name AS attacker, actor_name AS defender, status, created_at AS ts
      FROM head_to_head_turns
      WHERE phase = 'defense' AND status != 'error'
      ORDER BY ts ASC
    `).all() as Array<{ attacker: string; defender: string; status: string; ts: string }>;

    const attackRatings = new Map<string, number>();
    const defenseRatings = new Map<string, number>();
    const K = 32;
    const getRating = (map: Map<string, number>, name: string): number => {
      if (!map.has(name)) map.set(name, 1500);
      return map.get(name)!;
    };

    const combinedRatings = new Map<string, number>();

    for (const m of matches) {
      const leaked = m.status === 'leaked';

      // Attack Elo (win/loss only)
      const rA = getRating(attackRatings, m.attacker);
      const rAopp = getRating(attackRatings, m.defender);
      const eA = 1 / (1 + Math.pow(10, (rAopp - rA) / 400));
      attackRatings.set(m.attacker, rA + K * ((leaked ? 1.0 : 0.0) - eA));

      // Defense Elo (win/loss only)
      const rD = getRating(defenseRatings, m.defender);
      const rDopp = getRating(defenseRatings, m.attacker);
      const eD = 1 / (1 + Math.pow(10, (rDopp - rD) / 400));
      defenseRatings.set(m.defender, rD + K * ((leaked ? 0.0 : 1.0) - eD));

      // Combined Elo (chess-style: leak = attacker win, no leak = draw)
      const rCA = getRating(combinedRatings, m.attacker);
      const rCD = getRating(combinedRatings, m.defender);
      const eCA = 1 / (1 + Math.pow(10, (rCD - rCA) / 400));
      const eCD = 1 - eCA;
      const sA = leaked ? 1.0 : 0.5;
      const sD = leaked ? 0.0 : 0.5;
      combinedRatings.set(m.attacker, rCA + K * (sA - eCA));
      combinedRatings.set(m.defender, rCD + K * (sD - eCD));
    }

    return { attack: attackRatings, defense: defenseRatings, combined: combinedRatings };
  }

  listHistoryLeaderboard(limit = 20): HistoryLeaderboardRow[] {
    const { attack: attackElo, defense: defenseElo, combined: eloRatings } = this.computeEloRatings();
    const rows = this.db.prepare(`
      SELECT
        attack.name AS name,
        attack.model_ref AS modelRef,
        attack.attack_leaks AS attackLeaks,
        defense.defend_leaks AS defendLeaks,
        defense.defends AS defends,
        errors.error_count AS errors,
        attack.attack_cells AS attackCells,
        defense.defense_cells AS defenseCells,
        MAX(attack.last_seen_at, defense.last_seen_at, errors.last_seen_at) AS lastSeenAt
      FROM (
        SELECT
          attacker_name AS name,
          attacker_model AS model_ref,
          COUNT(*) AS attack_cells,
          SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS attack_leaks,
          MAX(finished_at) AS last_seen_at
        FROM matrix_results
        GROUP BY attacker_name, attacker_model
      ) AS attack
      JOIN (
        SELECT
          defender_name AS name,
          defender_model AS model_ref,
          COUNT(*) AS defense_cells,
          SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS defend_leaks,
          SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defends,
          MAX(finished_at) AS last_seen_at
        FROM matrix_results
        GROUP BY defender_name, defender_model
      ) AS defense
      ON attack.name = defense.name AND attack.model_ref = defense.model_ref
      JOIN (
        SELECT
          name,
          model_ref,
          SUM(error_count) AS error_count,
          MAX(last_seen_at) AS last_seen_at
        FROM (
          SELECT attacker_name AS name, attacker_model AS model_ref,
                 SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count,
                 MAX(finished_at) AS last_seen_at
          FROM matrix_results
          GROUP BY attacker_name, attacker_model
          UNION ALL
          SELECT defender_name AS name, defender_model AS model_ref,
                 SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count,
                 MAX(finished_at) AS last_seen_at
          FROM matrix_results
          GROUP BY defender_name, defender_model
        )
        GROUP BY name, model_ref
      ) AS errors
      ON attack.name = errors.name AND attack.model_ref = errors.model_ref
      LIMIT ?
    `).all(limit) as Array<Omit<HistoryLeaderboardRow, "elo">>;

    return rows.map(r => ({
      ...r,
      attackElo: Math.round(attackElo.get(r.name) ?? 1500),
      defenseElo: Math.round(defenseElo.get(r.name) ?? 1500),
      elo: Math.round(eloRatings.get(r.name) ?? 1500),
    })).sort((a, b) => b.elo - a.elo);
  }

  getMatrixResultsForRun(runId: string): MatrixHistoryResultSummary[] {
    return this.db.prepare(`
      SELECT
        attacker_name AS attackerName,
        attacker_model AS attackerModel,
        attacker_owner_name AS attackerOwnerName,
        attacker_owner_name_group AS attackerOwnerNameGroup,
        attacker_owner_name_set_version AS attackerOwnerNameSetVersion,
        defender_name AS defenderName,
        defender_model AS defenderModel,
        defender_owner_name AS defenderOwnerName,
        defender_owner_name_group AS defenderOwnerNameGroup,
        defender_owner_name_set_version AS defenderOwnerNameSetVersion,
        status,
        (
          SELECT COUNT(*)
          FROM matrix_attempts
          WHERE matrix_attempts.run_id = matrix_results.run_id
            AND matrix_attempts.attacker_name = matrix_results.attacker_name
            AND matrix_attempts.defender_name = matrix_results.defender_name
        ) AS attempts,
        attack_latency_ms AS attackLatencyMs,
        defense_latency_ms AS defenseLatencyMs,
        error_text AS errorText,
        finished_at AS finishedAt
      FROM matrix_results
      WHERE run_id = ?
      ORDER BY
        CASE status
          WHEN 'leaked' THEN 0
          WHEN 'error' THEN 1
          WHEN 'defended' THEN 2
          ELSE 3
        END,
        finished_at DESC,
        attacker_name ASC,
        defender_name ASC
    `).all(runId) as MatrixHistoryResultSummary[];
  }

  listLeakResults(limit = 200): LeakMatrixResultSummary[] {
    return this.db.prepare(`
      SELECT
        run_id AS runId,
        attacker_name AS attackerName,
        attacker_model AS attackerModel,
        attacker_owner_name AS attackerOwnerName,
        attacker_owner_name_group AS attackerOwnerNameGroup,
        attacker_owner_name_set_version AS attackerOwnerNameSetVersion,
        defender_name AS defenderName,
        defender_model AS defenderModel,
        defender_owner_name AS defenderOwnerName,
        defender_owner_name_group AS defenderOwnerNameGroup,
        defender_owner_name_set_version AS defenderOwnerNameSetVersion,
        status,
        (
          SELECT COUNT(*)
          FROM matrix_attempts
          WHERE matrix_attempts.run_id = matrix_results.run_id
            AND matrix_attempts.attacker_name = matrix_results.attacker_name
            AND matrix_attempts.defender_name = matrix_results.defender_name
        ) AS attempts,
        attack_latency_ms AS attackLatencyMs,
        defense_latency_ms AS defenseLatencyMs,
        error_text AS errorText,
        finished_at AS finishedAt
      FROM matrix_results
      WHERE status = 'leaked'
      ORDER BY finished_at DESC
      LIMIT ?
    `).all(limit) as LeakMatrixResultSummary[];
  }

  getMatrixAttemptsForPair(runId: string, attackerName: string, defenderName: string): MatrixHistoryAttemptDetail[] {
    return this.db.prepare(`
      SELECT
        attempt_number AS attemptNumber,
        status,
        attacker_owner_name AS attackerOwnerName,
        attacker_owner_name_group AS attackerOwnerNameGroup,
        attacker_owner_name_set_version AS attackerOwnerNameSetVersion,
        defender_owner_name AS defenderOwnerName,
        defender_owner_name_group AS defenderOwnerNameGroup,
        defender_owner_name_set_version AS defenderOwnerNameSetVersion,
        attack_prompt AS attackPrompt,
        attack_system_prompt AS attackSystemPrompt,
        attack_user_prompt AS attackUserPrompt,
        attack_message AS attackMessage,
        defense_prompt AS defensePrompt,
        defense_system_prompt AS defenseSystemPrompt,
        defense_user_prompt AS defenseUserPrompt,
        defense_response AS defenseResponse,
        attack_latency_ms AS attackLatencyMs,
        defense_latency_ms AS defenseLatencyMs,
        attack_generation_id AS attackGenerationId,
        defense_generation_id AS defenseGenerationId,
        attack_cost AS attackCost,
        defense_cost AS defenseCost,
        attack_usage_json AS attackUsageJson,
        defense_usage_json AS defenseUsageJson,
        error_text AS errorText,
        created_at AS createdAt
      FROM matrix_attempts
      WHERE run_id = ?
        AND attacker_name = ?
        AND defender_name = ?
      ORDER BY attempt_number ASC
    `).all(runId, attackerName, defenderName) as MatrixHistoryAttemptDetail[];
  }

  getHeadToHeadTurnsForRun(runId: string): HeadToHeadHistoryTurnDetail[] {
    return this.db.prepare(`
      SELECT
        round_number AS roundNumber,
        actor_name AS actorName,
        actor_owner_name AS actorOwnerName,
        actor_owner_name_group AS actorOwnerNameGroup,
        actor_owner_name_set_version AS actorOwnerNameSetVersion,
        target_name AS targetName,
        target_owner_name AS targetOwnerName,
        target_owner_name_group AS targetOwnerNameGroup,
        target_owner_name_set_version AS targetOwnerNameSetVersion,
        phase,
        status,
        prompt_text AS promptText,
        system_prompt AS systemPrompt,
        user_prompt AS userPrompt,
        response_text AS responseText,
        latency_ms AS latencyMs,
        generation_id AS generationId,
        cost AS cost,
        usage_json AS usageJson,
        leaked_secret_owner AS leakedSecretOwner,
        error_text AS errorText,
        created_at AS createdAt
      FROM head_to_head_turns
      WHERE run_id = ?
      ORDER BY round_number ASC, created_at ASC
    `).all(runId) as HeadToHeadHistoryTurnDetail[];
  }

  getMatrixAttempts(runId: string): Array<{
    attacker_name: string;
    defender_name: string;
    attempt_number: number;
    status: string;
  }> {
    return this.db
      .prepare(
        `SELECT attacker_name, defender_name, attempt_number, status FROM matrix_attempts WHERE run_id = ? ORDER BY attacker_name, defender_name, attempt_number`
      )
      .all(runId) as Array<{
      attacker_name: string;
      defender_name: string;
      attempt_number: number;
      status: string;
    }>;
  }
}
