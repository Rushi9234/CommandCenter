import { usersRepository } from '../users/users.repository';
import { logsRepository } from '../logs/logs.repository';
import { tasksRepository } from '../projects/tasks.repository';
import { teamsRepository } from '../teams/teams.repository';
import { projectsRepository } from '../projects/projects.repository';
import { BadRequestError, NotFoundError } from '../../common/errors';

// Milestone 32: shared response text for every AI entry point that finds
// ai_enabled=false -- one place to change the wording instead of a
// slightly-different string hand-written at each of the 7 call sites.
export const AI_DISABLED_MESSAGE = 'AI features are currently disabled for your account. You can re-enable them in your privacy settings.';

// Moved verbatim from privacyController.ts. No dedicated repository -- this
// module composes the other modules' repositories for read/export purposes
// and doesn't own any table of its own.
export class PrivacyService {
  // Milestone 32: single source of truth for "is AI processing allowed for
  // this user right now" -- every AI entry point (chat, log/blocker/project
  // analysis, mentor advice, standup) checks this before calling into
  // ai.service.ts, so disabling ai_enabled can't be bypassed by using a
  // different feature. Fails closed (AI blocked) if the user can't be
  // looked up at all -- if we can't reliably read the setting, we don't
  // assume it's fine to proceed. A user that exists but has no
  // privacy_settings.ai_enabled key yet defaults to the same `true` the
  // users table's own column default already encodes (schema.sql), so
  // nothing changes for anyone who has never touched their settings.
  async isAiEnabledForUser(userId: string): Promise<boolean> {
    try {
      const user = await usersRepository.getUserById(userId);
      if (!user) {
        return false;
      }
      return user.privacy_settings?.ai_enabled !== false;
    } catch {
      return false;
    }
  }

  // Milestone 28: this used to compute the merged settings and return them
  // without ever writing to the database -- the response claimed success
  // but a subsequent getPrivacySettings still returned the old values.
  // updateUser already supports privacy_settings as a writable column; this
  // just needed to actually call it.
  async updatePrivacySettings(userId: string, body: any) {
    const user = await usersRepository.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const { ai_enabled, sentiment_tracking, leaderboard_visible, analytics_opt_in } = body;

    const merged = {
      ai_enabled: ai_enabled !== undefined ? ai_enabled : user.privacy_settings.ai_enabled,
      sentiment_tracking: sentiment_tracking !== undefined ? sentiment_tracking : user.privacy_settings.sentiment_tracking,
      leaderboard_visible: leaderboard_visible !== undefined ? leaderboard_visible : user.privacy_settings.leaderboard_visible,
      analytics_opt_in: analytics_opt_in !== undefined ? analytics_opt_in : user.privacy_settings.analytics_opt_in,
    };

    const updated = await usersRepository.updateUser(userId, { privacy_settings: merged });
    return updated.privacy_settings;
  }

  async getPrivacySettings(userId: string) {
    const user = await usersRepository.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user.privacy_settings;
  }

  async exportUserData(userId: string) {
    const user = await usersRepository.getUserById(userId);
    const logs = await logsRepository.getUserLogs(userId, 1000);
    const tasks = await tasksRepository.getUserTasks(userId);
    const teams = await teamsRepository.getUserTeams(userId);
    const projects = await projectsRepository.getUserProjects(userId);

    return {
      user: {
        user_id: user?.user_id,
        email: user?.email,
        username: user?.username,
        full_name: user?.full_name,
        created_at: user?.created_at,
      },
      logs: logs.map((l: any) => ({
        log_id: l.log_id,
        entry_text: l.entry_text,
        log_date: l.log_date,
        log_time: l.log_time,
        created_at: l.created_at,
      })),
      tasks,
      teams: teams.map((t: any) => ({ team_id: t.team_id, team_name: t.team_name })),
      projects: projects.map((p: any) => ({ project_id: p.project_id, project_name: p.project_name })),
      exported_at: new Date().toISOString(),
    };
  }

  deleteUserData(userId: string, confirm: string) {
    if (confirm !== 'DELETE_MY_DATA') {
      throw new BadRequestError('Confirmation required');
    }

    // This would delete all user data in production. For now, just mark as
    // deleted -- preserved as-is; a real deletion flow is out of scope for
    // this architecture-only milestone.
    console.log(`[PRIVACY] User ${userId} requested data deletion`);
  }
}

export const privacyService = new PrivacyService();
