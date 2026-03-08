import { db } from '../db';
import { stockLedger, items, deliveryChallanItems, deliveryChallans } from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

export async function postStockFromDeliveryChallan(challanId: number, tenantId: number, userId: number) {
  const [challan] = await db.select().from(deliveryChallans)
    .where(and(eq(deliveryChallans.id, challanId), eq(deliveryChallans.tenantId, tenantId)));
  if (!challan || challan.workflowStatus !== 'POSTED') {
    throw new Error('Challan must be in POSTED status to post stock');
  }

  const existing = await db.select().from(stockLedger)
    .where(and(
      eq(stockLedger.docType, 'DELIVERY_CHALLAN'),
      eq(stockLedger.docId, challanId),
      eq(stockLedger.tenantId, tenantId),
      eq(stockLedger.isReversed, false)
    ));
  if (existing.length > 0) {
    return { alreadyPosted: true, entries: existing };
  }

  const challanItems = await db.select().from(deliveryChallanItems)
    .where(and(eq(deliveryChallanItems.challanId, challanId), eq(deliveryChallanItems.tenantId, tenantId)));

  if (challanItems.length === 0) {
    throw new Error('No items found in delivery challan');
  }

  const entries = [];
  for (const item of challanItems) {
    if (!item.itemId) continue;

    const currentBalance = await getCurrentStock(item.itemId, challan.warehouseId, tenantId);
    const qtyOut = parseFloat(item.quantity || '0');
    const rate = parseFloat(item.rate || '0');
    const newBalance = currentBalance - qtyOut;

    const valuationData = await getWeightedAverageRate(item.itemId, challan.warehouseId, tenantId);
    const valuationRate = valuationData.rate;
    const valueOut = qtyOut * valuationRate;
    const newBalanceValue = newBalance * valuationRate;

    const [entry] = await db.insert(stockLedger).values({
      docType: 'DELIVERY_CHALLAN',
      docId: challanId,
      docNumber: challan.challanNumber,
      postingDate: challan.challanDate,
      itemId: item.itemId,
      itemCode: item.itemCode || null,
      itemName: item.itemName,
      warehouseId: challan.warehouseId,
      warehouseName: null,
      qtyIn: '0',
      qtyOut: String(qtyOut),
      balanceQty: String(newBalance),
      rate: String(rate),
      valuationRate: String(valuationRate),
      valueIn: '0',
      valueOut: String(qtyOut * valuationRate),
      balanceValue: String(newBalanceValue),
      unit: item.unit || null,
      batchNumber: item.batchNumber || null,
      partyId: challan.partyId,
      partyName: null,
      remarks: `Stock out via Delivery Challan ${challan.challanNumber}`,
      isReversed: false,
      tenantId,
      createdBy: userId,
    }).returning();
    entries.push(entry);
  }

  return { alreadyPosted: false, entries };
}

