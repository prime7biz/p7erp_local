import { db } from '../../db';
import { stockLedger } from '@shared/schema';
import { eq, and, sql, lte } from 'drizzle-orm';

export const VALUATION_METHOD = 'WEIGHTED_AVERAGE' as const;
export const CURRENCY = 'BDT';

export interface ItemValuation {
  itemId: number;
  itemCode: string | null;
  itemName: string | null;
  warehouseId: number | null;
  warehouseName: string | null;
  qtyOnHand: number;
  avgCost: number;
  totalValue: number;
  unit: string | null;
}

export interface COGSSummary {
  totalCOGS: number;
  items: Array<{
    itemId: number;
    itemCode: string | null;
    itemName: string | null;
    qtyConsumed: number;
    avgCostAtConsumption: number;
    totalCost: number;
  }>;
}

export interface ValuationSnapshot {
  asOfDate: string;
  valuationMethod: string;
  currency: string;
  totalValue: number;
  itemCount: number;
  items: ItemValuation[];
}

export async function getInventoryValuation(tenantId: number, asOfDate: string, warehouseId?: number, postedOnly?: boolean): Promise<ValuationSnapshot> {
  const conditions: any[] = [
    eq(stockLedger.tenantId, tenantId),
    eq(stockLedger.isReversed, false),
    lte(stockLedger.postingDate, asOfDate),
  ];
  if (warehouseId) {
    conditions.push(eq(stockLedger.warehouseId, warehouseId));
  }
  if (postedOnly) {
    conditions.push(sql`posting_status = 'POSTED'`);
  }

  const rows = await db.select({
    itemId: stockLedger.itemId,
    itemCode: stockLedger.itemCode,
    itemName: stockLedger.itemName,
    warehouseId: stockLedger.warehouseId,
    warehouseName: stockLedger.warehouseName,
    unit: stockLedger.unit,
    totalQtyIn: sql<string>`COALESCE(SUM(CAST(${stockLedger.qtyIn} AS numeric)), 0)`,
    totalQtyOut: sql<string>`COALESCE(SUM(CAST(${stockLedger.qtyOut} AS numeric)), 0)`,
    totalValueIn: sql<string>`COALESCE(SUM(CAST(${stockLedger.valueIn} AS numeric)), 0)`,
    totalValueOut: sql<string>`COALESCE(SUM(CAST(${stockLedger.valueOut} AS numeric)), 0)`,
  })
  .from(stockLedger)
  .where(and(...conditions))
  .groupBy(stockLedger.itemId, stockLedger.itemCode, stockLedger.itemName, stockLedger.warehouseId, stockLedger.warehouseName, stockLedger.unit);

  const items: ItemValuation[] = [];
  let totalValue = 0;

  for (const row of rows) {
    const qtyOnHand = parseFloat(row.totalQtyIn) - parseFloat(row.totalQtyOut);
    const value = parseFloat(row.totalValueIn) - parseFloat(row.totalValueOut);
    if (qtyOnHand <= 0 && value <= 0) continue;
    
    const avgCost = qtyOnHand > 0 ? value / qtyOnHand : 0;
    const roundedValue = Math.round(value * 100) / 100;
    totalValue += roundedValue;

    items.push({
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      qtyOnHand: Math.round(qtyOnHand * 10000) / 10000,
      avgCost: Math.round(avgCost * 10000) / 10000,
      totalValue: roundedValue,
      unit: row.unit,
    });
  }

  return {
    asOfDate,
    valuationMethod: VALUATION_METHOD,
    currency: CURRENCY,
    totalValue: Math.round(totalValue * 100) / 100,
    itemCount: items.length,
    items,
  };
}

