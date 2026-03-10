import type { LeaderboardRow } from "@/lib/db";
import Link from "next/link";

export function CompactLeaderboard({ data }: { data: LeaderboardRow[] }) {
  const sorted = [...data].sort((a, b) => b.elo - a.elo);

  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs uppercase tracking-wider text-text-muted">
          Leaderboard
        </h3>
        <Link
          href="/leaderboard"
          className="text-[10px] text-text-muted hover:text-text-secondary"
        >
          View full &rarr;
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="text-left py-1.5 font-medium w-6">#</th>
            <th className="text-left py-1.5 font-medium">Model</th>
            <th className="text-right py-1.5 font-medium">Elo</th>
            <th className="text-right py-1.5 font-medium">Atk Rate</th>
            <th className="text-right py-1.5 font-medium">Def Rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.name} className="border-b border-border-subtle">
              <td className="py-1.5 text-text-muted tabular-nums">{i + 1}</td>
              <td className="py-1.5 text-text-primary font-medium truncate max-w-[180px]">
                {row.name}
              </td>
              <td className="py-1.5 text-right tabular-nums font-mono text-text-primary">
                {row.elo}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                <span className={row.attackRate > 0.3 ? "text-defended" : row.attackRate > 0.1 ? "text-amber-400" : "text-text-muted"}>
                  {(row.attackRate * 100).toFixed(1)}%
                </span>
              </td>
              <td className="py-1.5 text-right tabular-nums">
                <span className={row.defenseRate >= 0.9 ? "text-defended" : row.defenseRate >= 0.7 ? "text-text-primary" : "text-leak"}>
                  {(row.defenseRate * 100).toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
