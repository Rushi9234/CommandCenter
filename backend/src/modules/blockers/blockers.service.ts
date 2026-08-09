import { blockersRepository } from './blockers.repository';
import { teamsRepository } from '../teams/teams.repository';
import { usersRepository } from '../users/users.repository';
import { tasksRepository } from '../projects/tasks.repository';
import { analyzeBlocker, generateMentorAdvice } from '../ai/ai.service';
import { NotFoundError, BadRequestError } from '../../common/errors';
import { privacyService, AI_DISABLED_MESSAGE } from '../privacy/privacy.service';

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
    .filter((m: any) => m.role === 'admin' || m.role === 'manager' || m.role === 'owner')
    .slice(0, 3)
    .map((m: any) => m.user_id);
}

export class BlockersService {
  // Milestone 43: affected_tasks referenced tasks by ID with only UUID-
  // shape validation (update path) or no validation at all (create
  // path) -- never existence or same-team scoping, unlike tasks.dependencies
  // (M39). Reuses the same rule: a blocker's affected tasks must actually
  // exist and belong to a project within the blocker's own team --
  // there's no product meaning to a blocker in Team A being "affected
  // by" a task that belongs to Team B.
  private async validateAffectedTasks(teamId: string, affectedTasks?: string[]) {
    if (affectedTasks && affectedTasks.length > 0) {
      const allInTeam = await tasksRepository.tasksExistInTeam(affectedTasks, teamId);
      if (!allInTeam) {
        throw new BadRequestError('affected_tasks must reference existing tasks in the same team');
      }
    }
  }

  async createBlocker(userId: string, body: any) {
    await this.validateAffectedTasks(body.teamId, body.affectedTasks);

    const aiEnabled = await privacyService.isAiEnabledForUser(userId);
    const aiSuggestions = aiEnabled
      ? await generateBlockerSuggestions(body.title, body.description, body.blockerType, body.attemptedSolutions)
      : [];
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

  // Milestone 5: base gate (requireAccess + canAccessTeam) moved to
  // blockers.routes.ts.
  async getTeamBlockers(teamId: string) {
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

  // Milestone 35: resolved_by/resolved_at are not client-writable
  // (excluded from updateBlockerSchema) -- both are now always derived
  // here from the status transition, not just when the client happens to
  // also send resolved_by=self. Reopening (status set to anything other
  // than 'resolved') clears both, so a reopened blocker never keeps a
  // stale resolver/timestamp from a previous resolution.
  // Milestone 43: fetches the blocker first (only when affected_tasks is
  // actually part of this update, to avoid an unnecessary read on every
  // other field-only update) so validateAffectedTasks has a team_id to
  // scope against -- mirrors projects.service.ts's updateTask, which
  // already fetches the task first for the identical reason.
  async updateBlocker(blockerId: string, updates: any, userId: string) {
    if (updates.affected_tasks) {
      const blocker = await blockersRepository.getBlocker(blockerId);
      if (!blocker) {
        throw new NotFoundError('Blocker not found');
      }
      await this.validateAffectedTasks(blocker.team_id, updates.affected_tasks);
    }

    if (updates.status === 'resolved') {
      updates.resolved_by = userId;
      updates.resolved_at = new Date();
    } else if (updates.status) {
      updates.resolved_by = null;
      updates.resolved_at = null;
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

  async getAIMentorAdvice(blockerId: string, userId: string) {
    const blocker = await blockersRepository.getBlocker(blockerId);
    if (!blocker) {
      throw new NotFoundError('Blocker not found');
    }

    const aiEnabled = await privacyService.isAiEnabledForUser(userId);
    if (!aiEnabled) {
      return { advice: AI_DISABLED_MESSAGE };
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
