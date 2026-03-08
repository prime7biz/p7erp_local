import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../db';
import { costCenterCategories, costCenterBudgets, orders, orderMaterials, voucherItems, vouchers, customers, chartOfAccounts } from '@shared/schema';
import { eq, and, sql, desc, asc, sum } from 'drizzle-orm';

const router = express.Router();

const getTenantId = (req: Request): number => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new Error("Tenant ID not found");
  return tenantId;
};

const getUserId = (req: Request): number => {
  const userId = req.user?.id;
  if (!userId) throw new Error("User ID not found");
  return userId;
};

router.get('/categories', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const categories = await db
      .select()
      .from(costCenterCategories)
      .where(eq(costCenterCategories.tenantId, tenantId))
      .orderBy(asc(costCenterCategories.sortOrder));
    res.json(categories);
  } catch (error: any) {
    console.error('List cost center categories error:', error);
    res.status(500).json({ message: error.message || 'Failed to list categories' });
  }
});

router.post('/categories', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, code, description, sortOrder, isActive } = req.body;
    if (!name || !code) {
      return res.status(400).json({ message: 'Name and code are required' });
    }
    const [category] = await db.insert(costCenterCategories).values({
      name, code, description: description || null,
      sortOrder: sortOrder || 0, isActive: isActive !== false,
      tenantId,
    }).returning();
    res.status(201).json(category);
  } catch (error: any) {
    console.error('Create cost center category error:', error);
    res.status(500).json({ message: error.message || 'Failed to create category' });
  }
});

router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
    const { name, code, description, sortOrder, isActive } = req.body;
    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;
    const [updated] = await db.update(costCenterCategories)
      .set(updateData)
      .where(and(eq(costCenterCategories.id, id), eq(costCenterCategories.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ message: 'Category not found' });
    res.json(updated);
  } catch (error: any) {
    console.error('Update cost center category error:', error);
    res.status(500).json({ message: error.message || 'Failed to update category' });
  }
});

