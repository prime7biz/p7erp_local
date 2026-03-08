import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  styles, costings, quotations, inquiries, customers, auditLogs,
  styleComponents, styleColorways, styleSizeScales,
  styleBoms, orderDeliveryLines, orders, rmRequirementLines,
  sampleRequests, shipments, productionOrders, users,
  type InsertStyleComponent, type InsertStyleColorway, type InsertStyleSizeScale,
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

const VALID_MERCH_STATUSES = ['DRAFT', 'SUBMITTED', 'NEGOTIATING', 'WON', 'LOST'] as const;
const IMMUTABLE_QUOTATION_STATUSES = ['APPROVED', 'ACCEPTED', 'REVISED'] as const;

// ============================================================================
// ENQUIRY MANAGEMENT
// ============================================================================

export async function submitEnquiry(tenantId: number, enquiryId: number, userId: number) {
  const [inquiry] = await db.select().from(inquiries).where(
    and(eq(inquiries.id, enquiryId), eq(inquiries.tenantId, tenantId))
  );

  if (!inquiry) {
    throw new ERPError('NOT_FOUND', 'Enquiry not found', 404);
  }

  if (inquiry.status !== 'new' && inquiry.status !== 'DRAFT') {
    throw new ERPError('INVALID_STATE_TRANSITION', `Cannot submit enquiry with status '${inquiry.status}'. Must be 'new' or 'DRAFT'.`);
  }

  const [updated] = await db.update(inquiries)
    .set({ status: 'SUBMITTED', updatedAt: new Date() })
    .where(and(eq(inquiries.id, enquiryId), eq(inquiries.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function updateEnquiryMerchStatus(tenantId: number, enquiryId: number, status: string, userId: number) {
  if (!VALID_MERCH_STATUSES.includes(status as any)) {
    throw new ERPError('INVALID_STATUS', `Invalid status '${status}'. Valid statuses: ${VALID_MERCH_STATUSES.join(', ')}`);
  }

  const [inquiry] = await db.select().from(inquiries).where(
    and(eq(inquiries.id, enquiryId), eq(inquiries.tenantId, tenantId))
  );

  if (!inquiry) {
    throw new ERPError('NOT_FOUND', 'Enquiry not found', 404);
  }

  const [updated] = await db.update(inquiries)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(inquiries.id, enquiryId), eq(inquiries.tenantId, tenantId)))
    .returning();

  return updated;
}

// ============================================================================
// STYLE MANAGEMENT
// ============================================================================

export async function createStyle(tenantId: number, data: any) {
  const [existing] = await db.select().from(styles).where(
    and(eq(styles.tenantId, tenantId), eq(styles.styleNo, data.styleNo))
  );

  if (existing) {
    throw new ERPError('DUPLICATE', `Style with styleNo '${data.styleNo}' already exists`);
  }

  const [style] = await db.insert(styles).values({
    ...data,
    tenantId,
  }).returning();

  return style;
}

export async function listStyles(tenantId: number, filters?: { buyerId?: number; status?: string }) {
  const conditions = [eq(styles.tenantId, tenantId)];

  if (filters?.buyerId) {
    conditions.push(eq(styles.buyerId, filters.buyerId));
  }
  if (filters?.status) {
    conditions.push(eq(styles.status, filters.status));
  }

  const result = await db.select({
    style: styles,
    buyerName: customers.customerName,
  })
    .from(styles)
    .leftJoin(customers, eq(styles.buyerId, customers.id))
    .where(and(...conditions))
    .orderBy(desc(styles.createdAt));

  return result.map(r => ({ ...r.style, buyerName: r.buyerName }));
}

export async function getStyleById(tenantId: number, styleId: number) {
  const [result] = await db.select({
    style: styles,
    buyerName: customers.customerName,
  })
    .from(styles)
    .leftJoin(customers, eq(styles.buyerId, customers.id))
    .where(and(eq(styles.id, styleId), eq(styles.tenantId, tenantId)));

  if (!result) {
    throw new ERPError('NOT_FOUND', 'Style not found', 404);
  }

  const [components, colorways, sizeScales] = await Promise.all([
    db.select().from(styleComponents).where(
      and(eq(styleComponents.tenantId, tenantId), eq(styleComponents.styleId, styleId))
    ),
    db.select().from(styleColorways).where(
      and(eq(styleColorways.tenantId, tenantId), eq(styleColorways.styleId, styleId))
    ),
    db.select().from(styleSizeScales).where(
      and(eq(styleSizeScales.tenantId, tenantId), eq(styleSizeScales.styleId, styleId))
    ),
  ]);

  return { ...result.style, buyerName: result.buyerName, components, colorways, sizeScales };
}

// ============================================================================
// QUOTATION MANAGEMENT (versioning + immutability)
// ============================================================================

export async function createQuotation(tenantId: number, data: any) {
  const [created] = await db.insert(quotations).values({
    ...data,
    tenantId,
    versionNo: 1,
    workflowStatus: 'DRAFT',
    status: 'draft',
  }).returning();

  return created;
}

export async function approveQuotation(tenantId: number, quotationId: number, userId: number) {
  const [quotation] = await db.select().from(quotations).where(
    and(eq(quotations.id, quotationId), eq(quotations.tenantId, tenantId))
  );

  if (!quotation) {
    throw new ERPError('NOT_FOUND', 'Quotation not found', 404);
  }

  if (quotation.workflowStatus === 'APPROVED') {
    throw new ERPError('ALREADY_PROCESSED', 'Quotation is already approved');
  }

  if (IMMUTABLE_QUOTATION_STATUSES.includes(quotation.workflowStatus as any)) {
    throw new ERPError('IMMUTABLE_POSTED', `Cannot approve quotation with status '${quotation.workflowStatus}'`);
  }

  const [updated] = await db.update(quotations)
    .set({
      workflowStatus: 'APPROVED',
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(quotations.id, quotationId), eq(quotations.tenantId, tenantId)))
    .returning();

  await db.insert(auditLogs).values({
    tenantId,
    entityType: 'QUOTATION',
    entityId: quotationId,
    action: 'APPROVE',
    performedBy: userId,
    newValues: { workflowStatus: 'APPROVED' },
  });

  return updated;
}

export async function reviseQuotation(tenantId: number, quotationId: number, userId: number) {
  const [original] = await db.select().from(quotations).where(
    and(eq(quotations.id, quotationId), eq(quotations.tenantId, tenantId))
  );

  if (!original) {
    throw new ERPError('NOT_FOUND', 'Quotation not found', 404);
  }

  if (!IMMUTABLE_QUOTATION_STATUSES.includes(original.workflowStatus as any) && original.workflowStatus !== 'DRAFT') {
    throw new ERPError('INVALID_STATE_TRANSITION', `Quotation must be APPROVED or ACCEPTED to create a revision. Current status: '${original.workflowStatus}'`);
  }

  await db.update(quotations)
    .set({
      workflowStatus: 'REVISED',
      status: 'revised',
      updatedAt: new Date(),
    })
    .where(and(eq(quotations.id, quotationId), eq(quotations.tenantId, tenantId)));

  const newVersionNo = (original.versionNo || 1) + 1;

  const [revised] = await db.insert(quotations).values({
    tenantId,
    quotationId: `${original.quotationId}-v${newVersionNo}`,
    inquiryId: original.inquiryId,
    customerId: original.customerId,
    styleName: original.styleName,
    department: original.department,
    projectedQuantity: original.projectedQuantity,
    projectedDeliveryDate: original.projectedDeliveryDate,
    targetPrice: original.targetPrice,
    materialCost: original.materialCost,
    manufacturingCost: original.manufacturingCost,
    otherCost: original.otherCost,
    totalCost: original.totalCost,
    costPerPiece: original.costPerPiece,
    profitPercentage: original.profitPercentage,
    quotedPrice: original.quotedPrice,
    notes: original.notes,
    versionNo: newVersionNo,
    revisionOfQuotationId: original.id,
    workflowStatus: 'DRAFT',
    status: 'draft',
    createdBy: userId,
  }).returning();

  await db.insert(auditLogs).values({
    tenantId,
    entityType: 'QUOTATION',
    entityId: quotationId,
    action: 'REVISE',
    performedBy: userId,
    newValues: { newQuotationId: revised.id, newVersionNo },
  });

  return revised;
}

export async function getQuotationWithVersions(tenantId: number, quotationId: number) {
  const [quotation] = await db.select().from(quotations).where(
    and(eq(quotations.id, quotationId), eq(quotations.tenantId, tenantId))
  );

  if (!quotation) {
    throw new ERPError('NOT_FOUND', 'Quotation not found', 404);
  }

  let rootId = quotation.revisionOfQuotationId || quotation.id;

  const allVersions = await db.select().from(quotations).where(
    and(
      eq(quotations.tenantId, tenantId),
      sql`(${quotations.id} = ${rootId} OR ${quotations.revisionOfQuotationId} = ${rootId})`
    )
  ).orderBy(desc(quotations.versionNo));

  return { quotation, versions: allVersions };
}

export async function getEnquiryTrace(tenantId: number, enquiryId: number) {
  const [inquiry] = await db.select().from(inquiries).where(
    and(eq(inquiries.id, enquiryId), eq(inquiries.tenantId, tenantId))
  );

  if (!inquiry) {
    throw new ERPError('NOT_FOUND', 'Enquiry not found', 404);
  }

  const linkedQuotations = await db.select().from(quotations).where(
    and(eq(quotations.tenantId, tenantId), eq(quotations.inquiryId, enquiryId))
  ).orderBy(desc(quotations.versionNo));

  const quotationIds = linkedQuotations.map(q => q.id);
  let linkedCostings: any[] = [];
  if (quotationIds.length > 0) {
    linkedCostings = await db.select().from(costings).where(
      and(
        eq(costings.tenantId, tenantId),
        sql`${costings.quotationId} IN (${sql.join(quotationIds.map(id => sql`${id}`), sql`, `)})`
      )
    );
  }

  return { inquiry, quotations: linkedQuotations, costings: linkedCostings };
}

// ============================================================================
// COSTING MANAGEMENT
// ============================================================================

export async function createOrUpdateCosting(tenantId: number, quotationId: number, costingData: any) {
  const [quotation] = await db.select().from(quotations).where(
    and(eq(quotations.id, quotationId), eq(quotations.tenantId, tenantId))
  );

  if (!quotation) {
    throw new ERPError('NOT_FOUND', 'Quotation not found', 404);
  }

  if (IMMUTABLE_QUOTATION_STATUSES.includes(quotation.workflowStatus as any)) {
    throw new ERPError('IMMUTABLE_POSTED', `Cannot edit costing for quotation with status '${quotation.workflowStatus}'. Create a revision first.`);
  }

  const componentCosts = [
    parseFloat(costingData.fabricCost || '0'),
    parseFloat(costingData.trimsCost || '0'),
    parseFloat(costingData.packingCost || '0'),
    parseFloat(costingData.washingCost || '0'),
    parseFloat(costingData.printingCost || '0'),
    parseFloat(costingData.testingCost || '0'),
    parseFloat(costingData.commercialCost || '0'),
    parseFloat(costingData.financeCost || '0'),
    parseFloat(costingData.cm || '0'),
    parseFloat(costingData.overhead || '0'),
  ];
  const totalCostPerPc = componentCosts.reduce((sum, c) => sum + c, 0);

  const values = {
    ...costingData,
    tenantId,
    quotationId,
    totalCostPerPc: totalCostPerPc.toFixed(2),
    updatedAt: new Date(),
  };

  const [existing] = await db.select().from(costings).where(
    and(eq(costings.tenantId, tenantId), eq(costings.quotationId, quotationId))
  );

  if (existing) {
    const [updated] = await db.update(costings)
      .set(values)
      .where(and(eq(costings.tenantId, tenantId), eq(costings.quotationId, quotationId)))
      .returning();
    return updated;
  }

  const [created] = await db.insert(costings).values(values).returning();
  return created;
}

export async function getCostingByQuotation(tenantId: number, quotationId: number) {
  const [costing] = await db.select().from(costings).where(
    and(eq(costings.tenantId, tenantId), eq(costings.quotationId, quotationId))
  );

  return costing || null;
}

// ============================================================================
// STYLE COMPONENTS
// ============================================================================

export async function getStyleComponents(tenantId: number, styleId: number) {
  return db.select().from(styleComponents).where(
    and(eq(styleComponents.tenantId, tenantId), eq(styleComponents.styleId, styleId))
  );
}

export async function createStyleComponent(data: InsertStyleComponent) {
  const [created] = await db.insert(styleComponents).values(data).returning();
  return created;
}

export async function updateStyleComponent(tenantId: number, id: number, data: Partial<InsertStyleComponent>) {
  const [existing] = await db.select().from(styleComponents).where(
    and(eq(styleComponents.id, id), eq(styleComponents.tenantId, tenantId))
  );
  if (!existing) throw new ERPError('NOT_FOUND', 'Style component not found', 404);

  const [updated] = await db.update(styleComponents)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(styleComponents.id, id), eq(styleComponents.tenantId, tenantId)))
    .returning();
  return updated;
}

