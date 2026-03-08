import { Router, Request, Response } from 'express';
import { searchByRef, getRefsForEntity } from '../../services/documentRefService';

const router = Router();

const getTenantId = (req: Request): number => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) throw new Error('Tenant ID not found');
  return tenantId;
};

router.get('/search', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const query = req.query.q as string || '';
    const results = await searchByRef(tenantId, query);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/entity/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const refs = await getRefsForEntity(tenantId, req.params.entityType, parseInt(req.params.entityId));
    res.json(refs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
