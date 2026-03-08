import { db } from '../db';
import {
  productionOrders, productionConsumptions, productionOutputs,
  productionAccountingConfig, stockLedger, vouchers, voucherItems,
  ledgerPostings, voucherTypes, voucherStatus, fiscalYears, items
} from '@shared/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { getCurrentStock, getWeightedAverageRate } from './stockLedgerService';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';
import { SequentialIdGenerator } from '../utils/sequentialIdGenerator';

async function generateOrderNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'PO',
    tableName: 'production_orders',
    columnName: 'order_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

export async function createProductionOrder(
  tenantId: number,
  userId: number,
  data: {
    processType: string;
    processMethod?: string;
    inputItemId: number;
    inputItemName: string;
    outputItemId: number;
    outputItemName: string;
    plannedInputQty: string;
    plannedOutputQty: string;
    warehouseFromId?: number;
    warehouseToId?: number;
    subcontractorPartyId?: number;
    processCost?: string;
    currency?: string;
    orderId?: number;
    remarks?: string;
  }
) {
  const orderNumber = await generateOrderNumber(tenantId);

  const [order] = await db.insert(productionOrders).values({
    tenantId,
    orderNumber,
    processType: data.processType,
    processMethod: data.processMethod || 'IN_HOUSE',
    inputItemId: data.inputItemId,
    inputItemName: data.inputItemName,
    outputItemId: data.outputItemId,
    outputItemName: data.outputItemName,
    plannedInputQty: data.plannedInputQty,
    plannedOutputQty: data.plannedOutputQty,
    warehouseFromId: data.warehouseFromId || null,
    warehouseToId: data.warehouseToId || null,
    subcontractorPartyId: data.subcontractorPartyId || null,
    processCost: data.processCost || '0',
    currency: data.currency || 'BDT',
    orderId: data.orderId || null,
    remarks: data.remarks || null,
    status: 'DRAFT',
    createdBy: userId,
  }).returning();

  return order;
}

export async function approveProductionOrder(tenantId: number, orderId: number, userId: number) {
  const [order] = await db.select().from(productionOrders)
    .where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tenantId)));

  if (!order) throw new Error('Production order not found');
  if (order.status !== 'DRAFT') throw new Error('Only DRAFT orders can be approved');

  const [updated] = await db.update(productionOrders).set({
    status: 'APPROVED',
    approvedBy: userId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function startProductionOrder(
  tenantId: number,
  orderId: number,
  userId: number,
  overrideReason?: string
) {
  const [order] = await db.select().from(productionOrders)
    .where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tenantId)));

  if (!order) throw new Error('Production order not found');
  if (order.status !== 'APPROVED') throw new Error('Only APPROVED orders can be started');

  return await db.transaction(async (tx) => {
    const currentStock = await getCurrentStock(order.inputItemId, order.warehouseFromId, tenantId);
    const plannedQty = parseFloat(order.plannedInputQty);

    if (currentStock < plannedQty && !overrideReason) {
      const err: any = new Error(
        `Insufficient stock. Available: ${currentStock}, Required: ${plannedQty}. Provide override reason to proceed.`
      );
      err.code = 'APPROVAL_REQUIRED';
      err.availableStock = currentStock;
      err.requiredStock = plannedQty;
      throw err;
    }

    const inputQty = plannedQty;
    const valuationData = await getWeightedAverageRate(order.inputItemId, order.warehouseFromId, tenantId);
    const rate = valuationData.rate;
    const valueOut = inputQty * rate;
    const today = new Date().toISOString().split('T')[0];
    const newBalance = currentStock - inputQty;

    const [stockEntry] = await tx.insert(stockLedger).values({
      docType: 'PRODUCTION',
      docId: orderId,
      docNumber: order.orderNumber,
      postingDate: today,
      itemId: order.inputItemId,
      itemCode: null,
      itemName: order.inputItemName,
      warehouseId: order.warehouseFromId,
      warehouseName: null,
      qtyIn: '0',
      qtyOut: String(inputQty),
      balanceQty: String(newBalance),
      rate: String(rate),
      valuationRate: String(rate),
      valueIn: '0',
      valueOut: String(valueOut),
      balanceValue: String(newBalance * rate),
      remarks: `Production consumption for ${order.orderNumber} (${order.processType})`,
      isReversed: false,
      postingStatus: 'PENDING_POSTING',
      tenantId,
      createdBy: userId,
    }).returning();

    const [consumption] = await tx.insert(productionConsumptions).values({
      tenantId,
      productionOrderId: orderId,
      itemId: order.inputItemId,
      itemName: order.inputItemName,
      qty: String(inputQty),
      unitCost: String(rate),
      totalCost: String(valueOut),
      stockMoveId: stockEntry.id,
    }).returning();

    const updateData: any = {
      status: 'IN_PROGRESS',
      actualInputQty: String(inputQty),
      startedAt: new Date(),
      startedBy: userId,
      updatedAt: new Date(),
    };
    if (overrideReason) {
      updateData.overrideReason = overrideReason;
    }

    const [updatedOrder] = await tx.update(productionOrders).set(updateData)
      .where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tenantId)))
      .returning();

    return { order: updatedOrder, consumptions: [consumption] };
  });
}

