export type BenchmarkMode = "matrix" | "head-to-head";
export type CliMode = BenchmarkMode | "history" | "leaks";
export type MatchStatus = "pending" | "running" | "resisted" | "leaked" | "refused" | "error";
export type RunStatus = "running" | "completed" | "failed" | "cancelled";
export type OwnerNameGroup =
  | "anglo_common"
  | "arabic"
  | "south_asian"
  | "east_asian"
  | "hispanic"
  | "west_african"
  | "french"
  | "black_american"
  | "synthetic_fallback";

export interface ConfigDefaults {
  provider?: "openrouter";
  concurrency?: number;
  headToHeadConcurrency?: number;
  temperature?: number;
  maxTokens?: number;
  attackerMessages?: number;
  headToHeadRounds?: number;
  stopOnLeak?: boolean;
}

export interface ModelDefinition {
  name: string;
  model: string;
  persona?: string;
  secret?: string;
  secretPrefix?: string;
}

export interface BenchmarkConfig {
  defaults?: ConfigDefaults;
  models: ModelDefinition[];
}

export interface ResolvedModel extends ModelDefinition {
  slot: number;
  secret: string;
}

export interface OwnerIdentity {
  name: string;
  group: OwnerNameGroup;
  setVersion: string;
}

export interface RuntimeOptions {
  configPath: string;
  dbPath: string;
  offline: boolean;
  concurrency: number;
  temperature: number;
  maxTokens: number;
  attackerMessages: number;
  headToHeadRounds: number;
  stopOnLeak: boolean;
}

export interface MatrixJob {
  attacker: ResolvedModel;
  defender: ResolvedModel;
}

export interface PromptResult {
  text: string;
  latencyMs: number;
  source?: "content" | "refusal" | "reasoning" | "fallback";
  generationId?: string;
  usage?: UsageMetrics;
}

export interface UsageMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  cost?: number;
  upstreamInferenceCost?: number;
  rawJson?: string;
}

export interface MatrixAttempt {
  attemptNumber: number;
  status: Extract<MatchStatus, "resisted" | "leaked" | "refused" | "error">;
  attackPrompt: string;
  attackMessage: string;
  defensePrompt: string;
  defenderResponse: string;
  attackLatencyMs: number;
  defenseLatencyMs: number;
  errorText?: string;
  attackGenerationId?: string;
  defenseGenerationId?: string;
  attackUsage?: UsageMetrics;
  defenseUsage?: UsageMetrics;
}

export interface MatrixResult {
  attacker: string;
  defender: string;
  status: Extract<MatchStatus, "resisted" | "leaked" | "refused" | "error">;
  attackMessage: string;
  defenderResponse: string;
  attackPrompt: string;
  defensePrompt: string;
  errorText?: string;
  attackLatencyMs: number;
  defenseLatencyMs: number;
  attempts: MatrixAttempt[];
  attackGenerationId?: string;
  defenseGenerationId?: string;
  attackUsage?: UsageMetrics;
  defenseUsage?: UsageMetrics;
}

export interface MatrixCellState {
  attacker: string;
  defender: string;
  status: MatchStatus;
  attackMessage: string;
  defenderResponse: string;
  attackPrompt: string;
  defensePrompt: string;
  errorText?: string;
  attackLatencyMs: number;
  defenseLatencyMs: number;
  attempts: MatrixAttempt[];
  attackGenerationId?: string;
  defenseGenerationId?: string;
  attackUsage?: UsageMetrics;
  defenseUsage?: UsageMetrics;
}

export interface MatrixSummaryRow {
  name: string;
  model: string;
  attackLeaks: number;
  defendLeaks: number;
  defendRefusals: number;
  errors: number;
}

export interface MatrixRunRecord {
  runId: string;
  mode: "matrix";
  status: RunStatus;
  rows: MatrixSummaryRow[];
  results: MatrixResult[];
}

export interface HeadToHeadTurn {
  round: number;
  actor: string;
  actorOwnerName?: string;
  actorOwnerNameGroup?: OwnerNameGroup;
  actorOwnerNameSetVersion?: string;
  target: string;
  targetOwnerName?: string;
  targetOwnerNameGroup?: OwnerNameGroup;
  targetOwnerNameSetVersion?: string;
  phase: "attack" | "defense";
  text: string;
  prompt: string;
  latencyMs: number;
  leakedSecretOwner?: string;
  status: Extract<MatchStatus, "resisted" | "leaked" | "refused" | "error">;
  errorText?: string;
  generationId?: string;
  usage?: UsageMetrics;
}

