import { db } from '../db';
import {
  stockGroups, items, stockLedger,
  goodsReceivingNotes, grnItems,
  deliveryChallans, deliveryChallanItems,
  processOrders,
  stockAdjustments, stockAdjustmentItems,
  vouchers, voucherItems, voucherTypes, voucherStatus,
  fiscalYears, accountingPeriods,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { SequentialIdGenerator } from '../utils/sequentialIdGenerator';

interface GLPostResult {
  posted: boolean;
  voucherId?: number;
  message: string;
}

async function getJournalVoucherTypeId(tenantId: number): Promise<number | null> {
  const [jvType] = await db.select()
    .from(voucherTypes)
    .where(and(eq(voucherTypes.tenantId, tenantId), eq(voucherTypes.code, 'JV')))
    .limit(1);
  return jvType?.id ?? null;
}

async function getDraftStatusId(tenantId: number): Promise<number | null> {
  const [draft] = await db.select()
    .from(voucherStatus)
    .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'DRAFT')))
    .limit(1);
  return draft?.id ?? null;
}

async function getActiveFiscalYear(tenantId: number): Promise<number | null> {
  const [fy] = await db.select()
    .from(fiscalYears)
    .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)))
    .limit(1);
  return fy?.id ?? null;
}

async function existingVoucher(tenantId: number, originModule: string, originType: string, originId: number) {
  const [existing] = await db.select({ id: vouchers.id })
    .from(vouchers)
    .where(and(
      eq(vouchers.tenantId, tenantId),
      eq(vouchers.originModule, originModule),
      eq(vouchers.originType, originType),
      eq(vouchers.originId, originId),
    ))
    .limit(1);
  return existing;
}

async function getItemStockGroup(itemId: number) {
  const [item] = await db.select({
    stockGroupId: items.stockGroupId,
  }).from(items).where(eq(items.id, itemId)).limit(1);
  if (!item?.stockGroupId) return null;

  const [sg] = await db.select().from(stockGroups).where(eq(stockGroups.id, item.stockGroupId)).limit(1);
  return sg ?? null;
}

interface VoucherLine {
  accountId: number;
  description: string;
  debitAmount: string;
  creditAmount: string;
}

async function createGLVoucher(
  tenantId: number,
  userId: number,
  voucherDate: string,
  description: string,
  originModule: string,
  originType: string,
  originId: number,
  originRef: string,
  totalAmount: number,
  lines: VoucherLine[],
): Promise<GLPostResult> {
  const voucherTypeId = await getJournalVoucherTypeId(tenantId);
  if (!voucherTypeId) {
    return { posted: false, message: 'No Journal Voucher type (JV) configured for tenant' };
  }

  const statusId = await getDraftStatusId(tenantId);
  if (!statusId) {
    return { posted: false, message: 'No DRAFT voucher status configured for tenant' };
  }

  const fiscalYearId = await getActiveFiscalYear(tenantId);
  if (!fiscalYearId) {
    return { posted: false, message: 'No active fiscal year found for tenant' };
  }

  const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'JV');

  const [voucher] = await db.insert(vouchers).values({
    voucherNumber,
    voucherTypeId,
    voucherDate,
    fiscalYearId,
    statusId,
    description,
    amount: String(totalAmount),
    originModule,
    originType,
    originId,
    originRef,
    preparedById: userId,
    tenantId,
    workflowStatus: 'DRAFT',
  }).returning();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    await db.insert(voucherItems).values({
      voucherId: voucher.id,
      lineNumber: i + 1,
      accountId: line.accountId,
      description: line.description,
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
      tenantId,
    });
  }

  return { posted: true, voucherId: voucher.id, message: `GL voucher ${voucherNumber} created` };
}