export async function postStockFromGRN(grnId: number, grnNumber: string, grnDate: string, grnItems: any[], warehouseId: number | null, partyId: number | null, tenantId: number, userId: number) {
  const existing = await db.select().from(stockLedger)
    .where(and(
      eq(stockLedger.docType, 'GRN'),
      eq(stockLedger.docId, grnId),
      eq(stockLedger.tenantId, tenantId),
      eq(stockLedger.isReversed, false)
    ));
  if (existing.length > 0) {
    return { alreadyPosted: true, entries: existing };
  }

  const entries = [];
  for (const item of grnItems) {
    if (!item.itemId) continue;

    const currentBalance = await getCurrentStock(item.itemId, warehouseId, tenantId);
    const qtyIn = parseFloat(item.receivedQty || item.quantity || '0');
    const rate = parseFloat(item.rate || item.unitPrice || '0');
    const valueIn = qtyIn * rate;
    const newBalance = currentBalance + qtyIn;

    const valuationData = await getWeightedAverageRate(item.itemId, warehouseId, tenantId);
    const oldValue = valuationData.qty * valuationData.rate;
    const newTotalQty = valuationData.qty + qtyIn;
    const newValuationRate = newTotalQty > 0 ? (oldValue + valueIn) / newTotalQty : rate;
    const newBalanceValue = newBalance * newValuationRate;

    const [entry] = await db.insert(stockLedger).values({
      docType: 'GRN',
      docId: grnId,
      docNumber: grnNumber,
      postingDate: grnDate,
      itemId: item.itemId,
      itemCode: item.itemCode || null,
      itemName: item.itemName || item.name || '',
      warehouseId,
      warehouseName: null,
      qtyIn: String(qtyIn),
      qtyOut: '0',
      balanceQty: String(newBalance),
      rate: String(rate),
      valuationRate: String(newValuationRate),
      valueIn: String(valueIn),
      valueOut: '0',
      balanceValue: String(newBalanceValue),
      unit: item.unit || null,
      batchNumber: item.batchNumber || null,
      partyId,
      partyName: null,
      remarks: `Stock in via GRN ${grnNumber}`,
      isReversed: false,
      tenantId,
      createdBy: userId,
    }).returning();
    entries.push(entry);
  }

  return { alreadyPosted: false, entries };
}

export async function postStockFromAdjustment(adjustmentId: number, adjustmentNumber: string, adjustmentDate: string, adjustmentItems: any[], warehouseId: number | null, tenantId: number, userId: number) {
  const existing = await db.select().from(stockLedger)
    .where(and(
      eq(stockLedger.docType, 'STOCK_ADJUSTMENT'),
      eq(stockLedger.docId, adjustmentId),
      eq(stockLedger.tenantId, tenantId),
      eq(stockLedger.isReversed, false)
    ));
  if (existing.length > 0) {
    return { alreadyPosted: true, entries: existing };
  }

  const entries = [];
  for (const item of adjustmentItems) {
    if (!item.itemId) continue;

    const currentBalance = await getCurrentStock(item.itemId, warehouseId, tenantId);
    const difference = parseFloat(item.differenceQty || '0');
    const qtyIn = difference > 0 ? difference : 0;
    const qtyOut = difference < 0 ? Math.abs(difference) : 0;
    const newBalance = currentBalance + difference;
    const rate = parseFloat(item.rate || '0');

    const valuationData = await getWeightedAverageRate(item.itemId, warehouseId, tenantId);
    const valuationRate = valuationData.rate || rate;
    const newBalanceValue = newBalance * valuationRate;

    const [entry] = await db.insert(stockLedger).values({
      docType: 'STOCK_ADJUSTMENT',
      docId: adjustmentId,
      docNumber: adjustmentNumber,
      postingDate: adjustmentDate,
      itemId: item.itemId,
      itemCode: item.itemCode || null,
      itemName: item.itemName || '',
      warehouseId,
      warehouseName: null,
      qtyIn: String(qtyIn),
      qtyOut: String(qtyOut),
      balanceQty: String(newBalance),
      rate: String(rate),
      valuationRate: String(valuationRate),
      valueIn: String(qtyIn * rate),
      valueOut: String(qtyOut * rate),
      balanceValue: String(newBalanceValue),
      unit: item.unit || null,
      batchNumber: item.batchNumber || null,
      partyId: null,
      partyName: null,
      remarks: `Stock adjustment ${adjustmentNumber}`,
      isReversed: false,
      tenantId,
      createdBy: userId,
    }).returning();
    entries.push(entry);
  }

  return { alreadyPosted: false, entries };
}

