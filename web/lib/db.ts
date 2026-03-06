import Database from "better-sqlite3";
import { resolve } from "path";

const DB_PATH = process.env.AB_DB_PATH
  ?? resolve(process.cwd(), "../data/adversarialbench.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
    _db.pragma("journal_mode = WAL");
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

export function getOverviewStats(): OverviewStats {
  const db = getDb();
  const runs = db.prepare("SELECT COUNT(*) as count FROM runs").get() as { count: number };
  const results = db.prepare(`SELECT COUNT(*) as count FROM matrix_results WHERE ${EXCLUDE_SCRIPTED}`).get() as { count: number };
  const leaks = db.prepare(`SELECT COUNT(*) as count FROM matrix_results WHERE status = 'leaked' AND ${EXCLUDE_SCRIPTED}`).get() as { count: number };
  const defended = db.prepare(`SELECT COUNT(*) as count FROM matrix_results WHERE status IN ('refused', 'resisted') AND ${EXCLUDE_SCRIPTED}`).get() as { count: number };
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
             SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defends
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
    ORDER BY
      (attack.attack_leaks * 1.0) / NULLIF(attack.attack_cells, 0) DESC,
      (defense.defends * 1.0) / NULLIF(defense.defense_cells, 0) DESC
  `).all() as Array<{
    name: string; modelRef: string;
    attackLeaks: number; defendLeaks: number; defends: number; errors: number;
    attackCells: number; defenseCells: number;
  }>;

  return rows.map(r => ({
    ...r,
    attackRate: r.attackCells > 0 ? r.attackLeaks / r.attackCells : 0,
    defenseRate: r.defenseCells > 0 ? (r.defenseCells - r.defendLeaks) / r.defenseCells : 0,
  }));
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
        SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
      FROM matrix_results WHERE ${EXCLUDE_SCRIPTED} GROUP BY run_id
    ) AS mc ON mc.run_id = runs.run_id
    LEFT JOIN (
      SELECT run_id,
        COUNT(*) AS total_items,
        SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
        SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended_count,
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
        SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
      FROM matrix_results WHERE ${EXCLUDE_SCRIPTED} GROUP BY run_id
    ) AS mc ON mc.run_id = runs.run_id
    LEFT JOIN (
      SELECT run_id,
        COUNT(*) AS total_items,
        SUM(CASE WHEN status = 'leaked' THEN 1 ELSE 0 END) AS leak_count,
        SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended_count,
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
      SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended,
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
      SUM(CASE WHEN status IN ('refused', 'resisted') THEN 1 ELSE 0 END) AS defended,
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
