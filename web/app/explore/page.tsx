import Link from "next/link";
import {
  getLeaks,
  getLeaderboard,
  getModelPairStats,
  getOverviewStats,
  type LeaderboardRow,
  type LeakRow,
  type ModelPairStats,
} from "@/lib/db";

export const dynamic = "force-dynamic";

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function riskTone(rate: number) {
  if (rate >= 0.5) return "text-leak";
  if (rate >= 0.2) return "text-amber-400";
  return "text-defended";
}

function riskLabel(rate: number) {
  if (rate >= 0.5) return "critical";
  if (rate >= 0.2) return "watch";
  return "stable";
}

function SectionCard({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-surface-raised/90 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] ${className}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-text-primary">{title}</h2>
          <p className="mt-1 text-xs text-text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function RankingList({
  rows,
  mode,
}: {
  rows: LeaderboardRow[];
  mode: "attack" | "defense";
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const value = mode === "attack" ? row.attackRate : row.defenseRate;
        const detail =
          mode === "attack"
            ? `${row.attackLeaks}/${row.attackCells} leaks landed`
            : `${row.defends}/${row.defenseCells} defended`;

        return (
          <div
            key={`${mode}-${row.modelRef}`}
            className="rounded-xl border border-border-subtle bg-surface/60 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="truncate text-sm font-medium text-text-primary">{row.name}</p>
                </div>
                <p className="mt-1 truncate text-[11px] text-text-muted">{detail}</p>
              </div>
              <div className={`text-sm font-semibold tabular-nums ${riskTone(mode === "attack" ? value : 1 - value)}`}>
                {formatPercent(value)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchupList({ rows }: { rows: ModelPairStats[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={`${row.attackerName}-${row.defenderName}`}
          className="rounded-xl border border-border-subtle bg-surface/60 p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">
                {row.attackerName} <span className="text-text-muted">-&gt;</span> {row.defenderName}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">
                {row.leaks}/{row.total} leaks, {row.defended} defended, {row.errors} errors
              </p>
            </div>
            <span
              className={`rounded-full border border-current/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${riskTone(row.leakRate)}`}
            >
              {riskLabel(row.leakRate)}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-overlay">
            <div
              className={`h-full rounded-full ${
                row.leakRate >= 0.5
                  ? "bg-leak"
                  : row.leakRate >= 0.2
                    ? "bg-amber-400"
                    : "bg-defended"
              }`}
              style={{ width: `${Math.max(row.leakRate * 100, 6)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function LeakFeed({ rows }: { rows: LeakRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Link
          key={row.id}
          href={`/runs/${row.runId}`}
          className="block rounded-xl border border-border-subtle bg-surface/60 p-3 transition-colors hover:border-border hover:bg-surface-overlay/70"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">
                {row.attackerName} <span className="text-text-muted">extracted from</span> {row.defenderName}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-text-muted">
                {row.defenseResponse}
              </p>
            </div>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-leak">
              Leak
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-text-muted">
            <span className="truncate">{row.runId}</span>
            <span className="shrink-0">{formatTimestamp(row.finishedAt)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function ExplorePage() {
  const stats = getOverviewStats();
  const leaderboard = getLeaderboard();
  const pairStats = getModelPairStats();
  const recentLeaks = getLeaks(6);

  const topAttackers = [...leaderboard]
    .sort((a, b) => b.attackRate - a.attackRate || b.attackLeaks - a.attackLeaks)
    .slice(0, 5);
  const worstAttackers = [...leaderboard]
    .sort((a, b) => a.attackRate - b.attackRate || a.attackLeaks - b.attackLeaks)
    .slice(0, 5);
  const topDefenders = [...leaderboard]
    .sort((a, b) => b.defenseRate - a.defenseRate || b.defends - a.defends)
    .slice(0, 5);
  const worstDefenders = [...leaderboard]
    .sort((a, b) => a.defenseRate - b.defenseRate || a.defends - b.defends)
    .slice(0, 5);
  const hotMatchups = [...pairStats]
    .filter((row) => row.total >= 2)
    .sort((a, b) => b.leakRate - a.leakRate || b.total - a.total)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-border bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_38%),radial-gradient(circle_at_85%_15%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,rgba(24,24,27,1),rgba(10,10,11,1))]">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1.5fr_0.9fr] lg:px-8">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.34em] text-text-muted">
                Explore
              </p>
              <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-text-primary">
                Scan the benchmark like an attack surface, not a spreadsheet.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
                Follow where pressure is building, which defenders are holding, and which model
                pairings keep producing the same failure pattern.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Coverage</p>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-text-primary">
                  {stats.totalResults.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  matrix evaluations across {stats.totalRuns} runs
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Leak Rate</p>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-leak">
                  {formatPercent(stats.leakRate)}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {stats.totalLeaks.toLocaleString()} confirmed leaks
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Model Field</p>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-text-primary">
                  {stats.uniqueModels}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  active models in the current SQLite history
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Top Attacker</p>
              <p className="mt-3 text-lg font-semibold text-text-primary">
                {topAttackers[0]?.name ?? "No data"}
              </p>
              <p className={`mt-2 text-sm font-medium ${riskTone(topAttackers[0]?.attackRate ?? 0)}`}>
                {topAttackers[0] ? formatPercent(topAttackers[0].attackRate) : "--"}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {topAttackers[0]
                  ? `${topAttackers[0].attackLeaks} leaks landed across ${topAttackers[0].attackCells} attacks`
                  : "No attack data yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Top Defender</p>
              <p className="mt-3 text-lg font-semibold text-text-primary">
                {topDefenders[0]?.name ?? "No data"}
              </p>
              <p className="mt-2 text-sm font-medium text-defended">
                {topDefenders[0] ? formatPercent(topDefenders[0].defenseRate) : "--"}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {topDefenders[0]
                  ? `${topDefenders[0].defends} defended across ${topDefenders[0].defenseCells} attempts`
                  : "No defense data yet"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6">
        <SectionCard
          title="Recent Leaks"
          description="Fresh failures to inspect before jumping into full run detail."
        >
          <LeakFeed rows={recentLeaks} />
          <div className="mt-4">
            <Link
              href="/leaks"
              className="text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Open full leak browser -&gt;
            </Link>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Model Roles"
          description="Best and worst performers on both sides of the attack surface."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-text-muted">
                  Best attackers
                </p>
                <RankingList rows={topAttackers} mode="attack" />
              </div>
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-text-muted">
                  Worst attackers
                </p>
                <RankingList rows={worstAttackers} mode="attack" />
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-text-muted">
                  Best defenders
                </p>
                <RankingList rows={topDefenders} mode="defense" />
              </div>
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-text-muted">
                  Worst defenders
                </p>
                <RankingList rows={worstDefenders} mode="defense" />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Hot Matchups"
          description="Pairs with repeat exposure or a large enough sample to deserve direct inspection."
        >
          <MatchupList rows={hotMatchups} />
        </SectionCard>
      </div>
    </div>
  );
}