router.post('/categories/seed', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const defaults = [
      { name: 'Material', code: 'MAT', description: 'Raw materials - fabric, yarn, etc.', sortOrder: 1 },
      { name: 'Trims', code: 'TRM', description: 'Trims and accessories - buttons, zippers, labels', sortOrder: 2 },
      { name: 'CM/Manufacturing', code: 'CM', description: 'Cut & Make / Manufacturing charges', sortOrder: 3 },
      { name: 'Logistics/Shipping', code: 'LOG', description: 'Freight, shipping, transport', sortOrder: 4 },
      { name: 'Commercial/LC', code: 'COM', description: 'LC charges, bank charges, commission', sortOrder: 5 },
      { name: 'Overhead/Admin', code: 'OVH', description: 'Administrative overhead, utilities', sortOrder: 6 },
      { name: 'Subcontracting', code: 'SUB', description: 'Subcontractor charges - printing, embroidery, washing', sortOrder: 7 },
      { name: 'Testing/Lab', code: 'TST', description: 'Testing, lab, certification charges', sortOrder: 8 },
    ];
    const existing = await db.select({ code: costCenterCategories.code })
      .from(costCenterCategories)
      .where(eq(costCenterCategories.tenantId, tenantId));
    const existingCodes = new Set(existing.map(e => e.code));
    const toInsert = defaults.filter(d => !existingCodes.has(d.code));
    if (toInsert.length === 0) {
      return res.json({ message: 'All default categories already exist', created: 0 });
    }
    const inserted = await db.insert(costCenterCategories)
      .values(toInsert.map(d => ({ ...d, tenantId, isActive: true })))
      .returning();
    res.json({ message: `Created ${inserted.length} categories`, created: inserted.length, categories: inserted });
  } catch (error: any) {
    console.error('Seed cost center categories error:', error);
    res.status(500).json({ message: error.message || 'Failed to seed categories' });
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const ordersList = await db
      .select({
        id: orders.id,
        orderId: orders.orderId,
        styleName: orders.styleName,
        orderStatus: orders.orderStatus,
        totalQuantity: orders.totalQuantity,
        customerId: orders.customerId,
        customerName: customers.customerName,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orders.tenantId, tenantId))
      .orderBy(desc(orders.createdAt));

    const summaries = [];
    for (const order of ordersList) {
      const budgetResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(${costCenterBudgets.plannedAmount} AS numeric)), 0)` })
        .from(costCenterBudgets)
        .where(and(eq(costCenterBudgets.costCenterId, order.id), eq(costCenterBudgets.tenantId, tenantId)));

      const actualResult = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(vi.debit_amount AS numeric)), 0) as total_actual
        FROM voucher_items vi
        JOIN vouchers v ON vi.voucher_id = v.id
        WHERE vi.cost_center_id = ${order.id}
          AND vi.tenant_id = ${tenantId}
          AND v.is_cancelled = false
      `);

      const budgetTotal = parseFloat((budgetResult[0] as any)?.total || '0');
      const actualTotal = parseFloat((actualResult.rows[0] as any)?.total_actual || '0');
      const variance = budgetTotal - actualTotal;
      const variancePercent = budgetTotal > 0 ? (variance / budgetTotal) * 100 : 0;

      summaries.push({
        orderId: order.id,
        orderNumber: order.orderId,
        styleName: order.styleName,
        customerName: order.customerName,
        orderStatus: order.orderStatus,
        totalQuantity: order.totalQuantity,
        budgetTotal,
        actualTotal,
        variance,
        variancePercent: Math.round(variancePercent * 100) / 100,
      });
    }

    const totalBudget = summaries.reduce((s, c) => s + c.budgetTotal, 0);
    const totalActual = summaries.reduce((s, c) => s + c.actualTotal, 0);

    res.json({
      costCenters: summaries,
      totalCostCenters: summaries.length,
      totalBudget,
      totalActual,
      totalVariance: totalBudget - totalActual,
    });
  } catch (error: any) {
    console.error('Cost center summary error:', error);
    res.status(500).json({ message: error.message || 'Failed to get summary' });
  }
});

router.get('/:costCenterId/budgets', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const costCenterId = parseIntParam(req.params.costCenterId, "costCenterId");
    if (isNaN(costCenterId)) return res.status(400).json({ message: 'Invalid cost center ID' });

    const budgets = await db
      .select({
        budget: costCenterBudgets,
        categoryName: costCenterCategories.name,
        categoryCode: costCenterCategories.code,
      })
      .from(costCenterBudgets)
      .leftJoin(costCenterCategories, eq(costCenterBudgets.categoryId, costCenterCategories.id))
      .where(and(eq(costCenterBudgets.costCenterId, costCenterId), eq(costCenterBudgets.tenantId, tenantId)))
      .orderBy(asc(costCenterCategories.sortOrder));

    res.json(budgets.map(b => ({
      ...b.budget,
      categoryName: b.categoryName,
      categoryCode: b.categoryCode,
    })));
  } catch (error: any) {
    console.error('Get budgets error:', error);
    res.status(500).json({ message: error.message || 'Failed to get budgets' });
  }
});

router.post('/:costCenterId/budgets', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const costCenterId = parseIntParam(req.params.costCenterId, "costCenterId");
    if (isNaN(costCenterId)) return res.status(400).json({ message: 'Invalid cost center ID' });

    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'items array is required' });
    }

    const created = [];
    for (const item of items) {
      const { categoryId, description, plannedQuantity, plannedRate, plannedAmount, unit, notes } = item;
      if (!categoryId || plannedAmount === undefined) {
        continue;
      }
      const [budget] = await db.insert(costCenterBudgets).values({
        costCenterId, categoryId,
        description: description || null,
        plannedQuantity: plannedQuantity ? String(plannedQuantity) : null,
        plannedRate: plannedRate ? String(plannedRate) : null,
        plannedAmount: String(plannedAmount),
        unit: unit || null,
        notes: notes || null,
        tenantId, createdBy: userId,
      }).returning();
      created.push(budget);
    }
    res.status(201).json({ message: `Created ${created.length} budget items`, budgets: created });
  } catch (error: any) {
    console.error('Create budgets error:', error);
    res.status(500).json({ message: error.message || 'Failed to create budgets' });
  }
});

