import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../db';
import { accountGroups, chartOfAccounts, accountTypes, ledgerOpeningBalances, voucherItems, ledgerPostings, journalLines, postingProfileLines, vouchers, voucherEditHistory } from '@shared/schema';
import { eq, and, count, sql } from 'drizzle-orm';

const TENANT_ID = 1;
const CUTOVER_DATE = '2026-02-15';
const EXCEL_PATH = path.join(process.cwd(), 'attached_assets', 'Chart_of_active_ledgre_1771233099824.xls');

const NAME_CORRECTIONS: Record<string, string> = {
  'Accu-Amortization Soft Ware': 'Accumulated Amortization – Software',
  'Accu. Dep-Building': 'Accumulated Depreciation – Building',
  'Accu. Dep- Computer': 'Accumulated Depreciation – Computer & IT',
  'Accu Dep-Container': 'Accumulated Depreciation – Container',
  'Accu. Dep-Crockeries & Cutlery': 'Accumulated Depreciation – Crockeries & Cutlery',
  'Accu. Dep- Electric Equipment': 'Accumulated Depreciation – Electrical Equipment',
  'Accu. Dep-Furniture & Fixture': 'Accumulated Depreciation – Furniture & Fixture',
  'Accu Dep-Gas Boiler': 'Accumulated Depreciation – Gas Boiler',
  'Accu. Dep- Generator': 'Accumulated Depreciation – Generator',
  'Accu. Dep-Office Equipment': 'Accumulated Depreciation – Office Equipment',
  'Accu.Dep-PA & PABX System': 'Accumulated Depreciation – PA/PABX System',
  'Accu. Dep-Plant & Machinery': 'Accumulated Depreciation – Plant & Machinery',
  'Accu. Dep-Vehicle': 'Accumulated Depreciation – Vehicle',
  'Accu.Dep-Wear House & Racking System': 'Accumulated Depreciation – Warehouse & Racking',
  'Accumulated Depreciation & Amortization': 'Accumulated Depreciation & Amortization (Control)',
  'Revenue From Others': 'Other Operating Income',
  'Others (Op. Exp.)': 'Other Operating Expenses',
  'Others (Ad. & Sel.)': 'Selling & Distribution – Others',
  'Miscellaneous Expenses - Factory': 'Factory Misc. Expenses',
  'Miscellaneous Expenses - Head Office': 'Head Office Misc. Expenses',
  'Accrued Director Remuneration': 'Director Remuneration Payable',
  'Director Remuneration': 'Director Remuneration Expense',
  'Deffered Revenue Expenses': 'Deferred Revenue Expenses',
  'Gas Line Insttalation': 'Gas Line Installation',
  'Vhehicle No-Dhaka Metro-Cha-56-4580': 'Vehicle No-Dhaka Metro-Cha-56-4580',
  'Wear House Racking System': 'Warehouse Racking System',
  'Provission for Salary & Wages': 'Provision for Salary & Wages (Accrued)',
  'Revenue From Audit Fee': 'Audit Fee Income',
  'Advance for Marriage Receiption': 'Advance for Marriage Reception',
};

function normalizeName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return NAME_CORRECTIONS[trimmed] || trimmed;
}

interface GroupDef {
  name: string;
  code: string;
  nature: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  affectsGrossProfit: boolean;
  children: SubGroupDef[];
}

interface SubGroupDef {
  name: string;
  code: string;
  children?: SubGroupDef[];
  ledgerRows: number[];
}

interface ParsedRow {
  idx: number;
  name: string;
  originalName: string;
  dr: number;
  cr: number;
}

