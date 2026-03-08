import { db } from '../db';
import {
  supplierInvoices, supplierInvoiceItems, supplierPayments, paymentAllocations,
  purchaseAccountingConfig, vouchers, voucherItems, voucherTypes, voucherStatus,
  fiscalYears, vendors, purchaseOrders, goodsReceivingNotes, auditLogs
} from '@shared/schema';
import { eq, and, sql, desc, sum, lt, lte, gte, isNull } from 'drizzle-orm';
import { ERPError, ERP_ERROR_CODES, checkIdempotency, saveIdempotencyResult } from './transactionSafetyService';
import { checkPeriodLock } from './accountingEngineService';
import { SequentialIdGenerator } from '../utils/sequentialIdGenerator';
import { ledgerPostings } from '@shared/schema';

export async function createSupplierInvoice(
  tenantId: number,
  data: {
    invoiceNumber: string;
    supplierId: number;
    purchaseOrderId?: number;
    grnId?: number;
    invoiceDate: string;
    dueDate?: string;
    totalAmount: number;
    subtotal?: number;
    taxAmount?: number;
    discountAmount?: number;
    notes?: string;
    createdBy: number;
    items?: Array<{
      itemId?: number;
      description?: string;
      quantity?: number;
      unitPrice?: number;
      taxPercent?: number;
      lineTotal: number;
    }>;
  }
): Promise<any> {
  const [invoice] = await db.insert(supplierInvoices).values({
    tenantId,
    invoiceNumber: data.invoiceNumber,
    supplierId: data.supplierId,
    purchaseOrderId: data.purchaseOrderId || null,
    grnId: data.grnId || null,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate || null,
    totalAmount: String(data.totalAmount),
    subtotal: data.subtotal != null ? String(data.subtotal) : null,
    taxAmount: data.taxAmount != null ? String(data.taxAmount) : null,
    discountAmount: data.discountAmount != null ? String(data.discountAmount) : null,
    paidAmount: '0',
    status: 'DRAFT',
    notes: data.notes || null,
    createdBy: data.createdBy,
  }).returning();

  const insertedItems: any[] = [];
  if (data.items && data.items.length > 0) {
    for (const item of data.items) {
      const [inserted] = await db.insert(supplierInvoiceItems).values({
        tenantId,
        invoiceId: invoice.id,
        itemId: item.itemId || null,
        description: item.description || null,
        quantity: item.quantity != null ? String(item.quantity) : null,
        unitPrice: item.unitPrice != null ? String(item.unitPrice) : null,
        taxPercent: item.taxPercent != null ? String(item.taxPercent) : null,
        lineTotal: String(item.lineTotal),
      }).returning();
      insertedItems.push(inserted);
    }
  }

  return { ...invoice, items: insertedItems };
}

