import { Router, Request, Response } from 'express';
import {
  recordFxReceipt, createSettlement, getSettlementSummary,
  listFxReceipts, getFxReceiptDetail, getUnsettledBalance,
} from '../../services/fxSettlementService';

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

router.get('/receipts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const filters = {
      exportCaseId: req.query.exportCaseId ? parseInt(req.query.exportCaseId as string) : undefined,
      status: req.query.status as string | undefined,
    };
    const receipts = await listFxReceipts(tenantId, filters);
    res.json(receipts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/receipts/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const detail = await getFxReceiptDetail(tenantId, parseInt(req.params.id));
    res.json(detail);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.post('/receipts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const receipt = await recordFxReceipt(tenantId, userId, req.body);
    res.status(201).json(receipt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/receipts/:id/settle', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { settlements } = req.body;
    const result = await createSettlement(tenantId, parseInt(req.params.id), settlements || []);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary/:exportCaseId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const summary = await getSettlementSummary(tenantId, parseInt(req.params.exportCaseId));
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/unsettled', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const balance = await getUnsettledBalance(tenantId);
    res.json(balance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
