import { Request, Response, NextFunction } from 'express';
import { getHelpDocsList, searchHelpCenterDocs } from '../modules/ai/rag/helpRagService';

export class HelpController {
  async getHelpDocs(_req: Request, res: Response, next: NextFunction) {
    try {
      const docs = getHelpDocsList();
      res.status(200).json({ success: true, data: docs });
    } catch (error) {
      next(error);
    }
  }

  async getHelpDocBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params;
      const docs = getHelpDocsList();
      const doc = docs.find((d) => d.slug === slug || d.id === slug);

      if (!doc) {
        return res.status(404).json({ success: false, error: 'Help article not found' });
      }

      res.status(200).json({ success: true, data: doc });
    } catch (error) {
      next(error);
    }
  }

  async searchHelpDocs(req: Request, res: Response, next: NextFunction) {
    try {
      const query = (req.query.q || req.query.query || '').toString();
      const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 5;
      const results = searchHelpCenterDocs(query, limit);
      res.status(200).json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  }
}

export const helpController = new HelpController();
