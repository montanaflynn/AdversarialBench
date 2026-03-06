"use client";

import { useState, useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { LikeButton } from "@/components/like-button";
import { MessageModal } from "@/components/message-modal";
import type { LeakRow } from "@/lib/db";

export function LeaksView({ data }: { data: LeakRow[] }) {
  const [selected, setSelected] = useState<LeakRow | null>(null);
  const [modelFilter, setModelFilter] = useState<string>("");

  const models = useMemo(() => {
    const names = new Set<string>();
    data.forEach((r) => {
      names.add(r.attackerName);
      names.add(r.defenderName);
    });
    return Array.from(names).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!modelFilter) return data;
    return data.filter(
      (r) => r.attackerName === modelFilter || r.defenderName === modelFilter
    );
  }, [data, modelFilter]);

  return (
    <>
      <div className="flex gap-3 items-center">
        <select
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          className="bg-surface-overlay border border-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="">All Models</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className="text-text-muted text-xs">
          {filtered.length} leak{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <DataTable
        data={filtered}
        searchKeys={["attackerName", "defenderName", "runId"]}
        searchPlaceholder="Search leaks..."
        onRowClick={setSelected}
        columns={[
          {
            key: "attackerName",
            label: "Attacker",
            sortable: true,
            render: (row: LeakRow) => (
              <span className="text-accent font-medium">{row.attackerName}</span>
            ),
          },
          {
            key: "defenderName",
            label: "Defender",
            sortable: true,
            render: (row: LeakRow) => (
              <span className="text-leak font-medium">{row.defenderName}</span>
            ),
          },
          {
            key: "attackLatencyMs",
            label: "Atk Latency",
            sortable: true,
            className: "tabular-nums text-right",
            render: (row: LeakRow) => (
              <span className="text-text-muted">{(row.attackLatencyMs / 1000).toFixed(1)}s</span>
            ),
          },
          {
            key: "defenseLatencyMs",
            label: "Def Latency",
            sortable: true,
            className: "tabular-nums text-right",
            render: (row: LeakRow) => (
              <span className="text-text-muted">{(row.defenseLatencyMs / 1000).toFixed(1)}s</span>
            ),
          },
          {
            key: "finishedAt",
            label: "When",
            sortable: true,
            render: (row: LeakRow) => (
              <span className="text-text-muted text-[11px]">
                {new Date(row.finishedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ),
          },
          {
            key: "runId",
            label: "Run",
            render: (row: LeakRow) => (
              <a
                href={`/runs/${row.runId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-accent/70 hover:text-accent text-[11px]"
              >
                {row.runId.slice(0, 8)}
              </a>
            ),
          },
          {
            key: "like",
            label: "",
            className: "w-10",
            render: (row: LeakRow) => (
              <LikeButton id={`leak-${row.id}`} />
            ),
          },
        ]}
      />

      {selected && (
        <MessageModal
          title={`Leak: ${selected.attackerName} \u2192 ${selected.defenderName}`}
          onClose={() => setSelected(null)}
          sections={[
            { label: "Attack Prompt", content: selected.attackPrompt },
            { label: "Attack Message", content: selected.attackMessage },
            { label: "Defense Prompt", content: selected.defensePrompt },
            { label: "Defense Response (leaked)", content: selected.defenseResponse },
          ]}
        />
      )}
    </>
  );
}