export async function getCurrentStock(itemId: number, warehouseId: number | null | undefined, tenantId: number): Promise<number> {
  const conditions = [
    eq(stockLedger.itemId, itemId),
    eq(stockLedger.tenantId, tenantId),
    eq(stockLedger.isReversed, false),
  ];
  if (warehouseId) {
    conditions.push(eq(stockLedger.warehouseId, warehouseId));
  }

  const result = await db.select({
    totalIn: sql<string>`COALESCE(SUM(CAST(qty_in AS numeric)), 0)`,
    totalOut: sql<string>`COALESCE(SUM(CAST(qty_out AS numeric)), 0)`,
  }).from(stockLedger).where(and(...conditions));

  const totalIn = parseFloat(result[0]?.totalIn || '0');
  const totalOut = parseFloat(result[0]?.totalOut || '0');
  return totalIn - totalOut;
}

export async function getWeightedAverageRate(itemId: number, warehouseId: number | null | undefined, tenantId: number): Promise<{ rate: number; qty: number }> {
  const conditions = [
    eq(stockLedger.itemId, itemId),
    eq(stockLedger.tenantId, tenantId),
    eq(stockLedger.isReversed, false),
  ];
  if (warehouseId) {
    conditions.push(eq(stockLedger.warehouseId, warehouseId));
  }

  const result = await db.select({
    totalQtyIn: sql<string>`COALESCE(SUM(CAST(qty_in AS numeric)), 0)`,
    totalQtyOut: sql<string>`COALESCE(SUM(CAST(qty_out AS numeric)), 0)`,
    totalValueIn: sql<string>`COALESCE(SUM(CAST(value_in AS numeric)), 0)`,
    totalValueOut: sql<string>`COALESCE(SUM(CAST(value_out AS numeric)), 0)`,
  }).from(stockLedger).where(and(...conditions));

  const totalQtyIn = parseFloat(result[0]?.totalQtyIn || '0');
  const totalQtyOut = parseFloat(result[0]?.totalQtyOut || '0');
  const totalValueIn = parseFloat(result[0]?.totalValueIn || '0');
  const totalValueOut = parseFloat(result[0]?.totalValueOut || '0');
  
  const currentQty = totalQtyIn - totalQtyOut;
  const currentValue = totalValueIn - totalValueOut;
  const rate = currentQty > 0 ? currentValue / currentQty : 0;

  return { rate, qty: currentQty };
}

export async function getItemMovementHistory(itemId: number, tenantId: number, warehouseId?: number, limit = 100) {
  const conditions: any[] = [
    eq(stockLedger.itemId, itemId),
    eq(stockLedger.tenantId, tenantId),
  ];
  if (warehouseId) {
    conditions.push(eq(stockLedger.warehouseId, warehouseId));
  }

  return db.select().from(stockLedger)
    .where(and(...conditions))
    .orderBy(desc(stockLedger.postingDate), desc(stockLedger.id))
    .limit(limit);
}

export async function getStockSummary(tenantId: number, warehouseId?: number) {
  let query;
  if (warehouseId) {
    query = sql`
      SELECT 
        sl.item_id,
        sl.item_code,
        sl.item_name,
        sl.warehouse_id,
        sl.warehouse_name,
        sl.unit,
        COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) as total_in,
        COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as total_out,
        COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as current_qty,
        COALESCE(SUM(CAST(sl.value_in AS numeric)), 0) as total_value_in,
        COALESCE(SUM(CAST(sl.value_out AS numeric)), 0) as total_value_out,
        COALESCE(SUM(CAST(sl.value_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.value_out AS numeric)), 0) as current_value
      FROM stock_ledger sl
      WHERE sl.tenant_id = ${tenantId} AND sl.is_reversed = false AND sl.warehouse_id = ${warehouseId}
      GROUP BY sl.item_id, sl.item_code, sl.item_name, sl.warehouse_id, sl.warehouse_name, sl.unit
      ORDER BY sl.item_name
    `;
  } else {
    query = sql`
      SELECT 
        sl.item_id,
        sl.item_code,
        sl.item_name,
        sl.warehouse_id,
        sl.warehouse_name,
        sl.unit,
        COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) as total_in,
        COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as total_out,
        COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as current_qty,
        COALESCE(SUM(CAST(sl.value_in AS numeric)), 0) as total_value_in,
        COALESCE(SUM(CAST(sl.value_out AS numeric)), 0) as total_value_out,
        COALESCE(SUM(CAST(sl.value_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.value_out AS numeric)), 0) as current_value
      FROM stock_ledger sl
      WHERE sl.tenant_id = ${tenantId} AND sl.is_reversed = false
      GROUP BY sl.item_id, sl.item_code, sl.item_name, sl.warehouse_id, sl.warehouse_name, sl.unit
      ORDER BY sl.item_name
    `;
  }
  return db.execute(query);
}

