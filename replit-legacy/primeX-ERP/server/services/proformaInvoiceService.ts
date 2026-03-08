import { db } from '../db';
import { proformaInvoices, proformaInvoiceLines, orders, customers, styles } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';

async function generatePiNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'PI',
    tableName: 'proforma_invoices',
    columnName: 'pi_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

export async function createPI(tenantId: number, userId: number, data: {
  customerId: number;
  orderId?: number;
  inquiryId?: number;
  issueDate: string;
  validityDate?: string;
  currency?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  incoterm?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  notes?: string;
}) {
  const piNumber = await generatePiNumber(tenantId);
  const [pi] = await db.insert(proformaInvoices).values({
    tenantId,
    piNumber,
    customerId: data.customerId,
    orderId: data.orderId || null,
    inquiryId: data.inquiryId || null,
    issueDate: data.issueDate,
    validityDate: data.validityDate || null,
    totalAmount: '0',
    currency: data.currency || 'USD',
    paymentTerms: data.paymentTerms || null,
    deliveryTerms: data.deliveryTerms || null,
    incoterm: data.incoterm || null,
    portOfLoading: data.portOfLoading || null,
    portOfDischarge: data.portOfDischarge || null,
    notes: data.notes || null,
    status: 'DRAFT',
    createdBy: userId,
  }).returning();
  return pi;
}

export async function updatePI(tenantId: number, id: number, data: Partial<{
  customerId: number;
  orderId: number;
  inquiryId: number;
  issueDate: string;
  validityDate: string;
  currency: string;
  paymentTerms: string;
  deliveryTerms: string;
  incoterm: string;
  portOfLoading: string;
  portOfDischarge: string;
  notes: string;
  status: string;
  totalAmount: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
}>) {
  const [updated] = await db.update(proformaInvoices)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(proformaInvoices.id, id), eq(proformaInvoices.tenantId, tenantId)))
    .returning();
  if (!updated) throw new Error('Proforma Invoice not found');
  return updated;
}

export async function addLinesToPI(tenantId: number, piId: number, lines: Array<{
  orderId?: number;
  orderLineId?: number;
  styleId?: number;
  description?: string;
  hsCode?: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  remarks?: string;
}>) {
  const results = [];
  for (const line of lines) {
    const [inserted] = await db.insert(proformaInvoiceLines).values({
      tenantId,
      proformaInvoiceId: piId,
      orderId: line.orderId || null,
      orderLineId: line.orderLineId || null,
      styleId: line.styleId || null,
      description: line.description || null,
      hsCode: line.hsCode || null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      totalAmount: line.totalAmount,
      remarks: line.remarks || null,
    }).returning();
    results.push(inserted);
  }

  const allLines = await db.select().from(proformaInvoiceLines)
    .where(eq(proformaInvoiceLines.proformaInvoiceId, piId));
  const total = allLines.reduce((sum, l) => sum + parseFloat(l.totalAmount || '0'), 0);
  await db.update(proformaInvoices)
    .set({ totalAmount: total.toFixed(2), updatedAt: new Date() })
    .where(eq(proformaInvoices.id, piId));

  return results;
}

export async function addOrderLinesToPI(tenantId: number, piId: number, orderIds: number[]) {
  const orderList = await db.select().from(orders)
    .where(and(eq(orders.tenantId, tenantId)));
  const matching = orderList.filter(o => orderIds.includes(o.id));
  
  const lines = matching.map(o => ({
    orderId: o.id,
    styleId: o.styleId || undefined,
    description: `${o.styleName} - Order ${o.orderId}`,
    quantity: o.totalQuantity,
    unitPrice: o.priceConfirmed || '0',
    totalAmount: (o.totalQuantity * parseFloat(o.priceConfirmed || '0')).toFixed(2),
  }));
  return addLinesToPI(tenantId, piId, lines);
}

export async function removeLineFromPI(tenantId: number, lineId: number) {
  const [line] = await db.select().from(proformaInvoiceLines)
    .where(and(eq(proformaInvoiceLines.id, lineId), eq(proformaInvoiceLines.tenantId, tenantId)));
  if (!line) throw new Error('Line not found');

  await db.delete(proformaInvoiceLines).where(eq(proformaInvoiceLines.id, lineId));

  const allLines = await db.select().from(proformaInvoiceLines)
    .where(eq(proformaInvoiceLines.proformaInvoiceId, line.proformaInvoiceId));
  const total = allLines.reduce((sum, l) => sum + parseFloat(l.totalAmount || '0'), 0);
  await db.update(proformaInvoices)
    .set({ totalAmount: total.toFixed(2), updatedAt: new Date() })
    .where(eq(proformaInvoices.id, line.proformaInvoiceId));
}

export async function linkToExportCase(tenantId: number, piId: number, exportCaseId: number) {
  return getPIDetail(tenantId, piId);
}

export async function getPIDetail(tenantId: number, id: number) {
  const [pi] = await db.select().from(proformaInvoices)
    .where(and(eq(proformaInvoices.id, id), eq(proformaInvoices.tenantId, tenantId)));
  if (!pi) throw new Error('Proforma Invoice not found');

  const lines = await db.select().from(proformaInvoiceLines)
    .where(eq(proformaInvoiceLines.proformaInvoiceId, id));

  const buyer = await db.select().from(customers)
    .where(eq(customers.id, pi.customerId)).then(r => r[0]);

  return { ...pi, lines, buyer };
}

export async function listPIs(tenantId: number, filters?: { status?: string; customerId?: number }) {
  const results = await db.select({
    pi: proformaInvoices,
    buyerName: customers.customerName,
  })
    .from(proformaInvoices)
    .leftJoin(customers, eq(proformaInvoices.customerId, customers.id))
    .where(eq(proformaInvoices.tenantId, tenantId))
    .orderBy(desc(proformaInvoices.createdAt));

  let filtered = results;
  if (filters?.status) filtered = filtered.filter(r => r.pi.status === filters.status);
  if (filters?.customerId) filtered = filtered.filter(r => r.pi.customerId === filters.customerId);

  return filtered.map(r => ({ ...r.pi, buyerName: r.buyerName }));
}