export interface HeadToHeadResult {
  runId: string;
  mode: "head-to-head";
  status: RunStatus;
  left: ResolvedModel;
  right: ResolvedModel;
  outcome: "draw" | "left-broke-right" | "right-broke-left" | "double-leak" | "error";
  turns: HeadToHeadTurn[];
}

export interface RunRow {
  runId: string;
  mode: BenchmarkMode;
  status: RunStatus;
  configPath: string;
  configSnapshot: string;
  startedAt: string;
  finishedAt: string | null;
  concurrency: number;
  temperature: number;
  maxTokens: number;
  notes: string | null;
}

export interface HistoryRunSummary {
  runId: string;
  mode: BenchmarkMode;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  configPath: string;
  totalItems: number;
  leakCount: number;
  defendedCount: number;
  errorCount: number;
}

export interface HistoryLeaderboardRow {
  name: string;
  modelRef: string;
  attackLeaks: number;
  defendLeaks: number;
  defends: number;
  errors: number;
  attackCells: number;
  defenseCells: number;
  lastSeenAt: string | null;
  elo: number;
}

export interface MatrixHistoryResultSummary {
  attackerName: string;
  attackerModel: string;
  attackerOwnerName: string | null;
  attackerOwnerNameGroup: OwnerNameGroup | null;
  attackerOwnerNameSetVersion: string | null;
  defenderName: string;
  defenderModel: string;
  defenderOwnerName: string | null;
  defenderOwnerNameGroup: OwnerNameGroup | null;
  defenderOwnerNameSetVersion: string | null;
  status: Extract<MatchStatus, "resisted" | "leaked" | "refused" | "error">;
  attempts: number;
  attackLatencyMs: number;
  defenseLatencyMs: number;
  errorText: string | null;
  finishedAt: string;
}

export interface LeakMatrixResultSummary extends MatrixHistoryResultSummary {
  runId: string;
}

export interface MatrixHistoryAttemptDetail {
  attemptNumber: number;
  status: Extract<MatchStatus, "resisted" | "leaked" | "refused" | "error">;
  attackerOwnerName: string | null;
  attackerOwnerNameGroup: OwnerNameGroup | null;
  attackerOwnerNameSetVersion: string | null;
  defenderOwnerName: string | null;
  defenderOwnerNameGroup: OwnerNameGroup | null;
  defenderOwnerNameSetVersion: string | null;
  attackPrompt: string;
  attackMessage: string;
  defensePrompt: string;
  defenseResponse: string;
  attackLatencyMs: number;
  defenseLatencyMs: number;
  errorText: string | null;
  createdAt: string;
  attackGenerationId: string | null;
  defenseGenerationId: string | null;
  attackCost: number | null;
  defenseCost: number | null;
  attackUsageJson: string | null;
  defenseUsageJson: string | null;
}

export interface HeadToHeadHistoryTurnDetail {
  roundNumber: number;
  actorName: string;
  actorOwnerName: string | null;
  actorOwnerNameGroup: OwnerNameGroup | null;
  actorOwnerNameSetVersion: string | null;
  targetName: string;
  targetOwnerName: string | null;
  targetOwnerNameGroup: OwnerNameGroup | null;
  targetOwnerNameSetVersion: string | null;
  phase: "attack" | "defense";
  status: Extract<MatchStatus, "resisted" | "leaked" | "refused" | "error">;
  promptText: string;
  responseText: string;
  latencyMs: number;
  leakedSecretOwner: string | null;
  errorText: string | null;
  createdAt: string;
  generationId: string | null;
  cost: number | null;
  usageJson: string | null;
}

export interface RunModelRow {
  slot: number;
  name: string;
  modelRef: string;
  ownerName: string | null;
  ownerNameGroup: OwnerNameGroup | null;
  ownerNameSetVersion: string | null;
  persona: string | null;
  secret: string;
}

export interface HistoryRunDetail extends HistoryRunSummary {
  concurrency: number;
  temperature: number;
  maxTokens: number;
  notes: string | null;
}

export interface MatrixProgressEvent {
  kind: "matrix-update";
  completed: number;
  total: number;
  active: string[];
  latest?: MatrixResult;
  latestCellKey?: string;
  grid: Record<string, MatchStatus>;
  cells: Record<string, MatrixCellState>;
}

export interface HeadToHeadProgressEvent {
  kind: "head-to-head-update";
  latest?: HeadToHeadTurn;
  completedTurns: number;
  totalTurns: number;
  outcome?: HeadToHeadResult["outcome"];
}

export type ProgressEvent = MatrixProgressEvent | HeadToHeadProgressEvent;
