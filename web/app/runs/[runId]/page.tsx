import { getRunDetail, getMatrixResultsForRun, getHeadToHeadTurnsForRun } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { RunDetailTable } from "./table";
import { HeadToHeadTable } from "./h2h-table";
import { RunMatrixGrid } from "./matrix-grid";
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

  const isH2H = run.mode === "head-to-head";
  const matrixResults = isH2H ? [] : getMatrixResultsForRun(runId);
  const h2hTurns = isH2H ? getHeadToHeadTurnsForRun(runId) : [];

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
          {" "}&middot; concurrency {run.concurrency} &middot; temp {run.temperature} &middot; max tokens {run.maxTokens}
        </p>
      </div>

      {/* Compact inline stats strip */}
      <div className="bg-surface-raised border border-border rounded-lg px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
          <span className="font-semibold text-text-primary">{run.totalItems}</span>
          <span className="text-text-muted">total</span>
          <span className="text-text-muted">&middot;</span>
          <span className="font-semibold text-leak">{run.leakCount}</span>
          <span className="text-text-muted">leaks</span>
          {run.totalItems > 0 && (
            <>
              <span className="text-text-muted">({((run.leakCount / run.totalItems) * 100).toFixed(1)}%)</span>
            </>
          )}
          <span className="text-text-muted">&middot;</span>
          <span className="font-semibold text-defended">{run.defendedCount}</span>
          <span className="text-text-muted">defended</span>
          <span className="text-text-muted">&middot;</span>
          <span className="font-semibold text-error">{run.errorCount}</span>
          <span className="text-text-muted">errors</span>
        </div>
      </div>

      {isH2H ? (
        <>
          <h2 className="text-sm font-semibold mb-3">Head-to-Head Turns</h2>
          <HeadToHeadTable data={h2hTurns} />
        </>
      ) : (
        <>
          {/* Matrix grid */}
          <RunMatrixGrid data={matrixResults} />

          {/* Detail table */}
          <div>
            <h2 className="text-sm font-semibold mb-3">All Results</h2>
            <RunDetailTable data={matrixResults} />
          </div>
        </>
      )}
    </div>
  );
}
