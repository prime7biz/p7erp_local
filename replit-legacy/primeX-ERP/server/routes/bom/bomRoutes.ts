import { parseIntParam } from "../../utils/parseParams";
import { Router, Request, Response } from "express";
import {
  createBom,
  addBomLine,
  addBomVariant,
  updateBomLine,
  approveBom,
  reviseBom,
  lockBom,
  getBom,
  getBomsByStyle,
  createOrderBomSnapshot,
  suggestBom,
  listOverrideRequests,
  createOverrideRequest,
  approveOverrideRequest,
  rejectOverrideRequest,
  generateRmRequirement,
} from "../../services/bomService";
import {
  finalizeConsumptionPlan,
  getConsumptionPlan,
} from "../../services/consumptionPlanService";

const router = Router();

router.post('/styles/:styleId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const result = await createBom(tenantId, styleId, req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error creating BOM:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/:bomId/lines', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const bomId = parseIntParam(req.params.bomId, "bomId");
    const result = await addBomLine(tenantId, bomId, req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error adding BOM line:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.patch('/:bomId/lines/:lineId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const lineId = parseIntParam(req.params.lineId, "lineId");
    const result = await updateBomLine(tenantId, lineId, req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error updating BOM line:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/:bomId/lines/:lineId/variants', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const lineId = parseIntParam(req.params.lineId, "lineId");
    const result = await addBomVariant(tenantId, lineId, req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error adding BOM variant:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/:bomId/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const bomId = parseIntParam(req.params.bomId, "bomId");
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await approveBom(tenantId, bomId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error approving BOM:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/:bomId/lock', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const bomId = parseIntParam(req.params.bomId, "bomId");
    const result = await lockBom(tenantId, bomId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error locking BOM:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/:bomId/revise', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const bomId = parseIntParam(req.params.bomId, "bomId");
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await reviseBom(tenantId, bomId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error revising BOM:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/styles/:styleId/bom/:bomId/revise', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const bomId = parseIntParam(req.params.bomId, "bomId");
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await reviseBom(tenantId, bomId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error revising BOM:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/styles/:styleId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const result = await getBomsByStyle(tenantId, styleId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error listing BOMs:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/override-requests', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const bomId = parseInt(req.query.bomId as string);
    if (!bomId || isNaN(bomId)) return res.status(400).json({ success: false, message: 'bomId query parameter is required' });
    const result = await listOverrideRequests(tenantId, bomId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error listing override requests:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/override-requests', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).userId || (req as any).user?.id;
    const { styleBomId, bomLineId, reason, overrideData } = req.body;
    if (!styleBomId || !reason || !overrideData) {
      return res.status(400).json({ success: false, message: 'styleBomId, reason, and overrideData are required' });
    }
    const result = await createOverrideRequest(tenantId, userId, { styleBomId, bomLineId, reason, overrideData });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error creating override request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.patch('/override-requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const requestId = parseIntParam(req.params.id, "id");
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await approveOverrideRequest(tenantId, requestId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error approving override request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.patch('/override-requests/:id/reject', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const requestId = parseIntParam(req.params.id, "id");
    const userId = (req as any).userId || (req as any).user?.id;
    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'rejectionReason is required' });
    }
    const result = await rejectOverrideRequest(tenantId, requestId, userId, rejectionReason);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error rejecting override request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/:bomId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const bomId = parseIntParam(req.params.bomId, "bomId");
    const result = await getBom(tenantId, bomId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting BOM:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/orders/:orderId/lock-bom', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const { bomId } = req.body;
    if (!bomId) return res.status(400).json({ success: false, message: 'bomId is required' });
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await createOrderBomSnapshot(tenantId, orderId, bomId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error creating order BOM snapshot:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/orders/:orderId/generate-rm-requirement', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await generateRmRequirement(tenantId, orderId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error generating RM requirement:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/orders/:orderId/finalize-consumption', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ success: false, message: 'requestId is required' });
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await finalizeConsumptionPlan(tenantId, orderId, requestId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error finalizing consumption plan:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/orders/:orderId/consumption-plan', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const result = await getConsumptionPlan(tenantId, orderId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting consumption plan:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/ai/suggest', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const result = await suggestBom(tenantId, req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error suggesting BOM:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

export default router;
