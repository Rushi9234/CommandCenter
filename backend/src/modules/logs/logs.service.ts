import { logsRepository } from './logs.repository';
import { teamsRepository } from '../teams/teams.repository';
import { usersRepository } from '../users/users.repository';
import { tasksRepository } from '../projects/tasks.repository';
import {
  analyzeLog,
  generateLogSuggestions,
  generateProductivityInsights,
  generateStandup,
} from '../ai/ai.service';
import { generateLogSignature } from '../../utils/crypto';
import { BadRequestError, ForbiddenError } from '../../common/errors';
import { privacyService, AI_DISABLED_MESSAGE } from '../privacy/privacy.service';

export class LogsService {
  async createLog(userId: string, entryText: string) {
    const logDate = new Date();
    const cryptoSignature = generateLogSignature(userId, entryText, logDate);

    const existingLogs = await logsRepository.getUserLogs(userId);
    const today = logDate.toISOString().split('T')[0];
    const todayLog = existingLogs.find((log: any) => log.log_date === today);

    if (todayLog) {
      throw new BadRequestError('Log already submitted for today');
    }

    // Milestone 32: this is the "background/log-triggered" AI call the M31
    // audit specifically flagged -- it used to run unconditionally on
    // every log, regardless of the author's ai_enabled setting.
    const aiEnabled = await privacyService.isAiEnabledForUser(userId);
    const userContext = { recentTasks: [], projectName: 'CommandCenter' };
    const analysis = aiEnabled
      ? await analyzeLog(entryText, userContext)
      : {
          tasks_identified: [],
          sentiment_score: 0,
          summary: AI_DISABLED_MESSAGE,
          bullet_points: [],
          achievements: [],
          blockers_detected: [],
          quality_score: 0,
        };

    let log;
    try {
      log = await logsRepository.createLog({
        user_id: userId,
        entry_text: entryText,
        log_date: logDate.toISOString().split('T')[0],
        log_time: logDate.toTimeString().split(' ')[0],
        crypto_signature: cryptoSignature,
        entry_summary: analysis.summary,
        sentiment_score: analysis.sentiment_score,
        bullet_points: analysis.bullet_points,
      });
    } catch (error: any) {
      // Milestone 24: the check above is a TOCTOU race -- two concurrent
      // requests can both pass it before either commits (there's a slow
      // AI call in between). The daily_logs_user_id_log_date_unique
      // constraint (migrations/..._add-daily-logs-unique-constraint.sql)
      // is what actually prevents the duplicate; this translates the
      // race-losing INSERT's raw Postgres error (23505 = unique
      // violation) into the same error the pre-check above already
      // throws, so both paths produce an identical response. Any other
      // error is rethrown unchanged.
      if (error.code === '23505') {
        throw new BadRequestError('Log already submitted for today');
      }
      throw error;
    }

    return { log, analysis };
  }

  getUserLogs(userId: string, limit: number = 30) {
    return logsRepository.getUserLogs(userId, limit);
  }

  async updateLog(logId: string, userId: string, newText: string) {
    const log = await logsRepository.getLogById(logId);

    if (!log) {
      throw new BadRequestError('Log not found');
    }

    const hoursSinceCreation = (Date.now() - new Date(log.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      throw new BadRequestError('Cannot edit this log (>24hrs old)');
    }

    return logsRepository.updateLog(logId, { entry_text: newText });
  }

  async getSuggestions(userId: string) {
    const aiEnabled = await privacyService.isAiEnabledForUser(userId);
    if (!aiEnabled) {
      return { suggestions: [], focus_areas: [], productivity_tip: AI_DISABLED_MESSAGE };
    }

    const logs = await logsRepository.getUserLogs(userId, 5);
    const tasks = await tasksRepository.getUserTasks(userId);

    const recentLogTexts = logs.map((l: any) => l.entry_text);
    return generateLogSuggestions(recentLogTexts, tasks);
  }

  async getInsights(userId: string) {
    const aiEnabled = await privacyService.isAiEnabledForUser(userId);
    if (!aiEnabled) {
      return { strengths: [], improvements: [], recommendations: [], overall_assessment: AI_DISABLED_MESSAGE };
    }

    const logs = await logsRepository.getUserLogs(userId, 30);
    const tasks = await tasksRepository.getUserTasks(userId);
    const user = await usersRepository.getUserById(userId);

    return generateProductivityInsights(logs, tasks, user?.streak_count || 0);
  }

  async getStandup(userId: string, teamId?: string) {
    let logs: any[];
    let members: any[];

    if (teamId) {
      const canAccess = await teamsRepository.canAccessTeam(userId, teamId);
      if (!canAccess) {
        throw new ForbiddenError('Access denied to this team');
      }

      members = await teamsRepository.getTeamMembers(teamId);
      const today = new Date().toISOString().split('T')[0];

      const teamLogs = await Promise.all(
        members.map(async (m: any) => {
          const userLogs = await logsRepository.getUserLogs(m.user_id, 1);
          const todayLog = userLogs.find((l: any) => l.log_date === today);
          return todayLog ? { ...todayLog, username: m.user?.username || 'Unknown' } : null;
        })
      );
      logs = teamLogs.filter((l) => l !== null);
    } else {
      const user = await usersRepository.getUserById(userId);
      const userLogs = await logsRepository.getUserLogs(userId, 1);
      logs = userLogs.map((l: any) => ({ ...l, username: user?.username || 'You' }));
      members = [{ user_id: userId }];
    }

    // Milestone 32: gated on the REQUESTER's own ai_enabled -- the data
    // fetched above (logs/members) is not itself AI-derived and stays
    // visible regardless (same access rules as before this milestone);
    // only the AI summarization step is skipped. Filtering AI usage of
    // each individual team member's log content is a separate, larger
    // per-subject-consent design this milestone deliberately doesn't take
    // on -- see the M32 report's "residual risk" note.
    const aiEnabled = await privacyService.isAiEnabledForUser(userId);
    const standup = aiEnabled
      ? await generateStandup(logs, members)
      : { summary: AI_DISABLED_MESSAGE, highlights: [], blockers: [], team_mood: 'neutral' };

    return { ...standup, logs, generated_at: new Date().toISOString() };
  }
}

export const logsService = new LogsService();