router.put('/budgets/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid budget ID' });

    const { categoryId, description, plannedQuantity, plannedRate, plannedAmount, unit, notes } = req.body;
    const updateData: any = { updatedAt: new Date() };
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (description !== undefined) updateData.description = description;
    if (plannedQuantity !== undefined) updateData.plannedQuantity = String(plannedQuantity);
    if (plannedRate !== undefined) updateData.plannedRate = String(plannedRate);
    if (plannedAmount !== undefined) updateData.plannedAmount = String(plannedAmount);
    if (unit !== undefined) updateData.unit = unit;
    if (notes !== undefined) updateData.notes = notes;

    const [updated] = await db.update(costCenterBudgets)
      .set(updateData)
      .where(and(eq(costCenterBudgets.id, id), eq(costCenterBudgets.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ message: 'Budget item not found' });
    res.json(updated);
  } catch (error: any) {
    console.error('Update budget error:', error);
    res.status(500).json({ message: error.message || 'Failed to update budget' });
  }
});

router.delete('/budgets/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid budget ID' });

    const result = await db.delete(costCenterBudgets)
      .where(and(eq(costCenterBudgets.id, id), eq(costCenterBudgets.tenantId, tenantId)))
      .returning();
    if (result.length === 0) return res.status(404).json({ message: 'Budget item not found' });
    res.json({ message: 'Budget item deleted' });
  } catch (error: any) {
    console.error('Delete budget error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete budget' });
  }
});

router.post('/:costCenterId/import-from-bom', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const costCenterId = parseIntParam(req.params.costCenterId, "costCenterId");
    if (isNaN(costCenterId)) return res.status(400).json({ message: 'Invalid cost center ID' });

    const materials = await db.select().from(orderMaterials)
      .where(and(eq(orderMaterials.orderId, costCenterId), eq(orderMaterials.tenantId, tenantId)));

    if (materials.length === 0) {
      return res.json({ message: 'No BOM materials found for this order', created: 0 });
    }

    const categories = await db.select().from(costCenterCategories)
      .where(eq(costCenterCategories.tenantId, tenantId));

    const categoryMap: Record<string, number> = {};
    for (const cat of categories) {
      categoryMap[cat.code] = cat.id;
      categoryMap[cat.name.toLowerCase()] = cat.id;
    }

    const grouped: Record<string, { qty: number; amount: number; items: string[] }> = {};
    for (const mat of materials) {
      const matType = (mat.materialType || 'Material').toLowerCase();
      let catCode = 'MAT';
      if (matType.includes('trim') || matType.includes('label') || matType.includes('hangtag') || matType.includes('button') || matType.includes('zipper')) {
        catCode = 'TRM';
      } else if (matType.includes('fabric') || matType.includes('yarn') || matType.includes('material')) {
        catCode = 'MAT';
      }
      if (!grouped[catCode]) grouped[catCode] = { qty: 0, amount: 0, items: [] };
      grouped[catCode].qty += parseFloat(String(mat.quantityNeeded)) || 0;
      grouped[catCode].amount += parseFloat(String(mat.totalCost)) || 0;
      grouped[catCode].items.push(mat.materialType);
    }

    const created = [];
    for (const [code, data] of Object.entries(grouped)) {
      const categoryId = categoryMap[code];
      if (!categoryId) continue;
      const rate = data.qty > 0 ? data.amount / data.qty : 0;
      const [budget] = await db.insert(costCenterBudgets).values({
        costCenterId, categoryId,
        description: `BOM Import: ${[...new Set(data.items)].join(', ')}`,
        plannedQuantity: String(data.qty),
        plannedRate: String(Math.round(rate * 100) / 100),
        plannedAmount: String(Math.round(data.amount * 100) / 100),
        unit: null, notes: 'Auto-imported from BOM',
        tenantId, createdBy: userId,
      }).returning();
      created.push(budget);
    }

    res.json({ message: `Imported ${created.length} budget items from BOM`, created: created.length, budgets: created });
  } catch (error: any) {
    console.error('Import from BOM error:', error);
    res.status(500).json({ message: error.message || 'Failed to import from BOM' });
  }
});

