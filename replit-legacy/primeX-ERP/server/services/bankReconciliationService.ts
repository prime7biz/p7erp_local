import { db } from '../db';
import {
  bankAccounts, bankStatements, bankStatementLines,
  bankReconciliations, paymentRuns, paymentRunLines, vouchers, voucherItems,
  auditLogs
} from '@shared/schema';
import { eq, and, sql, desc, between } from 'drizzle-orm';

export async function createBankAccount(data: any, tenantId: number) {
  const [account] = await db.insert(bankAccounts).values({
    ...data,
    tenantId,
  }).returning();
  return account;
}

export async function getBankAccounts(tenantId: number) {
  return db.select().from(bankAccounts)
    .where(eq(bankAccounts.tenantId, tenantId))
    .orderBy(bankAccounts.accountName);
}

export async function getBankAccount(id: number, tenantId: number) {
  const [account] = await db.select().from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, tenantId)));
  return account || null;
}

export async function updateBankAccount(id: number, data: any, tenantId: number) {
  const [updated] = await db.update(bankAccounts)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, tenantId)))
    .returning();
  return updated || null;
}

export async function importBankStatement(
  bankAccountId: number,
  lines: Array<{
    transactionDate: string;
    valueDate?: string;
    description?: string;
    reference?: string;
    debitAmount?: string;
    creditAmount?: string;
    balance?: string;
  }>,
  tenantId: number,
  userId: number,
  fileName?: string
) {
  const account = await getBankAccount(bankAccountId, tenantId);
  if (!account) throw new Error('Bank account not found');

  return await db.transaction(async (tx) => {
    const statementDate = lines.length > 0 ? lines[lines.length - 1].transactionDate : new Date().toISOString().split('T')[0];

    const [statement] = await tx.insert(bankStatements).values({
      tenantId,
      bankAccountId,
      statementDate,
      fileName: fileName || null,
      importedBy: userId,
      totalEntries: lines.length,
      unmatchedEntries: lines.length,
      matchedEntries: 0,
      status: 'IMPORTED',
    }).returning();

    const insertedLines = [];
    for (const line of lines) {
      const [inserted] = await tx.insert(bankStatementLines).values({
        tenantId,
        statementId: statement.id,
        transactionDate: line.transactionDate,
        valueDate: line.valueDate || null,
        description: line.description || null,
        reference: line.reference || null,
        debitAmount: line.debitAmount || '0',
        creditAmount: line.creditAmount || '0',
        balance: line.balance || null,
        matchStatus: 'UNMATCHED',
      }).returning();
      insertedLines.push(inserted);
    }

    return { statement, lines: insertedLines };
  });
}

