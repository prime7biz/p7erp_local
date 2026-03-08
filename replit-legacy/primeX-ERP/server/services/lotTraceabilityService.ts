import { db } from "../db";
import { lots, lotTransactions, lotAllocations } from "@shared/schema";
import { eq, and, sql, lte, gte } from "drizzle-orm";

export async function createLot(data: any, tenantId: number) {
  const [lot] = await db.insert(lots).values({
    ...data,
    tenantId,
    remainingQty: data.remainingQty || data.quantity,
  }).returning();
  return lot;
}

export async function getLots(tenantId: number, filters?: { itemId?: number; status?: string; warehouseId?: number }) {
  const conditions: any[] = [eq(lots.tenantId, tenantId)];
  if (filters?.itemId) conditions.push(eq(lots.itemId, filters.itemId));
  if (filters?.status) conditions.push(eq(lots.status, filters.status));
  if (filters?.warehouseId) conditions.push(eq(lots.warehouseId, filters.warehouseId));

  return db.select().from(lots).where(and(...conditions)).orderBy(sql`${lots.createdAt} DESC`);
}

export async function getLot(id: number, tenantId: number) {
  const [lot] = await db.select().from(lots).where(and(eq(lots.id, id), eq(lots.tenantId, tenantId)));
  if (!lot) return null;

  const transactions = await db.select().from(lotTransactions)
    .where(and(eq(lotTransactions.lotId, id), eq(lotTransactions.tenantId, tenantId)))
    .orderBy(sql`${lotTransactions.transactionDate} DESC`);

  const allocations = await db.select().from(lotAllocations)
    .where(and(eq(lotAllocations.lotId, id), eq(lotAllocations.tenantId, tenantId)))
    .orderBy(sql`${lotAllocations.createdAt} DESC`);

  return { ...lot, transactions, allocations };
}