export async function completeProductionOrder(
  tenantId: number,
  orderId: number,
  userId: number,
  data: { actualOutputQty: number; processCost?: number }
) {
  const [order] = await db.select().from(productionOrders)
    .where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tenantId)));

  if (!order) throw new Error('Production order not found');
  if (order.status !== 'IN_PROGRESS') throw new Error('Only IN_PROGRESS orders can be completed');

  return await db.transaction(async (tx) => {
    const consumptions = await tx.select().from(productionConsumptions)
      .where(and(
        eq(productionConsumptions.productionOrderId, orderId),
        eq(productionConsumptions.tenantId, tenantId)
      ));

    let totalInputCost = 0;
    for (const c of consumptions) {
      totalInputCost += parseFloat(c.totalCost || '0');
    }

    const processCost = data.processCost ?? parseFloat(order.processCost || '0');
    const actualOutputQty = data.actualOutputQty;
    const totalCost = totalInputCost + processCost;
    const outputUnitCost = actualOutputQty > 0 ? totalCost / actualOutputQty : 0;

    const actualInputQty = parseFloat(order.actualInputQty || '0');
    const wastageQty = actualInputQty - actualOutputQty;
    const wastagePct = actualInputQty > 0 ? (wastageQty / actualInputQty) * 100 : 0;

    const today = new Date().toISOString().split('T')[0];
    const totalOutputValue = actualOutputQty * outputUnitCost;

    const currentOutputStock = await getCurrentStock(order.outputItemId, order.warehouseToId, tenantId);
    const newOutputBalance = currentOutputStock + actualOutputQty;

    const [stockEntry] = await tx.insert(stockLedger).values({
      docType: 'PRODUCTION',
      docId: orderId,
      docNumber: order.orderNumber,
      postingDate: today,
      itemId: order.outputItemId,
      itemCode: null,
      itemName: order.outputItemName,
      warehouseId: order.warehouseToId,
      warehouseName: null,
      qtyIn: String(actualOutputQty),
      qtyOut: '0',
      balanceQty: String(newOutputBalance),
      rate: String(outputUnitCost),
      valuationRate: String(outputUnitCost),
      valueIn: String(totalOutputValue),
      valueOut: '0',
      balanceValue: String(newOutputBalance * outputUnitCost),
      remarks: `Production output for ${order.orderNumber} (${order.processType})`,
      isReversed: false,
      postingStatus: 'PENDING_POSTING',
      tenantId,
      createdBy: userId,
    }).returning();

    const [output] = await tx.insert(productionOutputs).values({
      tenantId,
      productionOrderId: orderId,
      itemId: order.outputItemId,
      itemName: order.outputItemName,
      qty: String(actualOutputQty),
      unitCost: String(outputUnitCost),
      totalCost: String(totalOutputValue),
      stockMoveId: stockEntry.id,
    }).returning();

    let accountingVoucherId: number | undefined;

    const [acctConfig] = await tx.select().from(productionAccountingConfig)
      .where(eq(productionAccountingConfig.tenantId, tenantId));

    if (acctConfig) {
      const [journalType] = await tx.select().from(voucherTypes)
        .where(sql`${voucherTypes.code} IN ('JV', 'JNL', 'JOURNAL') OR LOWER(${voucherTypes.name}) LIKE '%journal%'`)
        .limit(1);

      const [currentFY] = await tx.select().from(fiscalYears)
        .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

      const [postedStatus] = await tx.select().from(voucherStatus)
        .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));

      const [draftStatus] = await tx.select().from(voucherStatus)
        .where(and(eq(voucherStatus.tenantId, tenantId)));

      if (journalType && currentFY && (postedStatus || draftStatus)) {
        const statusId = postedStatus?.id || draftStatus!.id;
        const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, journalType.code || 'JV');

        const voucherItemsList: Array<{
          accountId: number;
          description: string;
          debitAmount: string;
          creditAmount: string;
        }> = [];

        const debitAccountId = acctConfig.finishedGoodsAccountId || acctConfig.wipAccountId;
        const creditAccountId = acctConfig.rawMaterialAccountId;

        if (debitAccountId) {
          voucherItemsList.push({
            accountId: debitAccountId,
            description: `Finished goods from ${order.orderNumber}`,
            debitAmount: String(totalOutputValue),
            creditAmount: '0',
          });
        }

        if (creditAccountId) {
          voucherItemsList.push({
            accountId: creditAccountId,
            description: `Raw material consumed in ${order.orderNumber}`,
            debitAmount: '0',
            creditAmount: String(totalInputCost),
          });
        }

        if (processCost > 0) {
          if (acctConfig.productionExpenseAccountId) {
            voucherItemsList.push({
              accountId: acctConfig.productionExpenseAccountId,
              description: `Processing cost for ${order.orderNumber}`,
              debitAmount: String(processCost),
              creditAmount: '0',
            });
          }

          const isSubcontract = order.processMethod === 'SUBCONTRACT' && acctConfig.subcontractPayableAccountId;
          if (isSubcontract) {
            voucherItemsList.push({
              accountId: acctConfig.subcontractPayableAccountId!,
              description: `Subcontract payable for ${order.orderNumber}`,
              debitAmount: '0',
              creditAmount: String(processCost),
            });
          }
        }

        if (voucherItemsList.length >= 2) {
          const [voucher] = await tx.insert(vouchers).values({
            voucherNumber,
            voucherTypeId: journalType.id,
            voucherDate: today,
            postingDate: today,
            fiscalYearId: currentFY.id,
            statusId,
            description: `Production Order ${order.orderNumber} completion`,
            amount: String(totalOutputValue),
            preparedById: userId,
            isPosted: true,
            postedById: userId,
            postedDate: new Date(),
            workflowStatus: 'POSTED',
            originModule: 'PRODUCTION',
            originType: 'PRODUCTION_COMPLETION',
            originId: orderId,
            originRef: order.orderNumber,
            tenantId,
          }).returning();

          for (let i = 0; i < voucherItemsList.length; i++) {
            const vi = voucherItemsList[i];
            const [insertedItem] = await tx.insert(voucherItems).values({
              voucherId: voucher.id,
              lineNumber: i + 1,
              accountId: vi.accountId,
              description: vi.description,
              debitAmount: vi.debitAmount,
              creditAmount: vi.creditAmount,
              tenantId,
            }).returning();

            await tx.insert(ledgerPostings).values({
              tenantId,
              voucherId: voucher.id,
              voucherItemId: insertedItem.id,
              accountId: vi.accountId,
              postingDate: today,
              debitAmount: vi.debitAmount,
              creditAmount: vi.creditAmount,
              narration: vi.description,
              postedById: userId,
              fiscalYearId: currentFY.id,
            });
          }

          accountingVoucherId = voucher.id;
        }
      }
    }

    const updateData: any = {
      status: 'COMPLETED',
      actualOutputQty: String(actualOutputQty),
      wastageQty: String(Math.max(0, wastageQty)),
      wastagePct: String(Math.max(0, wastagePct).toFixed(2)),
      processCost: String(processCost),
      completedAt: new Date(),
      completedBy: userId,
      updatedAt: new Date(),
    };
    if (accountingVoucherId) {
      updateData.accountingVoucherId = accountingVoucherId;
    }

    const [updatedOrder] = await tx.update(productionOrders).set(updateData)
      .where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tenantId)))
      .returning();

    return { order: updatedOrder, output, voucherId: accountingVoucherId };
  });
}