export async function autoMatchStatementLines(statementId: number, tenantId: number) {
  const lines = await db.select().from(bankStatementLines)
    .where(and(
      eq(bankStatementLines.statementId, statementId),
      eq(bankStatementLines.tenantId, tenantId),
      eq(bankStatementLines.matchStatus, 'UNMATCHED')
    ));

  let matchedCount = 0;

  for (const line of lines) {
    const lineAmount = parseFloat(line.debitAmount || '0') + parseFloat(line.creditAmount || '0');
    if (lineAmount === 0) continue;

    const isDebit = parseFloat(line.debitAmount || '0') > 0;
    const amount = isDebit ? line.debitAmount : line.creditAmount;

    const matchingVouchers = await db.select({
      id: vouchers.id,
      voucherNumber: vouchers.voucherNumber,
      voucherDate: vouchers.voucherDate,
      amount: vouchers.amount,
      description: vouchers.description,
    }).from(vouchers)
      .where(and(
        eq(vouchers.tenantId, tenantId),
        eq(vouchers.isPosted, true),
        sql`ABS(CAST(${vouchers.amount} AS numeric) - CAST(${amount} AS numeric)) < 0.01`
      ))
      .limit(5);

    if (matchingVouchers.length === 1) {
      let confidence = 50;

      const voucherDate = matchingVouchers[0].voucherDate;
      const txDate = line.transactionDate;
      if (voucherDate && txDate) {
        const daysDiff = Math.abs(
          (new Date(voucherDate).getTime() - new Date(txDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff <= 1) confidence += 30;
        else if (daysDiff <= 3) confidence += 20;
        else if (daysDiff <= 7) confidence += 10;
      }

      if (line.reference && matchingVouchers[0].voucherNumber) {
        const ref = line.reference.toLowerCase();
        const vNum = matchingVouchers[0].voucherNumber.toLowerCase();
        if (ref.includes(vNum) || vNum.includes(ref)) {
          confidence += 20;
        }
      }

      if (confidence >= 70) {
        await db.update(bankStatementLines)
          .set({
            matchStatus: 'AUTO_MATCHED',
            matchedVoucherId: matchingVouchers[0].id,
            matchedAt: new Date(),
            matchConfidence: String(confidence),
          })
          .where(eq(bankStatementLines.id, line.id));
        matchedCount++;
      }
    }
  }

  await db.update(bankStatements)
    .set({
      status: 'MATCHING',
      matchedEntries: sql`(SELECT COUNT(*) FROM bank_statement_lines WHERE statement_id = ${statementId} AND match_status IN ('AUTO_MATCHED', 'MANUALLY_MATCHED'))`,
      unmatchedEntries: sql`(SELECT COUNT(*) FROM bank_statement_lines WHERE statement_id = ${statementId} AND match_status = 'UNMATCHED')`,
    })
    .where(and(eq(bankStatements.id, statementId), eq(bankStatements.tenantId, tenantId)));

  return { matchedCount, totalLines: lines.length };
}

export async function manualMatchLine(lineId: number, voucherId: number, tenantId: number, userId: number) {
  const [line] = await db.select().from(bankStatementLines)
    .where(and(eq(bankStatementLines.id, lineId), eq(bankStatementLines.tenantId, tenantId)));
  if (!line) throw new Error('Statement line not found');

  if (line.matchStatus === 'RECONCILED') {
    throw new Error('Cannot modify a reconciled statement line. This line has been locked by a completed bank reconciliation.');
  }

  const [voucher] = await db.select().from(vouchers)
    .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)));
  if (!voucher) throw new Error('Voucher not found');

  const [updated] = await db.update(bankStatementLines)
    .set({
      matchStatus: 'MANUALLY_MATCHED',
      matchedVoucherId: voucherId,
      matchedAt: new Date(),
      matchedBy: userId,
      matchConfidence: '100',
    })
    .where(eq(bankStatementLines.id, lineId))
    .returning();

  await db.update(bankStatements)
    .set({
      matchedEntries: sql`(SELECT COUNT(*) FROM bank_statement_lines WHERE statement_id = ${line.statementId} AND match_status IN ('AUTO_MATCHED', 'MANUALLY_MATCHED'))`,
      unmatchedEntries: sql`(SELECT COUNT(*) FROM bank_statement_lines WHERE statement_id = ${line.statementId} AND match_status = 'UNMATCHED')`,
    })
    .where(eq(bankStatements.id, line.statementId));

  return updated;
}

export async function createReconciliation(
  bankAccountId: number,
  reconciliationDate: string,
  statementBalance: string,
  tenantId: number,
  userId: number,
  notes?: string
) {
  const account = await getBankAccount(bankAccountId, tenantId);
  if (!account) throw new Error('Bank account not found');

  const bookBalance = account.currentBalance || '0';

  const [reconciliation] = await db.insert(bankReconciliations).values({
    tenantId,
    bankAccountId,
    reconciliationDate,
    statementBalance,
    bookBalance,
    status: 'DRAFT',
    reconciledBy: userId,
    notes: notes || null,
  }).returning();

  return reconciliation;
}

export async function completeReconciliation(reconciliationId: number, tenantId: number, userId: number) {
  const [reconciliation] = await db.select().from(bankReconciliations)
    .where(and(eq(bankReconciliations.id, reconciliationId), eq(bankReconciliations.tenantId, tenantId)));

  if (!reconciliation) throw new Error('Reconciliation not found');
  if (reconciliation.status === 'COMPLETED') throw new Error('Reconciliation is already completed');

  return await db.transaction(async (tx) => {
    const [updated] = await tx.update(bankReconciliations)
      .set({
        status: 'COMPLETED',
        reconciledAt: new Date(),
        reconciledBy: userId,
        adjustedBalance: reconciliation.statementBalance,
      })
      .where(eq(bankReconciliations.id, reconciliationId))
      .returning();

    await tx.update(bankAccounts)
      .set({
        lastReconciledDate: reconciliation.reconciliationDate,
        lastReconciledBalance: reconciliation.statementBalance,
        currentBalance: reconciliation.statementBalance,
        updatedAt: new Date(),
      })
      .where(and(eq(bankAccounts.id, reconciliation.bankAccountId), eq(bankAccounts.tenantId, tenantId)));

    const statements = await tx.select({ id: bankStatements.id }).from(bankStatements)
      .where(and(eq(bankStatements.bankAccountId, reconciliation.bankAccountId), eq(bankStatements.tenantId, tenantId)));

    if (statements.length > 0) {
      const statementIds = statements.map(s => s.id);
      for (const stmtId of statementIds) {
        await tx.update(bankStatementLines)
          .set({ matchStatus: sql`CASE WHEN ${bankStatementLines.matchStatus} IN ('AUTO_MATCHED', 'MANUALLY_MATCHED') THEN 'RECONCILED' ELSE ${bankStatementLines.matchStatus} END` })
          .where(and(
            eq(bankStatementLines.statementId, stmtId),
            eq(bankStatementLines.tenantId, tenantId)
          ));
      }
    }

    await tx.insert(auditLogs).values({
      tenantId,
      entityType: 'bank_reconciliation',
      entityId: reconciliationId,
      action: 'COMPLETE',
      performedBy: userId,
      newValues: { status: 'COMPLETED', bankAccountId: reconciliation.bankAccountId, statementBalance: reconciliation.statementBalance },
    });

    return updated;
  });
}

