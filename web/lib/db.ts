import Database from "better-sqlite3";
import { resolve } from "path";
import { mkdirSync } from "fs";

const DB_PATH = process.env.AB_DB_PATH
  ?? resolve(process.cwd(), "../data/adversarialbench.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    mkdirSync(resolve(DB_PATH, ".."), { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY, mode TEXT NOT NULL, status TEXT NOT NULL,
        config_path TEXT NOT NULL, config_snapshot TEXT NOT NULL,
        started_at TEXT NOT NULL, finished_at TEXT,
        concurrency INTEGER NOT NULL, temperature REAL NOT NULL,
        max_tokens INTEGER NOT NULL, notes TEXT
      );
      CREATE TABLE IF NOT EXISTS run_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
        slot INTEGER NOT NULL, name TEXT NOT NULL, model_ref TEXT NOT NULL,
        owner_name TEXT, owner_name_group TEXT, owner_name_set_version TEXT,
        persona TEXT, secret TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matrix_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
        attacker_name TEXT NOT NULL, attacker_model TEXT NOT NULL,
        attacker_owner_name TEXT, attacker_owner_name_group TEXT, attacker_owner_name_set_version TEXT,
        defender_name TEXT NOT NULL, defender_model TEXT NOT NULL,
        defender_owner_name TEXT, defender_owner_name_group TEXT, defender_owner_name_set_version TEXT,
        status TEXT NOT NULL, attack_prompt TEXT NOT NULL, attack_message TEXT NOT NULL,
        defense_prompt TEXT NOT NULL, defense_response TEXT NOT NULL,
        attack_latency_ms INTEGER NOT NULL, defense_latency_ms INTEGER NOT NULL,
        attack_generation_id TEXT, defense_generation_id TEXT,
        attack_prompt_tokens INTEGER, attack_completion_tokens INTEGER,
        attack_total_tokens INTEGER, attack_cost REAL, attack_usage_json TEXT,
        defense_prompt_tokens INTEGER, defense_completion_tokens INTEGER,
        defense_total_tokens INTEGER, defense_cost REAL, defense_usage_json TEXT,
        error_text TEXT, started_at TEXT NOT NULL, finished_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matrix_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
        attacker_name TEXT NOT NULL, attacker_model TEXT NOT NULL,
        attacker_owner_name TEXT, attacker_owner_name_group TEXT, attacker_owner_name_set_version TEXT,
        defender_name TEXT NOT NULL, defender_model TEXT NOT NULL,
        defender_owner_name TEXT, defender_owner_name_group TEXT, defender_owner_name_set_version TEXT,
        attempt_number INTEGER NOT NULL, status TEXT NOT NULL,
        attack_prompt TEXT NOT NULL, attack_message TEXT NOT NULL,
        defense_prompt TEXT NOT NULL, defense_response TEXT NOT NULL,
        attack_latency_ms INTEGER NOT NULL, defense_latency_ms INTEGER NOT NULL,
        attack_generation_id TEXT, defense_generation_id TEXT,
        attack_prompt_tokens INTEGER, attack_completion_tokens INTEGER,
        attack_total_tokens INTEGER, attack_cost REAL, attack_usage_json TEXT,
        defense_prompt_tokens INTEGER, defense_completion_tokens INTEGER,
        defense_total_tokens INTEGER, defense_cost REAL, defense_usage_json TEXT,
        error_text TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS head_to_head_matches (
        run_id TEXT PRIMARY KEY, left_name TEXT NOT NULL, left_model TEXT NOT NULL,
        left_owner_name TEXT, left_owner_name_group TEXT, left_owner_name_set_version TEXT,
        left_secret TEXT NOT NULL, right_name TEXT NOT NULL, right_model TEXT NOT NULL,
        right_owner_name TEXT, right_owner_name_group TEXT, right_owner_name_set_version TEXT,
        right_secret TEXT NOT NULL, rounds_planned INTEGER NOT NULL,
        rounds_completed INTEGER NOT NULL, outcome TEXT NOT NULL,
        started_at TEXT NOT NULL, finished_at TEXT, error_text TEXT
      );
      CREATE TABLE IF NOT EXISTS head_to_head_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
        round_number INTEGER NOT NULL, actor_name TEXT NOT NULL,
        actor_owner_name TEXT, actor_owner_name_group TEXT, actor_owner_name_set_version TEXT,
        target_name TEXT NOT NULL, target_owner_name TEXT, target_owner_name_group TEXT,
        target_owner_name_set_version TEXT, phase TEXT NOT NULL, status TEXT NOT NULL,
        prompt_text TEXT NOT NULL, response_text TEXT NOT NULL, latency_ms INTEGER NOT NULL,
        generation_id TEXT, prompt_tokens INTEGER, completion_tokens INTEGER,
        total_tokens INTEGER, cost REAL, usage_json TEXT,
        leaked_secret_owner TEXT, error_text TEXT, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_matrix_results_run_id ON matrix_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_matrix_attempts_run_id ON matrix_attempts(run_id);
      CREATE INDEX IF NOT EXISTS idx_head_to_head_turns_run_id ON head_to_head_turns(run_id);
    `);
  }
  return _db;
}

export interface Run {
  runId: string;
  mode: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  configPath: string;
  concurrency: number;
  temperature: number;
  maxTokens: number;
  totalItems: number;
  leakCount: number;
  defendedCount: number;
  errorCount: number;
}

export interface LeaderboardRow {
  name: string;
  modelRef: string;
  attackLeaks: number;
  defendLeaks: number;
  defends: number;
  errors: number;
  attackCells: number;
  defenseCells: number;
  attackRate: number;
  defenseRate: number;
  attackElo: number;
  defenseElo: number;
  elo: number;
}

export interface MatrixResultRow {
  id: number;
  runId: string;
  attackerName: string;
  attackerModel: string;
  defenderName: string;
  defenderModel: string;
  status: string;
  attackLatencyMs: number;
  defenseLatencyMs: number;
  attackCost: number | null;
  defenseCost: number | null;
  errorText: string | null;
  startedAt: string;
  finishedAt: string;
  attackMessage: string;
  defenseResponse: string;
  attackPrompt: string;
  defensePrompt: string;
}

export interface LeakRow extends MatrixResultRow {
  runStartedAt: string;
}

export interface OverviewStats {
  totalRuns: number;
  totalResults: number;
  totalLeaks: number;
  totalDefended: number;
  totalErrors: number;
  uniqueModels: number;
  leakRate: number;
}

export interface ModelPairStats {
  attackerName: string;
  defenderName: string;
  total: number;
  leaks: number;
  defended: number;
  errors: number;
  leakRate: number;
}

export interface HeadToHeadTurnRow {
  id: number;
  runId: string;
  roundNumber: number;
  actorName: string;
  targetName: string;
  phase: string;
  status: string;
  promptText: string;
  responseText: string;
  latencyMs: number;
  cost: number | null;
  leakedSecretOwner: string | null;
  errorText: string | null;
  createdAt: string;
}

const EXCLUDE_SCRIPTED = "attacker_model NOT LIKE 'scripted%' AND defender_model NOT LIKE 'scripted%'";

function computeEloRatings(db: Database.Database): { attack: Map<string, number>; defense: Map<string, number>; combined: Map<string, number> } {
  const matches = db.prepare(`
    SELECT attacker_name AS attacker, defender_name AS defender, status, finished_at AS ts
    FROM matrix_results
    WHERE ${EXCLUDE_SCRIPTED} AND status != 'error'
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

  for (const m of matches) {
    const leaked = m.status === 'leaked';

    const rA = getRating(attackRatings, m.attacker);
    const rAopp = getRating(attackRatings, m.defender);
    const eA = 1 / (1 + Math.pow(10, (rAopp - rA) / 400));
    attackRatings.set(m.attacker, rA + K * ((leaked ? 1.0 : 0.0) - eA));

    const rD = getRating(defenseRatings, m.defender);
    const rDopp = getRating(defenseRatings, m.attacker);
    const eD = 1 / (1 + Math.pow(10, (rDopp - rD) / 400));
    defenseRatings.set(m.defender, rD + K * ((leaked ? 0.0 : 1.0) - eD));
  }

  const allNames = new Set([...attackRatings.keys(), ...defenseRatings.keys()]);
  const combined = new Map<string, number>();
  for (const name of allNames) {
    const a = attackRatings.get(name) ?? 1500;
    const d = defenseRatings.get(name) ?? 1500;
    combined.set(name, Math.round(0.3 * a + 0.7 * d));
  }

  return { attack: attackRatings, defense: defenseRatings, combined };
}

