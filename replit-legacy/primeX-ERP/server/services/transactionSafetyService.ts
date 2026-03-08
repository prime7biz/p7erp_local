import { db } from '../db';
import { idempotencyKeys } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getCurrentStock } from './stockLedgerService';

// ============================================================================
// 1. STANDARDIZED ERROR CODES
// ============================================================================

export const ERP_ERROR_CODES = {
  PERIOD_LOCKED: 'PERIOD_LOCKED',
  UNBALANCED_VOUCHER: 'UNBALANCED_VOUCHER',
  IMMUTABLE_POSTED: 'IMMUTABLE_POSTED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  NEGATIVE_STOCK: 'NEGATIVE_STOCK',
  ALREADY_PROCESSED: 'ALREADY_PROCESSED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
} as const;

// ============================================================================
// 2. ERP ERROR CLASS
// ============================================================================

export class ERPError extends Error {
  code: string;
  details?: any;
  httpStatus: number;

  constructor(code: string, message: string, httpStatus: number = 400, details?: any) {
    super(message);
    this.name = 'ERPError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Object.setPrototypeOf(this, ERPError.prototype);
  }
}

// ============================================================================
// 3. FORMAT ERP ERROR
// ============================================================================

export function formatERPError(error: ERPError) {
  return {
    success: false,
    code: error.code,
    message: error.message,
    details: error.details,
  };
}

// ============================================================================
// 4. IDEMPOTENCY HELPER FUNCTIONS
// ============================================================================

export async function checkIdempotency(
  tenantId: number,
  requestId: string,
  operationType: string
): Promise<{ exists: boolean; cachedResponse?: any; statusCode?: number }> {
  // Check if request already processed - if exists and not expired, return cached response
  const [existing] = await db.select().from(idempotencyKeys).where(
    and(
      eq(idempotencyKeys.tenantId, tenantId),
      eq(idempotencyKeys.requestId, requestId),
      eq(idempotencyKeys.operationType, operationType),
      sql`${idempotencyKeys.expiresAt} > NOW()`
    )
  );

  if (existing) {
    return { exists: true, cachedResponse: existing.responseBody, statusCode: existing.statusCode };
  }
  return { exists: false };
}

export async function saveIdempotencyResult(
  tenantId: number,
  requestId: string,
  operationType: string,
  operationId: string | null,
  statusCode: number,
  responseBody: any,
  ttlHours: number = 24
): Promise<void> {
  await db.insert(idempotencyKeys).values({
    tenantId,
    requestId,
    operationType,
    operationId: operationId || undefined,
    statusCode,
    responseBody,
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
  }).onConflictDoNothing();
}

export async function cleanupExpiredKeys(): Promise<number> {
  await db.delete(idempotencyKeys).where(sql`${idempotencyKeys.expiresAt} <= NOW()`);
  return 0; // drizzle delete doesn't easily return count
}

// ============================================================================
// 5. NEGATIVE STOCK CHECK
// ============================================================================

export async function checkNegativeStock(
  itemId: number,
  warehouseId: number | null,
  tenantId: number,
  qtyToDeduct: number,
  options?: { allowOverride?: boolean; overrideReason?: string; overrideBy?: number }
): Promise<{
  allowed: boolean;
  currentStock: number;
  resultingStock: number;
  requiresOverride?: boolean;
}> {
  const currentStock = await getCurrentStock(itemId, warehouseId, tenantId);
  const resultingStock = currentStock - qtyToDeduct;

  if (resultingStock < 0) {
    if (options?.allowOverride && options.overrideReason && options.overrideBy) {
      return { allowed: true, currentStock, resultingStock };
    }
    return { allowed: false, currentStock, resultingStock, requiresOverride: true };
  }
  return { allowed: true, currentStock, resultingStock };
}

// ============================================================================
// 6. VOUCHER LIFECYCLE CONSTANTS
// ============================================================================

export const VOUCHER_LIFECYCLE = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  POSTED: 'POSTED',
  CANCELLED: 'CANCELLED',
} as const;

export const VOUCHER_EDITABLE_STATES = [VOUCHER_LIFECYCLE.DRAFT, VOUCHER_LIFECYCLE.SUBMITTED] as const;
export const VOUCHER_IMMUTABLE_STATES = [
  VOUCHER_LIFECYCLE.POSTED,
  VOUCHER_LIFECYCLE.CANCELLED,
] as const;

export const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'APPROVED'],
  SUBMITTED: ['DRAFT', 'APPROVED'],
  APPROVED: ['DRAFT', 'POSTED'],
  POSTED: [], // immutable - only reversal
  CANCELLED: [],
};

// ============================================================================
// 7. VOUCHER LIFECYCLE HELPER FUNCTIONS
// ============================================================================

export function isVoucherEditable(workflowStatus: string): boolean {
  return (VOUCHER_EDITABLE_STATES as readonly string[]).includes(workflowStatus);
}

export function isVoucherImmutable(workflowStatus: string): boolean {
  return (VOUCHER_IMMUTABLE_STATES as readonly string[]).includes(workflowStatus);
}

export function isValidTransition(fromStatus: string, toStatus: string): boolean {
  return VALID_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

// ============================================================================
// 8. TRANSACTION INVARIANT CHECKS - VOUCHER BALANCE
// ============================================================================

export function validateVoucherBalance(
  items: Array<{ debitAmount: string | number; creditAmount: string | number }>
): { balanced: boolean; totalDebit: number; totalCredit: number; difference: number } {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const item of items) {
    totalDebit += parseFloat(String(item.debitAmount)) || 0;
    totalCredit += parseFloat(String(item.creditAmount)) || 0;
  }
  const difference = Math.abs(totalDebit - totalCredit);
  return { balanced: difference <= 0.01, totalDebit, totalCredit, difference };
}
