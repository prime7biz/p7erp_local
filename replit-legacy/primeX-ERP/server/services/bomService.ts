import { db } from '../db';
import { eq, and, desc, sql, count, inArray, sum } from 'drizzle-orm';
import { styleBoms, styleBomLines, bomVariants, orderBomSnapshots, orderBomSnapshotItems, styles, items, orders, bomOverrideRequests, rmRequirements, rmRequirementLines, orderDeliveries, orderDeliveryLines } from '@shared/schema';

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

function assertEditableBom(status: string) {
  if (status === 'APPROVED' || status === 'LOCKED') {
    throw new ERPError('BOM_FROZEN', 'Cannot edit a BOM that is APPROVED or LOCKED. Create a new revision instead.', 403);
  }
}

export async function createBom(tenantId: number, styleId: number, data: any) {
  const [style] = await db.select().from(styles).where(
    and(eq(styles.id, styleId), eq(styles.tenantId, tenantId))
  );
  if (!style) throw new ERPError('NOT_FOUND', 'Style not found', 404);

  const existing = await db.select({ maxVersion: sql<number>`COALESCE(MAX(${styleBoms.versionNo}), 0)` })
    .from(styleBoms)
    .where(and(eq(styleBoms.tenantId, tenantId), eq(styleBoms.styleId, styleId)));

  const nextVersion = (existing[0]?.maxVersion || 0) + 1;

  if (nextVersion > 1) {
    throw new ERPError('BOM_EXISTS', 'BOM already exists for this style. Use revise to create a new version.');
  }

  const [bom] = await db.insert(styleBoms).values({
    tenantId,
    styleId,
    versionNo: 1,
    status: 'DRAFT',
    notes: data.notes || null,
    effectiveFrom: data.effectiveFrom || null,
  }).returning();

  return bom;
}

export async function addBomLine(tenantId: number, bomId: number, lineData: any) {
  const [bom] = await db.select().from(styleBoms).where(
    and(eq(styleBoms.id, bomId), eq(styleBoms.tenantId, tenantId))
  );
  if (!bom) throw new ERPError('NOT_FOUND', 'BOM not found', 404);
  assertEditableBom(bom.status);
  if (bom.status !== 'DRAFT' && bom.status !== 'SUBMITTED') throw new ERPError('INVALID_STATE', 'Can only add lines to DRAFT or SUBMITTED BOM');

  if (!['FABRIC', 'TRIM', 'PACKING'].includes(lineData.category)) {
    throw new ERPError('INVALID_CATEGORY', 'Category must be FABRIC, TRIM, or PACKING');
  }

  const [line] = await db.insert(styleBomLines).values({
    tenantId,
    styleBomId: bomId,
    category: lineData.category,
    itemId: lineData.itemId || null,
    itemDescription: lineData.itemDescription || null,
    uom: lineData.uom || null,
    baseConsumption: lineData.baseConsumption,
    wastagePct: lineData.wastagePct || '0',
    processLossPct: lineData.processLossPct || '0',
    consumptionFormula: lineData.consumptionFormula || null,
    colorPolicy: lineData.colorPolicy || 'SOLID',
    sizePolicy: lineData.sizePolicy || 'SAME_ALL',
    remarks: lineData.remarks || null,
  }).returning();

  return line;
}

export async function addBomVariant(tenantId: number, bomLineId: number, variantData: any) {
  const [line] = await db.select().from(styleBomLines).where(
    and(eq(styleBomLines.id, bomLineId), eq(styleBomLines.tenantId, tenantId))
  );
  if (!line) throw new ERPError('NOT_FOUND', 'BOM line not found', 404);

  const [bom] = await db.select().from(styleBoms).where(eq(styleBoms.id, line.styleBomId));
  if (bom) assertEditableBom(bom.status);
  if (bom && bom.status !== 'DRAFT' && bom.status !== 'SUBMITTED') throw new ERPError('INVALID_STATE', 'Can only add variants to DRAFT or SUBMITTED BOM');

  const [variant] = await db.insert(bomVariants).values({
    tenantId,
    styleBomLineId: bomLineId,
    size: variantData.size || null,
    color: variantData.color || null,
    consumptionOverride: variantData.consumptionOverride || null,
    wastageOverridePct: variantData.wastageOverridePct || null,
  }).returning();

  return variant;
}

