import { db } from '../db';
import {
  vouchers, stockLedger, deliveryChallans, goodsReceivingNotes,
  manufacturingOrders, auditLogs
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { ERPError, ERP_ERROR_CODES } from './transactionSafetyService';
import { createVoucherReversal } from './accountingEngineService';
import { reverseStockEntry } from './stockLedgerService';

interface ReversalResult {
  reversalVoucherId?: number;
  reversedStockEntries: number[];
  message: string;
  docType: string;
  docId: number;
}

async function reverseLinkedStockEntries(
  tx: any,
  docType: string,
  docId: number,
  tenantId: number,
  userId: number
): Promise<number[]> {
  const entries = await tx.select({ id: stockLedger.id, isReversed: stockLedger.isReversed })
    .from(stockLedger)
    .where(and(
      eq(stockLedger.docType, docType),
      eq(stockLedger.docId, docId),
      eq(stockLedger.tenantId, tenantId),
      eq(stockLedger.isReversed, false)
    ));

  const reversedIds: number[] = [];
  for (const entry of entries) {
    const reversalId = await reverseStockEntry(entry.id, tenantId, userId);
    await tx.update(stockLedger)
      .set({ isReversed: true })
      .where(and(eq(stockLedger.id, entry.id), eq(stockLedger.tenantId, tenantId)));
    reversedIds.push(reversalId);
  }
  return reversedIds;
}

export async function reverseDeliveryChallan(
  challanId: number,
  tenantId: number,
  userId: number,
  reason: string
): Promise<ReversalResult> {
  return await db.transaction(async (tx) => {
    const [challan] = await tx.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, challanId), eq(deliveryChallans.tenantId, tenantId)));

    if (!challan) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Delivery challan not found', 404);
    }

    if (challan.workflowStatus !== 'POSTED') {
      throw new ERPError(
        ERP_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Only POSTED delivery challans can be reversed',
        400,
        { currentStatus: challan.workflowStatus }
      );
    }

    const existingReversals = await tx.select({ id: stockLedger.id }).from(stockLedger)
      .where(and(
        eq(stockLedger.docType, 'DELIVERY_CHALLAN'),
        eq(stockLedger.docId, challanId),
        eq(stockLedger.tenantId, tenantId),
        sql`${stockLedger.remarks} LIKE 'Reversal of entry%'`
      )).limit(1);

    if (existingReversals.length > 0) {
      throw new ERPError(ERP_ERROR_CODES.ALREADY_PROCESSED, 'This delivery challan has already been reversed', 400);
    }

    const reversedStockEntries = await reverseLinkedStockEntries(tx, 'DELIVERY_CHALLAN', challanId, tenantId, userId);

    let reversalVoucherId: number | undefined;
    if (challan.invoiceVoucherId) {
      const result = await createVoucherReversal(
        challan.invoiceVoucherId,
        tenantId,
        userId,
        new Date().toISOString().split('T')[0],
        `Reversal of Delivery Challan ${challan.challanNumber}: ${reason}`
      );
      reversalVoucherId = result.reversalVoucher.id;
    }

    await tx.update(deliveryChallans)
      .set({ workflowStatus: 'REVERSED', isPosted: false })
      .where(and(eq(deliveryChallans.id, challanId), eq(deliveryChallans.tenantId, tenantId)));

    await tx.insert(auditLogs).values({
      tenantId,
      entityType: 'delivery_challan',
      entityId: challanId,
      action: 'REVERSED',
      performedBy: userId,
      newValues: {
        reason,
        reversedStockEntries,
        reversalVoucherId,
      },
    });

    return {
      reversalVoucherId,
      reversedStockEntries,
      message: `Delivery Challan ${challan.challanNumber} reversed successfully`,
      docType: 'DELIVERY_CHALLAN',
      docId: challanId,
    };
  });
}

