import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import { nowIso } from "./utils.js";
import type {
  BenchmarkMode,
  HeadToHeadResult,
  HeadToHeadHistoryTurnDetail,
  HeadToHeadTurn,
  HistoryLeaderboardRow,
  HistoryRunDetail,
  HistoryRunSummary,
  MatrixAttempt,
  MatrixHistoryAttemptDetail,
  MatrixHistoryResultSummary,
  MatrixResult,
  ResolvedModel,
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
        persona TEXT,
        secret TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS matrix_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        attacker_name TEXT NOT NULL,
        attacker_model TEXT NOT NULL,
        defender_name TEXT NOT NULL,
        defender_model TEXT NOT NULL,
        status TEXT NOT NULL,
        attack_prompt TEXT NOT NULL,
        attack_message TEXT NOT NULL,
        defense_prompt TEXT NOT NULL,
        defense_response TEXT NOT NULL,
        attack_latency_ms INTEGER NOT NULL,
        defense_latency_ms INTEGER NOT NULL,
        error_text TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS matrix_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        attacker_name TEXT NOT NULL,
        attacker_model TEXT NOT NULL,
        defender_name TEXT NOT NULL,
        defender_model TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        attack_prompt TEXT NOT NULL,
        attack_message TEXT NOT NULL,
        defense_prompt TEXT NOT NULL,
        defense_response TEXT NOT NULL,
        attack_latency_ms INTEGER NOT NULL,
        defense_latency_ms INTEGER NOT NULL,
        error_text TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS head_to_head_matches (
        run_id TEXT PRIMARY KEY,
        left_name TEXT NOT NULL,
        left_model TEXT NOT NULL,
        left_secret TEXT NOT NULL,
        right_name TEXT NOT NULL,
        right_model TEXT NOT NULL,
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
        target_name TEXT NOT NULL,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        response_text TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        leaked_secret_owner TEXT,
        error_text TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_matrix_results_run_id ON matrix_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_matrix_attempts_run_id ON matrix_attempts(run_id);
      CREATE INDEX IF NOT EXISTS idx_head_to_head_turns_run_id ON head_to_head_turns(run_id);
    `);
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
      INSERT INTO run_models (run_id, slot, name, model_ref, persona, secret)
      VALUES (@runId, @slot, @name, @model, @persona, @secret)
    `);
    const transaction = this.db.transaction((entries: ResolvedModel[]) => {
      for (const model of entries) {
        stmt.run({ runId, ...model });
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
        attack_prompt, attack_message, defense_prompt, defense_response,
        attack_latency_ms, defense_latency_ms, error_text, started_at, finished_at
      ) VALUES (
        @runId, @attackerName, @attackerModel, @defenderName, @defenderModel, @status,
        @attackPrompt, @attackMessage, @defensePrompt, @defenseResponse,
        @attackLatencyMs, @defenseLatencyMs, @errorText, @startedAt, @finishedAt
      )
    `).run({
      runId,
      attackerName: result.attacker,
      attackerModel: "",
      defenderName: result.defender,
      defenderModel: "",
      status: result.status,
      attackPrompt: result.attackPrompt,
      attackMessage: result.attackMessage,
      defensePrompt: result.defensePrompt,
      defenseResponse: result.defenderResponse,
      attackLatencyMs: result.attackLatencyMs,
      defenseLatencyMs: result.defenseLatencyMs,
      errorText: result.errorText ?? null,
      startedAt: nowIso(),
      finishedAt: nowIso()
    });
  }

  insertMatrixResultWithModels(runId: string, attackerModel: ResolvedModel, defenderModel: ResolvedModel, result: MatrixResult): void {
    this.db.prepare(`
      INSERT INTO matrix_results (
        run_id, attacker_name, attacker_model, defender_name, defender_model, status,
        attack_prompt, attack_message, defense_prompt, defense_response,
        attack_latency_ms, defense_latency_ms, error_text, started_at, finished_at
      ) VALUES (
        @runId, @attackerName, @attackerModel, @defenderName, @defenderModel, @status,
        @attackPrompt, @attackMessage, @defensePrompt, @defenseResponse,
        @attackLatencyMs, @defenseLatencyMs, @errorText, @startedAt, @finishedAt
      )
    `).run({
      runId,
      attackerName: attackerModel.name,
      attackerModel: attackerModel.model,
      defenderName: defenderModel.name,
      defenderModel: defenderModel.model,
      status: result.status,
      attackPrompt: result.attackPrompt,
      attackMessage: result.attackMessage,
      defensePrompt: result.defensePrompt,
      defenseResponse: result.defenderResponse,
      attackLatencyMs: result.attackLatencyMs,
      defenseLatencyMs: result.defenseLatencyMs,
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
    this.db.prepare(`
      INSERT INTO matrix_attempts (
        run_id, attacker_name, attacker_model, defender_name, defender_model, attempt_number, status,
        attack_prompt, attack_message, defense_prompt, defense_response,
        attack_latency_ms, defense_latency_ms, error_text, created_at
      ) VALUES (
        @runId, @attackerName, @attackerModel, @defenderName, @defenderModel, @attemptNumber, @status,
        @attackPrompt, @attackMessage, @defensePrompt, @defenseResponse,
        @attackLatencyMs, @defenseLatencyMs, @errorText, @createdAt
      )
    `).run({
      runId,
      attackerName: attackerModel.name,
      attackerModel: attackerModel.model,
      defenderName: defenderModel.name,
      defenderModel: defenderModel.model,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      attackPrompt: attempt.attackPrompt,
      attackMessage: attempt.attackMessage,
      defensePrompt: attempt.defensePrompt,
      defenseResponse: attempt.defenderResponse,
      attackLatencyMs: attempt.attackLatencyMs,
      defenseLatencyMs: attempt.defenseLatencyMs,
      errorText: attempt.errorText ?? null,
      createdAt: nowIso()
    });
  }

  createHeadToHeadMatch(runId: string, left: ResolvedModel, right: ResolvedModel, rounds: number): void {
    this.db.prepare(`
      INSERT INTO head_to_head_matches (
        run_id, left_name, left_model, left_secret, right_name, right_model, right_secret,
        rounds_planned, rounds_completed, outcome, started_at, finished_at, error_text
      ) VALUES (
        @runId, @leftName, @leftModel, @leftSecret, @rightName, @rightModel, @rightSecret,
        @roundsPlanned, 0, 'draw', @startedAt, NULL, NULL
      )
    `).run({
      runId,
      leftName: left.name,
      leftModel: left.model,
      leftSecret: left.secret,
      rightName: right.name,
      rightModel: right.model,
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
        prompt_text, response_text, latency_ms, leaked_secret_owner, error_text, created_at
      ) VALUES (
        @runId, @roundNumber, @actorName, @targetName, @phase, @status,
        @promptText, @responseText, @latencyMs, @leakedSecretOwner, @errorText, @createdAt
      )
    `).run({
      runId,
      roundNumber: turn.round,
      actorName: turn.actor,
      targetName: turn.target,
      phase: turn.phase,
      status: turn.status,
      promptText: turn.prompt,
      responseText: turn.text,
      latencyMs: turn.latencyMs,
      leakedSecretOwner: turn.leakedSecretOwner ?? null,
      errorText: turn.errorText ?? null,
      createdAt: nowIso()
    });
  }

  getRun(runId: string): RunRow | undefined {
    return this.db.prepare(`SELECT * FROM runs WHERE run_id = ?`).get(runId) as RunRow | undefined;
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
          SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM matrix_results
        GROUP BY run_id
      ) AS matrix_counts ON matrix_counts.run_id = runs.run_id
      LEFT JOIN (
        SELECT
          run_id,
          COUNT(*) AS total_items,
          SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
          SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended_count,
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
          SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM matrix_results
        GROUP BY run_id
      ) AS matrix_counts ON matrix_counts.run_id = runs.run_id
      LEFT JOIN (
        SELECT
          run_id,
          COUNT(*) AS total_items,
          SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
          SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM head_to_head_turns
        GROUP BY run_id
      ) AS head_counts ON head_counts.run_id = runs.run_id
      WHERE runs.run_id = ?
    `).get(runId) as HistoryRunDetail | undefined;
  }

  listHistoryLeaderboard(limit = 20): HistoryLeaderboardRow[] {
    return this.db.prepare(`
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
          SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defends,
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
      ORDER BY attackLeaks DESC, defends DESC, defendLeaks ASC, errors ASC, name ASC
      LIMIT ?
    `).all(limit) as HistoryLeaderboardRow[];
  }

  getMatrixResultsForRun(runId: string): MatrixHistoryResultSummary[] {
    return this.db.prepare(`
      SELECT
        attacker_name AS attackerName,
        attacker_model AS attackerModel,
        defender_name AS defenderName,
        defender_model AS defenderModel,
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
          WHEN 'refused' THEN 2
          ELSE 3
        END,
        finished_at DESC,
        attacker_name ASC,
        defender_name ASC
    `).all(runId) as MatrixHistoryResultSummary[];
  }

  getMatrixAttemptsForPair(runId: string, attackerName: string, defenderName: string): MatrixHistoryAttemptDetail[] {
    return this.db.prepare(`
      SELECT
        attempt_number AS attemptNumber,
        status,
        attack_prompt AS attackPrompt,
        attack_message AS attackMessage,
        defense_prompt AS defensePrompt,
        defense_response AS defenseResponse,
        attack_latency_ms AS attackLatencyMs,
        defense_latency_ms AS defenseLatencyMs,
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
        target_name AS targetName,
        phase,
        status,
        prompt_text AS promptText,
        response_text AS responseText,
        latency_ms AS latencyMs,
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
