"use client";

import { useState } from "react";
import type { LeaderboardRow } from "@/lib/db";
import Link from "next/link";

type SortKey = "elo" | "attackRate" | "defenseRate" | "name";

export function CompactLeaderboard({ data }: { data: LeaderboardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("elo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const sorted = [...data].sort((a, b) => {
    const mul = sortDir === "desc" ? -1 : 1;
    if (sortKey === "name") return mul * a.name.localeCompare(b.name);
    return mul * (a[sortKey] - b[sortKey]);
  });

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-0.5">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  const eloRanked = [...data].sort((a, b) => b.elo - a.elo);
  const eloValues = [...new Set(eloRanked.map((r) => r.elo))].sort((a, b) => b - a);
  function eloColor(elo: number): string {
    const rank = eloValues.indexOf(elo);
    if (rank < 5) return "text-defended";
    if (rank >= eloValues.length - 5) return "text-leak";
    return "text-text-primary";
  }

  const thClass = "py-1.5 font-medium cursor-pointer hover:text-text-secondary select-none";

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
            <th className={`text-left ${thClass}`} onClick={() => toggleSort("name")}>
              Model{sortIndicator("name")}
            </th>
            <th className={`text-right ${thClass}`} onClick={() => toggleSort("elo")}>
              Elo{sortIndicator("elo")}
            </th>
            <th className={`text-right ${thClass}`} onClick={() => toggleSort("attackRate")}>
              Atk Rate{sortIndicator("attackRate")}
            </th>
            <th className={`text-right ${thClass}`} onClick={() => toggleSort("defenseRate")}>
              Def Rate{sortIndicator("defenseRate")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.name} className="border-b border-border-subtle">
              <td className="py-1.5 text-text-muted tabular-nums">{i + 1}</td>
              <td className="py-1.5 text-text-primary font-medium truncate max-w-[180px]">
                {row.name}
              </td>
              <td className={`py-1.5 text-right tabular-nums font-mono ${eloColor(row.elo)}`}>
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