export async function deleteStyleComponent(tenantId: number, id: number) {
  const [existing] = await db.select().from(styleComponents).where(
    and(eq(styleComponents.id, id), eq(styleComponents.tenantId, tenantId))
  );
  if (!existing) throw new ERPError('NOT_FOUND', 'Style component not found', 404);

  const bomRefs = await db.select({ id: styleBoms.id }).from(styleBoms).where(
    and(eq(styleBoms.tenantId, tenantId), eq(styleBoms.componentId, id))
  );
  const deliveryLineRefs = await db.select({ id: orderDeliveryLines.id }).from(orderDeliveryLines).where(
    and(eq(orderDeliveryLines.tenantId, tenantId), eq(orderDeliveryLines.componentId, id))
  );
  const rmLineRefs = await db.select({ id: rmRequirementLines.id }).from(rmRequirementLines).where(
    and(eq(rmRequirementLines.tenantId, tenantId), eq(rmRequirementLines.componentId, id))
  );

  const references: string[] = [];
  if (bomRefs.length > 0) references.push(`${bomRefs.length} BOM(s)`);
  if (deliveryLineRefs.length > 0) references.push(`${deliveryLineRefs.length} delivery line(s)`);
  if (rmLineRefs.length > 0) references.push(`${rmLineRefs.length} RM requirement line(s)`);

  if (references.length > 0) {
    throw new ERPError('CONSTRAINT_VIOLATION', `Cannot delete component: referenced by ${references.join(', ')}`, 409);
  }

  await db.delete(styleComponents).where(
    and(eq(styleComponents.id, id), eq(styleComponents.tenantId, tenantId))
  );
  return { success: true };
}

