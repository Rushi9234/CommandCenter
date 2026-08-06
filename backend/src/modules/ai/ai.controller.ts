import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { chatWithAI } from './ai.service';

export const chat = async (req: AuthRequest, res: Response) => {
  const response = await chatWithAI(req.body.message, req.body.context || '');
  ok(res, response);
};