export async function postGLFromGRN(grnId: number, tenantId: number, userId: number): Promise<GLPostResult> {
  try {
    const existing = await existingVoucher(tenantId, 'INVENTORY', 'GRN', grnId);
    if (existing) {
      return { posted: true, voucherId: existing.id, message: 'GL entry already exists for this GRN' };
    }

    const [grn] = await db.select().from(goodsReceivingNotes)
      .where(and(eq(goodsReceivingNotes.id, grnId), eq(goodsReceivingNotes.tenantId, tenantId)));
    if (!grn) return { posted: false, message: 'GRN not found' };

    const grnItemsList = await db.select().from(grnItems)
      .where(eq(grnItems.grnId, grnId));
    if (grnItemsList.length === 0) return { posted: false, message: 'No items found in GRN' };

    const lines: VoucherLine[] = [];
    let totalAmount = 0;

    for (const gi of grnItemsList) {
      const sg = await getItemStockGroup(gi.itemId);
      if (!sg?.inventoryAccountId || !sg?.grniAccountId) {
        console.warn(`[inventoryGL] GRN item ${gi.itemId}: stock group missing GL accounts, skipping`);
        continue;
      }

      const qty = parseFloat(gi.receivedQuantity || '0');
      const rate = parseFloat(gi.unitCost || '0');
      const amount = qty * rate;
      if (amount <= 0) continue;

      totalAmount += amount;

      lines.push({
        accountId: sg.inventoryAccountId,
        description: `Inventory (RM) - GRN ${grn.grnNumber}`,
        debitAmount: String(amount),
        creditAmount: '0',
      });
      lines.push({
        accountId: sg.grniAccountId,
        description: `GRNI - GRN ${grn.grnNumber}`,
        debitAmount: '0',
        creditAmount: String(amount),
      });
    }

    if (lines.length === 0) {
      return { posted: false, message: 'No GL-eligible items found (missing stock group GL accounts)' };
    }

    return await createGLVoucher(
      tenantId, userId, grn.receivingDate,
      `Auto GL from GRN ${grn.grnNumber}`,
      'INVENTORY', 'GRN', grnId, grn.grnNumber,
      totalAmount, lines,
    );
  } catch (error: any) {
    console.error('[inventoryGL] postGLFromGRN error:', error);
    return { posted: false, message: error.message || 'Failed to post GL from GRN' };
  }
}

