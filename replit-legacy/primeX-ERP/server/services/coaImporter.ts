import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../db';
import { accountGroups, chartOfAccounts, accountTypes, ledgerOpeningBalances, voucherItems, ledgerPostings, journalLines, postingProfileLines } from '@shared/schema';
import { eq, and, sql, count } from 'drizzle-orm';

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
};

export function normalizeName(raw: string): { normalized: string; original: string; wasChanged: boolean } {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  const corrected = NAME_CORRECTIONS[trimmed];
  if (corrected) {
    return { normalized: corrected, original: trimmed, wasChanged: true };
  }
  const cleaned = trimmed
    .replace(/\s*-\s*/g, ' – ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (cleaned !== trimmed) {
    return { normalized: cleaned, original: trimmed, wasChanged: true };
  }
  return { normalized: trimmed, original: trimmed, wasChanged: false };
}

interface COAOpeningRow {
  TopGroup: string;
  SubGroup: string;
  Ledger: string;
  Opening_Dr: number;
  Opening_Cr: number;
}

interface GroupSummaryRow {
  TopGroup: string;
  SubGroup: string;
  Opening_Dr: number;
  Opening_Cr: number;
}

interface NameCorrection {
  original: string;
  normalized: string;
  type: 'topgroup' | 'subgroup' | 'ledger';
}

export interface ImportResult {
  success: boolean;
  dryRun: boolean;
  backup?: { path: string; groupCount: number; ledgerCount: number };
  deleted?: { groups: number; ledgers: number; openingBalances: number };
  created?: { groups: number; ledgers: number; openingBalancesSet: number };
  totals?: { totalDr: number; totalCr: number; difference: number };
  nameCorrections: NameCorrection[];
  validationErrors: string[];
  groupMismatches: Array<{ topGroup: string; subGroup: string; expected: { dr: number; cr: number }; actual: { dr: number; cr: number }; diff: { dr: number; cr: number } }>;
  summary: string;
}

function parseExcelFile(filePath: string): { openings: COAOpeningRow[]; groupSummary: GroupSummaryRow[] } {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }
  const workbook = XLSX.readFile(filePath);

  const sheet1Name = workbook.SheetNames[0];
  if (!sheet1Name) throw new Error('No sheets found in Excel file');
  const sheet1 = workbook.Sheets[sheet1Name];
  const rawOpenings: any[] = XLSX.utils.sheet_to_json(sheet1);

  const openings: COAOpeningRow[] = rawOpenings.map((row, idx) => {
    const topGroup = String(row['TopGroup'] || row['Top Group'] || row['topgroup'] || '').trim();
    const subGroup = String(row['SubGroup'] || row['Sub Group'] || row['subgroup'] || '').trim();
    const ledger = String(row['Ledger'] || row['ledger'] || '').trim();
    const openingDr = parseFloat(row['Opening_Dr'] || row['Opening Dr'] || row['opening_dr'] || 0) || 0;
    const openingCr = parseFloat(row['Opening_Cr'] || row['Opening Cr'] || row['opening_cr'] || 0) || 0;

    if (!topGroup || !subGroup || !ledger) {
      throw new Error(`Row ${idx + 2} in COA_Openings is missing required fields (TopGroup=${topGroup}, SubGroup=${subGroup}, Ledger=${ledger})`);
    }

    return { TopGroup: topGroup, SubGroup: subGroup, Ledger: ledger, Opening_Dr: openingDr, Opening_Cr: openingCr };
  });

  let groupSummary: GroupSummaryRow[] = [];
  if (workbook.SheetNames.length >= 2) {
    const sheet2Name = workbook.SheetNames[1];
    const sheet2 = workbook.Sheets[sheet2Name];
    const rawSummary: any[] = XLSX.utils.sheet_to_json(sheet2);
    groupSummary = rawSummary.map((row) => ({
      TopGroup: String(row['TopGroup'] || row['Top Group'] || row['topgroup'] || '').trim(),
      SubGroup: String(row['SubGroup'] || row['Sub Group'] || row['subgroup'] || '').trim(),
      Opening_Dr: parseFloat(row['Opening_Dr'] || row['Opening Dr'] || row['opening_dr'] || 0) || 0,
      Opening_Cr: parseFloat(row['Opening_Cr'] || row['Opening Cr'] || row['opening_cr'] || 0) || 0,
    }));
  }

  return { openings, groupSummary };
}

