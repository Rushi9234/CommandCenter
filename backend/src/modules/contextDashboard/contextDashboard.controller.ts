import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { contextDashboardService } from './contextDashboard.service';

export const getContextDashboard = async (req: AuthRequest, res: Response) => {
  const dashboard = await contextDashboardService.getContextDashboard(req.params.teamId);
  ok(res, dashboard);
};

export const getAuditReport = async (req: AuthRequest, res: Response) => {
  const format = (req.query.format as string) || 'json';
  const report = await contextDashboardService.getAuditReport(req.params.teamId, req.user);

  if (format === 'csv') {
    const filename = `audit_report_${report.context.team_name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(report.csv);
  }

  ok(res, report);
};

