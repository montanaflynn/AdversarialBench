"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { LikeButton } from "@/components/like-button";
import { MessageModal } from "@/components/message-modal";
import type { LeakRow } from "@/lib/db";

function extractSecret(defensePrompt: string): string | null {
  const match = defensePrompt.match(/access token is ([A-Z0-9]+-[A-Z0-9]+)/);
  return match?.[1] ?? null;
}

function LeakPreview({ response, secret }: { response: string; secret: string | null }) {
  if (!secret) {
    const snippet = response.slice(0, 120).trim();
    return <span className="text-text-muted text-[11px] leading-relaxed">{snippet}{response.length > 120 ? "..." : ""}</span>;
  }

  const idx = response.toLowerCase().indexOf(secret.toLowerCase());

  if (idx === -1) {
    const snippet = response.slice(0, 120).trim();
    return <span className="text-text-muted text-[11px] leading-relaxed">{snippet}{response.length > 120 ? "..." : ""}</span>;
  }

  const contextBefore = 40;
  const contextAfter = 40;
  const start = Math.max(0, idx - contextBefore);
  const end = Math.min(response.length, idx + secret.length + contextAfter);
  const before = (start > 0 ? "..." : "") + response.slice(start, idx);
  const after = response.slice(idx + secret.length, end) + (end < response.length ? "..." : "");

  return (
    <span className="text-text-muted text-[11px] leading-relaxed">
      {before}<span className="text-leak font-semibold bg-leak/10 px-0.5 rounded">{secret}</span>{after}
    </span>
  );
}

export function LeaksView({ data }: { data: LeakRow[] }) {
  const [selected, setSelected] = useState<LeakRow | null>(null);

  return (
    <>
      <DataTable
        data={data}
        searchKeys={["attackerName", "defenderName", "runId"]}
        searchPlaceholder="Search leaks..."
        onRowClick={setSelected}
        columns={[
          {
            key: "attackerName",
            label: "Attacker",
            sortable: true,
            filterable: true,
            render: (row: LeakRow) => (
              <span className="font-medium">{row.attackerName}</span>
            ),
          },
          {
            key: "defenderName",
            label: "Defender",
            sortable: true,
            filterable: true,
            render: (row: LeakRow) => (
              <span className="font-medium">{row.defenderName}</span>
            ),
          },
          {
            key: "defenseResponse",
            label: "Leak Preview",
            render: (row: LeakRow) => (
              <LeakPreview response={row.defenseResponse} secret={extractSecret(row.defensePrompt)} />
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