export async function postGLFromProductionIssue(processOrderId: number, tenantId: number, userId: number): Promise<GLPostResult> {
  try {
    const existing = await existingVoucher(tenantId, 'INVENTORY', 'PROCESS_ORDER_ISSUE', processOrderId);
    if (existing) {
      return { posted: true, voucherId: existing.id, message: 'GL entry already exists for this production issue' };
    }

    const [po] = await db.select().from(processOrders)
      .where(and(eq(processOrders.id, processOrderId), eq(processOrders.tenantId, tenantId)));
    if (!po) return { posted: false, message: 'Process order not found' };

    const outputSg = await getItemStockGroup(po.outputItemId);
    const inputSg = await getItemStockGroup(po.inputItemId);

    if (!outputSg?.wipAccountId) {
      console.warn(`[inventoryGL] Process issue: output item ${po.outputItemId} missing WIP account`);
      return { posted: false, message: 'Output item stock group missing WIP account' };
    }
    if (!inputSg?.inventoryAccountId) {
      console.warn(`[inventoryGL] Process issue: input item ${po.inputItemId} missing inventory account`);
      return { posted: false, message: 'Input item stock group missing inventory account' };
    }

    const qty = parseFloat(po.inputQty || '0');
    const rate = parseFloat(po.inputRate || '0');
    const amount = qty * rate;
    if (amount <= 0) return { posted: false, message: 'Zero amount, skipping GL posting' };

    const lines: VoucherLine[] = [
      {
        accountId: outputSg.wipAccountId,
        description: `WIP - Production Issue ${po.processNumber}`,
        debitAmount: String(amount),
        creditAmount: '0',
      },
      {
        accountId: inputSg.inventoryAccountId,
        description: `RM Inventory - Production Issue ${po.processNumber}`,
        debitAmount: '0',
        creditAmount: String(amount),
      },
    ];

    const postingDate = po.issuedAt
      ? new Date(po.issuedAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    return await createGLVoucher(
      tenantId, userId, postingDate,
      `Auto GL from Production Issue ${po.processNumber}`,
      'INVENTORY', 'PROCESS_ORDER_ISSUE', processOrderId, po.processNumber,
      amount, lines,
    );
  } catch (error: any) {
    console.error('[inventoryGL] postGLFromProductionIssue error:', error);
    return { posted: false, message: error.message || 'Failed to post GL from production issue' };
  }
}

export async function postGLFromProcessReceipt(processOrderId: number, tenantId: number, userId: number): Promise<GLPostResult> {
  try {
    const existing = await existingVoucher(tenantId, 'INVENTORY', 'PROCESS_ORDER_RECEIPT', processOrderId);
    if (existing) {
      return { posted: true, voucherId: existing.id, message: 'GL entry already exists for this process receipt' };
    }

    const [po] = await db.select().from(processOrders)
      .where(and(eq(processOrders.id, processOrderId), eq(processOrders.tenantId, tenantId)));
    if (!po) return { posted: false, message: 'Process order not found' };

    const outputSg = await getItemStockGroup(po.outputItemId);
    if (!outputSg?.inventoryAccountId || !outputSg?.wipAccountId) {
      console.warn(`[inventoryGL] Process receipt: output item ${po.outputItemId} missing GL accounts`);
      return { posted: false, message: 'Output item stock group missing inventory/WIP accounts' };
    }

    const outputQty = parseFloat(po.actualOutputQty || '0');
    const outputRate = parseFloat(po.outputRate || '0');
    const outputAmount = outputQty * outputRate;
    if (outputAmount <= 0) return { posted: false, message: 'Zero output amount, skipping GL posting' };

    const lines: VoucherLine[] = [
      {
        accountId: outputSg.inventoryAccountId,
        description: `Output Inventory - Process Receipt ${po.processNumber}`,
        debitAmount: String(outputAmount),
        creditAmount: '0',
      },
      {
        accountId: outputSg.wipAccountId,
        description: `WIP - Process Receipt ${po.processNumber}`,
        debitAmount: '0',
        creditAmount: String(outputAmount),
      },
    ];

    let totalAmount = outputAmount;

    const processLossQty = parseFloat(po.processLossQty || '0');
    if (processLossQty > 0 && outputSg.adjustmentAccountId) {
      const processLossValue = parseFloat(po.processLossValue || '0');
      if (processLossValue > 0) {
        lines.push({
          accountId: outputSg.adjustmentAccountId,
          description: `Process Loss - ${po.processNumber}`,
          debitAmount: String(processLossValue),
          creditAmount: '0',
        });
        lines.push({
          accountId: outputSg.wipAccountId,
          description: `WIP (Process Loss) - ${po.processNumber}`,
          debitAmount: '0',
          creditAmount: String(processLossValue),
        });
        totalAmount += processLossValue;
      }
    }

    const postingDate = po.receivedAt
      ? new Date(po.receivedAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    return await createGLVoucher(
      tenantId, userId, postingDate,
      `Auto GL from Process Receipt ${po.processNumber}`,
      'INVENTORY', 'PROCESS_ORDER_RECEIPT', processOrderId, po.processNumber,
      totalAmount, lines,
    );
  } catch (error: any) {
    console.error('[inventoryGL] postGLFromProcessReceipt error:', error);
    return { posted: false, message: error.message || 'Failed to post GL from process receipt' };
  }
}

export async function postGLFromDeliveryChallan(challanId: number, tenantId: number, userId: number): Promise<GLPostResult> {
  try {
    const existing = await existingVoucher(tenantId, 'INVENTORY', 'DELIVERY_CHALLAN', challanId);
    if (existing) {
      return { posted: true, voucherId: existing.id, message: 'GL entry already exists for this delivery challan' };
    }

    const [challan] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, challanId), eq(deliveryChallans.tenantId, tenantId)));
    if (!challan) return { posted: false, message: 'Delivery challan not found' };

    const challanItems = await db.select().from(deliveryChallanItems)
      .where(eq(deliveryChallanItems.challanId, challanId));
    if (challanItems.length === 0) return { posted: false, message: 'No items found in delivery challan' };

    const lines: VoucherLine[] = [];
    let totalAmount = 0;

    for (const ci of challanItems) {
      if (!ci.itemId) continue;

      const sg = await getItemStockGroup(ci.itemId);
      if (!sg?.cogsAccountId || !sg?.inventoryAccountId) {
        console.warn(`[inventoryGL] Challan item ${ci.itemId}: stock group missing COGS/Inventory accounts, skipping`);
        continue;
      }

      const qty = parseFloat(ci.quantity || '0');
      const rate = parseFloat(ci.rate || '0');
      const amount = qty * rate;
      if (amount <= 0) continue;

      totalAmount += amount;

      lines.push({
        accountId: sg.cogsAccountId,
        description: `COGS - Delivery ${challan.challanNumber}`,
        debitAmount: String(amount),
        creditAmount: '0',
      });
      lines.push({
        accountId: sg.inventoryAccountId,
        description: `FG Inventory - Delivery ${challan.challanNumber}`,
        debitAmount: '0',
        creditAmount: String(amount),
      });
    }

    if (lines.length === 0) {
      return { posted: false, message: 'No GL-eligible items found (missing stock group GL accounts)' };
    }

    return await createGLVoucher(
      tenantId, userId, challan.challanDate,
      `Auto GL from Delivery Challan ${challan.challanNumber}`,
      'INVENTORY', 'DELIVERY_CHALLAN', challanId, challan.challanNumber,
      totalAmount, lines,
    );
  } catch (error: any) {
    console.error('[inventoryGL] postGLFromDeliveryChallan error:', error);
    return { posted: false, message: error.message || 'Failed to post GL from delivery challan' };
  }
}

