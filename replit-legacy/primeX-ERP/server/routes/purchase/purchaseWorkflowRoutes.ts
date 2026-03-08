import { parseIntParam } from "../../utils/parseParams";
import { Router } from "express";
import { createSupplierInvoice, approveSupplierInvoice, postSupplierInvoice, createSupplierPayment, approveSupplierPayment, postSupplierPayment, getAPAging, getInvoiceTrace } from '../../services/purchaseWorkflowService';
import { db } from '../../db';
import { supplierInvoices, supplierPayments } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ERPError } from '../../services/transactionSafetyService';

const router = Router();

const getTenantId = (req: any): number => {
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error("Tenant ID not found");
  return tenantId;
};

const getUserId = (req: any): number => {
  const userId = req.userId;
  if (!userId) throw new Error("User ID not found");
  return userId;
};

// ============================================================================
// SUPPLIER INVOICES (BILLS)
// ============================================================================

// POST /bills - Create supplier invoice
router.post('/bills', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const { invoiceNumber, supplierId, purchaseOrderId, grnId, invoiceDate, dueDate, totalAmount, subtotal, taxAmount, discountAmount, notes, items } = req.body;

    if (!invoiceNumber || !supplierId || !invoiceDate || totalAmount === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const invoice = await createSupplierInvoice(tenantId, {
      invoiceNumber,
      supplierId,
      purchaseOrderId,
      grnId,
      invoiceDate,
      dueDate,
      totalAmount,
      subtotal,
      taxAmount,
      discountAmount,
      notes,
      items,
      createdBy: userId,
    });

    return res.status(201).json({ success: true, data: invoice });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error creating supplier invoice:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /bills - List invoices for tenant
router.get('/bills', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const { status, supplierId } = req.query;

    const conditions: any[] = [eq(supplierInvoices.tenantId, tenantId)];
    if (status) conditions.push(eq(supplierInvoices.status, status as string));
    if (supplierId) conditions.push(eq(supplierInvoices.supplierId, parseInt(supplierId as string)));

    const invoices = await db.select().from(supplierInvoices)
      .where(and(...conditions))
      .orderBy(desc(supplierInvoices.createdAt));

    return res.json({ success: true, data: invoices });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error listing supplier invoices:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /bills/:id - Get single invoice
router.get('/bills/:id', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const invoiceId = parseIntParam(req.params.id, "id");

    const [invoice] = await db.select().from(supplierInvoices)
      .where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.tenantId, tenantId)));

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Supplier invoice not found' });
    }

    return res.json({ success: true, data: invoice });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error fetching supplier invoice:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// POST /bills/:id/approve - Approve invoice
router.post('/bills/:id/approve', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const invoiceId = parseIntParam(req.params.id, "id");

    const invoice = await approveSupplierInvoice(tenantId, invoiceId, userId);

    return res.json({ success: true, data: invoice, message: 'Supplier invoice approved' });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error approving supplier invoice:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// POST /bills/:id/post - Post invoice (creates AP voucher)
router.post('/bills/:id/post', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const invoiceId = parseIntParam(req.params.id, "id");
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'requestId is required' });
    }

    const result = await postSupplierInvoice(tenantId, invoiceId, userId, requestId);

    return res.json({ success: true, ...result });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error posting supplier invoice:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /bills/:id/trace - Invoice trace (PO + GRN + voucher + payments)
router.get('/bills/:id/trace', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const invoiceId = parseIntParam(req.params.id, "id");

    const trace = await getInvoiceTrace(tenantId, invoiceId);

    return res.json({ success: true, data: trace });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error fetching invoice trace:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// SUPPLIER PAYMENTS
// ============================================================================

// POST /payments - Create payment
router.post('/payments', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const { paymentNumber, supplierId, paymentDate, amount, paymentMethod, bankReference, notes, allocations } = req.body;

    if (!paymentNumber || !supplierId || !paymentDate || amount === undefined || !paymentMethod) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const payment = await createSupplierPayment(tenantId, {
      paymentNumber,
      supplierId,
      paymentDate,
      amount,
      paymentMethod,
      bankReference,
      notes,
      allocations,
      createdBy: userId,
    });

    return res.status(201).json({ success: true, data: payment });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error creating supplier payment:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /payments - List payments for tenant
router.get('/payments', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const { supplierId } = req.query;

    const conditions: any[] = [eq(supplierPayments.tenantId, tenantId)];
    if (supplierId) conditions.push(eq(supplierPayments.supplierId, parseInt(supplierId as string)));

    const payments = await db.select().from(supplierPayments)
      .where(and(...conditions))
      .orderBy(desc(supplierPayments.createdAt));

    return res.json({ success: true, data: payments });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error listing supplier payments:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// POST /payments/:id/approve - Approve payment
router.post('/payments/:id/approve', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const paymentId = parseIntParam(req.params.id, "id");

    const payment = await approveSupplierPayment(tenantId, paymentId, userId);

    return res.json({ success: true, data: payment, message: 'Supplier payment approved' });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error approving supplier payment:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// POST /payments/:id/post - Post payment (creates payment voucher)
router.post('/payments/:id/post', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const paymentId = parseIntParam(req.params.id, "id");
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'requestId is required' });
    }

    const result = await postSupplierPayment(tenantId, paymentId, userId, requestId);

    return res.json({ success: true, ...result });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error posting supplier payment:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// REPORTS
// ============================================================================

// GET /reports/ap-aging - AP aging report
router.get('/reports/ap-aging', async (req: any, res: any) => {
  try {
    const tenantId = getTenantId(req);
    const asOfDate = req.query.asOf || new Date().toISOString().split('T')[0];

    const report = await getAPAging(tenantId, asOfDate);

    return res.json({ success: true, data: report });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error generating AP aging report:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

export default router;
