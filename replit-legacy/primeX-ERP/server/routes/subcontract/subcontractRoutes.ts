import { parseIntParam } from "../../utils/parseParams";
import { Router, Request, Response } from 'express';
import {
  createSubcontractJob,
  approveSubcontractJob,
  createSubcontractChallan,
  postSubcontractChallan,
  createSubcontractBill,
  postSubcontractBill,
  getSubcontractJobTrace,
  getSubcontractJob,
  listSubcontractJobs,
} from '../../services/subcontractService';

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

router.post('/jobs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const job = await createSubcontractJob(tenantId, userId, req.body);
    res.status(201).json(job);
  } catch (error: any) {
    console.error('Create subcontract job error:', error);
    res.status(500).json({ error: error.message || 'Failed to create subcontract job' });
  }
});

router.post('/jobs/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await approveSubcontractJob(tenantId, id, userId);
    res.json(job);
  } catch (error: any) {
    console.error('Approve subcontract job error:', error);
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('Only DRAFT') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to approve subcontract job' });
  }
});

router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status, jobType, partyId } = req.query as Record<string, string>;
    const jobs = await listSubcontractJobs(tenantId, {
      status,
      jobType,
      partyId: partyId ? parseInt(partyId) : undefined,
    });
    res.json(jobs);
  } catch (error: any) {
    console.error('List subcontract jobs error:', error);
    res.status(500).json({ error: error.message || 'Failed to list subcontract jobs' });
  }
});

router.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid job ID' });

    const result = await getSubcontractJob(tenantId, id);
    res.json(result);
  } catch (error: any) {
    console.error('Get subcontract job error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message || 'Failed to get subcontract job' });
  }
});

router.get('/jobs/:id/trace', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid job ID' });

    const result = await getSubcontractJobTrace(tenantId, id);
    res.json(result);
  } catch (error: any) {
    console.error('Get subcontract job trace error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message || 'Failed to get subcontract job trace' });
  }
});

router.post('/challans', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const result = await createSubcontractChallan(tenantId, userId, req.body);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Create subcontract challan error:', error);
    res.status(500).json({ error: error.message || 'Failed to create subcontract challan' });
  }
});

router.post('/challans/:id/post', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid challan ID' });

    const { requestId } = req.body || {};
    const result = await postSubcontractChallan(tenantId, id, userId, requestId);
    res.json(result);
  } catch (error: any) {
    console.error('Post subcontract challan error:', error);
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('Only DRAFT') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to post subcontract challan' });
  }
});

router.post('/bills', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const bill = await createSubcontractBill(tenantId, userId, req.body);
    res.status(201).json(bill);
  } catch (error: any) {
    console.error('Create subcontract bill error:', error);
    res.status(500).json({ error: error.message || 'Failed to create subcontract bill' });
  }
});

router.post('/bills/:id/post', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid bill ID' });

    const result = await postSubcontractBill(tenantId, id, userId);
    res.json(result);
  } catch (error: any) {
    console.error('Post subcontract bill error:', error);
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('Only DRAFT') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to post subcontract bill' });
  }
});

export default router;
