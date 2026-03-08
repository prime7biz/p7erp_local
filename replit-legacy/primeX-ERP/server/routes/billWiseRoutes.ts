import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../db';
import { billReferences, billAllocations, parties, chartOfAccounts, accountGroups, vouchers, voucherItems, ledgerPostings, fiscalYears, accountTypes } from '@shared/schema';
import { eq, and, or, sql, desc, asc, ilike, gte, lte, gt, lt, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';

async function findOrCreateForexGainLossAccount(tenantId: number): Promise<number> {
  const [existing] = await db
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(and(
      eq(chartOfAccounts.tenantId, tenantId),
      ilike(chartOfAccounts.name, '%forex gain%loss%')
    ))
    .limit(1);

  if (existing) return existing.id;

  const [existingAlt] = await db
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(and(
      eq(chartOfAccounts.tenantId, tenantId),
      ilike(chartOfAccounts.name, '%exchange%gain%loss%')
    ))
    .limit(1);

  if (existingAlt) return existingAlt.id;

  const [indirectIncomeType] = await db
    .select({ id: accountTypes.id })
    .from(accountTypes)
    .where(and(
      eq(accountTypes.tenantId, tenantId),
      or(
        ilike(accountTypes.name, '%indirect income%'),
        ilike(accountTypes.name, '%other income%'),
        ilike(accountTypes.name, '%income%')
      )
    ))
    .limit(1);

  const [anyGroup] = await db
    .select({ id: accountGroups.id })
    .from(accountGroups)
    .where(and(
      eq(accountGroups.tenantId, tenantId),
      or(
        ilike(accountGroups.name, '%indirect income%'),
        ilike(accountGroups.name, '%other income%'),
        ilike(accountGroups.name, '%income%')
      )
    ))
    .limit(1);

  if (!indirectIncomeType || !anyGroup) {
    const [fallback] = await db
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.tenantId, tenantId),
        eq(chartOfAccounts.isActive, true)
      ))
      .limit(1);
    if (fallback) return fallback.id;
    throw new Error('Cannot find or create Forex Gain/Loss account - no account types/groups available');
  }

  const [newAccount] = await db.insert(chartOfAccounts).values({
    tenantId,
    accountTypeId: indirectIncomeType.id,
    groupId: anyGroup.id,
    accountNumber: 'FOREX-GL',
    name: 'Forex Gain/Loss',
    description: 'Auto-created account for foreign exchange gains and losses on bill settlements',
    isActive: true,
    path: 'Forex Gain/Loss',
    level: 1,
    allowJournalEntries: true,
    normalBalance: 'credit',
  }).returning();

  return newAccount.id;
}

async function createForexGainLossPosting(
  tenantId: number,
  userId: number,
  settlementVoucherId: number,
  settlementVoucherItemId: number,
  forexAccountId: number,
  partyAccountId: number,
  gainLossAmount: number,
  postingDate: string,
  narration: string
): Promise<void> {
  const [currentFY] = await db.select().from(fiscalYears)
    .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

  if (gainLossAmount > 0) {
    await db.insert(ledgerPostings).values([
      {
        tenantId,
        voucherId: settlementVoucherId,
        voucherItemId: settlementVoucherItemId,
        accountId: partyAccountId,
        postingDate,
        debitAmount: String(gainLossAmount.toFixed(2)),
        creditAmount: '0',
        narration: `Forex Loss: ${narration}`,
        postedById: userId,
        fiscalYearId: currentFY?.id || null,
      },
      {
        tenantId,
        voucherId: settlementVoucherId,
        voucherItemId: settlementVoucherItemId,
        accountId: forexAccountId,
        postingDate,
        debitAmount: '0',
        creditAmount: String(gainLossAmount.toFixed(2)),
        narration: `Forex Loss: ${narration}`,
        postedById: userId,
        fiscalYearId: currentFY?.id || null,
      },
    ]);
  } else if (gainLossAmount < 0) {
    const absAmount = Math.abs(gainLossAmount);
    await db.insert(ledgerPostings).values([
      {
        tenantId,
        voucherId: settlementVoucherId,
        voucherItemId: settlementVoucherItemId,
        accountId: forexAccountId,
        postingDate,
        debitAmount: String(absAmount.toFixed(2)),
        creditAmount: '0',
        narration: `Forex Gain: ${narration}`,
        postedById: userId,
        fiscalYearId: currentFY?.id || null,
      },
      {
        tenantId,
        voucherId: settlementVoucherId,
        voucherItemId: settlementVoucherItemId,
        accountId: partyAccountId,
        postingDate,
        debitAmount: '0',
        creditAmount: String(absAmount.toFixed(2)),
        narration: `Forex Gain: ${narration}`,
        postedById: userId,
        fiscalYearId: currentFY?.id || null,
      },
    ]);
  }
}

