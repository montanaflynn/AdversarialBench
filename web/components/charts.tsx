"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  Cell,
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

export function LeaksByModelChart({
  data,
}: {
  data: Array<{ name: string; asAttacker: number; asDefender: number }>;
}) {
  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-wider text-text-muted mb-4">
        Leaks by Model
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#71717a" }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...tooltipStyle} />
          <Bar
            dataKey="asAttacker"
            name="Caused (attacker)"
            fill="#3b82f6"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="asDefender"
            name="Suffered (defender)"
            fill="#ef4444"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LeakTrendChart({
  data,
}: {
  data: Array<{ date: string; leaks: number; defended: number; total: number }>;
}) {
  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-wider text-text-muted mb-4">
        Results Over Time
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#71717a" }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...tooltipStyle} />
          <Area
            type="monotone"
            dataKey="defended"
            name="Defended"
            stackId="1"
            fill="rgba(34, 197, 94, 0.2)"
            stroke="#22c55e"
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="leaks"
            name="Leaked"
            stackId="1"
            fill="rgba(239, 68, 68, 0.2)"
            stroke="#ef4444"
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HeatmapChart({
  data,
  models,
}: {
  data: Array<{ attackerName: string; defenderName: string; leakRate: number; leaks: number; total: number }>;
  models: string[];
}) {
  const cellSize = Math.min(48, Math.floor(600 / models.length));

  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-wider text-text-muted mb-4">
        Attack Success Heatmap
        <span className="ml-2 text-text-muted/60 normal-case">attacker (row) vs defender (col)</span>
      </h3>
      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="flex">
            <div style={{ width: 80 }} />
            {models.map((m) => (
              <div
                key={m}
                style={{ width: cellSize }}
                className="text-[10px] text-text-muted text-center truncate px-0.5"
                title={m}
              >
                {m.length > 6 ? m.slice(0, 5) + ".." : m}
              </div>
            ))}
          </div>
          {models.map((attacker) => (
            <div key={attacker} className="flex items-center">
              <div
                style={{ width: 80 }}
                className="text-[10px] text-text-muted text-right pr-2 truncate"
                title={attacker}
              >
                {attacker}
              </div>
              {models.map((defender) => {
                const cell = data.find(
                  (d) => d.attackerName === attacker && d.defenderName === defender
                );
                const rate = cell?.leakRate ?? 0;
                const bg =
                  rate === 0
                    ? "rgba(34, 197, 94, 0.15)"
                    : rate < 0.25
                    ? "rgba(245, 158, 11, 0.25)"
                    : rate < 0.5
                    ? "rgba(239, 68, 68, 0.3)"
                    : `rgba(239, 68, 68, ${0.3 + rate * 0.5})`;
                return (
                  <div
                    key={defender}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      background: bg,
                    }}
                    className="border border-border-subtle flex items-center justify-center text-[10px] tabular-nums text-text-secondary cursor-default"
                    title={`${attacker} -> ${defender}: ${cell?.leaks ?? 0}/${cell?.total ?? 0} leaked`}
                  >
                    {cell ? `${cell.leaks}` : "-"}
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

export function DefenseRateChart({
  data,
}: {
  data: Array<{ name: string; rate: number; defends: number; cells: number }>;
}) {
  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-wider text-text-muted mb-4">
        Defense Rate by Model
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" barSize={16}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 1]}
            tick={{ fontSize: 11, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, "Defense Rate"]}
          />
          <Bar dataKey="rate" radius={[0, 3, 3, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.rate > 0.9
                    ? "#22c55e"
                    : entry.rate > 0.7
                    ? "#3b82f6"
                    : entry.rate > 0.5
                    ? "#f59e0b"
                    : "#ef4444"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
