import { Router, Request, Response } from 'express';
import {
  createPI, updatePI, addLinesToPI, addOrderLinesToPI, removeLineFromPI,
  linkToExportCase, getPIDetail, listPIs,
} from '../../services/proformaInvoiceService';

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
    const pis = await listPIs(tenantId, filters);
    res.json(pis);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const detail = await getPIDetail(tenantId, parseInt(req.params.id));
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
    const pi = await createPI(tenantId, userId, req.body);
    res.status(201).json(pi);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const updated = await updatePI(tenantId, parseInt(req.params.id), req.body);
    res.json(updated);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.post('/:id/lines', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { lines } = req.body;
    const result = await addLinesToPI(tenantId, parseInt(req.params.id), lines || []);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/add-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { orderIds } = req.body;
    const result = await addOrderLinesToPI(tenantId, parseInt(req.params.id), orderIds || []);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/lines/:lineId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await removeLineFromPI(tenantId, parseInt(req.params.lineId));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/link-export-case', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { exportCaseId } = req.body;
    const updated = await linkToExportCase(tenantId, parseInt(req.params.id), exportCaseId);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
