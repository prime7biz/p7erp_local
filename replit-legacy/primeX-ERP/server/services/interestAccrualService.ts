import { db } from '../db';
import {
  chartOfAccounts, accountGroups, vouchers, voucherItems,
  voucherTypes, voucherStatus, fiscalYears, ledgerPostings,
  auditLogs, tenants, users
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { SequentialIdGenerator } from '../utils/sequentialIdGenerator';

async function getSystemUserId(tenantId: number, tx: any): Promise<number> {
  const [systemUser] = await tx.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.tenantId, tenantId),
      eq(users.isActive, true)
    ))
    .limit(1);
  if (!systemUser) {
    throw new Error(`No active user found for tenant ${tenantId} to post interest accruals`);
  }
  return systemUser.id;
}

interface InterestLedger {
  id: number;
  tenantId: number;
  name: string;
  accountNumber: string;
  balance: string;
  yearlyInterestRate: string;
  interestPostingFrequency: string;
  lastInterestPostedDate: Date | null;
  groupNature: string;
}

function getPeriodsPerYear(frequency: string): number {
  switch (frequency) {
    case 'monthly': return 12;
    case 'yearly': return 1;
    case 'quarterly':
    default: return 4;
  }
}

function isDueForPosting(lastPosted: Date | null, frequency: string, now: Date): boolean {
  if (!lastPosted) return true;

  const periodsPerYear = getPeriodsPerYear(frequency);
  const intervalMs = (365.25 / periodsPerYear) * 24 * 60 * 60 * 1000;
  const nextDue = new Date(lastPosted.getTime() + intervalMs);
  return now >= nextDue;
}

async function findOrCreateSystemAccount(
  tenantId: number,
  accountName: string,
  nature: 'Income' | 'Expense',
  tx: any
): Promise<number> {
  const existing = await tx.select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(and(
      eq(chartOfAccounts.tenantId, tenantId),
      eq(chartOfAccounts.name, accountName),
      eq(chartOfAccounts.isActive, true)
    ))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const natureCode = nature === 'Income' ? 'REV' : 'EXP';
  const groups = await tx.select({ id: accountGroups.id })
    .from(accountGroups)
    .where(and(
      eq(accountGroups.tenantId, tenantId),
      eq(accountGroups.nature, nature),
      eq(accountGroups.isActive, true)
    ))
    .limit(1);

  if (groups.length === 0) {
    throw new Error(`No ${nature} group found for tenant ${tenantId}`);
  }

  const accountTypesTable = await tx.execute(
    sql`SELECT id FROM account_types WHERE tenant_id = ${tenantId} AND code = ${natureCode} LIMIT 1`
  );
  if (accountTypesTable.rows.length === 0) {
    throw new Error(`No account type with code ${natureCode} found for tenant ${tenantId}`);
  }
  const accountTypeId = (accountTypesTable.rows[0] as any).id;

  const maxNumResult = await tx.execute(
    sql`SELECT MAX(CAST(account_number AS INTEGER)) as max_num FROM chart_of_accounts WHERE tenant_id = ${tenantId} AND account_number ~ '^[0-9]+$'`
  );
  const maxNum = (maxNumResult.rows[0] as any)?.max_num;
  const nextNumber = maxNum ? (parseInt(String(maxNum)) + 10).toString() : '9000';

  const [created] = await tx.insert(chartOfAccounts).values({
    tenantId,
    accountTypeId,
    groupId: groups[0].id,
    accountNumber: nextNumber,
    name: accountName,
    description: `System-created account for automatic interest postings`,
    isActive: true,
    path: accountName,
    level: 1,
    allowJournalEntries: true,
    normalBalance: nature === 'Income' ? 'credit' : 'debit',
    balance: '0',
  }).returning();

  return created.id;
}

