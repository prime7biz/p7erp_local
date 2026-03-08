import { db } from '../db';
import {
  orders, quotations, exportCases, exportCaseOrders, fxReceipts,
  btbLcs, profitabilityAllocations, profitabilitySnapshots, styles,
  quotationMaterials, quotationManufacturing, quotationOtherCosts,
  orderMaterials, salesInvoices, salesOrders,
} from '@shared/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

export async function calculateStyleProfitability(tenantId: number, styleId: number) {
  const styleOrders = await db.select().from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.styleId, styleId)));

  const orderRevenue = styleOrders.reduce((sum, o) =>
    sum + (parseFloat(o.priceConfirmed || '0') * o.totalQuantity), 0);

  const orderIds = styleOrders.map(o => o.id);

  let invoiceRevenue = 0;
  if (orderIds.length > 0) {
    const linkedSalesOrders = await db.select().from(salesOrders)
      .where(and(
        eq(salesOrders.tenantId, tenantId),
        inArray(salesOrders.linkedOrderId, orderIds),
      ));
    const soIds = linkedSalesOrders.map(so => so.id);
    if (soIds.length > 0) {
      const invoices = await db.select().from(salesInvoices)
        .where(and(
          eq(salesInvoices.tenantId, tenantId),
          inArray(salesInvoices.salesOrderId, soIds),
        ));
      invoiceRevenue = invoices.reduce((sum, inv) => sum + parseFloat(inv.netAmount || '0'), 0);
    }
  }

  let fxRevenue = 0;
  if (orderIds.length > 0) {
    const ecLinks = await db.select().from(exportCaseOrders)
      .where(and(eq(exportCaseOrders.tenantId, tenantId), inArray(exportCaseOrders.orderId, orderIds)));
    const ecIds = [...new Set(ecLinks.map(l => l.exportCaseId))];
    if (ecIds.length > 0) {
      const fx = await db.select().from(fxReceipts)
        .where(and(eq(fxReceipts.tenantId, tenantId), inArray(fxReceipts.exportCaseId, ecIds)));
      fxRevenue = fx.reduce((sum, r) => sum + parseFloat(r.bdtAmount || '0'), 0);
    }
  }

  let revenueSource: 'fx' | 'invoice' | 'order' = 'order';
  let revenue = orderRevenue;
  if (invoiceRevenue > 0) {
    revenue = invoiceRevenue;
    revenueSource = 'invoice';
  }
  if (fxRevenue > 0) {
    revenue = fxRevenue;
    revenueSource = 'fx';
  }

  let materialCost = 0;
  for (const order of styleOrders) {
    const mats = await db.select().from(orderMaterials)
      .where(and(eq(orderMaterials.orderId, order.id), eq(orderMaterials.tenantId, tenantId)));
    materialCost += mats.reduce((sum, m) => sum + parseFloat(m.totalCost || '0'), 0);
  }

  const quotationIds = [...new Set(styleOrders.filter(o => o.quotationId).map(o => o.quotationId!))];
  let cmCost = 0;
  for (const qid of quotationIds) {
    const mfg = await db.select().from(quotationManufacturing)
      .where(eq(quotationManufacturing.quotationId, qid));
    cmCost += mfg.reduce((sum, m) => sum + parseFloat(m.totalOrderCost || '0'), 0);
  }

  const totalCost = materialCost + cmCost;
  const grossProfit = revenue - totalCost;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return {
    styleId,
    orderCount: styleOrders.length,
    totalQuantity: styleOrders.reduce((sum, o) => sum + o.totalQuantity, 0),
    revenue,
    orderRevenue,
    invoiceRevenue,
    fxRevenue,
    revenueSource,
    materialCost,
    cmCost,
    overheadCost: 0,
    logisticsCost: 0,
    financeCost: 0,
    bankCharges: 0,
    totalCost,
    grossProfit,
    grossMarginPct: parseFloat(grossMarginPct.toFixed(2)),
    netProfit: grossProfit,
    netMarginPct: parseFloat(grossMarginPct.toFixed(2)),
  };
}

export async function calculateExportCaseProfitability(tenantId: number, exportCaseId: number) {
  const links = await db.select().from(exportCaseOrders)
    .where(and(eq(exportCaseOrders.exportCaseId, exportCaseId), eq(exportCaseOrders.tenantId, tenantId)));

  const linkedOrders: any[] = [];
  for (const link of links) {
    const [order] = await db.select().from(orders).where(eq(orders.id, link.orderId));
    if (order) linkedOrders.push(order);
  }

  const revenue = linkedOrders.reduce((sum, o) =>
    sum + (parseFloat(o.priceConfirmed || '0') * o.totalQuantity), 0);

  const fx = await db.select().from(fxReceipts)
    .where(and(eq(fxReceipts.exportCaseId, exportCaseId), eq(fxReceipts.tenantId, tenantId)));
  const fxRevenue = fx.reduce((sum, r) => sum + parseFloat(r.bdtAmount || '0'), 0);

  const btbs = await db.select().from(btbLcs)
    .where(and(eq(btbLcs.exportCaseId, exportCaseId), eq(btbLcs.tenantId, tenantId)));
  const btbCost = btbs.reduce((sum, b) => sum + parseFloat(b.amount || '0'), 0);

  const bankCharges = fx.reduce((sum, r) => sum + parseFloat(r.bankCharges || '0'), 0);

  let materialCost = 0;
  for (const order of linkedOrders) {
    const mats = await db.select().from(orderMaterials)
      .where(and(eq(orderMaterials.orderId, order.id), eq(orderMaterials.tenantId, tenantId)));
    materialCost += mats.reduce((sum, m) => sum + parseFloat(m.totalCost || '0'), 0);
  }

  const totalCost = materialCost + btbCost + bankCharges;
  const actualRevenue = fxRevenue > 0 ? fxRevenue : revenue;
  const grossProfit = actualRevenue - totalCost;
  const grossMarginPct = actualRevenue > 0 ? (grossProfit / actualRevenue) * 100 : 0;

  return {
    exportCaseId,
    orderCount: linkedOrders.length,
    totalQuantity: linkedOrders.reduce((sum, o) => sum + o.totalQuantity, 0),
    orderRevenue: revenue,
    fxRevenue,
    actualRevenue,
    materialCost,
    btbCost,
    bankCharges,
    totalCost,
    grossProfit,
    grossMarginPct: parseFloat(grossMarginPct.toFixed(2)),
    netProfit: grossProfit,
    netMarginPct: parseFloat(grossMarginPct.toFixed(2)),
  };
}

