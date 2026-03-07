import { getOverviewStats, getLeaksByModel, getModelPairStats, getLeaderboard } from "@/lib/db";
import { LeaksByModelChart, HeatmapChart } from "@/components/charts";
import { CompactLeaderboard } from "@/components/compact-leaderboard";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const stats = getOverviewStats();
  const leaksByModel = getLeaksByModel();
  const pairStats = getModelPairStats();
  const leaderboard = getLeaderboard();

  const models = Array.from(
    new Set(pairStats.flatMap((p) => [p.attackerName, p.defenderName]))
  ).sort();

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
    </div>
  );
}
