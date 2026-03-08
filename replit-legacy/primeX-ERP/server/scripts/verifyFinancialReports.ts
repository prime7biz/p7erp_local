import { db } from '../db';
import { 
  chartOfAccounts, accountGroups, accountTypes, 
  ledgerPostings, vouchers, voucherItems, voucherTypes, fiscalYears, tenants, voucherStatus
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getAccountMovements, getAccountMovementsAsOf, getGroupsForTenant } from '../accounting/reporting/rules';
import { buildGroupTree, computeAccountBalance } from '../accounting/reporting/statementRules';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;

function pass(test: string) { passed++; console.log(`  ${GREEN}✓ PASS${RESET} ${test}`); }
function fail(test: string, reason: string) { failed++; console.log(`  ${RED}✗ FAIL${RESET} ${test}: ${reason}`); }

async function main() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  Phase 3.1/3.2 Financial Reporting Engine Verification${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  const tenantWithGroups = await db.execute(sql`
    SELECT DISTINCT ag.tenant_id FROM account_groups ag
    WHERE EXISTS (SELECT 1 FROM account_groups g WHERE g.tenant_id = ag.tenant_id AND g.nature = 'Income')
      AND EXISTS (SELECT 1 FROM account_groups g WHERE g.tenant_id = ag.tenant_id AND g.nature = 'Expense')
      AND EXISTS (SELECT 1 FROM account_groups g WHERE g.tenant_id = ag.tenant_id AND g.nature = 'Asset')
      AND EXISTS (SELECT 1 FROM account_groups g WHERE g.tenant_id = ag.tenant_id AND g.nature = 'Liability')
    LIMIT 1
  `);
  const tenantRows = (tenantWithGroups as any).rows || tenantWithGroups;
  if (!tenantRows[0]) throw new Error('No tenant found with all required account groups (Income, Expense, Asset, Liability)');
  const tenantId = (tenantRows[0] as any).tenant_id;
  console.log(`${YELLOW}Using tenant ID: ${tenantId}${RESET}\n`);

  const incomeGroup = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), eq(accountGroups.nature, 'Income')))
    .limit(1);
  const expenseGroup = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), eq(accountGroups.nature, 'Expense')))
    .limit(1);
  const assetGroup = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), eq(accountGroups.nature, 'Asset')))
    .limit(1);
  const liabilityGroup = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), eq(accountGroups.nature, 'Liability')))
    .limit(1);
  const equityGroup = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), eq(accountGroups.nature, 'Equity')))
    .limit(1);

  if (!incomeGroup[0] || !expenseGroup[0] || !assetGroup[0] || !liabilityGroup[0]) {
    console.log(`${RED}Cannot run tests - missing account groups${RESET}`);
    process.exit(1);
  }

  const [accountType] = await db.select().from(accountTypes)
    .where(eq(accountTypes.tenantId, tenantId)).limit(1);
  if (!accountType) {
    console.log(`${RED}Cannot run tests - no account types${RESET}`);
    process.exit(1);
  }

  const [voucherType] = await db.select().from(voucherTypes)
    .where(eq(voucherTypes.tenantId, tenantId)).limit(1);
  const [fiscalYear] = await db.select().from(fiscalYears)
    .where(eq(fiscalYears.tenantId, tenantId)).limit(1);
  
  if (!voucherType || !fiscalYear) {
    console.log(`${RED}Cannot run tests - missing voucher type or fiscal year${RESET}`);
    process.exit(1);
  }

  const [status] = await db.select().from(voucherStatus)
    .where(eq(voucherStatus.tenantId, tenantId)).limit(1);
  if (!status) {
    console.log(`${RED}Cannot run tests - no voucher status found${RESET}`);
    process.exit(1);
  }
  const statusId = status.id;

  const userResult = await db.execute(sql`SELECT id FROM users WHERE tenant_id = ${tenantId} LIMIT 1`);
  const userRows = (userResult as any).rows || userResult;
  const userId = (userRows[0] as any)?.id || 1;

  const testSuffix = Date.now().toString().slice(-6);
  const testPrefix = `_FRT${testSuffix}`;
  const createdIds: { accounts: number[]; vouchers: number[]; voucherItems: number[]; postings: number[] } = {
    accounts: [], vouchers: [], voucherItems: [], postings: []
  };

  try {
    console.log(`${BOLD}Setup: Creating test accounts and vouchers${RESET}`);
    
    const [incomeAcct] = await db.insert(chartOfAccounts).values({
      tenantId, accountTypeId: accountType.id, groupId: incomeGroup[0].id,
      accountNumber: `${testPrefix}-INC`, name: `Test Income ${testPrefix}`,
      path: `Income > Test`, level: 2, isActive: true, normalBalance: 'credit',
    }).returning();
    createdIds.accounts.push(incomeAcct.id);

    const [expenseAcct] = await db.insert(chartOfAccounts).values({
      tenantId, accountTypeId: accountType.id, groupId: expenseGroup[0].id,
      accountNumber: `${testPrefix}-EXP`, name: `Test Expense ${testPrefix}`,
      path: `Expense > Test`, level: 2, isActive: true, normalBalance: 'debit',
    }).returning();
    createdIds.accounts.push(expenseAcct.id);

    const [cashAcct] = await db.insert(chartOfAccounts).values({
      tenantId, accountTypeId: accountType.id, groupId: assetGroup[0].id,
      accountNumber: `${testPrefix}-CASH`, name: `Test Cash ${testPrefix}`,
      path: `Asset > Test Cash`, level: 2, isActive: true, normalBalance: 'debit',
    }).returning();
    createdIds.accounts.push(cashAcct.id);

    const [liabAcct] = await db.insert(chartOfAccounts).values({
      tenantId, accountTypeId: accountType.id, groupId: liabilityGroup[0].id,
      accountNumber: `${testPrefix}-LIAB`, name: `Test Liability ${testPrefix}`,
      path: `Liability > Test`, level: 2, isActive: true, normalBalance: 'credit',
    }).returning();
    createdIds.accounts.push(liabAcct.id);

    pass('Created 4 test accounts (Income, Expense, Cash/Asset, Liability)');

    const [v1] = await db.insert(vouchers).values({
      tenantId, voucherNumber: `${testPrefix}-V001`, voucherTypeId: voucherType.id,
      voucherDate: '2025-06-15', fiscalYearId: fiscalYear.id, statusId,
      amount: '5000', isPosted: true, workflowStatus: 'POSTED',
      preparedById: userId, postedDate: new Date(),
    }).returning();
    createdIds.vouchers.push(v1.id);

    const [vi1a] = await db.insert(voucherItems).values({
      voucherId: v1.id, lineNumber: 1, accountId: cashAcct.id,
      debitAmount: '5000', creditAmount: '0', tenantId,
    }).returning();
    createdIds.voucherItems.push(vi1a.id);

    const [vi1b] = await db.insert(voucherItems).values({
      voucherId: v1.id, lineNumber: 2, accountId: incomeAcct.id,
      debitAmount: '0', creditAmount: '5000', tenantId,
    }).returning();
    createdIds.voucherItems.push(vi1b.id);

    const [lp1a] = await db.insert(ledgerPostings).values({
      tenantId, voucherId: v1.id, voucherItemId: vi1a.id, accountId: cashAcct.id,
      postingDate: '2025-06-15', debitAmount: '5000', creditAmount: '0',
      narration: 'Test income received',
    }).returning();
    createdIds.postings.push(lp1a.id);

    const [lp1b] = await db.insert(ledgerPostings).values({
      tenantId, voucherId: v1.id, voucherItemId: vi1b.id, accountId: incomeAcct.id,
      postingDate: '2025-06-15', debitAmount: '0', creditAmount: '5000',
      narration: 'Test income received',
    }).returning();
    createdIds.postings.push(lp1b.id);

    pass('Created POSTED voucher 1: Cash Dr 5000 / Income Cr 5000 (2025-06-15)');

    const [v2] = await db.insert(vouchers).values({
      tenantId, voucherNumber: `${testPrefix}-V002`, voucherTypeId: voucherType.id,
      voucherDate: '2025-07-20', fiscalYearId: fiscalYear.id, statusId,
      amount: '2000', isPosted: true, workflowStatus: 'POSTED',
      preparedById: userId, postedDate: new Date(),
    }).returning();
    createdIds.vouchers.push(v2.id);

    const [vi2a] = await db.insert(voucherItems).values({
      voucherId: v2.id, lineNumber: 1, accountId: expenseAcct.id,
      debitAmount: '2000', creditAmount: '0', tenantId,
    }).returning();
    createdIds.voucherItems.push(vi2a.id);

    const [vi2b] = await db.insert(voucherItems).values({
      voucherId: v2.id, lineNumber: 2, accountId: cashAcct.id,
      debitAmount: '0', creditAmount: '2000', tenantId,
    }).returning();
    createdIds.voucherItems.push(vi2b.id);

    const [lp2a] = await db.insert(ledgerPostings).values({
      tenantId, voucherId: v2.id, voucherItemId: vi2a.id, accountId: expenseAcct.id,
      postingDate: '2025-07-20', debitAmount: '2000', creditAmount: '0',
      narration: 'Test expense payment',
    }).returning();
    createdIds.postings.push(lp2a.id);

    const [lp2b] = await db.insert(ledgerPostings).values({
      tenantId, voucherId: v2.id, voucherItemId: vi2b.id, accountId: cashAcct.id,
      postingDate: '2025-07-20', debitAmount: '0', creditAmount: '2000',
      narration: 'Test expense payment',
    }).returning();
    createdIds.postings.push(lp2b.id);

    pass('Created POSTED voucher 2: Expense Dr 2000 / Cash Cr 2000 (2025-07-20)');

    const [v3] = await db.insert(vouchers).values({
      tenantId, voucherNumber: `${testPrefix}-V003`, voucherTypeId: voucherType.id,
      voucherDate: '2025-07-25', fiscalYearId: fiscalYear.id, statusId,
      amount: '9999', isPosted: false, workflowStatus: 'DRAFT',
      preparedById: userId,
    }).returning();
    createdIds.vouchers.push(v3.id);

    const [vi3a] = await db.insert(voucherItems).values({
      voucherId: v3.id, lineNumber: 1, accountId: cashAcct.id,
      debitAmount: '9999', creditAmount: '0', tenantId,
    }).returning();
    createdIds.voucherItems.push(vi3a.id);

    pass('Created NON-POSTED voucher 3 (should be excluded from all reports)');

    console.log(`\n${BOLD}Test 1: Trial Balance (2025-06-01 to 2025-07-31)${RESET}`);
    const movements = await getAccountMovements(tenantId, '2025-06-01', '2025-07-31');
    
    const testMovements = movements.filter(m => createdIds.accounts.includes(m.accountId));
    
    const cashMov = testMovements.find(m => m.accountId === cashAcct.id);
    if (cashMov) {
      if (cashMov.periodDebit === 5000 && cashMov.periodCredit === 2000) {
        pass('Cash account: period Dr=5000, Cr=2000 (correct)');
      } else {
        fail('Cash account movements', `Expected Dr=5000 Cr=2000, got Dr=${cashMov.periodDebit} Cr=${cashMov.periodCredit}`);
      }
    } else {
      fail('Cash account', 'Not found in movements');
    }

    const incomeMov = testMovements.find(m => m.accountId === incomeAcct.id);
    if (incomeMov) {
      if (incomeMov.periodCredit === 5000 && incomeMov.periodDebit === 0) {
        pass('Income account: period Dr=0, Cr=5000 (correct)');
      } else {
        fail('Income account movements', `Expected Dr=0 Cr=5000, got Dr=${incomeMov.periodDebit} Cr=${incomeMov.periodCredit}`);
      }
    } else {
      fail('Income account', 'Not found in movements');
    }

    const expenseMov = testMovements.find(m => m.accountId === expenseAcct.id);
    if (expenseMov) {
      if (expenseMov.periodDebit === 2000 && expenseMov.periodCredit === 0) {
        pass('Expense account: period Dr=2000, Cr=0 (correct)');
      } else {
        fail('Expense account movements', `Expected Dr=2000 Cr=0, got Dr=${expenseMov.periodDebit} Cr=${expenseMov.periodCredit}`);
      }
    } else {
      fail('Expense account', 'Not found in movements');
    }

    const testTotalDr = testMovements.reduce((s, m) => s + m.periodDebit, 0);
    const testTotalCr = testMovements.reduce((s, m) => s + m.periodCredit, 0);
    if (testTotalDr === testTotalCr) {
      pass(`Trial Balance balanced: total Dr=${testTotalDr} == total Cr=${testTotalCr}`);
    } else {
      fail('Trial Balance balance check', `Dr=${testTotalDr} != Cr=${testTotalCr}`);
    }

    console.log(`\n${BOLD}Test 2: General Ledger - Opening/Closing Balance${RESET}`);
    
    const julyMovements = await getAccountMovements(tenantId, '2025-07-01', '2025-07-31');
    const cashJuly = julyMovements.find(m => m.accountId === cashAcct.id);
    if (cashJuly) {
      if (cashJuly.openingDebit === 5000 && cashJuly.openingCredit === 0) {
        pass('Cash GL July: opening Dr=5000 (from June voucher)');
      } else {
        fail('Cash GL July opening', `Expected openingDr=5000 openingCr=0, got Dr=${cashJuly.openingDebit} Cr=${cashJuly.openingCredit}`);
      }
      
      const closingNet = (cashJuly.openingDebit - cashJuly.openingCredit) + (cashJuly.periodDebit - cashJuly.periodCredit);
      if (closingNet === 3000) {
        pass('Cash GL July: closing balance = 3000 (5000 - 2000)');
      } else {
        fail('Cash GL July closing', `Expected 3000, got ${closingNet}`);
      }
    } else {
      fail('Cash GL July', 'Not found in movements');
    }

    console.log(`\n${BOLD}Test 3: Profit & Loss${RESET}`);
    
    const plMovements = movements.filter(m => 
      createdIds.accounts.includes(m.accountId) && 
      (m.groupNature === 'Income' || m.groupNature === 'Expense')
    );
    
    let totalIncome = 0;
    let totalExpense = 0;
    for (const acct of plMovements) {
      const balance = computeAccountBalance(acct, 'period');
      if (acct.groupNature === 'Income') totalIncome += balance;
      else totalExpense += balance;
    }
    const netProfit = totalIncome - totalExpense;
    
    if (totalIncome === 5000) pass(`P&L total income: ${totalIncome} (correct)`);
    else fail('P&L total income', `Expected 5000, got ${totalIncome}`);
    
    if (totalExpense === 2000) pass(`P&L total expense: ${totalExpense} (correct)`);
    else fail('P&L total expense', `Expected 2000, got ${totalExpense}`);
    
    if (netProfit === 3000) pass(`P&L net profit: ${netProfit} (correct: 5000 - 2000)`);
    else fail('P&L net profit', `Expected 3000, got ${netProfit}`);

    console.log(`\n${BOLD}Test 4: Balance Sheet (as of 2025-07-31)${RESET}`);
    
    const bsMovements = await getAccountMovementsAsOf(tenantId, '2025-07-31');
    const bsTestAccounts = bsMovements.filter(m => createdIds.accounts.includes(m.accountId));
    
    const cashBS = bsTestAccounts.find(m => m.accountId === cashAcct.id);
    if (cashBS) {
      const cashBalance = cashBS.periodDebit - cashBS.periodCredit;
      if (cashBalance === 3000) pass(`BS Cash (Asset): ${cashBalance} (correct)`);
      else fail('BS Cash balance', `Expected 3000, got ${cashBalance}`);
    } else {
      fail('BS Cash', 'Not found');
    }

    console.log(`\n${BOLD}Test 5: POSTED-Only Enforcement${RESET}`);
    
    if (cashBS) {
      const cashNet = cashBS.periodDebit - cashBS.periodCredit;
      if (cashNet === 3000) {
        pass('Non-posted voucher correctly excluded (cash=3000, not 12999)');
      } else {
        fail('POSTED-only enforcement', `Cash shows ${cashNet}, expected 3000 (non-posted voucher may be included)`);
      }
    }

    console.log(`\n${BOLD}Test 6: Performance Indexes${RESET}`);
    const indexResult = await db.execute(sql`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'ledger_postings' 
      AND indexname LIKE 'ledger_postings_tenant_%'
      ORDER BY indexname
    `);
    const indexRows = (indexResult as any).rows || indexResult;
    const indexNames = Array.from(indexRows).map((r: any) => r.indexname);
    
    const requiredIndexes = [
      'ledger_postings_tenant_account_date_idx',
      'ledger_postings_tenant_account_idx',
      'ledger_postings_tenant_date_idx',
    ];
    
    for (const idx of requiredIndexes) {
      if (indexNames.includes(idx)) {
        pass(`Index ${idx} exists`);
      } else {
        fail(`Index ${idx}`, 'Not found');
      }
    }

  } finally {
    console.log(`\n${BOLD}Cleanup: Removing test data${RESET}`);
    
    for (const id of createdIds.postings) {
      await db.delete(ledgerPostings).where(eq(ledgerPostings.id, id));
    }
    for (const id of createdIds.voucherItems) {
      await db.delete(voucherItems).where(eq(voucherItems.id, id));
    }
    for (const id of createdIds.vouchers) {
      await db.delete(vouchers).where(eq(vouchers.id, id));
    }
    for (const id of createdIds.accounts) {
      await db.delete(chartOfAccounts).where(eq(chartOfAccounts.id, id));
    }
    
    pass('Test data cleaned up');
  }

  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  Results: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : GREEN}${failed} failed${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
