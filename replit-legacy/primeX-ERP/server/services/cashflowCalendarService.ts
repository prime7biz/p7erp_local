import { db } from '../db';
import { sql } from 'drizzle-orm';

interface CashflowItem {
  type: 'RECEIVABLE' | 'PAYABLE';
  amount: number;
  partyName: string;
  reference: string;
  dueDate: string;
}

interface CashflowDay {
  date: string;
  receivables: number;
  payables: number;
  netFlow: number;
  runningBalance: number;
  items: CashflowItem[];
}

export async function getCashflowCalendar(
  tenantId: number,
  startDate: string,
  days: number = 90
): Promise<{
  days: CashflowDay[];
  totals: { totalReceivables: number; totalPayables: number; netCashflow: number };
}> {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);
  const endDateStr = endDate.toISOString().split('T')[0];

  const [receivables, payables] = await Promise.all([
    fetchReceivables(tenantId, startDate, endDateStr),
    fetchPayables(tenantId, startDate, endDateStr),
  ]);

  const dayMap = new Map<string, { receivables: number; payables: number; items: CashflowItem[] }>();

  const current = new Date(startDate);
  for (let i = 0; i < days; i++) {
    const dateStr = current.toISOString().split('T')[0];
    dayMap.set(dateStr, { receivables: 0, payables: 0, items: [] });
    current.setDate(current.getDate() + 1);
  }

  for (const r of receivables) {
    const dateStr = r.dueDate;
    const entry = dayMap.get(dateStr);
    if (entry) {
      entry.receivables += r.amount;
      entry.items.push({
        type: 'RECEIVABLE',
        amount: r.amount,
        partyName: r.partyName,
        reference: r.reference,
        dueDate: r.dueDate,
      });
    }
  }

  for (const p of payables) {
    const dateStr = p.dueDate;
    const entry = dayMap.get(dateStr);
    if (entry) {
      entry.payables += p.amount;
      entry.items.push({
        type: 'PAYABLE',
        amount: p.amount,
        partyName: p.partyName,
        reference: p.reference,
        dueDate: p.dueDate,
      });
    }
  }

  let runningBalance = 0;
  let totalReceivables = 0;
  let totalPayables = 0;
  const cashflowDays: CashflowDay[] = [];

  const sortedDates = Array.from(dayMap.keys()).sort();
  for (const dateStr of sortedDates) {
    const entry = dayMap.get(dateStr)!;
    const netFlow = entry.receivables - entry.payables;
    runningBalance += netFlow;
    totalReceivables += entry.receivables;
    totalPayables += entry.payables;

    cashflowDays.push({
      date: dateStr,
      receivables: entry.receivables,
      payables: entry.payables,
      netFlow,
      runningBalance,
      items: entry.items,
    });
  }

  return {
    days: cashflowDays,
    totals: {
      totalReceivables,
      totalPayables,
      netCashflow: totalReceivables - totalPayables,
    },
  };
}

async function fetchReceivables(tenantId: number, startDate: string, endDate: string) {
  try {
    const results = await db.execute(sql`
      SELECT 
        br.id,
        br.bill_number AS reference,
        br.due_date,
        CAST(br.pending_amount AS numeric) AS amount,
        p.name AS party_name
      FROM bill_references br
      JOIN parties p ON p.id = br.party_id AND p.tenant_id = ${tenantId}
      WHERE br.tenant_id = ${tenantId}
        AND br.bill_type = 'RECEIVABLE'
        AND br.status = 'OPEN'
        AND CAST(br.pending_amount AS numeric) > 0
        AND br.due_date IS NOT NULL
        AND br.due_date >= ${startDate}
        AND br.due_date <= ${endDate}
      ORDER BY br.due_date ASC
    `);

    return (results.rows as any[]).map(row => ({
      amount: parseFloat(row.amount) || 0,
      partyName: row.party_name || 'Unknown',
      reference: row.reference || '',
      dueDate: row.due_date,
    }));
  } catch {
    return [];
  }
}

async function fetchPayables(tenantId: number, startDate: string, endDate: string) {
  try {
    const results = await db.execute(sql`
      SELECT 
        br.id,
        br.bill_number AS reference,
        br.due_date,
        CAST(br.pending_amount AS numeric) AS amount,
        p.name AS party_name
      FROM bill_references br
      JOIN parties p ON p.id = br.party_id AND p.tenant_id = ${tenantId}
      WHERE br.tenant_id = ${tenantId}
        AND br.bill_type = 'PAYABLE'
        AND br.status = 'OPEN'
        AND CAST(br.pending_amount AS numeric) > 0
        AND br.due_date IS NOT NULL
        AND br.due_date >= ${startDate}
        AND br.due_date <= ${endDate}
      ORDER BY br.due_date ASC
    `);

    return (results.rows as any[]).map(row => ({
      amount: parseFloat(row.amount) || 0,
      partyName: row.party_name || 'Unknown',
      reference: row.reference || '',
      dueDate: row.due_date,
    }));
  } catch {
    return [];
  }
}
