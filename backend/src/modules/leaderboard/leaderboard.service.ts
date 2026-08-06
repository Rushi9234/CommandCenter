import { leaderboardRepository } from './leaderboard.repository';

// Milestone 10: the scoring formula itself is unchanged from the old
// per-user implementation -- only how its inputs are fetched changed (one
// aggregate query instead of a per-user fan-out; see leaderboard.repository.ts
// for exactly which query replaced which old per-user call).
export class LeaderboardService {
  async getLeaderboard() {
    const rows = await leaderboardRepository.getAggregateStats();

    const scored = rows.map((row) => {
      const completedTasks = row.completed_tasks;
      const avgLogQuality = row.quality_sum_30 / Math.max(row.log_count_30, 1);

      // Work Points (0-50)
      const workPoints = Math.min(completedTasks * 5 + avgLogQuality, 50);

      // Consistency Points (0-30)
      const consistencyPoints = Math.min(row.stored_streak_count * 2, 30);

      // Peer Help Points (0-20) - placeholder
      const peerHelpPoints = 0;

      const impactScore = Math.round(workPoints + consistencyPoints + peerHelpPoints);

      // recent_activity is `min(total log rows, 7)`, not "logged in the
      // last 7 days" -- matches the old getUserLogs(userId, 7).length,
      // which returns the 7 most recent rows regardless of their age.
      const recentActivity = Math.min(row.total_logs, 7);

      return {
        user_id: row.user_id,
        username: row.username,
        full_name: row.full_name,
        impact_score: impactScore,
        streak_count: row.live_streak,
        recent_activity: recentActivity,
        // Preserved from the old implementation: getAllUsers() never
        // selected users.team_id, so this field has always been
        // undefined in the response. Not fixed here -- out of scope for
        // a scalability rewrite that must not change behavior.
        team_id: undefined as string | undefined,
      };
    });

    // impact_score is read elsewhere (auth.service.ts's session payload,
    // rendered by the frontend's ExecutiveBrief page) -- the old
    // implementation refreshed it for every user on every leaderboard
    // view via N single-row UPDATEs; this preserves that exact behavior
    // (including updating users who get filtered out below) as one bulk
    // statement instead.
    await leaderboardRepository.bulkUpdateImpactScores(scored.map((s) => ({ userId: s.user_id, score: s.impact_score })));

    return scored.filter((s) => s.recent_activity > 0).sort((a, b) => b.impact_score - a.impact_score);
  }
}

export const leaderboardService = new LeaderboardService();
