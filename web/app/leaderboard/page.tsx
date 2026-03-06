import { getLeaderboard } from "@/lib/db";
import { LeaderboardTable } from "./table";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  const leaderboard = getLeaderboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold mb-1">Leaderboard</h1>
        <p className="text-text-muted text-xs">
          All-time model rankings across all matrix runs
        </p>
      </div>
      <LeaderboardTable data={leaderboard} />
    </div>
  );
}