export async function getProductionOrder(tenantId: number, orderId: number) {
  const [order] = await db.select().from(productionOrders)
    .where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tenantId)));

  if (!order) throw new Error('Production order not found');

  const consumptions = await db.select().from(productionConsumptions)
    .where(and(
      eq(productionConsumptions.productionOrderId, orderId),
      eq(productionConsumptions.tenantId, tenantId)
    ));

  const outputs = await db.select().from(productionOutputs)
    .where(and(
      eq(productionOutputs.productionOrderId, orderId),
      eq(productionOutputs.tenantId, tenantId)
    ));

  return { order, consumptions, outputs };
}

export async function listProductionOrders(
  tenantId: number,
  filters: { status?: string; processType?: string; startDate?: string; endDate?: string }
) {
  const conditions: any[] = [eq(productionOrders.tenantId, tenantId)];

  if (filters.status) {
    conditions.push(eq(productionOrders.status, filters.status));
  }
  if (filters.processType) {
    conditions.push(eq(productionOrders.processType, filters.processType));
  }
  if (filters.startDate) {
    conditions.push(gte(productionOrders.createdAt, new Date(filters.startDate)));
  }
  if (filters.endDate) {
    conditions.push(lte(productionOrders.createdAt, new Date(filters.endDate)));
  }

  return db.select().from(productionOrders)
    .where(and(...conditions))
    .orderBy(desc(productionOrders.createdAt));
}

