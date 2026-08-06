import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as logService from '../services/logService';
import { generateLogSuggestions } from '../services/aiService';
import { dbService } from '../services/databaseService';

export const createLog = async (req: AuthRequest, res: Response) => {
  try {
    const { entryText } = req.body;
    const userId = req.user!.userId;

    if (!entryText || entryText.length < 10 || entryText.length > 5000) {
      return res.status(400).json({ error: 'Entry text must be 10-5000 characters' });
    }

    const result = await logService.createDailyLog(userId, entryText);

    res.status(201).json({
      success: true,
      message: 'Log created successfully! 🔥',
      data: result,
    });
  } catch (error: any) {
    console.error('Create log error:', error);
    res.status(400).json({ error: error.message || 'Failed to create log' });
  }
};

export const getMyLogs = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 30;

    const logs = await logService.getUserLogs(userId, limit);

    res.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};

export const updateLog = async (req: AuthRequest, res: Response) => {
  try {
    const { logId } = req.params;
    const { entryText } = req.body;
    const userId = req.user!.userId;

    if (!entryText || entryText.length < 10 || entryText.length > 5000) {
      return res.status(400).json({ error: 'Entry text must be 10-5000 characters' });
    }

    const updatedLog = await logService.updateLog(logId, userId, entryText);

    res.json({
      success: true,
      message: 'Log updated successfully',
      data: updatedLog,
    });
  } catch (error: any) {
    console.error('Update log error:', error);
    res.status(400).json({ error: error.message || 'Failed to update log' });
  }
};

export const getSuggestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const logs = await dbService.getUserLogs(userId, 5);
    const tasks = await dbService.getUserTasks(userId);
    
    const recentLogTexts = logs.map(l => l.entry_text);
    const suggestions = await generateLogSuggestions(recentLogTexts, tasks);

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error: any) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
};

export const getInsights = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const logs = await dbService.getUserLogs(userId, 30);
    const tasks = await dbService.getUserTasks(userId);
    const user = await dbService.getUserById(userId);
    
    const { generateProductivityInsights } = await import('../services/aiService');
    const insights = await generateProductivityInsights(logs, tasks, user?.streak_count || 0);

    res.json({
      success: true,
      data: insights,
    });
  } catch (error: any) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
};

export const getStandup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { teamId } = req.query;
    
    let logs;
    let members;
    
    if (teamId) {
      // Team standup
      const canAccess = await dbService.canAccessTeam(userId, teamId as string);
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this team' });
      }
      
      members = await dbService.getTeamMembers(teamId as string);
      const today = new Date().toISOString().split('T')[0];
      
      logs = await Promise.all(
        members.map(async (m) => {
          const userLogs = await dbService.getUserLogs(m.user_id, 1);
          const todayLog = userLogs.find(l => l.log_date === today);
          return todayLog ? {
            ...todayLog,
            username: m.user?.username || 'Unknown',
          } : null;
        })
      );
      logs = logs.filter(l => l !== null);
    } else {
      // Personal standup
      const user = await dbService.getUserById(userId);
      logs = await dbService.getUserLogs(userId, 1);
      logs = logs.map(l => ({ ...l, username: user?.username || 'You' }));
      members = [{ user_id: userId }];
    }
    
    const { generateStandup } = await import('../services/aiService');
    const standup = await generateStandup(logs, members);
    
    res.json({
      success: true,
      data: {
        ...standup,
        logs,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Get standup error:', error);
    res.status(500).json({ error: 'Failed to generate standup' });
  }
};