// ============================================================================
// STYLE COLORWAYS
// ============================================================================

export async function getStyleColorways(tenantId: number, styleId: number) {
  return db.select().from(styleColorways).where(
    and(eq(styleColorways.tenantId, tenantId), eq(styleColorways.styleId, styleId))
  );
}

export async function createStyleColorway(data: InsertStyleColorway) {
  const [created] = await db.insert(styleColorways).values(data).returning();
  return created;
}

export async function updateStyleColorway(tenantId: number, id: number, data: Partial<InsertStyleColorway>) {
  const [existing] = await db.select().from(styleColorways).where(
    and(eq(styleColorways.id, id), eq(styleColorways.tenantId, tenantId))
  );
  if (!existing) throw new ERPError('NOT_FOUND', 'Style colorway not found', 404);

  const [updated] = await db.update(styleColorways)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(styleColorways.id, id), eq(styleColorways.tenantId, tenantId)))
    .returning();
  return updated;
}

export async function deleteStyleColorway(tenantId: number, id: number) {
  const [existing] = await db.select().from(styleColorways).where(
    and(eq(styleColorways.id, id), eq(styleColorways.tenantId, tenantId))
  );
  if (!existing) throw new ERPError('NOT_FOUND', 'Style colorway not found', 404);

  const deliveryLineRefs = await db.select({ id: orderDeliveryLines.id }).from(orderDeliveryLines).where(
    and(eq(orderDeliveryLines.tenantId, tenantId), eq(orderDeliveryLines.colorwayId, id))
  );

  if (deliveryLineRefs.length > 0) {
    throw new ERPError('CONSTRAINT_VIOLATION', `Cannot delete colorway: referenced by ${deliveryLineRefs.length} delivery line(s)`, 409);
  }

  await db.delete(styleColorways).where(
    and(eq(styleColorways.id, id), eq(styleColorways.tenantId, tenantId))
  );
  return { success: true };
}

