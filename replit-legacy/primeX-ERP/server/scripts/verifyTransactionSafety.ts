import { db } from '../db';
import { 
  vouchers, voucherItems, voucherTypes, voucherStatus, 
  accountingPeriods, fiscalYears, idempotencyKeys, ledgerPostings,
  auditLogs, tenants
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { 
  ERPError, ERP_ERROR_CODES, checkIdempotency, saveIdempotencyResult,
  validateVoucherBalance, isVoucherEditable, isVoucherImmutable,
  checkNegativeStock, VOUCHER_LIFECYCLE
} from '../services/transactionSafetyService';
import { 
  checkPeriodLock, enforceVoucherImmutability, 
  createVoucherReversal, idempotentPostVoucher 
} from '../services/accountingEngineService';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;

function pass(test: string) {
  passed++;
  console.log(`  ${GREEN}✓ PASS${RESET} ${test}`);
}

function fail(test: string, reason: string) {
  failed++;
  console.log(`  ${RED}✗ FAIL${RESET} ${test}: ${reason}`);
}

async function getTestTenantId(): Promise<number> {
  const [t] = await db.select({ id: tenants.id }).from(tenants).limit(1);
  if (!t) throw new Error('No tenant found');
  return t.id;
}

async function main() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  Phase 2.2/2.3 Transaction Safety & Accounting Engine Verify${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  const tenantId = await getTestTenantId();
  console.log(`${YELLOW}Using tenant ID: ${tenantId}${RESET}\n`);

  // ===== TEST 1: Voucher lifecycle constants =====
  console.log(`${BOLD}Test 1: Voucher Lifecycle Constants${RESET}`);
  try {
    if (isVoucherEditable('DRAFT') && isVoucherEditable('SUBMITTED')) pass('DRAFT and SUBMITTED are editable');
    else fail('DRAFT/SUBMITTED editable', 'Expected both to be editable');
    
    if (isVoucherImmutable('POSTED') && isVoucherImmutable('CANCELLED')) pass('POSTED and CANCELLED are immutable');
    else fail('POSTED/CANCELLED immutable', 'Expected both to be immutable');
    
    if (!isVoucherEditable('POSTED') && !isVoucherEditable('CANCELLED')) pass('POSTED/CANCELLED are NOT editable');
    else fail('POSTED/CANCELLED NOT editable', 'Expected neither to be editable');
  } catch (e: any) {
    fail('Voucher lifecycle constants', e.message);
  }

  // ===== TEST 2: Voucher balance validation =====
  console.log(`\n${BOLD}Test 2: Voucher Balance Validation${RESET}`);
  try {
    const balanced = validateVoucherBalance([
      { debitAmount: '1000', creditAmount: '0' },
      { debitAmount: '0', creditAmount: '1000' },
    ]);
    if (balanced.balanced) pass('Balanced voucher validated correctly');
    else fail('Balanced voucher', `Expected balanced, got difference: ${balanced.difference}`);

    const unbalanced = validateVoucherBalance([
      { debitAmount: '1000', creditAmount: '0' },
      { debitAmount: '0', creditAmount: '500' },
    ]);
    if (!unbalanced.balanced) pass('Unbalanced voucher detected correctly');
    else fail('Unbalanced detection', 'Expected unbalanced');
    
    if (unbalanced.difference === 500) pass('Correct difference amount: 500');
    else fail('Difference amount', `Expected 500, got ${unbalanced.difference}`);
  } catch (e: any) {
    fail('Voucher balance validation', e.message);
  }

  // ===== TEST 3: Idempotency key system =====
  console.log(`\n${BOLD}Test 3: Idempotency Key System${RESET}`);
  try {
    const testRequestId = `test-verify-${Date.now()}`;
    
    // First check - should not exist
    const check1 = await checkIdempotency(tenantId, testRequestId, 'TEST_OP');
    if (!check1.exists) pass('New request ID not found (correct)');
    else fail('New request ID', 'Should not exist yet');

    // Save a result
    await saveIdempotencyResult(tenantId, testRequestId, 'TEST_OP', 'test-1', 200, { test: true });

    // Second check - should exist
    const check2 = await checkIdempotency(tenantId, testRequestId, 'TEST_OP');
    if (check2.exists) pass('Saved request ID found on retry');
    else fail('Saved request ID', 'Should exist after save');
    
    if (check2.cachedResponse?.test === true) pass('Cached response matches original');
    else fail('Cached response', 'Response does not match');
    
    // Different operation type - should not exist
    const check3 = await checkIdempotency(tenantId, testRequestId, 'DIFFERENT_OP');
    if (!check3.exists) pass('Different operation type not found (correct key scoping)');
    else fail('Operation type scoping', 'Same requestId with different operationType should not match');

    // Cleanup test key
    await db.delete(idempotencyKeys).where(
      and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.requestId, testRequestId))
    );
    pass('Test idempotency key cleaned up');
  } catch (e: any) {
    fail('Idempotency key system', e.message);
  }

  // ===== TEST 4: Period lock enforcement =====
  console.log(`\n${BOLD}Test 4: Period Lock Enforcement${RESET}`);
  try {
    // Check a future date (should not be locked)
    const futureCheck = await checkPeriodLock(tenantId, '2099-01-01');
    if (!futureCheck.locked) pass('Future date not locked (no period exists)');
    else fail('Future date lock', 'Future date should not be locked');

    // Create a test locked period
    const [testPeriod] = await db.insert(accountingPeriods).values({
      tenantId,
      name: 'Test Locked Period',
      startDate: '2020-01-01',
      endDate: '2020-01-31',
      isClosed: true,
      closedBy: 1,
      closedAt: new Date(),
      closedReason: 'Test verification',
    }).returning();
    
    // Check a date in locked period
    const lockedCheck = await checkPeriodLock(tenantId, '2020-01-15');
    if (lockedCheck.locked) pass('Date in locked period detected correctly');
    else fail('Locked period detection', 'Should detect locked period');

    // Check override pathway
    const overrideCheck = await checkPeriodLock(tenantId, '2020-01-15', {
      allowOverride: true,
      overrideReason: 'Test override for verification',
      overrideBy: 1,
    });
    if (!overrideCheck.locked && overrideCheck.overrideApplied) pass('Period lock override works');
    else fail('Period lock override', 'Override should allow through');

    // Verify audit log was created for override
    const [auditEntry] = await db.select().from(auditLogs)
      .where(and(
        eq(auditLogs.tenantId, tenantId),
        eq(auditLogs.entityType, 'accounting_period'),
        eq(auditLogs.entityId, testPeriod.id)
      ))
      .orderBy(desc(auditLogs.performedAt))
      .limit(1);
    if (auditEntry) pass('Override audit log created');
    else fail('Override audit log', 'No audit log found for period lock override');

    // Cleanup test period
    await db.delete(accountingPeriods).where(eq(accountingPeriods.id, testPeriod.id));
    pass('Test period cleaned up');
  } catch (e: any) {
    fail('Period lock enforcement', e.message);
  }

  // ===== TEST 5: POSTED voucher immutability =====
  console.log(`\n${BOLD}Test 5: Posted Voucher Immutability${RESET}`);
  try {
    // Find a posted voucher
    const [postedVoucher] = await db.select({ id: vouchers.id, isPosted: vouchers.isPosted })
      .from(vouchers)
      .where(and(eq(vouchers.tenantId, tenantId), eq(vouchers.isPosted, true)))
      .limit(1);

    if (postedVoucher) {
      try {
        await enforceVoucherImmutability(postedVoucher.id, tenantId);
        fail('POSTED voucher edit blocked', 'Should have thrown ERPError');
      } catch (e: any) {
        if (e instanceof ERPError && e.code === ERP_ERROR_CODES.IMMUTABLE_POSTED) {
          pass('POSTED voucher correctly blocked with IMMUTABLE_POSTED error');
        } else {
          fail('POSTED voucher error code', `Expected IMMUTABLE_POSTED, got: ${e.code || e.message}`);
        }
      }
    } else {
      console.log(`  ${YELLOW}⚠ SKIP${RESET} No posted vouchers found to test immutability`);
    }

    // Find a non-posted voucher (should pass through)
    const [draftVoucher] = await db.select({ id: vouchers.id, isPosted: vouchers.isPosted })
      .from(vouchers)
      .where(and(eq(vouchers.tenantId, tenantId), eq(vouchers.isPosted, false), sql`${vouchers.isCancelled} = false`))
      .limit(1);

    if (draftVoucher) {
      try {
        await enforceVoucherImmutability(draftVoucher.id, tenantId);
        pass('DRAFT voucher allowed through immutability check');
      } catch (e: any) {
        fail('DRAFT voucher immutability', `Should be allowed, got: ${e.message}`);
      }
    } else {
      console.log(`  ${YELLOW}⚠ SKIP${RESET} No draft vouchers found to test editability`);
    }
  } catch (e: any) {
    fail('Posted voucher immutability', e.message);
  }

  // ===== TEST 6: Idempotent voucher posting =====
  console.log(`\n${BOLD}Test 6: Idempotent Voucher Posting${RESET}`);
  try {
    // Find a posted voucher and test re-posting
    const [alreadyPosted] = await db.select({ id: vouchers.id })
      .from(vouchers)
      .where(and(eq(vouchers.tenantId, tenantId), eq(vouchers.isPosted, true)))
      .limit(1);

    if (alreadyPosted) {
      const testReqId = `test-repost-${Date.now()}`;
      const result = await idempotentPostVoucher(alreadyPosted.id, tenantId, 1, testReqId);
      if (result.success && result.fromCache) pass('Re-posting already-posted voucher returns cached result (idempotent)');
      else fail('Re-posting idempotency', `Expected fromCache=true, got: ${JSON.stringify(result)}`);
      
      // Cleanup
      await db.delete(idempotencyKeys).where(
        and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.requestId, testReqId))
      );
    } else {
      console.log(`  ${YELLOW}⚠ SKIP${RESET} No posted vouchers to test re-posting`);
    }
  } catch (e: any) {
    fail('Idempotent voucher posting', e.message);
  }

  // ===== TEST 7: ERPError formatting =====
  console.log(`\n${BOLD}Test 7: Standardized Error Response Format${RESET}`);
  try {
    const err = new ERPError(ERP_ERROR_CODES.PERIOD_LOCKED, 'Test period lock', 403, { test: true });
    if (err.code === 'PERIOD_LOCKED') pass('ERPError code set correctly');
    else fail('ERPError code', `Expected PERIOD_LOCKED, got: ${err.code}`);
    
    if (err.httpStatus === 403) pass('ERPError httpStatus set correctly');
    else fail('ERPError httpStatus', `Expected 403, got: ${err.httpStatus}`);
    
    if (err.details?.test === true) pass('ERPError details preserved');
    else fail('ERPError details', 'Details not preserved');
    
    if (err instanceof Error) pass('ERPError extends Error');
    else fail('ERPError inheritance', 'Should extend Error');

    // Check all error codes exist
    const codes = Object.keys(ERP_ERROR_CODES);
    const expectedCodes = ['PERIOD_LOCKED', 'UNBALANCED_VOUCHER', 'IMMUTABLE_POSTED', 'APPROVAL_REQUIRED', 'NOT_AUTHORIZED', 'DUPLICATE_REQUEST', 'NEGATIVE_STOCK', 'ALREADY_PROCESSED', 'INVALID_STATE_TRANSITION'];
    const allPresent = expectedCodes.every(c => codes.includes(c));
    if (allPresent) pass(`All ${expectedCodes.length} error codes defined`);
    else fail('Error codes', `Missing codes: ${expectedCodes.filter(c => !codes.includes(c)).join(', ')}`);
  } catch (e: any) {
    fail('Standardized error format', e.message);
  }

  // ===== SUMMARY =====
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  Results: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : GREEN}${failed} failed${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
