import { getOverviewStats, getLeaksByModel, getModelPairStats, getLeaderboard, type LeaderboardRow } from "@/lib/db";
import { LeaksByModelChart, HeatmapChart } from "@/components/charts";
import { CompactLeaderboard } from "@/components/compact-leaderboard";

export const dynamic = "force-dynamic";

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function RankingList({
  rows,
  mode,
}: {
  rows: LeaderboardRow[];
  mode: "attack" | "defense";
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const value = mode === "attack" ? row.attackRate : row.defenseRate;
        const detail =
          mode === "attack"
            ? `${row.attackLeaks}/${row.attackCells} leaks landed`
            : `${row.defends}/${row.defenseCells} defended`;
        const tone = mode === "attack"
          ? (value > 0 ? "text-defended" : "text-text-muted")
          : (value >= 0.9 ? "text-defended" : value >= 0.7 ? "text-text-primary" : "text-leak");

        return (
          <div
            key={`${mode}-${row.modelRef}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-text-muted">
                  {index + 1}
                </span>
                <span className="truncate text-sm font-medium text-text-primary">{row.name}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-text-muted">{detail}</p>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${tone}`}>
              {formatPercent(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const stats = getOverviewStats();
  const leaksByModel = getLeaksByModel();
  const pairStats = getModelPairStats();
  const leaderboard = getLeaderboard();

  const models = Array.from(
    new Set(pairStats.flatMap((p) => [p.attackerName, p.defenderName]))
  ).sort();

  const topAttackers = [...leaderboard]
    .sort((a, b) => b.attackRate - a.attackRate || b.attackLeaks - a.attackLeaks)
    .slice(0, 5);
  const topDefenders = [...leaderboard]
    .sort((a, b) => b.defenseRate - a.defenseRate || b.defends - a.defends)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold mb-1">Dashboard</h1>
        <p className="text-text-muted text-xs">
          Adversarial prompt-injection benchmark results
        </p>
      </div>

      {/* Compact inline stats strip */}
      <div className="bg-surface-raised border border-border rounded-lg px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
          <span className="font-semibold text-text-primary">{stats.totalResults.toLocaleString()}</span>
          <span className="text-text-muted">tests</span>
          <span className="text-text-muted">&middot;</span>
          <span className="font-semibold text-leak">{stats.totalLeaks}</span>
          <span className="text-text-muted">leaks ({(stats.leakRate * 100).toFixed(1)}%)</span>
          <span className="text-text-muted">&middot;</span>
          <span className="font-semibold text-defended">{stats.totalDefended.toLocaleString()}</span>
          <span className="text-text-muted">defended</span>
          <span className="text-text-muted">&middot;</span>
          <span className="font-semibold text-error">{stats.totalErrors}</span>
          <span className="text-text-muted">errors</span>
          <span className="text-text-muted">&middot;</span>
          <span className="font-semibold text-text-primary">{stats.totalRuns}</span>
          <span className="text-text-muted">runs</span>
        </div>
      </div>

      {/* Leaderboard + Leaks by Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CompactLeaderboard data={leaderboard} />
        <LeaksByModelChart data={leaksByModel} />
      </div>

      {/* Heatmap */}
      <HeatmapChart data={pairStats} models={models} />

      {/* Model Roles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised border border-border rounded-lg p-4">
          <h3 className="text-xs uppercase tracking-wider text-text-muted mb-3">Best Attackers</h3>
          <RankingList rows={topAttackers} mode="attack" />
        </div>
        <div className="bg-surface-raised border border-border rounded-lg p-4">
          <h3 className="text-xs uppercase tracking-wider text-text-muted mb-3">Best Defenders</h3>
          <RankingList rows={topDefenders} mode="defense" />
        </div>
      </div>
    </div>
  );
}
