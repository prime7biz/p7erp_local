import express, { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { storage } from '../storage';
import { chartOfAccountsStorage } from '../database/accounting/chartOfAccountsStorage';
import {
  getSupplierLedgerInsights,
  getPurchaseOrderInsights,
  getGRNInsights,
  getItemInsights,
  getWarehouseInsights,
  getInventoryDashboardInsights,
  getAccountingInsights,
  getCOAAnalysisInsights,
  getLedgerInsights
} from '../services/erpAIService';
import { db } from '../db';
import { chartOfAccounts, accountGroups } from '@shared/schema';
import { eq, and, sql, desc, asc, count } from 'drizzle-orm';

const router = express.Router();

router.post('/supplier-ledger', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { name, groupName, openingBalance } = req.body;

    const existingSuppliers: string[] = [];
    try {
      const suppliers = await chartOfAccountsStorage.getMaterialSuppliers(tenantId);
      if (suppliers && Array.isArray(suppliers)) {
        existingSuppliers.push(...suppliers.map((s: any) => s.accountName || s.name || '').filter(Boolean));
      }
    } catch (e) {
      console.log('Could not fetch existing suppliers:', e);
    }

    const insights = await getSupplierLedgerInsights({
      name: name || '',
      groupName: groupName || '',
      openingBalance: openingBalance || '0',
      existingSuppliers
    });

    return res.json({ insights });
  } catch (error: any) {
    console.error('Supplier ledger insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get supplier ledger insights' });
  }
});

router.post('/purchase-order', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { items, supplierId, totalAmount } = req.body;

    let supplier = null;
    let existingPOs: any[] = [];
    let inventoryLevels: any[] = [];

    try {
      if (supplierId) {
        const suppliers = await chartOfAccountsStorage.getMaterialSuppliers(tenantId);
        supplier = suppliers?.find((s: any) => s.id === supplierId) || null;
      }
    } catch (e) {
      console.log('Could not fetch supplier:', e);
    }

    try {
      const allItems = await storage.getAllItems(tenantId);
      if (allItems && Array.isArray(allItems)) {
        inventoryLevels = allItems.map((item: any) => ({
          name: item.name,
          currentStock: item.currentStock || item.quantity || 0,
          reorderLevel: item.reorderLevel || 0
        }));
      }
    } catch (e) {
      console.log('Could not fetch inventory levels:', e);
    }

    const insights = await getPurchaseOrderInsights({
      items: items || [],
      supplier,
      totalAmount: totalAmount || 0,
      existingPOs,
      inventoryLevels
    });

    return res.json({ insights });
  } catch (error: any) {
    console.error('Purchase order insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get purchase order insights' });
  }
});

router.post('/grn', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { items, supplierId, purchaseOrderId } = req.body;

    let supplier = null;
    let purchaseOrder = null;
    const priceHistory: any[] = [];

    try {
      if (supplierId) {
        const suppliers = await chartOfAccountsStorage.getMaterialSuppliers(tenantId);
        supplier = suppliers?.find((s: any) => s.id === supplierId) || null;
      }
    } catch (e) {
      console.log('Could not fetch supplier for GRN:', e);
    }

    const insights = await getGRNInsights({
      items: items || [],
      supplier,
      purchaseOrder,
      priceHistory
    });

    return res.json({ insights });
  } catch (error: any) {
    console.error('GRN insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get GRN insights' });
  }
});

router.post('/item', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { itemId, name, category } = req.body;

    let itemData = {
      name: name || 'Unknown Item',
      category: category || 'General',
      currentStock: 0,
      reorderLevel: 0,
      avgConsumption: 0,
      priceHistory: [] as any[]
    };

    if (itemId) {
      try {
        const item = await storage.getItemById(itemId, tenantId);
        if (item) {
          itemData = {
            name: item.name || name || 'Unknown Item',
            category: (item as any).category || category || 'General',
            currentStock: (item as any).currentStock || (item as any).quantity || 0,
            reorderLevel: (item as any).reorderLevel || 0,
            avgConsumption: (item as any).avgConsumption || 0,
            priceHistory: []
          };
        }
      } catch (e) {
        console.log('Could not fetch item details:', e);
      }
    }

    const insights = await getItemInsights(itemData);
    return res.json({ insights });
  } catch (error: any) {
    console.error('Item insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get item insights' });
  }
});

