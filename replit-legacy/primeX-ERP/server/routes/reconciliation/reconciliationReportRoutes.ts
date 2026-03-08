import express, { Request, Response } from 'express';
import { getStockVsGLReconciliation, getWIPVsGLReconciliation, getOrderProfitability } from '../../services/reconciliationService';
import { requireAnyPermission } from '../../middleware/rbacMiddleware';

const router = express.Router();

router.use(requireAnyPermission(
  'inventory:stock_valuation:read',
  'inventory:stock_summary:read',
  'accounts:trial_balance:read'
));

const getTenantId = (req: Request): number => {
  const tenantId = (req as any).user?.tenantId || (req as any).tenantId;
  if (!tenantId) throw new Error("Tenant ID not found");
  return tenantId;
};

router.get('/stock-vs-gl', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const result = await getStockVsGLReconciliation(tenantId);
    res.json(result);
  } catch (error: any) {
    console.error('Stock vs GL reconciliation error:', error);
    res.status(500).json({ message: error.message || 'Failed to get stock vs GL reconciliation' });
  }
});

router.get('/wip-vs-gl', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const result = await getWIPVsGLReconciliation(tenantId);
    res.json(result);
  } catch (error: any) {
    console.error('WIP vs GL reconciliation error:', error);
    res.status(500).json({ message: error.message || 'Failed to get WIP vs GL reconciliation' });
  }
});

router.get('/order-profitability', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const orderId = req.query.orderId ? parseInt(req.query.orderId as string) : undefined;
    const result = await getOrderProfitability(tenantId, orderId);
    res.json(result);
  } catch (error: any) {
    console.error('Order profitability error:', error);
    res.status(500).json({ message: error.message || 'Failed to get order profitability' });
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const [stockVsGL, wipVsGL, profitability] = await Promise.all([
      getStockVsGLReconciliation(tenantId),
      getWIPVsGLReconciliation(tenantId),
      getOrderProfitability(tenantId),
    ]);

    res.json({
      stockVsGL: stockVsGL.summary,
      wipVsGL: wipVsGL.summary,
      orderProfitability: {
        totalOrders: profitability.orders.length,
        totalRevenue: profitability.orders.reduce((s, o) => s + o.revenue, 0),
        totalCost: profitability.orders.reduce((s, o) => s + o.materialCost + o.laborCost + o.overheadCost, 0),
        totalGrossProfit: profitability.orders.reduce((s, o) => s + o.grossProfit, 0),
        avgGrossMarginPct: profitability.orders.length > 0
          ? Math.round(profitability.orders.reduce((s, o) => s + o.grossMarginPct, 0) / profitability.orders.length * 100) / 100
          : 0,
      },
    });
  } catch (error: any) {
    console.error('Reconciliation summary error:', error);
    res.status(500).json({ message: error.message || 'Failed to get reconciliation summary' });
  }
});

export default router;