export async function approveSupplierInvoice(
  tenantId: number,
  invoiceId: number,
  approvedBy: number
): Promise<any> {
  const [invoice] = await db.select().from(supplierInvoices)
    .where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.tenantId, tenantId)));

  if (!invoice) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Supplier invoice not found', 404);
  }
  if (invoice.status !== 'DRAFT') {
    throw new ERPError(ERP_ERROR_CODES.INVALID_STATE_TRANSITION, 'Only DRAFT invoices can be approved', 400);
  }

  const [updated] = await db.update(supplierInvoices).set({
    status: 'APPROVED',
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function postSupplierInvoice(
  tenantId: number,
  invoiceId: number,
  postedBy: number,
  requestId: string
): Promise<any> {
  const idem = await checkIdempotency(tenantId, requestId, 'SUPPLIER_INVOICE_POST');
  if (idem.exists) {
    return { success: true, invoice: idem.cachedResponse, message: 'Already posted (idempotent)', fromCache: true };
  }

  const [invoice] = await db.select().from(supplierInvoices)
    .where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.tenantId, tenantId)));

  if (!invoice) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Supplier invoice not found', 404);
  }
  if (invoice.status !== 'APPROVED') {
    throw new ERPError(ERP_ERROR_CODES.INVALID_STATE_TRANSITION, 'Only APPROVED invoices can be posted', 400);
  }

  const periodCheck = await checkPeriodLock(tenantId, invoice.invoiceDate);
  if (periodCheck.locked) {
    throw new ERPError(
      ERP_ERROR_CODES.PERIOD_LOCKED,
      `Cannot post invoice dated ${invoice.invoiceDate} - period is locked: ${periodCheck.period?.name}`,
      403,
      { period: periodCheck.period }
    );
  }

  const result = await db.transaction(async (tx) => {
    const [acctConfig] = await tx.select().from(purchaseAccountingConfig)
      .where(eq(purchaseAccountingConfig.tenantId, tenantId));

    if (!acctConfig || !acctConfig.accountsPayableLedgerId) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Purchase accounting config not found or AP ledger not configured', 400);
    }

    const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'PV');

    const [pvType] = await tx.select().from(voucherTypes)
      .where(and(eq(voucherTypes.tenantId, tenantId), eq(voucherTypes.code, 'PV')));
    const [jvType] = await tx.select().from(voucherTypes)
      .where(and(eq(voucherTypes.tenantId, tenantId), eq(voucherTypes.code, 'JV')));
    const type = pvType || jvType;

    if (!type) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'No voucher type (PV or JV) found for tenant', 400);
    }

    const [postedStatus_] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));
    const [currentFY] = await tx.select().from(fiscalYears)
      .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

    const totalAmount = parseFloat(invoice.totalAmount);
    const taxAmount = parseFloat(invoice.taxAmount || '0');
    const netAmount = totalAmount - taxAmount;

    const debitAccountId = acctConfig.inventoryAssetLedgerId || acctConfig.purchaseExpenseLedgerId;
    if (!debitAccountId) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'No inventory asset or purchase expense ledger configured', 400);
    }

    const voucherItemsData: Array<{ accountId: number; description: string; debitAmount: string; creditAmount: string }> = [];

    voucherItemsData.push({
      accountId: debitAccountId,
      description: `Purchase for Invoice ${invoice.invoiceNumber}`,
      debitAmount: String(netAmount),
      creditAmount: '0',
    });

    if (taxAmount > 0 && acctConfig.taxInputLedgerId) {
      voucherItemsData.push({
        accountId: acctConfig.taxInputLedgerId,
        description: `Tax Input for Invoice ${invoice.invoiceNumber}`,
        debitAmount: String(taxAmount),
        creditAmount: '0',
      });
    }

    voucherItemsData.push({
      accountId: acctConfig.accountsPayableLedgerId,
      description: `AP for Invoice ${invoice.invoiceNumber}`,
      debitAmount: '0',
      creditAmount: String(totalAmount),
    });

    const [apVoucher] = await tx.insert(vouchers).values({
      voucherNumber,
      voucherTypeId: type.id,
      voucherDate: invoice.invoiceDate,
      postingDate: invoice.invoiceDate,
      fiscalYearId: currentFY?.id || 1,
      statusId: postedStatus_?.id || type.id,
      description: `Supplier Invoice ${invoice.invoiceNumber} - AP Entry`,
      amount: String(totalAmount),
      preparedById: postedBy,
      isPosted: true,
      postedById: postedBy,
      postedDate: new Date(),
      workflowStatus: 'POSTED',
      originModule: 'PURCHASE',
      originType: 'SUPPLIER_INVOICE',
      originId: invoiceId,
      originRef: invoice.invoiceNumber,
      tenantId,
    }).returning();

    for (let i = 0; i < voucherItemsData.length; i++) {
      const vi = voucherItemsData[i];
      const [insertedItem] = await tx.insert(voucherItems).values({
        voucherId: apVoucher.id,
        lineNumber: i + 1,
        accountId: vi.accountId,
        description: vi.description,
        debitAmount: vi.debitAmount,
        creditAmount: vi.creditAmount,
        tenantId,
      }).returning();

      await tx.insert(ledgerPostings).values({
        tenantId,
        voucherId: apVoucher.id,
        voucherItemId: insertedItem.id,
        accountId: vi.accountId,
        postingDate: invoice.invoiceDate,
        debitAmount: vi.debitAmount,
        creditAmount: vi.creditAmount,
        narration: vi.description,
        postedById: postedBy,
        fiscalYearId: currentFY?.id || null,
      });
    }

    const [updatedInvoice] = await tx.update(supplierInvoices).set({
      status: 'POSTED',
      accountingVoucherId: apVoucher.id,
      requestId,
      postedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.tenantId, tenantId)))
      .returning();

    await tx.insert(auditLogs).values({
      tenantId,
      entityType: 'supplier_invoice',
      entityId: invoiceId,
      action: 'POSTED',
      performedBy: postedBy,
      newValues: {
        voucherId: apVoucher.id,
        voucherNumber: apVoucher.voucherNumber,
      },
    });

    return { invoice: updatedInvoice, accountingVoucherId: apVoucher.id };
  });

  await saveIdempotencyResult(tenantId, requestId, 'SUPPLIER_INVOICE_POST', String(invoiceId), 200, result);

  return { success: true, ...result, message: 'Supplier invoice posted successfully' };
}

