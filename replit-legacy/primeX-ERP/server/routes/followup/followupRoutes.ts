import { Router, Request, Response } from 'express';
import {
  getStyleFollowup, getExportCaseFollowup, searchFollowup, getAlerts,
} from '../../services/followupService';

const router = Router();

const getTenantId = (req: Request): number => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) throw new Error('Tenant ID not found');
  return tenantId;
};

router.get('/style/:styleId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = await getStyleFollowup(tenantId, parseInt(req.params.styleId));
    res.json(data);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.get('/export-case/:exportCaseId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = await getExportCaseFollowup(tenantId, parseInt(req.params.exportCaseId));
    res.json(data);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const query = req.query.q as string || '';
    const results = await searchFollowup(tenantId, query);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const alerts = await getAlerts(tenantId);
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
