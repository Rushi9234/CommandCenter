import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { privacyService } from './privacy.service';

export const updatePrivacySettings = async (req: AuthRequest, res: Response) => {
  const settings = await privacyService.updatePrivacySettings(req.user!.userId, req.body);
  ok(res, settings, 'Privacy settings updated');
};

export const getPrivacySettings = async (req: AuthRequest, res: Response) => {
  const settings = await privacyService.getPrivacySettings(req.user!.userId);
  ok(res, settings);
};

export const exportUserData = async (req: AuthRequest, res: Response) => {
  const data = await privacyService.exportUserData(req.user!.userId);
  ok(res, data, 'Data exported successfully');
};

export const deleteUserData = async (req: AuthRequest, res: Response) => {
  privacyService.deleteUserData(req.user!.userId, req.body.confirm);
  ok(res, undefined, 'Data deletion request received. Your account will be deleted within 30 days.');
};
