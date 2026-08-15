interface StandupAIResult {
  summary: string;
  highlights: string[];
  blockers: string[];
  team_mood: string;
}

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

    // Multiple personal log entries are intentionally allowed on the same day.
    // Daily logs are individual work records; the log_id identifies each entry,
    // while log_date remains available for history, streaks, and reporting.
    const log = await logsRepository.createLog({
      user_id: userId,
      entry_text: entryText,
      log_date: logDate.toISOString().split('T')[0],
      log_time: logDate.toTimeString().split(' ')[0],
      crypto_signature: cryptoSignature,
      entry_summary: analysis.summary,
      sentiment_score: analysis.sentiment_score,
      bullet_points: analysis.bullet_points,
    });

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

      // Milestone 46: one bulk query for every member's today-dated log,
      // replacing the old per-member Promise.all fan-out (see
      // getTodaysLogsForUsers' own comment for the vulnerability this
      // closes, and the real, pre-existing "today" comparison bug it
      // also fixes by filtering the date in SQL instead of JS).
      // daily_logs' own UNIQUE(user_id, log_date) constraint (M24)
      // guarantees at most one row per member here.
      const todaysLogs = await logsRepository.getTodaysLogsForUsers(members.map((m: any) => m.user_id));
      const todaysLogByUserId = new Map(todaysLogs.map((l: any) => [l.user_id, l]));
      logs = members
        .map((m: any) => {
          const log = todaysLogByUserId.get(m.user_id);
          return log ? { ...log, username: m.user?.username || 'Unknown' } : null;
        })
        .filter((l: any) => l !== null);
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
    const standup: StandupAIResult = aiEnabled
      ? await generateStandup(logs, members) as StandupAIResult
      : { summary: AI_DISABLED_MESSAGE, highlights: [], blockers: [], team_mood: 'neutral' };

    return { ...standup, logs, generated_at: new Date().toISOString() };
  }
}

export const logsService = new LogsService();
