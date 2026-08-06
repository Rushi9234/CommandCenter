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

    const userContext = { recentTasks: [], projectName: 'CommandCenter' };
    const analysis = await analyzeLog(entryText, userContext);

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
    const logs = await logsRepository.getUserLogs(userId, 5);
    const tasks = await tasksRepository.getUserTasks(userId);

    const recentLogTexts = logs.map((l: any) => l.entry_text);
    return generateLogSuggestions(recentLogTexts, tasks);
  }

  async getInsights(userId: string) {
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

    const standup = await generateStandup(logs, members);

    return { ...standup, logs, generated_at: new Date().toISOString() };
  }
}

export const logsService = new LogsService();
