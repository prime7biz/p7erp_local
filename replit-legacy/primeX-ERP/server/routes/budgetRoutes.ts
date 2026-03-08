import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { db } from '../db';
import { budgets, budgetItems, chartOfAccounts, accountGroups, fiscalYears, vouchers, voucherItems } from '@shared/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';

const router = express.Router();

router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const allBudgets = await db.select().from(budgets).where(eq(budgets.tenantId, tenantId)).orderBy(desc(budgets.createdAt));
    res.json(allBudgets);
  } catch (error: any) {
    console.error('List budgets error:', error);
    return res.status(500).json({ message: error.message || 'Failed to list budgets' });
  }
});

router.get('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const budgetId = parseIntParam(req.params.id, "id");
    const [budget] = await db.select().from(budgets).where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, tenantId)));
    if (!budget) return res.status(404).json({ message: 'Budget not found' });

    const items = await db.select({
      budgetItem: budgetItems,
      accountName: chartOfAccounts.name,
      accountNumber: chartOfAccounts.accountNumber,
      groupName: accountGroups.name,
    }).from(budgetItems)
      .leftJoin(chartOfAccounts, eq(budgetItems.accountId, chartOfAccounts.id))
      .leftJoin(accountGroups, eq(budgetItems.groupId, accountGroups.id))
      .where(eq(budgetItems.budgetId, budgetId));

    res.json({ budget, items });
  } catch (error: any) {
    console.error('Get budget error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get budget' });
  }
});

router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { name, description, fiscalYearId, budgetType } = req.body;
    const [newBudget] = await db.insert(budgets).values({
      tenantId, name, description, fiscalYearId, budgetType: budgetType || 'annual', status: 'draft'
    }).returning();
    res.json(newBudget);
  } catch (error: any) {
    console.error('Create budget error:', error);
    return res.status(500).json({ message: error.message || 'Failed to create budget' });
  }
});

router.post('/:id/items', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const budgetId = parseIntParam(req.params.id, "id");
    const { items } = req.body;

    const [budget] = await db.select().from(budgets).where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, tenantId)));
    if (!budget) return res.status(404).json({ message: 'Budget not found' });

    await db.delete(budgetItems).where(and(eq(budgetItems.budgetId, budgetId), eq(budgetItems.tenantId, tenantId)));

    if (items && items.length > 0) {
      const insertItems = items.map((item: any) => ({
        budgetId,
        accountId: item.accountId,
        groupId: item.groupId || null,
        month1: item.month1 || '0',
        month2: item.month2 || '0',
        month3: item.month3 || '0',
        month4: item.month4 || '0',
        month5: item.month5 || '0',
        month6: item.month6 || '0',
        month7: item.month7 || '0',
        month8: item.month8 || '0',
        month9: item.month9 || '0',
        month10: item.month10 || '0',
        month11: item.month11 || '0',
        month12: item.month12 || '0',
        annualTotal: item.annualTotal || '0',
        tenantId,
      }));
      await db.insert(budgetItems).values(insertItems);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Save budget items error:', error);
    return res.status(500).json({ message: error.message || 'Failed to save budget items' });
  }
});

router.put('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const budgetId = parseIntParam(req.params.id, "id");
    const { name, description, status } = req.body;
    const [updated] = await db.update(budgets)
      .set({ name, description, status, updatedAt: new Date() })
      .where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, tenantId)))
      .returning();
    res.json(updated);
  } catch (error: any) {
    console.error('Update budget error:', error);
    return res.status(500).json({ message: error.message || 'Failed to update budget' });
  }
});

router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const budgetId = parseIntParam(req.params.id, "id");
    await db.delete(budgets).where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, tenantId)));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete budget error:', error);
    return res.status(500).json({ message: error.message || 'Failed to delete budget' });
  }
});

router.get('/:id/vs-actual', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const budgetId = parseIntParam(req.params.id, "id");

    const [budget] = await db.select().from(budgets).where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, tenantId)));
    if (!budget) return res.status(404).json({ message: 'Budget not found' });

    const items = await db.select({
      budgetItem: budgetItems,
      accountName: chartOfAccounts.name,
      accountNumber: chartOfAccounts.accountNumber,
    }).from(budgetItems)
      .leftJoin(chartOfAccounts, eq(budgetItems.accountId, chartOfAccounts.id))
      .where(eq(budgetItems.budgetId, budgetId));

    const [fy] = await db.select().from(fiscalYears).where(eq(fiscalYears.id, budget.fiscalYearId));
    const fyStart = fy ? new Date(fy.startDate) : new Date(new Date().getFullYear(), 0, 1);
    const fyEnd = fy ? new Date(fy.endDate) : new Date(new Date().getFullYear(), 11, 31);

    const accountIds = items.map(i => i.budgetItem.accountId);

    let actualsByAccount: Record<number, { total: number; monthly: number[] }> = {};
    if (accountIds.length > 0) {
      const actuals = await db.execute(sql`
        SELECT 
          vi.account_id,
          EXTRACT(MONTH FROM v.voucher_date::date) as month_num,
          COALESCE(SUM(CAST(vi.debit_amount AS numeric)), 0) as total_debit,
          COALESCE(SUM(CAST(vi.credit_amount AS numeric)), 0) as total_credit
        FROM voucher_items vi
        JOIN vouchers v ON vi.voucher_id = v.id
        WHERE vi.tenant_id = ${tenantId}
          AND vi.account_id = ANY(${accountIds})
          AND v.voucher_date >= ${fyStart.toISOString().split('T')[0]}
          AND v.voucher_date <= ${fyEnd.toISOString().split('T')[0]}
          AND v.is_cancelled = false
        GROUP BY vi.account_id, EXTRACT(MONTH FROM v.voucher_date::date)
      `);

      for (const row of actuals.rows as any[]) {
        const accId = row.account_id;
        if (!actualsByAccount[accId]) {
          actualsByAccount[accId] = { total: 0, monthly: new Array(12).fill(0) };
        }
        const monthIdx = parseInt(row.month_num) - 1;
        const net = parseFloat(row.total_debit) - parseFloat(row.total_credit);
        const absNet = Math.abs(net);
        actualsByAccount[accId].monthly[monthIdx] = absNet;
        actualsByAccount[accId].total += absNet;
      }
    }

    const comparison = items.map(item => {
      const budgetTotal = parseFloat(item.budgetItem.annualTotal || '0');
      const actual = actualsByAccount[item.budgetItem.accountId] || { total: 0, monthly: new Array(12).fill(0) };
      const variance = budgetTotal - actual.total;
      const variancePercent = budgetTotal !== 0 ? (variance / budgetTotal) * 100 : (actual.total === 0 ? 0 : -100);
      return {
        accountId: item.budgetItem.accountId,
        accountName: item.accountName,
        accountNumber: item.accountNumber,
        budgetTotal,
        actualTotal: actual.total,
        variance,
        variancePercent,
        months: Array.from({length: 12}, (_, i) => ({
          budget: parseFloat((item.budgetItem as any)[`month${i+1}`] || '0'),
          actual: actual.monthly[i],
        }))
      };
    });

    res.json({ budget, comparison });
  } catch (error: any) {
    console.error('Budget vs actual error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get budget vs actual comparison' });
  }
});

export default router;
