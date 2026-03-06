export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    leaked: "bg-leak-dim text-leak",
    refused: "bg-defended-dim text-defended",
    resisted: "bg-defended-dim text-defended",
    error: "bg-error-dim text-error",
    running: "bg-accent/15 text-accent",
    completed: "bg-defended-dim text-defended",
    failed: "bg-leak-dim text-leak",
    cancelled: "bg-error-dim text-error",
  };

  const displayLabels: Record<string, string> = {
    refused: "defended",
    resisted: "defended",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider ${
        styles[status] ?? "bg-surface-overlay text-text-muted"
      }`}
    >
      {displayLabels[status] ?? status}
    </span>
  );
}
