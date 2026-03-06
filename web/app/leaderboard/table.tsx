"use client";

import { DataTable } from "@/components/data-table";
import { LikeButton } from "@/components/like-button";
import type { LeaderboardRow } from "@/lib/db";

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
          key: "attackLeaks",
          label: "Attack Leaks",
          sortable: true,
          className: "tabular-nums text-right",
          render: (row: LeaderboardRow) => (
            <span className="text-accent">
              {row.attackLeaks}
              <span className="text-text-muted ml-1">/ {row.attackCells}</span>
            </span>
          ),
        },
        {
          key: "attackRate",
          label: "Attack Rate",
          sortable: true,
          className: "tabular-nums text-right",
          render: (row: LeaderboardRow) => (
            <span className={row.attackRate > 0.1 ? "text-accent" : "text-text-muted"}>
              {(row.attackRate * 100).toFixed(1)}%
            </span>
          ),
        },
        {
          key: "defendLeaks",
          label: "Leaks Suffered",
          sortable: true,
          className: "tabular-nums text-right",
          render: (row: LeaderboardRow) => (
            <span className={row.defendLeaks > 0 ? "text-leak" : "text-defended"}>
              {row.defendLeaks}
              <span className="text-text-muted ml-1">/ {row.defenseCells}</span>
            </span>
          ),
        },
        {
          key: "defenseRate",
          label: "Defense Rate",
          sortable: true,
          className: "tabular-nums text-right",
          render: (row: LeaderboardRow) => (
            <span className={row.defenseRate > 0.9 ? "text-defended" : row.defenseRate > 0.7 ? "text-text-primary" : "text-leak"}>
              {(row.defenseRate * 100).toFixed(1)}%
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
