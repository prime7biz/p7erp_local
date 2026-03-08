import { db } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { consumptionPlans, consumptionPlanLines, orderBomSnapshots, orderBomSnapshotItems, items, orders, stockLedger } from '@shared/schema';

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

export async function finalizeConsumptionPlan(tenantId: number, orderId: number, requestId: string, userId: number) {
  const [existingPlan] = await db.select().from(consumptionPlans)
    .where(and(eq(consumptionPlans.tenantId, tenantId), eq(consumptionPlans.requestId, requestId)));

  if (existingPlan) {
    const lines = await db.select().from(consumptionPlanLines)
      .where(and(eq(consumptionPlanLines.consumptionPlanId, existingPlan.id), eq(consumptionPlanLines.tenantId, tenantId)));
    return { plan: existingPlan, lines, idempotent: true };
  }

  const [order] = await db.select().from(orders).where(
    and(eq(orders.id, orderId), eq(orders.tenantId, tenantId))
  );
  if (!order) throw new ERPError('NOT_FOUND', 'Order not found', 404);

  const [snapshot] = await db.select().from(orderBomSnapshots).where(
    and(eq(orderBomSnapshots.orderId, orderId), eq(orderBomSnapshots.tenantId, tenantId))
  );
  if (!snapshot) throw new ERPError('NO_SNAPSHOT', 'No BOM snapshot found for this order. Lock BOM first.');

  const snapshotItems = await db.select().from(orderBomSnapshotItems)
    .where(eq(orderBomSnapshotItems.snapshotId, snapshot.id));

  if (snapshotItems.length === 0) {
    throw new ERPError('EMPTY_SNAPSHOT', 'BOM snapshot has no items');
  }

  const missingItems: Array<{ itemId: number; itemName: string; requiredQty: number; availableQty: number }> = [];

  for (const si of snapshotItems) {
    if (!si.itemId) continue;

    const [stockBalance] = await db
      .select({ totalBalance: sql<string>`COALESCE(SUM(CAST(${stockLedger.qtyIn} AS numeric) - CAST(${stockLedger.qtyOut} AS numeric)), 0)` })
      .from(stockLedger)
      .where(and(eq(stockLedger.itemId, si.itemId), eq(stockLedger.tenantId, tenantId)));

    const availableQty = stockBalance ? parseFloat(stockBalance.totalBalance || '0') : 0;
    const requiredQty = parseFloat(si.totalRequiredQty);

    if (availableQty < requiredQty) {
      missingItems.push({
        itemId: si.itemId,
        itemName: si.itemName,
        requiredQty,
        availableQty,
      });
    }
  }

  if (missingItems.length > 0) {
    return {
      code: 'APPROVAL_REQUIRED',
      missingItems,
      message: 'Insufficient stock for some items. Management approval required.',
    };
  }

  const result = await db.transaction(async (tx) => {
    const [plan] = await tx.insert(consumptionPlans).values({
      tenantId,
      salesOrderId: orderId,
      status: 'PLANNED',
      requestId,
    }).returning();

    const planLines = [];
    for (const si of snapshotItems) {
      const [line] = await tx.insert(consumptionPlanLines).values({
        tenantId,
        consumptionPlanId: plan.id,
        itemId: si.itemId,
        requiredQty: si.totalRequiredQty,
        uom: si.unitName || null,
        notes: `From BOM snapshot item: ${si.itemName}`,
      }).returning();
      planLines.push(line);
    }

    return { plan, lines: planLines };
  });

  return result;
}

export async function approveConsumptionPlanOverride(tenantId: number, planId: number, userId: number, overrideReason: string) {
  const [plan] = await db.select().from(consumptionPlans).where(
    and(eq(consumptionPlans.id, planId), eq(consumptionPlans.tenantId, tenantId))
  );
  if (!plan) throw new ERPError('NOT_FOUND', 'Consumption plan not found', 404);

  const [updated] = await db.update(consumptionPlans)
    .set({
      status: 'APPROVED_OVERRIDE',
      approvedBy: userId,
      approvedAt: new Date(),
      overrideReason,
    })
    .where(and(eq(consumptionPlans.id, planId), eq(consumptionPlans.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function getConsumptionPlan(tenantId: number, orderId: number) {
  const [plan] = await db.select().from(consumptionPlans).where(
    and(eq(consumptionPlans.salesOrderId, orderId), eq(consumptionPlans.tenantId, tenantId))
  );
  if (!plan) throw new ERPError('NOT_FOUND', 'Consumption plan not found for this order', 404);

  const lines = await db.select().from(consumptionPlanLines)
    .where(and(eq(consumptionPlanLines.consumptionPlanId, plan.id), eq(consumptionPlanLines.tenantId, tenantId)));

  return { plan, lines };
}
