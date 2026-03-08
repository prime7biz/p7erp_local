import { db } from "../../db";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import {
  vouchers,
  voucherItems,
  voucherTypes,
  voucherStatus,
  voucherWorkflow,
  voucherApprovalHistory,
  chartOfAccounts,
  ledgerPostings,
  fiscalYears,
  users,
  type Voucher,
  type VoucherItem,
  type VoucherType,
  type VoucherStatus,
  type VoucherWorkflow,
  type VoucherApprovalHistory,
  type InsertVoucher,
  type InsertVoucherItem,
  type InsertVoucherType,
  type InsertVoucherStatus,
  type InsertVoucherWorkflow,
  type InsertVoucherApprovalHistory,
} from "../../../shared/schema";

export const getAllVoucherTypes = async (tenantId: number) => {
  try {
    return await db
      .select()
      .from(voucherTypes)
      .where(eq(voucherTypes.tenantId, tenantId))
      .orderBy(voucherTypes.code);
  } catch (error) {
    console.error("Error in getAllVoucherTypes:", error);
    throw error;
  }
};

export const getVoucherTypeById = async (id: number, tenantId: number) => {
  try {
    const results = await db
      .select()
      .from(voucherTypes)
      .where(and(eq(voucherTypes.id, id), eq(voucherTypes.tenantId, tenantId)));
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error("Error in getVoucherTypeById:", error);
    throw error;
  }
};

export const createVoucherType = async (data: InsertVoucherType) => {
  try {
    const [result] = await db.insert(voucherTypes).values(data).returning();
    return result;
  } catch (error) {
    console.error("Error in createVoucherType:", error);
    throw error;
  }
};

export const updateVoucherType = async (id: number, tenantId: number, data: Partial<InsertVoucherType>) => {
  try {
    const [result] = await db
      .update(voucherTypes)
      .set(data)
      .where(and(eq(voucherTypes.id, id), eq(voucherTypes.tenantId, tenantId)))
      .returning();
    return result;
  } catch (error) {
    console.error("Error in updateVoucherType:", error);
    throw error;
  }
};

export const getAllVoucherStatuses = async (tenantId: number) => {
  try {
    return await db
      .select()
      .from(voucherStatus)
      .where(eq(voucherStatus.tenantId, tenantId))
      .orderBy(voucherStatus.sequence);
  } catch (error) {
    console.error("Error in getAllVoucherStatuses:", error);
    throw error;
  }
};

export const getVoucherStatusById = async (id: number, tenantId: number) => {
  try {
    const results = await db
      .select()
      .from(voucherStatus)
      .where(and(eq(voucherStatus.id, id), eq(voucherStatus.tenantId, tenantId)));
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error("Error in getVoucherStatusById:", error);
    throw error;
  }
};

export const createVoucherStatus = async (data: InsertVoucherStatus) => {
  try {
    const [result] = await db.insert(voucherStatus).values(data).returning();
    return result;
  } catch (error) {
    console.error("Error in createVoucherStatus:", error);
    throw error;
  }
};

export const updateVoucherStatus = async (id: number, tenantId: number, data: Partial<InsertVoucherStatus>) => {
  try {
    const [result] = await db
      .update(voucherStatus)
      .set(data)
      .where(and(eq(voucherStatus.id, id), eq(voucherStatus.tenantId, tenantId)))
      .returning();
    return result;
  } catch (error) {
    console.error("Error in updateVoucherStatus:", error);
    throw error;
  }
};

