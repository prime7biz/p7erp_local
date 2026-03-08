import { db } from '../db';
import { btbLcs, btbLcDocuments, vendors, commercialLcs, exportCases } from '@shared/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';

async function generateBtbLcNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'BTB',
    tableName: 'btb_lcs',
    columnName: 'btb_lc_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

export async function createBtbLc(tenantId: number, userId: number, data: {
  exportCaseId?: number;
  masterLcId?: number;
  supplierId?: number;
  bankAccountId?: number;
  amount: string;
  currency?: string;
  openDate?: string;
  expiryDate?: string;
  maturityDate?: string;
  maturityAmount?: string;
  purchaseOrderId?: number;
  remarks?: string;
}) {
  const btbLcNumber = await generateBtbLcNumber(tenantId);
  const [btb] = await db.insert(btbLcs).values({
    tenantId,
    btbLcNumber,
    exportCaseId: data.exportCaseId || null,
    masterLcId: data.masterLcId || null,
    supplierId: data.supplierId || null,
    bankAccountId: data.bankAccountId || null,
    amount: data.amount,
    currency: data.currency || 'USD',
    openDate: data.openDate || null,
    expiryDate: data.expiryDate || null,
    maturityDate: data.maturityDate || null,
    maturityAmount: data.maturityAmount || null,
    purchaseOrderId: data.purchaseOrderId || null,
    status: 'DRAFT',
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();
  return btb;
}

export async function updateBtbLc(tenantId: number, id: number, data: Partial<{
  exportCaseId: number;
  masterLcId: number;
  supplierId: number;
  bankAccountId: number;
  amount: string;
  currency: string;
  openDate: string;
  expiryDate: string;
  maturityDate: string;
  maturityAmount: string;
  acceptanceDate: string;
  purchaseOrderId: number;
  status: string;
  remarks: string;
}>) {
  const [updated] = await db.update(btbLcs)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(btbLcs.id, id), eq(btbLcs.tenantId, tenantId)))
    .returning();
  if (!updated) throw new Error('BTB LC not found');
  return updated;
}

export async function receiveDocument(tenantId: number, btbLcId: number, docData: {
  documentType: string;
  documentNumber?: string;
  documentDate?: string;
  amount?: string;
  receivedDate?: string;
  discrepancyNotes?: string;
  status?: string;
}) {
  const [doc] = await db.insert(btbLcDocuments).values({
    tenantId,
    btbLcId,
    documentType: docData.documentType,
    documentNumber: docData.documentNumber || null,
    documentDate: docData.documentDate || null,
    amount: docData.amount || null,
    receivedDate: docData.receivedDate || new Date().toISOString().split('T')[0],
    discrepancyNotes: docData.discrepancyNotes || null,
    status: docData.status || 'RECEIVED',
  }).returning();
  return doc;
}

export async function getBtbLcDetail(tenantId: number, id: number) {
  const [btb] = await db.select().from(btbLcs)
    .where(and(eq(btbLcs.id, id), eq(btbLcs.tenantId, tenantId)));
  if (!btb) throw new Error('BTB LC not found');

  const documents = await db.select().from(btbLcDocuments)
    .where(and(eq(btbLcDocuments.btbLcId, id), eq(btbLcDocuments.tenantId, tenantId)));

  const supplier = btb.supplierId ? await db.select().from(vendors)
    .where(eq(vendors.id, btb.supplierId)).then(r => r[0]) : null;

  const masterLc = btb.masterLcId ? await db.select().from(commercialLcs)
    .where(eq(commercialLcs.id, btb.masterLcId)).then(r => r[0]) : null;

  const exportCase = btb.exportCaseId ? await db.select().from(exportCases)
    .where(eq(exportCases.id, btb.exportCaseId)).then(r => r[0]) : null;

  const daysToMaturity = btb.maturityDate
    ? Math.ceil((new Date(btb.maturityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return { ...btb, documents, supplier, masterLc, exportCase, daysToMaturity };
}

export async function listBtbLcs(tenantId: number, filters?: { status?: string; exportCaseId?: number }) {
  const results = await db.select({
    btbLc: btbLcs,
    supplierName: vendors.vendorName,
  })
    .from(btbLcs)
    .leftJoin(vendors, eq(btbLcs.supplierId, vendors.id))
    .where(eq(btbLcs.tenantId, tenantId))
    .orderBy(desc(btbLcs.createdAt));

  let filtered = results;
  if (filters?.status) filtered = filtered.filter(r => r.btbLc.status === filters.status);
  if (filters?.exportCaseId) filtered = filtered.filter(r => r.btbLc.exportCaseId === filters.exportCaseId);

  return filtered.map(r => {
    const daysToMaturity = r.btbLc.maturityDate
      ? Math.ceil((new Date(r.btbLc.maturityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
    return { ...r.btbLc, supplierName: r.supplierName, daysToMaturity };
  });
}

export async function getMaturityCalendar(tenantId: number, startDate: string, endDate: string) {
  const results = await db.select({
    btbLc: btbLcs,
    supplierName: vendors.vendorName,
  })
    .from(btbLcs)
    .leftJoin(vendors, eq(btbLcs.supplierId, vendors.id))
    .where(and(
      eq(btbLcs.tenantId, tenantId),
      sql`${btbLcs.maturityDate} >= ${startDate}`,
      sql`${btbLcs.maturityDate} <= ${endDate}`,
    ))
    .orderBy(btbLcs.maturityDate);

  return results.map(r => ({
    ...r.btbLc,
    supplierName: r.supplierName,
    daysToMaturity: r.btbLc.maturityDate
      ? Math.ceil((new Date(r.btbLc.maturityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null,
  }));
}

export async function getAlerts(tenantId: number) {
  const now = new Date();
  const d7 = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];
  const d14 = new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0];
  const d30 = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const upcoming = await db.select().from(btbLcs)
    .where(and(
      eq(btbLcs.tenantId, tenantId),
      sql`${btbLcs.maturityDate} >= ${today}`,
      sql`${btbLcs.maturityDate} <= ${d30}`,
      sql`${btbLcs.status} NOT IN ('PAID', 'SETTLED')`,
    ))
    .orderBy(btbLcs.maturityDate);

  return upcoming.map(btb => {
    const days = btb.maturityDate
      ? Math.ceil((new Date(btb.maturityDate).getTime() - now.getTime()) / 86400000)
      : 999;
    return {
      ...btb,
      daysToMaturity: days,
      severity: days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'info',
    };
  });
}
