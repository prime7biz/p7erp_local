import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  sampleRequests, sampleVersions, sampleBomSnapshots, sampleMaterialRequests,
  sampleMaterialRequestLines, sampleActivityLog, styleBoms, styleBomLines,
  customers, inventoryMovements
} from '@shared/schema';

class ERPError extends Error {
  code: string;
  httpStatus: number;
  details?: any;
  constructor(code: string, message: string, httpStatus: number = 400, details?: any) {
    super(message);
    this.name = 'ERPError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  'DRAFT': ['SUBMITTED'],
  'SUBMITTED': ['APPROVED'],
  'APPROVED': ['IN_PROGRESS'],
  'IN_PROGRESS': ['SENT_TO_BUYER'],
  'SENT_TO_BUYER': ['REVISION_REQUIRED', 'APPROVED_BY_BUYER'],
  'REVISION_REQUIRED': ['IN_PROGRESS'],
  'APPROVED_BY_BUYER': ['CLOSED'],
};

function validateTransition(currentStatus: string, newStatus: string, allowCloseOverride = false) {
  if (newStatus === 'CLOSED' && allowCloseOverride) return;
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new ERPError(
      'INVALID_STATUS_TRANSITION',
      `Cannot transition from ${currentStatus} to ${newStatus}`,
      400,
      { currentStatus, requestedStatus: newStatus, allowedTransitions: allowed || [] }
    );
  }
}

async function logActivity(
  tenantId: number,
  sampleRequestId: number,
  action: string,
  fromStatus: string | null,
  toStatus: string | null,
  performedBy: number,
  metadata?: any
) {
  await db.insert(sampleActivityLog).values({
    tenantId,
    sampleRequestId,
    action,
    fromStatus,
    toStatus,
    performedBy,
    metadata: metadata || null,
  });
}

async function getRequest(tenantId: number, requestId: number) {
  const [request] = await db.select().from(sampleRequests).where(
    and(eq(sampleRequests.id, requestId), eq(sampleRequests.tenantId, tenantId))
  );
  if (!request) throw new ERPError('NOT_FOUND', 'Sample request not found', 404);
  return request;
}

export async function createSampleRequest(tenantId: number, data: any) {
  const requestNumber = `SMP-${Date.now()}`;

  const [request] = await db.insert(sampleRequests).values({
    tenantId,
    requestNumber,
    customerId: data.buyerId || data.customerId || null,
    sampleTypeId: data.sampleTypeId || null,
    inquiryId: data.enquiryId || data.inquiryId || null,
    orderId: data.salesOrderId || data.orderId || null,
    styleName: data.styleName || null,
    styleCode: data.styleCode || null,
    department: data.department || null,
    quantity: data.qty || data.quantity || 1,
    requestDate: data.requestDate || new Date().toISOString().split('T')[0],
    requiredDate: data.requiredDate || null,
    priority: data.priority || 'normal',
    status: 'requested',
    assignedTo: data.assignedToUserId || data.assignedTo || null,
    createdBy: data.createdBy || null,
    internalNotes: data.notes || data.internalNotes || null,
  }).returning();

  await logActivity(tenantId, request.id, 'CREATED', null, 'DRAFT', data.createdBy || 0);

  return request;
}

export async function submitSampleRequest(tenantId: number, requestId: number, userId: number) {
  const request = await getRequest(tenantId, requestId);
  validateTransition(request.status, 'SUBMITTED');

  const [updated] = await db.update(sampleRequests)
    .set({ status: 'SUBMITTED', updatedAt: new Date() })
    .where(and(eq(sampleRequests.id, requestId), eq(sampleRequests.tenantId, tenantId)))
    .returning();

  await logActivity(tenantId, requestId, 'SUBMITTED', request.status, 'SUBMITTED', userId);
  return updated;
}

export async function approveSampleRequest(tenantId: number, requestId: number, userId: number) {
  const request = await getRequest(tenantId, requestId);
  validateTransition(request.status, 'APPROVED');

  const [updated] = await db.update(sampleRequests)
    .set({ status: 'APPROVED', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(sampleRequests.id, requestId), eq(sampleRequests.tenantId, tenantId)))
    .returning();

  await logActivity(tenantId, requestId, 'APPROVED', request.status, 'APPROVED', userId);
  return updated;
}

