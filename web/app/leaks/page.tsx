import { getLeaks } from "@/lib/db";
import { LeaksView } from "./view";

export const dynamic = "force-dynamic";

export default function LeaksPage() {
  const leaks = getLeaks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold mb-1">Leaks</h1>
        <p className="text-text-muted text-xs">
          All instances where a defender exposed protected information &middot;{" "}
          {leaks.length} total
        </p>
      </div>
      <LeaksView data={leaks} />
    </div>
  );
}
