import { Router, Request, Response } from 'express';
import {
  predictCashFlow, predictDemand, suggestCostOptimization,
  analyzeProfitabilityTrend, predictBtbMaturityRisk,
} from '../../services/aiPredictionService';

const router = Router();

const getTenantId = (req: Request): number => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) throw new Error('Tenant ID not found');
  return tenantId;
};

router.get('/cash-flow', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const result = await predictCashFlow(tenantId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/demand', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const styleId = req.query.styleId ? parseInt(req.query.styleId as string) : undefined;
    const result = await predictDemand(tenantId, styleId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/cost-optimization', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const exportCaseId = req.query.exportCaseId ? parseInt(req.query.exportCaseId as string) : undefined;
    const result = await suggestCostOptimization(tenantId, exportCaseId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/profitability-trend', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const result = await analyzeProfitabilityTrend(tenantId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/btb-risk', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const result = await predictBtbMaturityRisk(tenantId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