export async function getReconciliationStatus(bankAccountId: number, tenantId: number) {
  const account = await getBankAccount(bankAccountId, tenantId);
  if (!account) throw new Error('Bank account not found');

  const latestReconciliation = await db.select().from(bankReconciliations)
    .where(and(eq(bankReconciliations.bankAccountId, bankAccountId), eq(bankReconciliations.tenantId, tenantId)))
    .orderBy(desc(bankReconciliations.reconciliationDate))
    .limit(1);

  const statements = await db.select().from(bankStatements)
    .where(and(eq(bankStatements.bankAccountId, bankAccountId), eq(bankStatements.tenantId, tenantId)))
    .orderBy(desc(bankStatements.statementDate))
    .limit(5);

  let totalUnmatched = 0;
  let totalMatched = 0;
  for (const stmt of statements) {
    totalUnmatched += stmt.unmatchedEntries || 0;
    totalMatched += stmt.matchedEntries || 0;
  }

  return {
    account,
    lastReconciliation: latestReconciliation[0] || null,
    recentStatements: statements,
    summary: {
      totalMatched,
      totalUnmatched,
      bookBalance: account.currentBalance || '0',
      lastReconciledDate: account.lastReconciledDate,
      lastReconciledBalance: account.lastReconciledBalance,
    },
  };
}

export async function getPaymentRuns(tenantId: number) {
  return db.select().from(paymentRuns)
    .where(eq(paymentRuns.tenantId, tenantId))
    .orderBy(desc(paymentRuns.createdAt));
}

export async function createPaymentRun(data: any, tenantId: number) {
  const [run] = await db.insert(paymentRuns).values({
    ...data,
    tenantId,
  }).returning();
  return run;
}

export async function approvePaymentRun(runId: number, tenantId: number, userId: number) {
  const [run] = await db.select().from(paymentRuns)
    .where(and(eq(paymentRuns.id, runId), eq(paymentRuns.tenantId, tenantId)));
  if (!run) throw new Error('Payment run not found');
  if (run.status !== 'DRAFT') throw new Error('Payment run must be in DRAFT status to approve');

  const [updated] = await db.update(paymentRuns)
    .set({ status: 'APPROVED', approvedBy: userId, approvedAt: new Date() })
    .where(eq(paymentRuns.id, runId))
    .returning();
  return updated;
}

export async function processPaymentRun(runId: number, tenantId: number, userId: number) {
  const [run] = await db.select().from(paymentRuns)
    .where(and(eq(paymentRuns.id, runId), eq(paymentRuns.tenantId, tenantId)));
  if (!run) throw new Error('Payment run not found');
  if (run.status !== 'APPROVED') throw new Error('Payment run must be APPROVED before processing');

  return await db.transaction(async (tx) => {
    const lines = await tx.select().from(paymentRunLines)
      .where(and(eq(paymentRunLines.paymentRunId, runId), eq(paymentRunLines.tenantId, tenantId)));

    for (const line of lines) {
      await tx.update(paymentRunLines)
        .set({ status: 'PROCESSED' })
        .where(eq(paymentRunLines.id, line.id));
    }

    const [updated] = await tx.update(paymentRuns)
      .set({ status: 'COMPLETED', processedBy: userId, processedAt: new Date() })
      .where(eq(paymentRuns.id, runId))
      .returning();
    return updated;
  });
}
