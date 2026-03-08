import { db } from '../db';
import {
  commercialLcs, commercialDocuments, orders, shipmentDocChecklist
} from '@shared/schema';
import { shipments as shipmentsTable } from '../../shared/schema/commercial';
import { eq, and, sql, desc } from 'drizzle-orm';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';

const DEFAULT_SHIPMENT_DOCS = [
  { documentType: 'commercial_invoice', documentLabel: 'Commercial Invoice', isRequired: true },
  { documentType: 'packing_list', documentLabel: 'Packing List', isRequired: true },
  { documentType: 'bill_of_lading', documentLabel: 'Bill of Lading', isRequired: true },
  { documentType: 'certificate_of_origin', documentLabel: 'Certificate of Origin', isRequired: true },
  { documentType: 'gsp_form', documentLabel: 'GSP Form', isRequired: false },
  { documentType: 'inspection_certificate', documentLabel: 'Inspection Certificate', isRequired: true },
  { documentType: 'beneficiary_certificate', documentLabel: 'Beneficiary Certificate', isRequired: false },
  { documentType: 'customs_declaration', documentLabel: 'Customs Declaration', isRequired: true },
];

async function generateLcNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'LC',
    tableName: 'commercial_lcs',
    columnName: 'lc_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

async function generateShipmentNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'SHP',
    tableName: 'shipments',
    columnName: 'shipment_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