export const getWorkflowsByVoucherType = async (voucherTypeId: number, tenantId: number) => {
  try {
    return await db
      .select({
        id: voucherWorkflow.id,
        voucherTypeId: voucherWorkflow.voucherTypeId,
        fromStatusId: voucherWorkflow.fromStatusId,
        fromStatusName: voucherStatus.name,
        toStatusId: voucherWorkflow.toStatusId,
        toStatusName: voucherStatus.name,
        actionName: voucherWorkflow.actionName,
        requiredRole: voucherWorkflow.requiredRole,
        description: voucherWorkflow.description,
      })
      .from(voucherWorkflow)
      .leftJoin(voucherStatus, eq(voucherWorkflow.toStatusId, voucherStatus.id))
      .where(
        and(
          eq(voucherWorkflow.voucherTypeId, voucherTypeId), 
          eq(voucherWorkflow.tenantId, tenantId)
        )
      );
  } catch (error) {
    console.error("Error in getWorkflowsByVoucherType:", error);
    throw error;
  }
};

export const createVoucherWorkflow = async (data: InsertVoucherWorkflow) => {
  try {
    const [result] = await db.insert(voucherWorkflow).values(data).returning();
    return result;
  } catch (error) {
    console.error("Error in createVoucherWorkflow:", error);
    throw error;
  }
};

export const updateVoucherWorkflow = async (id: number, tenantId: number, data: Partial<InsertVoucherWorkflow>) => {
  try {
    const [result] = await db
      .update(voucherWorkflow)
      .set(data)
      .where(and(eq(voucherWorkflow.id, id), eq(voucherWorkflow.tenantId, tenantId)))
      .returning();
    return result;
  } catch (error) {
    console.error("Error in updateVoucherWorkflow:", error);
    throw error;
  }
};

export const deleteVoucherWorkflow = async (id: number, tenantId: number) => {
  try {
    await db
      .delete(voucherWorkflow)
      .where(and(eq(voucherWorkflow.id, id), eq(voucherWorkflow.tenantId, tenantId)));
    return true;
  } catch (error) {
    console.error("Error in deleteVoucherWorkflow:", error);
    throw error;
  }
};

export const getAllVouchers = async (tenantId: number, filters: any = {}) => {
  try {
    const conditions: any[] = [eq(vouchers.tenantId, tenantId)];

    if (filters.voucherTypeId) {
      conditions.push(eq(vouchers.voucherTypeId, filters.voucherTypeId));
    }
    if (filters.statusId) {
      conditions.push(eq(vouchers.statusId, filters.statusId));
    }
    if (filters.isPosted !== undefined) {
      conditions.push(eq(vouchers.isPosted, filters.isPosted));
    }
    if (filters.fromDate && filters.toDate) {
      conditions.push(sql`${vouchers.voucherDate} BETWEEN ${filters.fromDate} AND ${filters.toDate}`);
    } else if (filters.fromDate) {
      conditions.push(sql`${vouchers.voucherDate} >= ${filters.fromDate}`);
    } else if (filters.toDate) {
      conditions.push(sql`${vouchers.voucherDate} <= ${filters.toDate}`);
    }
    if (filters.minAmount) {
      conditions.push(sql`${vouchers.amount} >= ${filters.minAmount}`);
    }
    if (filters.maxAmount) {
      conditions.push(sql`${vouchers.amount} <= ${filters.maxAmount}`);
    }
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(sql`(${vouchers.voucherNumber} LIKE ${searchTerm} OR ${vouchers.reference} LIKE ${searchTerm} OR ${vouchers.description} LIKE ${searchTerm})`);
    }

    return await db
      .select({
        id: vouchers.id,
        voucherNumber: vouchers.voucherNumber,
        voucherDate: vouchers.voucherDate,
        postingDate: vouchers.postingDate,
        voucherTypeId: vouchers.voucherTypeId,
        voucherTypeName: voucherTypes.name,
        statusId: vouchers.statusId,
        statusName: voucherStatus.name,
        statusColor: voucherStatus.color,
        amount: vouchers.amount,
        description: vouchers.description,
        reference: vouchers.reference,
        isPosted: vouchers.isPosted,
        isCancelled: vouchers.isCancelled,
        entityType: vouchers.entityType,
        entityId: vouchers.entityId,
        preparedById: vouchers.preparedById,
        preparedByName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        createdAt: vouchers.createdAt,
      })
      .from(vouchers)
      .leftJoin(voucherTypes, eq(vouchers.voucherTypeId, voucherTypes.id))
      .leftJoin(voucherStatus, eq(vouchers.statusId, voucherStatus.id))
      .leftJoin(users, eq(vouchers.preparedById, users.id))
      .where(and(...conditions))
      .orderBy(desc(vouchers.createdAt));
  } catch (error) {
    console.error("Error in getAllVouchers:", error);
    throw error;
  }
};

