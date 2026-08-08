import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { chatWithAI } from './ai.service';
import { privacyService, AI_DISABLED_MESSAGE } from '../privacy/privacy.service';

export const chat = async (req: AuthRequest, res: Response) => {
  const aiEnabled = await privacyService.isAiEnabledForUser(req.user!.userId);
  if (!aiEnabled) {
    return ok(res, AI_DISABLED_MESSAGE);
  }

  const response = await chatWithAI(req.body.message, req.body.context || '');
  ok(res, response);
};
