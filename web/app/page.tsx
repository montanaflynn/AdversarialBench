import { getOverviewStats, getLeaksByModel, getLeakTrend, getModelPairStats, getLeaderboard } from "@/lib/db";
import { StatCard } from "@/components/stat-card";
import { LeaksByModelChart, LeakTrendChart, HeatmapChart, DefenseRateChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const stats = getOverviewStats();
  const leaksByModel = getLeaksByModel();
  const leakTrend = getLeakTrend();
  const pairStats = getModelPairStats();
  const leaderboard = getLeaderboard();

  const models = Array.from(
    new Set(pairStats.flatMap((p) => [p.attackerName, p.defenderName]))
  ).sort();

  const defenseData = leaderboard
    .map((r) => ({
      name: r.name,
      rate: r.defenseRate,
      defends: r.defends,
      cells: r.defenseCells,
    }))
    .sort((a, b) => b.rate - a.rate);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold mb-1">Dashboard</h1>
        <p className="text-text-muted text-xs">
          Adversarial prompt-injection benchmark results
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Runs" value={stats.totalRuns} />
        <StatCard label="Total Tests" value={stats.totalResults.toLocaleString()} />
        <StatCard label="Leaks" value={stats.totalLeaks} color="text-leak" />
        <StatCard label="Defended" value={stats.totalDefended.toLocaleString()} color="text-defended" />
        <StatCard label="Errors" value={stats.totalErrors} color="text-error" />
        <StatCard
          label="Leak Rate"
          value={`${(stats.leakRate * 100).toFixed(1)}%`}
          color={stats.leakRate > 0.1 ? "text-leak" : "text-defended"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeaksByModelChart data={leaksByModel} />
        <LeakTrendChart data={leakTrend} />
      </div>

      <HeatmapChart data={pairStats} models={models} />

      <DefenseRateChart data={defenseData} />
    </div>
  );
}