export function getOverviewStats(): OverviewStats {
  const db = getDb();
  const runs = db.prepare("SELECT COUNT(*) as count FROM runs").get() as { count: number };
  const results = db.prepare(`SELECT COUNT(*) as count FROM matrix_results WHERE ${EXCLUDE_SCRIPTED}`).get() as { count: number };
  const leaks = db.prepare(`SELECT COUNT(*) as count FROM matrix_results WHERE status = 'leaked' AND ${EXCLUDE_SCRIPTED}`).get() as { count: number };
  const defended = db.prepare(`SELECT COUNT(*) as count FROM matrix_results WHERE status = 'defended' AND ${EXCLUDE_SCRIPTED}`).get() as { count: number };
  const errors = db.prepare(`SELECT COUNT(*) as count FROM matrix_results WHERE status = 'error' AND ${EXCLUDE_SCRIPTED}`).get() as { count: number };
  const models = db.prepare(`SELECT COUNT(DISTINCT attacker_name) as count FROM matrix_results WHERE ${EXCLUDE_SCRIPTED}`).get() as { count: number };

  return {
    totalRuns: runs.count,
    totalResults: results.count,
    totalLeaks: leaks.count,
    totalDefended: defended.count,
    totalErrors: errors.count,
    uniqueModels: models.count,
    leakRate: results.count > 0 ? leaks.count / results.count : 0,
  };
}