// ============================================================================
// STYLE SIZE SCALES
// ============================================================================

export async function getStyleSizeScales(tenantId: number, styleId: number) {
  return db.select().from(styleSizeScales).where(
    and(eq(styleSizeScales.tenantId, tenantId), eq(styleSizeScales.styleId, styleId))
  );
}

export async function createStyleSizeScale(data: InsertStyleSizeScale) {
  const [created] = await db.insert(styleSizeScales).values(data).returning();
  return created;
}

export async function updateStyleSizeScale(tenantId: number, id: number, data: Partial<InsertStyleSizeScale>) {
  const [existing] = await db.select().from(styleSizeScales).where(
    and(eq(styleSizeScales.id, id), eq(styleSizeScales.tenantId, tenantId))
  );
  if (!existing) throw new ERPError('NOT_FOUND', 'Style size scale not found', 404);

  const [updated] = await db.update(styleSizeScales)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(styleSizeScales.id, id), eq(styleSizeScales.tenantId, tenantId)))
    .returning();
  return updated;
}

export async function deleteStyleSizeScale(tenantId: number, id: number) {
  const [existing] = await db.select().from(styleSizeScales).where(
    and(eq(styleSizeScales.id, id), eq(styleSizeScales.tenantId, tenantId))
  );
  if (!existing) throw new ERPError('NOT_FOUND', 'Style size scale not found', 404);

  await db.delete(styleSizeScales).where(
    and(eq(styleSizeScales.id, id), eq(styleSizeScales.tenantId, tenantId))
  );
  return { success: true };
}

