import { db } from '../db';
import {
  inquiries, quotations, orders, styles, exportCases, exportCaseOrders,
  proformaInvoices, btbLcs, fxReceipts, commercialLcs, shipments,
  orderSamples, orderMaterials, customers, entityEvents, documentRefs,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function getStyleFollowup(tenantId: number, styleId: number) {
  const [style] = await db.select().from(styles)
    .where(and(eq(styles.id, styleId), eq(styles.tenantId, tenantId)));
  if (!style) throw new Error('Style not found');

  const styleInquiries = await db.select().from(inquiries)
    .where(and(eq(inquiries.tenantId, tenantId), eq(inquiries.styleId, styleId)))
    .orderBy(desc(inquiries.createdAt));

  const styleQuotations = await db.select().from(quotations)
    .where(and(eq(quotations.tenantId, tenantId), eq(quotations.styleId, styleId)))
    .orderBy(desc(quotations.createdAt));

  const styleOrders = await db.select().from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.styleId, styleId)))
    .orderBy(desc(orders.createdAt));

  const orderIds = styleOrders.map(o => o.id);

  let samples: any[] = [];
  let materials: any[] = [];
  let linkedExportCases: any[] = [];
  let linkedPIs: any[] = [];
  let linkedBtbs: any[] = [];
  let linkedFx: any[] = [];
  let linkedShipments: any[] = [];

  if (orderIds.length > 0) {
    for (const oid of orderIds) {
      const s = await db.select().from(orderSamples).where(eq(orderSamples.orderId, oid));
      samples.push(...s);
      const m = await db.select().from(orderMaterials).where(eq(orderMaterials.orderId, oid));
      materials.push(...m);
    }

    const ecLinks = await db.select().from(exportCaseOrders)
      .where(and(eq(exportCaseOrders.tenantId, tenantId)));
    const relevantLinks = ecLinks.filter(l => orderIds.includes(l.orderId));
    const ecIds = [...new Set(relevantLinks.map(l => l.exportCaseId))];

    for (const ecId of ecIds) {
      const [ec] = await db.select().from(exportCases).where(eq(exportCases.id, ecId));
      if (ec) {
        linkedExportCases.push(ec);
        const pis = await db.select().from(proformaInvoices)
          .where(and(eq(proformaInvoices.exportCaseId, ecId), eq(proformaInvoices.tenantId, tenantId)));
        linkedPIs.push(...pis);
        const btbs = await db.select().from(btbLcs)
          .where(and(eq(btbLcs.exportCaseId, ecId), eq(btbLcs.tenantId, tenantId)));
        linkedBtbs.push(...btbs);
        const fx = await db.select().from(fxReceipts)
          .where(and(eq(fxReceipts.exportCaseId, ecId), eq(fxReceipts.tenantId, tenantId)));
        linkedFx.push(...fx);
      }
    }

    for (const oid of orderIds) {
      const s = await db.select().from(shipments)
        .where(and(eq(shipments.orderId, oid), eq(shipments.tenantId, tenantId)));
      linkedShipments.push(...s);
    }
  }

  const entityPairs = [
    { entityType: 'STYLE', entityId: styleId },
    ...styleOrders.map(o => ({ entityType: 'ORDER', entityId: o.id })),
    ...linkedExportCases.map(ec => ({ entityType: 'EXPORT_CASE', entityId: ec.id })),
  ];

  let timeline: any[] = [];
  if (entityPairs.length > 0) {
    const conditions = entityPairs.map(p =>
      sql`(${entityEvents.entityType} = ${p.entityType} AND ${entityEvents.entityId} = ${p.entityId})`
    );
    timeline = await db.select().from(entityEvents)
      .where(and(eq(entityEvents.tenantId, tenantId), sql.join(conditions, sql` OR `)))
      .orderBy(desc(entityEvents.createdAt))
      .limit(50);
  }

  const alerts = buildStyleAlerts(styleOrders, samples, materials, linkedBtbs, linkedShipments);

  return {
    style,
    inquiries: styleInquiries,
    quotations: styleQuotations,
    orders: styleOrders,
    samples,
    materials,
    exportCases: linkedExportCases,
    proformaInvoices: linkedPIs,
    btbLcs: linkedBtbs,
    fxReceipts: linkedFx,
    shipments: linkedShipments,
    timeline,
    alerts,
  };
}

