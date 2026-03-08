import { Router, Request, Response } from 'express';
import {
  createScenario, getScenarios, generateForecast,
  getForecastLines, getForecastSummary,
} from '../../services/cashForecastService';

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

router.get('/scenarios', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const scenarios = await getScenarios(tenantId);
    res.json(scenarios);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/scenarios', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const scenario = await createScenario(tenantId, userId, req.body);
    res.status(201).json(scenario);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate/:scenarioId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const months = req.body.months || 6;
    const result = await generateForecast(tenantId, parseInt(req.params.scenarioId), months);
    res.json(result);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.get('/lines/:scenarioId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const lines = await getForecastLines(tenantId, parseInt(req.params.scenarioId));
    res.json(lines);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary/:scenarioId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const summary = await getForecastSummary(tenantId, parseInt(req.params.scenarioId));
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