router.get('/:costCenterId/job-cost-sheet', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const costCenterId = parseIntParam(req.params.costCenterId, "costCenterId");
    if (isNaN(costCenterId)) return res.status(400).json({ message: 'Invalid cost center ID' });

    const [order] = await db
      .select({
        id: orders.id, orderId: orders.orderId, styleName: orders.styleName,
        totalQuantity: orders.totalQuantity, deliveryDate: orders.deliveryDate,
        orderStatus: orders.orderStatus, currency: orders.currency,
        customerName: customers.customerName, priceConfirmed: orders.priceConfirmed,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(eq(orders.id, costCenterId), eq(orders.tenantId, tenantId)));

    if (!order) return res.status(404).json({ message: 'Order/Cost Center not found' });

    const allCategories = await db.select().from(costCenterCategories)
      .where(and(eq(costCenterCategories.tenantId, tenantId), eq(costCenterCategories.isActive, true)))
      .orderBy(asc(costCenterCategories.sortOrder));

    const budgets = await db.select().from(costCenterBudgets)
      .where(and(eq(costCenterBudgets.costCenterId, costCenterId), eq(costCenterBudgets.tenantId, tenantId)));

    const actualsByCategory = await db.execute(sql`
      SELECT 
        vi.cost_category_id,
        COALESCE(SUM(CAST(vi.debit_amount AS numeric)), 0) as actual_amount,
        COUNT(*) as transaction_count
      FROM voucher_items vi
      JOIN vouchers v ON vi.voucher_id = v.id
      WHERE vi.cost_center_id = ${costCenterId}
        AND vi.tenant_id = ${tenantId}
        AND v.is_cancelled = false
      GROUP BY vi.cost_category_id
    `);

    const actualMap: Record<number, { amount: number; count: number }> = {};
    let uncategorizedActual = 0;
    for (const row of actualsByCategory.rows as any[]) {
      if (row.cost_category_id) {
        actualMap[row.cost_category_id] = {
          amount: parseFloat(row.actual_amount) || 0,
          count: parseInt(row.transaction_count) || 0,
        };
      } else {
        uncategorizedActual += parseFloat(row.actual_amount) || 0;
      }
    }

    const budgetByCategory: Record<number, { qty: number; rate: number; amount: number; description: string | null }> = {};
    for (const b of budgets) {
      const catId = b.categoryId;
      if (!budgetByCategory[catId]) {
        budgetByCategory[catId] = { qty: 0, rate: 0, amount: 0, description: null };
      }
      budgetByCategory[catId].qty += parseFloat(String(b.plannedQuantity)) || 0;
      budgetByCategory[catId].amount += parseFloat(String(b.plannedAmount)) || 0;
      if (b.description) budgetByCategory[catId].description = b.description;
    }
    for (const catId in budgetByCategory) {
      const entry = budgetByCategory[catId];
      entry.rate = entry.qty > 0 ? entry.amount / entry.qty : 0;
    }

    const categories = allCategories.map(cat => {
      const planned = budgetByCategory[cat.id] || { qty: 0, rate: 0, amount: 0 };
      const actual = actualMap[cat.id] || { amount: 0, count: 0 };
      const totalVariance = planned.amount - actual.amount;
      const variancePercent = planned.amount > 0 ? (totalVariance / planned.amount) * 100 : 0;

      let qtyVariance: number | null = null;
      let rateVariance: number | null = null;
      if (planned.qty > 0 && planned.rate > 0 && actual.amount > 0) {
        const actualQty = actual.amount / planned.rate;
        qtyVariance = (planned.qty - actualQty) * planned.rate;
        rateVariance = totalVariance - qtyVariance;
      }

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryCode: cat.code,
        plannedQty: planned.qty || null,
        plannedRate: planned.rate ? Math.round(planned.rate * 100) / 100 : null,
        plannedAmount: Math.round(planned.amount * 100) / 100,
        actualAmount: Math.round(actual.amount * 100) / 100,
        transactionCount: actual.count,
        qtyVariance: qtyVariance !== null ? Math.round(qtyVariance * 100) / 100 : null,
        rateVariance: rateVariance !== null ? Math.round(rateVariance * 100) / 100 : null,
        totalVariance: Math.round(totalVariance * 100) / 100,
        variancePercent: Math.round(variancePercent * 100) / 100,
      };
    });

    const totalPlanned = categories.reduce((s, c) => s + c.plannedAmount, 0);
    const totalActual = categories.reduce((s, c) => s + c.actualAmount, 0);
    const orderValue = parseFloat(String(order.priceConfirmed)) * order.totalQuantity;

    res.json({
      orderId: order.id,
      orderNumber: order.orderId,
      styleName: order.styleName,
      customerName: order.customerName,
      totalQuantity: order.totalQuantity,
      deliveryDate: order.deliveryDate,
      orderStatus: order.orderStatus,
      currency: order.currency,
      createdAt: order.createdAt,
      categories,
      uncategorizedActual: Math.round(uncategorizedActual * 100) / 100,
      totalPlanned: Math.round(totalPlanned * 100) / 100,
      totalActual: Math.round((totalActual + uncategorizedActual) * 100) / 100,
      totalVariance: Math.round((totalPlanned - totalActual - uncategorizedActual) * 100) / 100,
      profitability: {
        orderValue: Math.round(orderValue * 100) / 100,
        totalCost: Math.round((totalActual + uncategorizedActual) * 100) / 100,
        grossProfit: Math.round((orderValue - totalActual - uncategorizedActual) * 100) / 100,
        grossMargin: orderValue > 0 ? Math.round(((orderValue - totalActual - uncategorizedActual) / orderValue) * 10000) / 100 : 0,
      },
    });
  } catch (error: any) {
    console.error('Job cost sheet error:', error);
    res.status(500).json({ message: error.message || 'Failed to get job cost sheet' });
  }
});

