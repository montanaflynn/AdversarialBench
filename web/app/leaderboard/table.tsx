"use client";

import { DataTable } from "@/components/data-table";
import type { LeaderboardRow } from "@/lib/db";

function formatPercent(n: number, d: number): string {
  if (d <= 0) return "  -  ";
  return `${((n / d) * 100).toFixed(1)}%`.padStart(6);
}

function formatStat(count: number, total: number): string {
  return `${count} / ${total}  ${formatPercent(count, total)}`;
}

function eloColor(row: LeaderboardRow, field: "elo", data: LeaderboardRow[]): string {
  const sorted = [...data].sort((a, b) => b[field] - a[field]);
  const rank = sorted.findIndex((r) => r.name === row.name);
  if (rank < 5) return "text-defended";
  if (rank >= sorted.length - 5) return "text-leak";
  return "text-text-primary";
}

export function LeaderboardTable({ data }: { data: LeaderboardRow[] }) {
  return (
    <DataTable
      data={data}
      searchKeys={["name", "modelRef"]}
      searchPlaceholder="Search models..."
      defaultSortKey="elo"
      defaultSortDir="desc"
      columns={[
        {
          key: "rank",
          label: "#",
          className: "w-10 text-text-muted",
          render: (_row: LeaderboardRow, i: number) => (
            <span className="text-text-muted">{i + 1}</span>
          ),
        },
        {
          key: "name",
          label: "Model",
          sortable: true,
          render: (row: LeaderboardRow) => (
            <div>
              <span className="text-text-primary font-medium">{row.name}</span>
              <span className="text-text-muted ml-2 text-[10px]">{row.modelRef}</span>
            </div>
          ),
        },
        {
          key: "elo",
          label: "Elo",
          sortable: true,
          className: "tabular-nums text-right font-mono",
          render: (row: LeaderboardRow) => (
            <span className={eloColor(row, "elo", data)}>
              {row.elo}
            </span>
          ),
        },
        {
          key: "attackRate",
          label: "Attack",
          sortable: true,
          className: "tabular-nums text-right whitespace-pre font-mono",
          render: (row: LeaderboardRow) => (
            <span className="text-text-primary">
              {formatStat(row.attackLeaks, row.attackCells)}
            </span>
          ),
        },
        {
          key: "defenseRate",
          label: "Defense",
          sortable: true,
          className: "tabular-nums text-right whitespace-pre font-mono",
          render: (row: LeaderboardRow) => (
            <span className="text-text-primary">
              {formatStat(row.defends, row.defenseCells)}
            </span>
          ),
        },
        {
          key: "errors",
          label: "Errors",
          sortable: true,
          className: "tabular-nums text-right",
          render: (row: LeaderboardRow) => (
            <span className={row.errors > 0 ? "text-error" : "text-text-muted"}>
              {row.errors}
            </span>
          ),
        },
      ]}
    />
  );
}