export async function updateLotStatus(id: number, status: string, tenantId: number) {
  const validStatuses = ["AVAILABLE", "RESERVED", "DEPLETED", "EXPIRED", "ON_HOLD", "QUARANTINE"];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`);
  }

  const [updated] = await db.update(lots)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(lots.id, id), eq(lots.tenantId, tenantId)))
    .returning();
  return updated;
}

export async function recordLotTransaction(data: any, tenantId: number, userId: number) {
  const [lot] = await db.select().from(lots).where(and(eq(lots.id, data.lotId), eq(lots.tenantId, tenantId)));
  if (!lot) throw new Error("Lot not found");

  const qty = parseFloat(data.quantity);
  const currentRemaining = parseFloat(lot.remainingQty);

  let newRemaining = currentRemaining;
  const issueTypes = ["ISSUE", "PRODUCTION_OUT"];
  const receiptTypes = ["RECEIPT", "RETURN", "PRODUCTION_IN"];

  if (issueTypes.includes(data.transactionType)) {
    if (qty > currentRemaining) throw new Error("Insufficient quantity in lot");
    newRemaining = currentRemaining - qty;
  } else if (receiptTypes.includes(data.transactionType)) {
    newRemaining = currentRemaining + qty;
  } else if (data.transactionType === "ADJUSTMENT") {
    newRemaining = qty;
  }

  const newStatus = newRemaining <= 0 ? "DEPLETED" : lot.status === "DEPLETED" ? "AVAILABLE" : lot.status;

  return await db.transaction(async (tx) => {
    const [transaction] = await tx.insert(lotTransactions).values({
      ...data,
      tenantId,
      performedBy: userId,
    }).returning();

    await tx.update(lots)
      .set({
        remainingQty: newRemaining.toFixed(4),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(lots.id, data.lotId));

    return transaction;
  });
}

export async function allocateLot(lotId: number, allocationType: string, allocationId: number, qty: number, tenantId: number) {
  const [lot] = await db.select().from(lots).where(and(eq(lots.id, lotId), eq(lots.tenantId, tenantId)));
  if (!lot) throw new Error("Lot not found");

  const currentRemaining = parseFloat(lot.remainingQty);
  if (qty > currentRemaining) throw new Error("Insufficient quantity for allocation");

  return await db.transaction(async (tx) => {
    const [allocation] = await tx.insert(lotAllocations).values({
      tenantId,
      lotId,
      allocationType,
      allocationId,
      allocatedQty: qty.toFixed(4),
    }).returning();

    const newRemaining = currentRemaining - qty;
    await tx.update(lots)
      .set({
        remainingQty: newRemaining.toFixed(4),
        status: newRemaining <= 0 ? "DEPLETED" : "RESERVED",
        updatedAt: new Date(),
      })
      .where(eq(lots.id, lotId));

    return allocation;
  });
}

export async function issueLotAllocation(allocationId: number, qty: number, tenantId: number, userId: number) {
  const [allocation] = await db.select().from(lotAllocations)
    .where(and(eq(lotAllocations.id, allocationId), eq(lotAllocations.tenantId, tenantId)));
  if (!allocation) throw new Error("Allocation not found");

  const currentIssued = parseFloat(allocation.issuedQty || "0");
  const allocatedQty = parseFloat(allocation.allocatedQty);
  if (currentIssued + qty > allocatedQty) throw new Error("Issue quantity exceeds allocated quantity");

  const newIssued = currentIssued + qty;
  const newStatus = newIssued >= allocatedQty ? "FULLY_ISSUED" : "PARTIALLY_ISSUED";

  return await db.transaction(async (tx) => {
    const [updated] = await tx.update(lotAllocations)
      .set({ issuedQty: newIssued.toFixed(4), status: newStatus })
      .where(eq(lotAllocations.id, allocationId))
      .returning();

    await tx.insert(lotTransactions).values({
      tenantId,
      lotId: allocation.lotId,
      transactionType: "ISSUE",
      quantity: qty.toFixed(4),
      referenceType: allocation.allocationType,
      referenceId: allocation.allocationId,
      performedBy: userId,
    });

    return updated;
  });
}

export async function getTraceabilityReport(lotId: number, tenantId: number) {
  const lot = await getLot(lotId, tenantId);
  if (!lot) throw new Error("Lot not found");

  const receiptTxns = lot.transactions.filter((t: any) => ["RECEIPT", "PRODUCTION_IN", "RETURN"].includes(t.transactionType));
  const issueTxns = lot.transactions.filter((t: any) => ["ISSUE", "PRODUCTION_OUT"].includes(t.transactionType));
  const transferTxns = lot.transactions.filter((t: any) => t.transactionType === "TRANSFER");

  return {
    lot: {
      id: lot.id,
      lotNumber: lot.lotNumber,
      itemId: lot.itemId,
      quantity: lot.quantity,
      remainingQty: lot.remainingQty,
      status: lot.status,
      batchDate: lot.batchDate,
      expiryDate: lot.expiryDate,
    },
    receipt: receiptTxns,
    allocations: lot.allocations,
    issues: issueTxns,
    transfers: transferTxns,
    timeline: lot.transactions,
  };
}

export async function getLotsByItem(itemId: number, tenantId: number) {
  return db.select().from(lots)
    .where(and(eq(lots.itemId, itemId), eq(lots.tenantId, tenantId)))
    .orderBy(sql`${lots.createdAt} DESC`);
}

export async function getExpiringLots(tenantId: number, daysAhead: number) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(now.getDate() + daysAhead);

  return db.select().from(lots)
    .where(and(
      eq(lots.tenantId, tenantId),
      sql`${lots.expiryDate} IS NOT NULL`,
      lte(lots.expiryDate, futureDate.toISOString().split('T')[0]),
      gte(lots.expiryDate, now.toISOString().split('T')[0]),
      sql`${lots.status} NOT IN ('DEPLETED', 'EXPIRED')`,
    ))
    .orderBy(sql`${lots.expiryDate} ASC`);
}
