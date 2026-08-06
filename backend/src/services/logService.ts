import { dbService } from './databaseService';
import { generateLogSignature } from '../utils/crypto';
import { analyzeLog } from './aiService';

export const createDailyLog = async (userId: string, entryText: string) => {
  const logDate = new Date();
  const cryptoSignature = generateLogSignature(userId, entryText, logDate);

  // Check if log already exists for today
  const existingLogs = await dbService.getUserLogs(userId);
  const today = logDate.toISOString().split('T')[0];
  const todayLog = existingLogs.find(log => log.log_date === today);

  if (todayLog) {
    throw new Error('Log already submitted for today');
  }

  // Get user context for AI analysis
  const userContext = { recentTasks: [], projectName: 'CommandCenter' };

  // AI Analysis
  const analysis = await analyzeLog(entryText, userContext);

  // Create log
  const log = await dbService.createLog({
    user_id: userId,
    entry_text: entryText,
    log_date: logDate.toISOString().split('T')[0],
    log_time: logDate.toTimeString().split(' ')[0],
    crypto_signature: cryptoSignature,
    entry_summary: analysis.summary,
    sentiment_score: analysis.sentiment_score,
    bullet_points: analysis.bullet_points
  });

  return {
    log,
    analysis,
  };
};

export const getUserLogs = async (userId: string, limit: number = 30) => {
  return await dbService.getUserLogs(userId, limit);
};

export const updateLog = async (logId: string, userId: string, newText: string) => {
  const log = await dbService.getLogById(logId);

  if (!log) {
    throw new Error('Log not found');
  }

  if (log.user_id !== userId) {
    throw new Error('Cannot edit this log (not owner)');
  }

  // Check 24 hour limit
  const hoursSinceCreation = (Date.now() - new Date(log.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursSinceCreation > 24) {
    throw new Error('Cannot edit this log (>24hrs old)');
  }

  return await dbService.updateLog(logId, { entry_text: newText });
};