const HIERARCHY: GroupDef[] = [
  {
    name: 'Capital Account', code: 'CAPITAL', nature: 'Equity', affectsGrossProfit: false,
    children: [
      { name: 'Paid Up Capital', code: 'PAID_UP_CAPITAL', ledgerRows: [13,14,15,16,17] },
      { name: 'Reserves & Surplus', code: 'RESERVES_SURPLUS', ledgerRows: [486] },
    ]
  },
  {
    name: 'Loans (Liability)', code: 'LOANS_LIABILITY', nature: 'Liability', affectsGrossProfit: false,
    children: [
      { name: 'Bank OD A/c', code: 'BANK_OD', ledgerRows: [20] },
      { name: 'Long Term Borrowing', code: 'LONG_TERM_BORROWING', ledgerRows: [22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39] },
    ]
  },
  {
    name: 'Current Liabilities', code: 'CURRENT_LIABILITIES', nature: 'Liability', affectsGrossProfit: false,
    children: [
      { name: 'Provision for Salary & Wages', code: 'PROV_SALARY', ledgerRows: [42,43,44,45,46,47] },
      { name: 'Sundry Creditors', code: 'SUNDRY_CREDITORS', ledgerRows: [49,50,51,52,53] },
      {
        name: 'Back to Back Liability at TBL', code: 'BBL_LIABILITY', ledgerRows: [],
        children: [
          { name: 'ABP BBL/C Liabilities', code: 'ABP_BBL', ledgerRows: [72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102] },
          { name: 'NON ABP BBL/C Liabilities', code: 'NON_ABP_BBL', ledgerRows: [104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124] },
        ]
      },
      {
        name: 'Trade Finance Liabilities', code: 'TRADE_FINANCE_LIAB', ledgerRows: [],
        children: [
          { name: 'EDF Liabilities For BB L/C', code: 'EDF_LIAB', ledgerRows: [126,127,128,129,130,131,132,133,134] },
          { name: 'FDB Purchase Loan', code: 'FDB_LOAN', ledgerRows: [] },
          { name: 'FOD Loan Account', code: 'FOD_LOAN', ledgerRows: [] },
          { name: 'Packing Credit Loan', code: 'PACKING_CREDIT', ledgerRows: [142,143,144,145,146,147] },
        ]
      },
      { name: "Loan From Director's", code: 'LOAN_DIRECTORS', ledgerRows: [138,139,140] },
      { name: 'Short Term Borrowing', code: 'SHORT_TERM_BORROW', ledgerRows: [149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167] },
      { name: 'Time Loan', code: 'TIME_LOAN', ledgerRows: [169] },
      { name: 'Other Current Liabilities', code: 'OTHER_CL', ledgerRows: [170] },
    ]
  },
  {
    name: 'Fixed Assets', code: 'FIXED_ASSETS', nature: 'Asset', affectsGrossProfit: false,
    children: [
      { name: 'Deferred Revenue Expenses', code: 'DEFERRED_REV_EXP', ledgerRows: [173] },
      { name: 'Intangible Assets', code: 'INTANGIBLE_ASSETS', ledgerRows: [175,176] },
      { name: 'Tangible Assets', code: 'TANGIBLE_ASSETS', ledgerRows: [179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198] },
      {
        name: 'Accumulated Depreciation & Amortization (Control)', code: 'ACCUM_DEPR', ledgerRows: [55,56,57,58,59,60,61,62,63,64,65,66,67,68,69]
      },
    ]
  },
  {
    name: 'Investments', code: 'INVESTMENTS', nature: 'Asset', affectsGrossProfit: false,
    children: [
      { name: 'Portfolio Investments', code: 'PORTFOLIO_INV', ledgerRows: [200] },
    ]
  },
  {
    name: 'Current Assets', code: 'CURRENT_ASSETS', nature: 'Asset', affectsGrossProfit: false,
    children: [
      { name: 'Opening Stock', code: 'OPENING_STOCK', ledgerRows: [203,204,205] },
      { name: 'Cash-in-Hand', code: 'CASH_IN_HAND', ledgerRows: [207,208] },
      { name: 'Cash at Bank', code: 'CASH_AT_BANK', ledgerRows: [210,211,212,213,214,215,216,217,218,219] },
      {
        name: 'Advance Deposit & Prepayment', code: 'ADV_DEPOSIT', ledgerRows: [],
        children: [
          { name: 'Advance Against Construction', code: 'ADV_CONSTR', ledgerRows: [222,223,224,225,226,227,228,229,230] },
          { name: 'Advance Against Expenses', code: 'ADV_EXPENSES', ledgerRows: [232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252] },
          { name: 'Advance Against Land Purchase', code: 'ADV_LAND', ledgerRows: [254,255,256,257,258,259,260] },
          { name: 'Advance Against Purchase', code: 'ADV_PURCHASE', ledgerRows: [262,263,264] },
          { name: 'Advance Against Salary', code: 'ADV_SALARY', ledgerRows: [266,267,268,269] },
          { name: 'Advance Against Sales', code: 'ADV_SALES', ledgerRows: [271,272,273,274,275] },
          { name: 'Advance Security Deposit', code: 'ADV_SEC_DEPOSIT', ledgerRows: [277,278,279,280,281,282] },
          { name: 'Advance to the Director for Land', code: 'ADV_DIR_LAND', ledgerRows: [284,285,286] },
          { name: 'Advance Income Tax & VAT', code: 'ADV_TAX_VAT', ledgerRows: [288] },
        ]
      },
      {
        name: 'Export Bill Receivable', code: 'EXPORT_BILL_REC', ledgerRows: [],
        children: [
          { name: 'BGS', code: 'EBR_BGS', ledgerRows: [] },
          { name: 'CHERRY FIELD', code: 'EBR_CHERRY', ledgerRows: [] },
          { name: 'CRU', code: 'EBR_CRU', ledgerRows: [] },
          { name: 'GAS', code: 'EBR_GAS', ledgerRows: [294] },
          { name: 'GDS', code: 'EBR_GDS', ledgerRows: [] },
          { name: 'Having International', code: 'EBR_HAVING', ledgerRows: [] },
          { name: 'PACE MARK', code: 'EBR_PACEMARK', ledgerRows: [] },
          { name: 'SCANWEAR', code: 'EBR_SCANWEAR', ledgerRows: [] },
          { name: 'TGL', code: 'EBR_TGL', ledgerRows: [] },
        ]
      },
    ]
  },
  {
    name: 'Direct Income', code: 'DIRECT_INCOME', nature: 'Income', affectsGrossProfit: true,
    children: [
      { name: 'Sales Account', code: 'SALES', ledgerRows: [] },
    ]
  },
  {
    name: 'Indirect Income', code: 'INDIRECT_INCOME', nature: 'Income', affectsGrossProfit: false,
    children: [
      { name: 'Other Income', code: 'OTHER_INCOME', ledgerRows: [] },
    ]
  },
  {
    name: 'Direct Expenses', code: 'DIRECT_EXPENSES', nature: 'Expense', affectsGrossProfit: true,
    children: [
      { name: 'Manufacturing Expenses', code: 'MFG_EXPENSES', ledgerRows: [] },
      { name: 'Purchase Account', code: 'PURCHASE', ledgerRows: [] },
    ]
  },
  {
    name: 'Indirect Expenses', code: 'INDIRECT_EXPENSES', nature: 'Expense', affectsGrossProfit: false,
    children: [
      { name: 'Administrative Expenses', code: 'ADMIN_EXPENSES', ledgerRows: [] },
    ]
  },
];