export const getVoucherById = async (id: number, tenantId: number) => {
  try {
    const results = await db
      .select({
        id: vouchers.id,
        voucherNumber: vouchers.voucherNumber,
        voucherDate: vouchers.voucherDate,
        postingDate: vouchers.postingDate,
        voucherTypeId: vouchers.voucherTypeId,
        voucherTypeName: voucherTypes.name,
        fiscalYearId: vouchers.fiscalYearId,
        accountingPeriodId: vouchers.accountingPeriodId,
        statusId: vouchers.statusId,
        statusName: voucherStatus.name,
        statusColor: voucherStatus.color,
        reference: vouchers.reference,
        referenceDate: vouchers.referenceDate,
        description: vouchers.description,
        preparedById: vouchers.preparedById,
        preparedByName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as('preparedByName'),
        approvedById: vouchers.approvedById,
        approvedDate: vouchers.approvedDate,
        rejectedById: vouchers.rejectedById,
        rejectionReason: vouchers.rejectionReason,
        rejectedDate: vouchers.rejectedDate,
        entityType: vouchers.entityType,
        entityId: vouchers.entityId,
        amount: vouchers.amount,
        currencyCode: vouchers.currencyCode,
        exchangeRate: vouchers.exchangeRate,
        baseCurrencyAmount: vouchers.baseCurrencyAmount,
        journalId: vouchers.journalId,
        isPosted: vouchers.isPosted,
        postingReference: vouchers.postingReference,
        isCancelled: vouchers.isCancelled,
        cancellationReason: vouchers.cancellationReason,
        cancelledById: vouchers.cancelledById,
        cancellationDate: vouchers.cancellationDate,
        attachments: vouchers.attachments,
        notes: vouchers.notes,
        tags: vouchers.tags,
        customFields: vouchers.customFields,
        aiSummary: vouchers.aiSummary,
        verificationCode: vouchers.verificationCode,
        createdAt: vouchers.createdAt,
        updatedAt: vouchers.updatedAt,
      })
      .from(vouchers)
      .leftJoin(voucherTypes, eq(vouchers.voucherTypeId, voucherTypes.id))
      .leftJoin(voucherStatus, eq(vouchers.statusId, voucherStatus.id))
      .leftJoin(users, eq(vouchers.preparedById, users.id))
      .where(and(eq(vouchers.id, id), eq(vouchers.tenantId, tenantId)));
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error("Error in getVoucherById:", error);
    throw error;
  }
};

export const getVoucherByNumber = async (voucherNumber: string, tenantId: number) => {
  try {
    const results = await db
      .select()
      .from(vouchers)
      .where(
        and(
          eq(vouchers.voucherNumber, voucherNumber), 
          eq(vouchers.tenantId, tenantId)
        )
      );
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error("Error in getVoucherByNumber:", error);
    throw error;
  }
};

