import { db } from '../db';
import {
  subcontractJobs, subcontractChallans, subcontractChallanLines,
  subcontractBills, subcontractAccountingConfig, stockLedger,
  vouchers, voucherItems, ledgerPostings, voucherTypes, voucherStatus,
  fiscalYears
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { getCurrentStock, getWeightedAverageRate } from './stockLedgerService';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';
import { SequentialIdGenerator } from '../utils/sequentialIdGenerator';

async function generateJobNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'SC',
    tableName: 'subcontract_jobs',
    columnName: 'job_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

async function generateChallanNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'SCH',
    tableName: 'subcontract_challans',
    columnName: 'challan_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

async function generateBillNumber(tenantId: number): Promise<string> {
  return generateDocumentNumber({
    prefix: 'SCB',
    tableName: 'subcontract_bills',
    columnName: 'bill_number',
    tenantId,
    includeDate: false,
    separator: '-',
  });
}

export async function createSubcontractJob(
  tenantId: number,
  userId: number,
  data: {
    jobType: string;
    partyId: number;
    sourceDocType?: string;
    sourceDocId?: number;
    plannedQty: string;
    rate?: string;
    amount?: string;
    currency?: string;
    dueDate?: string;
    remarks?: string;
  }
) {
  const jobNumber = await generateJobNumber(tenantId);

  const [job] = await db.insert(subcontractJobs).values({
    tenantId,
    jobNumber,
    jobType: data.jobType,
    partyId: data.partyId,
    sourceDocType: data.sourceDocType || null,
    sourceDocId: data.sourceDocId || null,
    status: 'DRAFT',
    plannedQty: data.plannedQty,
    rate: data.rate || '0',
    amount: data.amount || '0',
    currency: data.currency || 'BDT',
    dueDate: data.dueDate || null,
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();

  return job;
}

export async function approveSubcontractJob(tenantId: number, jobId: number, userId: number) {
  const [job] = await db.select().from(subcontractJobs)
    .where(and(eq(subcontractJobs.id, jobId), eq(subcontractJobs.tenantId, tenantId)));

  if (!job) throw new Error('Subcontract job not found');
  if (job.status !== 'DRAFT') throw new Error('Only DRAFT jobs can be approved');

  const [updated] = await db.update(subcontractJobs).set({
    status: 'APPROVED',
    approvedBy: userId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(subcontractJobs.id, jobId), eq(subcontractJobs.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function createSubcontractChallan(
  tenantId: number,
  userId: number,
  data: {
    subcontractJobId: number;
    direction: string;
    challanDate: string;
    warehouseFromId?: number;
    warehouseToId?: number;
    remarks?: string;
    lines: Array<{
      itemId: number;
      itemName: string;
      qty: string;
      rate?: string;
      amount?: string;
    }>;
  }
) {
  const challanNumber = await generateChallanNumber(tenantId);

  const [challan] = await db.insert(subcontractChallans).values({
    tenantId,
    challanNumber,
    subcontractJobId: data.subcontractJobId,
    direction: data.direction,
    challanDate: data.challanDate,
    warehouseFromId: data.warehouseFromId || null,
    warehouseToId: data.warehouseToId || null,
    status: 'DRAFT',
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();

  const insertedLines = [];
  for (const line of data.lines) {
    const [insertedLine] = await db.insert(subcontractChallanLines).values({
      tenantId,
      challanId: challan.id,
      itemId: line.itemId,
      itemName: line.itemName,
      qty: line.qty,
      rate: line.rate || '0',
      amount: line.amount || '0',
    }).returning();
    insertedLines.push(insertedLine);
  }

  return { challan, lines: insertedLines };
}

export async function postSubcontractChallan(
  tenantId: number,
  challanId: number,
  userId: number,
  requestId?: string
) {
  if (requestId) {
    const [existing] = await db.select().from(subcontractChallans)
      .where(and(
        eq(subcontractChallans.requestId, requestId),
        eq(subcontractChallans.tenantId, tenantId),
        eq(subcontractChallans.status, 'POSTED')
      ));
    if (existing) {
      return { idempotent: true, challan: existing };
    }
  }

  const [challan] = await db.select().from(subcontractChallans)
    .where(and(eq(subcontractChallans.id, challanId), eq(subcontractChallans.tenantId, tenantId)));

  if (!challan) throw new Error('Subcontract challan not found');
  if (challan.status !== 'DRAFT') throw new Error('Only DRAFT challans can be posted');

  return await db.transaction(async (tx) => {
    const lines = await tx.select().from(subcontractChallanLines)
      .where(and(eq(subcontractChallanLines.challanId, challanId), eq(subcontractChallanLines.tenantId, tenantId)));

    if (lines.length === 0) throw new Error('Challan has no lines');

    const today = new Date().toISOString().split('T')[0];
    const stockEntries = [];

    if (challan.direction === 'OUTBOUND') {
      for (const line of lines) {
        const currentStock = await getCurrentStock(line.itemId, challan.warehouseFromId, tenantId);
        const qtyOut = parseFloat(line.qty);
        const valuationData = await getWeightedAverageRate(line.itemId, challan.warehouseFromId, tenantId);
        const rate = valuationData.rate;
        const valueOut = qtyOut * rate;
        const newBalance = currentStock - qtyOut;

        const [stockEntry] = await tx.insert(stockLedger).values({
          docType: 'SUBCONTRACT',
          docId: challanId,
          docNumber: challan.challanNumber,
          postingDate: challan.challanDate || today,
          itemId: line.itemId,
          itemCode: null,
          itemName: line.itemName,
          warehouseId: challan.warehouseFromId,
          warehouseName: null,
          qtyIn: '0',
          qtyOut: String(qtyOut),
          balanceQty: String(newBalance),
          rate: String(rate),
          valuationRate: String(rate),
          valueIn: '0',
          valueOut: String(valueOut),
          balanceValue: String(newBalance * rate),
          remarks: `Subcontract outbound challan ${challan.challanNumber}`,
          isReversed: false,
          postingStatus: 'PENDING_POSTING',
          tenantId,
          createdBy: userId,
        }).returning();

        await tx.update(subcontractChallanLines).set({
          stockMoveId: stockEntry.id,
          rate: String(rate),
          amount: String(valueOut),
        }).where(eq(subcontractChallanLines.id, line.id));

        stockEntries.push(stockEntry);
      }

      const totalSentQty = lines.reduce((sum, l) => sum + parseFloat(l.qty), 0);
      const [job] = await tx.select().from(subcontractJobs)
        .where(and(eq(subcontractJobs.id, challan.subcontractJobId), eq(subcontractJobs.tenantId, tenantId)));
      if (job) {
        const newSentQty = parseFloat(job.sentQty || '0') + totalSentQty;
        await tx.update(subcontractJobs).set({
          sentQty: String(newSentQty),
          status: job.status === 'APPROVED' ? 'IN_PROGRESS' : job.status,
          updatedAt: new Date(),
        }).where(eq(subcontractJobs.id, challan.subcontractJobId));
      }

    } else if (challan.direction === 'INBOUND') {
      for (const line of lines) {
        const currentStock = await getCurrentStock(line.itemId, challan.warehouseToId, tenantId);
        const qtyIn = parseFloat(line.qty);

        const outboundMoves = await tx.select().from(stockLedger)
          .where(and(
            eq(stockLedger.docType, 'SUBCONTRACT'),
            eq(stockLedger.tenantId, tenantId),
            eq(stockLedger.itemId, line.itemId),
            eq(stockLedger.isReversed, false),
          ))
          .orderBy(desc(stockLedger.id))
          .limit(1);

        let rate = parseFloat(line.rate || '0');
        if (outboundMoves.length > 0 && rate === 0) {
          rate = parseFloat(outboundMoves[0].rate || '0');
        }

        const valueIn = qtyIn * rate;
        const newBalance = currentStock + qtyIn;

        const valuationData = await getWeightedAverageRate(line.itemId, challan.warehouseToId, tenantId);
        const oldValue = valuationData.qty * valuationData.rate;
        const newTotalQty = valuationData.qty + qtyIn;
        const newValuationRate = newTotalQty > 0 ? (oldValue + valueIn) / newTotalQty : rate;

        const [stockEntry] = await tx.insert(stockLedger).values({
          docType: 'SUBCONTRACT',
          docId: challanId,
          docNumber: challan.challanNumber,
          postingDate: challan.challanDate || today,
          itemId: line.itemId,
          itemCode: null,
          itemName: line.itemName,
          warehouseId: challan.warehouseToId,
          warehouseName: null,
          qtyIn: String(qtyIn),
          qtyOut: '0',
          balanceQty: String(newBalance),
          rate: String(rate),
          valuationRate: String(newValuationRate),
          valueIn: String(valueIn),
          valueOut: '0',
          balanceValue: String(newBalance * newValuationRate),
          remarks: `Subcontract inbound challan ${challan.challanNumber}`,
          isReversed: false,
          postingStatus: 'PENDING_POSTING',
          tenantId,
          createdBy: userId,
        }).returning();

        await tx.update(subcontractChallanLines).set({
          stockMoveId: stockEntry.id,
          rate: String(rate),
          amount: String(valueIn),
        }).where(eq(subcontractChallanLines.id, line.id));

        stockEntries.push(stockEntry);
      }

      const totalReceivedQty = lines.reduce((sum, l) => sum + parseFloat(l.qty), 0);
      const [job] = await tx.select().from(subcontractJobs)
        .where(and(eq(subcontractJobs.id, challan.subcontractJobId), eq(subcontractJobs.tenantId, tenantId)));
      if (job) {
        const newReceivedQty = parseFloat(job.receivedQty || '0') + totalReceivedQty;
        await tx.update(subcontractJobs).set({
          receivedQty: String(newReceivedQty),
          updatedAt: new Date(),
        }).where(eq(subcontractJobs.id, challan.subcontractJobId));
      }
    }

    const updateData: any = {
      status: 'POSTED',
      postedAt: new Date(),
      postedBy: userId,
      updatedAt: new Date(),
    };
    if (requestId) {
      updateData.requestId = requestId;
    }

    const [updatedChallan] = await tx.update(subcontractChallans).set(updateData)
      .where(and(eq(subcontractChallans.id, challanId), eq(subcontractChallans.tenantId, tenantId)))
      .returning();

    return { challan: updatedChallan, stockEntries };
  });
}

export async function createSubcontractBill(
  tenantId: number,
  userId: number,
  data: {
    subcontractJobId: number;
    billDate: string;
    amount: string;
    taxAmount?: string;
    discountAmount?: string;
    netAmount: string;
    remarks?: string;
  }
) {
  const billNumber = await generateBillNumber(tenantId);

  const [bill] = await db.insert(subcontractBills).values({
    tenantId,
    billNumber,
    subcontractJobId: data.subcontractJobId,
    billDate: data.billDate,
    amount: data.amount,
    taxAmount: data.taxAmount || '0',
    discountAmount: data.discountAmount || '0',
    netAmount: data.netAmount,
    status: 'DRAFT',
    remarks: data.remarks || null,
    createdBy: userId,
  }).returning();

  return bill;
}

export async function postSubcontractBill(
  tenantId: number,
  billId: number,
  userId: number
) {
  const [bill] = await db.select().from(subcontractBills)
    .where(and(eq(subcontractBills.id, billId), eq(subcontractBills.tenantId, tenantId)));

  if (!bill) throw new Error('Subcontract bill not found');
  if (bill.status !== 'DRAFT' && bill.status !== 'APPROVED') {
    throw new Error('Only DRAFT or APPROVED bills can be posted');
  }

  return await db.transaction(async (tx) => {
    let accountingVoucherId: number | undefined;

    const [acctConfig] = await tx.select().from(subcontractAccountingConfig)
      .where(eq(subcontractAccountingConfig.tenantId, tenantId));

    if (acctConfig) {
      const [journalType] = await tx.select().from(voucherTypes)
        .where(sql`${voucherTypes.code} IN ('JV', 'JNL', 'JOURNAL') OR LOWER(${voucherTypes.name}) LIKE '%journal%'`)
        .limit(1);

      const [currentFY] = await tx.select().from(fiscalYears)
        .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

      const [postedStatus] = await tx.select().from(voucherStatus)
        .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));

      const [draftStatus] = await tx.select().from(voucherStatus)
        .where(and(eq(voucherStatus.tenantId, tenantId)));

      if (journalType && currentFY && (postedStatus || draftStatus)) {
        const statusId = postedStatus?.id || draftStatus!.id;
        const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, journalType.code || 'JV');
        const today = new Date().toISOString().split('T')[0];
        const netAmount = bill.netAmount;

        const voucherItemsList: Array<{
          accountId: number;
          description: string;
          debitAmount: string;
          creditAmount: string;
        }> = [];

        const debitAccountId = acctConfig.subcontractExpenseLedgerId || acctConfig.wipLedgerId;
        const creditAccountId = acctConfig.subcontractPayableLedgerId;

        if (debitAccountId) {
          voucherItemsList.push({
            accountId: debitAccountId,
            description: `Subcontract expense for bill ${bill.billNumber}`,
            debitAmount: netAmount,
            creditAmount: '0',
          });
        }

        if (creditAccountId) {
          voucherItemsList.push({
            accountId: creditAccountId,
            description: `Subcontract payable for bill ${bill.billNumber}`,
            debitAmount: '0',
            creditAmount: netAmount,
          });
        }

        if (voucherItemsList.length >= 2) {
          const [voucher] = await tx.insert(vouchers).values({
            voucherNumber,
            voucherTypeId: journalType.id,
            voucherDate: today,
            postingDate: today,
            fiscalYearId: currentFY.id,
            statusId,
            description: `Subcontract Bill ${bill.billNumber} posting`,
            amount: netAmount,
            preparedById: userId,
            isPosted: true,
            postedById: userId,
            postedDate: new Date(),
            workflowStatus: 'POSTED',
            originModule: 'SUBCONTRACT',
            originType: 'SUBCONTRACT_BILL',
            originId: billId,
            originRef: bill.billNumber,
            tenantId,
          }).returning();

          for (let i = 0; i < voucherItemsList.length; i++) {
            const vi = voucherItemsList[i];
            const [insertedItem] = await tx.insert(voucherItems).values({
              voucherId: voucher.id,
              lineNumber: i + 1,
              accountId: vi.accountId,
              description: vi.description,
              debitAmount: vi.debitAmount,
              creditAmount: vi.creditAmount,
              tenantId,
            }).returning();

            await tx.insert(ledgerPostings).values({
              tenantId,
              voucherId: voucher.id,
              voucherItemId: insertedItem.id,
              accountId: vi.accountId,
              postingDate: today,
              debitAmount: vi.debitAmount,
              creditAmount: vi.creditAmount,
              narration: vi.description,
              postedById: userId,
              fiscalYearId: currentFY.id,
            });
          }

          accountingVoucherId = voucher.id;
        }
      }
    }

    const updateData: any = {
      status: 'POSTED',
      postedAt: new Date(),
      postedBy: userId,
      updatedAt: new Date(),
    };
    if (accountingVoucherId) {
      updateData.accountingVoucherId = accountingVoucherId;
    }

    const [updatedBill] = await tx.update(subcontractBills).set(updateData)
      .where(and(eq(subcontractBills.id, billId), eq(subcontractBills.tenantId, tenantId)))
      .returning();

    await tx.update(subcontractJobs).set({
      status: 'BILLED',
      updatedAt: new Date(),
    }).where(and(eq(subcontractJobs.id, bill.subcontractJobId), eq(subcontractJobs.tenantId, tenantId)));

    return { bill: updatedBill, voucherId: accountingVoucherId };
  });
}

export async function getSubcontractJobTrace(tenantId: number, jobId: number) {
  const [job] = await db.select().from(subcontractJobs)
    .where(and(eq(subcontractJobs.id, jobId), eq(subcontractJobs.tenantId, tenantId)));

  if (!job) throw new Error('Subcontract job not found');

  const challans = await db.select().from(subcontractChallans)
    .where(and(eq(subcontractChallans.subcontractJobId, jobId), eq(subcontractChallans.tenantId, tenantId)))
    .orderBy(subcontractChallans.createdAt);

  const challanIds = challans.map(c => c.id);
  let allChallanLines: any[] = [];
  if (challanIds.length > 0) {
    allChallanLines = await db.select().from(subcontractChallanLines)
      .where(and(
        sql`${subcontractChallanLines.challanId} IN (${sql.join(challanIds.map(id => sql`${id}`), sql`, `)})`,
        eq(subcontractChallanLines.tenantId, tenantId)
      ));
  }

  const bills = await db.select().from(subcontractBills)
    .where(and(eq(subcontractBills.subcontractJobId, jobId), eq(subcontractBills.tenantId, tenantId)))
    .orderBy(subcontractBills.createdAt);

  const stockMoves = await db.select().from(stockLedger)
    .where(and(
      eq(stockLedger.docType, 'SUBCONTRACT'),
      eq(stockLedger.tenantId, tenantId),
      eq(stockLedger.isReversed, false),
      challanIds.length > 0
        ? sql`${stockLedger.docId} IN (${sql.join(challanIds.map(id => sql`${id}`), sql`, `)})`
        : sql`1=0`
    ))
    .orderBy(stockLedger.id);

  const voucherIds = bills.filter(b => b.accountingVoucherId).map(b => b.accountingVoucherId!);

  const outboundChallans = challans.filter(c => c.direction === 'OUTBOUND');
  const inboundChallans = challans.filter(c => c.direction === 'INBOUND');
  const pendingPostingCount = challans.filter(c => c.status === 'DRAFT').length;

  return {
    job,
    outboundChallans,
    inboundChallans,
    challanLines: allChallanLines,
    bills,
    stockMoves,
    voucherIds,
    metrics: {
      pendingPostingCount,
      totalSent: parseFloat(job.sentQty || '0'),
      totalReceived: parseFloat(job.receivedQty || '0'),
      totalRejected: parseFloat(job.rejectedQty || '0'),
    },
  };
}

export async function getSubcontractJob(tenantId: number, jobId: number) {
  const [job] = await db.select().from(subcontractJobs)
    .where(and(eq(subcontractJobs.id, jobId), eq(subcontractJobs.tenantId, tenantId)));

  if (!job) throw new Error('Subcontract job not found');

  const challans = await db.select().from(subcontractChallans)
    .where(and(eq(subcontractChallans.subcontractJobId, jobId), eq(subcontractChallans.tenantId, tenantId)));

  const bills = await db.select().from(subcontractBills)
    .where(and(eq(subcontractBills.subcontractJobId, jobId), eq(subcontractBills.tenantId, tenantId)));

  return { job, challans, bills };
}

export async function listSubcontractJobs(
  tenantId: number,
  filters: { status?: string; jobType?: string; partyId?: number }
) {
  const conditions: any[] = [eq(subcontractJobs.tenantId, tenantId)];

  if (filters.status) {
    conditions.push(eq(subcontractJobs.status, filters.status));
  }
  if (filters.jobType) {
    conditions.push(eq(subcontractJobs.jobType, filters.jobType));
  }
  if (filters.partyId) {
    conditions.push(eq(subcontractJobs.partyId, filters.partyId));
  }

  return db.select().from(subcontractJobs)
    .where(and(...conditions))
    .orderBy(desc(subcontractJobs.createdAt));
}