export function getLeaderboard(): LeaderboardRow[] {
  const db = getDb();
  const { attack: attackElo, defense: defenseElo, combined: eloRatings } = computeEloRatings(db);
  const rows = db.prepare(`
    SELECT
      attack.name,
      attack.model_ref AS modelRef,
      attack.attack_leaks AS attackLeaks,
      defense.defend_leaks AS defendLeaks,
      defense.defends,
      COALESCE(errors.error_count, 0) AS errors,
      attack.attack_cells AS attackCells,
      defense.defense_cells AS defenseCells
    FROM (
      SELECT attacker_name AS name, attacker_model AS model_ref,
             COUNT(*) AS attack_cells,
             SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS attack_leaks
      FROM matrix_results WHERE ${EXCLUDE_SCRIPTED} GROUP BY attacker_name, attacker_model
    ) AS attack
    JOIN (
      SELECT defender_name AS name, defender_model AS model_ref,
             COUNT(*) AS defense_cells,
             SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS defend_leaks,
             SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defends
      FROM matrix_results WHERE ${EXCLUDE_SCRIPTED} GROUP BY defender_name, defender_model
    ) AS defense ON attack.name = defense.name AND attack.model_ref = defense.model_ref
    LEFT JOIN (
      SELECT name, model_ref, SUM(error_count) AS error_count FROM (
        SELECT attacker_name AS name, attacker_model AS model_ref,
               SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM matrix_results WHERE ${EXCLUDE_SCRIPTED} GROUP BY attacker_name, attacker_model
        UNION ALL
        SELECT defender_name AS name, defender_model AS model_ref,
               SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM matrix_results WHERE ${EXCLUDE_SCRIPTED} GROUP BY defender_name, defender_model
      ) GROUP BY name, model_ref
    ) AS errors ON attack.name = errors.name AND attack.model_ref = errors.model_ref
  `).all() as Array<{
    name: string; modelRef: string;
    attackLeaks: number; defendLeaks: number; defends: number; errors: number;
    attackCells: number; defenseCells: number;
  }>;

  return rows.map(r => ({
    ...r,
    attackRate: r.attackCells > 0 ? r.attackLeaks / r.attackCells : 0,
    defenseRate: r.defenseCells > 0 ? (r.defenseCells - r.defendLeaks) / r.defenseCells : 0,
    attackElo: Math.round(attackElo.get(r.name) ?? 1500),
    defenseElo: Math.round(defenseElo.get(r.name) ?? 1500),
    elo: Math.round(eloRatings.get(r.name) ?? 1500),
  })).sort((a, b) => b.defenseElo - a.defenseElo || b.attackElo - a.attackElo);
}

