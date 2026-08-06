import { usersRepository } from '../users/users.repository';
import { logsRepository } from '../logs/logs.repository';
import { tasksRepository } from '../projects/tasks.repository';

// Moved verbatim from leaderboardController.ts. calculateImpactScore was a
// private module-level function there; kept the exact same math here.
async function calculateImpactScore(userId: string): Promise<number> {
  const user = await usersRepository.getUserById(userId);
  if (!user) return 0;

  const logs = await logsRepository.getUserLogs(userId, 30);
  const tasks = await tasksRepository.getUserTasks(userId);

  // Work Points (0-50)
  const completedTasks = tasks.filter((t: any) => t.status === 'done').length;
  const avgLogQuality = logs.reduce((sum: number, log: any) => sum + (log.word_count > 100 ? 10 : 5), 0) / Math.max(logs.length, 1);
  const workPoints = Math.min(completedTasks * 5 + avgLogQuality, 50);

  // Consistency Points (0-30)
  const consistencyPoints = Math.min(user.streak_count * 2, 30);

  // Peer Help Points (0-20) - placeholder
  const peerHelpPoints = 0;

  return Math.round(workPoints + consistencyPoints + peerHelpPoints);
}

export class LeaderboardService {
  async getLeaderboard() {
    const allUsers = await usersRepository.getAllUsers();

    const usersWithScores = await Promise.all(
      allUsers.map(async (user: any) => {
        const score = await calculateImpactScore(user.user_id);
        await usersRepository.updateUser(user.user_id, { impact_score: score });

        const logs = await logsRepository.getUserLogs(user.user_id, 7);
        const recentActivity = logs.length;

        return {
          user_id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          impact_score: score,
          streak_count: await logsRepository.calculateStreak(user.user_id),
          recent_activity: recentActivity,
          team_id: user.team_id,
        };
      })
    );

    return usersWithScores.filter((u) => u.recent_activity > 0).sort((a, b) => b.impact_score - a.impact_score);
  }
}

export const leaderboardService = new LeaderboardService();