export async function getExportCaseFollowup(tenantId: number, exportCaseId: number) {
  const [ec] = await db.select().from(exportCases)
    .where(and(eq(exportCases.id, exportCaseId), eq(exportCases.tenantId, tenantId)));
  if (!ec) throw new Error('Export case not found');

  const buyer = ec.buyerId ? await db.select().from(customers)
    .where(eq(customers.id, ec.buyerId)).then(r => r[0]) : null;

  const lc = ec.exportLcId ? await db.select().from(commercialLcs)
    .where(eq(commercialLcs.id, ec.exportLcId)).then(r => r[0]) : null;

  const links = await db.select().from(exportCaseOrders)
    .where(and(eq(exportCaseOrders.exportCaseId, exportCaseId), eq(exportCaseOrders.tenantId, tenantId)));

  const linkedOrders: any[] = [];
  for (const link of links) {
    const [order] = await db.select().from(orders).where(eq(orders.id, link.orderId));
    if (order) linkedOrders.push({ ...order, allocation: link });
  }

  const pis = await db.select().from(proformaInvoices)
    .where(and(eq(proformaInvoices.exportCaseId, exportCaseId), eq(proformaInvoices.tenantId, tenantId)));

  const btbs = await db.select({
    btbLc: btbLcs,
    supplierName: sql<string>`COALESCE(${sql.raw('vendors.vendor_name')}, 'Unknown')`,
  })
    .from(btbLcs)
    .leftJoin(sql.raw('vendors'), sql`${btbLcs.supplierId} = vendors.id`)
    .where(and(eq(btbLcs.exportCaseId, exportCaseId), eq(btbLcs.tenantId, tenantId)));

  const btbList = btbs.map(b => ({
    ...b.btbLc,
    supplierName: b.supplierName,
    daysToMaturity: b.btbLc.maturityDate
      ? Math.ceil((new Date(b.btbLc.maturityDate).getTime() - Date.now()) / 86400000)
      : null,
  }));

  let allShipments: any[] = [];
  for (const link of links) {
    const s = await db.select().from(shipments)
      .where(and(eq(shipments.orderId, link.orderId), eq(shipments.tenantId, tenantId)));
    allShipments.push(...s);
  }

  const fx = await db.select().from(fxReceipts)
    .where(and(eq(fxReceipts.exportCaseId, exportCaseId), eq(fxReceipts.tenantId, tenantId)));

  const timeline = await db.select().from(entityEvents)
    .where(and(
      eq(entityEvents.tenantId, tenantId),
      eq(entityEvents.entityType, 'EXPORT_CASE'),
      eq(entityEvents.entityId, exportCaseId),
    ))
    .orderBy(desc(entityEvents.createdAt))
    .limit(50);

  const totalReceived = fx.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const totalBdt = fx.reduce((sum, r) => sum + parseFloat(r.bdtAmount || '0'), 0);

  return {
    exportCase: ec,
    buyer,
    lc,
    orders: linkedOrders,
    proformaInvoices: pis,
    btbLcs: btbList,
    shipments: allShipments,
    fxReceipts: fx,
    timeline,
    summary: {
      totalOrders: linkedOrders.length,
      totalOrderValue: linkedOrders.reduce((sum, o) => sum + parseFloat(o.priceConfirmed || '0') * o.totalQuantity, 0),
      totalFxReceived: totalReceived,
      totalFxBdt: totalBdt,
      btbCount: btbList.length,
      btbTotal: btbList.reduce((sum, b) => sum + parseFloat(b.amount || '0'), 0),
    },
  };
}