export async function calculateCOGS(tenantId: number, startDate: string, endDate: string, warehouseId?: number): Promise<COGSSummary> {
  const conditions: any[] = [
    eq(stockLedger.tenantId, tenantId),
    eq(stockLedger.isReversed, false),
    sql`${stockLedger.postingDate} >= ${startDate}`,
    sql`${stockLedger.postingDate} <= ${endDate}`,
    sql`CAST(${stockLedger.qtyOut} AS numeric) > 0`,
  ];
  if (warehouseId) {
    conditions.push(eq(stockLedger.warehouseId, warehouseId));
  }

  const rows = await db.select({
    itemId: stockLedger.itemId,
    itemCode: stockLedger.itemCode,
    itemName: stockLedger.itemName,
    totalQtyOut: sql<string>`COALESCE(SUM(CAST(${stockLedger.qtyOut} AS numeric)), 0)`,
    totalValueOut: sql<string>`COALESCE(SUM(CAST(${stockLedger.valueOut} AS numeric)), 0)`,
  })
  .from(stockLedger)
  .where(and(...conditions))
  .groupBy(stockLedger.itemId, stockLedger.itemCode, stockLedger.itemName);

  let totalCOGS = 0;
  const cogsItems = rows.map(row => {
    const qtyConsumed = parseFloat(row.totalQtyOut);
    const totalCost = parseFloat(row.totalValueOut);
    const avgCostAtConsumption = qtyConsumed > 0 ? totalCost / qtyConsumed : 0;
    totalCOGS += totalCost;
    return {
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      qtyConsumed: Math.round(qtyConsumed * 10000) / 10000,
      avgCostAtConsumption: Math.round(avgCostAtConsumption * 10000) / 10000,
      totalCost: Math.round(totalCost * 100) / 100,
    };
  });

  return {
    totalCOGS: Math.round(totalCOGS * 100) / 100,
    items: cogsItems,
  };
}

export async function getPendingPostingCount(tenantId: number, asOfDate?: string): Promise<number> {
  const conditions: any[] = [
    eq(stockLedger.tenantId, tenantId),
    eq(stockLedger.isReversed, false),
    sql`posting_status = 'PENDING_POSTING'`,
  ];
  if (asOfDate) {
    conditions.push(lte(stockLedger.postingDate, asOfDate));
  }

  const [result] = await db.select({
    count: sql<number>`COUNT(*)`,
  })
  .from(stockLedger)
  .where(and(...conditions));

  return Number(result?.count || 0);
}

export function validatePeriodClose(pendingCount: number): { canClose: boolean; reason?: string } {
  if (pendingCount > 0) {
    return {
      canClose: false,
      reason: `Cannot close period: ${pendingCount} stock ledger entries have PENDING_POSTING status. All inventory moves must be linked to accounting vouchers before closing.`,
    };
  }
  return { canClose: true };
}

export async function getItemWeightedAvgCost(itemId: number, tenantId: number, asOfDate: string, warehouseId?: number): Promise<{ qty: number; avgCost: number; totalValue: number }> {
  const conditions: any[] = [
    eq(stockLedger.itemId, itemId),
    eq(stockLedger.tenantId, tenantId),
    eq(stockLedger.isReversed, false),
    lte(stockLedger.postingDate, asOfDate),
  ];
  if (warehouseId) {
    conditions.push(eq(stockLedger.warehouseId, warehouseId));
  }

  const [result] = await db.select({
    totalQtyIn: sql<string>`COALESCE(SUM(CAST(${stockLedger.qtyIn} AS numeric)), 0)`,
    totalQtyOut: sql<string>`COALESCE(SUM(CAST(${stockLedger.qtyOut} AS numeric)), 0)`,
    totalValueIn: sql<string>`COALESCE(SUM(CAST(${stockLedger.valueIn} AS numeric)), 0)`,
    totalValueOut: sql<string>`COALESCE(SUM(CAST(${stockLedger.valueOut} AS numeric)), 0)`,
  })
  .from(stockLedger)
  .where(and(...conditions));

  const qty = parseFloat(result?.totalQtyIn || '0') - parseFloat(result?.totalQtyOut || '0');
  const totalValue = parseFloat(result?.totalValueIn || '0') - parseFloat(result?.totalValueOut || '0');
  const avgCost = qty > 0 ? totalValue / qty : 0;

  return {
    qty: Math.round(qty * 10000) / 10000,
    avgCost: Math.round(avgCost * 10000) / 10000,
    totalValue: Math.round(totalValue * 100) / 100,
  };
}
