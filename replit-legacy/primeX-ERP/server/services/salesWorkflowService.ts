import { db } from '../db';
import {
  salesOrders, salesOrderItems, deliveryNotes, deliveryNoteItems,
  salesInvoices, salesInvoiceItems, collections, exportProceeds,
  salesAccountingConfig, stockLedger, vouchers, voucherItems,
  ledgerPostings, voucherTypes, voucherStatus, fiscalYears, items
} from '@shared/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { getCurrentStock, getWeightedAverageRate } from './stockLedgerService';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';
import { SequentialIdGenerator } from '../utils/sequentialIdGenerator';

async function generateSalesOrderNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'SO',
    tableName: 'sales_orders',
    columnName: 'order_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

async function generateDeliveryNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'DN',
    tableName: 'delivery_notes',
    columnName: 'delivery_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

async function generateInvoiceNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'INV',
    tableName: 'sales_invoices',
    columnName: 'invoice_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

async function generateReceiptNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'RCT',
    tableName: 'collections',
    columnName: 'receipt_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

export async function createSalesOrder(
  tenantId: number,
  userId: number,
  data: {
    customerId: number;
    partyId?: number;
    orderDate: string;
    currency?: string;
    discountAmount?: string;
    taxAmount?: string;
    linkedOrderId?: number;
    remarks?: string;
    items: Array<{
      itemId: number;
      itemName: string;
      qty: string;
      rate: string;
    }>;
  }
) {
  const orderNumber = await generateSalesOrderNumber(tenantId);

  let subtotal = 0;
  const orderItems = data.items.map(item => {
    const qty = parseFloat(item.qty);
    const rate = parseFloat(item.rate);
    const amount = qty * rate;
    subtotal += amount;
    return { ...item, amount: String(amount) };
  });

  const discountAmount = parseFloat(data.discountAmount || '0');
  const taxAmount = parseFloat(data.taxAmount || '0');
  const grandTotal = subtotal - discountAmount + taxAmount;

  const [order] = await db.insert(salesOrders).values({
    tenantId,
    orderNumber,
    customerId: data.customerId,
    partyId: data.partyId || null,
    orderDate: data.orderDate,
    currency: data.currency || 'BDT',
    subtotal: String(subtotal),
    discountAmount: String(discountAmount),
    taxAmount: String(taxAmount),
    grandTotal: String(grandTotal),
    linkedOrderId: data.linkedOrderId || null,
    remarks: data.remarks || null,
    status: 'DRAFT',
    createdBy: userId,
  }).returning();

  const insertedItems = [];
  for (const item of orderItems) {
    const [inserted] = await db.insert(salesOrderItems).values({
      tenantId,
      salesOrderId: order.id,
      itemId: item.itemId,
      itemName: item.itemName,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
      deliveredQty: '0',
    }).returning();
    insertedItems.push(inserted);
  }

  return { ...order, items: insertedItems };
}

