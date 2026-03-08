"use client";

import { DataTable } from "@/components/data-table";
import { LikeButton } from "@/components/like-button";
import type { LeaderboardRow } from "@/lib/db";

function formatPercent(n: number, d: number): string {
  if (d <= 0) return "  -  ";
  return `${((n / d) * 100).toFixed(1)}%`.padStart(6);
}

function formatStat(count: number, total: number): string {
  return `${count} / ${total}  ${formatPercent(count, total)}`;
}

export function LeaderboardTable({ data }: { data: LeaderboardRow[] }) {
  return (
    <DataTable
      data={data}
      searchKeys={["name", "modelRef"]}
      searchPlaceholder="Search models..."
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
            <span className={row.elo >= 1500 ? "text-defended" : "text-text-primary"}>
              {row.elo}
            </span>
          ),
        },
        {
          key: "attackElo",
          label: "Atk Elo",
          sortable: true,
          className: "tabular-nums text-right font-mono",
          render: (row: LeaderboardRow) => (
            <span className={row.attackElo >= 1500 ? "text-defended" : "text-text-muted"}>
              {row.attackElo}
            </span>
          ),
        },
        {
          key: "defenseElo",
          label: "Def Elo",
          sortable: true,
          className: "tabular-nums text-right font-mono",
          render: (row: LeaderboardRow) => (
            <span className={row.defenseElo >= 1500 ? "text-defended" : "text-text-muted"}>
              {row.defenseElo}
            </span>
          ),
        },
        {
          key: "attackRate",
          label: "Attack",
          sortable: true,
          className: "tabular-nums text-right whitespace-pre font-mono",
          render: (row: LeaderboardRow) => (
            <span className={row.attackRate > 0 ? "text-defended" : "text-text-muted"}>
              {formatStat(row.attackLeaks, row.attackCells)}
            </span>
          ),
        },
        {
          key: "defenseRate",
          label: "Defense",
          sortable: true,
          className: "tabular-nums text-right whitespace-pre font-mono",
          render: (row: LeaderboardRow) => {
            const held = Math.max(0, row.defenseCells - row.defendLeaks);
            return (
              <span className={row.defenseRate >= 0.9 ? "text-defended" : row.defenseRate >= 0.7 ? "text-text-primary" : "text-leak"}>
                {formatStat(held, row.defenseCells)}
              </span>
            );
          },
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
        {
          key: "like",
          label: "",
          className: "w-10",
          render: (row: LeaderboardRow) => (
            <LikeButton id={`model-${row.name}`} />
          ),
        },
      ]}
    />
  );
}
