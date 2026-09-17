import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { chatWithAI } from './ai.service';
import { privacyService, AI_DISABLED_MESSAGE } from '../privacy/privacy.service';
import { teamsRepository } from '../teams/teams.repository';
import { ForbiddenError } from '../../common/errors';

export const chat = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const aiEnabled = await privacyService.isAiEnabledForUser(userId);
  if (!aiEnabled) {
    return ok(res, AI_DISABLED_MESSAGE);
  }

  const { message, context, teamId } = req.body;

  if (teamId) {
    const isAuthorized = await teamsRepository.canAccessTeam(userId, teamId);
    if (!isAuthorized) {
      throw new ForbiddenError('You are not authorized to query AI for this team context');
    }
  }

  const response = await chatWithAI(message, context || '', userId, teamId);
  ok(res, response);
};
