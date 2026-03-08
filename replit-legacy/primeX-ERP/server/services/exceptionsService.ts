import { db } from '../db';
import {
  stockLedger, items, vouchers, voucherItems,
  billReferences, accountingPeriods, parties
} from '@shared/schema';
import { eq, and, sql, lt, gt, ne, isNull } from 'drizzle-orm';

export interface ERPException {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  entityType: string;
  entityId: number;
  detectedAt: string;
  acknowledged: boolean;
  acknowledgedBy?: number;
  acknowledgedAt?: string;
}

const acknowledgedExceptions = new Map<string, { userId: number; at: string }>();

export async function detectExceptions(tenantId: number): Promise<ERPException[]> {
  const exceptions: ERPException[] = [];
  const now = new Date().toISOString();

  const detectors = [
    detectNegativeStock,
    detectUnbalancedVouchers,
    detectOverdueReceivables,
    detectOverduePayables,
    detectStaleDrafts,
    detectUnapprovedPending,
    detectPeriodMismatch,
    detectMissingParty,
    detectLowStock,
  ];

  const results = await Promise.allSettled(
    detectors.map(fn => fn(tenantId, now))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      exceptions.push(...result.value);
    }
  }

  for (const exc of exceptions) {
    const ack = acknowledgedExceptions.get(exc.id);
    if (ack) {
      exc.acknowledged = true;
      exc.acknowledgedBy = ack.userId;
      exc.acknowledgedAt = ack.at;
    }
  }

  return exceptions;
}

export async function getExceptionsSummary(tenantId: number): Promise<{ type: string; count: number; severity: string }[]> {
  const exceptions = await detectExceptions(tenantId);
  const map = new Map<string, { type: string; count: number; severity: string }>();

  for (const exc of exceptions) {
    const existing = map.get(exc.type);
    if (existing) {
      existing.count++;
    } else {
      map.set(exc.type, { type: exc.type, count: 1, severity: exc.severity });
    }
  }

  return Array.from(map.values());
}

export async function acknowledgeException(exceptionId: string, tenantId: number, userId: number): Promise<void> {
  acknowledgedExceptions.set(exceptionId, { userId, at: new Date().toISOString() });
}

async function detectNegativeStock(tenantId: number, now: string): Promise<ERPException[]> {
  const results = await db.execute(sql`
    SELECT 
      sl.item_id,
      sl.item_name,
      sl.warehouse_id,
      COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) AS balance
    FROM stock_ledger sl
    WHERE sl.tenant_id = ${tenantId} AND sl.is_reversed = false
    GROUP BY sl.item_id, sl.item_name, sl.warehouse_id
    HAVING COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) < 0
  `);

  return (results.rows as any[]).map(row => ({
    id: `NEG_STOCK_${row.item_id}_${row.warehouse_id || 0}`,
    type: 'NEGATIVE_STOCK',
    severity: 'CRITICAL' as const,
    title: `Negative Stock: ${row.item_name || 'Item #' + row.item_id}`,
    description: `Item "${row.item_name || row.item_id}" has negative balance of ${parseFloat(row.balance).toFixed(2)} units in warehouse ${row.warehouse_id || 'default'}`,
    entityType: 'stock_item',
    entityId: row.item_id,
    detectedAt: now,
    acknowledged: false,
  }));
}

async function detectUnbalancedVouchers(tenantId: number, now: string): Promise<ERPException[]> {
  const results = await db.execute(sql`
    SELECT 
      v.id,
      v.voucher_number,
      COALESCE(SUM(CAST(vi.debit_amount AS numeric)), 0) AS total_debit,
      COALESCE(SUM(CAST(vi.credit_amount AS numeric)), 0) AS total_credit
    FROM vouchers v
    JOIN voucher_items vi ON vi.voucher_id = v.id AND vi.tenant_id = ${tenantId}
    WHERE v.tenant_id = ${tenantId}
      AND v.is_cancelled = false
    GROUP BY v.id, v.voucher_number
    HAVING ABS(COALESCE(SUM(CAST(vi.debit_amount AS numeric)), 0) - COALESCE(SUM(CAST(vi.credit_amount AS numeric)), 0)) > 0.01
  `);

  return (results.rows as any[]).map(row => ({
    id: `UNBAL_VOUCHER_${row.id}`,
    type: 'UNBALANCED_VOUCHER',
    severity: 'HIGH' as const,
    title: `Unbalanced Voucher: ${row.voucher_number}`,
    description: `Voucher ${row.voucher_number} has debit ${parseFloat(row.total_debit).toFixed(2)} != credit ${parseFloat(row.total_credit).toFixed(2)}`,
    entityType: 'voucher',
    entityId: row.id,
    detectedAt: now,
    acknowledged: false,
  }));
}