export const createVoucher = async (data: InsertVoucher) => {
  try {
    // Start a transaction
    return await db.transaction(async (tx) => {
      const voucherType = await tx.execute(
        sql`SELECT * FROM voucher_types WHERE id = ${data.voucherTypeId} FOR UPDATE`
      ).then(r => r.rows);
      
      if (voucherType.length === 0) {
        throw new Error("Voucher type not found");
      }
      
      const nextNumber = (voucherType[0] as any).next_number;
      const prefix = (voucherType[0] as any).prefix;
      
      // Format the voucher number
      const voucherNumber = `${prefix}-${nextNumber.toString().padStart(6, '0')}`;
      
      // Create the voucher
      const [voucher] = await tx
        .insert(vouchers)
        .values({
          ...data,
          voucherNumber,
        })
        .returning();
      
      // Update the next number in voucher type
      await tx
        .update(voucherTypes)
        .set({ nextNumber: nextNumber + 1 })
        .where(eq(voucherTypes.id, data.voucherTypeId));
      
      return voucher;
    });
  } catch (error) {
    console.error("Error in createVoucher:", error);
    throw error;
  }
};

export const updateVoucher = async (id: number, tenantId: number, data: Partial<InsertVoucher>) => {
  try {
    const [result] = await db
      .update(vouchers)
      .set(data)
      .where(and(eq(vouchers.id, id), eq(vouchers.tenantId, tenantId)))
      .returning();
    return result;
  } catch (error) {
    console.error("Error in updateVoucher:", error);
    throw error;
  }
};

export const getVoucherItems = async (voucherId: number, tenantId: number) => {
  try {
    return await db
      .select({
        id: voucherItems.id,
        voucherId: voucherItems.voucherId,
        lineNumber: voucherItems.lineNumber,
        accountId: voucherItems.accountId,
        accountCode: chartOfAccounts.accountNumber,
        accountName: chartOfAccounts.name,
        description: voucherItems.description,
        debitAmount: voucherItems.debitAmount,
        creditAmount: voucherItems.creditAmount,
        baseCurrencyDebit: voucherItems.baseCurrencyDebit,
        baseCurrencyCreditAmount: voucherItems.baseCurrencyCreditAmount,
        taxAmount: voucherItems.taxAmount,
        taxPercentage: voucherItems.taxPercentage,
        reference: voucherItems.reference,
        entityType: voucherItems.entityType,
        entityId: voucherItems.entityId,
      })
      .from(voucherItems)
      .leftJoin(chartOfAccounts, eq(voucherItems.accountId, chartOfAccounts.id))
      .where(
        and(
          eq(voucherItems.voucherId, voucherId), 
          eq(voucherItems.tenantId, tenantId)
        )
      )
      .orderBy(voucherItems.lineNumber);
  } catch (error) {
    console.error("Error in getVoucherItems:", error);
    throw error;
  }
};

export const createVoucherItem = async (data: InsertVoucherItem) => {
  try {
    const [result] = await db.insert(voucherItems).values(data).returning();
    return result;
  } catch (error) {
    console.error("Error in createVoucherItem:", error);
    throw error;
  }
};

export const updateVoucherItem = async (id: number, tenantId: number, data: Partial<InsertVoucherItem>) => {
  try {
    const [result] = await db
      .update(voucherItems)
      .set(data)
      .where(and(eq(voucherItems.id, id), eq(voucherItems.tenantId, tenantId)))
      .returning();
    return result;
  } catch (error) {
    console.error("Error in updateVoucherItem:", error);
    throw error;
  }
};

export const deleteVoucherItem = async (id: number, tenantId: number) => {
  try {
    await db
      .delete(voucherItems)
      .where(and(eq(voucherItems.id, id), eq(voucherItems.tenantId, tenantId)));
    return true;
  } catch (error) {
    console.error("Error in deleteVoucherItem:", error);
    throw error;
  }
};

export const getVoucherApprovalHistory = async (voucherId: number, tenantId: number) => {
  try {
    const results = await db.execute(sql`
      SELECT 
        vah.id, vah.voucher_id as "voucherId", 
        vah.from_status_id as "fromStatusId", fs.name as "fromStatusName",
        vah.to_status_id as "toStatusId", ts.name as "toStatusName",
        vah.action_name as "actionName", vah.action_by_id as "actionById",
        CONCAT(u.first_name, ' ', u.last_name) as "actionByName",
        vah.comments, vah.action_date as "actionDate"
      FROM voucher_approval_history vah
      LEFT JOIN voucher_status fs ON vah.from_status_id = fs.id
      LEFT JOIN voucher_status ts ON vah.to_status_id = ts.id
      LEFT JOIN users u ON vah.action_by_id = u.id
      WHERE vah.voucher_id = ${voucherId} AND vah.tenant_id = ${tenantId}
      ORDER BY vah.action_date ASC
    `);
    return results.rows;
  } catch (error) {
    console.error("Error in getVoucherApprovalHistory:", error);
    throw error;
  }
};

