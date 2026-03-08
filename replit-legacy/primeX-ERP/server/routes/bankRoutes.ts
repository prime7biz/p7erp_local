import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { requireTenant } from '../utils/tenantScope';
import { safeErrorMessage } from '../utils/parseParams';
import {
  createBankAccount, getBankAccounts, getBankAccount, updateBankAccount,
  importBankStatement, autoMatchStatementLines, manualMatchLine,
  createReconciliation, completeReconciliation, getReconciliationStatus,
  getPaymentRuns, createPaymentRun, approvePaymentRun, processPaymentRun
} from '../services/bankReconciliationService';
import { db } from '../db';
import { chartOfAccounts, bankAccounts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();
router.use(isAuthenticated);

router.post('/accounts/link-from-coa', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const { ledgerId } = req.body;
    if (!ledgerId) {
      return res.status(400).json({ message: 'ledgerId is required' });
    }

    const [ledger] = await db.select().from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.id, ledgerId),
        eq(chartOfAccounts.tenantId, tenantId),
        eq(chartOfAccounts.isBankAccount, true)
      ));
    if (!ledger) {
      return res.status(404).json({ message: 'Bank ledger not found in Chart of Accounts' });
    }

    const existing = await db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.glAccountId, ledgerId), eq(bankAccounts.tenantId, tenantId)));
    if (existing.length > 0 && existing[0].isActive) {
      return res.status(409).json({ message: 'This ledger is already linked to a bank account' });
    }

    const details = (ledger.bankAccountDetails || {}) as Record<string, any>;
    if (existing.length > 0) {
      const [updated] = await db.update(bankAccounts)
        .set({
          accountName: ledger.name,
          bankName: details.bankName || ledger.name,
          accountNumber: details.accountNumber || null,
          branchName: details.branch || null,
          swiftCode: details.swiftCode || null,
          routingNumber: details.routingNumber || null,
          currency: ledger.accountCurrencyCode || "BDT",
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, existing[0].id))
        .returning();
      return res.json(updated);
    }

    const [account] = await db.insert(bankAccounts).values({
      tenantId,
      accountName: ledger.name,
      bankName: details.bankName || ledger.name,
      accountNumber: details.accountNumber || null,
      branchName: details.branch || null,
      swiftCode: details.swiftCode || null,
      routingNumber: details.routingNumber || null,
      currency: ledger.accountCurrencyCode || "BDT",
      glAccountId: ledger.id,
      isActive: true,
      openingBalance: ledger.openingBalance || "0",
      currentBalance: ledger.balance || "0",
    }).returning();
    res.status(201).json(account);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to link bank account from CoA') });
  }
});

router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const accounts = await getBankAccounts(tenantId);
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to get bank accounts') });
  }
});

router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const account = await createBankAccount(req.body, tenantId);
    res.status(201).json(account);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to create bank account') });
  }
});

router.get('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const account = await getBankAccount(Number(req.params.id), tenantId);
    if (!account) return res.status(404).json({ message: 'Bank account not found' });
    res.json(account);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to get bank account') });
  }
});

router.put('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const account = await updateBankAccount(Number(req.params.id), req.body, tenantId);
    if (!account) return res.status(404).json({ message: 'Bank account not found' });
    res.json(account);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to update bank account') });
  }
});

router.post('/accounts/:id/import', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const { lines, fileName } = req.body;
    if (!lines || !Array.isArray(lines)) {
      return res.status(400).json({ message: 'lines array is required' });
    }
    const result = await importBankStatement(Number(req.params.id), lines, tenantId, userId, fileName);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to import bank statement') });
  }
});

router.post('/statements/:id/auto-match', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const result = await autoMatchStatementLines(Number(req.params.id), tenantId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to auto-match statement lines') });
  }
});

router.post('/statement-lines/:id/match', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const { voucherId } = req.body;
    if (!voucherId) return res.status(400).json({ message: 'voucherId is required' });
    const result = await manualMatchLine(Number(req.params.id), voucherId, tenantId, userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to match statement line') });
  }
});

router.get('/accounts/:id/reconciliation', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const status = await getReconciliationStatus(Number(req.params.id), tenantId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to get reconciliation status') });
  }
});

router.post('/reconciliations', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const { bankAccountId, reconciliationDate, statementBalance, notes } = req.body;
    if (!bankAccountId || !reconciliationDate || !statementBalance) {
      return res.status(400).json({ message: 'bankAccountId, reconciliationDate, and statementBalance are required' });
    }
    const reconciliation = await createReconciliation(bankAccountId, reconciliationDate, statementBalance, tenantId, userId, notes);
    res.status(201).json(reconciliation);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to create reconciliation') });
  }
});

router.post('/reconciliations/:id/complete', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const result = await completeReconciliation(Number(req.params.id), tenantId, userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to complete reconciliation') });
  }
});

router.get('/payment-runs', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const runs = await getPaymentRuns(tenantId);
    res.json(runs);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to get payment runs') });
  }
});

router.post('/payment-runs', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const run = await createPaymentRun(req.body, tenantId);
    res.status(201).json(run);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to create payment run') });
  }
});

router.post('/payment-runs/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const result = await approvePaymentRun(Number(req.params.id), tenantId, userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to approve payment run') });
  }
});

router.post('/payment-runs/:id/process', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const result = await processPaymentRun(Number(req.params.id), tenantId, userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, 'Failed to process payment run') });
  }
});

export default router;