export function getRuns(limit = 100): Run[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      runs.run_id AS runId,
      runs.mode,
      runs.status,
      runs.started_at AS startedAt,
      runs.finished_at AS finishedAt,
      runs.config_path AS configPath,
      runs.concurrency,
      runs.temperature,
      runs.max_tokens AS maxTokens,
      COALESCE(mc.total_items, hc.total_items, 0) AS totalItems,
      COALESCE(mc.leak_count, hc.leak_count, 0) AS leakCount,
      COALESCE(mc.defended_count, hc.defended_count, 0) AS defendedCount,
      COALESCE(mc.error_count, hc.error_count, 0) AS errorCount
    FROM runs
    LEFT JOIN (
      SELECT run_id,
        COUNT(*) AS total_items,
        SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
        SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
      FROM matrix_results WHERE ${EXCLUDE_SCRIPTED} GROUP BY run_id
    ) AS mc ON mc.run_id = runs.run_id
    LEFT JOIN (
      SELECT run_id,
        COUNT(*) AS total_items,
        SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
        SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
      FROM head_to_head_turns GROUP BY run_id
    ) AS hc ON hc.run_id = runs.run_id
    ORDER BY runs.started_at DESC
    LIMIT ?
  `).all(limit) as Run[];
}

export function getRunDetail(runId: string): Run | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT
      runs.run_id AS runId,
      runs.mode,
      runs.status,
      runs.started_at AS startedAt,
      runs.finished_at AS finishedAt,
      runs.config_path AS configPath,
      runs.concurrency,
      runs.temperature,
      runs.max_tokens AS maxTokens,
      COALESCE(mc.total_items, hc.total_items, 0) AS totalItems,
      COALESCE(mc.leak_count, hc.leak_count, 0) AS leakCount,
      COALESCE(mc.defended_count, hc.defended_count, 0) AS defendedCount,
      COALESCE(mc.error_count, hc.error_count, 0) AS errorCount
    FROM runs
    LEFT JOIN (
      SELECT run_id,
        COUNT(*) AS total_items,
        SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
        SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
      FROM matrix_results WHERE ${EXCLUDE_SCRIPTED} GROUP BY run_id
    ) AS mc ON mc.run_id = runs.run_id
    LEFT JOIN (
      SELECT run_id,
        COUNT(*) AS total_items,
        SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
        SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
      FROM head_to_head_turns GROUP BY run_id
    ) AS hc ON hc.run_id = runs.run_id
    WHERE runs.run_id = ?
  `).get(runId) as Run | undefined;
}