export async function createSupplierPayment(
  tenantId: number,
  data: {
    paymentNumber: string;
    supplierId: number;
    paymentDate: string;
    amount: number;
    paymentMethod: string;
    bankReference?: string;
    notes?: string;
    createdBy: number;
    allocations?: Array<{ invoiceId: number; allocatedAmount: number }>;
  }
): Promise<any> {
  const [payment] = await db.insert(supplierPayments).values({
    tenantId,
    paymentNumber: data.paymentNumber,
    supplierId: data.supplierId,
    paymentDate: data.paymentDate,
    amount: String(data.amount),
    paymentMethod: data.paymentMethod,
    bankReference: data.bankReference || null,
    status: 'DRAFT',
    notes: data.notes || null,
    createdBy: data.createdBy,
  }).returning();

  const insertedAllocations: any[] = [];
  if (data.allocations && data.allocations.length > 0) {
    for (const alloc of data.allocations) {
      const [inserted] = await db.insert(paymentAllocations).values({
        tenantId,
        paymentId: payment.id,
        invoiceId: alloc.invoiceId,
        allocatedAmount: String(alloc.allocatedAmount),
      }).returning();
      insertedAllocations.push(inserted);
    }
  }

  return { ...payment, allocations: insertedAllocations };
}

export async function approveSupplierPayment(
  tenantId: number,
  paymentId: number,
  approvedBy: number
): Promise<any> {
  const [payment] = await db.select().from(supplierPayments)
    .where(and(eq(supplierPayments.id, paymentId), eq(supplierPayments.tenantId, tenantId)));

  if (!payment) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Supplier payment not found', 404);
  }
  if (payment.status !== 'DRAFT') {
    throw new ERPError(ERP_ERROR_CODES.INVALID_STATE_TRANSITION, 'Only DRAFT payments can be approved', 400);
  }

  const [updated] = await db.update(supplierPayments).set({
    status: 'APPROVED',
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(supplierPayments.id, paymentId), eq(supplierPayments.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function postSupplierPayment(
  tenantId: number,
  paymentId: number,
  postedBy: number,
  requestId: string
): Promise<any> {
  const idem = await checkIdempotency(tenantId, requestId, 'SUPPLIER_PAYMENT_POST');
  if (idem.exists) {
    return { success: true, payment: idem.cachedResponse, message: 'Already posted (idempotent)', fromCache: true };
  }

  const [payment] = await db.select().from(supplierPayments)
    .where(and(eq(supplierPayments.id, paymentId), eq(supplierPayments.tenantId, tenantId)));

  if (!payment) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Supplier payment not found', 404);
  }
  if (payment.status !== 'APPROVED') {
    throw new ERPError(ERP_ERROR_CODES.INVALID_STATE_TRANSITION, 'Only APPROVED payments can be posted', 400);
  }

  const periodCheck = await checkPeriodLock(tenantId, payment.paymentDate);
  if (periodCheck.locked) {
    throw new ERPError(
      ERP_ERROR_CODES.PERIOD_LOCKED,
      `Cannot post payment dated ${payment.paymentDate} - period is locked: ${periodCheck.period?.name}`,
      403,
      { period: periodCheck.period }
    );
  }

  const result = await db.transaction(async (tx) => {
    const [acctConfig] = await tx.select().from(purchaseAccountingConfig)
      .where(eq(purchaseAccountingConfig.tenantId, tenantId));

    if (!acctConfig || !acctConfig.accountsPayableLedgerId) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Purchase accounting config not found or AP ledger not configured', 400);
    }

    const paymentAmount = parseFloat(payment.amount);
    const method = payment.paymentMethod.toUpperCase();
    let creditAccountId: number | null = null;

    if (method === 'BANK' || method === 'CHEQUE' || method === 'TRANSFER') {
      creditAccountId = acctConfig.bankLedgerId || null;
    } else if (method === 'CASH') {
      creditAccountId = acctConfig.cashLedgerId || null;
    } else {
      creditAccountId = acctConfig.bankLedgerId || acctConfig.cashLedgerId || null;
    }

    if (!creditAccountId) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'No bank or cash ledger configured for payment method', 400);
    }

    const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'PV');

    const [pvType] = await tx.select().from(voucherTypes)
      .where(and(eq(voucherTypes.tenantId, tenantId), eq(voucherTypes.code, 'PV')));
    const [jvType] = await tx.select().from(voucherTypes)
      .where(and(eq(voucherTypes.tenantId, tenantId), eq(voucherTypes.code, 'JV')));
    const type = pvType || jvType;

    if (!type) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'No voucher type (PV or JV) found for tenant', 400);
    }

    const [postedStatus_] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));
    const [currentFY] = await tx.select().from(fiscalYears)
      .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

    const voucherItemsData = [
      {
        accountId: acctConfig.accountsPayableLedgerId,
        description: `AP Payment ${payment.paymentNumber}`,
        debitAmount: String(paymentAmount),
        creditAmount: '0',
      },
      {
        accountId: creditAccountId,
        description: `${method} Payment ${payment.paymentNumber}`,
        debitAmount: '0',
        creditAmount: String(paymentAmount),
      },
    ];

    const [payVoucher] = await tx.insert(vouchers).values({
      voucherNumber,
      voucherTypeId: type.id,
      voucherDate: payment.paymentDate,
      postingDate: payment.paymentDate,
      fiscalYearId: currentFY?.id || 1,
      statusId: postedStatus_?.id || type.id,
      description: `Supplier Payment ${payment.paymentNumber}`,
      amount: String(paymentAmount),
      preparedById: postedBy,
      isPosted: true,
      postedById: postedBy,
      postedDate: new Date(),
      workflowStatus: 'POSTED',
      originModule: 'PURCHASE',
      originType: 'SUPPLIER_PAYMENT',
      originId: paymentId,
      originRef: payment.paymentNumber,
      tenantId,
    }).returning();

    for (let i = 0; i < voucherItemsData.length; i++) {
      const vi = voucherItemsData[i];
      const [insertedItem] = await tx.insert(voucherItems).values({
        voucherId: payVoucher.id,
        lineNumber: i + 1,
        accountId: vi.accountId,
        description: vi.description,
        debitAmount: vi.debitAmount,
        creditAmount: vi.creditAmount,
        tenantId,
      }).returning();

      await tx.insert(ledgerPostings).values({
        tenantId,
        voucherId: payVoucher.id,
        voucherItemId: insertedItem.id,
        accountId: vi.accountId,
        postingDate: payment.paymentDate,
        debitAmount: vi.debitAmount,
        creditAmount: vi.creditAmount,
        narration: vi.description,
        postedById: postedBy,
        fiscalYearId: currentFY?.id || null,
      });
    }

    const [updatedPayment] = await tx.update(supplierPayments).set({
      status: 'POSTED',
      accountingVoucherId: payVoucher.id,
      requestId,
      postedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(supplierPayments.id, paymentId), eq(supplierPayments.tenantId, tenantId)))
      .returning();

    const allocations = await tx.select().from(paymentAllocations)
      .where(and(eq(paymentAllocations.paymentId, paymentId), eq(paymentAllocations.tenantId, tenantId)));

    for (const alloc of allocations) {
      const allocAmount = parseFloat(alloc.allocatedAmount);

      await tx.update(supplierInvoices).set({
        paidAmount: sql`COALESCE(${supplierInvoices.paidAmount}, '0')::numeric + ${allocAmount}`,
        updatedAt: new Date(),
      }).where(and(eq(supplierInvoices.id, alloc.invoiceId), eq(supplierInvoices.tenantId, tenantId)));

      const [updatedInv] = await tx.select().from(supplierInvoices)
        .where(and(eq(supplierInvoices.id, alloc.invoiceId), eq(supplierInvoices.tenantId, tenantId)));

      if (updatedInv) {
        const paid = parseFloat(updatedInv.paidAmount || '0');
        const total = parseFloat(updatedInv.totalAmount);
        let newStatus = updatedInv.status;

        if (paid >= total) {
          newStatus = 'PAID';
        } else if (paid > 0 && paid < total) {
          newStatus = 'PARTIAL_PAID';
        }

        if (newStatus !== updatedInv.status) {
          await tx.update(supplierInvoices).set({
            status: newStatus,
            updatedAt: new Date(),
          }).where(and(eq(supplierInvoices.id, alloc.invoiceId), eq(supplierInvoices.tenantId, tenantId)));
        }
      }
    }

    await tx.insert(auditLogs).values({
      tenantId,
      entityType: 'supplier_payment',
      entityId: paymentId,
      action: 'POSTED',
      performedBy: postedBy,
      newValues: {
        voucherId: payVoucher.id,
        voucherNumber: payVoucher.voucherNumber,
        allocationsApplied: allocations.length,
      },
    });

    return { payment: updatedPayment, accountingVoucherId: payVoucher.id };
  });

  await saveIdempotencyResult(tenantId, requestId, 'SUPPLIER_PAYMENT_POST', String(paymentId), 200, result);

  return { success: true, ...result, message: 'Supplier payment posted successfully' };
}

