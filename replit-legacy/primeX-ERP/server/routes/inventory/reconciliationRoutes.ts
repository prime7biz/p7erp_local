import { parseIntParam } from "../../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../../db';
import { stockLedger, tenantInventoryConfig, chartOfAccounts, vouchers, ledgerPostings } from '@shared/schema';
import { eq, and, sql, lte } from 'drizzle-orm';
import { getInventoryValuation, calculateCOGS, getPendingPostingCount, VALUATION_METHOD, CURRENCY } from '../../inventory/valuation/rules';
import { requirePermission } from '../../middleware/rbacMiddleware';

const router = express.Router();

const getTenantId = (req: Request): number => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new Error("Tenant ID not found");
  return tenantId;
};

router.get('/valuation', requirePermission("inventory:reports:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const asOf = (req.query.asOf as string) || new Date().toISOString().split('T')[0];
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;

    const valuation = await getInventoryValuation(tenantId, asOf, warehouseId);
    res.json(valuation);
  } catch (error: any) {
    console.error('Inventory valuation error:', error);
    res.status(500).json({ message: error.message || 'Failed to get inventory valuation' });
  }
});

router.get('/cogs', requirePermission("inventory:reports:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const start = req.query.start as string;
    const end = req.query.end as string;

    if (!start || !end) {
      return res.status(400).json({ message: 'start and end date parameters are required (YYYY-MM-DD)' });
    }

    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;

    const cogs = await calculateCOGS(tenantId, start, end, warehouseId);
    res.json({
      startDate: start,
      endDate: end,
      valuationMethod: VALUATION_METHOD,
      currency: CURRENCY,
      ...cogs,
    });
  } catch (error: any) {
    console.error('COGS calculation error:', error);
    res.status(500).json({ message: error.message || 'Failed to calculate COGS' });
  }
});

router.get('/reconciliation', requirePermission("accounting:reports:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const asOfDate = (req.query.asOf as string) || new Date().toISOString().split('T')[0];

    const [config] = await db.select()
      .from(tenantInventoryConfig)
      .where(eq(tenantInventoryConfig.tenantId, tenantId));

    if (!config || !config.inventoryAssetAccountId) {
      return res.status(400).json({
        message: 'Inventory asset account needs to be configured. Please set up the inventory asset account in tenant inventory configuration before running reconciliation.',
        code: 'INVENTORY_CONFIG_MISSING',
      });
    }

    const [account] = await db.select({
      id: chartOfAccounts.id,
      name: chartOfAccounts.name,
    })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.id, config.inventoryAssetAccountId));

    const [valuation, pendingPostingCount, accountingBalance] = await Promise.all([
      getInventoryValuation(tenantId, asOfDate, undefined, true),
      getPendingPostingCount(tenantId, asOfDate),
      db.select({
        totalDebit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
      }).from(ledgerPostings)
        .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
        .where(and(
          eq(ledgerPostings.tenantId, tenantId),
          eq(ledgerPostings.accountId, config.inventoryAssetAccountId),
          eq(vouchers.isPosted, true),
          lte(ledgerPostings.postingDate, asOfDate),
        )),
    ]);

    const ledgerBalance = parseFloat(accountingBalance[0]?.totalDebit || '0') - parseFloat(accountingBalance[0]?.totalCredit || '0');
    const inventoryValuationTotal = valuation.totalValue;
    const difference = Math.round((inventoryValuationTotal - ledgerBalance) * 100) / 100;

    res.json({
      asOfDate,
      inventoryValuationTotal,
      accountingInventoryLedgerBalance: Math.round(ledgerBalance * 100) / 100,
      difference,
      pendingPostingCount,
      isReconciled: difference === 0,
      valuationMethod: VALUATION_METHOD,
      currency: CURRENCY,
      inventoryAssetAccountId: config.inventoryAssetAccountId,
      inventoryAssetAccountName: account?.name || 'Unknown',
    });
  } catch (error: any) {
    console.error('Reconciliation error:', error);
    res.status(500).json({ message: error.message || 'Failed to run reconciliation' });
  }
});

router.get('/moves/:moveId/trace', requirePermission("inventory:reports:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const moveId = parseIntParam(req.params.moveId, "moveId");
    if (isNaN(moveId)) {
      return res.status(400).json({ message: 'Invalid move ID' });
    }

    const [entry] = await db.select({
      id: stockLedger.id,
      docType: stockLedger.docType,
      docId: stockLedger.docId,
      docNumber: stockLedger.docNumber,
      qtyIn: stockLedger.qtyIn,
      qtyOut: stockLedger.qtyOut,
      rate: stockLedger.rate,
      valuationRate: stockLedger.valuationRate,
      valueIn: stockLedger.valueIn,
      valueOut: stockLedger.valueOut,
      postingStatus: stockLedger.postingStatus,
      accountingVoucherId: stockLedger.accountingVoucherId,
      createdBy: stockLedger.createdBy,
      createdAt: stockLedger.createdAt,
    }).from(stockLedger)
      .where(and(
        eq(stockLedger.id, moveId),
        eq(stockLedger.tenantId, tenantId),
      ));

    if (!entry) {
      return res.status(404).json({ message: 'Stock ledger entry not found' });
    }

    let voucherInfo: { voucherId: number; voucherNo: string; status: string } | null = null;
    if (entry.accountingVoucherId) {
      const [v] = await db.select({
        id: vouchers.id,
        voucherNumber: vouchers.voucherNumber,
        workflowStatus: vouchers.workflowStatus,
        isPosted: vouchers.isPosted,
      }).from(vouchers)
        .where(eq(vouchers.id, entry.accountingVoucherId));

      if (v) {
        voucherInfo = {
          voucherId: v.id,
          voucherNo: v.voucherNumber,
          status: v.isPosted ? 'POSTED' : (v.workflowStatus || 'DRAFT'),
        };
      }
    }

    const qty = parseFloat(entry.qtyIn || '0') > 0 ? parseFloat(entry.qtyIn || '0') : parseFloat(entry.qtyOut || '0');
    const totalCost = parseFloat(entry.valueIn || '0') > 0 ? parseFloat(entry.valueIn || '0') : parseFloat(entry.valueOut || '0');
    const unitCost = qty > 0 ? totalCost / qty : 0;

    res.json({
      moveId: entry.id,
      source: {
        type: entry.docType,
        id: entry.docId,
        refNo: entry.docNumber,
      },
      valuation: {
        qty: Math.round(qty * 10000) / 10000,
        unitCost: Math.round(unitCost * 10000) / 10000,
        totalCost: Math.round(totalCost * 100) / 100,
        method: VALUATION_METHOD,
      },
      voucher: voucherInfo,
      postingStatus: entry.postingStatus,
      createdBy: entry.createdBy,
      createdAt: entry.createdAt,
    });
  } catch (error: any) {
    console.error('Move trace error:', error);
    res.status(500).json({ message: error.message || 'Failed to trace stock move' });
  }
});

export default router;