function getNatureForTopGroup(topGroup: string): string {
  const normalized = topGroup.toLowerCase();
  if (normalized.includes('asset') || normalized.includes('fixed asset') || normalized.includes('current asset') || normalized.includes('investment') || normalized.includes('cash') || normalized.includes('bank') || normalized.includes('stock') || normalized.includes('deposit') || normalized.includes('loan') && normalized.includes('advance')) return 'Asset';
  if (normalized.includes('liability') || normalized.includes('creditor') || normalized.includes('provision') || normalized.includes('payable') || normalized.includes('duty') || normalized.includes('tax')) return 'Liability';
  if (normalized.includes('equity') || normalized.includes('capital') || normalized.includes('reserve') || normalized.includes('surplus') || normalized.includes('retained')) return 'Equity';
  if (normalized.includes('income') || normalized.includes('revenue') || normalized.includes('sales') || normalized.includes('earning')) return 'Income';
  if (normalized.includes('expense') || normalized.includes('cost') || normalized.includes('purchase') || normalized.includes('depreciation') || normalized.includes('amortization') || normalized.includes('manufacturing')) return 'Expense';
  if (normalized.includes('direct income')) return 'Income';
  if (normalized.includes('direct expense')) return 'Expense';
  if (normalized.includes('indirect income')) return 'Income';
  if (normalized.includes('indirect expense')) return 'Expense';
  return 'Asset';
}

function getNormalBalance(nature: string): string {
  if (nature === 'Asset' || nature === 'Expense') return 'debit';
  return 'credit';
}

function generateGroupCode(name: string, parentCode?: string): string {
  const base = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .substring(0, 25);
  return parentCode ? `${parentCode}_${base}`.substring(0, 30) : base.substring(0, 30);
}

function generateAccountNumber(groupCode: string, index: number): string {
  const prefix = groupCode.substring(0, 4).toUpperCase();
  return `${prefix}-${String(index).padStart(4, '0')}`;
}