export async function markStockEntryPosted(entryId: number, voucherId: number, tenantId: number): Promise<void> {
  const [entry] = await db.select({ id: stockLedger.id, postingStatus: stockLedger.postingStatus })
    .from(stockLedger)
    .where(and(eq(stockLedger.id, entryId), eq(stockLedger.tenantId, tenantId)));

  if (!entry) throw new Error(`Stock ledger entry ${entryId} not found`);
  if (entry.postingStatus === 'POSTED') throw new Error(`Stock ledger entry ${entryId} is already POSTED and immutable`);

  await db.update(stockLedger)
    .set({ accountingVoucherId: voucherId, postingStatus: 'POSTED' })
    .where(and(eq(stockLedger.id, entryId), eq(stockLedger.tenantId, tenantId)));
}

export async function validateStockEntryImmutable(entryId: number, tenantId: number): Promise<boolean> {
  const [entry] = await db.select({ postingStatus: stockLedger.postingStatus })
    .from(stockLedger)
    .where(and(eq(stockLedger.id, entryId), eq(stockLedger.tenantId, tenantId)));
  return entry?.postingStatus === 'POSTED';
}

export async function reverseStockEntry(entryId: number, tenantId: number, userId: number): Promise<number> {
  const [entry] = await db.select()
    .from(stockLedger)
    .where(and(eq(stockLedger.id, entryId), eq(stockLedger.tenantId, tenantId)));

  if (!entry) throw new Error(`Stock ledger entry ${entryId} not found`);
  if (entry.isReversed) throw new Error(`Stock ledger entry ${entryId} is already reversed`);

  const currentBalance = await getCurrentStock(entry.itemId, entry.warehouseId, tenantId);
  const qtyIn = parseFloat(entry.qtyOut || '0');
  const qtyOut = parseFloat(entry.qtyIn || '0');
  const valueIn = parseFloat(entry.valueOut || '0');
  const valueOut = parseFloat(entry.valueIn || '0');
  const newBalance = currentBalance + qtyIn - qtyOut;

  const valuationData = await getWeightedAverageRate(entry.itemId, entry.warehouseId, tenantId);
  const valuationRate = valuationData.rate;

  const [reversal] = await db.insert(stockLedger).values({
    docType: entry.docType,
    docId: entry.docId,
    docNumber: entry.docNumber ? `REV-${entry.docNumber}` : null,
    postingDate: entry.postingDate,
    itemId: entry.itemId,
    itemCode: entry.itemCode,
    itemName: entry.itemName,
    warehouseId: entry.warehouseId,
    warehouseName: entry.warehouseName,
    qtyIn: String(qtyIn),
    qtyOut: String(qtyOut),
    balanceQty: String(newBalance),
    rate: entry.rate,
    valuationRate: String(valuationRate),
    valueIn: String(valueIn),
    valueOut: String(valueOut),
    balanceValue: String(newBalance * valuationRate),
    unit: entry.unit,
    batchNumber: entry.batchNumber,
    partyId: entry.partyId,
    partyName: entry.partyName,
    remarks: `Reversal of entry #${entryId}`,
    isReversed: false,
    reversedById: entryId,
    postingStatus: 'PENDING_POSTING',
    tenantId,
    createdBy: userId,
  }).returning();

  return reversal.id;
}
