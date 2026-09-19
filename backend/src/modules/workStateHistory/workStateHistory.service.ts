import {
  workStateHistoryRepository,
  RecordTransitionParams,
  WorkStateHistoryRow,
} from './workStateHistory.repository';
import { teamsRepository } from '../teams/teams.repository';
import { guidanceRepository } from '../guidance/guidance.repository';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors';

export interface GetHistoryOptions {
  artifactType?: string;
  cursor?: string;
  limit?: number;
}

export interface HistoryPage {
  history: WorkStateHistoryRow[];
  next_cursor: string | null;
}

export interface GetTimelineOptions {
  beforeTimestamp?: string;
  beforeHistoryId?: string;
  limit?: number;
}

export interface FormattedTimelineEvent {
  history_id: string;
  team_id: string;
  artifact_type: string;
  artifact_id: string;
  event_type: string;
  actor: {
    user_id: string;
    full_name: string | null;
    username: string | null;
  } | null;
  description: string;
  change_summary: Record<string, any> | null;
  created_at: Date;
}

export interface TimelineResponseData {
  artifact: {
    artifact_type: string;
    artifact_id: string;
    title: string;
    current_status: string;
    context_status: 'active' | 'deleted';
  };
  events: FormattedTimelineEvent[];
  next_cursor: {
    beforeTimestamp: string;
    beforeHistoryId: string;
  } | null;
}

function formatStatusLabel(status: any): string | null {
  if (typeof status !== 'string' || !status) return null;
  const map: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    review: 'Review',
    done: 'Done',
    planning: 'Planning',
    active: 'Active',
    completed: 'Completed',
    open: 'Open',
    resolved: 'Resolved',
    pending_review: 'Pending Review',
    pending_approval: 'Pending Approval',
  };
  if (map[status.toLowerCase()]) {
    return map[status.toLowerCase()];
  }
  return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatHumanDescription(
  eventType: string,
  actorName: string | null,
  previousState: any,
  newState: any,
  artifactType: string
): string {
  const actor = actorName || 'User';

  switch (eventType) {
    case 'created':
    case 'task_created':
    case 'goal_created':
      return `${artifactType.charAt(0).toUpperCase() + artifactType.slice(1)} created by ${actor}`;

    case 'status_changed': {
      const prev = formatStatusLabel(previousState?.status);
      const next = formatStatusLabel(newState?.status);
      if (newState?.changes_requested_reason) {
        return `Changes requested by ${actor}: "${newState.changes_requested_reason}"`;
      }
      if (prev && next && prev !== next) {
        return `Status changed from ${prev} to ${next}`;
      }
      if (next) {
        return `Status changed to ${next}`;
      }
      return `Status changed by ${actor}`;
    }

    case 'completed':
    case 'TASK_COMPLETED':
    case 'GOAL_COMPLETED':
      return `Completed by ${actor}`;

    case 'reopened':
    case 'TASK_REOPENED':
      return `Reopened by ${actor}`;

    case 'progress_changed':
    case 'GOAL_PROGRESS': {
      const prev = previousState?.progress !== undefined && previousState?.progress !== null ? `${previousState.progress}%` : null;
      const next = newState?.progress !== undefined && newState?.progress !== null ? `${newState.progress}%` : null;
      if (prev !== null && next !== null) {
        return `Goal progress changed from ${prev} to ${next}`;
      }
      if (next !== null) {
        return `Goal progress updated to ${next}`;
      }
      return `Goal progress updated by ${actor}`;
    }

    case 'BLOCKER_CREATED':
      return `Blocker raised by ${actor}`;

    case 'BLOCKER_RESOLVED':
    case 'resolved':
      return `Blocker resolved by ${actor}`;

    case 'guidance_created': {
      const summary = newState?.message_summary ? `: "${newState.message_summary}"` : '';
      return `Guidance provided by ${actor}${summary}`;
    }

    case 'guidance_acknowledged':
      return `Guidance acknowledged by ${actor}`;

    case 'guidance_resolved':
      return `Guidance resolved by ${actor}`;

    case 'WORK_LOGGED':
      return `Daily work logged by ${actor}`;

    default:
      return `Work activity recorded by ${actor}`;
  }
}

