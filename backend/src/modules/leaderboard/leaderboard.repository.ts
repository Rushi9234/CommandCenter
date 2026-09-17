import { query } from '../../db/client';

// Leaderboard period filter: 'all' preserves the original, unfiltered
// aggregate exactly (verified byte-for-byte equivalent to the pre-period
// query below). 'today'/'week'/'month' scope the WORK inputs (log
// quality/count, completed tasks) to a calendar-aligned window via
// date_trunc. Streak (`stored_streak_count`/`live_streak`) is deliberately
// NEVER windowed by period -- a streak is an inherently rolling,
// all-time-consecutive-days construct; showing "This Month"'s streak as
// reset-to-zero-at-the-1st would be actively misleading, not a genuine
// per-period view. See leaderboard.service.ts for the scoring formula
// that consumes these fields.
export type LeaderboardPeriod = 'all' | 'today' | 'week' | 'month';

// Milestone 10: one aggregate query replaces the old per-user fan-out
// (getAllUsers + N x [getUserById, getUserLogs x2, getUserTasks,
// calculateStreak, updateUser]). Every sub-metric here reproduces the
// exact query the old per-user code ran, just computed set-based for all
// users at once instead of once per user:
//   - recent_30: the 30 MOST RECENT log rows per user (matches
//     logsRepository.getUserLogs(userId, 30), which is ORDER BY
//     created_at DESC LIMIT 30 -- a row-count cap, not a date window).
//   - total_logs: every log row the user has, unbounded -- used for
//     recent_activity, which despite its name is `LEAST(total, 7)`, not
//     "logged in the last 7 days" (matches getUserLogs(userId, 7).length).
//   - completed_tasks: same created_by-OR-team-membership condition as
//     tasks.repository.ts's getUserTasks, counted instead of listed.
//   - live_streak: the same gap-detection logic as
//     logsRepository.calculateStreak, partitioned by user instead of
//     filtered to one user.
// Deliberately does NOT select users.team_id -- the old getAllUsers()
// query never selected it either, so the leaderboard response's team_id
// field has always been undefined. Reproduced exactly, not fixed here.
export interface LeaderboardAggregateRow {
  user_id: string;
  username: string;
  full_name: string;
  avatar_key: string | null;
  stored_streak_count: number;
  log_count_30: number;
  quality_sum_30: number;
  total_logs: number;
  completed_tasks: number;
  live_streak: number;
  // Milestone 32: raw text ('true'/'false') straight off the JSONB column,
  // not cast to boolean -- leaderboard.service.ts treats anything other
  // than the literal string 'false' as visible, matching the same
  // "missing defaults to enabled" rule privacy.service.ts's ai_enabled
  // check uses.
  leaderboard_visible: string | null;
}

// $1 is the period text ('all' | 'today' | 'week' | 'month'). period_bounds
// resolves it to a single start-of-window timestamp (NULL for 'all', which
// makes every downstream "period_start IS NULL OR ..." filter a no-op --
// so period='all' is byte-for-byte identical to the original, pre-period
// query). period_logs applies that window to daily_logs ONCE; ranked_logs/
// recent_30_stats/log_totals all read from it, so "30 most recent logs"
// and "total logs" both become period-scoped together. task_stats' window
// is applied separately (tasks.completed_at, not daily_logs.created_at).
// gapped_dates/streaks deliberately read from the UNFILTERED daily_logs --
// see the LeaderboardPeriod comment above for why streak is never windowed.
const AGGREGATE_QUERY = `
  WITH period_bounds AS (
    SELECT CASE $1::text
      WHEN 'today' THEN date_trunc('day', CURRENT_TIMESTAMP)
      WHEN 'week' THEN date_trunc('week', CURRENT_TIMESTAMP)
      WHEN 'month' THEN date_trunc('month', CURRENT_TIMESTAMP)
      ELSE NULL
    END AS period_start
  ),
  period_logs AS (
    SELECT d.*
    FROM daily_logs d, period_bounds b
    WHERE b.period_start IS NULL OR d.created_at >= b.period_start
  ),
  ranked_logs AS (
    SELECT user_id, word_count,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM period_logs
  ),
  recent_30_stats AS (
    SELECT user_id,
           COUNT(*) AS log_count_30,
           SUM(CASE WHEN word_count > 100 THEN 10 ELSE 5 END) AS quality_sum_30
    FROM ranked_logs
    WHERE rn <= 30
    GROUP BY user_id
  ),
  log_totals AS (
    SELECT user_id, COUNT(*) AS total_logs
    FROM period_logs
    GROUP BY user_id
  ),
  task_stats AS (
    SELECT u.user_id,
           COUNT(DISTINCT t.task_id) FILTER (
             WHERE t.status = 'done'
               AND (b.period_start IS NULL OR t.completed_at >= b.period_start)
           ) AS completed_tasks
    FROM users u
    CROSS JOIN period_bounds b
    LEFT JOIN tasks t ON (
      t.created_by = u.user_id
      OR t.project_id IN (
        SELECT p.project_id FROM projects p
        JOIN team_members tm ON tm.team_id = p.team_id
        WHERE tm.user_id = u.user_id
      )
    )
    GROUP BY u.user_id
  ),
  gapped_dates AS (
    SELECT user_id, log_date,
           log_date - LAG(log_date) OVER (PARTITION BY user_id ORDER BY log_date) AS gap
    FROM (SELECT DISTINCT user_id, log_date FROM daily_logs) d
  ),
  streaks AS (
    SELECT user_id, COUNT(*) AS streak
    FROM gapped_dates
    WHERE gap = 1 OR log_date = CURRENT_DATE
    GROUP BY user_id
  )
  SELECT
    u.user_id,
    u.username,
    u.full_name,
    u.avatar_key,
    u.streak_count AS stored_streak_count,
    COALESCE(l30.log_count_30, 0)::int AS log_count_30,
    COALESCE(l30.quality_sum_30, 0)::int AS quality_sum_30,
    COALESCE(lt.total_logs, 0)::int AS total_logs,
    COALESCE(ts.completed_tasks, 0)::int AS completed_tasks,
    COALESCE(s.streak, 0)::int AS live_streak,
    u.privacy_settings->>'leaderboard_visible' AS leaderboard_visible
  FROM users u
  LEFT JOIN recent_30_stats l30 ON l30.user_id = u.user_id
  LEFT JOIN log_totals lt ON lt.user_id = u.user_id
  LEFT JOIN task_stats ts ON ts.user_id = u.user_id
  LEFT JOIN streaks s ON s.user_id = u.user_id
`;

export class LeaderboardRepository {
  async getAggregateStats(period: LeaderboardPeriod = 'all'): Promise<LeaderboardAggregateRow[]> {
    return query<LeaderboardAggregateRow>(AGGREGATE_QUERY, [period]);
  }

  // Replaces N sequential single-row UPDATEs with one statement. Matches
  // the old usersRepository.updateUser's shape (bumps updated_at too).
  async bulkUpdateImpactScores(scores: { userId: string; score: number }[]): Promise<void> {
    if (scores.length === 0) return;

    const values = scores.map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::int)`).join(', ');
    const params = scores.flatMap((s) => [s.userId, s.score]);

    const text = `
      UPDATE users AS u
      SET impact_score = v.score, updated_at = CURRENT_TIMESTAMP
      FROM (VALUES ${values}) AS v(user_id, score)
      WHERE u.user_id = v.user_id
    `;

    await query(text, params);
  }
}

export const leaderboardRepository = new LeaderboardRepository();
