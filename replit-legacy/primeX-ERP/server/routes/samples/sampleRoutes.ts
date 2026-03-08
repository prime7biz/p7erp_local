import { Router, Request, Response } from 'express';
import {
  createSampleRequest, submitSampleRequest, approveSampleRequest,
  startSampleRequest, sendSample, recordFeedback, closeSampleRequest,
  listSampleRequests, getSampleRequestDetail, lockSampleBom,
  createMaterialRequest, approveMaterialRequest, issueMaterial,
  getSampleTrace
} from '../../services/sampleService';

const router = Router();

router.post('/requests', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const data = { ...req.body, createdBy: (req as any).user?.id };
    const result = await createSampleRequest(tenantId, data);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message, details: error.details });
    console.error('Error creating sample request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/requests', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const filters: any = {};
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.buyerId) filters.buyerId = Number(req.query.buyerId);
    const result = await listSampleRequests(tenantId, filters);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error listing sample requests:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const result = await getSampleRequestDetail(tenantId, Number(req.params.id));
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting sample request detail:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/requests/:id/submit', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).user?.id || 0;
    const result = await submitSampleRequest(tenantId, Number(req.params.id), userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message, details: error.details });
    console.error('Error submitting sample request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).user?.id || 0;
    const result = await approveSampleRequest(tenantId, Number(req.params.id), userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message, details: error.details });
    console.error('Error approving sample request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/requests/:id/start', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).user?.id || 0;
    const result = await startSampleRequest(tenantId, Number(req.params.id), userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message, details: error.details });
    console.error('Error starting sample request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/requests/:id/send', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).user?.id || 0;
    const result = await sendSample(tenantId, Number(req.params.id), userId, req.body.comments);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message, details: error.details });
    console.error('Error sending sample:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/requests/:id/feedback', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).user?.id || 0;
    const { buyerComments, internalComments, accepted } = req.body;
    const result = await recordFeedback(tenantId, Number(req.params.id), userId, { buyerComments, internalComments, accepted });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message, details: error.details });
    console.error('Error recording feedback:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/requests/:id/close', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).user?.id || 0;
    const result = await closeSampleRequest(tenantId, Number(req.params.id), userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message, details: error.details });
    console.error('Error closing sample request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/requests/:id/lock-bom', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).user?.id || 0;
    const { styleBomId } = req.body;
    if (!styleBomId) return res.status(400).json({ success: false, message: 'styleBomId is required' });
    const result = await lockSampleBom(tenantId, Number(req.params.id), styleBomId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error locking BOM:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/requests/:id/trace', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const result = await getSampleTrace(tenantId, Number(req.params.id));
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting sample trace:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/by-enquiry/:enquiryId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const enquiryId = Number(req.params.enquiryId);
    if (isNaN(enquiryId)) return res.status(400).json({ success: false, message: 'Invalid enquiry ID' });
    const { db } = await import('../../db');
    const { eq, and } = await import('drizzle-orm');
    const { sampleRequests, customers } = await import('@shared/schema');
    const results = await db.select({
      request: sampleRequests,
      buyerName: customers.customerName,
    })
      .from(sampleRequests)
      .leftJoin(customers, eq(sampleRequests.customerId, customers.id))
      .where(and(eq(sampleRequests.inquiryId, enquiryId), eq(sampleRequests.tenantId, tenantId)));
    const mapped = results.map(r => ({ ...r.request, buyerName: r.buyerName, styleNo: r.request.styleCode || r.request.styleName }));
    return res.json({ success: true, data: mapped });
  } catch (error: any) {
    console.error('Error fetching samples by enquiry:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/requests/:id/material-request', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { lines, requestId } = req.body;
    if (!lines || !Array.isArray(lines)) return res.status(400).json({ success: false, message: 'lines array is required' });
    const result = await createMaterialRequest(tenantId, Number(req.params.id), lines, requestId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error creating material request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/material-requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).user?.id || 0;
    const result = await approveMaterialRequest(tenantId, Number(req.params.id), userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error approving material request:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/material-requests/:id/issue', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req as any).user?.id || 0;
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ success: false, message: 'requestId is required for idempotency' });
    const result = await issueMaterial(tenantId, Number(req.params.id), userId, requestId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error issuing material:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

export default router;