async function processInterestForLedger(ledger: InterestLedger): Promise<void> {
  const { tenantId } = ledger;
  const balance = parseFloat(ledger.balance || '0');
  if (Math.abs(balance) < 0.01) return;

  const yearlyRate = parseFloat(ledger.yearlyInterestRate || '0');
  if (yearlyRate <= 0) return;

  const periodsPerYear = getPeriodsPerYear(ledger.interestPostingFrequency);
  const interestAmount = Math.abs(balance) * (yearlyRate / 100) / periodsPerYear;
  if (interestAmount < 0.01) return;

  const roundedAmount = Math.round(interestAmount * 100) / 100;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  await db.transaction(async (tx) => {
    const isLiability = ledger.groupNature === 'Liability';
    const isAsset = ledger.groupNature === 'Asset';

    if (!isAsset && !isLiability) return;

    const systemUserId = await getSystemUserId(tenantId, tx);

    let interestExpenseId: number;
    let interestIncomeId: number;

    if (isLiability) {
      interestExpenseId = await findOrCreateSystemAccount(tenantId, 'Interest Expense', 'Expense', tx);
    } else {
      interestIncomeId = await findOrCreateSystemAccount(tenantId, 'Interest Income', 'Income', tx);
    }

    const [jvType] = await tx.select().from(voucherTypes)
      .where(and(
        eq(voucherTypes.tenantId, tenantId),
        eq(voucherTypes.isJournal, true)
      ))
      .limit(1);

    if (!jvType) {
      console.error(`[interest-accrual] No journal voucher type found for tenant ${tenantId}`);
      return;
    }

    const [postedStatus] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));

    const [draftStatus] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'DRAFT')));

    const statusId = postedStatus?.id || draftStatus?.id;
    if (!statusId) {
      console.error(`[interest-accrual] No voucher status found for tenant ${tenantId}`);
      return;
    }

    const [currentFY] = await tx.select().from(fiscalYears)
      .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

    if (!currentFY) {
      console.error(`[interest-accrual] No current fiscal year found for tenant ${tenantId}`);
      return;
    }

    const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'JV');

    const description = `Auto Interest Accrual: ${ledger.name} (${ledger.accountNumber}) @ ${yearlyRate}% p.a. ${ledger.interestPostingFrequency}`;

    const [voucher] = await tx.insert(vouchers).values({
      voucherNumber,
      voucherTypeId: jvType.id,
      voucherDate: todayStr,
      postingDate: todayStr,
      fiscalYearId: currentFY.id,
      statusId,
      description,
      amount: String(roundedAmount),
      currencyCode: 'BDT',
      exchangeRate: '1',
      preparedById: systemUserId,
      isPosted: true,
      postedById: systemUserId,
      postedDate: today,
      originModule: 'INTEREST_ACCRUAL',
      originType: 'AUTO_INTEREST',
      originId: ledger.id,
      originRef: `INT-${ledger.accountNumber}-${todayStr}`,
      tenantId,
      workflowStatus: 'POSTED',
    }).returning();

    let items: Array<{ accountId: number; debitAmount: string; creditAmount: string; description: string }>;

    if (isLiability) {
      items = [
        { accountId: interestExpenseId!, debitAmount: String(roundedAmount), creditAmount: '0', description: `Interest expense on ${ledger.name}` },
        { accountId: ledger.id, debitAmount: '0', creditAmount: String(roundedAmount), description: `Interest accrued on ${ledger.name}` },
      ];
    } else {
      items = [
        { accountId: ledger.id, debitAmount: String(roundedAmount), creditAmount: '0', description: `Interest earned on ${ledger.name}` },
        { accountId: interestIncomeId!, debitAmount: '0', creditAmount: String(roundedAmount), description: `Interest income from ${ledger.name}` },
      ];
    }

    const insertedItems = [];
    for (let i = 0; i < items.length; i++) {
      const [item] = await tx.insert(voucherItems).values({
        voucherId: voucher.id,
        lineNumber: i + 1,
        accountId: items[i].accountId,
        description: items[i].description,
        debitAmount: items[i].debitAmount,
        creditAmount: items[i].creditAmount,
        tenantId,
      }).returning();
      insertedItems.push(item);
    }

    const postingRecords = insertedItems.map((item) => ({
      tenantId,
      voucherId: voucher.id,
      voucherItemId: item.id,
      accountId: item.accountId,
      postingDate: todayStr,
      debitAmount: item.debitAmount || '0',
      creditAmount: item.creditAmount || '0',
      narration: item.description || description,
      postedById: systemUserId,
      fiscalYearId: currentFY.id,
    }));

    await tx.insert(ledgerPostings).values(postingRecords);

    for (const item of items) {
      const debit = parseFloat(item.debitAmount);
      const credit = parseFloat(item.creditAmount);
      const netChange = debit - credit;
      if (Math.abs(netChange) > 0) {
        await tx.execute(sql`
          UPDATE chart_of_accounts 
          SET balance = (CAST(balance AS NUMERIC) + ${netChange})::text,
              updated_at = NOW()
          WHERE id = ${item.accountId} AND tenant_id = ${tenantId}
        `);
      }
    }

    await tx.update(chartOfAccounts)
      .set({ lastInterestPostedDate: today })
      .where(eq(chartOfAccounts.id, ledger.id));

    console.log(`[interest-accrual] Posted interest ${roundedAmount} for ledger ${ledger.name} (${ledger.accountNumber}), tenant ${tenantId}, voucher ${voucherNumber}`);
  });
}

export async function processInterestAccruals(): Promise<void> {
  const now = new Date();
  console.log(`[interest-accrual] Starting interest accrual processing at ${now.toISOString()}`);

  const activeTenants = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  for (const tenant of activeTenants) {
    try {
      const ledgers = await db
        .select({
          id: chartOfAccounts.id,
          tenantId: chartOfAccounts.tenantId,
          name: chartOfAccounts.name,
          accountNumber: chartOfAccounts.accountNumber,
          balance: chartOfAccounts.balance,
          yearlyInterestRate: chartOfAccounts.yearlyInterestRate,
          interestPostingFrequency: chartOfAccounts.interestPostingFrequency,
          lastInterestPostedDate: chartOfAccounts.lastInterestPostedDate,
          groupNature: accountGroups.nature,
        })
        .from(chartOfAccounts)
        .innerJoin(accountGroups, eq(chartOfAccounts.groupId, accountGroups.id))
        .where(and(
          eq(chartOfAccounts.tenantId, tenant.id),
          eq(chartOfAccounts.hasInterest, true),
          eq(chartOfAccounts.isActive, true)
        ));

      let processed = 0;
      for (const ledger of ledgers) {
        if (isDueForPosting(ledger.lastInterestPostedDate, ledger.interestPostingFrequency || 'quarterly', now)) {
          try {
            await processInterestForLedger(ledger as InterestLedger);
            processed++;
          } catch (err) {
            console.error(`[interest-accrual] Error processing ledger ${ledger.id} for tenant ${tenant.id}:`, err);
          }
        }
      }

      if (processed > 0) {
        console.log(`[interest-accrual] Tenant ${tenant.id}: processed ${processed} interest accruals`);
      }
    } catch (err) {
      console.error(`[interest-accrual] Error processing tenant ${tenant.id}:`, err);
    }
  }

  console.log(`[interest-accrual] Completed interest accrual processing`);
}
