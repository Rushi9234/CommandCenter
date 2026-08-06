import { blockersRepository } from './blockers.repository';
import { teamsRepository } from '../teams/teams.repository';
import { usersRepository } from '../users/users.repository';
import { analyzeBlocker, generateMentorAdvice } from '../ai/ai.service';
import { ForbiddenError, NotFoundError } from '../../common/errors';

async function generateBlockerSuggestions(title: string, description: string, type: string, attempted: string): Promise<string[]> {
  try {
    const result = await analyzeBlocker(title, description, type, attempted);
    return result.suggestions || [];
  } catch {
    return [];
  }
}

async function findSimilarBlockers(teamId: string, title: string, description: string): Promise<string[]> {
  const blockers = await blockersRepository.getTeamBlockers(teamId);
  const resolved = blockers.filter((b: any) => b.status === 'resolved');
  const keywords = (title + ' ' + description).toLowerCase().split(/\s+/);
  return resolved
    .filter((b: any) => {
      const text = (b.title + ' ' + b.description).toLowerCase();
      return keywords.some((k) => k.length > 3 && text.includes(k));
    })
    .slice(0, 3)
    .map((b: any) => b.blocker_id);
}

async function suggestTeamHelpers(teamId: string): Promise<string[]> {
  const members = await teamsRepository.getTeamMembers(teamId);
  return members
    .filter((m: any) => m.role === 'admin' || m.role === 'manager')
    .slice(0, 3)
    .map((m: any) => m.user_id);
}

export class BlockersService {
  async createBlocker(userId: string, body: any) {
    const aiSuggestions = await generateBlockerSuggestions(body.title, body.description, body.blockerType, body.attemptedSolutions);
    const similarBlockers = await findSimilarBlockers(body.teamId, body.title, body.description);
    const suggestedHelpers = await suggestTeamHelpers(body.teamId);

    return blockersRepository.createBlocker({
      team_id: body.teamId,
      title: body.title,
      description: body.description || '',
      blocker_type: body.blockerType || 'technical',
      urgency: body.urgency || 'medium',
      impact: body.impact || 'blocks_task',
      affected_tasks: body.affectedTasks || [],
      attempted_solutions: body.attemptedSolutions || '',
      created_by: userId,
      ai_suggestions: aiSuggestions,
      similar_blockers: similarBlockers,
      suggested_helpers: suggestedHelpers,
    });
  }

  async getTeamBlockers(teamId: string, userId: string) {
    const canAccess = await teamsRepository.canAccessTeam(userId, teamId);
    if (!canAccess) {
      throw new ForbiddenError('Access denied to this team');
    }

    const blockers = await blockersRepository.getTeamBlockers(teamId);

    return Promise.all(
      blockers.map(async (blocker: any) => {
        const creator = await usersRepository.getUserById(blocker.created_by);
        const messages = await blockersRepository.getBlockerMessages(blocker.blocker_id);
        return {
          ...blocker,
          creator: creator ? { full_name: creator.full_name, username: creator.username } : null,
          message_count: messages.length,
        };
      })
    );
  }

  updateBlocker(blockerId: string, updates: any, userId: string) {
    if (updates.status === 'resolved') {
      updates.resolved_by = userId;
    }
    return blockersRepository.updateBlocker(blockerId, updates);
  }

  sendMessage(blockerId: string, userId: string, messageText: string) {
    return blockersRepository.createMessage(blockerId, userId, messageText);
  }

  async getMessages(blockerId: string) {
    const messages = await blockersRepository.getBlockerMessages(blockerId);

    return Promise.all(
      messages.map(async (message: any) => {
        const user = await usersRepository.getUserById(message.user_id);
        return {
          ...message,
          user: user ? { user_id: user.user_id, username: user.username, full_name: user.full_name } : null,
        };
      })
    );
  }

  async getAIMentorAdvice(blockerId: string) {
    const blocker = await blockersRepository.getBlocker(blockerId);
    if (!blocker) {
      throw new NotFoundError('Blocker not found');
    }

    const messages = await blockersRepository.getBlockerMessages(blockerId);
    const messagesWithUsers = await Promise.all(
      messages.map(async (m: any) => {
        const user = await usersRepository.getUserById(m.user_id);
        return { username: user?.username || 'Unknown', message_text: m.message_text };
      })
    );

    const advice = await generateMentorAdvice(
      `${blocker.title}\n${blocker.description}`,
      messagesWithUsers,
      `Type: ${blocker.blocker_type}, Severity: ${blocker.severity}`
    );

    return { advice };
  }
}

export const blockersService = new BlockersService();