export async function costingVsActualVariance(tenantId: number, orderId: number) {
  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
  if (!order) throw new Error('Order not found');

  let quotedMaterials = 0, quotedManufacturing = 0, quotedOther = 0;
  if (order.quotationId) {
    const qMats = await db.select().from(quotationMaterials)
      .where(eq(quotationMaterials.quotationId, order.quotationId));
    quotedMaterials = qMats.reduce((sum, m) => sum + parseFloat(m.totalAmount || '0'), 0);

    const qMfg = await db.select().from(quotationManufacturing)
      .where(eq(quotationManufacturing.quotationId, order.quotationId));
    quotedManufacturing = qMfg.reduce((sum, m) => sum + parseFloat(m.totalOrderCost || '0'), 0);

    const qOther = await db.select().from(quotationOtherCosts)
      .where(eq(quotationOtherCosts.quotationId, order.quotationId));
    quotedOther = qOther.reduce((sum, o) => sum + parseFloat(o.amount || '0'), 0);
  }

  const actMats = await db.select().from(orderMaterials)
    .where(and(eq(orderMaterials.orderId, orderId), eq(orderMaterials.tenantId, tenantId)));
  const actualMaterials = actMats.reduce((sum, m) => sum + parseFloat(m.totalCost || '0'), 0);

  const quotedTotal = quotedMaterials + quotedManufacturing + quotedOther;
  const actualTotal = actualMaterials;

  return {
    orderId: order.orderId,
    styleName: order.styleName,
    quantity: order.totalQuantity,
    categories: [
      {
        category: 'Materials',
        quoted: quotedMaterials,
        actual: actualMaterials,
        variance: actualMaterials - quotedMaterials,
        variancePct: quotedMaterials > 0 ? ((actualMaterials - quotedMaterials) / quotedMaterials * 100) : 0,
      },
      {
        category: 'Manufacturing',
        quoted: quotedManufacturing,
        actual: 0,
        variance: -quotedManufacturing,
        variancePct: -100,
      },
      {
        category: 'Other Costs',
        quoted: quotedOther,
        actual: 0,
        variance: -quotedOther,
        variancePct: -100,
      },
    ],
    totals: {
      quoted: quotedTotal,
      actual: actualTotal,
      variance: actualTotal - quotedTotal,
      variancePct: quotedTotal > 0 ? ((actualTotal - quotedTotal) / quotedTotal * 100) : 0,
    },
  };
}

export async function saveSnapshot(tenantId: number, entityType: string, entityId: number, data: any, userId?: number) {
  const [snapshot] = await db.insert(profitabilitySnapshots).values({
    tenantId,
    snapshotDate: new Date().toISOString().split('T')[0],
    entityType,
    entityId,
    revenue: (data.revenue || data.actualRevenue || 0).toFixed(2),
    materialCost: (data.materialCost || 0).toFixed(2),
    cmCost: (data.cmCost || 0).toFixed(2),
    overheadCost: (data.overheadCost || 0).toFixed(2),
    logisticsCost: (data.logisticsCost || 0).toFixed(2),
    financeCost: (data.financeCost || 0).toFixed(2),
    bankCharges: (data.bankCharges || 0).toFixed(2),
    totalCost: (data.totalCost || 0).toFixed(2),
    grossProfit: (data.grossProfit || 0).toFixed(2),
    grossMarginPct: (data.grossMarginPct || 0).toFixed(2),
    netProfit: (data.netProfit || 0).toFixed(2),
    netMarginPct: (data.netMarginPct || 0).toFixed(2),
    createdBy: userId || null,
  }).returning();
  return snapshot;
}

export async function setAllocation(tenantId: number, exportCaseId: number, allocations: Array<{
  orderId?: number;
  styleId?: number;
  method: string;
  ratio: string;
  locked?: boolean;
}>, userId?: number) {
  await db.delete(profitabilityAllocations)
    .where(and(
      eq(profitabilityAllocations.exportCaseId, exportCaseId),
      eq(profitabilityAllocations.tenantId, tenantId),
    ));

  const results = [];
  for (const a of allocations) {
    const [alloc] = await db.insert(profitabilityAllocations).values({
      tenantId,
      exportCaseId,
      orderId: a.orderId || null,
      styleId: a.styleId || null,
      method: a.method,
      ratio: a.ratio,
      locked: a.locked || false,
      createdBy: userId || null,
    }).returning();
    results.push(alloc);
  }
  return results;
}
