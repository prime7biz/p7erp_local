import { parseIntParam } from "../../utils/parseParams";
import { Router, Request, Response } from 'express';
import {
  createLC,
  amendLC,
  getLC,
  listLCs,
  createCommercialDocument,
  approveCommercialDocument,
  listCommercialDocuments,
  createShipment,
  updateShipmentStatus,
  getShipment,
  getShipmentTrace,
  listShipments,
  getShipmentChecklist,
  updateChecklistItem,
} from '../../services/commercialLcService';

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

router.post('/lc', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const lc = await createLC(tenantId, userId, req.body);
    res.status(201).json(lc);
  } catch (error: any) {
    console.error('Create LC error:', error);
    res.status(500).json({ error: error.message || 'Failed to create LC' });
  }
});

router.post('/lc/:id/amend', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid LC ID' });

    const lc = await amendLC(tenantId, id, userId, req.body);
    res.json(lc);
  } catch (error: any) {
    console.error('Amend LC error:', error);
    const status = error.message?.includes('not found') ? 404 :
      error.message?.includes('Only ACTIVE') ? 400 :
      error.message?.includes('Override reason') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to amend LC' });
  }
});

router.get('/lc', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status, lcType } = req.query as Record<string, string>;
    const lcs = await listLCs(tenantId, { status, lcType });
    res.json(lcs);
  } catch (error: any) {
    console.error('List LCs error:', error);
    res.status(500).json({ error: error.message || 'Failed to list LCs' });
  }
});

router.get('/lc/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid LC ID' });

    const lc = await getLC(tenantId, id);
    res.json(lc);
  } catch (error: any) {
    console.error('Get LC error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message || 'Failed to get LC' });
  }
});

router.post('/documents', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const doc = await createCommercialDocument(tenantId, userId, req.body);
    res.status(201).json(doc);
  } catch (error: any) {
    console.error('Create commercial document error:', error);
    res.status(500).json({ error: error.message || 'Failed to create commercial document' });
  }
});

router.post('/documents/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid document ID' });

    const doc = await approveCommercialDocument(tenantId, id, userId);
    res.json(doc);
  } catch (error: any) {
    console.error('Approve commercial document error:', error);
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('Only DRAFT') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to approve commercial document' });
  }
});

router.get('/documents', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status, docType, relatedType, relatedId } = req.query as Record<string, string>;
    const docs = await listCommercialDocuments(tenantId, {
      status,
      docType,
      relatedType,
      relatedId: relatedId ? parseInt(relatedId) : undefined,
    });
    res.json(docs);
  } catch (error: any) {
    console.error('List commercial documents error:', error);
    res.status(500).json({ error: error.message || 'Failed to list commercial documents' });
  }
});

router.post('/shipments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const shipment = await createShipment(tenantId, userId, req.body);
    res.status(201).json(shipment);
  } catch (error: any) {
    console.error('Create shipment error:', error);
    res.status(500).json({ error: error.message || 'Failed to create shipment' });
  }
});

router.post('/shipments/:id/update-status', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid shipment ID' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const shipment = await updateShipmentStatus(tenantId, id, status, userId);
    res.json(shipment);
  } catch (error: any) {
    console.error('Update shipment status error:', error);
    const status = error.message?.includes('not found') ? 404 :
      error.message?.includes('Cannot transition') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to update shipment status' });
  }
});

router.get('/shipments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status, mode } = req.query as Record<string, string>;
    const shipments = await listShipments(tenantId, { status, mode });
    res.json(shipments);
  } catch (error: any) {
    console.error('List shipments error:', error);
    res.status(500).json({ error: error.message || 'Failed to list shipments' });
  }
});

router.get('/shipments/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid shipment ID' });

    const shipment = await getShipment(tenantId, id);
    res.json(shipment);
  } catch (error: any) {
    console.error('Get shipment error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message || 'Failed to get shipment' });
  }
});

router.get('/shipments/:id/trace', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid shipment ID' });

    const trace = await getShipmentTrace(tenantId, id);
    res.json(trace);
  } catch (error: any) {
    console.error('Get shipment trace error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message || 'Failed to get shipment trace' });
  }
});

router.get('/shipments/:id/checklist', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid shipment ID' });

    const checklist = await getShipmentChecklist(tenantId, id);
    res.json(checklist);
  } catch (error: any) {
    console.error('Get shipment checklist error:', error);
    res.status(500).json({ error: error.message || 'Failed to get shipment checklist' });
  }
});

router.patch('/shipments/checklist/:itemId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const itemId = parseIntParam(req.params.itemId, "itemId");
    if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid checklist item ID' });

    const updated = await updateChecklistItem(tenantId, itemId, userId, req.body);
    res.json(updated);
  } catch (error: any) {
    console.error('Update checklist item error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message || 'Failed to update checklist item' });
  }
});

export default router;
