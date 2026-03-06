"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { LikeButton } from "@/components/like-button";
import { MessageModal } from "@/components/message-modal";
import type { HeadToHeadTurnRow } from "@/lib/db";

export function HeadToHeadTable({ data }: { data: HeadToHeadTurnRow[] }) {
  const [selected, setSelected] = useState<HeadToHeadTurnRow | null>(null);

  return (
    <>
      <DataTable
        data={data}
        searchKeys={["actorName", "targetName", "status", "phase"]}
        searchPlaceholder="Filter turns..."
        onRowClick={setSelected}
        columns={[
          {
            key: "roundNumber",
            label: "Round",
            sortable: true,
            className: "tabular-nums w-16",
          },
          {
            key: "phase",
            label: "Phase",
            sortable: true,
            filterable: true,
            render: (row: HeadToHeadTurnRow) => (
              <span className={row.phase === "attack" ? "text-accent" : "text-text-secondary"}>
                {row.phase}
              </span>
            ),
          },
          {
            key: "actorName",
            label: "Actor",
            sortable: true,
            filterable: true,
            render: (row: HeadToHeadTurnRow) => (
              <span className="text-text-primary font-medium">{row.actorName}</span>
            ),
          },
          {
            key: "targetName",
            label: "Target",
            sortable: true,
            filterable: true,
            render: (row: HeadToHeadTurnRow) => (
              <span className="text-text-primary font-medium">{row.targetName}</span>
            ),
          },
          {
            key: "status",
            label: "Status",
            sortable: true,
            filterable: true,
            render: (row: HeadToHeadTurnRow) => <StatusBadge status={row.status} />,
          },
          {
            key: "latencyMs",
            label: "Latency",
            sortable: true,
            className: "tabular-nums text-right",
            render: (row: HeadToHeadTurnRow) => (
              <span className="text-text-muted">{(row.latencyMs / 1000).toFixed(1)}s</span>
            ),
          },
          {
            key: "cost",
            label: "Cost",
            sortable: true,
            className: "tabular-nums text-right",
            render: (row: HeadToHeadTurnRow) => (
              <span className="text-text-muted">
                {row.cost != null && row.cost > 0 ? `$${row.cost.toFixed(4)}` : "-"}
              </span>
            ),
          },
          {
            key: "like",
            label: "",
            className: "w-10",
            render: (row: HeadToHeadTurnRow) => (
              <LikeButton id={`h2h-${row.id}`} />
            ),
          },
        ]}
      />

      {selected && (
        <MessageModal
          title={`Round ${selected.roundNumber} - ${selected.actorName} ${selected.phase === "attack" ? "\u2192" : "\u2190"} ${selected.targetName}`}
          onClose={() => setSelected(null)}
          sections={[
            { label: "Prompt", content: selected.promptText },
            { label: "Response", content: selected.responseText },
            ...(selected.leakedSecretOwner ? [{ label: "Leaked Secret Owner", content: selected.leakedSecretOwner }] : []),
            ...(selected.errorText ? [{ label: "Error", content: selected.errorText }] : []),
          ]}
        />
      )}
    </>
  );
}
