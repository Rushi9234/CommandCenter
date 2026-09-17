import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { attentionService } from './attention.service';
import { ok } from '../../common/http/respond';

export const getTeamAttention = async (req: AuthRequest, res: Response): Promise<void> => {
  const { teamId } = req.params;

  const data = await attentionService.getTeamActionCenter(teamId);

  if (!data) {
    res.status(404).json({ success: false, error: 'Team not found' });
    return;
  }

  ok(res, data, 'Explainable team attention data fetched successfully');
};

export const getIndividualAttention = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const data = await attentionService.getIndividualActionCenter(userId);
    ok(res, data, 'Individual attention items fetched successfully');
  } catch (error: any) {
    console.error('ERROR in getIndividualAttention:', error);
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
};

export const getClassroomAttention = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { teamId } = req.params;
    const data = await attentionService.getClassroomActionCenter(teamId);

    if (!data) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    ok(res, data, 'Classroom attention data fetched successfully');
  } catch (error: any) {
    console.error('ERROR in getClassroomAttention:', error);
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
};
