import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dbService } from '../services/databaseService';
import { generateMentorAdvice } from '../services/aiService';

export const createBlocker = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId, title, description, blockerType, urgency, impact, affectedTasks, attemptedSolutions } = req.body;
    const userId = req.user!.userId;

    if (!title || !teamId) {
      return res.status(400).json({ error: 'Title and team ID are required' });
    }

    // AI Analysis: Generate suggestions, find similar blockers, suggest helpers
    const aiSuggestions = await generateBlockerSuggestions(title, description, blockerType, attemptedSolutions);
    const similarBlockers = await findSimilarBlockers(teamId, title, description);
    const suggestedHelpers = await suggestTeamHelpers(teamId, blockerType);

    const blocker = await dbService.createBlocker({
      team_id: teamId,
      title,
      description: description || '',
      blocker_type: blockerType || 'technical',
      urgency: urgency || 'medium',
      impact: impact || 'blocks_task',
      affected_tasks: affectedTasks || [],
      attempted_solutions: attemptedSolutions || '',
      created_by: userId,
      ai_suggestions: aiSuggestions,
      similar_blockers: similarBlockers,
      suggested_helpers: suggestedHelpers
    });

    res.status(201).json({
      success: true,
      message: 'Blocker created successfully',
      data: blocker,
    });
  } catch (error: any) {
    console.error('Create blocker error:', error);
    res.status(400).json({ error: error.message || 'Failed to create blocker' });
  }
};

// Helper functions for AI analysis
async function generateBlockerSuggestions(title: string, description: string, type: string, attempted: string): Promise<string[]> {
  try {
    const { analyzeBlocker } = await import('../services/aiService');
    const result = await analyzeBlocker(title, description, type, attempted);
    return result.suggestions || [];
  } catch {
    return [];
  }
}

async function findSimilarBlockers(teamId: string, title: string, description: string): Promise<string[]> {
  const blockers = await dbService.getTeamBlockers(teamId);
  const resolved = blockers.filter(b => b.status === 'resolved');
  // Simple similarity: check if titles/descriptions share keywords
  const keywords = (title + ' ' + description).toLowerCase().split(/\s+/);
  return resolved
    .filter(b => {
      const text = (b.title + ' ' + b.description).toLowerCase();
      return keywords.some(k => k.length > 3 && text.includes(k));
    })
    .slice(0, 3)
    .map(b => b.blocker_id);
}

async function suggestTeamHelpers(teamId: string, blockerType: string): Promise<string[]> {
  const members = await dbService.getTeamMembers(teamId);
  // Suggest admins and managers first
  return members
    .filter(m => m.role === 'admin' || m.role === 'manager')
    .slice(0, 3)
    .map(m => m.user_id);
}

export const getTeamBlockers = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const userId = req.user!.userId;

    const canAccess = await dbService.canAccessTeam(userId, teamId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied to this team' });
    }

    const blockers = await dbService.getTeamBlockers(teamId);

    const blockersWithUsers = await Promise.all(
      blockers.map(async (blocker) => {
        const creator = await dbService.getUserById(blocker.created_by);
        const messages = await dbService.getBlockerMessages(blocker.blocker_id);
        return {
          ...blocker,
          creator: creator ? {
            full_name: creator.full_name,
            username: creator.username,
          } : null,
          message_count: messages.length,
        };
      })
    );

    res.json({
      success: true,
      data: blockersWithUsers,
    });
  } catch (error: any) {
    console.error('Get blockers error:', error);
    res.status(500).json({ error: 'Failed to fetch blockers' });
  }
};

export const updateBlocker = async (req: AuthRequest, res: Response) => {
  try {
    const { blockerId } = req.params;
    const updates = req.body;
    const userId = req.user!.userId;

    if (updates.status === 'resolved') {
      updates.resolved_by = userId;
    }

    const blocker = await dbService.updateBlocker(blockerId, updates);

    res.json({
      success: true,
      message: 'Blocker updated successfully',
      data: blocker,
    });
  } catch (error: any) {
    console.error('Update blocker error:', error);
    res.status(400).json({ error: error.message || 'Failed to update blocker' });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { blockerId } = req.params;
    const { messageText } = req.body;
    const userId = req.user!.userId;

    if (!messageText) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const message = await dbService.createMessage(blockerId, userId, messageText);

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    res.status(400).json({ error: 'Failed to send message' });
  }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { blockerId } = req.params;
    const messages = await dbService.getBlockerMessages(blockerId);

    const messagesWithUsers = await Promise.all(
      messages.map(async (message) => {
        const user = await dbService.getUserById(message.user_id);
        return {
          ...message,
          user: user ? {
            user_id: user.user_id,
            username: user.username,
            full_name: user.full_name,
          } : null,
        };
      })
    );

    res.json({
      success: true,
      data: messagesWithUsers,
    });
  } catch (error: any) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

export const getAIMentorAdvice = async (req: AuthRequest, res: Response) => {
  try {
    const { blockerId } = req.params;
    const blocker = await dbService.getBlocker(blockerId);
    
    if (!blocker) {
      return res.status(404).json({ error: 'Blocker not found' });
    }

    const messages = await dbService.getBlockerMessages(blockerId);
    const messagesWithUsers = await Promise.all(
      messages.map(async (m) => {
        const user = await dbService.getUserById(m.user_id);
        return {
          username: user?.username || 'Unknown',
          message_text: m.message_text,
        };
      })
    );

    const advice = await generateMentorAdvice(
      `${blocker.title}\n${blocker.description}`,
      messagesWithUsers,
      `Type: ${blocker.blocker_type}, Severity: ${blocker.severity}`
    );

    res.json({
      success: true,
      data: { advice },
    });
  } catch (error: any) {
    console.error('AI mentor error:', error);
    res.status(500).json({ error: 'Failed to generate advice' });
  }
};
