export function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <div className="text-text-muted text-[11px] uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color ?? "text-text-primary"}`}>
        {value}
      </div>
      {sub && (
        <div className="text-text-muted text-xs mt-0.5">{sub}</div>
      )}
    </div>
  );
}
