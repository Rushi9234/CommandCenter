import { dailyWorkRepository } from './dailyWork.repository';
import { generateWorkSummary } from '../ai/ai.service';
import { privacyService, AI_DISABLED_MESSAGE } from '../privacy/privacy.service';
import { BadRequestError, ConflictError } from '../../common/errors';

// Milestone 49: bounds the AI summarization prompt's total size and caps
// realistic abuse (a scripted loop posting entries all day) -- the same
// "an unbounded per-item collection needs its own cap" lesson M40 already
// applied to contributors/dependencies/affected_tasks arrays, just for a
// DB-backed collection instead of a JSON array field.
const MAX_ENTRIES_PER_DAY = 50;

export class DailyWorkService {
  async createEntry(userId: string, teamId: string, entryText: string) {
    // Milestone 49: once a day is submitted, its entries are locked --
    // matches "SUBMIT TODAY'S WORK" being a hard commit, the same
    // invariant daily_logs' own one-per-day constraint already
    // establishes for the existing single-entry flow. Checked here
    // (not just at submit time) so a caller can't keep quietly adding
    // entries to an already-submitted day that getTeamSubmissionsForDate
    // has already shown to teammates.
    if (await dailyWorkRepository.hasSubmittedToday(userId, teamId)) {
      throw new ConflictError("Today's work has already been submitted for this team");
    }

    const count = await dailyWorkRepository.countTodaysEntries(userId, teamId);
    if (count >= MAX_ENTRIES_PER_DAY) {
      throw new BadRequestError(`You can log at most ${MAX_ENTRIES_PER_DAY} entries per day for a team`);
    }

    return dailyWorkRepository.createEntry(userId, teamId, entryText);
  }

  getTodaysEntries(userId: string, teamId: string) {
    return dailyWorkRepository.getTodaysEntries(userId, teamId);
  }

  // Milestone 49: returns a DRAFT only -- nothing is written to the
  // database here. The frontend shows this to the user for review/edit;
  // only submitWork (below) persists anything, matching the explicit
  // "AI must not silently finalize" requirement.
  async summarizeToday(userId: string, teamId: string) {
    if (await dailyWorkRepository.hasSubmittedToday(userId, teamId)) {
      throw new ConflictError("Today's work has already been submitted for this team");
    }

    const entries = await dailyWorkRepository.getTodaysEntries(userId, teamId);
    if (entries.length === 0) {
      throw new BadRequestError('No entries to summarize for today');
    }

    const aiEnabled = await privacyService.isAiEnabledForUser(userId);
    const entryTexts = entries.map((e: any) => e.entry_text);
    const draftSummary = aiEnabled ? await generateWorkSummary(entryTexts) : `${AI_DISABLED_MESSAGE} Raw entries: ${entryTexts.join(' | ')}`;

    return { draftSummary, entries };
  }

  // Milestone 49: re-checks hasSubmittedToday as a friendly, specific
  // error message; the actual race-safety guarantee against a genuine
  // concurrent double-submit is the UNIQUE(user_id, team_id, work_date)
  // constraint itself (migration), which this pre-check cannot fully
  // replace (a second request could still pass this check before the
  // first commits) -- so a 23505 from the INSERT is caught and turned
  // into the identical clean error, the same two-layer pattern
  // logs.service.ts's createLog already uses for the exact same
  // daily-uniqueness shape.
  async submitWork(userId: string, teamId: string, confirmedSummary: string, aiSummary?: string) {
    if (await dailyWorkRepository.hasSubmittedToday(userId, teamId)) {
      throw new ConflictError("Today's work has already been submitted for this team");
    }

    try {
      return await dailyWorkRepository.createSubmission(userId, teamId, aiSummary || null, confirmedSummary);
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictError("Today's work has already been submitted for this team");
      }
      throw error;
    }
  }

  getTeamSubmissionsForDate(teamId: string, date?: string) {
    return dailyWorkRepository.getTeamSubmissionsForDate(teamId, date);
  }

  // Milestone 53: personal history -- userId is always the authenticated
  // caller (never accepted from the client), so this can never return
  // another user's submissions regardless of what teamId is passed.
  getMyHistory(userId: string, teamId: string, limit: number) {
    return dailyWorkRepository.getMySubmissionHistory(userId, teamId, limit);
  }
}

export const dailyWorkService = new DailyWorkService();