function extractSafeChangeSummary(eventType: string, previousState: any, newState: any): Record<string, any> | null {
  const summary: Record<string, any> = {};

  if (previousState?.status !== undefined || newState?.status !== undefined) {
    summary.status = {
      from: formatStatusLabel(previousState?.status),
      to: formatStatusLabel(newState?.status),
    };
  }

  if (previousState?.progress !== undefined || newState?.progress !== undefined) {
    summary.progress = {
      from: previousState?.progress ?? null,
      to: newState?.progress ?? null,
    };
  }

  if (newState?.guidance_status) {
    summary.guidance_status = newState.guidance_status;
  }

  if (newState?.message_summary) {
    summary.message_summary = newState.message_summary;
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

export class WorkStateHistoryService {
  async recordTransition(params: RecordTransitionParams, client?: any): Promise<WorkStateHistoryRow> {
    return workStateHistoryRepository.recordTransition(params, client);
  }

  async getTeamHistory(teamId: string, options: GetHistoryOptions): Promise<HistoryPage> {
    const rawLimit = options.limit || 50;
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const rows = await workStateHistoryRepository.getTeamHistory(
      teamId,
      options.artifactType,
      options.cursor,
      limit + 1
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      history: page,
      next_cursor: hasMore ? page[page.length - 1].history_id : null,
    };
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
   * Fetches chronological timeline history for a specific work item (task, goal, blocker).
   * Strictly verifies ownership/membership authorization and handles deleted contexts.
   */
  async getArtifactTimeline(
    userId: string,
    artifactType: 'task' | 'goal' | 'blocker',
    artifactId: string,
    options: GetTimelineOptions
  ): Promise<TimelineResponseData> {
    if (!['task', 'goal', 'blocker'].includes(artifactType)) {
      throw new BadRequestError('Invalid artifactType. Must be task, goal, or blocker');
    }

    // 1. Resolve canonical entity context
    const context = await guidanceRepository.resolveContextEntity(artifactType, artifactId);

    let effectiveTeamId: string | null = null;
    let contextStatus: 'active' | 'deleted' = 'active';
    let artifactTitle = context.title || artifactType;
    let currentStatus = 'active';

    if (context.exists) {
      if (!context.team_id) {
        // Personal work (team_id IS NULL)
        const isOwner = context.created_by === userId || context.assigned_recipient === userId;
        if (!isOwner) {
          throw new ForbiddenError('Access denied to personal work timeline');
        }
        return {
          artifact: {
            artifact_type: artifactType,
            artifact_id: artifactId,
            title: context.title || 'Personal Work',
            current_status: 'active',
            context_status: 'active',
          },
          events: [],
          next_cursor: null,
        };
      }
      effectiveTeamId = context.team_id;
    } else {
      // Deleted entity: verify server-side authorization from latest history record
      const latestHistory = await workStateHistoryRepository.getLatestHistoryRecordForArtifact(
        artifactType,
        artifactId
      );
      if (!latestHistory) {
        throw new NotFoundError('Work item not found');
      }
      effectiveTeamId = latestHistory.team_id;
      contextStatus = 'deleted';
      artifactTitle = 'Linked work is no longer available';
      currentStatus = 'deleted';
    }

    // 2. Authorize team access
    const hasAccess = await this.canUserAccessTeam(userId, effectiveTeamId);
    if (!hasAccess) {
      throw new ForbiddenError('Access denied to work timeline');
    }

    // 3. Query history events
    const rawLimit = options.limit || 50;
    const limit = Math.min(Math.max(1, rawLimit), 100);

    const rows = await workStateHistoryRepository.getArtifactTimeline({
      artifactType,
      artifactId,
      beforeTimestamp: options.beforeTimestamp,
      beforeHistoryId: options.beforeHistoryId,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const formattedEvents: FormattedTimelineEvent[] = page.map((row) => ({
      history_id: row.history_id,
      team_id: row.team_id,
      artifact_type: row.artifact_type,
      artifact_id: row.artifact_id,
      event_type: row.event_type,
      actor: row.actor_id
        ? {
            user_id: row.actor_id,
            full_name: row.actor_name || null,
            username: row.actor_username || null,
          }
        : null,
      description: formatHumanDescription(
        row.event_type,
        row.actor_name || null,
        row.previous_state,
        row.new_state,
        row.artifact_type
      ),
      change_summary: extractSafeChangeSummary(row.event_type, row.previous_state, row.new_state),
      created_at: row.created_at,
    }));

    const lastItem = page.length > 0 ? page[page.length - 1] : null;
    const nextCursor =
      hasMore && lastItem
        ? {
            beforeTimestamp: new Date(lastItem.created_at).toISOString(),
            beforeHistoryId: lastItem.history_id,
          }
        : null;

    return {
      artifact: {
        artifact_type: artifactType,
        artifact_id: artifactId,
        title: artifactTitle,
        current_status: currentStatus,
        context_status: contextStatus,
      },
      events: formattedEvents,
      next_cursor: nextCursor,
    };
  }
}

export const workStateHistoryService = new WorkStateHistoryService();