export async function getAPAging(
  tenantId: number,
  asOfDate: string
): Promise<any> {
  const invoices = await db.select({
    id: supplierInvoices.id,
    invoiceNumber: supplierInvoices.invoiceNumber,
    supplierId: supplierInvoices.supplierId,
    invoiceDate: supplierInvoices.invoiceDate,
    dueDate: supplierInvoices.dueDate,
    totalAmount: supplierInvoices.totalAmount,
    paidAmount: supplierInvoices.paidAmount,
    status: supplierInvoices.status,
  }).from(supplierInvoices)
    .where(and(
      eq(supplierInvoices.tenantId, tenantId),
      sql`${supplierInvoices.status} IN ('POSTED', 'PARTIAL_PAID')`
    ));

  const supplierIds = Array.from(new Set(invoices.map(inv => inv.supplierId)));
  const supplierMap: Record<number, any> = {};

  if (supplierIds.length > 0) {
    const supplierList = await db.select({
      id: vendors.id,
      name: vendors.vendorName,
    }).from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), sql`${vendors.id} IN (${sql.join(supplierIds.map(id => sql`${id}`), sql`, `)})`));

    for (const s of supplierList) {
      supplierMap[s.id] = s;
    }
  }

  const asOf = new Date(asOfDate);
  const agingBySupplier: Record<number, {
    supplierId: number;
    supplierName: string;
    current: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    total: number;
    invoices: any[];
  }> = {};

  for (const inv of invoices) {
    const outstanding = parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount || '0');
    if (outstanding <= 0) continue;

    const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate);
    const diffMs = asOf.getTime() - dueDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (!agingBySupplier[inv.supplierId]) {
      const supplier = supplierMap[inv.supplierId];
      agingBySupplier[inv.supplierId] = {
        supplierId: inv.supplierId,
        supplierName: supplier?.name || `Supplier #${inv.supplierId}`,
        current: 0,
        days31to60: 0,
        days61to90: 0,
        days90plus: 0,
        total: 0,
        invoices: [],
      };
    }

    const bucket = agingBySupplier[inv.supplierId];

    if (diffDays <= 30) {
      bucket.current += outstanding;
    } else if (diffDays <= 60) {
      bucket.days31to60 += outstanding;
    } else if (diffDays <= 90) {
      bucket.days61to90 += outstanding;
    } else {
      bucket.days90plus += outstanding;
    }
    bucket.total += outstanding;
    bucket.invoices.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      dueDate: inv.dueDate || inv.invoiceDate,
      outstanding,
      ageDays: diffDays,
    });
  }

  const suppliers = Object.values(agingBySupplier);
  const grandTotal = {
    current: suppliers.reduce((s, b) => s + b.current, 0),
    days31to60: suppliers.reduce((s, b) => s + b.days31to60, 0),
    days61to90: suppliers.reduce((s, b) => s + b.days61to90, 0),
    days90plus: suppliers.reduce((s, b) => s + b.days90plus, 0),
    total: suppliers.reduce((s, b) => s + b.total, 0),
  };

  return { asOfDate, suppliers, grandTotal };
}

