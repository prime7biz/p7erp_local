import { db } from '../db';
import { stockLedger, items, ledgerPostings, chartOfAccounts, tenantInventoryConfig, manufacturingOrders, orders, customers, salesInvoices, vouchers } from '@shared/schema';
import { eq, and, sql, ne } from 'drizzle-orm';

export async function getStockVsGLReconciliation(tenantId: number): Promise<{
  summary: { stockValue: number; glBalance: number; variance: number; variancePct: number };
  details: Array<{ itemId: number; itemName: string; stockQty: number; stockValue: number; glBalance: number; variance: number }>;
}> {
  try {
    const stockResult = await db.execute(sql`
      SELECT 
        sl.item_id,
        COALESCE(sl.item_name, i.name, 'Unknown') as item_name,
        COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as stock_qty,
        COALESCE(SUM(CAST(sl.value_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.value_out AS numeric)), 0) as stock_value
      FROM stock_ledger sl
      LEFT JOIN items i ON sl.item_id = i.id
      WHERE sl.tenant_id = ${tenantId} AND sl.is_reversed = false
      GROUP BY sl.item_id, sl.item_name, i.name
      ORDER BY item_name
    `);

    const stockItems = (stockResult.rows || []) as Array<{
      item_id: number; item_name: string; stock_qty: string; stock_value: string;
    }>;

    let glBalance = 0;
    try {
      const [config] = await db.select()
        .from(tenantInventoryConfig)
        .where(eq(tenantInventoryConfig.tenantId, tenantId));

      if (config?.inventoryAssetAccountId) {
        const [glResult] = await db.select({
          balance: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0) - COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
        }).from(ledgerPostings)
          .where(and(
            eq(ledgerPostings.tenantId, tenantId),
            eq(ledgerPostings.accountId, config.inventoryAssetAccountId),
          ));
        glBalance = parseFloat(glResult?.balance || '0');
      }
    } catch (e) {
      console.error('Error fetching GL balance for stock reconciliation:', e);
    }

    const totalStockValue = stockItems.reduce((sum, r) => sum + parseFloat(r.stock_value || '0'), 0);

    const details = stockItems.map(row => {
      const stockValue = parseFloat(row.stock_value || '0');
      return {
        itemId: Number(row.item_id),
        itemName: String(row.item_name),
        stockQty: parseFloat(parseFloat(row.stock_qty || '0').toFixed(4)),
        stockValue: Math.round(stockValue * 100) / 100,
        glBalance: 0,
        variance: Math.round(stockValue * 100) / 100,
      };
    });

    const variance = Math.round((totalStockValue - glBalance) * 100) / 100;
    const variancePct = totalStockValue !== 0 ? Math.round((variance / totalStockValue) * 10000) / 100 : 0;

    return {
      summary: {
        stockValue: Math.round(totalStockValue * 100) / 100,
        glBalance: Math.round(glBalance * 100) / 100,
        variance,
        variancePct,
      },
      details,
    };
  } catch (error) {
    console.error('Stock vs GL reconciliation error:', error);
    return {
      summary: { stockValue: 0, glBalance: 0, variance: 0, variancePct: 0 },
      details: [],
    };
  }
}

export async function getWIPVsGLReconciliation(tenantId: number): Promise<{
  summary: { wipValue: number; glBalance: number; variance: number };
  details: Array<{ orderId: number; orderNumber: string; wipValue: number; glBalance: number; variance: number }>;
}> {
  try {
    const openMOs = await db.select({
      id: manufacturingOrders.id,
      moNumber: manufacturingOrders.moNumber,
      totalMaterialCost: manufacturingOrders.totalMaterialCost,
      totalProcessingCost: manufacturingOrders.totalProcessingCost,
      totalOverheadCost: manufacturingOrders.totalOverheadCost,
      totalCost: manufacturingOrders.totalCost,
      status: manufacturingOrders.status,
    })
      .from(manufacturingOrders)
      .where(and(
        eq(manufacturingOrders.tenantId, tenantId),
        sql`${manufacturingOrders.status} NOT IN ('completed', 'cancelled', 'closed')`,
      ));

    const details = openMOs.map(mo => {
      const wipValue = parseFloat(mo.totalCost || '0');
      return {
        orderId: mo.id,
        orderNumber: mo.moNumber,
        wipValue: Math.round(wipValue * 100) / 100,
        glBalance: 0,
        variance: Math.round(wipValue * 100) / 100,
      };
    });

    const totalWipValue = details.reduce((sum, d) => sum + d.wipValue, 0);

    let glBalance = 0;
    try {
      const wipAccounts = await db.select({
        id: chartOfAccounts.id,
      }).from(chartOfAccounts)
        .where(and(
          eq(chartOfAccounts.tenantId, tenantId),
          eq(chartOfAccounts.isActive, true),
          sql`LOWER(${chartOfAccounts.name}) LIKE '%work in progress%' OR LOWER(${chartOfAccounts.name}) LIKE '%wip%'`,
        ));

      if (wipAccounts.length > 0) {
        const accountIds = wipAccounts.map(a => a.id);
        const [glResult] = await db.select({
          balance: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0) - COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
        }).from(ledgerPostings)
          .where(and(
            eq(ledgerPostings.tenantId, tenantId),
            sql`${ledgerPostings.accountId} IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`,
          ));
        glBalance = parseFloat(glResult?.balance || '0');
      }
    } catch (e) {
      console.error('Error fetching WIP GL balance:', e);
    }

    const variance = Math.round((totalWipValue - glBalance) * 100) / 100;

    return {
      summary: {
        wipValue: Math.round(totalWipValue * 100) / 100,
        glBalance: Math.round(glBalance * 100) / 100,
        variance,
      },
      details,
    };
  } catch (error) {
    console.error('WIP vs GL reconciliation error:', error);
    return {
      summary: { wipValue: 0, glBalance: 0, variance: 0 },
      details: [],
    };
  }
}