export function getMatrixResultsForRun(runId: string): MatrixResultRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      id, run_id AS runId,
      attacker_name AS attackerName, attacker_model AS attackerModel,
      defender_name AS defenderName, defender_model AS defenderModel,
      status,
      attack_latency_ms AS attackLatencyMs, defense_latency_ms AS defenseLatencyMs,
      attack_cost AS attackCost, defense_cost AS defenseCost,
      error_text AS errorText,
      started_at AS startedAt, finished_at AS finishedAt,
      attack_message AS attackMessage, defense_response AS defenseResponse,
      attack_prompt AS attackPrompt, defense_prompt AS defensePrompt
    FROM matrix_results
    WHERE run_id = ? AND ${EXCLUDE_SCRIPTED}
    ORDER BY
      CASE status WHEN 'leaked' THEN 0 WHEN 'error' THEN 1 ELSE 2 END,
      attacker_name, defender_name
  `).all(runId) as MatrixResultRow[];
}

export function getLeaks(limit = 500): LeakRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      mr.id, mr.run_id AS runId,
      mr.attacker_name AS attackerName, mr.attacker_model AS attackerModel,
      mr.defender_name AS defenderName, mr.defender_model AS defenderModel,
      mr.status,
      mr.attack_latency_ms AS attackLatencyMs, mr.defense_latency_ms AS defenseLatencyMs,
      mr.attack_cost AS attackCost, mr.defense_cost AS defenseCost,
      mr.error_text AS errorText,
      mr.started_at AS startedAt, mr.finished_at AS finishedAt,
      mr.attack_message AS attackMessage, mr.defense_response AS defenseResponse,
      mr.attack_prompt AS attackPrompt, mr.defense_prompt AS defensePrompt,
      r.started_at AS runStartedAt
    FROM matrix_results mr
    JOIN runs r ON r.run_id = mr.run_id
    WHERE mr.status = 'leaked'
      AND mr.attacker_model NOT LIKE 'scripted%' AND mr.defender_model NOT LIKE 'scripted%'
    ORDER BY mr.finished_at DESC
    LIMIT ?
  `).all(limit) as LeakRow[];
}

export function getModelPairStats(): ModelPairStats[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      attacker_name AS attackerName,
      defender_name AS defenderName,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leaks,
      SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
    FROM matrix_results
    WHERE ${EXCLUDE_SCRIPTED}
    GROUP BY attacker_name, defender_name
    ORDER BY attacker_name, defender_name
  `).all().map((r: any) => ({
    ...r,
    leakRate: r.total > 0 ? r.leaks / r.total : 0,
  })) as ModelPairStats[];
}

export function getLeaksByModel(): Array<{ name: string; asAttacker: number; asDefender: number }> {
  const db = getDb();
  const attackerLeaks = db.prepare(`
    SELECT attacker_name AS name, COUNT(*) AS count
    FROM matrix_results WHERE status = 'leaked' AND ${EXCLUDE_SCRIPTED}
    GROUP BY attacker_name
  `).all() as Array<{ name: string; count: number }>;

  const defenderLeaks = db.prepare(`
    SELECT defender_name AS name, COUNT(*) AS count
    FROM matrix_results WHERE status = 'leaked' AND ${EXCLUDE_SCRIPTED}
    GROUP BY defender_name
  `).all() as Array<{ name: string; count: number }>;

  const allNames = new Set([
    ...attackerLeaks.map(r => r.name),
    ...defenderLeaks.map(r => r.name),
  ]);

  return Array.from(allNames).map(name => ({
    name,
    asAttacker: attackerLeaks.find(r => r.name === name)?.count ?? 0,
    asDefender: defenderLeaks.find(r => r.name === name)?.count ?? 0,
  })).sort((a, b) => (b.asAttacker + b.asDefender) - (a.asAttacker + a.asDefender));
}

export function getLeakTrend(): Array<{ date: string; leaks: number; defended: number; total: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT
      DATE(finished_at) AS date,
      SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leaks,
      SUM(CASE WHEN status = 'defended' THEN 1 ELSE 0 END) AS defended,
      COUNT(*) AS total
    FROM matrix_results
    WHERE finished_at IS NOT NULL AND ${EXCLUDE_SCRIPTED}
    GROUP BY DATE(finished_at)
    ORDER BY date ASC
  `).all() as Array<{ date: string; leaks: number; defended: number; total: number }>;
}

export function getHeadToHeadTurnsForRun(runId: string): HeadToHeadTurnRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      id, run_id AS runId,
      round_number AS roundNumber,
      actor_name AS actorName,
      target_name AS targetName,
      phase, status,
      prompt_text AS promptText,
      response_text AS responseText,
      latency_ms AS latencyMs,
      cost,
      leaked_secret_owner AS leakedSecretOwner,
      error_text AS errorText,
      created_at AS createdAt
    FROM head_to_head_turns
    WHERE run_id = ?
    ORDER BY round_number ASC, created_at ASC
  `).all(runId) as HeadToHeadTurnRow[];
}