async function main() {
  console.log('='.repeat(70));
  console.log('LAKHSMA INNER WEAR LIMITED - COA IMPORT');
  console.log('Tally Export → PrimeX ERP');
  console.log('='.repeat(70));
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`Cutover Date: ${CUTOVER_DATE}`);
  console.log(`Excel File: ${EXCEL_PATH}`);

  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });

  const rows: ParsedRow[] = [];
  for (let i = 11; i < rawData.length; i++) {
    const row = rawData[i];
    const rawName = String(row[0] || '').trim();
    if (!rawName || rawName === 'Grand Total') continue;
    const dr = row[1] === '' ? 0 : Number(row[1]) || 0;
    const cr = row[2] === '' ? 0 : Number(row[2]) || 0;
    rows.push({
      idx: i,
      name: normalizeName(rawName),
      originalName: rawName,
      dr,
      cr,
    });
  }

  console.log(`\nParsed ${rows.length} data rows from Excel`);

  const nameCorrections: Array<{original: string; corrected: string}> = [];
  for (const r of rows) {
    if (r.name !== r.originalName) {
      nameCorrections.push({ original: r.originalName, corrected: r.name });
    }
  }
  if (nameCorrections.length > 0) {
    console.log(`\nName Corrections Applied (${nameCorrections.length}):`);
    for (const c of nameCorrections) {
      console.log(`  "${c.original}" → "${c.corrected}"`);
    }
  }

  const allLedgerRows = new Set<number>();
  const rowByIdx = new Map<number, ParsedRow>();
  for (const r of rows) rowByIdx.set(r.idx, r);

  function collectLedgerRows(sg: SubGroupDef) {
    for (const idx of sg.ledgerRows) allLedgerRows.add(idx);
    if (sg.children) {
      for (const child of sg.children) collectLedgerRows(child);
    }
  }
  for (const g of HIERARCHY) {
    for (const sg of g.children) collectLedgerRows(sg);
  }

  const KNOWN_GROUPS = new Set([
    11,12,18,19,21,40,41,48,54,70,71,103,125,135,136,137,141,148,168,170,
    171,172,174,177,178,199,201,202,206,209,220,221,231,253,261,265,270,276,283,287,289
  ]);

  const unmappedRows: ParsedRow[] = [];
  for (const r of rows) {
    if (!allLedgerRows.has(r.idx) && !KNOWN_GROUPS.has(r.idx)) {
      unmappedRows.push(r);
    }
  }

  console.log(`\nMapped ${allLedgerRows.size} ledgers to hierarchy`);
  if (unmappedRows.length > 0) {
    console.log(`\nUnmapped rows to process (${unmappedRows.length}):`);
    for (const r of unmappedRows) {
      console.log(`  ROW ${r.idx}: "${r.name}" Dr=${r.dr} Cr=${r.cr}`);
    }
  }

  const EXTRA_MAPPINGS: Record<string, { group: string; subgroup: string; rows: number[] }> = {};

  const EBR_ROWS: Record<string, number[]> = {};
  let currentEBRBuyer = '';
  for (let i = 290; i < 350; i++) {
    const r = rowByIdx.get(i);
    if (!r) continue;
    if (r.name.startsWith('LIWL-') || r.name.startsWith('BBL/C') || r.name.includes('(B/R)')) {
      if (currentEBRBuyer && EBR_ROWS[currentEBRBuyer]) {
        EBR_ROWS[currentEBRBuyer].push(i);
        allLedgerRows.add(i);
      }
    } else {
      currentEBRBuyer = r.name;
      EBR_ROWS[r.name] = [];
    }
  }

  let totalDr = 0;
  let totalCr = 0;
  for (const r of rows) {
    if (!KNOWN_GROUPS.has(r.idx)) {
      totalDr += r.dr;
      totalCr += r.cr;
    }
  }

  console.log(`\n--- Begin DB Import ---`);

  await db.transaction(async (tx) => {
    console.log('\nChecking for existing transactions...');
    const existingLedgers = await tx.select().from(chartOfAccounts).where(eq(chartOfAccounts.tenantId, TENANT_ID));

    console.log('Clearing ALL dependent data...');
    await tx.execute(sql.raw(`DELETE FROM ledger_postings WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared ledger_postings');
    await tx.execute(sql.raw(`DELETE FROM voucher_items WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared voucher_items');
    await tx.execute(sql.raw(`DELETE FROM journal_lines WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared journal_lines');
    await tx.execute(sql.raw(`DELETE FROM voucher_edit_history WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared voucher_edit_history');
    await tx.execute(sql.raw(`DELETE FROM vouchers WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared vouchers');
    await tx.execute(sql.raw(`DELETE FROM posting_profile_lines WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared posting_profile_lines');
    await tx.execute(sql.raw(`DELETE FROM journal_entry_items WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared journal_entry_items');
    await tx.execute(sql.raw(`UPDATE voucher_types SET default_debit_account_id = NULL, default_credit_account_id = NULL WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared voucher_types defaults');
    await tx.execute(sql.raw(`DELETE FROM financial_statement_section_accounts WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared financial_statement_section_accounts');
    await tx.execute(sql.raw(`DELETE FROM ledger_opening_balances WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared ledger_opening_balances');
    await tx.execute(sql.raw(`DELETE FROM budget_lines WHERE tenant_id = ${TENANT_ID}`));
    console.log('  Cleared budget_lines');
    console.log('  All dependent data cleared.');

    console.log('Creating backup...');
    const existingGroups = await tx.select().from(accountGroups).where(eq(accountGroups.tenantId, TENANT_ID));
    const existingOB = await tx.select().from(ledgerOpeningBalances).where(eq(ledgerOpeningBalances.tenantId, TENANT_ID));

    const backupDir = path.join(process.cwd(), 'server', 'backups', 'coa', String(TENANT_ID));
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${timestamp}_coa_backup.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
      tenantId: TENANT_ID, timestamp: new Date().toISOString(),
      groups: existingGroups, ledgers: existingLedgers, openingBalances: existingOB,
    }, null, 2));
    console.log(`Backup saved: ${backupPath}`);

    console.log(`\nDeleting existing data: ${existingLedgers.length} ledgers, ${existingGroups.length} groups, ${existingOB.length} opening balances...`);

    if (existingOB.length > 0) await tx.delete(ledgerOpeningBalances).where(eq(ledgerOpeningBalances.tenantId, TENANT_ID));
    const [ppCount] = await tx.select({ cnt: count() }).from(postingProfileLines).where(eq(postingProfileLines.tenantId, TENANT_ID));
    if (ppCount.cnt > 0) await tx.delete(postingProfileLines).where(eq(postingProfileLines.tenantId, TENANT_ID));
    if (existingLedgers.length > 0) {
      await tx.update(chartOfAccounts).set({ parentAccountId: null }).where(eq(chartOfAccounts.tenantId, TENANT_ID));
      await tx.delete(chartOfAccounts).where(eq(chartOfAccounts.tenantId, TENANT_ID));
    }
    if (existingGroups.length > 0) {
      await tx.update(accountGroups).set({ parentGroupId: null }).where(eq(accountGroups.tenantId, TENANT_ID));
      await tx.delete(accountGroups).where(eq(accountGroups.tenantId, TENANT_ID));
    }
    console.log('Deleted.');

    const existingAT = await tx.select().from(accountTypes).where(eq(accountTypes.tenantId, TENANT_ID));
    console.log(`Account types found: ${existingAT.map(at => `${at.name}(id=${at.id})`).join(', ')}`);
    const atMap = new Map<string, number>();
    for (const at of existingAT) {
      atMap.set(at.name, at.id);
      if (at.name === 'Revenue') atMap.set('Income', at.id);
    }
    if (!atMap.has('Asset')) throw new Error('Missing Asset account type');

    console.log('\nCreating groups and ledgers...');

    let groupCount = 0;
    let ledgerCount = 0;
    let obSetCount = 0;
    let accNumCounter = 1000;

    function getAccNum(): string {
      accNumCounter++;
      return String(accNumCounter);
    }

    function getNormalBal(nature: string): string {
      return (nature === 'Asset' || nature === 'Expense') ? 'debit' : 'credit';
    }

    async function createLedgersForSubgroup(subgroupId: number, nature: string, ledgerRowIdxs: number[], pathPrefix: string) {
      const atId = atMap.get(nature) || atMap.get('Asset')!;
      for (const idx of ledgerRowIdxs) {
        const r = rowByIdx.get(idx);
        if (!r) continue;

        const openingBal = r.dr > 0 ? String(r.dr) : r.cr > 0 ? String(-r.cr) : '0';
        const isCash = r.name.toLowerCase().includes('cash book') || r.name.toLowerCase().startsWith('cash -') || r.name.toLowerCase().startsWith('cash-');
        const isBank = r.name.toLowerCase().includes('a/c no') || r.name.toLowerCase().includes('cd a/c') || r.name.toLowerCase().includes('dad a/c') || r.name.toLowerCase().includes('erq a/c') || r.name.toLowerCase().includes('snd a/c') || r.name.toLowerCase().includes('bkash');

        const [ledger] = await tx.insert(chartOfAccounts).values({
          tenantId: TENANT_ID,
          accountTypeId: atId,
          groupId: subgroupId,
          accountNumber: getAccNum(),
          name: r.name,
          description: r.name !== r.originalName ? `Legacy name: ${r.originalName}` : null,
          isActive: true,
          path: `${pathPrefix} > ${r.name}`,
          level: 3,
          allowJournalEntries: true,
          normalBalance: getNormalBal(nature),
          balance: '0',
          openingBalance: openingBal,
          isCashAccount: isCash,
          isBankAccount: isBank,
          isMaterialSupplier: false,
        } as any).returning();
        ledgerCount++;
        if (r.dr > 0 || r.cr > 0) obSetCount++;
      }
    }

    async function createSubgroup(sg: SubGroupDef, parentGroupId: number, nature: string, sortOrder: number, pathPrefix: string): Promise<number> {
      const [created] = await tx.insert(accountGroups).values({
        tenantId: TENANT_ID,
        name: sg.name,
        code: sg.code,
        nature,
        affectsGrossProfit: false,
        isDefault: false,
        sortOrder,
        parentGroupId,
      }).returning();
      groupCount++;
      const sgPath = `${pathPrefix} > ${sg.name}`;

      await createLedgersForSubgroup(created.id, nature, sg.ledgerRows, sgPath);

      if (sg.children) {
        let childSort = sortOrder * 100;
        for (const child of sg.children) {
          childSort++;
          await createSubgroup(child, created.id, nature, childSort, sgPath);
        }
      }

      return created.id;
    }

    let mainSort = 1;
    for (const g of HIERARCHY) {
      const [mainGroup] = await tx.insert(accountGroups).values({
        tenantId: TENANT_ID,
        name: g.name,
        code: g.code,
        nature: g.nature,
        affectsGrossProfit: g.affectsGrossProfit,
        isDefault: false,
        sortOrder: mainSort,
        parentGroupId: null,
      }).returning();
      groupCount++;
      console.log(`  Created group: ${g.name} (${g.nature})`);

      let childSort = mainSort * 100;
      for (const sg of g.children) {
        childSort++;
        await createSubgroup(sg, mainGroup.id, g.nature, childSort, g.name);
      }
      mainSort++;
    }

    console.log(`\nNow processing remaining unmapped rows...`);

    const allGroupsByName = await tx.select().from(accountGroups).where(eq(accountGroups.tenantId, TENANT_ID));
    const groupNameMap = new Map<string, number>();
    for (const g of allGroupsByName) groupNameMap.set(g.name, g.id);

    const unmappedAfterHierarchy: ParsedRow[] = [];
    for (const r of rows) {
      if (!allLedgerRows.has(r.idx) && !KNOWN_GROUPS.has(r.idx)) {
        unmappedAfterHierarchy.push(r);
      }
    }

    const incomeRows: number[] = [];
    const directExpenseRows: number[] = [];
    const indirectExpenseSubgroups: Record<string, number[]> = {};

    let currentDirectIncomeGroup = false;
    let currentDirectExpenseGroup = false;
    let currentIndirectIncomeGroup = false;
    let currentIndirectExpenseGroup = false;
    let currentSubExpGroup = '';
    let currentSubExpIsLeaf = false;

    for (let i = 11; i < rawData.length; i++) {
      const rawName = String(rawData[i][0] || '').trim();
      if (!rawName || rawName === 'Grand Total') continue;

      if (rawName === 'Direct Incomes' || rawName === 'Direct Income') {
        currentDirectIncomeGroup = true; currentDirectExpenseGroup = false; currentIndirectIncomeGroup = false; currentIndirectExpenseGroup = false;
        continue;
      }
      if (rawName === 'Indirect Incomes' || rawName === 'Indirect Income') {
        currentIndirectIncomeGroup = true; currentDirectIncomeGroup = false; currentDirectExpenseGroup = false; currentIndirectExpenseGroup = false;
        continue;
      }
      if (rawName === 'Direct Expenses' || rawName === 'Direct Expense') {
        currentDirectExpenseGroup = true; currentDirectIncomeGroup = false; currentIndirectIncomeGroup = false; currentIndirectExpenseGroup = false;
        continue;
      }
      if (rawName === 'Indirect Expenses' || rawName === 'Indirect Expense') {
        currentIndirectExpenseGroup = true; currentDirectIncomeGroup = false; currentDirectExpenseGroup = false; currentIndirectIncomeGroup = false;
        continue;
      }
      if (rawName === 'Forex Gain/Loss' || rawName === "Profit & Loss A/c") {
        currentDirectExpenseGroup = false; currentIndirectExpenseGroup = false;
        continue;
      }

      const r = rowByIdx.get(i);
      if (!r) continue;
      if (allLedgerRows.has(i) || KNOWN_GROUPS.has(i)) continue;

      if (currentDirectIncomeGroup) {
        const salesGroupId = groupNameMap.get('Sales Account');
        if (salesGroupId) {
          allLedgerRows.add(i);
          await createLedgersForSubgroup(salesGroupId, 'Income', [i], 'Direct Income > Sales Account');
        }
        continue;
      }

      if (currentIndirectIncomeGroup) {
        const otherIncGroupId = groupNameMap.get('Other Income');
        if (otherIncGroupId) {
          allLedgerRows.add(i);
          await createLedgersForSubgroup(otherIncGroupId, 'Income', [i], 'Indirect Income > Other Income');
        }
        continue;
      }

      if (currentDirectExpenseGroup) {
        const subGroupNames = [
          'Consumable Store Expenses (Op. Exp.)', 'Factory Expenses (Op. Exp.)',
          'Miscellaneous Expenses (Op. Exp.)', 'Other Operating Expenses',
          'Printing & Embroidery (Op. Exp.)', 'Purchase (Op. Exp.)',
          'Repair & Maintenance (Op. Exp.)', 'Salary (Op. Exp.)',
          'Utility Expenses (Op. Exp.)', 'Subcontract (Op. Exp.)',
          'Knitting Expenses (Op. Exp.)', 'Dyeing Expenses (Op. Exp.)',
        ];
        const normalizedSubGroupNames = subGroupNames.map(n => normalizeName(n));

        if (normalizedSubGroupNames.includes(r.name) || subGroupNames.includes(r.originalName)) {
          const mfgGroupId = groupNameMap.get('Manufacturing Expenses');
          if (mfgGroupId) {
            const subCode = r.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25).toUpperCase();
            const [sg] = await tx.insert(accountGroups).values({
              tenantId: TENANT_ID, name: r.name, code: `MFG_${subCode}`, nature: 'Expense',
              affectsGrossProfit: true, isDefault: false, sortOrder: groupCount + 1, parentGroupId: mfgGroupId,
            }).returning();
            groupCount++;
            groupNameMap.set(r.name, sg.id);
            currentSubExpGroup = r.name;
            currentSubExpIsLeaf = false;
            KNOWN_GROUPS.add(i);
          }
          continue;
        }

        if (currentSubExpGroup && groupNameMap.has(currentSubExpGroup)) {
          allLedgerRows.add(i);
          await createLedgersForSubgroup(groupNameMap.get(currentSubExpGroup)!, 'Expense', [i], `Direct Expenses > Manufacturing Expenses > ${currentSubExpGroup}`);
          continue;
        }

        const purchGroupId = groupNameMap.get('Purchase Account');
        if (purchGroupId) {
          allLedgerRows.add(i);
          await createLedgersForSubgroup(purchGroupId, 'Expense', [i], 'Direct Expenses > Purchase Account');
        }
        continue;
      }

      if (currentIndirectExpenseGroup) {
        const indSubGroupNames = [
          'Commercial Expenses(Export)', 'Commission (Ad. & Sel.)',
          'Communication Expenses (Ad. & Sel.)', 'Fees & Renewal (Ad. & Sel.)',
          'Finance Expenses', 'Fuel & Lubricants (Ad. & Sel.)',
          'Income Tax', 'Others (Ad. & Sel.)', 'Selling & Distribution – Others',
          'Personal & Office (Ad. & Sel.)', 'Rent, Rates & Taxes (Ad. & Sel.)',
          'Repair & Maintenance (Ad. & Sel.)', 'Salary (Ad. & Sel.)',
          'Bank Interest',
        ];
        const normalizedIndSubNames = indSubGroupNames.map(n => normalizeName(n));

        if (normalizedIndSubNames.includes(r.name) || indSubGroupNames.includes(r.originalName)) {
          let parentId: number;
          if (r.name === 'Bank Interest' || r.originalName === 'Bank Interest') {
            parentId = groupNameMap.get('Finance Expenses') || groupNameMap.get('Administrative Expenses')!;
          } else {
            parentId = groupNameMap.get('Administrative Expenses')!;
          }
          const subCode = r.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25).toUpperCase();
          const [sg] = await tx.insert(accountGroups).values({
            tenantId: TENANT_ID, name: r.name, code: `IND_${subCode}`, nature: 'Expense',
            affectsGrossProfit: false, isDefault: false, sortOrder: groupCount + 1, parentGroupId: parentId,
          }).returning();
          groupCount++;
          groupNameMap.set(r.name, sg.id);
          currentSubExpGroup = r.name;
          KNOWN_GROUPS.add(i);
          continue;
        }

        if (currentSubExpGroup && groupNameMap.has(currentSubExpGroup)) {
          allLedgerRows.add(i);
          await createLedgersForSubgroup(groupNameMap.get(currentSubExpGroup)!, 'Expense', [i], `Indirect Expenses > ${currentSubExpGroup}`);
          continue;
        }

        const adminGroupId = groupNameMap.get('Administrative Expenses');
        if (adminGroupId) {
          allLedgerRows.add(i);
          await createLedgersForSubgroup(adminGroupId, 'Expense', [i], 'Indirect Expenses > Administrative Expenses');
        }
        continue;
      }
    }

    const forexRow = rows.find(r => r.originalName === 'Forex Gain/Loss');
    if (forexRow) {
      const finExpId = groupNameMap.get('Finance Expenses') || groupNameMap.get('Administrative Expenses');
      if (finExpId) {
        allLedgerRows.add(forexRow.idx);
        await createLedgersForSubgroup(finExpId, 'Expense', [forexRow.idx], 'Indirect Expenses > Finance Expenses');
      }
    }

    const ebrParentId = groupNameMap.get('Export Bill Receivable');
    if (ebrParentId) {
      for (let i = 289; i < 370; i++) {
        const r = rowByIdx.get(i);
        if (!r) continue;
        if (allLedgerRows.has(i) || KNOWN_GROUPS.has(i)) continue;

        const isSubBuyer = ['BGS','CHERRY FIELD','CRU','GAS','GDS','Having International','PACE MARK','SCANWEAR','TGL'].includes(r.originalName);

        if (isSubBuyer) {
          const buyerCode = r.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20).toUpperCase();
          if (!groupNameMap.has(r.name)) {
            const [sg] = await tx.insert(accountGroups).values({
              tenantId: TENANT_ID, name: r.name, code: `EBR_${buyerCode}`, nature: 'Asset',
              affectsGrossProfit: false, isDefault: false, sortOrder: groupCount + 1, parentGroupId: ebrParentId,
            }).returning();
            groupCount++;
            groupNameMap.set(r.name, sg.id);
          }
          KNOWN_GROUPS.add(i);
        } else {
          let parentBuyerId = ebrParentId;
          for (let j = i - 1; j >= 289; j--) {
            const prev = rowByIdx.get(j);
            if (prev && KNOWN_GROUPS.has(j) && groupNameMap.has(prev.name)) {
              parentBuyerId = groupNameMap.get(prev.name)!;
              break;
            }
          }
          allLedgerRows.add(i);
          await createLedgersForSubgroup(parentBuyerId, 'Asset', [i], 'Current Assets > Export Bill Receivable');
        }
      }
    }

    for (let i = 370; i < rawData.length; i++) {
      const r = rowByIdx.get(i);
      if (!r) continue;
      if (allLedgerRows.has(i) || KNOWN_GROUPS.has(i)) continue;
      if (r.originalName === 'Grand Total' || r.originalName === 'Forex Gain/Loss' || r.originalName === "Profit & Loss A/c") continue;
    }

    const [{ cnt: finalLedgerCount }] = await tx.select({ cnt: count() }).from(chartOfAccounts).where(eq(chartOfAccounts.tenantId, TENANT_ID));
    const [{ cnt: finalGroupCount }] = await tx.select({ cnt: count() }).from(accountGroups).where(eq(accountGroups.tenantId, TENANT_ID));

    console.log(`\n${'='.repeat(70)}`);
    console.log(`IMPORT COMPLETE`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Groups created: ${finalGroupCount}`);
    console.log(`Ledgers created: ${finalLedgerCount}`);
    console.log(`Opening balances set: ${obSetCount}`);
    console.log(`Name corrections: ${nameCorrections.length}`);
    console.log(`Backup: ${backupPath}`);
    console.log(`${'='.repeat(70)}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