const router = express.Router();

const getTenantId = (req: Request): number => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new Error("Tenant ID not found");
  return tenantId;
};

const getUserId = (req: Request): number => {
  const userId = req.user?.id;
  if (!userId) throw new Error("User ID not found");
  return userId;
};

const SUNDRY_CREDITOR_GROUP_ID = 88;
const SUNDRY_DEBTOR_GROUP_ID = 168;

router.get('/report/outstanding', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const bills = await db
      .select({
        billType: billReferences.billType,
        totalOriginal: sql<string>`COALESCE(SUM(${billReferences.originalAmount}), 0)`,
        totalPending: sql<string>`COALESCE(SUM(${billReferences.pendingAmount}), 0)`,
        totalOverdue: sql<string>`COALESCE(SUM(CASE WHEN ${billReferences.isOverdue} = true THEN ${billReferences.pendingAmount} ELSE 0 END), 0)`,
        billCount: sql<number>`COUNT(*)::int`,
      })
      .from(billReferences)
      .where(and(
        eq(billReferences.tenantId, tenantId),
        or(eq(billReferences.status, 'OPEN'), eq(billReferences.status, 'PARTIALLY_SETTLED'))
      ))
      .groupBy(billReferences.billType);

    const receivable = bills.find(b => b.billType === 'RECEIVABLE') || { totalOriginal: '0', totalPending: '0', totalOverdue: '0', billCount: 0 };
    const payable = bills.find(b => b.billType === 'PAYABLE') || { totalOriginal: '0', totalPending: '0', totalOverdue: '0', billCount: 0 };

    const ledgerTotals = await db.execute(sql`
      SELECT 
        coa.group_id,
        COALESCE(SUM(
          CAST(COALESCE(coa.opening_balance, '0') AS numeric) 
          + COALESCE(sub.total_debit, 0) 
          - COALESCE(sub.total_credit, 0)
        ), 0) as total_balance
      FROM parties p
      JOIN chart_of_accounts coa ON p.ledger_account_id = coa.id
      LEFT JOIN LATERAL (
        SELECT 
          COALESCE(SUM(CAST(lp.debit_amount AS numeric)), 0) as total_debit,
          COALESCE(SUM(CAST(lp.credit_amount AS numeric)), 0) as total_credit
        FROM ledger_postings lp 
        WHERE lp.account_id = coa.id AND lp.tenant_id = p.tenant_id
      ) sub ON true
      WHERE p.tenant_id = ${tenantId}
        AND p.is_active = true
        AND coa.group_id IN (${SUNDRY_CREDITOR_GROUP_ID}, ${SUNDRY_DEBTOR_GROUP_ID})
      GROUP BY coa.group_id
    `);

    let ledgerReceivable = '0';
    let ledgerPayable = '0';
    for (const row of ledgerTotals.rows as any[]) {
      if (Number(row.group_id) === SUNDRY_DEBTOR_GROUP_ID) {
        ledgerReceivable = String(row.total_balance);
      } else if (Number(row.group_id) === SUNDRY_CREDITOR_GROUP_ID) {
        ledgerPayable = String(Math.abs(Number(row.total_balance)));
      }
    }

    res.json({
      receivable: {
        totalOriginal: receivable.totalOriginal,
        totalPending: receivable.totalPending,
        totalOverdue: receivable.totalOverdue,
        billCount: receivable.billCount,
      },
      payable: {
        totalOriginal: payable.totalOriginal,
        totalPending: payable.totalPending,
        totalOverdue: payable.totalOverdue,
        billCount: payable.billCount,
      },
      ledgerReceivable,
      ledgerPayable,
    });
  } catch (error: any) {
    console.error('Outstanding report error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/report/ledger-outstanding', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const result = await db.execute(sql`
      SELECT p.id as party_id, p.name as party_name, p.party_code, p.party_type,
             p.ledger_account_id,
             CAST(COALESCE(coa.opening_balance, '0') AS numeric) as opening_balance,
             COALESCE(SUM(CAST(lp.debit_amount AS numeric)), 0) as total_debit,
             COALESCE(SUM(CAST(lp.credit_amount AS numeric)), 0) as total_credit
      FROM parties p
      JOIN chart_of_accounts coa ON p.ledger_account_id = coa.id
      LEFT JOIN ledger_postings lp ON lp.account_id = coa.id AND lp.tenant_id = p.tenant_id
      WHERE p.tenant_id = ${tenantId}
        AND p.is_active = true
        AND coa.group_id IN (${SUNDRY_CREDITOR_GROUP_ID}, ${SUNDRY_DEBTOR_GROUP_ID})
      GROUP BY p.id, p.name, p.party_code, p.party_type, p.ledger_account_id, coa.opening_balance
      HAVING CAST(COALESCE(coa.opening_balance, '0') AS numeric) + COALESCE(SUM(CAST(lp.debit_amount AS numeric)), 0) - COALESCE(SUM(CAST(lp.credit_amount AS numeric)), 0) != 0
      ORDER BY p.party_type, p.name
    `);

    const data = (result.rows as any[]).map(row => ({
      partyId: row.party_id,
      partyName: row.party_name,
      partyCode: row.party_code,
      partyType: row.party_type,
      ledgerAccountId: row.ledger_account_id,
      openingBalance: String(row.opening_balance),
      totalDebit: String(row.total_debit),
      totalCredit: String(row.total_credit),
      closingBalance: String(Number(row.opening_balance) + Number(row.total_debit) - Number(row.total_credit)),
    }));

    res.json(data);
  } catch (error: any) {
    console.error('Ledger outstanding report error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/report/aging', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { billType } = req.query as { billType?: string };

    const conditions: any[] = [
      eq(billReferences.tenantId, tenantId),
      or(eq(billReferences.status, 'OPEN'), eq(billReferences.status, 'PARTIALLY_SETTLED')),
      gt(billReferences.pendingAmount, '0'),
    ];

    if (billType) {
      conditions.push(eq(billReferences.billType, billType));
    }

    const agingData = await db
      .select({
        partyId: billReferences.partyId,
        partyName: parties.name,
        partyCode: parties.partyCode,
        billType: billReferences.billType,
        bucket0_30: sql<string>`COALESCE(SUM(CASE WHEN CURRENT_DATE - ${billReferences.billDate}::date BETWEEN 0 AND 30 THEN ${billReferences.pendingAmount} ELSE 0 END), 0)`,
        bucket31_60: sql<string>`COALESCE(SUM(CASE WHEN CURRENT_DATE - ${billReferences.billDate}::date BETWEEN 31 AND 60 THEN ${billReferences.pendingAmount} ELSE 0 END), 0)`,
        bucket61_90: sql<string>`COALESCE(SUM(CASE WHEN CURRENT_DATE - ${billReferences.billDate}::date BETWEEN 61 AND 90 THEN ${billReferences.pendingAmount} ELSE 0 END), 0)`,
        bucket91_120: sql<string>`COALESCE(SUM(CASE WHEN CURRENT_DATE - ${billReferences.billDate}::date BETWEEN 91 AND 120 THEN ${billReferences.pendingAmount} ELSE 0 END), 0)`,
        bucket120plus: sql<string>`COALESCE(SUM(CASE WHEN CURRENT_DATE - ${billReferences.billDate}::date > 120 THEN ${billReferences.pendingAmount} ELSE 0 END), 0)`,
        total: sql<string>`COALESCE(SUM(${billReferences.pendingAmount}), 0)`,
      })
      .from(billReferences)
      .innerJoin(parties, eq(billReferences.partyId, parties.id))
      .where(and(...conditions))
      .groupBy(billReferences.partyId, parties.name, parties.partyCode, billReferences.billType)
      .orderBy(desc(sql`SUM(${billReferences.pendingAmount})`));

    res.json(agingData);
  } catch (error: any) {
    console.error('Aging report error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/report/overdue', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const overdueBills = await db
      .select({
        id: billReferences.id,
        billNumber: billReferences.billNumber,
        billDate: billReferences.billDate,
        dueDate: billReferences.dueDate,
        billType: billReferences.billType,
        originalAmount: billReferences.originalAmount,
        pendingAmount: billReferences.pendingAmount,
        status: billReferences.status,
        partyId: billReferences.partyId,
        partyName: parties.name,
        partyCode: parties.partyCode,
        daysOverdue: sql<number>`(CURRENT_DATE - ${billReferences.dueDate}::date)::int`,
      })
      .from(billReferences)
      .innerJoin(parties, eq(billReferences.partyId, parties.id))
      .where(and(
        eq(billReferences.tenantId, tenantId),
        or(eq(billReferences.status, 'OPEN'), eq(billReferences.status, 'PARTIALLY_SETTLED')),
        gt(billReferences.pendingAmount, '0'),
        lt(billReferences.dueDate, sql`CURRENT_DATE`)
      ))
      .orderBy(asc(billReferences.dueDate));

    res.json(overdueBills);
  } catch (error: any) {
    console.error('Overdue report error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/party/:partyId/outstanding', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const partyId = parseIntParam(req.params.partyId, "partyId");

    const outstandingBills = await db
      .select({
        id: billReferences.id,
        billNumber: billReferences.billNumber,
        billDate: billReferences.billDate,
        dueDate: billReferences.dueDate,
        billType: billReferences.billType,
        originalAmount: billReferences.originalAmount,
        pendingAmount: billReferences.pendingAmount,
        status: billReferences.status,
        isOverdue: billReferences.isOverdue,
        sourceDocType: billReferences.sourceDocType,
        sourceDocNumber: billReferences.sourceDocNumber,
      })
      .from(billReferences)
      .where(and(
        eq(billReferences.tenantId, tenantId),
        eq(billReferences.partyId, partyId),
        or(eq(billReferences.status, 'OPEN'), eq(billReferences.status, 'PARTIALLY_SETTLED')),
        gt(billReferences.pendingAmount, '0')
      ))
      .orderBy(asc(billReferences.billDate));

    res.json(outstandingBills);
  } catch (error: any) {
    console.error('Party outstanding bills error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/party/:partyId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const partyId = parseIntParam(req.params.partyId, "partyId");

    const partyBills = await db
      .select()
      .from(billReferences)
      .where(and(
        eq(billReferences.tenantId, tenantId),
        eq(billReferences.partyId, partyId)
      ))
      .orderBy(desc(billReferences.billDate));

    res.json(partyBills);
  } catch (error: any) {
    console.error('Party bills error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");

    const [bill] = await db
      .select({
        id: billReferences.id,
        billNumber: billReferences.billNumber,
        billDate: billReferences.billDate,
        dueDate: billReferences.dueDate,
        billType: billReferences.billType,
        originalAmount: billReferences.originalAmount,
        pendingAmount: billReferences.pendingAmount,
        status: billReferences.status,
        isOverdue: billReferences.isOverdue,
        sourceVoucherId: billReferences.sourceVoucherId,
        sourceDocType: billReferences.sourceDocType,
        sourceDocNumber: billReferences.sourceDocNumber,
        creditPeriodDays: billReferences.creditPeriodDays,
        notes: billReferences.notes,
        partyId: billReferences.partyId,
        accountId: billReferences.accountId,
        partyName: parties.name,
        partyCode: parties.partyCode,
        createdAt: billReferences.createdAt,
        updatedAt: billReferences.updatedAt,
      })
      .from(billReferences)
      .innerJoin(parties, eq(billReferences.partyId, parties.id))
      .where(and(eq(billReferences.id, id), eq(billReferences.tenantId, tenantId)));

    if (!bill) {
      return res.status(404).json({ message: 'Bill reference not found' });
    }

    const allocations = await db
      .select({
        id: billAllocations.id,
        allocationType: billAllocations.allocationType,
        amount: billAllocations.amount,
        allocationDate: billAllocations.allocationDate,
        notes: billAllocations.notes,
        voucherId: billAllocations.voucherId,
        createdAt: billAllocations.createdAt,
      })
      .from(billAllocations)
      .where(and(
        eq(billAllocations.billReferenceId, id),
        eq(billAllocations.tenantId, tenantId)
      ))
      .orderBy(desc(billAllocations.createdAt));

    res.json({ bill, allocations });
  } catch (error: any) {
    console.error('Bill detail error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { billType, status, partyId, overdue, fromDate, toDate, search, page = '1', limit = '50' } = req.query as Record<string, string>;

    const conditions: any[] = [eq(billReferences.tenantId, tenantId)];

    if (billType) conditions.push(eq(billReferences.billType, billType));
    if (status) conditions.push(eq(billReferences.status, status));
    if (partyId) conditions.push(eq(billReferences.partyId, parseInt(partyId)));
    if (overdue === 'true') conditions.push(eq(billReferences.isOverdue, true));
    if (fromDate) conditions.push(gte(billReferences.billDate, fromDate));
    if (toDate) conditions.push(lte(billReferences.billDate, toDate));
    if (search) {
      conditions.push(or(
        ilike(billReferences.billNumber, `%${search}%`),
        ilike(parties.name, `%${search}%`)
      ));
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const bills = await db
      .select({
        id: billReferences.id,
        billNumber: billReferences.billNumber,
        billDate: billReferences.billDate,
        dueDate: billReferences.dueDate,
        billType: billReferences.billType,
        originalAmount: billReferences.originalAmount,
        pendingAmount: billReferences.pendingAmount,
        status: billReferences.status,
        isOverdue: billReferences.isOverdue,
        sourceDocType: billReferences.sourceDocType,
        sourceDocNumber: billReferences.sourceDocNumber,
        partyId: billReferences.partyId,
        partyName: parties.name,
        partyCode: parties.partyCode,
        createdAt: billReferences.createdAt,
      })
      .from(billReferences)
      .innerJoin(parties, eq(billReferences.partyId, parties.id))
      .where(and(...conditions))
      .orderBy(desc(billReferences.billDate))
      .limit(limitNum)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(billReferences)
      .innerJoin(parties, eq(billReferences.partyId, parties.id))
      .where(and(...conditions));

    res.json({
      bills,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult?.count || 0,
        totalPages: Math.ceil((countResult?.count || 0) / limitNum),
      },
    });
  } catch (error: any) {
    console.error('List bills error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const data = {
      ...req.body,
      tenantId,
      createdBy: userId,
    };

    const [bill] = await db.insert(billReferences).values(data).returning();
    res.status(201).json(bill);
  } catch (error: any) {
    console.error('Create bill error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");

    const [existing] = await db
      .select()
      .from(billReferences)
      .where(and(eq(billReferences.id, id), eq(billReferences.tenantId, tenantId)));

    if (!existing) {
      return res.status(404).json({ message: 'Bill reference not found' });
    }

    const [updated] = await db
      .update(billReferences)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(billReferences.id, id), eq(billReferences.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Update bill error:', error);
    res.status(500).json({ message: error.message });
  }
});

const allocateSchema = z.object({
  voucherId: z.number(),
  partyId: z.number(),
  accountId: z.number(),
  allocations: z.array(z.object({
    allocationType: z.enum(['AGAINST_REF', 'NEW_REF', 'ADVANCE', 'ON_ACCOUNT']),
    billReferenceId: z.number().optional(),
    amount: z.number().positive(),
    notes: z.string().optional(),
  })),
});

router.post('/allocate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const body = allocateSchema.parse(req.body);
    const today = new Date().toISOString().split('T')[0];

    const createdAllocations: any[] = [];

    for (const alloc of body.allocations) {
      if (alloc.allocationType === 'AGAINST_REF' && alloc.billReferenceId) {
        const [billRef] = await db
          .select()
          .from(billReferences)
          .where(and(
            eq(billReferences.id, alloc.billReferenceId),
            eq(billReferences.tenantId, tenantId)
          ));

        if (!billRef) {
          return res.status(404).json({ message: `Bill reference ${alloc.billReferenceId} not found` });
        }

        const currentPending = parseFloat(billRef.pendingAmount);
        if (alloc.amount > currentPending + 0.01) {
          return res.status(400).json({ message: `Allocation amount (${alloc.amount}) exceeds pending amount (${currentPending}) for bill ${billRef.billNumber}` });
        }

        const newPending = Math.max(0, currentPending - alloc.amount);
        const newStatus = newPending <= 0.01 ? 'SETTLED' : 'PARTIALLY_SETTLED';

        await db
          .update(billReferences)
          .set({
            pendingAmount: String(newPending.toFixed(2)),
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(billReferences.id, alloc.billReferenceId));

        const [allocation] = await db.insert(billAllocations).values({
          billReferenceId: alloc.billReferenceId,
          voucherId: body.voucherId,
          allocationType: 'AGAINST_REF',
          amount: String(alloc.amount),
          partyId: body.partyId,
          accountId: body.accountId,
          allocationDate: today,
          notes: alloc.notes || null,
          tenantId,
          createdBy: userId,
        }).returning();
        createdAllocations.push(allocation);

        try {
          if (billRef.sourceVoucherId) {
            const originalFcItems = await db
              .select({
                fcCurrencyCode: voucherItems.fcCurrencyCode,
                itemExchangeRate: voucherItems.itemExchangeRate,
                fcDebitAmount: voucherItems.fcDebitAmount,
                fcCreditAmount: voucherItems.fcCreditAmount,
              })
              .from(voucherItems)
              .where(and(
                eq(voucherItems.voucherId, billRef.sourceVoucherId),
                eq(voucherItems.tenantId, tenantId),
                sql`${voucherItems.fcCurrencyCode} IS NOT NULL AND ${voucherItems.fcCurrencyCode} != ''`
              ))
              .limit(1);

            if (originalFcItems.length > 0) {
              const originalRate = parseFloat(originalFcItems[0].itemExchangeRate || '0');

              const [settlementVoucher] = await db
                .select({
                  exchangeRate: vouchers.exchangeRate,
                  currencyCode: vouchers.currencyCode,
                  voucherDate: vouchers.voucherDate,
                })
                .from(vouchers)
                .where(and(eq(vouchers.id, body.voucherId), eq(vouchers.tenantId, tenantId)));

              const settlementFcItems = await db
                .select({
                  id: voucherItems.id,
                  fcCurrencyCode: voucherItems.fcCurrencyCode,
                  itemExchangeRate: voucherItems.itemExchangeRate,
                })
                .from(voucherItems)
                .where(and(
                  eq(voucherItems.voucherId, body.voucherId),
                  eq(voucherItems.tenantId, tenantId),
                  sql`${voucherItems.fcCurrencyCode} IS NOT NULL AND ${voucherItems.fcCurrencyCode} != ''`
                ))
                .limit(1);

              let settlementRate = 0;
              let settlementItemId: number | null = null;

              if (settlementFcItems.length > 0) {
                settlementRate = parseFloat(settlementFcItems[0].itemExchangeRate || '0');
                settlementItemId = settlementFcItems[0].id;
              } else if (settlementVoucher) {
                settlementRate = parseFloat(settlementVoucher.exchangeRate || '0');
                const [anyItem] = await db
                  .select({ id: voucherItems.id })
                  .from(voucherItems)
                  .where(and(eq(voucherItems.voucherId, body.voucherId), eq(voucherItems.tenantId, tenantId)))
                  .limit(1);
                settlementItemId = anyItem?.id || null;
              }

              if (originalRate > 0 && settlementRate > 0 && Math.abs(settlementRate - originalRate) > 0.0001 && settlementItemId) {
                const fcAmount = alloc.amount / settlementRate;
                const gainLossAmount = (settlementRate - originalRate) * fcAmount;

                if (Math.abs(gainLossAmount) >= 0.01) {
                  const forexAccountId = await findOrCreateForexGainLossAccount(tenantId);
                  const postingDate = settlementVoucher?.voucherDate || today;
                  const fcCode = originalFcItems[0].fcCurrencyCode || 'FC';
                  const narration = `Settlement of bill ${billRef.billNumber} - ${fcCode} rate diff: ${originalRate} → ${settlementRate}`;

                  await createForexGainLossPosting(
                    tenantId,
                    userId,
                    body.voucherId,
                    settlementItemId,
                    forexAccountId,
                    body.accountId,
                    gainLossAmount,
                    postingDate,
                    narration
                  );

                  (allocation as any).forexGainLoss = {
                    amount: Number(gainLossAmount.toFixed(2)),
                    type: gainLossAmount > 0 ? 'LOSS' : 'GAIN',
                    originalRate,
                    settlementRate,
                    fcAmount: Number(fcAmount.toFixed(6)),
                    forexAccountId,
                  };
                }
              }
            }
          }
        } catch (forexError: any) {
          console.error('Forex gain/loss calculation error (non-fatal):', forexError.message);
        }

      } else if (alloc.allocationType === 'ADVANCE') {
        const [advanceBill] = await db.insert(billReferences).values({
          billNumber: `ADV-${body.voucherId}`,
          billDate: today,
          billType: 'RECEIVABLE',
          partyId: body.partyId,
          accountId: body.accountId,
          originalAmount: String(-alloc.amount),
          pendingAmount: String(-alloc.amount),
          sourceVoucherId: body.voucherId,
          sourceDocType: 'ADVANCE',
          status: 'OPEN',
          notes: alloc.notes || 'Advance payment',
          tenantId,
          createdBy: userId,
        }).returning();

        const [allocation] = await db.insert(billAllocations).values({
          billReferenceId: advanceBill.id,
          voucherId: body.voucherId,
          allocationType: 'ADVANCE',
          amount: String(alloc.amount),
          partyId: body.partyId,
          accountId: body.accountId,
          allocationDate: today,
          notes: alloc.notes || null,
          tenantId,
          createdBy: userId,
        }).returning();
        createdAllocations.push(allocation);

      } else if (alloc.allocationType === 'ON_ACCOUNT') {
        const [allocation] = await db.insert(billAllocations).values({
          voucherId: body.voucherId,
          allocationType: 'ON_ACCOUNT',
          amount: String(alloc.amount),
          partyId: body.partyId,
          accountId: body.accountId,
          allocationDate: today,
          notes: alloc.notes || null,
          tenantId,
          createdBy: userId,
        }).returning();
        createdAllocations.push(allocation);

      } else if (alloc.allocationType === 'NEW_REF') {
        const [newBill] = await db.insert(billReferences).values({
          billNumber: `NEW-${body.voucherId}`,
          billDate: today,
          billType: 'PAYABLE',
          partyId: body.partyId,
          accountId: body.accountId,
          originalAmount: String(alloc.amount),
          pendingAmount: String(alloc.amount),
          sourceVoucherId: body.voucherId,
          sourceDocType: 'NEW_REF',
          status: 'OPEN',
          notes: alloc.notes || 'New reference during payment',
          tenantId,
          createdBy: userId,
        }).returning();

        const [allocation] = await db.insert(billAllocations).values({
          billReferenceId: newBill.id,
          voucherId: body.voucherId,
          allocationType: 'NEW_REF',
          amount: String(alloc.amount),
          partyId: body.partyId,
          accountId: body.accountId,
          allocationDate: today,
          notes: alloc.notes || null,
          tenantId,
          createdBy: userId,
        }).returning();
        createdAllocations.push(allocation);
      }
    }

    res.json({ success: true, allocations: createdAllocations });
  } catch (error: any) {
    console.error('Allocate bills error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: error.message });
  }
});

router.post('/auto-create', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { voucherId } = req.body;

    if (!voucherId) {
      return res.status(400).json({ message: 'voucherId is required' });
    }

    const [voucher] = await db
      .select()
      .from(vouchers)
      .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)));

    if (!voucher) {
      return res.status(404).json({ message: 'Voucher not found' });
    }

    const items = await db
      .select({
        id: voucherItems.id,
        accountId: voucherItems.accountId,
        debitAmount: voucherItems.debitAmount,
        creditAmount: voucherItems.creditAmount,
        description: voucherItems.description,
        groupId: chartOfAccounts.groupId,
        accountName: chartOfAccounts.name,
      })
      .from(voucherItems)
      .innerJoin(chartOfAccounts, eq(voucherItems.accountId, chartOfAccounts.id))
      .where(and(
        eq(voucherItems.voucherId, voucherId),
        eq(voucherItems.tenantId, tenantId)
      ));

    const creditorGroupIds = await db
      .select({ id: accountGroups.id })
      .from(accountGroups)
      .where(and(
        eq(accountGroups.tenantId, tenantId),
        or(
          ilike(accountGroups.name, '%sundry creditor%'),
          ilike(accountGroups.name, '%sundry debtor%'),
          inArray(accountGroups.id, [SUNDRY_CREDITOR_GROUP_ID, SUNDRY_DEBTOR_GROUP_ID])
        )
      ));

    const sundryGroupIds = new Set(creditorGroupIds.map(g => g.id));
    const createdBills: any[] = [];

    for (const item of items) {
      if (!item.groupId || !sundryGroupIds.has(item.groupId)) continue;

      const debit = parseFloat(item.debitAmount || '0');
      const credit = parseFloat(item.creditAmount || '0');
      const amount = Math.max(debit, credit);
      if (amount <= 0) continue;

      const group = creditorGroupIds.find(g => g.id === item.groupId);
      const groupName = await db
        .select({ name: accountGroups.name })
        .from(accountGroups)
        .where(eq(accountGroups.id, item.groupId!))
        .limit(1);

      const isCreditor = groupName[0]?.name?.toLowerCase().includes('creditor') ||
                         item.groupId === SUNDRY_CREDITOR_GROUP_ID;
      const billType = isCreditor ? 'PAYABLE' : 'RECEIVABLE';

      let party = await db
        .select()
        .from(parties)
        .where(and(
          eq(parties.tenantId, tenantId),
          eq(parties.ledgerAccountId, item.accountId)
        ))
        .limit(1);

      let partyId: number;
      let creditPeriodDays = 0;

      if (party.length > 0) {
        partyId = party[0].id;
        creditPeriodDays = party[0].creditPeriodDays || 0;
      } else {
        const [newParty] = await db.insert(parties).values({
          partyCode: `AUTO-${item.accountId}`,
          name: item.accountName || `Party-${item.accountId}`,
          partyType: isCreditor ? 'vendor' : 'customer',
          ledgerAccountId: item.accountId,
          tenantId,
          createdBy: userId,
        }).returning();
        partyId = newParty.id;
      }

      const voucherDate = voucher.voucherDate
        ? (typeof voucher.voucherDate === 'string' ? voucher.voucherDate : new Date(voucher.voucherDate).toISOString().split('T')[0])
        : new Date().toISOString().split('T')[0];

      let dueDate: string | null = null;
      if (creditPeriodDays > 0) {
        const due = new Date(voucherDate);
        due.setDate(due.getDate() + creditPeriodDays);
        dueDate = due.toISOString().split('T')[0];
      }

      const prefix = billType === 'RECEIVABLE' ? 'RCV' : 'PAY';
      const billNumber = await generateDocumentNumber({
        prefix,
        tableName: 'bill_references',
        columnName: 'bill_number',
        tenantId,
        includeDate: false,
      });

      const [bill] = await db.insert(billReferences).values({
        billNumber,
        billDate: voucherDate,
        dueDate,
        billType,
        partyId,
        accountId: item.accountId,
        originalAmount: String(amount.toFixed(2)),
        pendingAmount: String(amount.toFixed(2)),
        sourceVoucherId: voucherId,
        sourceDocType: isCreditor ? 'PURCHASE_BILL' : 'SALES_INVOICE',
        sourceDocNumber: voucher.voucherNumber || null,
        status: 'OPEN',
        creditPeriodDays: creditPeriodDays || null,
        isOverdue: dueDate ? new Date(dueDate) < new Date() : false,
        tenantId,
        createdBy: userId,
      }).returning();

      createdBills.push(bill);
    }

    res.json({ success: true, billsCreated: createdBills.length, bills: createdBills });
  } catch (error: any) {
    console.error('Auto-create bills error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