export async function reverseGRN(
  grnId: number,
  tenantId: number,
  userId: number,
  reason: string
): Promise<ReversalResult> {
  return await db.transaction(async (tx) => {
    const [grn] = await tx.select().from(goodsReceivingNotes)
      .where(and(eq(goodsReceivingNotes.id, grnId), eq(goodsReceivingNotes.tenantId, tenantId)));

    if (!grn) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'GRN not found', 404);
    }

    const validStatuses = ['POSTED', 'APPROVED', 'approved'];
    if (!validStatuses.includes(grn.workflowStatus || '') && !validStatuses.includes(grn.status)) {
      throw new ERPError(
        ERP_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Only POSTED/APPROVED GRNs can be reversed',
        400,
        { currentStatus: grn.workflowStatus || grn.status }
      );
    }

    const existingReversals = await tx.select({ id: stockLedger.id }).from(stockLedger)
      .where(and(
        eq(stockLedger.docType, 'GRN'),
        eq(stockLedger.docId, grnId),
        eq(stockLedger.tenantId, tenantId),
        sql`${stockLedger.remarks} LIKE 'Reversal of entry%'`
      )).limit(1);

    if (existingReversals.length > 0) {
      throw new ERPError(ERP_ERROR_CODES.ALREADY_PROCESSED, 'This GRN has already been reversed', 400);
    }

    const reversedStockEntries = await reverseLinkedStockEntries(tx, 'GRN', grnId, tenantId, userId);

    await tx.update(goodsReceivingNotes)
      .set({ workflowStatus: 'REVERSED', status: 'reversed' })
      .where(and(eq(goodsReceivingNotes.id, grnId), eq(goodsReceivingNotes.tenantId, tenantId)));

    await tx.insert(auditLogs).values({
      tenantId,
      entityType: 'grn',
      entityId: grnId,
      action: 'REVERSED',
      performedBy: userId,
      newValues: {
        reason,
        reversedStockEntries,
        grnNumber: grn.grnNumber,
      },
    });

    return {
      reversedStockEntries,
      message: `GRN ${grn.grnNumber} reversed successfully`,
      docType: 'GRN',
      docId: grnId,
    };
  });
}

export async function reverseManufacturingOrder(
  orderId: number,
  tenantId: number,
  userId: number,
  reason: string
): Promise<ReversalResult> {
  return await db.transaction(async (tx) => {
    const [order] = await tx.select().from(manufacturingOrders)
      .where(and(eq(manufacturingOrders.id, orderId), eq(manufacturingOrders.tenantId, tenantId)));

    if (!order) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Manufacturing order not found', 404);
    }

    const validStatuses = ['completed', 'COMPLETED', 'POSTED'];
    if (!validStatuses.includes(order.status)) {
      throw new ERPError(
        ERP_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Only completed/posted manufacturing orders can be reversed',
        400,
        { currentStatus: order.status }
      );
    }

    const reversedOutputEntries = await reverseLinkedStockEntries(tx, 'MANUFACTURING_ORDER_OUTPUT', orderId, tenantId, userId);
    const reversedConsumptionEntries = await reverseLinkedStockEntries(tx, 'MANUFACTURING_ORDER_CONSUMPTION', orderId, tenantId, userId);
    const reversedMOEntries = await reverseLinkedStockEntries(tx, 'MANUFACTURING_ORDER', orderId, tenantId, userId);

    const allReversedEntries = [...reversedOutputEntries, ...reversedConsumptionEntries, ...reversedMOEntries];

    let reversalVoucherId: number | undefined;
    const linkedVouchers = await tx.select({ id: vouchers.id }).from(vouchers)
      .where(and(
        eq(vouchers.tenantId, tenantId),
        eq(vouchers.originModule, 'manufacturing'),
        eq(vouchers.originId, orderId),
        eq(vouchers.isPosted, true),
        sql`${vouchers.reversalVoucherId} IS NULL`
      ));

    for (const v of linkedVouchers) {
      try {
        const result = await createVoucherReversal(
          v.id,
          tenantId,
          userId,
          new Date().toISOString().split('T')[0],
          `Reversal of Manufacturing Order ${order.moNumber}: ${reason}`
        );
        reversalVoucherId = result.reversalVoucher.id;
      } catch (e: any) {
        if (e.code !== ERP_ERROR_CODES.ALREADY_PROCESSED) throw e;
      }
    }

    await tx.update(manufacturingOrders)
      .set({ status: 'reversed' })
      .where(and(eq(manufacturingOrders.id, orderId), eq(manufacturingOrders.tenantId, tenantId)));

    await tx.insert(auditLogs).values({
      tenantId,
      entityType: 'manufacturing_order',
      entityId: orderId,
      action: 'REVERSED',
      performedBy: userId,
      newValues: {
        reason,
        reversedStockEntries: allReversedEntries,
        reversalVoucherId,
        moNumber: order.moNumber,
      },
    });

    return {
      reversalVoucherId,
      reversedStockEntries: allReversedEntries,
      message: `Manufacturing Order ${order.moNumber} reversed successfully`,
      docType: 'MANUFACTURING_ORDER',
      docId: orderId,
    };
  });
}

