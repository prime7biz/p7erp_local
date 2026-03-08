import { parseIntParam } from "../../utils/parseParams";
import { Router, Request, Response } from 'express';
import {
  createSalesOrder,
  approveSalesOrder,
  getSalesOrder,
  getSalesOrderTrace,
  listSalesOrders,
  createDeliveryNote,
  approveDeliveryNote,
  postDeliveryNote,
  listDeliveryNotes,
  createSalesInvoice,
  postSalesInvoice,
  getSalesInvoice,
  getSalesInvoiceTrace,
  listSalesInvoices,
  createCollection,
  postCollection,
  listCollections,
  createExportProceed,
  getExportReconciliation,
} from '../../services/salesWorkflowService';

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

const handleError = (res: Response, error: any, defaultMsg: string) => {
  console.error(defaultMsg + ':', error);
  const statusCode = error.statusCode || (error.error?.includes('not found') ? 404 : 500);
  const message = error.error || error.message || defaultMsg;
  res.status(statusCode).json({ message });
};

router.post('/orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const order = await createSalesOrder(tenantId, userId, req.body);
    res.status(201).json(order);
  } catch (error: any) {
    handleError(res, error, 'Failed to create sales order');
  }
});

router.post('/orders/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await approveSalesOrder(tenantId, id, userId);
    res.json(order);
  } catch (error: any) {
    handleError(res, error, 'Failed to approve sales order');
  }
});

router.get('/orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status, startDate, endDate } = req.query as Record<string, string>;
    const orders = await listSalesOrders(tenantId, { status, startDate, endDate });
    res.json(orders);
  } catch (error: any) {
    handleError(res, error, 'Failed to list sales orders');
  }
});

router.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await getSalesOrder(tenantId, id);
    res.json(order);
  } catch (error: any) {
    handleError(res, error, 'Failed to get sales order');
  }
});

router.get('/orders/:id/trace', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid order ID' });
    const trace = await getSalesOrderTrace(tenantId, id);
    res.json(trace);
  } catch (error: any) {
    handleError(res, error, 'Failed to get sales order trace');
  }
});

router.post('/deliveries', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const delivery = await createDeliveryNote(tenantId, userId, req.body);
    res.status(201).json(delivery);
  } catch (error: any) {
    handleError(res, error, 'Failed to create delivery note');
  }
});

router.post('/deliveries/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid delivery ID' });
    const delivery = await approveDeliveryNote(tenantId, id, userId);
    res.json(delivery);
  } catch (error: any) {
    handleError(res, error, 'Failed to approve delivery note');
  }
});

router.post('/deliveries/:id/post', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid delivery ID' });
    const { requestId } = req.body || {};
    const result = await postDeliveryNote(tenantId, id, userId, requestId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, 'Failed to post delivery note');
  }
});

router.get('/deliveries', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status, startDate, endDate } = req.query as Record<string, string>;
    const deliveries = await listDeliveryNotes(tenantId, { status, startDate, endDate });
    res.json(deliveries);
  } catch (error: any) {
    handleError(res, error, 'Failed to list delivery notes');
  }
});

router.post('/invoices', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const invoice = await createSalesInvoice(tenantId, userId, req.body);
    res.status(201).json(invoice);
  } catch (error: any) {
    handleError(res, error, 'Failed to create sales invoice');
  }
});

router.post('/invoices/:id/post', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid invoice ID' });
    const { requestId } = req.body || {};
    const result = await postSalesInvoice(tenantId, id, userId, requestId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, 'Failed to post sales invoice');
  }
});

router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status, startDate, endDate } = req.query as Record<string, string>;
    const invoices = await listSalesInvoices(tenantId, { status, startDate, endDate });
    res.json(invoices);
  } catch (error: any) {
    handleError(res, error, 'Failed to list sales invoices');
  }
});

router.get('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid invoice ID' });
    const invoice = await getSalesInvoice(tenantId, id);
    res.json(invoice);
  } catch (error: any) {
    handleError(res, error, 'Failed to get sales invoice');
  }
});

router.get('/invoices/:id/trace', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid invoice ID' });
    const trace = await getSalesInvoiceTrace(tenantId, id);
    res.json(trace);
  } catch (error: any) {
    handleError(res, error, 'Failed to get sales invoice trace');
  }
});

router.post('/receipts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const collection = await createCollection(tenantId, userId, req.body);
    res.status(201).json(collection);
  } catch (error: any) {
    handleError(res, error, 'Failed to create collection');
  }
});

router.post('/receipts/:id/post', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid receipt ID' });
    const { requestId } = req.body || {};
    const result = await postCollection(tenantId, id, userId, requestId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, 'Failed to post collection');
  }
});

router.get('/receipts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status, startDate, endDate } = req.query as Record<string, string>;
    const result = await listCollections(tenantId, { status, startDate, endDate });
    res.json(result);
  } catch (error: any) {
    handleError(res, error, 'Failed to list collections');
  }
});

router.post('/export/proceeds', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const proceed = await createExportProceed(tenantId, userId, req.body);
    res.status(201).json(proceed);
  } catch (error: any) {
    handleError(res, error, 'Failed to create export proceed');
  }
});

router.get('/export/reconciliation', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = req.query as Record<string, string>;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }
    const report = await getExportReconciliation(tenantId, startDate, endDate);
    res.json(report);
  } catch (error: any) {
    handleError(res, error, 'Failed to get export reconciliation');
  }
});

export default router;
