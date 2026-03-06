import { getRuns } from "@/lib/db";
import { RunsTable } from "./table";

export const dynamic = "force-dynamic";

export default function RunsPage() {
  const runs = getRuns();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold mb-1">Runs</h1>
        <p className="text-text-muted text-xs">
          All benchmark runs sorted by most recent
        </p>
      </div>
      <RunsTable data={runs} />
    </div>
  );
}
