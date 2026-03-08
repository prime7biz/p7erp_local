import { Router, Request, Response } from 'express';
import {
  createExportCase, updateExportCase, linkOrdersToCase, unlinkOrderFromCase,
  linkLcToCase, updateStatus, getExportCaseDetail, listExportCases,
} from '../../services/exportCaseService';

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
      buyerId: req.query.buyerId ? parseInt(req.query.buyerId as string) : undefined,
    };
    const cases = await listExportCases(tenantId, filters);
    res.json(cases);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const detail = await getExportCaseDetail(tenantId, id);
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
    const ec = await createExportCase(tenantId, userId, req.body);
    res.status(201).json(ec);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const updated = await updateExportCase(tenantId, id, req.body);
    res.json(updated);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.post('/:id/link-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const exportCaseId = parseInt(req.params.id);
    const { orders } = req.body;
    const links = await linkOrdersToCase(tenantId, exportCaseId, orders || []);
    res.json(links);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/orders/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await unlinkOrderFromCase(tenantId, parseInt(req.params.id), parseInt(req.params.orderId));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/link-lc', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { lcId } = req.body;
    const updated = await linkLcToCase(tenantId, parseInt(req.params.id), lcId);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status } = req.body;
    const updated = await updateStatus(tenantId, parseInt(req.params.id), status);
    res.json(updated);
  } catch (error: any) {
    const status = error.message?.includes('Cannot transition') ? 400 :
      error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

export default router;
