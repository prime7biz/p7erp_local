import { Router, Request, Response } from 'express';
import {
  createBtbLc, updateBtbLc, receiveDocument, getBtbLcDetail,
  listBtbLcs, getMaturityCalendar, getAlerts,
} from '../../services/btbLcService';

const router = Router();

const getTenantId = (req: Request): number => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) throw new Error('Tenant ID not found');
  return tenantId;
};

const getUserId = (req: Request): number => {
  const userId = (req as any).user?.id;
  if (!userId) throw new Error('User ID not found');
  return userId;
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const filters = {
      status: req.query.status as string | undefined,
      exportCaseId: req.query.exportCaseId ? parseInt(req.query.exportCaseId as string) : undefined,
    };
    const btbs = await listBtbLcs(tenantId, filters);
    res.json(btbs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/maturity-calendar', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const startDate = req.query.startDate as string || new Date().toISOString().split('T')[0];
    const endDate = req.query.endDate as string || new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
    const calendar = await getMaturityCalendar(tenantId, startDate, endDate);
    res.json(calendar);
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

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const detail = await getBtbLcDetail(tenantId, parseInt(req.params.id));
    res.json(detail);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const btb = await createBtbLc(tenantId, userId, req.body);
    res.status(201).json(btb);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const updated = await updateBtbLc(tenantId, parseInt(req.params.id), req.body);
    res.json(updated);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.post('/:id/documents', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const doc = await receiveDocument(tenantId, parseInt(req.params.id), req.body);
    res.status(201).json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
