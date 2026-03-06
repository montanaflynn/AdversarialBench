"use client";

import type { MatrixResultRow } from "@/lib/db";

interface CellData {
  total: number;
  leaked: number;
  defended: number;
  errors: number;
}

function cellColor(cell: CellData): string {
  if (cell.total === 0) return "transparent";
  const leakRate = cell.leaked / cell.total;
  const errorRate = cell.errors / cell.total;
  if (errorRate > 0.5) return "rgba(245, 158, 11, 0.25)";
  if (leakRate === 0) return "rgba(34, 197, 94, 0.20)";
  if (leakRate <= 0.25) return "rgba(234, 179, 8, 0.30)";
  if (leakRate <= 0.50) return "rgba(249, 115, 22, 0.40)";
  return `rgba(239, 68, 68, ${0.35 + leakRate * 0.45})`;
}

export function RunMatrixGrid({ data }: { data: MatrixResultRow[] }) {
  // Aggregate by (attacker, defender)
  const map = new Map<string, CellData>();
  const attackers = new Set<string>();
  const defenders = new Set<string>();

  for (const row of data) {
    const key = `${row.attackerName}|||${row.defenderName}`;
    attackers.add(row.attackerName);
    defenders.add(row.defenderName);
    const existing = map.get(key) ?? { total: 0, leaked: 0, defended: 0, errors: 0 };
    existing.total++;
    if (row.status === "leaked") existing.leaked++;
    else if (row.status === "refused" || row.status === "resisted") existing.defended++;
    else if (row.status === "error") existing.errors++;
    map.set(key, existing);
  }

  const attackerList = Array.from(attackers).sort();
  const defenderList = Array.from(defenders).sort();
  const cellSize = Math.max(56, Math.min(72, Math.floor(800 / Math.max(attackerList.length, defenderList.length))));
  const labelWidth = 100;

  if (attackerList.length === 0 || defenderList.length === 0) return null;

  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-wider text-text-muted mb-4">
        Matrix Grid
        <span className="ml-2 text-text-muted/60 normal-case">attacker (row) vs defender (col)</span>
      </h3>
      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Column headers */}
          <div className="flex">
            <div style={{ width: labelWidth }} />
            {defenderList.map((m) => (
              <div
                key={m}
                style={{ width: cellSize }}
                className="text-[10px] text-text-muted text-center truncate px-0.5"
                title={m}
              >
                {m.length > 8 ? m.slice(0, 7) + ".." : m}
              </div>
            ))}
          </div>
          {/* Rows */}
          {attackerList.map((attacker) => (
            <div key={attacker} className="flex items-center">
              <div
                style={{ width: labelWidth }}
                className="text-[11px] text-text-muted text-right pr-2 truncate"
                title={attacker}
              >
                {attacker}
              </div>
              {defenderList.map((defender) => {
                const key = `${attacker}|||${defender}`;
                const cell = map.get(key);
                if (!cell || cell.total === 0) {
                  return (
                    <div
                      key={defender}
                      style={{ width: cellSize, height: cellSize }}
                      className="border border-border-subtle flex items-center justify-center text-[10px] text-text-muted"
                    >
                      -
                    </div>
                  );
                }
                const pct = ((cell.leaked / cell.total) * 100).toFixed(0);
                return (
                  <div
                    key={defender}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      background: cellColor(cell),
                    }}
                    className="border border-border-subtle flex flex-col items-center justify-center cursor-default"
                    title={`${attacker} → ${defender}: ${cell.leaked}/${cell.total} leaked, ${cell.defended} defended, ${cell.errors} errors`}
                  >
                    <span className="text-[11px] font-semibold tabular-nums text-text-primary leading-none">
                      {cell.leaked}/{cell.total}
                    </span>
                    <span className="text-[9px] tabular-nums text-text-secondary leading-tight">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