export async function updateBomLine(tenantId: number, bomLineId: number, lineData: any) {
  const [line] = await db.select().from(styleBomLines).where(
    and(eq(styleBomLines.id, bomLineId), eq(styleBomLines.tenantId, tenantId))
  );
  if (!line) throw new ERPError('NOT_FOUND', 'BOM line not found', 404);

  const [bom] = await db.select().from(styleBoms).where(
    and(eq(styleBoms.id, line.styleBomId), eq(styleBoms.tenantId, tenantId))
  );
  if (!bom) throw new ERPError('NOT_FOUND', 'BOM not found', 404);
  assertEditableBom(bom.status);

  const updateData: any = { updatedAt: new Date() };
  if (lineData.category !== undefined) updateData.category = lineData.category;
  if (lineData.itemId !== undefined) updateData.itemId = lineData.itemId;
  if (lineData.itemDescription !== undefined) updateData.itemDescription = lineData.itemDescription;
  if (lineData.uom !== undefined) updateData.uom = lineData.uom;
  if (lineData.baseConsumption !== undefined) updateData.baseConsumption = lineData.baseConsumption;
  if (lineData.wastagePct !== undefined) updateData.wastagePct = lineData.wastagePct;
  if (lineData.processLossPct !== undefined) updateData.processLossPct = lineData.processLossPct;
  if (lineData.remarks !== undefined) updateData.remarks = lineData.remarks;

  const [updated] = await db.update(styleBomLines)
    .set(updateData)
    .where(and(eq(styleBomLines.id, bomLineId), eq(styleBomLines.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function approveBom(tenantId: number, bomId: number, userId: number) {
  const [bom] = await db.select().from(styleBoms).where(
    and(eq(styleBoms.id, bomId), eq(styleBoms.tenantId, tenantId))
  );
  if (!bom) throw new ERPError('NOT_FOUND', 'BOM not found', 404);
  if (bom.status !== 'DRAFT' && bom.status !== 'SUBMITTED') throw new ERPError('INVALID_STATE', 'Can only approve DRAFT or SUBMITTED BOM');

  const lines = await db.select({ cnt: count() }).from(styleBomLines)
    .where(and(eq(styleBomLines.styleBomId, bomId), eq(styleBomLines.tenantId, tenantId)));

  if (!lines[0]?.cnt || lines[0].cnt === 0) {
    throw new ERPError('NO_LINES', 'Cannot approve BOM with no lines');
  }

  const [updated] = await db.update(styleBoms)
    .set({ status: 'APPROVED', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(styleBoms.id, bomId), eq(styleBoms.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function reviseBom(tenantId: number, bomId: number, userId: number) {
  const [original] = await db.select().from(styleBoms).where(
    and(eq(styleBoms.id, bomId), eq(styleBoms.tenantId, tenantId))
  );
  if (!original) throw new ERPError('NOT_FOUND', 'BOM not found', 404);
  if (original.status !== 'APPROVED' && original.status !== 'LOCKED') {
    throw new ERPError('INVALID_STATE', 'Can only revise APPROVED or LOCKED BOM');
  }

  const existing = await db.select({ maxVersion: sql<number>`COALESCE(MAX(${styleBoms.versionNo}), 0)` })
    .from(styleBoms)
    .where(and(eq(styleBoms.tenantId, tenantId), eq(styleBoms.styleId, original.styleId)));

  const nextVersion = (existing[0]?.maxVersion || 0) + 1;

  const [newBom] = await db.insert(styleBoms).values({
    tenantId,
    styleId: original.styleId,
    componentId: original.componentId,
    versionNo: nextVersion,
    status: 'DRAFT',
    notes: original.notes,
    effectiveFrom: original.effectiveFrom,
    revisionOfBomId: original.id,
  }).returning();

  const originalLines = await db.select().from(styleBomLines)
    .where(and(eq(styleBomLines.styleBomId, bomId), eq(styleBomLines.tenantId, tenantId)));

  const newLines: any[] = [];
  for (const line of originalLines) {
    const [newLine] = await db.insert(styleBomLines).values({
      tenantId,
      styleBomId: newBom.id,
      category: line.category,
      itemId: line.itemId,
      itemDescription: line.itemDescription,
      uom: line.uom,
      baseConsumption: line.baseConsumption,
      wastagePct: line.wastagePct,
      processLossPct: line.processLossPct,
      consumptionFormula: line.consumptionFormula,
      colorPolicy: line.colorPolicy,
      sizePolicy: line.sizePolicy,
      remarks: line.remarks,
    }).returning();

    const originalVariants = await db.select().from(bomVariants)
      .where(and(eq(bomVariants.styleBomLineId, line.id), eq(bomVariants.tenantId, tenantId)));

    const newVariants: any[] = [];
    for (const v of originalVariants) {
      const [nv] = await db.insert(bomVariants).values({
        tenantId,
        styleBomLineId: newLine.id,
        size: v.size,
        color: v.color,
        consumptionOverride: v.consumptionOverride,
        wastageOverridePct: v.wastageOverridePct,
      }).returning();
      newVariants.push(nv);
    }
    newLines.push({ ...newLine, variants: newVariants });
  }

  return { ...newBom, lines: newLines };
}

export async function lockBom(tenantId: number, bomId: number) {
  const [bom] = await db.select().from(styleBoms).where(
    and(eq(styleBoms.id, bomId), eq(styleBoms.tenantId, tenantId))
  );
  if (!bom) throw new ERPError('NOT_FOUND', 'BOM not found', 404);
  if (bom.status !== 'APPROVED') throw new ERPError('INVALID_STATE', 'Can only lock APPROVED BOM');

  const [updated] = await db.update(styleBoms)
    .set({ status: 'LOCKED', updatedAt: new Date() })
    .where(and(eq(styleBoms.id, bomId), eq(styleBoms.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function getBom(tenantId: number, bomId: number) {
  const [bom] = await db.select().from(styleBoms).where(
    and(eq(styleBoms.id, bomId), eq(styleBoms.tenantId, tenantId))
  );
  if (!bom) throw new ERPError('NOT_FOUND', 'BOM not found', 404);

  const lines = await db.select().from(styleBomLines)
    .where(and(eq(styleBomLines.styleBomId, bomId), eq(styleBomLines.tenantId, tenantId)));

  const linesWithVariants = await Promise.all(lines.map(async (line) => {
    const variants = await db.select().from(bomVariants)
      .where(and(eq(bomVariants.styleBomLineId, line.id), eq(bomVariants.tenantId, tenantId)));
    return { ...line, variants };
  }));

  return { ...bom, lines: linesWithVariants };
}

export async function getBomsByStyle(tenantId: number, styleId: number) {
  const bomList = await db.select().from(styleBoms)
    .where(and(eq(styleBoms.tenantId, tenantId), eq(styleBoms.styleId, styleId)))
    .orderBy(desc(styleBoms.versionNo));

  return bomList;
}

export async function calculateConsumption(
  tenantId: number,
  bomId: number,
  orderQty: number,
  sizeColorBreakdown?: Array<{ size: string; color: string; quantity: number }>
) {
  const bom = await getBom(tenantId, bomId);

  const results: Array<{
    itemId: number | null;
    itemDescription: string | null;
    category: string;
    requiredQty: number;
    uom: string | null;
    calculationDetails: any;
  }> = [];

  for (const line of bom.lines) {
    const baseConsumption = parseFloat(line.baseConsumption);
    const wastagePct = parseFloat(line.wastagePct || '0');
    const processLossPct = parseFloat(line.processLossPct || '0');

    if (sizeColorBreakdown && sizeColorBreakdown.length > 0 && line.variants && line.variants.length > 0) {
      let totalRequiredQty = 0;
      const breakdownDetails: any[] = [];

      for (const entry of sizeColorBreakdown) {
        const matchingVariant = line.variants.find(v =>
          (!v.size || v.size === entry.size) && (!v.color || v.color === entry.color)
        );

        let consumption = baseConsumption;
        let wastage = wastagePct;

        if (matchingVariant) {
          if (matchingVariant.consumptionOverride) consumption = parseFloat(matchingVariant.consumptionOverride);
          if (matchingVariant.wastageOverridePct) wastage = parseFloat(matchingVariant.wastageOverridePct);
        }

        const resolvedPerPc = consumption * (1 + wastage / 100) * (1 + processLossPct / 100);
        const qty = resolvedPerPc * entry.quantity;
        totalRequiredQty += qty;

        breakdownDetails.push({
          size: entry.size,
          color: entry.color,
          quantity: entry.quantity,
          consumptionPerPc: consumption,
          wastagePct: wastage,
          processLossPct,
          resolvedPerPc,
          requiredQty: qty,
        });
      }

      results.push({
        itemId: line.itemId,
        itemDescription: line.itemDescription,
        category: line.category,
        requiredQty: totalRequiredQty,
        uom: line.uom,
        calculationDetails: { type: 'VARIANT_BREAKDOWN', breakdown: breakdownDetails },
      });
    } else {
      const resolvedPerPc = baseConsumption * (1 + wastagePct / 100) * (1 + processLossPct / 100);
      const requiredQty = resolvedPerPc * orderQty;

      results.push({
        itemId: line.itemId,
        itemDescription: line.itemDescription,
        category: line.category,
        requiredQty,
        uom: line.uom,
        calculationDetails: {
          type: 'STANDARD',
          baseConsumption,
          wastagePct,
          processLossPct,
          resolvedPerPc,
          orderQty,
        },
      });
    }
  }

  return results;
}

export async function createOrderBomSnapshot(tenantId: number, orderId: number, bomId: number, userId: number) {
  const [order] = await db.select().from(orders).where(
    and(eq(orders.id, orderId), eq(orders.tenantId, tenantId))
  );
  if (!order) throw new ERPError('NOT_FOUND', 'Order not found', 404);

  const bom = await getBom(tenantId, bomId);
  if (bom.status !== 'APPROVED' && bom.status !== 'LOCKED') {
    throw new ERPError('INVALID_STATE', 'BOM must be APPROVED or LOCKED to create snapshot');
  }

  const consumptionResults = await calculateConsumption(tenantId, bomId, order.totalQuantity);

  const [snapshot] = await db.insert(orderBomSnapshots).values({
    orderId,
    tenantId,
    snapshotVersion: 1,
    isLocked: true,
    lockedAt: new Date(),
    lockedBy: userId,
    totalEstimatedCost: '0',
    notes: `Snapshot from BOM v${bom.versionNo} for style ${bom.styleId}`,
  }).returning();

  for (const item of consumptionResults) {
    await db.insert(orderBomSnapshotItems).values({
      snapshotId: snapshot.id,
      itemId: item.itemId || 0,
      itemName: item.itemDescription || 'Unknown',
      materialType: item.category,
      requiredQty: String(item.calculationDetails.resolvedPerPc || item.requiredQty / (order.totalQuantity || 1)),
      totalRequiredQty: String(item.requiredQty),
      unitName: item.uom || null,
      tenantId,
    });
  }

  if (bom.status === 'APPROVED') {
    await lockBom(tenantId, bomId);
  }

  return { snapshot, consumptionResults };
}

export async function listOverrideRequests(tenantId: number, bomId: number) {
  const requests = await db.select().from(bomOverrideRequests)
    .where(and(eq(bomOverrideRequests.tenantId, tenantId), eq(bomOverrideRequests.styleBomId, bomId)))
    .orderBy(desc(bomOverrideRequests.createdAt));
  return requests;
}

export async function createOverrideRequest(tenantId: number, userId: number, data: { styleBomId: number; bomLineId?: number; reason: string; overrideData: any }) {
  const [bom] = await db.select().from(styleBoms).where(
    and(eq(styleBoms.id, data.styleBomId), eq(styleBoms.tenantId, tenantId))
  );
  if (!bom) throw new ERPError('NOT_FOUND', 'BOM not found', 404);

  if (data.bomLineId) {
    const [line] = await db.select().from(styleBomLines).where(
      and(eq(styleBomLines.id, data.bomLineId), eq(styleBomLines.tenantId, tenantId), eq(styleBomLines.styleBomId, data.styleBomId))
    );
    if (!line) throw new ERPError('NOT_FOUND', 'BOM line not found', 404);
  }

  const [request] = await db.insert(bomOverrideRequests).values({
    tenantId,
    styleBomId: data.styleBomId,
    bomLineId: data.bomLineId || null,
    requestedBy: userId,
    reason: data.reason,
    overrideData: data.overrideData,
    status: 'PENDING',
  }).returning();

  return request;
}

export async function approveOverrideRequest(tenantId: number, requestId: number, userId: number) {
  const [request] = await db.select().from(bomOverrideRequests).where(
    and(eq(bomOverrideRequests.id, requestId), eq(bomOverrideRequests.tenantId, tenantId))
  );
  if (!request) throw new ERPError('NOT_FOUND', 'Override request not found', 404);
  if (request.status !== 'PENDING') throw new ERPError('INVALID_STATE', 'Override request is not pending');

  if (request.bomLineId) {
    const overrideData = request.overrideData as Record<string, any>;
    const updateData: any = { updatedAt: new Date() };
    if (overrideData.baseConsumption !== undefined) updateData.baseConsumption = overrideData.baseConsumption;
    if (overrideData.wastagePct !== undefined) updateData.wastagePct = overrideData.wastagePct;
    if (overrideData.processLossPct !== undefined) updateData.processLossPct = overrideData.processLossPct;

    await db.update(styleBomLines)
      .set(updateData)
      .where(and(eq(styleBomLines.id, request.bomLineId), eq(styleBomLines.tenantId, tenantId)));
  }

  const [updated] = await db.update(bomOverrideRequests)
    .set({ status: 'APPROVED', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bomOverrideRequests.id, requestId), eq(bomOverrideRequests.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function rejectOverrideRequest(tenantId: number, requestId: number, userId: number, rejectionReason: string) {
  const [request] = await db.select().from(bomOverrideRequests).where(
    and(eq(bomOverrideRequests.id, requestId), eq(bomOverrideRequests.tenantId, tenantId))
  );
  if (!request) throw new ERPError('NOT_FOUND', 'Override request not found', 404);
  if (request.status !== 'PENDING') throw new ERPError('INVALID_STATE', 'Override request is not pending');

  const [updated] = await db.update(bomOverrideRequests)
    .set({ status: 'REJECTED', rejectionReason, updatedAt: new Date() })
    .where(and(eq(bomOverrideRequests.id, requestId), eq(bomOverrideRequests.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function generateRmRequirement(tenantId: number, orderId: number, userId: number) {
  const [order] = await db.select().from(orders).where(
    and(eq(orders.id, orderId), eq(orders.tenantId, tenantId))
  );
  if (!order) throw new ERPError('NOT_FOUND', 'Order not found', 404);
  if (!order.styleId) throw new ERPError('INVALID_STATE', 'Order has no style assigned');

  const [approvedBom] = await db.select().from(styleBoms)
    .where(and(
      eq(styleBoms.tenantId, tenantId),
      eq(styleBoms.styleId, order.styleId),
      inArray(styleBoms.status, ['APPROVED', 'LOCKED'])
    ))
    .orderBy(desc(styleBoms.versionNo))
    .limit(1);

  if (!approvedBom) {
    throw new ERPError('NO_BOM', 'No approved BOM found for this style', 400);
  }

  const deliveryList = await db.select().from(orderDeliveries)
    .where(and(eq(orderDeliveries.orderId, orderId), eq(orderDeliveries.tenantId, tenantId)));

  let totalNetQty = 0;
  if (deliveryList.length > 0) {
    const deliveryIds = deliveryList.map(d => d.id);
    const deliveryLineRows = await db.select().from(orderDeliveryLines)
      .where(and(
        eq(orderDeliveryLines.tenantId, tenantId),
        inArray(orderDeliveryLines.orderDeliveryId, deliveryIds)
      ));
    totalNetQty = deliveryLineRows.reduce((sum, dl) => sum + (dl.netQty || 0), 0);
  }

  if (totalNetQty === 0) {
    totalNetQty = order.totalQuantity || 0;
  }

  const bomLines = await db.select().from(styleBomLines)
    .where(and(eq(styleBomLines.styleBomId, approvedBom.id), eq(styleBomLines.tenantId, tenantId)));

  const [rmReq] = await db.insert(rmRequirements).values({
    tenantId,
    orderId,
    styleBomId: approvedBom.id,
    status: 'DRAFT',
    notes: `Auto-generated from BOM v${approvedBom.versionNo} for order ${order.orderId}`,
  }).returning();

  const rmLines: any[] = [];
  for (const line of bomLines) {
    const baseConsumption = parseFloat(line.baseConsumption);
    const wastagePct = parseFloat(line.wastagePct || '0');
    const processLossPct = parseFloat(line.processLossPct || '0');

    const grossQty = totalNetQty * baseConsumption;
    const wastageQty = grossQty * wastagePct / 100;
    const bufferQty = grossQty * processLossPct / 100;
    const netRequiredQty = grossQty + wastageQty + bufferQty;

    let availableStock = 0;
    if (line.itemId) {
      const [itemRow] = await db.select({ defaultCost: items.defaultCost }).from(items)
        .where(and(eq(items.id, line.itemId), eq(items.tenantId, tenantId)));
      availableStock = 0;
    }

    const shortageQty = Math.max(0, netRequiredQty - availableStock);

    const [rmLine] = await db.insert(rmRequirementLines).values({
      tenantId,
      rmRequirementId: rmReq.id,
      itemId: line.itemId,
      itemDescription: line.itemDescription,
      uom: line.uom,
      grossQty: String(grossQty),
      wastageQty: String(wastageQty),
      bufferQty: String(bufferQty),
      netRequiredQty: String(netRequiredQty),
      availableStock: String(availableStock),
      shortageQty: String(shortageQty),
      bomLineId: line.id,
    }).returning();

    rmLines.push(rmLine);
  }

  return { ...rmReq, lines: rmLines };
}

export async function suggestBom(
  tenantId: number,
  input: { styleId?: number; productType: string; fabricType?: string; gsm?: number; sizeRange?: string }
) {
  const historicalBoms = await db
    .select({
      category: styleBomLines.category,
      itemDescription: styleBomLines.itemDescription,
      uom: styleBomLines.uom,
      baseConsumption: styleBomLines.baseConsumption,
      wastagePct: styleBomLines.wastagePct,
      processLossPct: styleBomLines.processLossPct,
    })
    .from(styleBomLines)
    .innerJoin(styleBoms, eq(styleBomLines.styleBomId, styleBoms.id))
    .innerJoin(styles, eq(styleBoms.styleId, styles.id))
    .where(
      and(
        eq(styleBoms.tenantId, tenantId),
        eq(styles.productType, input.productType),
        eq(styleBoms.status, 'APPROVED')
      )
    );

  if (historicalBoms.length > 0) {
    const grouped: Record<string, any> = {};
    for (const row of historicalBoms) {
      const key = `${row.category}||${row.itemDescription || 'generic'}`;
      if (!grouped[key]) {
        grouped[key] = {
          category: row.category,
          itemDescription: row.itemDescription,
          uom: row.uom,
          consumptions: [],
          wastages: [],
          processLosses: [],
        };
      }
      grouped[key].consumptions.push(parseFloat(row.baseConsumption));
      grouped[key].wastages.push(parseFloat(row.wastagePct || '0'));
      grouped[key].processLosses.push(parseFloat(row.processLossPct || '0'));
    }

    const suggestions = Object.values(grouped).map((g: any) => {
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      return {
        category: g.category,
        itemDescription: g.itemDescription,
        uom: g.uom,
        baseConsumption: Math.round(avg(g.consumptions) * 1000) / 1000,
        wastagePct: Math.round(avg(g.wastages) * 100) / 100,
        processLossPct: Math.round(avg(g.processLosses) * 100) / 100,
      };
    });

    return {
      suggestions,
      confidence: suggestions.length >= 3 ? 'HIGH' as const : 'MEDIUM' as const,
      source: 'HISTORICAL' as const,
    };
  }

  const defaults = getDefaultBomSuggestions(input.productType, input.fabricType);
  return {
    suggestions: defaults,
    confidence: 'LOW' as const,
    source: 'DEFAULT' as const,
  };
}

function getDefaultBomSuggestions(productType: string, fabricType?: string) {
  const fabric = fabricType || 'Single Jersey';
  const suggestions = [
    { category: 'FABRIC', itemDescription: `${fabric} Body Fabric`, uom: 'KG', baseConsumption: 0.25, wastagePct: 3, processLossPct: 2 },
    { category: 'TRIM', itemDescription: 'Main Label', uom: 'PCS', baseConsumption: 1, wastagePct: 2, processLossPct: 0 },
    { category: 'TRIM', itemDescription: 'Care Label', uom: 'PCS', baseConsumption: 1, wastagePct: 2, processLossPct: 0 },
    { category: 'TRIM', itemDescription: 'Size Label', uom: 'PCS', baseConsumption: 1, wastagePct: 2, processLossPct: 0 },
    { category: 'TRIM', itemDescription: 'Hangtag', uom: 'PCS', baseConsumption: 1, wastagePct: 3, processLossPct: 0 },
    { category: 'TRIM', itemDescription: 'Sewing Thread', uom: 'MTR', baseConsumption: 120, wastagePct: 5, processLossPct: 1 },
    { category: 'PACKING', itemDescription: 'Poly Bag', uom: 'PCS', baseConsumption: 1, wastagePct: 2, processLossPct: 0 },
    { category: 'PACKING', itemDescription: 'Carton Box (shared)', uom: 'PCS', baseConsumption: 0.083, wastagePct: 1, processLossPct: 0 },
  ];

  if (productType?.toLowerCase().includes('polo') || productType?.toLowerCase().includes('shirt')) {
    suggestions.push({ category: 'TRIM', itemDescription: 'Button', uom: 'PCS', baseConsumption: 3, wastagePct: 3, processLossPct: 0 });
  }

  return suggestions;
}
