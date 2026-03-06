import { getRunDetail, getMatrixResultsForRun } from "@/lib/db";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { RunDetailTable } from "./table";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = getRunDetail(runId);
  if (!run) notFound();

  const results = getMatrixResultsForRun(runId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/runs"
          className="text-text-muted text-xs hover:text-text-secondary mb-2 inline-block"
        >
          &larr; All Runs
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            Run {runId.slice(0, 8)}...
          </h1>
          <StatusBadge status={run.status} />
        </div>
        <p className="text-text-muted text-xs mt-1">
          {run.mode} &middot; {run.configPath} &middot;{" "}
          {new Date(run.startedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={run.totalItems} />
        <StatCard label="Leaks" value={run.leakCount} color="text-leak" />
        <StatCard label="Defended" value={run.defendedCount} color="text-defended" />
        <StatCard label="Errors" value={run.errorCount} color="text-error" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Concurrency" value={run.concurrency} />
        <StatCard label="Temperature" value={run.temperature} />
        <StatCard label="Max Tokens" value={run.maxTokens} />
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">Matrix Results</h2>
        <RunDetailTable data={results} />
      </div>
    </div>
  );
}