async function detectOverdueReceivables(tenantId: number, now: string): Promise<ERPException[]> {
  const today = new Date().toISOString().split('T')[0];

  const results = await db.execute(sql`
    SELECT 
      br.id,
      br.bill_number,
      br.due_date,
      br.pending_amount,
      p.name AS party_name
    FROM bill_references br
    JOIN parties p ON p.id = br.party_id AND p.tenant_id = ${tenantId}
    WHERE br.tenant_id = ${tenantId}
      AND br.bill_type = 'RECEIVABLE'
      AND br.status = 'OPEN'
      AND br.due_date IS NOT NULL
      AND br.due_date < ${today}
      AND CAST(br.pending_amount AS numeric) > 0
    ORDER BY br.due_date ASC
    LIMIT 100
  `);

  return (results.rows as any[]).map(row => {
    const daysOverdue = Math.floor((Date.now() - new Date(row.due_date).getTime()) / (1000 * 60 * 60 * 24));
    const severity = daysOverdue > 90 ? 'CRITICAL' : daysOverdue > 60 ? 'HIGH' : daysOverdue > 30 ? 'MEDIUM' : 'LOW';
    return {
      id: `OVERDUE_REC_${row.id}`,
      type: 'OVERDUE_RECEIVABLE',
      severity: severity as ERPException['severity'],
      title: `Overdue Receivable: ${row.bill_number}`,
      description: `Bill ${row.bill_number} from ${row.party_name} is ${daysOverdue} days overdue. Pending: ${parseFloat(row.pending_amount).toFixed(2)}`,
      entityType: 'bill_reference',
      entityId: row.id,
      detectedAt: now,
      acknowledged: false,
    };
  });
}

async function detectOverduePayables(tenantId: number, now: string): Promise<ERPException[]> {
  const today = new Date().toISOString().split('T')[0];

  const results = await db.execute(sql`
    SELECT 
      br.id,
      br.bill_number,
      br.due_date,
      br.pending_amount,
      p.name AS party_name
    FROM bill_references br
    JOIN parties p ON p.id = br.party_id AND p.tenant_id = ${tenantId}
    WHERE br.tenant_id = ${tenantId}
      AND br.bill_type = 'PAYABLE'
      AND br.status = 'OPEN'
      AND br.due_date IS NOT NULL
      AND br.due_date < ${today}
      AND CAST(br.pending_amount AS numeric) > 0
    ORDER BY br.due_date ASC
    LIMIT 100
  `);

  return (results.rows as any[]).map(row => {
    const daysOverdue = Math.floor((Date.now() - new Date(row.due_date).getTime()) / (1000 * 60 * 60 * 24));
    const severity = daysOverdue > 90 ? 'CRITICAL' : daysOverdue > 60 ? 'HIGH' : daysOverdue > 30 ? 'MEDIUM' : 'LOW';
    return {
      id: `OVERDUE_PAY_${row.id}`,
      type: 'OVERDUE_PAYABLE',
      severity: severity as ERPException['severity'],
      title: `Overdue Payable: ${row.bill_number}`,
      description: `Bill ${row.bill_number} to ${row.party_name} is ${daysOverdue} days overdue. Pending: ${parseFloat(row.pending_amount).toFixed(2)}`,
      entityType: 'bill_reference',
      entityId: row.id,
      detectedAt: now,
      acknowledged: false,
    };
  });
}