export async function getOrderProfitability(tenantId: number, orderId?: number): Promise<{
  orders: Array<{
    orderId: number; orderNumber: string; buyerName: string;
    revenue: number; materialCost: number; laborCost: number; overheadCost: number;
    grossProfit: number; grossMarginPct: number;
  }>;
}> {
  try {
    const conditions: any[] = [eq(orders.tenantId, tenantId)];
    if (orderId) {
      conditions.push(eq(orders.id, orderId));
    }

    const orderRows = await db.select({
      id: orders.id,
      orderId: orders.orderId,
      customerId: orders.customerId,
      totalQuantity: orders.totalQuantity,
      priceConfirmed: orders.priceConfirmed,
      currency: orders.currency,
    })
      .from(orders)
      .where(and(...conditions));

    const result = [];

    for (const order of orderRows) {
      let buyerName = 'Unknown';
      try {
        const [customer] = await db.select({ customerName: customers.customerName })
          .from(customers)
          .where(eq(customers.id, order.customerId));
        buyerName = customer?.customerName || 'Unknown';
      } catch (e) {
        console.error(`Error fetching customer name for order ${order.id}:`, e);
      }

      const orderValue = parseFloat(order.priceConfirmed || '0') * (order.totalQuantity || 0);

      let invoiceRevenue = 0;
      try {
        const [invResult] = await db.select({
          total: sql<string>`COALESCE(SUM(CAST(${salesInvoices.netAmount} AS numeric)), 0)`,
        }).from(salesInvoices)
          .where(and(
            eq(salesInvoices.tenantId, tenantId),
            eq(salesInvoices.customerId, order.customerId),
            ne(salesInvoices.status, 'CANCELLED'),
          ));
        invoiceRevenue = parseFloat(invResult?.total || '0');
      } catch (e) {
        console.error(`Error fetching invoice revenue for order ${order.id}:`, e);
      }

      const revenue = invoiceRevenue > 0 ? invoiceRevenue : orderValue;

      let materialCost = 0;
      try {
        const [stockCost] = await db.select({
          total: sql<string>`COALESCE(SUM(CAST(value_out AS numeric)), 0)`,
        }).from(stockLedger)
          .where(and(
            eq(stockLedger.tenantId, tenantId),
            eq(stockLedger.isReversed, false),
            sql`${stockLedger.remarks} ILIKE ${'%' + order.orderId + '%'}`,
          ));
        materialCost = parseFloat(stockCost?.total || '0');
      } catch (e) {
        console.error(`Error fetching material cost from stock ledger for order ${order.id}:`, e);
      }

      if (materialCost === 0) {
        try {
          const moRows = await db.select({
            totalMaterialCost: manufacturingOrders.totalMaterialCost,
            totalProcessingCost: manufacturingOrders.totalProcessingCost,
            totalOverheadCost: manufacturingOrders.totalOverheadCost,
          }).from(manufacturingOrders)
            .where(and(
              eq(manufacturingOrders.tenantId, tenantId),
              eq(manufacturingOrders.orderId, order.id),
            ));

          for (const mo of moRows) {
            materialCost += parseFloat(mo.totalMaterialCost || '0');
          }
        } catch (e) {
          console.error(`Error fetching material cost from manufacturing orders for order ${order.id}:`, e);
        }
      }

      let laborCost = 0;
      let overheadCost = 0;
      try {
        const moRows = await db.select({
          totalProcessingCost: manufacturingOrders.totalProcessingCost,
          totalOverheadCost: manufacturingOrders.totalOverheadCost,
        }).from(manufacturingOrders)
          .where(and(
            eq(manufacturingOrders.tenantId, tenantId),
            eq(manufacturingOrders.orderId, order.id),
          ));

        for (const mo of moRows) {
          laborCost += parseFloat(mo.totalProcessingCost || '0');
          overheadCost += parseFloat(mo.totalOverheadCost || '0');
        }
      } catch (e) {
        console.error(`Error fetching labor/overhead costs for order ${order.id}:`, e);
      }

      const totalCost = materialCost + laborCost + overheadCost;
      const grossProfit = revenue - totalCost;
      const grossMarginPct = revenue !== 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0;

      result.push({
        orderId: order.id,
        orderNumber: order.orderId,
        buyerName,
        revenue: Math.round(revenue * 100) / 100,
        materialCost: Math.round(materialCost * 100) / 100,
        laborCost: Math.round(laborCost * 100) / 100,
        overheadCost: Math.round(overheadCost * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMarginPct,
      });
    }

    return { orders: result };
  } catch (error) {
    console.error('Order profitability error:', error);
    return { orders: [] };
  }
}