export async function searchFollowup(tenantId: number, query: string) {
  if (!query || query.length < 2) return [];

  const refs = await db.select().from(documentRefs)
    .where(and(
      eq(documentRefs.tenantId, tenantId),
      sql`LOWER(${documentRefs.refValue}) LIKE LOWER(${'%' + query + '%'})`,
    ))
    .limit(20);

  const styleResults = await db.select().from(styles)
    .where(and(
      eq(styles.tenantId, tenantId),
      sql`LOWER(${styles.styleNumber}) LIKE LOWER(${'%' + query + '%'})`,
    )).limit(10);

  const orderResults = await db.select().from(orders)
    .where(and(
      eq(orders.tenantId, tenantId),
      sql`(LOWER(${orders.orderId}) LIKE LOWER(${'%' + query + '%'}) OR LOWER(COALESCE(${orders.poNumber}, '')) LIKE LOWER(${'%' + query + '%'}))`,
    )).limit(10);

  const ecResults = await db.select().from(exportCases)
    .where(and(
      eq(exportCases.tenantId, tenantId),
      sql`LOWER(${exportCases.exportCaseNumber}) LIKE LOWER(${'%' + query + '%'})`,
    )).limit(10);

  const lcResults = await db.select().from(commercialLcs)
    .where(and(
      eq(commercialLcs.tenantId, tenantId),
      sql`LOWER(${commercialLcs.lcNumber}) LIKE LOWER(${'%' + query + '%'})`,
    )).limit(10);

  return {
    styles: styleResults.map(s => ({ id: s.id, type: 'STYLE', label: `Style: ${s.styleNumber} - ${s.styleName}` })),
    orders: orderResults.map(o => ({ id: o.id, type: 'ORDER', label: `Order: ${o.orderId} - ${o.styleName}` })),
    exportCases: ecResults.map(ec => ({ id: ec.id, type: 'EXPORT_CASE', label: `Export Case: ${ec.exportCaseNumber}` })),
    lcs: lcResults.map(lc => ({ id: lc.id, type: 'LC', label: `LC: ${lc.lcNumber}` })),
    documentRefs: refs.map(r => ({ entityType: r.entityType, entityId: r.entityId, refValue: r.refValue })),
  };
}

export async function getAlerts(tenantId: number) {
  const now = new Date();
  const d30 = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const btbMaturities = await db.select().from(btbLcs)
    .where(and(
      eq(btbLcs.tenantId, tenantId),
      sql`${btbLcs.maturityDate} >= ${today}`,
      sql`${btbLcs.maturityDate} <= ${d30}`,
      sql`${btbLcs.status} NOT IN ('PAID', 'SETTLED')`,
    ))
    .orderBy(btbLcs.maturityDate);

  const pendingShipments = await db.select().from(orders)
    .where(and(
      eq(orders.tenantId, tenantId),
      sql`${orders.orderStatus} IN ('in_production', 'ready_for_production')`,
      sql`${orders.deliveryDate} <= ${d30}`,
    ));

  return {
    btbMaturities: btbMaturities.map(b => ({
      type: 'BTB_MATURITY',
      severity: b.maturityDate && Math.ceil((new Date(b.maturityDate).getTime() - now.getTime()) / 86400000) <= 7 ? 'critical' : 'warning',
      message: `BTB ${b.btbLcNumber} matures on ${b.maturityDate}`,
      entityType: 'BTB_LC',
      entityId: b.id,
      dueDate: b.maturityDate,
      amount: b.maturityAmount || b.amount,
    })),
    pendingShipments: pendingShipments.map(o => ({
      type: 'PENDING_SHIPMENT',
      severity: o.deliveryDate && Math.ceil((new Date(o.deliveryDate).getTime() - now.getTime()) / 86400000) <= 7 ? 'critical' : 'warning',
      message: `Order ${o.orderId} delivery due ${o.deliveryDate}`,
      entityType: 'ORDER',
      entityId: o.id,
      dueDate: o.deliveryDate,
    })),
  };
}

function buildStyleAlerts(orders: any[], samples: any[], materials: any[], btbs: any[], shipments: any[]) {
  const alerts: any[] = [];
  const now = Date.now();

  for (const btb of btbs) {
    if (btb.maturityDate && btb.status !== 'PAID' && btb.status !== 'SETTLED') {
      const days = Math.ceil((new Date(btb.maturityDate).getTime() - now) / 86400000);
      if (days <= 30) {
        alerts.push({
          type: 'BTB_MATURITY',
          severity: days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'info',
          message: `BTB ${btb.btbLcNumber} matures in ${days} days`,
          dueDate: btb.maturityDate,
        });
      }
    }
  }

  for (const sample of samples) {
    if (sample.status === 'rejected') {
      alerts.push({
        type: 'SAMPLE_REJECTED',
        severity: 'warning',
        message: `${sample.sampleType} sample rejected`,
      });
    }
  }

  for (const order of orders) {
    if (order.deliveryDate) {
      const days = Math.ceil((new Date(order.deliveryDate).getTime() - now) / 86400000);
      if (days <= 14 && ['new', 'in_progress', 'ready_for_production'].includes(order.orderStatus)) {
        alerts.push({
          type: 'DELIVERY_AT_RISK',
          severity: days <= 7 ? 'critical' : 'warning',
          message: `Order ${order.orderId} delivery in ${days} days, status: ${order.orderStatus}`,
        });
      }
    }
  }

  return alerts;
}