export const createVoucherApprovalHistory = async (data: InsertVoucherApprovalHistory) => {
  try {
    const [result] = await db.insert(voucherApprovalHistory).values(data).returning();
    return result;
  } catch (error) {
    console.error("Error in createVoucherApprovalHistory:", error);
    throw error;
  }
};

export const changeVoucherStatus = async (
  voucherId: number, 
  tenantId: number, 
  statusId: number, 
  userId: number, 
  actionName: string,
  comments?: string
) => {
  try {
    return await db.transaction(async (tx) => {
      // Get current voucher with status, voucherTypeId, isPosted, isCancelled
      const voucherResult = await tx
        .select({
          id: vouchers.id,
          statusId: vouchers.statusId,
          voucherTypeId: vouchers.voucherTypeId,
          isPosted: vouchers.isPosted,
          isCancelled: vouchers.isCancelled,
        })
        .from(vouchers)
        .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)));
      
      if (voucherResult.length === 0) {
        throw new Error("Voucher not found");
      }
      
      const currentVoucher = voucherResult[0];

      if (currentVoucher.isPosted) {
        throw new Error("Cannot change status of a posted voucher");
      }

      if (currentVoucher.isCancelled) {
        throw new Error("Cannot change status of a cancelled voucher");
      }

      const workflowMatch = await tx
        .select({ id: voucherWorkflow.id })
        .from(voucherWorkflow)
        .where(
          and(
            eq(voucherWorkflow.voucherTypeId, currentVoucher.voucherTypeId),
            eq(voucherWorkflow.fromStatusId, currentVoucher.statusId!),
            eq(voucherWorkflow.toStatusId, statusId),
            eq(voucherWorkflow.tenantId, tenantId)
          )
        );

      if (workflowMatch.length === 0) {
        throw new Error("Invalid status transition");
      }
      
      const isPostAction = actionName.toLowerCase() === 'post';
      
      if (isPostAction && currentVoucher.isPosted) {
        throw new Error("Voucher is already posted");
      }

      // For posting, check no existing ledger postings (idempotency guard)
      if (isPostAction) {
        const existingPostings = await tx
          .select({ id: ledgerPostings.id })
          .from(ledgerPostings)
          .where(and(eq(ledgerPostings.voucherId, voucherId), eq(ledgerPostings.tenantId, tenantId)))
          .limit(1);
        if (existingPostings.length > 0) {
          throw new Error("Ledger postings already exist for this voucher");
        }
      }

      // Get voucher's existing postingDate for use below
      const [fullVoucher] = await tx
        .select()
        .from(vouchers)
        .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)));

      const updateFields: any = { statusId };
      if (isPostAction) {
        const effectivePostingDate = fullVoucher.postingDate || fullVoucher.voucherDate;
        updateFields.isPosted = true;
        updateFields.postedById = userId;
        updateFields.postedDate = new Date();
        updateFields.postingDate = effectivePostingDate;
      }
      
      const [updatedVoucher] = await tx
        .update(vouchers)
        .set(updateFields)
        .where(eq(vouchers.id, voucherId))
        .returning();
      
      if (isPostAction) {
        const items = await tx
          .select()
          .from(voucherItems)
          .where(and(eq(voucherItems.voucherId, voucherId), eq(voucherItems.tenantId, tenantId)))
          .orderBy(voucherItems.lineNumber);

        if (items.length === 0) {
          throw new Error("Voucher has no items - cannot post");
        }

        const [currentFiscalYear] = await tx
          .select()
          .from(fiscalYears)
          .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

        const fiscalYearId = currentFiscalYear?.id || updatedVoucher.fiscalYearId;
        const postingDate = updatedVoucher.postingDate || updatedVoucher.voucherDate;

        const postingRecords = items.map((item) => ({
          tenantId,
          voucherId,
          voucherItemId: item.id,
          accountId: item.accountId,
          postingDate,
          debitAmount: item.debitAmount || "0",
          creditAmount: item.creditAmount || "0",
          narration: item.description || updatedVoucher.description || "",
          postedById: userId,
          fiscalYearId,
          accountingPeriodId: updatedVoucher.accountingPeriodId,
        }));

        await tx.insert(ledgerPostings).values(postingRecords);
      }

      // Record approval history
      const [historyEntry] = await tx
        .insert(voucherApprovalHistory)
        .values({
          voucherId,
          tenantId,
          fromStatusId: currentVoucher.statusId,
          toStatusId: statusId,
          actionName,
          actionById: userId,
          comments: comments || null,
        })
        .returning();
      
      return {
        voucher: updatedVoucher,
        historyEntry,
      };
    });
  } catch (error) {
    console.error("Error in changeVoucherStatus:", error);
    throw error;
  }
};

