"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { LikeButton } from "@/components/like-button";
import type { Run } from "@/lib/db";

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RunsTable({ data }: { data: Run[] }) {
  const router = useRouter();

  return (
    <DataTable
      data={data}
      searchKeys={["runId", "mode", "status", "configPath"]}
      searchPlaceholder="Search runs..."
      onRowClick={(row) => router.push(`/runs/${row.runId}`)}
      columns={[
        {
          key: "runId",
          label: "Run ID",
          sortable: true,
          render: (row: Run) => (
            <span className="text-accent font-medium">
              {row.runId.slice(0, 8)}...
            </span>
          ),
        },
        {
          key: "mode",
          label: "Mode",
          sortable: true,
          filterable: true,
          render: (row: Run) => (
            <span className="text-text-secondary">{row.mode}</span>
          ),
        },
        {
          key: "status",
          label: "Status",
          sortable: true,
          filterable: true,
          render: (row: Run) => <StatusBadge status={row.status} />,
        },
        {
          key: "totalItems",
          label: "Total",
          sortable: true,
          className: "tabular-nums text-right",
        },
        {
          key: "leakCount",
          label: "Leaks",
          sortable: true,
          className: "tabular-nums text-right",
          render: (row: Run) => (
            <span className={row.leakCount > 0 ? "text-leak" : "text-text-muted"}>
              {row.leakCount}
            </span>
          ),
        },
        {
          key: "defendedCount",
          label: "Defended",
          sortable: true,
          className: "tabular-nums text-right",
          render: (row: Run) => (
            <span className="text-defended">{row.defendedCount}</span>
          ),
        },
        {
          key: "startedAt",
          label: "Started",
          sortable: true,
          render: (row: Run) => (
            <span className="text-text-muted">{formatDate(row.startedAt)}</span>
          ),
        },
        {
          key: "like",
          label: "",
          className: "w-10",
          render: (row: Run) => <LikeButton id={`run-${row.runId}`} />,
        },
      ]}
    />
  );
}