export async function reverseVoucher(
  voucherId: number,
  tenantId: number,
  userId: number,
  reason: string
): Promise<ReversalResult> {
  const today = new Date().toISOString().split('T')[0];
  const result = await createVoucherReversal(voucherId, tenantId, userId, today, reason);

  const reversedStockEntries: number[] = [];
  const linkedStockEntries = await db.select({ id: stockLedger.id })
    .from(stockLedger)
    .where(and(
      eq(stockLedger.accountingVoucherId, voucherId),
      eq(stockLedger.tenantId, tenantId),
      eq(stockLedger.isReversed, false)
    ));

  for (const entry of linkedStockEntries) {
    const reversalId = await reverseStockEntry(entry.id, tenantId, userId);
    await db.update(stockLedger)
      .set({ isReversed: true })
      .where(and(eq(stockLedger.id, entry.id), eq(stockLedger.tenantId, tenantId)));
    reversedStockEntries.push(reversalId);
  }

  return {
    reversalVoucherId: result.reversalVoucher.id,
    reversedStockEntries,
    message: result.message,
    docType: 'VOUCHER',
    docId: voucherId,
  };
}

export async function reverseDocument(
  docType: string,
  docId: number,
  tenantId: number,
  userId: number,
  reason: string
): Promise<ReversalResult> {
  const normalizedType = docType.toUpperCase().replace(/-/g, '_');

  switch (normalizedType) {
    case 'VOUCHER':
      return reverseVoucher(docId, tenantId, userId, reason);
    case 'DELIVERY_CHALLAN':
      return reverseDeliveryChallan(docId, tenantId, userId, reason);
    case 'GRN':
    case 'GOODS_RECEIVING_NOTE':
      return reverseGRN(docId, tenantId, userId, reason);
    case 'MANUFACTURING_ORDER':
      return reverseManufacturingOrder(docId, tenantId, userId, reason);
    default:
      throw new ERPError(
        ERP_ERROR_CODES.INVALID_STATE_TRANSITION,
        `Unsupported document type for reversal: ${docType}`,
        400,
        { docType, supportedTypes: ['VOUCHER', 'DELIVERY_CHALLAN', 'GRN', 'MANUFACTURING_ORDER'] }
      );
  }
}

export async function getReversalHistory(
  docType: string,
  docId: number,
  tenantId: number
): Promise<any[]> {
  const normalizedType = docType.toUpperCase().replace(/-/g, '_');

  const auditEntries = await db.select().from(auditLogs)
    .where(and(
      eq(auditLogs.tenantId, tenantId),
      eq(auditLogs.entityId, docId),
      sql`${auditLogs.action} IN ('REVERSED', 'REVERSAL_CREATED', 'CORRECTION_CREATED')`
    ))
    .orderBy(desc(auditLogs.performedAt));

  if (normalizedType === 'VOUCHER') {
    const [voucher] = await db.select({
      id: vouchers.id,
      voucherNumber: vouchers.voucherNumber,
      isReversal: vouchers.isReversal,
      originalVoucherId: vouchers.originalVoucherId,
      reversalVoucherId: vouchers.reversalVoucherId,
      correctedVoucherId: vouchers.correctedVoucherId,
      reversalReason: vouchers.reversalReason,
      workflowStatus: vouchers.workflowStatus,
    }).from(vouchers)
      .where(and(eq(vouchers.id, docId), eq(vouchers.tenantId, tenantId)));

    if (voucher) {
      const chain: any[] = [{ type: 'original', ...voucher }];

      if (voucher.reversalVoucherId) {
        const [reversal] = await db.select({
          id: vouchers.id,
          voucherNumber: vouchers.voucherNumber,
          voucherDate: vouchers.voucherDate,
          workflowStatus: vouchers.workflowStatus,
        }).from(vouchers)
          .where(and(eq(vouchers.id, voucher.reversalVoucherId), eq(vouchers.tenantId, tenantId)));
        if (reversal) chain.push({ type: 'reversal', ...reversal });
      }

      if (voucher.correctedVoucherId) {
        const [correction] = await db.select({
          id: vouchers.id,
          voucherNumber: vouchers.voucherNumber,
          voucherDate: vouchers.voucherDate,
          workflowStatus: vouchers.workflowStatus,
        }).from(vouchers)
          .where(and(eq(vouchers.id, voucher.correctedVoucherId), eq(vouchers.tenantId, tenantId)));
        if (correction) chain.push({ type: 'correction', ...correction });
      }

      return { chain, auditEntries } as any;
    }
  }

  return auditEntries;
}

export async function getRecentReversals(tenantId: number, days: number = 30): Promise<any[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const reversals = await db.select().from(auditLogs)
    .where(and(
      eq(auditLogs.tenantId, tenantId),
      sql`${auditLogs.action} IN ('REVERSED', 'REVERSAL_CREATED')`,
      sql`${auditLogs.performedAt} >= ${cutoffDate}`
    ))
    .orderBy(desc(auditLogs.performedAt))
    .limit(100);

  return reversals;
}