export async function postGLFromStockAdjustment(adjustmentId: number, tenantId: number, userId: number): Promise<GLPostResult> {
  try {
    const existing = await existingVoucher(tenantId, 'INVENTORY', 'STOCK_ADJUSTMENT', adjustmentId);
    if (existing) {
      return { posted: true, voucherId: existing.id, message: 'GL entry already exists for this stock adjustment' };
    }

    const [adj] = await db.select().from(stockAdjustments)
      .where(and(eq(stockAdjustments.id, adjustmentId), eq(stockAdjustments.tenantId, tenantId)));
    if (!adj) return { posted: false, message: 'Stock adjustment not found' };

    const adjItems = await db.select().from(stockAdjustmentItems)
      .where(eq(stockAdjustmentItems.adjustmentId, adjustmentId));
    if (adjItems.length === 0) return { posted: false, message: 'No items found in stock adjustment' };

    const lines: VoucherLine[] = [];
    let totalAmount = 0;

    for (const ai of adjItems) {
      const sg = await getItemStockGroup(ai.itemId);
      if (!sg?.inventoryAccountId || !sg?.adjustmentAccountId) {
        console.warn(`[inventoryGL] Adjustment item ${ai.itemId}: stock group missing GL accounts, skipping`);
        continue;
      }

      const diffQty = parseFloat(ai.differenceQty || '0');
      const rate = parseFloat(ai.rate || '0');
      const amount = Math.abs(diffQty * rate);
      if (amount <= 0) continue;

      totalAmount += amount;

      if (diffQty > 0) {
        lines.push({
          accountId: sg.inventoryAccountId,
          description: `Inventory increase - Adjustment ${adj.adjustmentNumber}`,
          debitAmount: String(amount),
          creditAmount: '0',
        });
        lines.push({
          accountId: sg.adjustmentAccountId,
          description: `Stock Adjustment - ${adj.adjustmentNumber}`,
          debitAmount: '0',
          creditAmount: String(amount),
        });
      } else {
        lines.push({
          accountId: sg.adjustmentAccountId,
          description: `Stock Adjustment - ${adj.adjustmentNumber}`,
          debitAmount: String(amount),
          creditAmount: '0',
        });
        lines.push({
          accountId: sg.inventoryAccountId,
          description: `Inventory decrease - Adjustment ${adj.adjustmentNumber}`,
          debitAmount: '0',
          creditAmount: String(amount),
        });
      }
    }

    if (lines.length === 0) {
      return { posted: false, message: 'No GL-eligible items found (missing stock group GL accounts)' };
    }

    return await createGLVoucher(
      tenantId, userId, adj.adjustmentDate,
      `Auto GL from Stock Adjustment ${adj.adjustmentNumber}`,
      'INVENTORY', 'STOCK_ADJUSTMENT', adjustmentId, adj.adjustmentNumber,
      totalAmount, lines,
    );
  } catch (error: any) {
    console.error('[inventoryGL] postGLFromStockAdjustment error:', error);
    return { posted: false, message: error.message || 'Failed to post GL from stock adjustment' };
  }
}

export async function postGLFromWarehouseTransfer(transferId: number, tenantId: number, userId: number): Promise<GLPostResult> {
  return { posted: false, message: 'Warehouse transfers have no GL impact (same inventory account). Skipped.' };
}