// ============================================================================
// STYLE DELETION GUARDRAIL & TOGGLE ACTIVE
// ============================================================================

export async function canDeleteStyle(tenantId: number, styleId: number): Promise<{ canDelete: boolean; references: string[] }> {
  const references: string[] = [];

  const bomRefs = await db.select({ id: styleBoms.id }).from(styleBoms).where(
    and(eq(styleBoms.tenantId, tenantId), eq(styleBoms.styleId, styleId))
  );
  if (bomRefs.length > 0) references.push(`${bomRefs.length} BOM(s)`);

  const orderRefs = await db.select({ id: orders.id }).from(orders).where(
    and(eq(orders.tenantId, tenantId), eq(orders.styleId, styleId))
  );
  if (orderRefs.length > 0) references.push(`${orderRefs.length} order(s)`);

  const quotationRefs = await db.select({ id: quotations.id }).from(quotations).where(
    and(eq(quotations.tenantId, tenantId), eq(quotations.styleId, styleId))
  );
  if (quotationRefs.length > 0) references.push(`${quotationRefs.length} quotation(s)`);

  const inquiryRefs = await db.select({ id: inquiries.id }).from(inquiries).where(
    and(eq(inquiries.tenantId, tenantId), eq(inquiries.styleId, styleId))
  );
  if (inquiryRefs.length > 0) references.push(`${inquiryRefs.length} inquiry/inquiries`);

  const deliveryLineRefs = await db.select({ id: orderDeliveryLines.id }).from(orderDeliveryLines).where(
    and(eq(orderDeliveryLines.tenantId, tenantId), eq(orderDeliveryLines.styleId, styleId))
  );
  if (deliveryLineRefs.length > 0) references.push(`${deliveryLineRefs.length} delivery line(s)`);

  return { canDelete: references.length === 0, references };
}

export async function toggleStyleActive(tenantId: number, styleId: number, isActive: boolean) {
  const [existing] = await db.select().from(styles).where(
    and(eq(styles.id, styleId), eq(styles.tenantId, tenantId))
  );
  if (!existing) throw new ERPError('NOT_FOUND', 'Style not found', 404);

  const [updated] = await db.update(styles)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(styles.id, styleId), eq(styles.tenantId, tenantId)))
    .returning();
  return updated;
}