export async function getInvoiceTrace(
  tenantId: number,
  invoiceId: number
): Promise<any> {
  const [invoice] = await db.select().from(supplierInvoices)
    .where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.tenantId, tenantId)));

  if (!invoice) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Supplier invoice not found', 404);
  }

  const items = await db.select().from(supplierInvoiceItems)
    .where(and(eq(supplierInvoiceItems.invoiceId, invoiceId), eq(supplierInvoiceItems.tenantId, tenantId)));

  let linkedPO = null;
  if (invoice.purchaseOrderId) {
    const [po] = await db.select().from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, invoice.purchaseOrderId), eq(purchaseOrders.tenantId, tenantId)));
    linkedPO = po || null;
  }

  let linkedGRN = null;
  if (invoice.grnId) {
    const [grn] = await db.select().from(goodsReceivingNotes)
      .where(and(eq(goodsReceivingNotes.id, invoice.grnId), eq(goodsReceivingNotes.tenantId, tenantId)));
    linkedGRN = grn || null;
  }

  let linkedVoucher = null;
  if (invoice.accountingVoucherId) {
    const [v] = await db.select().from(vouchers)
      .where(and(eq(vouchers.id, invoice.accountingVoucherId), eq(vouchers.tenantId, tenantId)));
    linkedVoucher = v || null;
  }

  const allocations = await db.select().from(paymentAllocations)
    .where(and(eq(paymentAllocations.invoiceId, invoiceId), eq(paymentAllocations.tenantId, tenantId)));

  const payments: any[] = [];
  for (const alloc of allocations) {
    const [pmt] = await db.select().from(supplierPayments)
      .where(and(eq(supplierPayments.id, alloc.paymentId), eq(supplierPayments.tenantId, tenantId)));
    if (pmt) {
      payments.push({
        ...pmt,
        allocatedAmount: alloc.allocatedAmount,
      });
    }
  }

  const [supplier] = await db.select().from(vendors)
    .where(and(eq(vendors.id, invoice.supplierId), eq(vendors.tenantId, tenantId)));

  return {
    invoice,
    items,
    supplier: supplier || null,
    purchaseOrder: linkedPO,
    goodsReceivingNote: linkedGRN,
    accountingVoucher: linkedVoucher,
    payments,
  };
}