export async function getYieldReport(
  tenantId: number,
  startDate: string,
  endDate: string,
  processType?: string
) {
  let processFilter = '';
  if (processType) {
    processFilter = `AND process_type = '${processType}'`;
  }

  const result = await db.execute(sql`
    SELECT
      process_type,
      output_item_id,
      output_item_name,
      COUNT(*) as order_count,
      COALESCE(SUM(CAST(actual_input_qty AS numeric)), 0) as total_input,
      COALESCE(SUM(CAST(actual_output_qty AS numeric)), 0) as total_output,
      COALESCE(SUM(CAST(wastage_qty AS numeric)), 0) as total_wastage,
      CASE
        WHEN SUM(CAST(actual_input_qty AS numeric)) > 0
        THEN ROUND((SUM(CAST(actual_output_qty AS numeric)) / SUM(CAST(actual_input_qty AS numeric))) * 100, 2)
        ELSE 0
      END as avg_yield_pct,
      CASE
        WHEN SUM(CAST(actual_input_qty AS numeric)) > 0
        THEN ROUND((SUM(CAST(wastage_qty AS numeric)) / SUM(CAST(actual_input_qty AS numeric))) * 100, 2)
        ELSE 0
      END as avg_wastage_pct
    FROM production_orders
    WHERE tenant_id = ${tenantId}
      AND status = 'COMPLETED'
      AND completed_at >= ${startDate}
      AND completed_at <= ${endDate}
      ${processType ? sql`AND process_type = ${processType}` : sql``}
    GROUP BY process_type, output_item_id, output_item_name
    ORDER BY process_type, output_item_name
  `);

  return result.rows;
}

export async function getProductionOrderTrace(tenantId: number, orderId: number) {
  const [order] = await db.select().from(productionOrders)
    .where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tenantId)));

  if (!order) throw new Error('Production order not found');

  const consumptions = await db.select().from(productionConsumptions)
    .where(and(
      eq(productionConsumptions.productionOrderId, orderId),
      eq(productionConsumptions.tenantId, tenantId)
    ));

  const outputs = await db.select().from(productionOutputs)
    .where(and(
      eq(productionOutputs.productionOrderId, orderId),
      eq(productionOutputs.tenantId, tenantId)
    ));

  const stockMoves = await db.select().from(stockLedger)
    .where(and(
      eq(stockLedger.docType, 'PRODUCTION'),
      eq(stockLedger.docId, orderId),
      eq(stockLedger.tenantId, tenantId),
      eq(stockLedger.isReversed, false)
    ))
    .orderBy(stockLedger.id);

  const consumptionMoves = stockMoves.filter(m => parseFloat(m.qtyOut || '0') > 0);
  const outputMoves = stockMoves.filter(m => parseFloat(m.qtyIn || '0') > 0);

  let voucherDetails = null;
  if (order.accountingVoucherId) {
    const [voucher] = await db.select().from(vouchers)
      .where(and(eq(vouchers.id, order.accountingVoucherId), eq(vouchers.tenantId, tenantId)));

    if (voucher) {
      const vItems = await db.select().from(voucherItems)
        .where(and(eq(voucherItems.voucherId, voucher.id), eq(voucherItems.tenantId, tenantId)))
        .orderBy(voucherItems.lineNumber);
      voucherDetails = { ...voucher, items: vItems };
    }
  }

  const actualInputQty = parseFloat(order.actualInputQty || '0');
  const actualOutputQty = parseFloat(order.actualOutputQty || '0');
  const yieldPct = actualInputQty > 0 ? (actualOutputQty / actualInputQty) * 100 : 0;
  const wastagePct = actualInputQty > 0 ? ((actualInputQty - actualOutputQty) / actualInputQty) * 100 : 0;
  const processLoss = actualInputQty - actualOutputQty;

  let totalInputCost = 0;
  for (const c of consumptions) {
    totalInputCost += parseFloat(c.totalCost || '0');
  }
  let totalOutputCost = 0;
  for (const o of outputs) {
    totalOutputCost += parseFloat(o.totalCost || '0');
  }

  return {
    order,
    consumptions,
    outputs,
    consumptionMoves,
    outputMoves,
    voucherDetails,
    metrics: {
      yieldPct: Math.round(yieldPct * 100) / 100,
      wastagePct: Math.round(wastagePct * 100) / 100,
      processLoss: Math.round(processLoss * 10000) / 10000,
      totalInputCost,
      totalOutputCost,
      processCost: parseFloat(order.processCost || '0'),
    },
  };
}