export async function createLC(
  tenantId: number,
  userId: number,
  data: {
    lcType: string;
    bankName?: string;
    issueDate?: string;
    expiryDate?: string;
    applicant?: string;
    beneficiary?: string;
    lcValue: string;
    currency?: string;
    linkedSalesOrderId?: number;
    linkedPurchaseOrderId?: number;
    remarks?: string;
  }
) {
  const lcNumber = await generateLcNumber(tenantId);

  const [lc] = await db.insert(commercialLcs).values({
    tenantId,
    lcNumber,
    lcType: data.lcType,
    bankName: data.bankName || null,
    issueDate: data.issueDate || null,
    expiryDate: data.expiryDate || null,
    applicant: data.applicant || null,
    beneficiary: data.beneficiary || null,
    lcValue: data.lcValue,
    currency: data.currency || 'BDT',
    linkedSalesOrderId: data.linkedSalesOrderId || null,
    linkedPurchaseOrderId: data.linkedPurchaseOrderId || null,
    status: 'DRAFT',
    amendmentCount: 0,
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();

  return lc;
}

export async function amendLC(
  tenantId: number,
  lcId: number,
  userId: number,
  data: {
    lcValue?: string;
    expiryDate?: string;
    applicant?: string;
    beneficiary?: string;
    bankName?: string;
    remarks?: string;
    overrideReason?: string;
  }
) {
  const [lc] = await db.select().from(commercialLcs)
    .where(and(eq(commercialLcs.id, lcId), eq(commercialLcs.tenantId, tenantId)));

  if (!lc) throw new Error('LC not found');
  if (lc.status !== 'ACTIVE') throw new Error('Only ACTIVE LCs can be amended');

  const changesValue = data.lcValue && data.lcValue !== lc.lcValue;
  const changesDate = data.expiryDate && data.expiryDate !== lc.expiryDate;
  const changesParty = (data.applicant && data.applicant !== lc.applicant) ||
    (data.beneficiary && data.beneficiary !== lc.beneficiary);

  if ((changesValue || changesDate || changesParty) && !data.overrideReason) {
    throw new Error('Override reason is required when changing value, date, or party');
  }

  const updateData: any = {
    amendmentCount: (lc.amendmentCount || 0) + 1,
    updatedAt: new Date(),
  };

  if (data.lcValue) updateData.lcValue = data.lcValue;
  if (data.expiryDate) updateData.expiryDate = data.expiryDate;
  if (data.applicant) updateData.applicant = data.applicant;
  if (data.beneficiary) updateData.beneficiary = data.beneficiary;
  if (data.bankName) updateData.bankName = data.bankName;
  if (data.remarks) updateData.remarks = data.remarks;

  const [updated] = await db.update(commercialLcs).set(updateData)
    .where(and(eq(commercialLcs.id, lcId), eq(commercialLcs.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function getLC(tenantId: number, lcId: number) {
  const [lc] = await db.select().from(commercialLcs)
    .where(and(eq(commercialLcs.id, lcId), eq(commercialLcs.tenantId, tenantId)));

  if (!lc) throw new Error('LC not found');
  return lc;
}

export async function listLCs(
  tenantId: number,
  filters: { status?: string; lcType?: string }
) {
  const conditions: any[] = [eq(commercialLcs.tenantId, tenantId)];

  if (filters.status) {
    conditions.push(eq(commercialLcs.status, filters.status));
  }
  if (filters.lcType) {
    conditions.push(eq(commercialLcs.lcType, filters.lcType));
  }

  return db.select().from(commercialLcs)
    .where(and(...conditions))
    .orderBy(desc(commercialLcs.createdAt));
}

export async function createCommercialDocument(
  tenantId: number,
  userId: number,
  data: {
    docType: string;
    docNumber: string;
    docDate: string;
    relatedType?: string;
    relatedId?: number;
    metadata?: any;
    attachments?: any;
    remarks?: string;
  }
) {
  const [doc] = await db.insert(commercialDocuments).values({
    tenantId,
    docType: data.docType,
    docNumber: data.docNumber,
    docDate: data.docDate,
    relatedType: data.relatedType || null,
    relatedId: data.relatedId || null,
    status: 'DRAFT',
    metadata: data.metadata || null,
    attachments: data.attachments || null,
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();

  return doc;
}

export async function approveCommercialDocument(tenantId: number, docId: number, userId: number) {
  const [doc] = await db.select().from(commercialDocuments)
    .where(and(eq(commercialDocuments.id, docId), eq(commercialDocuments.tenantId, tenantId)));

  if (!doc) throw new Error('Commercial document not found');
  if (doc.status !== 'DRAFT') throw new Error('Only DRAFT documents can be approved');

  const [updated] = await db.update(commercialDocuments).set({
    status: 'APPROVED',
    approvedBy: userId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(commercialDocuments.id, docId), eq(commercialDocuments.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function listCommercialDocuments(
  tenantId: number,
  filters: { status?: string; docType?: string; relatedType?: string; relatedId?: number }
) {
  const conditions: any[] = [eq(commercialDocuments.tenantId, tenantId)];

  if (filters.status) {
    conditions.push(eq(commercialDocuments.status, filters.status));
  }
  if (filters.docType) {
    conditions.push(eq(commercialDocuments.docType, filters.docType));
  }
  if (filters.relatedType) {
    conditions.push(eq(commercialDocuments.relatedType, filters.relatedType));
  }
  if (filters.relatedId) {
    conditions.push(eq(commercialDocuments.relatedId, filters.relatedId));
  }

  return db.select().from(commercialDocuments)
    .where(and(...conditions))
    .orderBy(desc(commercialDocuments.createdAt));
}

export async function createShipment(
  tenantId: number,
  userId: number,
  data: {
    salesOrderId?: number;
    mode: string;
    forwarder?: string;
    vesselOrFlight?: string;
    containerNumber?: string;
    etd?: string;
    eta?: string;
    portOfLoading?: string;
    portOfDischarge?: string;
    remarks?: string;
  }
) {
  const shipmentNumber = await generateShipmentNumber(tenantId);

  const result = await db.execute(sql`
    INSERT INTO shipments (tenant_id, shipment_number, sales_order_id, mode, forwarder,
      vessel_or_flight, container_number, etd, eta, port_of_loading, port_of_discharge,
      status, remarks, created_by, created_at, updated_at)
    VALUES (${tenantId}, ${shipmentNumber}, ${data.salesOrderId || null}, ${data.mode},
      ${data.forwarder || null}, ${data.vesselOrFlight || null}, ${data.containerNumber || null},
      ${data.etd || null}, ${data.eta || null}, ${data.portOfLoading || null},
      ${data.portOfDischarge || null}, 'PLANNED', ${data.remarks || null}, ${userId},
      NOW(), NOW())
    RETURNING *
  `);

  const shipment = result.rows[0] as any;

  await db.insert(shipmentDocChecklist).values(
    DEFAULT_SHIPMENT_DOCS.map(doc => ({
      tenantId,
      shipmentId: shipment.id,
      documentType: doc.documentType,
      documentLabel: doc.documentLabel,
      isRequired: doc.isRequired,
      isCompleted: false,
    }))
  );

  return shipment;
}

const SHIPMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  'PLANNED': ['BOOKED'],
  'BOOKED': ['SHIPPED'],
  'SHIPPED': ['DELIVERED'],
  'DELIVERED': ['CLOSED'],
};

export async function updateShipmentStatus(
  tenantId: number,
  shipmentId: number,
  newStatus: string,
  userId: number
) {
  const result = await db.execute(sql`
    SELECT * FROM shipments WHERE id = ${shipmentId} AND tenant_id = ${tenantId}
  `);

  const shipment = result.rows[0] as any;
  if (!shipment) throw new Error('Shipment not found');

  const currentStatus = shipment.status;
  const allowedTransitions = SHIPMENT_STATUS_TRANSITIONS[currentStatus];

  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowedTransitions?.join(', ') || 'none'}`);
  }

  if (newStatus === 'SHIPPED') {
    const checklistItems = await db.select().from(shipmentDocChecklist)
      .where(and(
        eq(shipmentDocChecklist.shipmentId, shipmentId),
        eq(shipmentDocChecklist.tenantId, tenantId),
        eq(shipmentDocChecklist.isRequired, true),
        eq(shipmentDocChecklist.isCompleted, false)
      ));
    if (checklistItems.length > 0) {
      const missing = checklistItems.map(i => i.documentLabel).join(', ');
      throw new Error(`Cannot ship: required documents incomplete — ${missing}`);
    }
  }

  const updateResult = await db.execute(sql`
    UPDATE shipments SET status = ${newStatus}, updated_at = NOW()
    WHERE id = ${shipmentId} AND tenant_id = ${tenantId}
    RETURNING *
  `);

  return updateResult.rows[0];
}

export async function getShipment(tenantId: number, shipmentId: number) {
  const result = await db.execute(sql`
    SELECT * FROM shipments WHERE id = ${shipmentId} AND tenant_id = ${tenantId}
  `);

  const shipment = result.rows[0];
  if (!shipment) throw new Error('Shipment not found');
  return shipment;
}

export async function getShipmentTrace(tenantId: number, shipmentId: number) {
  const result = await db.execute(sql`
    SELECT * FROM shipments WHERE id = ${shipmentId} AND tenant_id = ${tenantId}
  `);

  const shipment = result.rows[0] as any;
  if (!shipment) throw new Error('Shipment not found');

  const linkedDocs = await db.select().from(commercialDocuments)
    .where(and(
      eq(commercialDocuments.relatedType, 'SHIPMENT'),
      eq(commercialDocuments.relatedId, shipmentId),
      eq(commercialDocuments.tenantId, tenantId)
    ));

  let salesOrder = null;
  if (shipment.sales_order_id) {
    const [order] = await db.select().from(orders)
      .where(eq(orders.id, shipment.sales_order_id));
    salesOrder = order || null;
  }

  const timeline = {
    created: shipment.created_at,
    planned: shipment.status === 'PLANNED' || ['BOOKED', 'SHIPPED', 'DELIVERED', 'CLOSED'].includes(shipment.status) ? shipment.created_at : null,
    booked: ['BOOKED', 'SHIPPED', 'DELIVERED', 'CLOSED'].includes(shipment.status) ? shipment.updated_at : null,
    shipped: ['SHIPPED', 'DELIVERED', 'CLOSED'].includes(shipment.status) ? shipment.updated_at : null,
    delivered: ['DELIVERED', 'CLOSED'].includes(shipment.status) ? shipment.updated_at : null,
    closed: shipment.status === 'CLOSED' ? shipment.updated_at : null,
  };

  return {
    shipment,
    linkedDocuments: linkedDocs,
    salesOrder,
    timeline,
  };
}

export async function listShipments(
  tenantId: number,
  filters: { status?: string; mode?: string }
) {
  const conditions: any[] = [eq(shipmentsTable.tenantId, tenantId)];

  if (filters.status) {
    conditions.push(eq(shipmentsTable.status, filters.status));
  }
  if (filters.mode) {
    conditions.push(eq(shipmentsTable.shipmentMode, filters.mode));
  }

  return db.select()
    .from(shipmentsTable)
    .where(and(...conditions))
    .orderBy(desc(shipmentsTable.createdAt));
}

export async function getShipmentChecklist(tenantId: number, shipmentId: number) {
  return db.select().from(shipmentDocChecklist)
    .where(and(
      eq(shipmentDocChecklist.shipmentId, shipmentId),
      eq(shipmentDocChecklist.tenantId, tenantId)
    ));
}

export async function updateChecklistItem(
  tenantId: number,
  itemId: number,
  userId: number,
  data: { isCompleted?: boolean; documentUrl?: string; notes?: string }
) {
  const [item] = await db.select().from(shipmentDocChecklist)
    .where(and(
      eq(shipmentDocChecklist.id, itemId),
      eq(shipmentDocChecklist.tenantId, tenantId)
    ));
  if (!item) throw new Error('Checklist item not found');

  const updateData: any = {};
  if (data.isCompleted !== undefined) {
    updateData.isCompleted = data.isCompleted;
    updateData.completedAt = data.isCompleted ? new Date() : null;
    updateData.completedBy = data.isCompleted ? userId : null;
  }
  if (data.documentUrl !== undefined) updateData.documentUrl = data.documentUrl;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const [updated] = await db.update(shipmentDocChecklist).set(updateData)
    .where(and(
      eq(shipmentDocChecklist.id, itemId),
      eq(shipmentDocChecklist.tenantId, tenantId)
    ))
    .returning();

  return updated;
}
