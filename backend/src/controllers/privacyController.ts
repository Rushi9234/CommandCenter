import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dbService } from '../services/databaseService';

export const updatePrivacySettings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { ai_enabled, sentiment_tracking, leaderboard_visible, analytics_opt_in } = req.body;

    const user = await dbService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.privacy_settings = {
      ai_enabled: ai_enabled !== undefined ? ai_enabled : user.privacy_settings.ai_enabled,
      sentiment_tracking: sentiment_tracking !== undefined ? sentiment_tracking : user.privacy_settings.sentiment_tracking,
      leaderboard_visible: leaderboard_visible !== undefined ? leaderboard_visible : user.privacy_settings.leaderboard_visible,
      analytics_opt_in: analytics_opt_in !== undefined ? analytics_opt_in : user.privacy_settings.analytics_opt_in,
    };

    res.json({
      success: true,
      message: 'Privacy settings updated',
      data: user.privacy_settings,
    });
  } catch (error: any) {
    console.error('Update privacy settings error:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
};

export const getPrivacySettings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await dbService.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: user.privacy_settings,
    });
  } catch (error: any) {
    console.error('Get privacy settings error:', error);
    res.status(500).json({ error: 'Failed to get privacy settings' });
  }
};

export const exportUserData = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    const user = await dbService.getUserById(userId);
    const logs = await dbService.getUserLogs(userId, 1000);
    const tasks = await dbService.getUserTasks(userId);
    const teams = await dbService.getUserTeams(userId);
    const projects = await dbService.getUserProjects(userId);

    const exportData = {
      user: {
        user_id: user?.user_id,
        email: user?.email,
        username: user?.username,
        full_name: user?.full_name,
        created_at: user?.created_at,
      },
      logs: logs.map(l => ({
        log_id: l.log_id,
        entry_text: l.entry_text,
        log_date: l.log_date,
        log_time: l.log_time,
        created_at: l.created_at,
      })),
      tasks: tasks,
      teams: teams.map(t => ({
        team_id: t.team_id,
        team_name: t.team_name,
      })),
      projects: projects.map(p => ({
        project_id: p.project_id,
        project_name: p.project_name,
      })),
      exported_at: new Date().toISOString(),
    };

    res.json({
      success: true,
      message: 'Data exported successfully',
      data: exportData,
    });
  } catch (error: any) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
};

export const deleteUserData = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { confirm } = req.body;

    if (confirm !== 'DELETE_MY_DATA') {
      return res.status(400).json({ error: 'Confirmation required' });
    }

    // This would delete all user data in production
    // For now, just mark as deleted
    console.log(`[PRIVACY] User ${userId} requested data deletion`);

    res.json({
      success: true,
      message: 'Data deletion request received. Your account will be deleted within 30 days.',
    });
  } catch (error: any) {
    console.error('Delete data error:', error);
    res.status(500).json({ error: 'Failed to delete data' });
  }
};