router.post('/warehouse', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { warehouseId } = req.body;

    let warehouse = null;
    let items: any[] = [];
    let capacity = null;

    if (warehouseId) {
      try {
        const warehouses = await storage.getAllWarehouses(tenantId);
        warehouse = warehouses?.find((w: any) => w.id === warehouseId) || null;
      } catch (e) {
        console.log('Could not fetch warehouse:', e);
      }
    }

    try {
      const allItems = await storage.getAllItems(tenantId);
      if (allItems && Array.isArray(allItems)) {
        items = allItems.slice(0, 50).map((item: any) => ({
          name: item.name,
          currentStock: item.currentStock || item.quantity || 0,
          category: (item as any).category || 'General'
        }));
      }
    } catch (e) {
      console.log('Could not fetch items for warehouse:', e);
    }

    const insights = await getWarehouseInsights({ warehouse, items, capacity });
    return res.json({ insights });
  } catch (error: any) {
    console.error('Warehouse insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get warehouse insights' });
  }
});

router.post('/inventory-dashboard', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    let items: any[] = [];
    let lowStockItems: any[] = [];
    let deadStock: any[] = [];
    let recentMovements: any[] = [];

    try {
      const allItems = await storage.getAllItems(tenantId);
      if (allItems && Array.isArray(allItems)) {
        items = allItems;
        lowStockItems = allItems.filter((item: any) => {
          const stock = item.currentStock || item.quantity || 0;
          const reorder = item.reorderLevel || 0;
          return reorder > 0 && stock <= reorder;
        });
        deadStock = allItems.filter((item: any) => {
          const stock = item.currentStock || item.quantity || 0;
          return stock === 0;
        });
      }
    } catch (e) {
      console.log('Could not fetch items for dashboard:', e);
    }

    const insights = await getInventoryDashboardInsights({
      items,
      lowStockItems,
      deadStock,
      recentMovements
    });

    return res.json({ insights });
  } catch (error: any) {
    console.error('Inventory dashboard insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get inventory dashboard insights' });
  }
});

router.post('/accounting', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    let recentVouchers: any[] = [];
    let pendingPayables: any[] = [];
    let trialBalance: any = null;

    const insights = await getAccountingInsights({
      recentVouchers,
      pendingPayables,
      trialBalance
    });

    return res.json({ insights });
  } catch (error: any) {
    console.error('Accounting insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get accounting insights' });
  }
});

router.post('/coa-analysis', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const allGroups = await db.select().from(accountGroups).where(eq(accountGroups.tenantId, tenantId));
    const topGroups = allGroups.filter(g => !g.parentGroupId);

    const allLedgers = await db.select({
      id: chartOfAccounts.id,
      name: chartOfAccounts.name,
      openingBalance: chartOfAccounts.openingBalance,
      groupId: chartOfAccounts.groupId,
      normalBalance: chartOfAccounts.normalBalance,
    }).from(chartOfAccounts).where(eq(chartOfAccounts.tenantId, tenantId));

    const groupMap = new Map<number, typeof allGroups[0]>();
    for (const g of allGroups) groupMap.set(g.id, g);

    const getTopGroupForLedger = (groupId: number): typeof allGroups[0] | null => {
      let g = groupMap.get(groupId);
      while (g && g.parentGroupId) g = groupMap.get(g.parentGroupId);
      return g || null;
    };

    const groupSummary = topGroups.map(tg => {
      const ledgersInGroup = allLedgers.filter(l => {
        const top = getTopGroupForLedger(l.groupId!);
        return top?.id === tg.id;
      });
      let totalDr = 0, totalCr = 0;
      for (const l of ledgersInGroup) {
        const bal = parseFloat(l.openingBalance || '0');
        if (bal > 0) totalDr += bal;
        else if (bal < 0) totalCr += Math.abs(bal);
      }
      return { name: tg.name, nature: tg.nature, ledgerCount: ledgersInGroup.length, totalDr, totalCr };
    });

    let totalAssets = 0, totalLiabilities = 0, totalEquity = 0, totalIncome = 0, totalExpenses = 0;
    for (const gs of groupSummary) {
      const net = gs.totalDr - gs.totalCr;
      if (gs.nature === 'Asset') totalAssets += net;
      else if (gs.nature === 'Liability') totalLiabilities += gs.totalCr - gs.totalDr;
      else if (gs.nature === 'Equity') totalEquity += gs.totalCr - gs.totalDr;
      else if (gs.nature === 'Income') totalIncome += gs.totalCr;
      else if (gs.nature === 'Expense') totalExpenses += gs.totalDr;
    }

    const topDebit = allLedgers
      .filter(l => parseFloat(l.openingBalance || '0') > 0)
      .sort((a, b) => parseFloat(b.openingBalance || '0') - parseFloat(a.openingBalance || '0'))
      .slice(0, 10)
      .map(l => ({
        name: l.name,
        balance: parseFloat(l.openingBalance || '0'),
        group: groupMap.get(l.groupId!)?.name || 'Unknown',
      }));

    const topCredit = allLedgers
      .filter(l => parseFloat(l.openingBalance || '0') < 0)
      .sort((a, b) => parseFloat(a.openingBalance || '0') - parseFloat(b.openingBalance || '0'))
      .slice(0, 10)
      .map(l => ({
        name: l.name,
        balance: Math.abs(parseFloat(l.openingBalance || '0')),
        group: groupMap.get(l.groupId!)?.name || 'Unknown',
      }));

    const insights = await getCOAAnalysisInsights({
      totalGroups: allGroups.length,
      totalLedgers: allLedgers.length,
      groupSummary,
      topDebitAccounts: topDebit,
      topCreditAccounts: topCredit,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalIncome,
      totalExpenses,
    });

    return res.json({
      insights,
      summary: {
        totalGroups: allGroups.length,
        totalLedgers: allLedgers.length,
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalIncome,
        totalExpenses,
        groupSummary,
      },
    });
  } catch (error: any) {
    console.error('COA analysis insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get COA analysis insights' });
  }
});