export async function deleteStyle(tenantId: number, styleId: number) {
  const guard = await canDeleteStyle(tenantId, styleId);
  if (!guard.canDelete) {
    throw new ERPError('CONSTRAINT_VIOLATION', `Cannot delete style: referenced by ${guard.references.join(', ')}`, 409, { references: guard.references });
  }

  await db.delete(styles).where(
    and(eq(styles.id, styleId), eq(styles.tenantId, tenantId))
  );
  return { success: true };
}

// ============================================================================
// ORDER PIPELINE AGGREGATION
// ============================================================================

function computeDaysRemaining(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getPipelineData(tenantId: number) {
  const [
    allInquiries,
    allSamples,
    allQuotations,
    allOrders,
    allProduction,
    allShipments,
  ] = await Promise.all([
    db.select({
      id: inquiries.id,
      referenceId: inquiries.inquiryId,
      styleName: inquiries.styleName,
      quantity: inquiries.projectedQuantity,
      deliveryDate: inquiries.projectedDeliveryDate,
      status: inquiries.status,
      buyerName: customers.customerName,
    })
      .from(inquiries)
      .leftJoin(customers, eq(inquiries.customerId, customers.id))
      .where(eq(inquiries.tenantId, tenantId)),

    db.select({
      id: sampleRequests.id,
      sampleNo: sampleRequests.requestNumber,
      qty: sampleRequests.quantity,
      requiredDate: sampleRequests.requiredDate,
      status: sampleRequests.status,
      buyerName: customers.customerName,
      styleName: sql<string>`COALESCE(${sampleRequests.styleName}, 'N/A')`,
    })
      .from(sampleRequests)
      .leftJoin(customers, eq(sampleRequests.customerId, customers.id))
      .where(eq(sampleRequests.tenantId, tenantId)),

    db.select({
      id: quotations.id,
      referenceId: quotations.quotationId,
      styleName: quotations.styleName,
      quantity: quotations.projectedQuantity,
      deliveryDate: quotations.projectedDeliveryDate,
      workflowStatus: quotations.workflowStatus,
      status: quotations.status,
      buyerName: customers.customerName,
    })
      .from(quotations)
      .leftJoin(customers, eq(quotations.customerId, customers.id))
      .where(eq(quotations.tenantId, tenantId)),

    db.select({
      id: orders.id,
      referenceId: orders.orderId,
      styleName: orders.styleName,
      quantity: orders.totalQuantity,
      deliveryDate: orders.deliveryDate,
      orderStatus: orders.orderStatus,
      buyerName: customers.customerName,
    })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orders.tenantId, tenantId)),

    db.select({
      id: productionOrders.id,
      orderNumber: productionOrders.orderNumber,
      status: productionOrders.status,
      orderId: productionOrders.orderId,
    })
      .from(productionOrders)
      .where(eq(productionOrders.tenantId, tenantId)),

    db.select({
      id: shipments.id,
      shipmentNumber: shipments.shipmentNumber,
      salesOrderId: shipments.salesOrderId,
      status: shipments.status,
      etd: shipments.etd,
    })
      .from(shipments)
      .where(eq(shipments.tenantId, tenantId)),
  ]);

  const orderIdsWithProduction = new Set(allProduction.filter(p => p.orderId).map(p => p.orderId));
  const orderIdsWithShipment = new Set(allShipments.filter(s => s.salesOrderId).map(s => s.salesOrderId));
  const shippedOrderIds = new Set(allShipments.filter(s => s.status === 'SHIPPED' || s.status === 'DELIVERED').map(s => s.salesOrderId));

  const stages: Record<string, any[]> = {};
  for (const stage of ["Inquiry", "Sample Dev", "Quotation", "Confirmed", "In Production", "QC", "Ready to Ship", "Shipped"]) {
    stages[stage] = [];
  }

  const buyersSet = new Set<string>();

  for (const inq of allInquiries) {
    const closedStatuses = ['converted_to_order', 'closed', 'WON', 'LOST'];
    if (closedStatuses.includes(inq.status || '')) continue;
    const buyerName = inq.buyerName || 'Unknown';
    buyersSet.add(buyerName);
    stages["Inquiry"].push({
      id: inq.id,
      type: 'inquiry',
      stage: 'Inquiry',
      buyerName,
      styleName: inq.styleName,
      quantity: inq.quantity,
      deliveryDate: inq.deliveryDate,
      daysRemaining: computeDaysRemaining(inq.deliveryDate),
      status: inq.status,
      referenceId: inq.referenceId,
    });
  }

  for (const sample of allSamples) {
    const completedStatuses = ['APPROVED_BY_BUYER', 'REJECTED', 'CANCELLED'];
    if (completedStatuses.includes(sample.status || '')) continue;
    const buyerName = sample.buyerName || 'Unknown';
    buyersSet.add(buyerName);
    stages["Sample Dev"].push({
      id: sample.id,
      type: 'sample',
      stage: 'Sample Dev',
      buyerName,
      styleName: sample.styleName,
      quantity: sample.qty,
      deliveryDate: sample.requiredDate,
      daysRemaining: computeDaysRemaining(sample.requiredDate),
      status: sample.status,
      referenceId: sample.sampleNo as string,
    });
  }

  for (const q of allQuotations) {
    const ws = q.workflowStatus || q.status || '';
    if (['APPROVED', 'ACCEPTED', 'REVISED'].includes(ws)) continue;
    const buyerName = q.buyerName || 'Unknown';
    buyersSet.add(buyerName);
    stages["Quotation"].push({
      id: q.id,
      type: 'quotation',
      stage: 'Quotation',
      buyerName,
      styleName: q.styleName,
      quantity: q.quantity,
      deliveryDate: q.deliveryDate,
      daysRemaining: computeDaysRemaining(q.deliveryDate),
      status: ws,
      referenceId: q.referenceId,
    });
  }

  for (const ord of allOrders) {
    const status = ord.orderStatus || 'new';
    const buyerName = ord.buyerName || 'Unknown';
    buyersSet.add(buyerName);

    if (shippedOrderIds.has(ord.id) || status === 'shipped' || status === 'delivered') {
      stages["Shipped"].push({
        id: ord.id, type: 'order', stage: 'Shipped', buyerName,
        styleName: ord.styleName, quantity: ord.quantity,
        deliveryDate: ord.deliveryDate,
        daysRemaining: computeDaysRemaining(ord.deliveryDate),
        status, referenceId: ord.referenceId,
      });
    } else if (status === 'ready_to_ship' || status === 'completed') {
      stages["Ready to Ship"].push({
        id: ord.id, type: 'order', stage: 'Ready to Ship', buyerName,
        styleName: ord.styleName, quantity: ord.quantity,
        deliveryDate: ord.deliveryDate,
        daysRemaining: computeDaysRemaining(ord.deliveryDate),
        status, referenceId: ord.referenceId,
      });
    } else if (status === 'qc' || status === 'quality_check') {
      stages["QC"].push({
        id: ord.id, type: 'order', stage: 'QC', buyerName,
        styleName: ord.styleName, quantity: ord.quantity,
        deliveryDate: ord.deliveryDate,
        daysRemaining: computeDaysRemaining(ord.deliveryDate),
        status, referenceId: ord.referenceId,
      });
    } else if (status === 'in_production' || orderIdsWithProduction.has(ord.id)) {
      stages["In Production"].push({
        id: ord.id, type: 'order', stage: 'In Production', buyerName,
        styleName: ord.styleName, quantity: ord.quantity,
        deliveryDate: ord.deliveryDate,
        daysRemaining: computeDaysRemaining(ord.deliveryDate),
        status, referenceId: ord.referenceId,
      });
    } else {
      stages["Confirmed"].push({
        id: ord.id, type: 'order', stage: 'Confirmed', buyerName,
        styleName: ord.styleName, quantity: ord.quantity,
        deliveryDate: ord.deliveryDate,
        daysRemaining: computeDaysRemaining(ord.deliveryDate),
        status, referenceId: ord.referenceId,
      });
    }
  }

  const summary: Record<string, number> = {};
  for (const [stage, items] of Object.entries(stages)) {
    summary[stage] = items.length;
  }

  return {
    stages,
    summary,
    buyers: Array.from(buyersSet).sort(),
  };
}
