import { parseIntParam } from "../../utils/parseParams";
import { Router, Request, Response } from 'express';
import {
  createProductionOrder,
  approveProductionOrder,
  startProductionOrder,
  completeProductionOrder,
  getProductionOrder,
  listProductionOrders,
  getYieldReport,
  getProductionOrderTrace,
} from '../../services/productionService';

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

router.post('/orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const order = await createProductionOrder(tenantId, userId, req.body);
    res.status(201).json(order);
  } catch (error: any) {
    console.error('Create production order error:', error);
    res.status(500).json({ message: error.message || 'Failed to create production order' });
  }
});

router.post('/orders/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid order ID' });

    const order = await approveProductionOrder(tenantId, id, userId);
    res.json(order);
  } catch (error: any) {
    console.error('Approve production order error:', error);
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('Only DRAFT') ? 400 : 500;
    res.status(status).json({ message: error.message || 'Failed to approve production order' });
  }
});

router.post('/orders/:id/start', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid order ID' });

    const { overrideReason } = req.body || {};
    const result = await startProductionOrder(tenantId, id, userId, overrideReason);
    res.json(result);
  } catch (error: any) {
    console.error('Start production order error:', error);
    if (error.code === 'APPROVAL_REQUIRED') {
      return res.status(409).json({
        message: error.message,
        code: 'APPROVAL_REQUIRED',
        availableStock: error.availableStock,
        requiredStock: error.requiredStock,
      });
    }
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('Only APPROVED') ? 400 : 500;
    res.status(status).json({ message: error.message || 'Failed to start production order' });
  }
});

router.post('/orders/:id/complete', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid order ID' });

    const { actualOutputQty, processCost } = req.body;
    if (!actualOutputQty || actualOutputQty <= 0) {
      return res.status(400).json({ message: 'actualOutputQty is required and must be positive' });
    }

    const result = await completeProductionOrder(tenantId, id, userId, {
      actualOutputQty: parseFloat(actualOutputQty),
      processCost: processCost ? parseFloat(processCost) : undefined,
    });
    res.json(result);
  } catch (error: any) {
    console.error('Complete production order error:', error);
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('Only IN_PROGRESS') ? 400 : 500;
    res.status(status).json({ message: error.message || 'Failed to complete production order' });
  }
});

router.get('/orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status, processType, startDate, endDate } = req.query as Record<string, string>;
    const orders = await listProductionOrders(tenantId, { status, processType, startDate, endDate });
    res.json(orders);
  } catch (error: any) {
    console.error('List production orders error:', error);
    res.status(500).json({ message: error.message || 'Failed to list production orders' });
  }
});

router.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid order ID' });

    const result = await getProductionOrder(tenantId, id);
    res.json(result);
  } catch (error: any) {
    console.error('Get production order error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ message: error.message || 'Failed to get production order' });
  }
});

router.get('/orders/:id/trace', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid order ID' });

    const result = await getProductionOrderTrace(tenantId, id);
    res.json(result);
  } catch (error: any) {
    console.error('Get production order trace error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ message: error.message || 'Failed to get production order trace' });
  }
});

router.get('/reports/yield', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, processType } = req.query as Record<string, string>;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }

    const report = await getYieldReport(tenantId, startDate, endDate, processType);
    res.json(report);
  } catch (error: any) {
    console.error('Get yield report error:', error);
    res.status(500).json({ message: error.message || 'Failed to get yield report' });
  }
});

export default router;