export async function startSampleRequest(tenantId: number, requestId: number, userId: number) {
  const request = await getRequest(tenantId, requestId);
  validateTransition(request.status, 'IN_PROGRESS');

  const [updated] = await db.update(sampleRequests)
    .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
    .where(and(eq(sampleRequests.id, requestId), eq(sampleRequests.tenantId, tenantId)))
    .returning();

  await logActivity(tenantId, requestId, 'STARTED', request.status, 'IN_PROGRESS', userId);
  return updated;
}

export async function sendSample(tenantId: number, requestId: number, userId: number, comments?: string) {
  const request = await getRequest(tenantId, requestId);
  validateTransition(request.status, 'SENT_TO_BUYER');

  const existingVersions = await db.select({ maxV: sql<number>`COALESCE(MAX(${sampleVersions.versionNo}), 0)` })
    .from(sampleVersions)
    .where(and(eq(sampleVersions.tenantId, tenantId), eq(sampleVersions.sampleRequestId, requestId)));
  const nextVersion = (existingVersions[0]?.maxV || 0) + 1;

  const [version] = await db.insert(sampleVersions).values({
    tenantId,
    sampleRequestId: requestId,
    versionNo: nextVersion,
    status: 'SENT',
    internalComments: comments || null,
  }).returning();

  const [updated] = await db.update(sampleRequests)
    .set({ status: 'SENT_TO_BUYER', updatedAt: new Date() })
    .where(and(eq(sampleRequests.id, requestId), eq(sampleRequests.tenantId, tenantId)))
    .returning();

  await logActivity(tenantId, requestId, 'SENT_TO_BUYER', request.status, 'SENT_TO_BUYER', userId, { versionNo: nextVersion, comments });
  return { request: updated, version };
}

export async function recordFeedback(
  tenantId: number,
  requestId: number,
  userId: number,
  data: { buyerComments?: string; internalComments?: string; accepted: boolean }
) {
  const request = await getRequest(tenantId, requestId);
  const newStatus = data.accepted ? 'APPROVED_BY_BUYER' : 'REVISION_REQUIRED';
  validateTransition(request.status, newStatus);

  const existingVersions = await db.select({ maxV: sql<number>`COALESCE(MAX(${sampleVersions.versionNo}), 0)` })
    .from(sampleVersions)
    .where(and(eq(sampleVersions.tenantId, tenantId), eq(sampleVersions.sampleRequestId, requestId)));
  const nextVersion = (existingVersions[0]?.maxV || 0) + 1;

  const [version] = await db.insert(sampleVersions).values({
    tenantId,
    sampleRequestId: requestId,
    versionNo: nextVersion,
    status: data.accepted ? 'APPROVED' : 'REJECTED',
    buyerComments: data.buyerComments || null,
    internalComments: data.internalComments || null,
  }).returning();

  const [updated] = await db.update(sampleRequests)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(sampleRequests.id, requestId), eq(sampleRequests.tenantId, tenantId)))
    .returning();

  await logActivity(tenantId, requestId, data.accepted ? 'BUYER_APPROVED' : 'BUYER_REJECTED', request.status, newStatus, userId, {
    buyerComments: data.buyerComments,
    accepted: data.accepted,
    versionNo: nextVersion,
  });

  return { request: updated, version };
}

export async function closeSampleRequest(tenantId: number, requestId: number, userId: number) {
  const request = await getRequest(tenantId, requestId);
  validateTransition(request.status, 'CLOSED', true);

  const [updated] = await db.update(sampleRequests)
    .set({ status: 'CLOSED', updatedAt: new Date() })
    .where(and(eq(sampleRequests.id, requestId), eq(sampleRequests.tenantId, tenantId)))
    .returning();

  await logActivity(tenantId, requestId, 'CLOSED', request.status, 'CLOSED', userId);
  return updated;
}

