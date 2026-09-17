import { guidanceRepository, GuidanceItem } from './guidance.repository';
import { teamsRepository } from '../teams/teams.repository';
import { notificationsService } from '../notifications/notifications.service';
import { workStateHistoryRepository } from '../workStateHistory/workStateHistory.repository';
import { createRealtimeEvent, realtimeProvider } from '../../realtime/inMemoryRealtimeProvider';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../../common/errors';

export class GuidanceService {
  /**
   * Helper: Checks if a user is a Leader/Manager/Owner of teamId,
   * or a Classroom Coordinator of a parent team.
   */
  async isTeamLeaderOrCoordinator(userId: string, teamId: string): Promise<boolean> {
    const directRole = await teamsRepository.getMemberRole(userId, teamId);
    if (directRole && ['owner', 'admin', 'manager'].includes(directRole)) {
      return true;
    }
    const team = await teamsRepository.getTeam(teamId);
    if (team && team.parent_team_id) {
      const parentRole = await teamsRepository.getMemberRole(userId, team.parent_team_id);
      if (parentRole && ['owner', 'admin', 'manager'].includes(parentRole)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Helper: Checks if a user has active access to teamId (as direct member or parent team member).
   */
  async canUserAccessTeam(userId: string, teamId: string): Promise<boolean> {
    const isDirectMember = await teamsRepository.canAccessTeam(userId, teamId);
    if (isDirectMember) return true;

    const team = await teamsRepository.getTeam(teamId);
    if (team && team.parent_team_id) {
      const parentMember = await teamsRepository.canAccessTeam(userId, team.parent_team_id);
      if (parentMember) return true;
    }
    return false;
  }

  /**
   * Creates guidance on a shared team work context.
   */
  async createGuidance(params: {
    authorId: string;
    contextType: 'task' | 'goal' | 'blocker';
    contextId: string;
    teamId?: string;
    recipientId?: string | null;
    message: string;
  }): Promise<GuidanceItem> {
    const cleanMessage = (params.message || '').trim();
    if (cleanMessage.length < 3 || cleanMessage.length > 2000) {
      throw new BadRequestError('Guidance message must be between 3 and 2000 characters');
    }

    // 1. CANONICAL CONTEXT RESOLUTION
    const context = await guidanceRepository.resolveContextEntity(
      params.contextType,
      params.contextId
    );

    if (!context.exists) {
      throw new NotFoundError('Work context does not exist or has been deleted');
    }

    if (!context.team_id) {
      throw new ForbiddenError('Guidance cannot be issued on personal work');
    }

    if (params.teamId && params.teamId !== context.team_id) {
      throw new BadRequestError('Submitted teamId does not match canonical context team');
    }

    const canonicalTeamId = context.team_id;

    // 2. AUTHORIZATION CHECK
    const isLeader = await this.isTeamLeaderOrCoordinator(params.authorId, canonicalTeamId);
    if (!isLeader) {
      throw new ForbiddenError('Only Team Leaders or Classroom Coordinators can issue guidance');
    }

    // 3. RECIPIENT VALIDATION
    let recipientId = params.recipientId || null;
    if (recipientId) {
      const recipientAccess = await this.canUserAccessTeam(recipientId, canonicalTeamId);
      if (!recipientAccess) {
        throw new BadRequestError('Recipient is not a member of the canonical team');
      }
    } else {
      recipientId = context.assigned_recipient;
    }

    // 4. DUPLICATE CHECK
    const existingDuplicate = await guidanceRepository.findDuplicateOpenGuidance({
      context_type: params.contextType,
      context_id: params.contextId,
      recipient_id: recipientId,
      message: cleanMessage,
    });
    if (existingDuplicate) {
      throw new ConflictError('Active duplicate guidance already exists for this work context');
    }

    // 5. DB CREATION
    const newItem = await guidanceRepository.createGuidance({
      team_id: canonicalTeamId,
      context_type: params.contextType,
      context_id: params.contextId,
      author_id: params.authorId,
      recipient_id: recipientId,
      message: cleanMessage,
    });

    // 6. RECORD HISTORY (Append-only audit)
    try {
      await workStateHistoryRepository.recordTransition({
        team_id: canonicalTeamId,
        artifact_type: params.contextType,
        artifact_id: params.contextId,
        event_type: 'guidance_created',
        actor_id: params.authorId,
        previous_state: { guidance_status: 'none' },
        new_state: {
          guidance_id: newItem.guidance_id,
          guidance_status: 'open',
          recipient_id: recipientId,
          message_summary: cleanMessage.substring(0, 100),
        },
      });
    } catch (err) {
      console.error('[guidance] Failed to write work_state_history (non-fatal):', err);
    }

    // 7. NOTIFICATION (Targeted recipient only)
    if (newItem.recipient_id && newItem.recipient_id !== params.authorId) {
      await notificationsService.notifyUser({
        recipientUserId: newItem.recipient_id,
        category: 'guidance',
        preferenceGroup: 'guidance',
        title: 'Guidance Received',
        message: `Guidance received regarding ${params.contextType}: ${cleanMessage.substring(0, 80)}`,
        teamId: canonicalTeamId,
        taskId: params.contextType === 'task' ? params.contextId : undefined,
        goalId: params.contextType === 'goal' ? params.contextId : undefined,
        blockerId: params.contextType === 'blocker' ? params.contextId : undefined,
      });
    }

    // 8. REALTIME SSE (Thin payload)
    realtimeProvider.publish(
      createRealtimeEvent('guidance.created', {
        guidanceId: newItem.guidance_id,
        teamId: canonicalTeamId,
        recipientUserId: newItem.recipient_id || undefined,
      })
    );

    return newItem;
  }

  /**
   * Lists guidance items for a team.
   */
  async listGuidance(
    userId: string,
    filters: {
      teamId: string;
      contextType?: string;
      contextId?: string;
      recipientId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: GuidanceItem[]; total: number }> {
    const hasAccess = await this.canUserAccessTeam(userId, filters.teamId);
    if (!hasAccess) {
      throw new ForbiddenError('Not authorized to access guidance for this team');
    }

    return guidanceRepository.listGuidance({
      team_id: filters.teamId,
      context_type: filters.contextType,
      context_id: filters.contextId,
      recipient_id: filters.recipientId,
      status: filters.status,
      limit: filters.limit,
      offset: filters.offset,
    });
  }

  /**
   * Gets details of a single guidance item.
   */
  async getGuidanceById(userId: string, guidanceId: string): Promise<GuidanceItem> {
    const item = await guidanceRepository.getGuidanceById(guidanceId);
    if (!item) {
      throw new NotFoundError('Guidance item not found');
    }

    const hasAccess = await this.canUserAccessTeam(userId, item.team_id);
    if (!hasAccess) {
      throw new ForbiddenError('Not authorized to view this guidance item');
    }

    return item;
  }

  /**
   * Advances guidance lifecycle status (acknowledgement or resolution).
   */
  async updateGuidanceStatus(
    userId: string,
    guidanceId: string,
    targetStatus: 'acknowledged' | 'resolved'
  ): Promise<GuidanceItem> {
    const item = await guidanceRepository.getGuidanceById(guidanceId);
    if (!item) {
      throw new NotFoundError('Guidance item not found');
    }

    const hasAccess = await this.canUserAccessTeam(userId, item.team_id);
    if (!hasAccess) {
      throw new ForbiddenError('Not authorized to update this guidance item');
    }

    if (targetStatus === 'acknowledged') {
      if (item.status !== 'open') {
        throw new ConflictError(`Cannot acknowledge guidance with status '${item.status}'`);
      }

      // Only recipient (or active team member if recipient is NULL) can acknowledge
      if (item.recipient_id && item.recipient_id !== userId) {
        throw new ForbiddenError('Only the assigned recipient can acknowledge this guidance');
      }

      const updated = await guidanceRepository.acknowledgeGuidance(guidanceId);
      if (!updated) {
        throw new ConflictError('Concurrent update or guidance status already changed');
      }

      try {
        await workStateHistoryRepository.recordTransition({
          team_id: item.team_id,
          artifact_type: item.context_type,
          artifact_id: item.context_id,
          event_type: 'guidance_acknowledged',
          actor_id: userId,
          previous_state: { guidance_status: 'open' },
          new_state: { guidance_id: item.guidance_id, guidance_status: 'acknowledged' },
        });
      } catch (err) {
        console.error('[guidance] Failed to write work_state_history (non-fatal):', err);
      }

      realtimeProvider.publish(
        createRealtimeEvent('guidance.updated', {
          guidanceId: item.guidance_id,
          teamId: item.team_id,
          recipientUserId: item.recipient_id || undefined,
        })
      );

      return (await guidanceRepository.getGuidanceById(guidanceId))!;
    } else if (targetStatus === 'resolved') {
      if (item.status === 'resolved') {
        throw new ConflictError('Guidance item is already resolved');
      }

      // Recipient, author, or team leader/coordinator can resolve
      const isAuthor = item.author_id === userId;
      const isRecipient = item.recipient_id === userId;
      const isLeader = await this.isTeamLeaderOrCoordinator(userId, item.team_id);

      if (!isAuthor && !isRecipient && !isLeader) {
        throw new ForbiddenError('Only the recipient, author, or team leader can resolve this guidance');
      }

      const updated = await guidanceRepository.resolveGuidance(guidanceId, userId);
      if (!updated) {
        throw new ConflictError('Concurrent update or guidance status already changed');
      }

      try {
        await workStateHistoryRepository.recordTransition({
          team_id: item.team_id,
          artifact_type: item.context_type,
          artifact_id: item.context_id,
          event_type: 'guidance_resolved',
          actor_id: userId,
          previous_state: { guidance_status: item.status },
          new_state: { guidance_id: item.guidance_id, guidance_status: 'resolved', resolved_by: userId },
        });
      } catch (err) {
        console.error('[guidance] Failed to write work_state_history (non-fatal):', err);
      }

      realtimeProvider.publish(
        createRealtimeEvent('guidance.resolved', {
          guidanceId: item.guidance_id,
          teamId: item.team_id,
          recipientUserId: item.recipient_id || undefined,
        })
      );

      return (await guidanceRepository.getGuidanceById(guidanceId))!;
    }

    throw new BadRequestError('Invalid target status');
  }
}

export const guidanceService = new GuidanceService();
