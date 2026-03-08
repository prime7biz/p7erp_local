import { Router, Request, Response } from 'express';
import {
  calculateStyleProfitability, calculateExportCaseProfitability,
  costingVsActualVariance, saveSnapshot, setAllocation,
} from '../../services/profitabilityService';

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

router.get('/style/:styleId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = await calculateStyleProfitability(tenantId, parseInt(req.params.styleId));
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/export-case/:exportCaseId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = await calculateExportCaseProfitability(tenantId, parseInt(req.params.exportCaseId));
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/variance/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = await costingVsActualVariance(tenantId, parseInt(req.params.orderId));
    res.json(data);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.post('/snapshot', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { entityType, entityId, data } = req.body;
    const snapshot = await saveSnapshot(tenantId, entityType, entityId, data, userId);
    res.status(201).json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/allocation/:exportCaseId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { allocations } = req.body;
    const result = await setAllocation(tenantId, parseInt(req.params.exportCaseId), allocations || [], userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
