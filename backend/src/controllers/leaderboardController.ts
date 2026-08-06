import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dbService } from '../services/databaseService';

const calculateImpactScore = async (userId: string) => {
  const user = await dbService.getUserById(userId);
  if (!user) return 0;

  const logs = await dbService.getUserLogs(userId, 30);
  const tasks = await dbService.getUserTasks(userId);
  
  // Work Points (0-50)
  const completedTasks = tasks.filter(t => t.status === 'done').length;
  const avgLogQuality = logs.reduce((sum, log) => sum + (log.word_count > 100 ? 10 : 5), 0) / Math.max(logs.length, 1);
  const workPoints = Math.min(completedTasks * 5 + avgLogQuality, 50);
  
  // Consistency Points (0-30)
  const consistencyPoints = Math.min(user.streak_count * 2, 30);
  
  // Peer Help Points (0-20) - placeholder
  const peerHelpPoints = 0;
  
  return Math.round(workPoints + consistencyPoints + peerHelpPoints);
};

export const getLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const { period } = req.query;
    const allUsers = await dbService.getAllUsers();
    
    const usersWithScores = await Promise.all(
      allUsers.map(async (user) => {
        const score = await calculateImpactScore(user.user_id);
        await dbService.updateUser(user.user_id, { impact_score: score });
        
        const logs = await dbService.getUserLogs(user.user_id, 7);
        const recentActivity = logs.length;
        
        return {
          user_id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          impact_score: score,
          streak_count: await dbService.calculateStreak(user.user_id),
          recent_activity: recentActivity,
          team_id: user.team_id,
        };
      })
    );
    
    const sorted = usersWithScores
      .filter(u => u.recent_activity > 0)
      .sort((a, b) => b.impact_score - a.impact_score);
    
    res.json({
      success: true,
      data: sorted,
    });
  } catch (error: any) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
};
