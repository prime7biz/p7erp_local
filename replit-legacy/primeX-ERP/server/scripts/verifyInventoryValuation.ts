import { db } from '../db';
import {
  stockLedger, items, itemCategories, itemUnits, warehouses,
  tenants, tenantInventoryConfig, chartOfAccounts, accountGroups, accountTypes,
  vouchers, voucherTypes, voucherItems, ledgerPostings, fiscalYears, voucherStatus
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getInventoryValuation, calculateCOGS, getPendingPostingCount, validatePeriodClose, VALUATION_METHOD } from '../inventory/valuation/rules';
import { markStockEntryPosted, validateStockEntryImmutable, reverseStockEntry } from '../services/stockLedgerService';

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
  console.log(`${BOLD}${CYAN}  Phase 3.3 Inventory Valuation ↔ Accounting Reconciliation${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  const testPrefix = `_IVTEST_${Date.now().toString(36).slice(-6)}`;
  const testDate = '2025-06-15';

  const tenantResult = await db.execute(sql`
    SELECT DISTINCT t.id AS tenant_id FROM tenants t
    WHERE EXISTS (SELECT 1 FROM item_categories ic WHERE ic.tenant_id = t.id)
      AND EXISTS (SELECT 1 FROM item_units iu WHERE iu.tenant_id = t.id)
      AND EXISTS (SELECT 1 FROM account_groups ag WHERE ag.tenant_id = t.id AND ag.nature = 'Asset')
      AND EXISTS (SELECT 1 FROM voucher_types vt WHERE vt.tenant_id = t.id)
      AND EXISTS (SELECT 1 FROM fiscal_years fy WHERE fy.tenant_id = t.id)
    LIMIT 1
  `);
  const tenantRows = (tenantResult as any).rows || tenantResult;
  if (!tenantRows[0]) throw new Error('No suitable tenant found with items, categories, units, account groups, voucher types, and fiscal years');
  const tenantId = (tenantRows[0] as any).tenant_id;
  console.log(`${YELLOW}Using tenant ID: ${tenantId}${RESET}`);
  console.log(`${YELLOW}Test prefix: ${testPrefix}${RESET}\n`);

  const [category] = await db.select().from(itemCategories).where(eq(itemCategories.tenantId, tenantId)).limit(1);
  const [unit] = await db.select().from(itemUnits).where(eq(itemUnits.tenantId, tenantId)).limit(1);
  const assetGroup = await db.select().from(accountGroups)
    .where(and(eq(accountGroups.tenantId, tenantId), eq(accountGroups.nature, 'Asset'))).limit(1);
  const [accountType] = await db.select().from(accountTypes).where(eq(accountTypes.tenantId, tenantId)).limit(1);
  const [voucherType] = await db.select().from(voucherTypes).where(eq(voucherTypes.tenantId, tenantId)).limit(1);
  const [fiscalYear] = await db.select().from(fiscalYears).where(eq(fiscalYears.tenantId, tenantId)).limit(1);
  const [status] = await db.select().from(voucherStatus).where(eq(voucherStatus.tenantId, tenantId)).limit(1);

  const userResult = await db.execute(sql`SELECT id FROM users WHERE tenant_id = ${tenantId} LIMIT 1`);
  const userRows = (userResult as any).rows || userResult;
  const userId = (userRows[0] as any)?.id || 1;

  if (!category || !unit || !assetGroup[0] || !accountType || !voucherType || !fiscalYear || !status) {
    console.log(`${RED}Cannot run tests - missing prerequisites${RESET}`);
    console.log(`  category: ${!!category}, unit: ${!!unit}, assetGroup: ${!!assetGroup[0]}, accountType: ${!!accountType}, voucherType: ${!!voucherType}, fiscalYear: ${!!fiscalYear}, status: ${!!status}`);
    process.exit(1);
  }

  const createdIds: {
    items: number[]; warehouses: number[]; stockLedger: number[];
    accounts: number[]; vouchers: number[]; voucherItems: number[];
    postings: number[]; configs: number[];
  } = {
    items: [], warehouses: [], stockLedger: [],
    accounts: [], vouchers: [], voucherItems: [],
    postings: [], configs: [],
  };

  let existingConfigBackup: any = null;

  try {
    console.log(`${BOLD}Setup: Creating test item and warehouse${RESET}`);

    const [testItem] = await db.insert(items).values({
      itemCode: `${testPrefix}-ITEM`,
      name: `Test Item ${testPrefix}`,
      categoryId: category.id,
      unitId: unit.id,
      type: 'standard',
      tenantId,
      isActive: true,
      costMethod: 'average',
    }).returning();
    createdIds.items.push(testItem.id);

    let [testWarehouse] = await db.select().from(warehouses).where(eq(warehouses.tenantId, tenantId)).limit(1);
    if (!testWarehouse) {
      [testWarehouse] = await db.insert(warehouses).values({
        warehouseId: `${testPrefix}-WH`,
        name: `Test Warehouse ${testPrefix}`,
        tenantId,
        type: 'company',
        location: 'Test Location',
        isActive: true,
      }).returning();
      createdIds.warehouses.push(testWarehouse.id);
    }

    pass(`Created test item (id=${testItem.id}) and using warehouse (id=${testWarehouse.id})`);

    // ── Test 1: Stock Ledger Entries ──
    console.log(`\n${BOLD}Test 1: Stock Ledger Entries (GRN + Issue)${RESET}`);

    const [grnEntry] = await db.insert(stockLedger).values({
      docType: 'GRN',
      docId: 99999,
      docNumber: `${testPrefix}-GRN001`,
      postingDate: testDate,
      itemId: testItem.id,
      itemCode: testItem.itemCode,
      itemName: testItem.name,
      warehouseId: testWarehouse.id,
      warehouseName: testWarehouse.name,
      qtyIn: '100',
      qtyOut: '0',
      balanceQty: '100',
      rate: '10',
      valuationRate: '10',
      valueIn: '1000',
      valueOut: '0',
      balanceValue: '1000',
      unit: unit.name || 'PCS',
      remarks: `Test GRN ${testPrefix}`,
      isReversed: false,
      postingStatus: 'PENDING_POSTING',
      tenantId,
      createdBy: userId,
    }).returning();
    createdIds.stockLedger.push(grnEntry.id);

    const [issueEntry] = await db.insert(stockLedger).values({
      docType: 'STOCK_ISSUE',
      docId: 99998,
      docNumber: `${testPrefix}-ISS001`,
      postingDate: testDate,
      itemId: testItem.id,
      itemCode: testItem.itemCode,
      itemName: testItem.name,
      warehouseId: testWarehouse.id,
      warehouseName: testWarehouse.name,
      qtyIn: '0',
      qtyOut: '40',
      balanceQty: '60',
      rate: '10',
      valuationRate: '10',
      valueIn: '0',
      valueOut: '400',
      balanceValue: '600',
      unit: unit.name || 'PCS',
      remarks: `Test Issue ${testPrefix}`,
      isReversed: false,
      postingStatus: 'PENDING_POSTING',
      tenantId,
      createdBy: userId,
    }).returning();
    createdIds.stockLedger.push(issueEntry.id);

    if (grnEntry.id && issueEntry.id) {
      pass(`GRN entry (id=${grnEntry.id}): 100 units @ BDT 10 = BDT 1000`);
      pass(`Issue entry (id=${issueEntry.id}): 40 units out @ BDT 10 = BDT 400`);
    } else {
      fail('Stock ledger entries', 'Failed to create entries');
    }

    // ── Test 2: Valuation AsOf ──
    console.log(`\n${BOLD}Test 2: Valuation AsOf${RESET}`);

    const valuation = await getInventoryValuation(tenantId, testDate);
    const testItemVal = valuation.items.find(i => i.itemId === testItem.id);

    if (testItemVal) {
      if (testItemVal.qtyOnHand === 60) {
        pass(`Valuation qtyOnHand = ${testItemVal.qtyOnHand} (expected 60)`);
      } else {
        fail('Valuation qtyOnHand', `Expected 60, got ${testItemVal.qtyOnHand}`);
      }
      if (testItemVal.totalValue === 600) {
        pass(`Valuation totalValue = ${testItemVal.totalValue} (expected 600)`);
      } else {
        fail('Valuation totalValue', `Expected 600, got ${testItemVal.totalValue}`);
      }
      if (testItemVal.avgCost === 10) {
        pass(`Valuation avgCost = ${testItemVal.avgCost} (expected 10)`);
      } else {
        fail('Valuation avgCost', `Expected 10, got ${testItemVal.avgCost}`);
      }
    } else {
      fail('Valuation AsOf', 'Test item not found in valuation results');
    }

    // ── Test 3: COGS Calculation ──
    console.log(`\n${BOLD}Test 3: COGS Calculation${RESET}`);

    const cogs = await calculateCOGS(tenantId, '2025-01-01', '2025-12-31');
    const testItemCOGS = cogs.items.find(i => i.itemId === testItem.id);

    if (testItemCOGS) {
      if (testItemCOGS.qtyConsumed === 40) {
        pass(`COGS qtyConsumed = ${testItemCOGS.qtyConsumed} (expected 40)`);
      } else {
        fail('COGS qtyConsumed', `Expected 40, got ${testItemCOGS.qtyConsumed}`);
      }
      if (testItemCOGS.totalCost === 400) {
        pass(`COGS totalCost = ${testItemCOGS.totalCost} (expected 400)`);
      } else {
        fail('COGS totalCost', `Expected 400, got ${testItemCOGS.totalCost}`);
      }
    } else {
      fail('COGS Calculation', 'Test item not found in COGS results');
    }

    // ── Test 4: Pending Posting Count ──
    console.log(`\n${BOLD}Test 4: Pending Posting Count${RESET}`);

    const pendingCount = await getPendingPostingCount(tenantId);
    if (pendingCount >= 2) {
      pass(`Pending posting count = ${pendingCount} (>= 2 expected)`);
    } else {
      fail('Pending posting count', `Expected >= 2, got ${pendingCount}`);
    }

    // ── Test 5: Period Close Validation ──
    console.log(`\n${BOLD}Test 5: Period Close Validation${RESET}`);

    const periodClose = validatePeriodClose(pendingCount);
    if (periodClose.canClose === false) {
      pass(`Period close blocked: canClose=${periodClose.canClose}`);
    } else {
      fail('Period close validation', `Expected canClose=false, got canClose=${periodClose.canClose}`);
    }

    // ── Test 6: Mark Entry as POSTED ──
    console.log(`\n${BOLD}Test 6: Mark Entry as POSTED${RESET}`);

    const [dummyVoucher] = await db.insert(vouchers).values({
      tenantId,
      voucherNumber: `${testPrefix}-V001`,
      voucherTypeId: voucherType.id,
      voucherDate: testDate,
      fiscalYearId: fiscalYear.id,
      statusId: status.id,
      amount: '1000',
      isPosted: true,
      workflowStatus: 'POSTED',
      preparedById: userId,
      postedDate: new Date(),
    }).returning();
    createdIds.vouchers.push(dummyVoucher.id);

    await markStockEntryPosted(grnEntry.id, dummyVoucher.id, tenantId);

    const [updatedGrn] = await db.select({ postingStatus: stockLedger.postingStatus })
      .from(stockLedger).where(eq(stockLedger.id, grnEntry.id));

    if (updatedGrn?.postingStatus === 'POSTED') {
      pass(`GRN entry marked as POSTED (voucherId=${dummyVoucher.id})`);
    } else {
      fail('Mark entry POSTED', `Expected POSTED, got ${updatedGrn?.postingStatus}`);
    }

    // ── Test 7: Immutability Check ──
    console.log(`\n${BOLD}Test 7: Immutability Check${RESET}`);

    const grnImmutable = await validateStockEntryImmutable(grnEntry.id, tenantId);
    if (grnImmutable === true) {
      pass('GRN entry is immutable (POSTED)');
    } else {
      fail('GRN immutability', `Expected true, got ${grnImmutable}`);
    }

    const issueImmutable = await validateStockEntryImmutable(issueEntry.id, tenantId);
    if (issueImmutable === false) {
      pass('Issue entry is mutable (PENDING_POSTING)');
    } else {
      fail('Issue mutability', `Expected false, got ${issueImmutable}`);
    }

    // ── Test 8: Reconciliation Setup ──
    console.log(`\n${BOLD}Test 8: Reconciliation Setup${RESET}`);

    const [invAssetAcct] = await db.insert(chartOfAccounts).values({
      tenantId,
      accountTypeId: accountType.id,
      groupId: assetGroup[0].id,
      accountNumber: `${testPrefix}-INVAS`,
      name: `Inventory Asset ${testPrefix}`,
      path: 'Asset > Inventory',
      level: 2,
      isActive: true,
      normalBalance: 'debit',
    }).returning();
    createdIds.accounts.push(invAssetAcct.id);

    const [existingConfig] = await db.select().from(tenantInventoryConfig)
      .where(eq(tenantInventoryConfig.tenantId, tenantId)).limit(1);

    let configId: number;
    if (existingConfig) {
      existingConfigBackup = { ...existingConfig };
      configId = existingConfig.id;
      await db.update(tenantInventoryConfig)
        .set({ inventoryAssetAccountId: invAssetAcct.id })
        .where(eq(tenantInventoryConfig.id, existingConfig.id));
    } else {
      const [config] = await db.insert(tenantInventoryConfig).values({
        tenantId,
        inventoryAssetAccountId: invAssetAcct.id,
        valuationMethod: 'WEIGHTED_AVERAGE',
        allowNegativeStock: false,
      }).returning();
      configId = config.id;
      createdIds.configs.push(config.id);
    }

    const [reconVoucher] = await db.insert(vouchers).values({
      tenantId,
      voucherNumber: `${testPrefix}-V002`,
      voucherTypeId: voucherType.id,
      voucherDate: testDate,
      fiscalYearId: fiscalYear.id,
      statusId: status.id,
      amount: '600',
      isPosted: true,
      workflowStatus: 'POSTED',
      preparedById: userId,
      postedDate: new Date(),
    }).returning();
    createdIds.vouchers.push(reconVoucher.id);

    const [vi1] = await db.insert(voucherItems).values({
      voucherId: reconVoucher.id,
      lineNumber: 1,
      accountId: invAssetAcct.id,
      debitAmount: '600',
      creditAmount: '0',
      tenantId,
    }).returning();
    createdIds.voucherItems.push(vi1.id);

    const [lp1] = await db.insert(ledgerPostings).values({
      tenantId,
      voucherId: reconVoucher.id,
      voucherItemId: vi1.id,
      accountId: invAssetAcct.id,
      postingDate: testDate,
      debitAmount: '600',
      creditAmount: '0',
      narration: `Inventory asset posting ${testPrefix}`,
    }).returning();
    createdIds.postings.push(lp1.id);

    pass(`Reconciliation setup: inventory asset account (id=${invAssetAcct.id}), config (id=${configId}), posting BDT 600 debit`);

    // ── Test 9: Reconciliation Calculation ──
    console.log(`\n${BOLD}Test 9: Reconciliation Calculation${RESET}`);

    const valForRecon = await getInventoryValuation(tenantId, testDate);
    const reconItemVal = valForRecon.items.find(i => i.itemId === testItem.id);
    const inventoryTotal = reconItemVal?.totalValue || 0;

    const accountingResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(debit_amount AS numeric)), 0) -
        COALESCE(SUM(CAST(credit_amount AS numeric)), 0) AS balance
      FROM ledger_postings
      WHERE tenant_id = ${tenantId}
        AND account_id = ${invAssetAcct.id}
        AND posting_date <= ${testDate}
    `);
    const accountingRows = (accountingResult as any).rows || accountingResult;
    const accountingBalance = parseFloat((accountingRows[0] as any)?.balance || '0');

    const diff = Math.abs(inventoryTotal - accountingBalance);
    if (diff === 0) {
      pass(`Reconciliation: inventory=${inventoryTotal}, accounting=${accountingBalance}, diff=${diff}`);
    } else {
      fail('Reconciliation', `Expected diff=0, got diff=${diff} (inventory=${inventoryTotal}, accounting=${accountingBalance})`);
    }

    // ── Test 10: Performance Indexes ──
    console.log(`\n${BOLD}Test 10: Performance Indexes${RESET}`);

    const indexResult = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'stock_ledger'
      ORDER BY indexname
    `);
    const indexRows = (indexResult as any).rows || indexResult;
    const indexNames = Array.from(indexRows).map((r: any) => r.indexname);

    const requiredIndexes = [
      'stock_ledger_tenant_item_wh_date_idx',
      'stock_ledger_tenant_posting_status_idx',
    ];

    for (const idx of requiredIndexes) {
      if (indexNames.includes(idx)) {
        pass(`Index ${idx} exists`);
      } else {
        fail(`Index ${idx}`, 'Not found');
      }
    }

    // ── Test 11: Reversal Entry ──
    console.log(`\n${BOLD}Test 11: Reversal Entry${RESET}`);

    const reversalId = await reverseStockEntry(issueEntry.id, tenantId, userId);
    createdIds.stockLedger.push(reversalId);

    const [originalAfterReversal] = await db.select({
      isReversed: stockLedger.isReversed,
    }).from(stockLedger).where(eq(stockLedger.id, issueEntry.id));

    if (originalAfterReversal?.isReversed === false) {
      pass('Original issue entry keeps isReversed=false (both entries participate in valuation)');
    } else {
      fail('Reversal - original entry', `Expected isReversed=false, got ${originalAfterReversal?.isReversed}`);
    }

    const [reversalEntry] = await db.select({
      qtyIn: stockLedger.qtyIn,
      qtyOut: stockLedger.qtyOut,
      valueIn: stockLedger.valueIn,
      valueOut: stockLedger.valueOut,
      docNumber: stockLedger.docNumber,
    }).from(stockLedger).where(eq(stockLedger.id, reversalId));

    if (reversalEntry) {
      const revQtyIn = parseFloat(reversalEntry.qtyIn || '0');
      if (revQtyIn === 40) {
        pass(`Reversal entry has qtyIn=40 (opposite of original qtyOut=40)`);
      } else {
        fail('Reversal qtyIn', `Expected 40, got ${revQtyIn}`);
      }
    } else {
      fail('Reversal entry', 'Not found');
    }

    // ── Test 12: Post-Reversal Valuation ──
    // Both original and reversal entries stay in valuation (isReversed=false).
    // GRN: qtyIn=100, Issue: qtyOut=40, Reversal: qtyIn=40.
    // Net: 100 in - 40 out + 40 in = 100 units on hand, value 1000.
    console.log(`\n${BOLD}Test 12: Post-Reversal Valuation${RESET}`);

    const postReversalVal = await getInventoryValuation(tenantId, testDate);
    const postRevItem = postReversalVal.items.find(i => i.itemId === testItem.id);

    if (postRevItem) {
      if (postRevItem.qtyOnHand === 100) {
        pass(`Post-reversal qtyOnHand = ${postRevItem.qtyOnHand} (GRN 100 - issue 40 + reversal 40)`);
      } else {
        fail('Post-reversal qtyOnHand', `Expected 100, got ${postRevItem.qtyOnHand}`);
      }
      if (postRevItem.totalValue === 1000) {
        pass(`Post-reversal totalValue = ${postRevItem.totalValue} (1000 - 400 + 400)`);
      } else {
        fail('Post-reversal totalValue', `Expected 1000, got ${postRevItem.totalValue}`);
      }
    } else {
      fail('Post-reversal valuation', 'Test item not found in post-reversal results');
    }

  } finally {
    console.log(`\n${BOLD}Cleanup: Removing test data${RESET}`);

    for (const id of createdIds.stockLedger) {
      await db.delete(stockLedger).where(eq(stockLedger.id, id));
    }
    for (const id of createdIds.postings) {
      await db.delete(ledgerPostings).where(eq(ledgerPostings.id, id));
    }
    for (const id of createdIds.voucherItems) {
      await db.delete(voucherItems).where(eq(voucherItems.id, id));
    }
    for (const id of createdIds.vouchers) {
      await db.delete(vouchers).where(eq(vouchers.id, id));
    }
    if (existingConfigBackup) {
      await db.update(tenantInventoryConfig)
        .set({ inventoryAssetAccountId: existingConfigBackup.inventoryAssetAccountId })
        .where(eq(tenantInventoryConfig.id, existingConfigBackup.id));
    }
    for (const id of createdIds.configs) {
      await db.delete(tenantInventoryConfig).where(eq(tenantInventoryConfig.id, id));
    }
    for (const id of createdIds.accounts) {
      await db.delete(chartOfAccounts).where(eq(chartOfAccounts.id, id));
    }
    for (const id of createdIds.items) {
      await db.delete(items).where(eq(items.id, id));
    }
    for (const id of createdIds.warehouses) {
      await db.delete(warehouses).where(eq(warehouses.id, id));
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