export async function approveSalesOrder(tenantId: number, orderId: number, userId: number) {
  const [order] = await db.select().from(salesOrders)
    .where(and(eq(salesOrders.id, orderId), eq(salesOrders.tenantId, tenantId)));

  if (!order) throw { error: 'Sales order not found', statusCode: 404 };
  if (order.status !== 'DRAFT') throw { error: 'Only DRAFT orders can be approved', statusCode: 400 };

  const [updated] = await db.update(salesOrders).set({
    status: 'APPROVED',
    approvedBy: userId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(salesOrders.id, orderId), eq(salesOrders.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function createDeliveryNote(
  tenantId: number,
  userId: number,
  data: {
    salesOrderId: number;
    warehouseId: number;
    deliveryDate: string;
    remarks?: string;
    items: Array<{
      itemId: number;
      itemName: string;
      qty: string;
      rate?: string;
    }>;
  }
) {
  const [so] = await db.select().from(salesOrders)
    .where(and(eq(salesOrders.id, data.salesOrderId), eq(salesOrders.tenantId, tenantId)));
  if (!so) throw { error: 'Sales order not found', statusCode: 404 };
  if (so.status !== 'APPROVED' && so.status !== 'PARTIALLY_DELIVERED') {
    throw { error: 'Sales order must be APPROVED to create delivery', statusCode: 400 };
  }

  const deliveryNumber = await generateDeliveryNumber(tenantId);

  const [delivery] = await db.insert(deliveryNotes).values({
    tenantId,
    deliveryNumber,
    salesOrderId: data.salesOrderId,
    warehouseId: data.warehouseId,
    deliveryDate: data.deliveryDate,
    status: 'DRAFT',
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();

  const insertedItems = [];
  for (const item of data.items) {
    const amount = parseFloat(item.qty) * parseFloat(item.rate || '0');
    const [inserted] = await db.insert(deliveryNoteItems).values({
      tenantId,
      deliveryNoteId: delivery.id,
      itemId: item.itemId,
      itemName: item.itemName,
      qty: item.qty,
      rate: item.rate || '0',
      amount: String(amount),
    }).returning();
    insertedItems.push(inserted);
  }

  return { ...delivery, items: insertedItems };
}

export async function approveDeliveryNote(tenantId: number, deliveryId: number, userId: number) {
  const [delivery] = await db.select().from(deliveryNotes)
    .where(and(eq(deliveryNotes.id, deliveryId), eq(deliveryNotes.tenantId, tenantId)));

  if (!delivery) throw { error: 'Delivery note not found', statusCode: 404 };
  if (delivery.status !== 'DRAFT') throw { error: 'Only DRAFT delivery notes can be approved', statusCode: 400 };

  const [updated] = await db.update(deliveryNotes).set({
    status: 'APPROVED',
    approvedBy: userId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(deliveryNotes.id, deliveryId), eq(deliveryNotes.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function postDeliveryNote(
  tenantId: number,
  deliveryId: number,
  userId: number,
  requestId?: string
) {
  const [delivery] = await db.select().from(deliveryNotes)
    .where(and(eq(deliveryNotes.id, deliveryId), eq(deliveryNotes.tenantId, tenantId)));

  if (!delivery) throw { error: 'Delivery note not found', statusCode: 404 };
  if (delivery.status !== 'APPROVED') throw { error: 'Only APPROVED delivery notes can be posted', statusCode: 400 };

  if (requestId && delivery.requestId === requestId) {
    return { alreadyPosted: true, delivery };
  }

  return await db.transaction(async (tx) => {
    const dnItems = await tx.select().from(deliveryNoteItems)
      .where(and(eq(deliveryNoteItems.deliveryNoteId, deliveryId), eq(deliveryNoteItems.tenantId, tenantId)));

    const stockMoves = [];
    const today = new Date().toISOString().split('T')[0];

    for (const item of dnItems) {
      const currentStock = await getCurrentStock(item.itemId, delivery.warehouseId, tenantId);
      const qtyOut = parseFloat(item.qty);
      const valuationData = await getWeightedAverageRate(item.itemId, delivery.warehouseId, tenantId);
      const rate = valuationData.rate;
      const valueOut = qtyOut * rate;
      const newBalance = currentStock - qtyOut;

      const [stockEntry] = await tx.insert(stockLedger).values({
        docType: 'DELIVERY',
        docId: deliveryId,
        docNumber: delivery.deliveryNumber,
        postingDate: today,
        itemId: item.itemId,
        itemCode: null,
        itemName: item.itemName,
        warehouseId: delivery.warehouseId,
        warehouseName: null,
        qtyIn: '0',
        qtyOut: String(qtyOut),
        balanceQty: String(newBalance),
        rate: String(rate),
        valuationRate: String(rate),
        valueIn: '0',
        valueOut: String(valueOut),
        balanceValue: String(newBalance * rate),
        remarks: `Stock out via Delivery Note ${delivery.deliveryNumber}`,
        isReversed: false,
        postingStatus: 'PENDING_POSTING',
        tenantId,
        createdBy: userId,
      }).returning();

      stockMoves.push(stockEntry);

      await tx.update(deliveryNoteItems).set({
        stockMoveId: stockEntry.id,
      }).where(eq(deliveryNoteItems.id, item.id));

      const soItems = await tx.select().from(salesOrderItems)
        .where(and(
          eq(salesOrderItems.salesOrderId, delivery.salesOrderId),
          eq(salesOrderItems.itemId, item.itemId),
          eq(salesOrderItems.tenantId, tenantId)
        ));

      if (soItems.length > 0) {
        const soItem = soItems[0];
        const currentDelivered = parseFloat(soItem.deliveredQty || '0');
        await tx.update(salesOrderItems).set({
          deliveredQty: String(currentDelivered + qtyOut),
        }).where(eq(salesOrderItems.id, soItem.id));
      }
    }

    const updateData: any = {
      status: 'POSTED',
      postedBy: userId,
      postedAt: new Date(),
      updatedAt: new Date(),
    };
    if (requestId) {
      updateData.requestId = requestId;
    }

    const [updatedDelivery] = await tx.update(deliveryNotes).set(updateData)
      .where(and(eq(deliveryNotes.id, deliveryId), eq(deliveryNotes.tenantId, tenantId)))
      .returning();

    return { delivery: updatedDelivery, stockMoves };
  });
}

export async function createSalesInvoice(
  tenantId: number,
  userId: number,
  data: {
    salesOrderId?: number;
    customerId: number;
    partyId?: number;
    shipmentId?: number;
    invoiceDate: string;
    dueDate?: string;
    currency?: string;
    taxAmount?: string;
    discountAmount?: string;
    remarks?: string;
    items: Array<{
      itemId: number;
      itemName: string;
      qty: string;
      rate: string;
    }>;
  }
) {
  const invoiceNumber = await generateInvoiceNumber(tenantId);

  let amount = 0;
  const invoiceItems = data.items.map(item => {
    const qty = parseFloat(item.qty);
    const rate = parseFloat(item.rate);
    const lineAmount = qty * rate;
    amount += lineAmount;
    return { ...item, amount: String(lineAmount) };
  });

  const taxAmount = parseFloat(data.taxAmount || '0');
  const discountAmount = parseFloat(data.discountAmount || '0');
  const netAmount = amount + taxAmount - discountAmount;

  const [invoice] = await db.insert(salesInvoices).values({
    tenantId,
    invoiceNumber,
    salesOrderId: data.salesOrderId || null,
    customerId: data.customerId,
    partyId: data.partyId || null,
    shipmentId: data.shipmentId || null,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate || null,
    amount: String(amount),
    taxAmount: String(taxAmount),
    discountAmount: String(discountAmount),
    netAmount: String(netAmount),
    currency: data.currency || 'BDT',
    status: 'DRAFT',
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();

  const insertedItems = [];
  for (const item of invoiceItems) {
    const [inserted] = await db.insert(salesInvoiceItems).values({
      tenantId,
      salesInvoiceId: invoice.id,
      itemId: item.itemId,
      itemName: item.itemName,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
    }).returning();
    insertedItems.push(inserted);
  }

  return { ...invoice, items: insertedItems };
}

export async function postSalesInvoice(
  tenantId: number,
  invoiceId: number,
  userId: number,
  requestId?: string
) {
  const [invoice] = await db.select().from(salesInvoices)
    .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, tenantId)));

  if (!invoice) throw { error: 'Sales invoice not found', statusCode: 404 };
  if (invoice.status !== 'DRAFT' && invoice.status !== 'APPROVED') {
    throw { error: 'Only DRAFT or APPROVED invoices can be posted', statusCode: 400 };
  }

  if (requestId && invoice.requestId === requestId) {
    return { alreadyPosted: true, invoice };
  }

  return await db.transaction(async (tx) => {
    const [acctConfig] = await tx.select().from(salesAccountingConfig)
      .where(eq(salesAccountingConfig.tenantId, tenantId));

    let accountingVoucherId: number | undefined;
    let cogsVoucherId: number | undefined;

    const [journalType] = await tx.select().from(voucherTypes)
      .where(sql`${voucherTypes.code} IN ('JV', 'JNL', 'JOURNAL') OR LOWER(${voucherTypes.name}) LIKE '%journal%'`)
      .limit(1);

    const [currentFY] = await tx.select().from(fiscalYears)
      .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

    const [postedStatus] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));

    const [draftStatus] = await tx.select().from(voucherStatus)
      .where(eq(voucherStatus.tenantId, tenantId))
      .limit(1);

    const today = new Date().toISOString().split('T')[0];

    if (acctConfig && acctConfig.accountsReceivableLedgerId && acctConfig.salesRevenueLedgerId && journalType && currentFY && (postedStatus || draftStatus)) {
      const statusId = postedStatus?.id || draftStatus!.id;
      const netAmount = invoice.netAmount;

      const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'SALES');
      const arVoucherItems = [
        {
          accountId: acctConfig.accountsReceivableLedgerId,
          description: `AR for Invoice ${invoice.invoiceNumber}`,
          debitAmount: netAmount,
          creditAmount: '0',
        },
        {
          accountId: acctConfig.salesRevenueLedgerId,
          description: `Sales Revenue for Invoice ${invoice.invoiceNumber}`,
          debitAmount: '0',
          creditAmount: netAmount,
        },
      ];

      const [arVoucher] = await tx.insert(vouchers).values({
        voucherNumber,
        voucherTypeId: journalType.id,
        voucherDate: today,
        postingDate: today,
        fiscalYearId: currentFY.id,
        statusId,
        description: `Sales Invoice ${invoice.invoiceNumber} - AR Entry`,
        amount: netAmount,
        preparedById: userId,
        isPosted: true,
        postedById: userId,
        postedDate: new Date(),
        workflowStatus: 'POSTED',
        originModule: 'SALES',
        originType: 'SALES_INVOICE',
        originId: invoiceId,
        originRef: invoice.invoiceNumber,
        tenantId,
      }).returning();

      for (let i = 0; i < arVoucherItems.length; i++) {
        const vi = arVoucherItems[i];
        const [insertedItem] = await tx.insert(voucherItems).values({
          voucherId: arVoucher.id,
          lineNumber: i + 1,
          accountId: vi.accountId,
          description: vi.description,
          debitAmount: vi.debitAmount,
          creditAmount: vi.creditAmount,
          tenantId,
        }).returning();

        await tx.insert(ledgerPostings).values({
          tenantId,
          voucherId: arVoucher.id,
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

      accountingVoucherId = arVoucher.id;

      if (acctConfig.cogsLedgerId && invoice.salesOrderId) {
        const deliveries = await tx.select().from(deliveryNotes)
          .where(and(
            eq(deliveryNotes.salesOrderId, invoice.salesOrderId),
            eq(deliveryNotes.tenantId, tenantId),
            eq(deliveryNotes.status, 'POSTED')
          ));

        let totalCOGS = 0;
        for (const del of deliveries) {
          const moves = await tx.select().from(stockLedger)
            .where(and(
              eq(stockLedger.docType, 'DELIVERY'),
              eq(stockLedger.docId, del.id),
              eq(stockLedger.tenantId, tenantId),
              eq(stockLedger.isReversed, false)
            ));
          for (const move of moves) {
            totalCOGS += parseFloat(move.valueOut || '0');
          }
        }

        if (totalCOGS > 0) {
          const cogsVoucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'JOURNAL');

          const inventoryAssetAccountId = acctConfig.cogsLedgerId;

          const result = await tx.execute(sql`
            SELECT inventory_asset_account_id FROM production_accounting_config WHERE tenant_id = ${tenantId} LIMIT 1
          `);
          const inventoryAccountId = (result.rows?.[0] as any)?.inventory_asset_account_id || acctConfig.cogsLedgerId;

          const cogsItems = [
            {
              accountId: acctConfig.cogsLedgerId,
              description: `COGS for Invoice ${invoice.invoiceNumber}`,
              debitAmount: String(totalCOGS),
              creditAmount: '0',
            },
            {
              accountId: inventoryAccountId,
              description: `Inventory reduction for Invoice ${invoice.invoiceNumber}`,
              debitAmount: '0',
              creditAmount: String(totalCOGS),
            },
          ];

          const [cogsVoucher] = await tx.insert(vouchers).values({
            voucherNumber: cogsVoucherNumber,
            voucherTypeId: journalType.id,
            voucherDate: today,
            postingDate: today,
            fiscalYearId: currentFY.id,
            statusId,
            description: `COGS for Invoice ${invoice.invoiceNumber}`,
            amount: String(totalCOGS),
            preparedById: userId,
            isPosted: true,
            postedById: userId,
            postedDate: new Date(),
            workflowStatus: 'POSTED',
            originModule: 'SALES',
            originType: 'COGS_ENTRY',
            originId: invoiceId,
            originRef: invoice.invoiceNumber,
            tenantId,
          }).returning();

          for (let i = 0; i < cogsItems.length; i++) {
            const vi = cogsItems[i];
            const [insertedItem] = await tx.insert(voucherItems).values({
              voucherId: cogsVoucher.id,
              lineNumber: i + 1,
              accountId: vi.accountId,
              description: vi.description,
              debitAmount: vi.debitAmount,
              creditAmount: vi.creditAmount,
              tenantId,
            }).returning();

            await tx.insert(ledgerPostings).values({
              tenantId,
              voucherId: cogsVoucher.id,
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

          cogsVoucherId = cogsVoucher.id;
        }
      }
    }

    const updateData: any = {
      status: 'POSTED',
      postedBy: userId,
      postedAt: new Date(),
      updatedAt: new Date(),
    };
    if (accountingVoucherId) updateData.accountingVoucherId = accountingVoucherId;
    if (cogsVoucherId) updateData.cogsVoucherId = cogsVoucherId;
    if (requestId) updateData.requestId = requestId;

    const [updatedInvoice] = await tx.update(salesInvoices).set(updateData)
      .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, tenantId)))
      .returning();

    return { invoice: updatedInvoice, accountingVoucherId, cogsVoucherId };
  });
}

export async function createCollection(
  tenantId: number,
  userId: number,
  data: {
    customerId: number;
    partyId?: number;
    salesInvoiceId?: number;
    bankAccountId?: number;
    receiptDate: string;
    amount: string;
    method: string;
    currency?: string;
    remarks?: string;
  }
) {
  const receiptNumber = await generateReceiptNumber(tenantId);

  const [collection] = await db.insert(collections).values({
    tenantId,
    receiptNumber,
    customerId: data.customerId,
    partyId: data.partyId || null,
    salesInvoiceId: data.salesInvoiceId || null,
    bankAccountId: data.bankAccountId || null,
    receiptDate: data.receiptDate,
    amount: data.amount,
    method: data.method,
    currency: data.currency || 'BDT',
    status: 'DRAFT',
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();

  return collection;
}

export async function postCollection(
  tenantId: number,
  collectionId: number,
  userId: number,
  requestId?: string
) {
  const [collection] = await db.select().from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.tenantId, tenantId)));

  if (!collection) throw { error: 'Collection not found', statusCode: 404 };
  if (collection.status !== 'DRAFT' && collection.status !== 'APPROVED') {
    throw { error: 'Only DRAFT or APPROVED collections can be posted', statusCode: 400 };
  }

  if (requestId && collection.requestId === requestId) {
    return { alreadyPosted: true, collection };
  }

  return await db.transaction(async (tx) => {
    const [acctConfig] = await tx.select().from(salesAccountingConfig)
      .where(eq(salesAccountingConfig.tenantId, tenantId));

    let accountingVoucherId: number | undefined;

    const [journalType] = await tx.select().from(voucherTypes)
      .where(sql`${voucherTypes.code} IN ('JV', 'JNL', 'JOURNAL', 'REC', 'RECEIPT') OR LOWER(${voucherTypes.name}) LIKE '%receipt%' OR LOWER(${voucherTypes.name}) LIKE '%journal%'`)
      .limit(1);

    const [currentFY] = await tx.select().from(fiscalYears)
      .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

    const [postedStatus] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));

    const [draftStatus] = await tx.select().from(voucherStatus)
      .where(eq(voucherStatus.tenantId, tenantId))
      .limit(1);

    const today = new Date().toISOString().split('T')[0];

    const bankAccountId = collection.bankAccountId || acctConfig?.bankLedgerId || acctConfig?.cashLedgerId;
    const arAccountId = acctConfig?.accountsReceivableLedgerId;

    if (bankAccountId && arAccountId && journalType && currentFY && (postedStatus || draftStatus)) {
      const statusId = postedStatus?.id || draftStatus!.id;
      const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'RECEIPT');

      const receiptVoucherItems = [
        {
          accountId: bankAccountId,
          description: `Receipt ${collection.receiptNumber} - Bank/Cash`,
          debitAmount: collection.amount,
          creditAmount: '0',
        },
        {
          accountId: arAccountId,
          description: `Receipt ${collection.receiptNumber} - AR Credit`,
          debitAmount: '0',
          creditAmount: collection.amount,
        },
      ];

      const [receiptVoucher] = await tx.insert(vouchers).values({
        voucherNumber,
        voucherTypeId: journalType.id,
        voucherDate: today,
        postingDate: today,
        fiscalYearId: currentFY.id,
        statusId,
        description: `Collection Receipt ${collection.receiptNumber}`,
        amount: collection.amount,
        preparedById: userId,
        isPosted: true,
        postedById: userId,
        postedDate: new Date(),
        workflowStatus: 'POSTED',
        originModule: 'SALES',
        originType: 'COLLECTION',
        originId: collectionId,
        originRef: collection.receiptNumber,
        tenantId,
      }).returning();

      for (let i = 0; i < receiptVoucherItems.length; i++) {
        const vi = receiptVoucherItems[i];
        const [insertedItem] = await tx.insert(voucherItems).values({
          voucherId: receiptVoucher.id,
          lineNumber: i + 1,
          accountId: vi.accountId,
          description: vi.description,
          debitAmount: vi.debitAmount,
          creditAmount: vi.creditAmount,
          tenantId,
        }).returning();

        await tx.insert(ledgerPostings).values({
          tenantId,
          voucherId: receiptVoucher.id,
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

      accountingVoucherId = receiptVoucher.id;
    }

    const updateData: any = {
      status: 'POSTED',
      postedBy: userId,
      postedAt: new Date(),
      updatedAt: new Date(),
    };
    if (accountingVoucherId) updateData.accountingVoucherId = accountingVoucherId;
    if (requestId) updateData.requestId = requestId;

    const [updatedCollection] = await tx.update(collections).set(updateData)
      .where(and(eq(collections.id, collectionId), eq(collections.tenantId, tenantId)))
      .returning();

    if (collection.salesInvoiceId) {
      const totalCollected = await tx.select({
        total: sql<string>`COALESCE(SUM(CAST(amount AS numeric)), 0)`,
      }).from(collections)
        .where(and(
          eq(collections.salesInvoiceId, collection.salesInvoiceId),
          eq(collections.tenantId, tenantId),
          eq(collections.status, 'POSTED')
        ));

      const [inv] = await tx.select().from(salesInvoices)
        .where(and(eq(salesInvoices.id, collection.salesInvoiceId), eq(salesInvoices.tenantId, tenantId)));

      if (inv) {
        const collectedAmount = parseFloat(totalCollected[0]?.total || '0') + parseFloat(collection.amount);
        const invoiceNet = parseFloat(inv.netAmount);
        if (collectedAmount >= invoiceNet) {
          await tx.update(salesInvoices).set({
            status: 'PAID',
            updatedAt: new Date(),
          }).where(eq(salesInvoices.id, collection.salesInvoiceId));
        }
      }
    }

    return { collection: updatedCollection, accountingVoucherId };
  });
}

export async function createExportProceed(
  tenantId: number,
  userId: number,
  data: {
    shipmentId?: number;
    salesInvoiceId?: number;
    bankRefNumber?: string;
    proceedDate: string;
    amount: string;
    currency?: string;
    conversionRate?: string;
    bdtAmount: string;
    bankCharges?: string;
    remarks?: string;
  }
) {
  const [proceed] = await db.insert(exportProceeds).values({
    tenantId,
    shipmentId: data.shipmentId || null,
    salesInvoiceId: data.salesInvoiceId || null,
    bankRefNumber: data.bankRefNumber || null,
    proceedDate: data.proceedDate,
    amount: data.amount,
    currency: data.currency || 'USD',
    conversionRate: data.conversionRate || '1',
    bdtAmount: data.bdtAmount,
    bankCharges: data.bankCharges || '0',
    status: 'PENDING',
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();

  return proceed;
}

export async function getSalesOrderTrace(tenantId: number, orderId: number) {
  const [order] = await db.select().from(salesOrders)
    .where(and(eq(salesOrders.id, orderId), eq(salesOrders.tenantId, tenantId)));

  if (!order) throw { error: 'Sales order not found', statusCode: 404 };

  const orderItems = await db.select().from(salesOrderItems)
    .where(and(eq(salesOrderItems.salesOrderId, orderId), eq(salesOrderItems.tenantId, tenantId)));

  const deliveries = await db.select().from(deliveryNotes)
    .where(and(eq(deliveryNotes.salesOrderId, orderId), eq(deliveryNotes.tenantId, tenantId)))
    .orderBy(desc(deliveryNotes.createdAt));

  const deliveriesWithItems = [];
  for (const del of deliveries) {
    const delItems = await db.select().from(deliveryNoteItems)
      .where(and(eq(deliveryNoteItems.deliveryNoteId, del.id), eq(deliveryNoteItems.tenantId, tenantId)));

    const stockMoves = [];
    if (del.status === 'POSTED') {
      const moves = await db.select().from(stockLedger)
        .where(and(
          eq(stockLedger.docType, 'DELIVERY'),
          eq(stockLedger.docId, del.id),
          eq(stockLedger.tenantId, tenantId),
          eq(stockLedger.isReversed, false)
        ));
      stockMoves.push(...moves);
    }

    deliveriesWithItems.push({ ...del, items: delItems, stockMoves });
  }

  const invoices = await db.select().from(salesInvoices)
    .where(and(eq(salesInvoices.salesOrderId, orderId), eq(salesInvoices.tenantId, tenantId)))
    .orderBy(desc(salesInvoices.createdAt));

  let totalInvoiced = 0;
  let totalCollected = 0;
  const invoicesWithCollections = [];

  for (const inv of invoices) {
    totalInvoiced += parseFloat(inv.netAmount);
    const invCollections = await db.select().from(collections)
      .where(and(eq(collections.salesInvoiceId, inv.id), eq(collections.tenantId, tenantId)));

    for (const c of invCollections) {
      if (c.status === 'POSTED') {
        totalCollected += parseFloat(c.amount);
      }
    }

    invoicesWithCollections.push({ ...inv, collections: invCollections });
  }

  return {
    order,
    items: orderItems,
    deliveries: deliveriesWithItems,
    invoices: invoicesWithCollections,
    summary: {
      totalInvoiced,
      totalCollected,
      outstandingAR: totalInvoiced - totalCollected,
    },
  };
}

export async function getSalesInvoiceTrace(tenantId: number, invoiceId: number) {
  const [invoice] = await db.select().from(salesInvoices)
    .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, tenantId)));

  if (!invoice) throw { error: 'Sales invoice not found', statusCode: 404 };

  const invItems = await db.select().from(salesInvoiceItems)
    .where(and(eq(salesInvoiceItems.salesInvoiceId, invoiceId), eq(salesInvoiceItems.tenantId, tenantId)));

  let deliveryMoves: any[] = [];
  if (invoice.salesOrderId) {
    const deliveries = await db.select().from(deliveryNotes)
      .where(and(
        eq(deliveryNotes.salesOrderId, invoice.salesOrderId),
        eq(deliveryNotes.tenantId, tenantId),
        eq(deliveryNotes.status, 'POSTED')
      ));

    for (const del of deliveries) {
      const moves = await db.select().from(stockLedger)
        .where(and(
          eq(stockLedger.docType, 'DELIVERY'),
          eq(stockLedger.docId, del.id),
          eq(stockLedger.tenantId, tenantId),
          eq(stockLedger.isReversed, false)
        ));
      deliveryMoves.push(...moves);
    }
  }

  let arVoucherLines: any[] = [];
  if (invoice.accountingVoucherId) {
    arVoucherLines = await db.select().from(voucherItems)
      .where(and(eq(voucherItems.voucherId, invoice.accountingVoucherId), eq(voucherItems.tenantId, tenantId)))
      .orderBy(voucherItems.lineNumber);
  }

  let cogsVoucherLines: any[] = [];
  if (invoice.cogsVoucherId) {
    cogsVoucherLines = await db.select().from(voucherItems)
      .where(and(eq(voucherItems.voucherId, invoice.cogsVoucherId), eq(voucherItems.tenantId, tenantId)))
      .orderBy(voucherItems.lineNumber);
  }

  const invCollections = await db.select().from(collections)
    .where(and(eq(collections.salesInvoiceId, invoiceId), eq(collections.tenantId, tenantId)));

  let totalCollected = 0;
  for (const c of invCollections) {
    if (c.status === 'POSTED') {
      totalCollected += parseFloat(c.amount);
    }
  }

  return {
    invoice,
    items: invItems,
    deliveryMoves,
    arVoucherLines,
    cogsVoucherLines,
    collections: invCollections,
    summary: {
      invoiceAmount: parseFloat(invoice.netAmount),
      totalCollected,
      outstanding: parseFloat(invoice.netAmount) - totalCollected,
    },
  };
}

export async function listSalesOrders(
  tenantId: number,
  filters: { status?: string; startDate?: string; endDate?: string }
) {
  const conditions: any[] = [eq(salesOrders.tenantId, tenantId)];
  if (filters.status) conditions.push(eq(salesOrders.status, filters.status));
  if (filters.startDate) conditions.push(gte(salesOrders.createdAt, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(salesOrders.createdAt, new Date(filters.endDate)));

  return db.select().from(salesOrders)
    .where(and(...conditions))
    .orderBy(desc(salesOrders.createdAt));
}

export async function listDeliveryNotes(
  tenantId: number,
  filters: { status?: string; startDate?: string; endDate?: string }
) {
  const conditions: any[] = [eq(deliveryNotes.tenantId, tenantId)];
  if (filters.status) conditions.push(eq(deliveryNotes.status, filters.status));
  if (filters.startDate) conditions.push(gte(deliveryNotes.createdAt, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(deliveryNotes.createdAt, new Date(filters.endDate)));

  return db.select().from(deliveryNotes)
    .where(and(...conditions))
    .orderBy(desc(deliveryNotes.createdAt));
}

export async function listSalesInvoices(
  tenantId: number,
  filters: { status?: string; startDate?: string; endDate?: string }
) {
  const conditions: any[] = [eq(salesInvoices.tenantId, tenantId)];
  if (filters.status) conditions.push(eq(salesInvoices.status, filters.status));
  if (filters.startDate) conditions.push(gte(salesInvoices.createdAt, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(salesInvoices.createdAt, new Date(filters.endDate)));

  return db.select().from(salesInvoices)
    .where(and(...conditions))
    .orderBy(desc(salesInvoices.createdAt));
}

export async function listCollections(
  tenantId: number,
  filters: { status?: string; startDate?: string; endDate?: string }
) {
  const conditions: any[] = [eq(collections.tenantId, tenantId)];
  if (filters.status) conditions.push(eq(collections.status, filters.status));
  if (filters.startDate) conditions.push(gte(collections.createdAt, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(collections.createdAt, new Date(filters.endDate)));

  return db.select().from(collections)
    .where(and(...conditions))
    .orderBy(desc(collections.createdAt));
}

export async function getSalesOrder(tenantId: number, orderId: number) {
  const [order] = await db.select().from(salesOrders)
    .where(and(eq(salesOrders.id, orderId), eq(salesOrders.tenantId, tenantId)));

  if (!order) throw { error: 'Sales order not found', statusCode: 404 };

  const orderItems = await db.select().from(salesOrderItems)
    .where(and(eq(salesOrderItems.salesOrderId, orderId), eq(salesOrderItems.tenantId, tenantId)));

  return { ...order, items: orderItems };
}

export async function getSalesInvoice(tenantId: number, invoiceId: number) {
  const [invoice] = await db.select().from(salesInvoices)
    .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, tenantId)));

  if (!invoice) throw { error: 'Sales invoice not found', statusCode: 404 };

  const invItems = await db.select().from(salesInvoiceItems)
    .where(and(eq(salesInvoiceItems.salesInvoiceId, invoiceId), eq(salesInvoiceItems.tenantId, tenantId)));

  return { ...invoice, items: invItems };
}

export async function getExportReconciliation(
  tenantId: number,
  startDate: string,
  endDate: string
) {
  const invoicedResult = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(net_amount AS numeric)), 0)`,
    count: sql<string>`COUNT(*)`,
  }).from(salesInvoices)
    .where(and(
      eq(salesInvoices.tenantId, tenantId),
      gte(salesInvoices.invoiceDate, startDate),
      lte(salesInvoices.invoiceDate, endDate),
      eq(salesInvoices.status, 'POSTED')
    ));

  const collectedResult = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(amount AS numeric)), 0)`,
    count: sql<string>`COUNT(*)`,
  }).from(collections)
    .where(and(
      eq(collections.tenantId, tenantId),
      gte(collections.receiptDate, startDate),
      lte(collections.receiptDate, endDate),
      eq(collections.status, 'POSTED')
    ));

  const exportProceedsResult = await db.select({
    total: sql<string>`COALESCE(SUM(CAST(bdt_amount AS numeric)), 0)`,
    totalFx: sql<string>`COALESCE(SUM(CAST(amount AS numeric)), 0)`,
    count: sql<string>`COUNT(*)`,
  }).from(exportProceeds)
    .where(and(
      eq(exportProceeds.tenantId, tenantId),
      gte(exportProceeds.proceedDate, startDate),
      lte(exportProceeds.proceedDate, endDate),
    ));

  const totalInvoiced = parseFloat(invoicedResult[0]?.total || '0');
  const totalCollected = parseFloat(collectedResult[0]?.total || '0');
  const totalExportProceeds = parseFloat(exportProceedsResult[0]?.total || '0');
  const totalExportProceedsFx = parseFloat(exportProceedsResult[0]?.totalFx || '0');

  return {
    period: { startDate, endDate },
    totalInvoiced,
    invoiceCount: parseInt(invoicedResult[0]?.count || '0'),
    totalCollected,
    collectionCount: parseInt(collectedResult[0]?.count || '0'),
    totalExportProceeds,
    totalExportProceedsFx,
    exportProceedCount: parseInt(exportProceedsResult[0]?.count || '0'),
    outstandingAR: totalInvoiced - totalCollected,
    collectionRate: totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 10000) / 100 : 0,
  };
}