export async function listSampleRequests(
  tenantId: number,
  filters?: { sampleType?: string; status?: string; buyerId?: number; styleId?: number }
) {
  let conditions = [eq(sampleRequests.tenantId, tenantId)];

  if (filters?.status) conditions.push(eq(sampleRequests.status, filters.status));
  if (filters?.buyerId) conditions.push(eq(sampleRequests.customerId, filters.buyerId));

  const results = await db.select({
    request: sampleRequests,
    buyerName: customers.customerName,
  })
    .from(sampleRequests)
    .leftJoin(customers, eq(sampleRequests.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(desc(sampleRequests.createdAt));

  return results.map(r => ({
    ...r.request,
    buyerName: r.buyerName,
    styleNo: r.request.styleCode || r.request.styleName,
  }));
}

export async function getSampleRequestDetail(tenantId: number, requestId: number) {
  const [result] = await db.select({
    request: sampleRequests,
    buyerName: customers.customerName,
  })
    .from(sampleRequests)
    .leftJoin(customers, eq(sampleRequests.customerId, customers.id))
    .where(and(eq(sampleRequests.id, requestId), eq(sampleRequests.tenantId, tenantId)));

  if (!result) throw new ERPError('NOT_FOUND', 'Sample request not found', 404);

  const versions = await db.select().from(sampleVersions)
    .where(and(eq(sampleVersions.sampleRequestId, requestId), eq(sampleVersions.tenantId, tenantId)))
    .orderBy(desc(sampleVersions.versionNo));

  const activityLog = await db.select().from(sampleActivityLog)
    .where(and(eq(sampleActivityLog.sampleRequestId, requestId), eq(sampleActivityLog.tenantId, tenantId)))
    .orderBy(desc(sampleActivityLog.createdAt));

  return {
    ...result.request,
    buyerName: result.buyerName,
    styleNo: result.request.styleCode || result.request.styleName,
    versions,
    activityLog,
  };
}

export async function lockSampleBom(tenantId: number, requestId: number, styleBomId: number, userId: number) {
  await getRequest(tenantId, requestId);

  const [bom] = await db.select().from(styleBoms).where(
    and(eq(styleBoms.id, styleBomId), eq(styleBoms.tenantId, tenantId))
  );
  if (!bom) throw new ERPError('NOT_FOUND', 'Style BOM not found', 404);

  const bomLines = await db.select().from(styleBomLines).where(eq(styleBomLines.styleBomId, styleBomId));

  const snapshot = {
    bomId: bom.id,
    styleId: bom.styleId,
    versionNo: bom.versionNo,
    lines: bomLines,
  };

  const [snap] = await db.insert(sampleBomSnapshots).values({
    tenantId,
    sampleRequestId: requestId,
    sourceStyleBomId: styleBomId,
    sourceVersionNo: bom.versionNo,
    snapshot,
    lockedBy: userId,
  }).returning();

  await logActivity(tenantId, requestId, 'BOM_LOCKED', null, null, userId, { styleBomId, versionNo: bom.versionNo });
  return snap;
}

export async function createMaterialRequest(
  tenantId: number,
  requestId: number,
  lines: Array<{ itemId: number; qty: number; uom: string; warehouseId: number }>,
  requestIdKey?: string
) {
  await getRequest(tenantId, requestId);

  if (requestIdKey) {
    const [existing] = await db.select().from(sampleMaterialRequests).where(
      and(eq(sampleMaterialRequests.tenantId, tenantId), eq(sampleMaterialRequests.requestId, requestIdKey))
    );
    if (existing) return existing;
  }

  const [matReq] = await db.insert(sampleMaterialRequests).values({
    tenantId,
    sampleRequestId: requestId,
    status: 'DRAFT',
    requestId: requestIdKey || null,
  }).returning();

  if (lines.length > 0) {
    await db.insert(sampleMaterialRequestLines).values(
      lines.map(l => ({
        tenantId,
        sampleMaterialRequestId: matReq.id,
        itemId: l.itemId,
        qty: String(l.qty),
        uom: l.uom,
        warehouseId: l.warehouseId,
      }))
    );
  }

  await logActivity(tenantId, requestId, 'MATERIAL_REQUEST_CREATED', null, null, 0, { materialRequestId: matReq.id, lineCount: lines.length });
  return matReq;
}

export async function approveMaterialRequest(tenantId: number, materialRequestId: number, userId: number) {
  const [matReq] = await db.select().from(sampleMaterialRequests).where(
    and(eq(sampleMaterialRequests.id, materialRequestId), eq(sampleMaterialRequests.tenantId, tenantId))
  );
  if (!matReq) throw new ERPError('NOT_FOUND', 'Material request not found', 404);
  if (matReq.status !== 'DRAFT') throw new ERPError('INVALID_STATUS', 'Material request must be in DRAFT status to approve');

  const [updated] = await db.update(sampleMaterialRequests)
    .set({ status: 'APPROVED', approvedBy: userId, updatedAt: new Date() })
    .where(and(eq(sampleMaterialRequests.id, materialRequestId), eq(sampleMaterialRequests.tenantId, tenantId)))
    .returning();

  await logActivity(tenantId, matReq.sampleRequestId, 'MATERIAL_REQUEST_APPROVED', 'DRAFT', 'APPROVED', userId, { materialRequestId });
  return updated;
}

export async function issueMaterial(tenantId: number, materialRequestId: number, userId: number, requestIdKey: string) {
  const [existing] = await db.select().from(sampleMaterialRequests).where(
    and(eq(sampleMaterialRequests.tenantId, tenantId), eq(sampleMaterialRequests.requestId, requestIdKey))
  );
  if (existing && existing.status === 'ISSUED') {
    return { alreadyIssued: true, materialRequest: existing };
  }

  const [matReq] = await db.select().from(sampleMaterialRequests).where(
    and(eq(sampleMaterialRequests.id, materialRequestId), eq(sampleMaterialRequests.tenantId, tenantId))
  );
  if (!matReq) throw new ERPError('NOT_FOUND', 'Material request not found', 404);
  if (matReq.status !== 'APPROVED') throw new ERPError('INVALID_STATUS', 'Material request must be APPROVED before issuing');

  const lines = await db.select().from(sampleMaterialRequestLines).where(
    eq(sampleMaterialRequestLines.sampleMaterialRequestId, materialRequestId)
  );

  const missingItems: Array<{ itemId: number | null; required: string; available: string }> = [];

  for (const line of lines) {
    const stockResult = await db.select({
      totalIn: sql<string>`COALESCE(SUM(CASE WHEN type = 'receive' THEN CAST((additional_data->>'quantity') AS numeric) ELSE 0 END), 0)`,
      totalOut: sql<string>`COALESCE(SUM(CASE WHEN type = 'issue' THEN CAST((additional_data->>'quantity') AS numeric) ELSE 0 END), 0)`,
    })
      .from(inventoryMovements)
      .where(and(
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.status, 'processed'),
        line.warehouseId ? eq(inventoryMovements.warehouseId, line.warehouseId) : sql`TRUE`
      ));

    const available = Number(stockResult[0]?.totalIn || 0) - Number(stockResult[0]?.totalOut || 0);
    const required = Number(line.qty);

    if (available < required) {
      missingItems.push({ itemId: line.itemId, required: line.qty, available: String(available) });
    }
  }

  if (missingItems.length > 0) {
    return { code: 'STOCK_INSUFFICIENT', missingItems };
  }

  const [updated] = await db.update(sampleMaterialRequests)
    .set({ status: 'ISSUED', requestId: requestIdKey, updatedAt: new Date() })
    .where(and(eq(sampleMaterialRequests.id, materialRequestId), eq(sampleMaterialRequests.tenantId, tenantId)))
    .returning();

  await logActivity(tenantId, matReq.sampleRequestId, 'MATERIAL_ISSUED', 'APPROVED', 'ISSUED', userId, { materialRequestId });
  return { materialRequest: updated };
}

export async function getSampleTrace(tenantId: number, requestId: number) {
  const request = await getRequest(tenantId, requestId);

  const [versions, bomSnapshots, materialRequests, activityLog] = await Promise.all([
    db.select().from(sampleVersions)
      .where(and(eq(sampleVersions.sampleRequestId, requestId), eq(sampleVersions.tenantId, tenantId)))
      .orderBy(desc(sampleVersions.versionNo)),
    db.select().from(sampleBomSnapshots)
      .where(and(eq(sampleBomSnapshots.sampleRequestId, requestId), eq(sampleBomSnapshots.tenantId, tenantId))),
    db.select().from(sampleMaterialRequests)
      .where(and(eq(sampleMaterialRequests.sampleRequestId, requestId), eq(sampleMaterialRequests.tenantId, tenantId))),
    db.select().from(sampleActivityLog)
      .where(and(eq(sampleActivityLog.sampleRequestId, requestId), eq(sampleActivityLog.tenantId, tenantId)))
      .orderBy(desc(sampleActivityLog.createdAt)),
  ]);

  const materialRequestsWithLines = await Promise.all(
    materialRequests.map(async (mr) => {
      const lines = await db.select().from(sampleMaterialRequestLines)
        .where(eq(sampleMaterialRequestLines.sampleMaterialRequestId, mr.id));
      return { ...mr, lines };
    })
  );

  return {
    request,
    versions,
    bomSnapshots,
    materialRequests: materialRequestsWithLines,
    activityLog,
  };
}