router.post('/ledger-insight', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ message: 'accountId is required' });
    }

    const [ledger] = await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.tenantId, tenantId)));
    if (!ledger) return res.status(404).json({ message: 'Account not found' });

    const group = ledger.groupId ? await db.select().from(accountGroups).where(and(eq(accountGroups.id, ledger.groupId), eq(accountGroups.tenantId, tenantId))) : [];
    const groupInfo = group[0] || null;

    const insights = await getLedgerInsights({
      ledgerName: ledger.name,
      groupName: groupInfo?.name || 'Unknown',
      nature: groupInfo?.nature || 'Asset',
      openingBalance: parseFloat(ledger.openingBalance || '0'),
      normalBalance: ledger.normalBalance || 'debit',
      isBankAccount: ledger.isBankAccount || false,
      isCashAccount: ledger.isCashAccount || false,
      isMaterialSupplier: ledger.isMaterialSupplier || false,
    });

    return res.json({ insights, ledger: { id: ledger.id, name: ledger.name, openingBalance: ledger.openingBalance, groupName: groupInfo?.name } });
  } catch (error: any) {
    console.error('Ledger insight error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get ledger insights' });
  }
});

router.post('/trial-balance', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { totalDebit, totalCredit, isBalanced, groupSummary, accountCount } = req.body;
    const { getTrialBalanceInsights } = await import('../services/erpAIService');
    const insights = await getTrialBalanceInsights({ totalDebit, totalCredit, isBalanced, groupSummary, accountCount });
    return res.json({ insights });
  } catch (error: any) {
    console.error('Trial balance insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get trial balance insights' });
  }
});

router.post('/financial-statement', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const { getFinancialStatementInsights } = await import('../services/erpAIService');
    const insights = await getFinancialStatementInsights(data);
    return res.json({ insights });
  } catch (error: any) {
    console.error('Financial statement insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get financial statement insights' });
  }
});

router.post('/voucher-entry', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const { getVoucherEntryInsights } = await import('../services/erpAIService');
    const insights = await getVoucherEntryInsights(data);
    return res.json({ insights });
  } catch (error: any) {
    console.error('Voucher entry insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get voucher entry insights' });
  }
});

router.post('/exchange-rate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { fromCurrency, toCurrency, date } = req.body;
    if (!fromCurrency || !toCurrency) {
      return res.status(400).json({ message: 'fromCurrency and toCurrency are required' });
    }
    const { getAIExchangeRateSuggestion } = await import('../services/erpAIService');
    const suggestion = await getAIExchangeRateSuggestion({
      fromCurrency,
      toCurrency: toCurrency || 'BDT',
      date: date || new Date().toISOString().split('T')[0],
    });
    return res.json(suggestion);
  } catch (error: any) {
    console.error('Exchange rate suggestion error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get exchange rate suggestion' });
  }
});

export default router;