export const getVoucherTypesWithCounts = async (tenantId: number) => {
  try {
    const voucherTypesWithCounts = await db
      .select({
        id: voucherTypes.id,
        code: voucherTypes.code,
        name: voucherTypes.name,
        prefix: voucherTypes.prefix,
        totalCount: sql<number>`COUNT(${vouchers.id})`.as('totalCount'),
        draftCount: sql<number>`SUM(CASE WHEN ${vouchers.isPosted} = false AND ${vouchers.isCancelled} = false THEN 1 ELSE 0 END)`.as('draftCount'),
        postedCount: sql<number>`SUM(CASE WHEN ${vouchers.isPosted} = true THEN 1 ELSE 0 END)`.as('postedCount'),
        cancelledCount: sql<number>`SUM(CASE WHEN ${vouchers.isCancelled} = true THEN 1 ELSE 0 END)`.as('cancelledCount'),
      })
      .from(voucherTypes)
      .leftJoin(vouchers, eq(voucherTypes.id, vouchers.voucherTypeId))
      .where(eq(voucherTypes.tenantId, tenantId))
      .groupBy(voucherTypes.id, voucherTypes.code, voucherTypes.name, voucherTypes.prefix)
      .orderBy(voucherTypes.code);
    
    return voucherTypesWithCounts;
  } catch (error) {
    console.error("Error in getVoucherTypesWithCounts:", error);
    throw error;
  }
};

export const getVoucherSummaryByPeriod = async (tenantId: number, periodType: 'daily' | 'monthly' | 'yearly', limit: number = 30) => {
  try {
    let groupByExpression;
    
    if (periodType === 'daily') {
      groupByExpression = sql`DATE(${vouchers.voucherDate})`;
    } else if (periodType === 'monthly') {
      groupByExpression = sql`DATE_TRUNC('month', ${vouchers.voucherDate})`;
    } else {
      groupByExpression = sql`DATE_TRUNC('year', ${vouchers.voucherDate})`;
    }
    
    const summary = await db
      .select({
        period: groupByExpression.as('period'),
        count: sql<number>`COUNT(${vouchers.id})`.as('count'),
        totalAmount: sql<number>`SUM(${vouchers.amount})`.as('totalAmount'),
      })
      .from(vouchers)
      .where(eq(vouchers.tenantId, tenantId))
      .groupBy(groupByExpression)
      .orderBy(desc(groupByExpression))
      .limit(limit);
    
    return summary;
  } catch (error) {
    console.error("Error in getVoucherSummaryByPeriod:", error);
    throw error;
  }
};