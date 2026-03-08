"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { MessageModal } from "@/components/message-modal";
import type { MatrixResultRow } from "@/lib/db";

export function RunDetailTable({ data }: { data: MatrixResultRow[] }) {
  const [selected, setSelected] = useState<MatrixResultRow | null>(null);

  return (
    <>
      <DataTable
        data={data}
        searchKeys={["attackerName", "defenderName", "status"]}
        searchPlaceholder="Filter by model or status..."
        onRowClick={setSelected}
        columns={[
          {
            key: "attackerName",
            label: "Attacker",
            sortable: true,
            filterable: true,
            render: (row: MatrixResultRow) => (
              <span className="text-text-primary font-medium">{row.attackerName}</span>
            ),
          },
          {
            key: "defenderName",
            label: "Defender",
            sortable: true,
            filterable: true,
            render: (row: MatrixResultRow) => (
              <span className="text-text-primary font-medium">{row.defenderName}</span>
            ),
          },
          {
            key: "status",
            label: "Status",
            sortable: true,
            filterable: true,
            render: (row: MatrixResultRow) => <StatusBadge status={row.status} />,
          },
          {
            key: "attackLatencyMs",
            label: "Atk Latency",
            sortable: true,
            className: "tabular-nums text-right",
            render: (row: MatrixResultRow) => (
              <span className="text-text-muted">{(row.attackLatencyMs / 1000).toFixed(1)}s</span>
            ),
          },
          {
            key: "defenseLatencyMs",
            label: "Def Latency",
            sortable: true,
            className: "tabular-nums text-right",
            render: (row: MatrixResultRow) => (
              <span className="text-text-muted">{(row.defenseLatencyMs / 1000).toFixed(1)}s</span>
            ),
          },
          {
            key: "attackCost",
            label: "Cost",
            sortable: true,
            className: "tabular-nums text-right",
            render: (row: MatrixResultRow) => {
              const total = (row.attackCost ?? 0) + (row.defenseCost ?? 0);
              return (
                <span className="text-text-muted">
                  {total > 0 ? `$${total.toFixed(4)}` : "-"}
                </span>
              );
            },
          },
        ]}
      />

      {selected && (
        <MessageModal
          title={`${selected.attackerName} \u2192 ${selected.defenderName}`}
          onClose={() => setSelected(null)}
          sections={[
            { label: "Attack System Prompt", content: selected.attackSystemPrompt || selected.attackPrompt },
            ...(selected.attackUserPrompt ? [{ label: "Attack User Prompt", content: selected.attackUserPrompt }] : []),
            { label: "Attack Message", content: selected.attackMessage },
            { label: "Defense System Prompt", content: selected.defenseSystemPrompt || selected.defensePrompt },
            ...(selected.defenseUserPrompt ? [{ label: "Defense User Prompt", content: selected.defenseUserPrompt }] : []),
            { label: "Defense Response", content: selected.defenseResponse },
            ...(selected.errorText ? [{ label: "Error", content: selected.errorText }] : []),
          ]}
        />
      )}
    </>
  );
}