async function detectStaleDrafts(tenantId: number, now: string): Promise<ERPException[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

  const results = await db.execute(sql`
    SELECT 
      v.id,
      v.voucher_number,
      v.voucher_date,
      v.created_at,
      v.workflow_status
    FROM vouchers v
    WHERE v.tenant_id = ${tenantId}
      AND v.workflow_status = 'DRAFT'
      AND v.is_cancelled = false
      AND v.voucher_date < ${cutoffDate}
    ORDER BY v.voucher_date ASC
    LIMIT 100
  `);

  return (results.rows as any[]).map(row => {
    const daysOld = Math.floor((Date.now() - new Date(row.voucher_date).getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: `STALE_DRAFT_${row.id}`,
      type: 'STALE_DRAFT',
      severity: (daysOld > 90 ? 'HIGH' : 'MEDIUM') as ERPException['severity'],
      title: `Stale Draft: ${row.voucher_number}`,
      description: `Voucher ${row.voucher_number} has been in DRAFT status for ${daysOld} days since ${row.voucher_date}`,
      entityType: 'voucher',
      entityId: row.id,
      detectedAt: now,
      acknowledged: false,
    };
  });
}

async function detectUnapprovedPending(tenantId: number, now: string): Promise<ERPException[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

  const results = await db.execute(sql`
    SELECT 
      v.id,
      v.voucher_number,
      v.voucher_date,
      v.workflow_status,
      v.submitted_date
    FROM vouchers v
    WHERE v.tenant_id = ${tenantId}
      AND v.workflow_status IN ('SUBMITTED', 'PENDING_APPROVAL', 'CHECKED')
      AND v.is_cancelled = false
      AND (v.submitted_date IS NOT NULL AND v.submitted_date < ${sevenDaysAgo.toISOString()})
    ORDER BY v.submitted_date ASC
    LIMIT 100
  `);

  return (results.rows as any[]).map(row => {
    const daysPending = row.submitted_date
      ? Math.floor((Date.now() - new Date(row.submitted_date).getTime()) / (1000 * 60 * 60 * 24))
      : 7;
    return {
      id: `UNAPPROVED_${row.id}`,
      type: 'UNAPPROVED_PENDING',
      severity: (daysPending > 14 ? 'HIGH' : 'MEDIUM') as ERPException['severity'],
      title: `Pending Approval: ${row.voucher_number}`,
      description: `Voucher ${row.voucher_number} (${row.workflow_status}) has been awaiting approval for ${daysPending} days`,
      entityType: 'voucher',
      entityId: row.id,
      detectedAt: now,
      acknowledged: false,
    };
  });
}

async function detectPeriodMismatch(tenantId: number, now: string): Promise<ERPException[]> {
  const results = await db.execute(sql`
    SELECT 
      v.id,
      v.voucher_number,
      v.voucher_date,
      ap.name AS period_name,
      ap.start_date AS period_start,
      ap.end_date AS period_end
    FROM vouchers v
    JOIN accounting_periods ap ON ap.id = v.accounting_period_id AND ap.tenant_id = ${tenantId}
    WHERE v.tenant_id = ${tenantId}
      AND v.accounting_period_id IS NOT NULL
      AND v.is_cancelled = false
      AND (v.voucher_date < ap.start_date OR v.voucher_date > ap.end_date)
    LIMIT 100
  `);

  return (results.rows as any[]).map(row => ({
    id: `PERIOD_MISMATCH_${row.id}`,
    type: 'PERIOD_MISMATCH',
    severity: 'HIGH' as const,
    title: `Period Mismatch: ${row.voucher_number}`,
    description: `Voucher ${row.voucher_number} dated ${row.voucher_date} is outside its assigned period "${row.period_name}" (${row.period_start} to ${row.period_end})`,
    entityType: 'voucher',
    entityId: row.id,
    detectedAt: now,
    acknowledged: false,
  }));
}

async function detectMissingParty(tenantId: number, now: string): Promise<ERPException[]> {
  const results = await db.execute(sql`
    SELECT 
      v.id,
      v.voucher_number,
      v.entity_type,
      v.origin_type
    FROM vouchers v
    WHERE v.tenant_id = ${tenantId}
      AND v.is_cancelled = false
      AND v.entity_id IS NULL
      AND v.entity_type IS NOT NULL
      AND v.entity_type IN ('vendor', 'customer')
    LIMIT 100
  `);

  return (results.rows as any[]).map(row => ({
    id: `MISSING_PARTY_${row.id}`,
    type: 'MISSING_PARTY',
    severity: 'MEDIUM' as const,
    title: `Missing Party: ${row.voucher_number}`,
    description: `Voucher ${row.voucher_number} has entity type "${row.entity_type}" but no linked party/entity ID`,
    entityType: 'voucher',
    entityId: row.id,
    detectedAt: now,
    acknowledged: false,
  }));
}

async function detectLowStock(tenantId: number, now: string): Promise<ERPException[]> {
  const results = await db.execute(sql`
    SELECT 
      i.id AS item_id,
      i.name AS item_name,
      i.item_code,
      CAST(i.reorder_point AS numeric) AS reorder_level,
      COALESCE(stock.balance, 0) AS current_stock
    FROM items i
    LEFT JOIN (
      SELECT 
        sl.item_id,
        COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) AS balance
      FROM stock_ledger sl
      WHERE sl.tenant_id = ${tenantId} AND sl.is_reversed = false
      GROUP BY sl.item_id
    ) stock ON stock.item_id = i.id
    WHERE i.tenant_id = ${tenantId}
      AND i.is_active = true
      AND i.is_stockable = true
      AND CAST(i.reorder_point AS numeric) > 0
      AND COALESCE(stock.balance, 0) < CAST(i.reorder_point AS numeric)
    LIMIT 100
  `);

  return (results.rows as any[]).map(row => {
    const pct = row.reorder_level > 0 ? (parseFloat(row.current_stock) / parseFloat(row.reorder_level)) * 100 : 0;
    const severity = pct <= 0 ? 'CRITICAL' : pct < 25 ? 'HIGH' : pct < 50 ? 'MEDIUM' : 'LOW';
    return {
      id: `LOW_STOCK_${row.item_id}`,
      type: 'LOW_STOCK',
      severity: severity as ERPException['severity'],
      title: `Low Stock: ${row.item_name}`,
      description: `Item "${row.item_name}" (${row.item_code}) has ${parseFloat(row.current_stock).toFixed(2)} units, below reorder point of ${parseFloat(row.reorder_level).toFixed(2)}`,
      entityType: 'stock_item',
      entityId: row.item_id,
      detectedAt: now,
      acknowledged: false,
    };
  });
}
