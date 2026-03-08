"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const tooltipStyle = {
  contentStyle: {
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "8px",
    fontSize: "12px",
    fontFamily: "inherit",
    color: "#fafafa",
  },
  itemStyle: { color: "#a1a1aa" },
  labelStyle: { color: "#fafafa", fontWeight: 600, marginBottom: 4 },
};

type LeaksView = "leaks" | "attacks" | "both";

function LeaksChart({
  data,
  view,
}: {
  data: Array<{ name: string; asAttacker: number; asDefender: number }>;
  view: LeaksView;
}) {
  const sorted = [...data].sort((a, b) => {
    if (view === "leaks") return b.asDefender - a.asDefender;
    if (view === "attacks") return b.asAttacker - a.asAttacker;
    return (b.asAttacker + b.asDefender) - (a.asAttacker + a.asDefender);
  });
  const height = Math.max(200, sorted.length * 32 + 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={sorted} layout="vertical" barSize={14} barGap={0}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#71717a" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip {...tooltipStyle} cursor={false} />
        {(view === "attacks" || view === "both") && (
          <Bar
            dataKey="asAttacker"
            name="Successful attacks"
            stackId="leaks"
            fill="#3b82f6"
            radius={view === "attacks" ? [0, 3, 3, 0] : [0, 0, 0, 0]}
          />
        )}
        {(view === "leaks" || view === "both") && (
          <Bar
            dataKey="asDefender"
            name="Leaks suffered"
            stackId="leaks"
            fill="#ef4444"
            radius={[0, 3, 3, 0]}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

import { useState } from "react";

export function LeaksByModelChart({
  data,
}: {
  data: Array<{ name: string; asAttacker: number; asDefender: number }>;
}) {
  const [view, setView] = useState<LeaksView>("leaks");

  const tabs: { key: LeaksView; label: string }[] = [
    { key: "leaks", label: "Leaks" },
    { key: "attacks", label: "Attacks" },
    { key: "both", label: "Both" },
  ];

  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <div className="flex items-center gap-3 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`text-xs uppercase tracking-wider transition-colors ${
              view === tab.key
                ? "text-text-primary font-semibold"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <LeaksChart data={data} view={view} />
    </div>
  );
}


function heatmapColor(rate: number): string {
  if (rate === 0) return "rgba(34, 197, 94, 0.20)";
  if (rate <= 0.25) return `rgba(234, 179, 8, ${0.15 + rate * 1.4})`;
  if (rate <= 0.50) return `rgba(249, 115, 22, ${0.2 + (rate - 0.25) * 1.6})`;
  return `rgba(239, 68, 68, ${0.4 + (rate - 0.5) * 1.0})`;
}

export function HeatmapChart({
  data,
  models,
}: {
  data: Array<{ attackerName: string; defenderName: string; leakRate: number; leaks: number; total: number; defended?: number }>;
  models: string[];
}) {
  const cellSize = Math.max(48, Math.min(64, Math.floor(800 / models.length)));
  const labelWidth = 100;

  // Compute row summaries (attack rate per attacker)
  const rowSummary = models.map((attacker) => {
    const cells = data.filter((d) => d.attackerName === attacker);
    const total = cells.reduce((s, c) => s + c.total, 0);
    const leaks = cells.reduce((s, c) => s + c.leaks, 0);
    return { total, leaks, rate: total > 0 ? leaks / total : 0 };
  });

  // Compute column summaries (defense rate per defender)
  const colSummary = models.map((defender) => {
    const cells = data.filter((d) => d.defenderName === defender);
    const total = cells.reduce((s, c) => s + c.total, 0);
    const leaks = cells.reduce((s, c) => s + c.leaks, 0);
    const defenseRate = total > 0 ? (total - leaks) / total : 0;
    return { total, leaks, defenseRate };
  });

  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-wider text-text-muted mb-4">
        Attack Success Heatmap
        <span className="ml-2 text-text-muted/60 normal-case">attacker (row) vs defender (col)</span>
      </h3>
      <div className="overflow-x-auto overflow-y-hidden">
        <div className="inline-block">
          {/* Column headers */}
          <div className="flex">
            <div style={{ width: labelWidth }} />
            {models.map((m) => (
              <div
                key={m}
                style={{ width: cellSize, height: 90, position: "relative" }}
              >
                <span
                  className="text-[10px] text-text-muted whitespace-nowrap absolute bottom-0 left-[50%]"
                  style={{ transform: "rotate(-55deg)", transformOrigin: "bottom left" }}
                  title={m}
                >
                  {m}
                </span>
              </div>
            ))}
            <div style={{ width: cellSize, height: 90, position: "relative" }}>
              <span
                className="text-[10px] text-text-muted whitespace-nowrap font-semibold absolute bottom-0 left-[50%]"
                style={{ transform: "rotate(-55deg)", transformOrigin: "bottom left" }}
              >
                Atk Rate
              </span>
            </div>
          </div>
          {/* Rows */}
          {models.map((attacker, ri) => (
            <div key={attacker} className="flex items-center">
              <div
                style={{ width: labelWidth, height: cellSize, position: "relative" }}
                className="flex items-center"
              >
                <span
                  className="text-[10px] text-text-muted whitespace-nowrap absolute right-2"
                  style={{ transform: "rotate(-35deg)", transformOrigin: "right center" }}
                  title={attacker}
                >
                  {attacker}
                </span>
              </div>
              {models.map((defender) => {
                const cell = data.find(
                  (d) => d.attackerName === attacker && d.defenderName === defender
                );
                const rate = cell?.leakRate ?? 0;
                const pct = (rate * 100).toFixed(0);
                return (
                  <div
                    key={defender}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      background: cell ? heatmapColor(rate) : "transparent",
                    }}
                    className="border border-border-subtle flex flex-col items-center justify-center cursor-default group relative"
                    title={`${attacker} → ${defender}: ${cell?.leaks ?? 0}/${cell?.total ?? 0} leaked (${pct}%)`}
                  >
                    {cell ? (
                      <>
                        <span className="text-[11px] font-semibold tabular-nums text-text-primary leading-none">
                          {cell.leaks}/{cell.total}
                        </span>
                        <span className="text-[9px] tabular-nums text-text-secondary leading-tight">
                          {pct}%
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-text-muted">-</span>
                    )}
                  </div>
                );
              })}
              {/* Row summary: attack rate */}
              <div
                style={{ width: cellSize, height: cellSize }}
                className="flex items-center justify-center text-[11px] tabular-nums font-semibold"
              >
                <span className={rowSummary[ri].rate > 0.3 ? "text-leak" : rowSummary[ri].rate > 0.1 ? "text-amber-400" : "text-defended"}>
                  {(rowSummary[ri].rate * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
          {/* Column summary row: defense rate */}
          <div className="flex items-center">
            <div
              style={{ width: labelWidth, position: "relative" }}
              className="flex items-center"
            >
              <span
                className="text-[10px] text-text-muted whitespace-nowrap font-semibold absolute right-2"
                style={{ transform: "rotate(-35deg)", transformOrigin: "right center" }}
              >
                Def Rate
              </span>
            </div>
            {colSummary.map((col, ci) => (
              <div
                key={ci}
                style={{ width: cellSize, height: 28 }}
                className="flex items-center justify-center text-[11px] tabular-nums font-semibold"
              >
                <span className={col.defenseRate >= 0.9 ? "text-defended" : col.defenseRate >= 0.7 ? "text-amber-400" : "text-leak"}>
                  {(col.defenseRate * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

