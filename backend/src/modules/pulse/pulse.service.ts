import { pulseRepository, PulseItemRow } from './pulse.repository';
import { teamsRepository } from '../teams/teams.repository';
import { ForbiddenError, NotFoundError } from '../../common/errors';

export interface PulsePage {
  events: PulseItemRow[];
  next_cursor: string | null;
}

export interface GetPulseQueryOptions {
  category?: string;
  cursor?: string;
  limit?: number;
}

export class PulseService {
  /**
   * Helper: Checks if a user has access to teamId.
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
   * Helper: Parses cursor string "isoTimestamp|historyId"
   */
  private parseCursor(cursor?: string): { timestamp?: Date; historyId?: string } {
    if (!cursor) return {};
    const parts = cursor.split('|');
    if (parts.length === 2) {
      const ts = new Date(parts[0]);
      if (!isNaN(ts.getTime())) {
        return { timestamp: ts, historyId: parts[1] };
      }
    }
    return {};
  }

  /**
   * Helper: Formats cursor string "isoTimestamp|historyId"
   */
  private formatCursor(item?: PulseItemRow): string | null {
    if (!item) return null;
    const ts = new Date(item.created_at).toISOString();
    return `${ts}|${item.history_id}`;
  }

  /**
   * Individual Scope: GET /api/pulse/me
   */
  async getIndividualPulse(userId: string, options: GetPulseQueryOptions): Promise<PulsePage> {
    const userTeams = await teamsRepository.getUserTeams(userId);
    const teamIds = userTeams.map((t) => t.team_id);

    const { timestamp, historyId } = this.parseCursor(options.cursor);
    const rawLimit = options.limit || 20;
    const limit = Math.min(Math.max(1, rawLimit), 50);

    const teamEvents = teamIds.length > 0
      ? await pulseRepository.getPulseEvents({
          teamIds,
          artifactType: options.category,
          beforeTimestamp: timestamp,
          beforeHistoryId: historyId,
          limit: limit + 1,
        })
      : [];

    const guidanceEvents = await pulseRepository.getRecipientGuidancePulse(userId, 20);

    // Merge & deduplicate by history_id
    const eventMap = new Map<string, PulseItemRow>();
    for (const item of [...teamEvents, ...guidanceEvents]) {
      if (!eventMap.has(item.history_id)) {
        eventMap.set(item.history_id, item);
      }
    }

    const merged = Array.from(eventMap.values()).sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (tA !== tB) return tB - tA;
      return b.history_id.localeCompare(a.history_id);
    });

    const hasMore = merged.length > limit;
    const pageEvents = hasMore ? merged.slice(0, limit) : merged;
    const nextCursor = hasMore ? this.formatCursor(pageEvents[pageEvents.length - 1]) : null;

    return {
      events: pageEvents,
      next_cursor: nextCursor,
    };
  }

  /**
   * Team Scope: GET /api/pulse/teams/:teamId
   */
  async getTeamPulse(userId: string, teamId: string, options: GetPulseQueryOptions): Promise<PulsePage> {
    const hasAccess = await this.canUserAccessTeam(userId, teamId);
    if (!hasAccess) {
      throw new ForbiddenError('Not authorized to access pulse for this team');
    }

    const { timestamp, historyId } = this.parseCursor(options.cursor);
    const rawLimit = options.limit || 20;
    const limit = Math.min(Math.max(1, rawLimit), 50);

    const events = await pulseRepository.getPulseEvents({
      teamIds: [teamId],
      artifactType: options.category,
      beforeTimestamp: timestamp,
      beforeHistoryId: historyId,
      limit: limit + 1,
    });

    const hasMore = events.length > limit;
    const pageEvents = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? this.formatCursor(pageEvents[pageEvents.length - 1]) : null;

    return {
      events: pageEvents,
      next_cursor: nextCursor,
    };
  }

  /**
   * Classroom Scope: GET /api/pulse/classrooms/:teamId
   */
  async getClassroomPulse(userId: string, parentTeamId: string, options: GetPulseQueryOptions): Promise<PulsePage> {
    const role = await teamsRepository.getMemberRole(userId, parentTeamId);
    if (!role || !['owner', 'admin', 'manager'].includes(role)) {
      throw new ForbiddenError('Not authorized to view classroom pulse for this team');
    }

    const childTeams = await teamsRepository.getSubTeams(parentTeamId);
    const childTeamIds = childTeams.map((t) => t.team_id);

    if (childTeamIds.length === 0) {
      return { events: [], next_cursor: null };
    }

    const { timestamp, historyId } = this.parseCursor(options.cursor);
    const rawLimit = options.limit || 20;
    const limit = Math.min(Math.max(1, rawLimit), 50);

    // Fetch work events for child teams
    const allEvents = await pulseRepository.getPulseEvents({
      teamIds: childTeamIds,
      artifactType: options.category,
      beforeTimestamp: timestamp,
      beforeHistoryId: historyId,
      limit: limit * 2,
    });

    // Filter macro/aggregate events for classroom scope
    const macroEvents = allEvents.filter((item) =>
      ['completed', 'resolved', 'progress_changed', 'guidance_resolved'].includes(item.event_type)
    );

    const hasMore = macroEvents.length > limit;
    const pageEvents = hasMore ? macroEvents.slice(0, limit) : macroEvents;
    const nextCursor = hasMore ? this.formatCursor(pageEvents[pageEvents.length - 1]) : null;

    return {
      events: pageEvents,
      next_cursor: nextCursor,
    };
  }
}

export const pulseService = new PulseService();