export async function importCOAFromExcel(
  tenantId: number,
  filePath: string,
  cutoverDate: string,
  dryRun: boolean
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    dryRun,
    nameCorrections: [],
    validationErrors: [],
    groupMismatches: [],
    summary: '',
  };

  const { openings, groupSummary } = parseExcelFile(filePath);

  if (openings.length === 0) {
    result.validationErrors.push('No data rows found in COA_Openings sheet');
    result.summary = 'Import failed: no data found';
    return result;
  }

  const normalizedOpenings = openings.map((row) => {
    const tg = normalizeName(row.TopGroup);
    const sg = normalizeName(row.SubGroup);
    const lg = normalizeName(row.Ledger);

    if (tg.wasChanged) result.nameCorrections.push({ original: tg.original, normalized: tg.normalized, type: 'topgroup' });
    if (sg.wasChanged) result.nameCorrections.push({ original: sg.original, normalized: sg.normalized, type: 'subgroup' });
    if (lg.wasChanged) result.nameCorrections.push({ original: lg.original, normalized: lg.normalized, type: 'ledger' });

    return {
      topGroup: tg.normalized,
      subGroup: sg.normalized,
      ledger: lg.normalized,
      legacyName: lg.wasChanged ? lg.original : null,
      openingDr: row.Opening_Dr,
      openingCr: row.Opening_Cr,
    };
  });

  const uniqueCorrections = new Map<string, NameCorrection>();
  for (const c of result.nameCorrections) {
    uniqueCorrections.set(`${c.type}:${c.original}`, c);
  }
  result.nameCorrections = Array.from(uniqueCorrections.values());

  let totalDr = 0;
  let totalCr = 0;
  for (const row of normalizedOpenings) {
    totalDr += row.openingDr;
    totalCr += row.openingCr;
  }
  const totalDiff = Math.abs(totalDr - totalCr);
  result.totals = { totalDr, totalCr, difference: totalDiff };

  if (totalDiff > 0.01) {
    result.validationErrors.push(
      `Total Dr (${totalDr.toFixed(2)}) != Total Cr (${totalCr.toFixed(2)}). Difference: ${totalDiff.toFixed(2)}. Import blocked.`
    );
  }

  if (groupSummary.length > 0) {
    const ledgerSums = new Map<string, { dr: number; cr: number }>();
    for (const row of normalizedOpenings) {
      const key = `${row.topGroup}||${row.subGroup}`;
      const existing = ledgerSums.get(key) || { dr: 0, cr: 0 };
      existing.dr += row.openingDr;
      existing.cr += row.openingCr;
      ledgerSums.set(key, existing);
    }

    for (const gs of groupSummary) {
      const gsTopNorm = normalizeName(gs.TopGroup).normalized;
      const gsSubNorm = normalizeName(gs.SubGroup).normalized;
      const key = `${gsTopNorm}||${gsSubNorm}`;
      const actual = ledgerSums.get(key) || { dr: 0, cr: 0 };
      const drDiff = Math.abs(gs.Opening_Dr - actual.dr);
      const crDiff = Math.abs(gs.Opening_Cr - actual.cr);

      if (drDiff > 0.01 || crDiff > 0.01) {
        result.groupMismatches.push({
          topGroup: gsTopNorm,
          subGroup: gsSubNorm,
          expected: { dr: gs.Opening_Dr, cr: gs.Opening_Cr },
          actual: { dr: actual.dr, cr: actual.cr },
          diff: { dr: drDiff, cr: crDiff },
        });
      }
    }

    if (result.groupMismatches.length > 0) {
      result.validationErrors.push(
        `${result.groupMismatches.length} group(s) have mismatched totals between ledger sums and Group_Summary sheet. Import blocked.`
      );
    }
  }

  if (result.validationErrors.length > 0) {
    result.summary = `Validation failed with ${result.validationErrors.length} error(s). Import blocked.`;
    return result;
  }

  const topGroups = Array.from(new Set(normalizedOpenings.map((r) => r.topGroup)));
  const subGroupsByTop = new Map<string, string[]>();
  for (const row of normalizedOpenings) {
    if (!subGroupsByTop.has(row.topGroup)) subGroupsByTop.set(row.topGroup, []);
    const arr = subGroupsByTop.get(row.topGroup)!;
    if (!arr.includes(row.subGroup)) arr.push(row.subGroup);
  }

  const totalGroupsToCreate = topGroups.length + Array.from(subGroupsByTop.values()).reduce((sum, s) => sum + s.length, 0);
  const totalLedgersToCreate = normalizedOpenings.length;

  if (dryRun) {
    const existingGroups = await db.select({ cnt: count() }).from(accountGroups).where(eq(accountGroups.tenantId, tenantId));
    const existingLedgers = await db.select({ cnt: count() }).from(chartOfAccounts).where(eq(chartOfAccounts.tenantId, tenantId));
    const existingOB = await db.select({ cnt: count() }).from(ledgerOpeningBalances).where(eq(ledgerOpeningBalances.tenantId, tenantId));

    result.deleted = {
      groups: existingGroups[0].cnt,
      ledgers: existingLedgers[0].cnt,
      openingBalances: existingOB[0].cnt,
    };
    result.created = {
      groups: totalGroupsToCreate,
      ledgers: totalLedgersToCreate,
      openingBalancesSet: normalizedOpenings.filter((r) => r.openingDr > 0 || r.openingCr > 0).length,
    };
    result.success = true;
    result.summary = `DRY RUN: Would delete ${result.deleted.groups} groups, ${result.deleted.ledgers} ledgers, ${result.deleted.openingBalances} opening balances. Would create ${totalGroupsToCreate} groups, ${totalLedgersToCreate} ledgers. Total Dr: ${totalDr.toFixed(2)}, Total Cr: ${totalCr.toFixed(2)}.`;
    return result;
  }

  return await db.transaction(async (tx) => {
    const existingGroups = await tx.select().from(accountGroups).where(eq(accountGroups.tenantId, tenantId));
    const existingLedgers = await tx.select().from(chartOfAccounts).where(eq(chartOfAccounts.tenantId, tenantId));
    const existingOB = await tx.select().from(ledgerOpeningBalances).where(eq(ledgerOpeningBalances.tenantId, tenantId));

    let hasTransactions = false;
    const blockingDetails: string[] = [];
    for (const ledger of existingLedgers) {
      const [viCount] = await tx.select({ cnt: count() }).from(voucherItems).where(and(eq(voucherItems.accountId, ledger.id), eq(voucherItems.tenantId, tenantId)));
      if (viCount.cnt > 0) {
        hasTransactions = true;
        blockingDetails.push(`Ledger "${ledger.name}" (id=${ledger.id}) has ${viCount.cnt} voucher items`);
      }
      const [lpCount] = await tx.select({ cnt: count() }).from(ledgerPostings).where(and(eq(ledgerPostings.accountId, ledger.id), eq(ledgerPostings.tenantId, tenantId)));
      if (lpCount.cnt > 0) {
        hasTransactions = true;
        blockingDetails.push(`Ledger "${ledger.name}" (id=${ledger.id}) has ${lpCount.cnt} ledger postings`);
      }
      const [jlCount] = await tx.select({ cnt: count() }).from(journalLines).where(and(eq(journalLines.accountId, ledger.id), eq(journalLines.tenantId, tenantId)));
      if (jlCount.cnt > 0) {
        hasTransactions = true;
        blockingDetails.push(`Ledger "${ledger.name}" (id=${ledger.id}) has ${jlCount.cnt} journal lines`);
      }

      if (blockingDetails.length >= 10) break;
    }

    if (hasTransactions) {
      result.validationErrors.push(
        `Cannot reset COA: existing ledgers have transactions. This command is for first-time setup or fresh tenants only.`
      );
      for (const detail of blockingDetails) {
        result.validationErrors.push(`  - ${detail}`);
      }
      result.summary = 'Import blocked: existing transactions found. Cannot delete COA with active transactions.';
      return result;
    }

    const backupDir = path.join(process.cwd(), 'server', 'backups', 'coa', String(tenantId));
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${timestamp}_coa_backup.json`);
    const backupData = {
      tenantId,
      timestamp: new Date().toISOString(),
      groups: existingGroups,
      ledgers: existingLedgers,
      openingBalances: existingOB,
    };
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));

    result.backup = {
      path: backupPath,
      groupCount: existingGroups.length,
      ledgerCount: existingLedgers.length,
    };

    if (existingOB.length > 0) {
      await tx.delete(ledgerOpeningBalances).where(eq(ledgerOpeningBalances.tenantId, tenantId));
    }

    const [ppCount] = await tx.select({ cnt: count() }).from(postingProfileLines).where(eq(postingProfileLines.tenantId, tenantId));
    if (ppCount.cnt > 0) {
      await tx.delete(postingProfileLines).where(eq(postingProfileLines.tenantId, tenantId));
    }

    if (existingLedgers.length > 0) {
      await tx.update(chartOfAccounts).set({ parentAccountId: null }).where(eq(chartOfAccounts.tenantId, tenantId));
      await tx.delete(chartOfAccounts).where(eq(chartOfAccounts.tenantId, tenantId));
    }

    if (existingGroups.length > 0) {
      await tx.update(accountGroups).set({ parentGroupId: null }).where(eq(accountGroups.tenantId, tenantId));
      await tx.delete(accountGroups).where(eq(accountGroups.tenantId, tenantId));
    }

    result.deleted = {
      groups: existingGroups.length,
      ledgers: existingLedgers.length,
      openingBalances: existingOB.length,
    };

    let existingAccountTypes = await tx.select().from(accountTypes).where(eq(accountTypes.tenantId, tenantId));
    if (existingAccountTypes.length === 0) {
      const defaultTypes = [
        { name: 'Asset', code: 'ASSET', category: 'Asset', normalBalance: 'debit', sortOrder: 1 },
        { name: 'Liability', code: 'LIABILITY', category: 'Liability', normalBalance: 'credit', sortOrder: 2 },
        { name: 'Equity', code: 'EQUITY', category: 'Equity', normalBalance: 'credit', sortOrder: 3 },
        { name: 'Income', code: 'INCOME', category: 'Income', normalBalance: 'credit', sortOrder: 4 },
        { name: 'Expense', code: 'EXPENSE', category: 'Expense', normalBalance: 'debit', sortOrder: 5 },
      ];
      existingAccountTypes = await tx.insert(accountTypes).values(
        defaultTypes.map((t) => ({ tenantId, ...t }))
      ).returning();
    }
    const accountTypeMap = new Map<string, number>();
    for (const at of existingAccountTypes) {
      accountTypeMap.set(at.category, at.id);
    }

    const topGroupMap = new Map<string, number>();
    let groupSortOrder = 1;

    for (const tgName of topGroups) {
      const nature = getNatureForTopGroup(tgName);
      const code = generateGroupCode(tgName);
      const [created] = await tx.insert(accountGroups).values({
        tenantId,
        name: tgName,
        code,
        nature,
        affectsGrossProfit: tgName.toLowerCase().includes('direct'),
        isDefault: false,
        sortOrder: groupSortOrder++,
        parentGroupId: null,
      }).returning();
      topGroupMap.set(tgName, created.id);
    }

    const subGroupMap = new Map<string, number>();
    const entries = Array.from(subGroupsByTop.entries());
    for (const [topGroupName, subGroups] of entries) {
      const parentId = topGroupMap.get(topGroupName)!;
      const nature = getNatureForTopGroup(topGroupName);
      for (const sgName of subGroups) {
        const isControl = sgName.endsWith('(Control)');
        const parentCode = generateGroupCode(topGroupName);
        const code = generateGroupCode(sgName, parentCode);
        const [created] = await tx.insert(accountGroups).values({
          tenantId,
          name: sgName,
          code,
          nature,
          affectsGrossProfit: topGroupName.toLowerCase().includes('direct'),
          isDefault: false,
          sortOrder: groupSortOrder++,
          parentGroupId: parentId,
        }).returning();
        subGroupMap.set(`${topGroupName}||${sgName}`, created.id);
      }
    }

    let ledgersCreated = 0;
    let obCount = 0;
    const ledgerCountPerGroup = new Map<string, number>();

    for (const row of normalizedOpenings) {
      const groupKey = `${row.topGroup}||${row.subGroup}`;
      const groupId = subGroupMap.get(groupKey);
      if (!groupId) {
        result.validationErrors.push(`SubGroup not found for ledger "${row.ledger}" (TopGroup=${row.topGroup}, SubGroup=${row.subGroup})`);
        continue;
      }

      const nature = getNatureForTopGroup(row.topGroup);
      const atId = accountTypeMap.get(nature) || accountTypeMap.get('Asset')!;

      const idx = (ledgerCountPerGroup.get(groupKey) || 0) + 1;
      ledgerCountPerGroup.set(groupKey, idx);
      const accountNumber = generateAccountNumber(generateGroupCode(row.subGroup), idx);

      const openingBal = row.openingDr > 0 ? String(row.openingDr) : row.openingCr > 0 ? String(-row.openingCr) : '0';

      const isControl = row.subGroup.endsWith('(Control)');

      const [ledger] = await tx.insert(chartOfAccounts).values({
        tenantId,
        accountTypeId: atId,
        groupId,
        accountNumber,
        name: row.ledger,
        description: row.legacyName ? `Legacy name: ${row.legacyName}` : null,
        isActive: true,
        path: `${row.topGroup} > ${row.subGroup} > ${row.ledger}`,
        level: 3,
        allowJournalEntries: !isControl,
        normalBalance: getNormalBalance(nature),
        balance: '0',
        openingBalance: openingBal,
        isMaterialSupplier: false,
      }).returning();

      ledgersCreated++;

      if (row.openingDr > 0 || row.openingCr > 0) {
        obCount++;
      }
    }

    result.created = {
      groups: topGroupMap.size + subGroupMap.size,
      ledgers: ledgersCreated,
      openingBalancesSet: obCount,
    };

    if (result.validationErrors.length > 0) {
      throw new Error(`Import completed with errors: ${result.validationErrors.join('; ')}`);
    }

    result.success = true;
    result.summary = `COMMITTED: Deleted ${result.deleted.groups} groups, ${result.deleted.ledgers} ledgers, ${result.deleted.openingBalances} opening balances. Created ${result.created.groups} groups, ${result.created.ledgers} ledgers, set ${result.created.openingBalancesSet} opening balances. Total Dr: ${totalDr.toFixed(2)}, Total Cr: ${totalCr.toFixed(2)}. Backup saved to: ${backupPath}`;

    return result;
  });
}