router.get('/:costCenterId/breakup', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const costCenterId = parseIntParam(req.params.costCenterId, "costCenterId");
    if (isNaN(costCenterId)) return res.status(400).json({ message: 'Invalid cost center ID' });

    const result = await db.execute(sql`
      SELECT 
        coa.id as account_id,
        coa.account_number,
        coa.name as account_name,
        COALESCE(SUM(CAST(vi.debit_amount AS numeric)), 0) as total_debit,
        COALESCE(SUM(CAST(vi.credit_amount AS numeric)), 0) as total_credit,
        COUNT(*) as transaction_count
      FROM voucher_items vi
      JOIN vouchers v ON vi.voucher_id = v.id
      JOIN chart_of_accounts coa ON vi.account_id = coa.id
      WHERE vi.cost_center_id = ${costCenterId}
        AND vi.tenant_id = ${tenantId}
        AND v.is_cancelled = false
      GROUP BY coa.id, coa.account_number, coa.name
      ORDER BY total_debit DESC
    `);

    res.json({
      costCenterId,
      breakup: (result.rows as any[]).map(row => ({
        accountId: row.account_id,
        accountNumber: row.account_number,
        accountName: row.account_name,
        totalDebit: parseFloat(row.total_debit) || 0,
        totalCredit: parseFloat(row.total_credit) || 0,
        netAmount: (parseFloat(row.total_debit) || 0) - (parseFloat(row.total_credit) || 0),
        transactionCount: parseInt(row.transaction_count) || 0,
      })),
    });
  } catch (error: any) {
    console.error('Cost center breakup error:', error);
    res.status(500).json({ message: error.message || 'Failed to get breakup' });
  }
});

export default router;