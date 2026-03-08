import { db } from '../db';
import { exportCases, exportCaseOrders, orders, customers, commercialLcs, proformaInvoices, btbLcs, fxReceipts, fxSettlements, shipments } from '@shared/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';

async function generateExportCaseNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'EC',
    tableName: 'export_cases',
    columnName: 'export_case_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

export async function createExportCase(tenantId: number, userId: number, data: {
  buyerId: number;
  exportLcId?: number;
  bankAccountId?: number;
  issueDate?: string;
  expiryDate?: string;
  totalValue?: string;
  currency?: string;
  paymentMode?: string;
  expectedRealizationDays?: number;
  notes?: string;
}) {
  const exportCaseNumber = await generateExportCaseNumber(tenantId);
  const [ec] = await db.insert(exportCases).values({
    tenantId,
    exportCaseNumber,
    buyerId: data.buyerId,
    exportLcId: data.exportLcId || null,
    bankAccountId: data.bankAccountId || null,
    issueDate: data.issueDate || null,
    expiryDate: data.expiryDate || null,
    totalValue: data.totalValue || null,
    currency: data.currency || 'USD',
    status: 'DRAFT',
    paymentMode: data.paymentMode || null,
    expectedRealizationDays: data.expectedRealizationDays || null,
    notes: data.notes || null,
    createdBy: userId,
  }).returning();
  return ec;
}

export async function updateExportCase(tenantId: number, id: number, data: Partial<{
  buyerId: number;
  exportLcId: number;
  bankAccountId: number;
  issueDate: string;
  expiryDate: string;
  totalValue: string;
  currency: string;
  paymentMode: string;
  expectedRealizationDays: number;
  notes: string;
  status: string;
}>) {
  const [updated] = await db.update(exportCases)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(exportCases.id, id), eq(exportCases.tenantId, tenantId)))
    .returning();
  if (!updated) throw new Error('Export case not found');
  return updated;
}

export async function linkOrdersToCase(tenantId: number, exportCaseId: number, orderData: Array<{
  orderId: number;
  allocatedValue?: string;
  allocatedQuantity?: number;
  allocationMethod?: string;
}>) {
  const results = [];
  for (const od of orderData) {
    const [link] = await db.insert(exportCaseOrders).values({
      tenantId,
      exportCaseId,
      orderId: od.orderId,
      allocatedValue: od.allocatedValue || null,
      allocatedQuantity: od.allocatedQuantity || null,
      allocationMethod: od.allocationMethod || 'FOB_SHARE',
    }).onConflictDoNothing().returning();
    if (link) results.push(link);
  }
  return results;
}

export async function unlinkOrderFromCase(tenantId: number, exportCaseId: number, orderId: number) {
  await db.delete(exportCaseOrders)
    .where(and(
      eq(exportCaseOrders.exportCaseId, exportCaseId),
      eq(exportCaseOrders.orderId, orderId),
      eq(exportCaseOrders.tenantId, tenantId),
    ));
}

export async function linkLcToCase(tenantId: number, exportCaseId: number, lcId: number) {
  const [updated] = await db.update(exportCases)
    .set({ exportLcId: lcId, updatedAt: new Date() })
    .where(and(eq(exportCases.id, exportCaseId), eq(exportCases.tenantId, tenantId)))
    .returning();
  if (!updated) throw new Error('Export case not found');
  return updated;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['SHIPPED', 'CLOSED'],
  SHIPPED: ['DOCS_SUBMITTED'],
  DOCS_SUBMITTED: ['NEGOTIATED'],
  NEGOTIATED: ['SETTLED'],
  SETTLED: ['CLOSED'],
};

export async function updateStatus(tenantId: number, exportCaseId: number, newStatus: string) {
  const [current] = await db.select().from(exportCases)
    .where(and(eq(exportCases.id, exportCaseId), eq(exportCases.tenantId, tenantId)));
  if (!current) throw new Error('Export case not found');
  const allowed = STATUS_TRANSITIONS[current.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot transition from ${current.status} to ${newStatus}`);
  }
  const [updated] = await db.update(exportCases)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(exportCases.id, exportCaseId))
    .returning();
  return updated;
}

export async function getExportCaseDetail(tenantId: number, id: number) {
  const [ec] = await db.select().from(exportCases)
    .where(and(eq(exportCases.id, id), eq(exportCases.tenantId, tenantId)));
  if (!ec) throw new Error('Export case not found');

  const buyer = ec.buyerId ? await db.select().from(customers)
    .where(eq(customers.id, ec.buyerId)).then(r => r[0]) : null;

  const lc = ec.exportLcId ? await db.select().from(commercialLcs)
    .where(eq(commercialLcs.id, ec.exportLcId)).then(r => r[0]) : null;

  const linkedOrders = await db.select({
    link: exportCaseOrders,
    order: orders,
  })
    .from(exportCaseOrders)
    .innerJoin(orders, eq(exportCaseOrders.orderId, orders.id))
    .where(and(eq(exportCaseOrders.exportCaseId, id), eq(exportCaseOrders.tenantId, tenantId)));

  const pis = await db.select().from(proformaInvoices)
    .where(and(eq(proformaInvoices.exportCaseId, id), eq(proformaInvoices.tenantId, tenantId)));

  const btbs = await db.select().from(btbLcs)
    .where(and(eq(btbLcs.exportCaseId, id), eq(btbLcs.tenantId, tenantId)));

  const fxRecs = await db.select().from(fxReceipts)
    .where(and(eq(fxReceipts.exportCaseId, id), eq(fxReceipts.tenantId, tenantId)));

  return { ...ec, buyer, lc, linkedOrders, proformaInvoices: pis, btbLcs: btbs, fxReceipts: fxRecs };
}

export async function listExportCases(tenantId: number, filters?: { status?: string; buyerId?: number }) {
  let query = db.select({
    exportCase: exportCases,
    buyerName: customers.customerName,
    lcNumber: commercialLcs.lcNumber,
  })
    .from(exportCases)
    .leftJoin(customers, eq(exportCases.buyerId, customers.id))
    .leftJoin(commercialLcs, eq(exportCases.exportLcId, commercialLcs.id))
    .where(eq(exportCases.tenantId, tenantId))
    .orderBy(desc(exportCases.createdAt));

  const results = await query;

  let filtered = results;
  if (filters?.status) {
    filtered = filtered.filter(r => r.exportCase.status === filters.status);
  }
  if (filters?.buyerId) {
    filtered = filtered.filter(r => r.exportCase.buyerId === filters.buyerId);
  }

  return filtered.map(r => ({
    ...r.exportCase,
    buyerName: r.buyerName,
    lcNumber: r.lcNumber,
  }));
}
