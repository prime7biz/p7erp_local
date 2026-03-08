import { Router, Request, Response } from "express";
import { format, subMonths, differenceInDays } from "date-fns";
import { storage } from "../storage";
import { executeQuery } from "../db";
import { and, eq, between, gte, lte, sql } from "drizzle-orm";
import { vouchers, voucherTypes, voucherItems, voucherStatus, users, chartOfAccounts } from "../../shared/schema";
import { requireAnyPermission } from "../middleware/rbacMiddleware";

const router = Router();

router.use(requireAnyPermission(
  'accounts:voucher_register:read',
  'accounts:trial_balance:read',
  'accounts:pl:read',
  'accounts:balance_sheet:read'
));

// Get summary report data
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    // Get count and total amount by type
    const typeStats = await executeQuery(() => {
      return sql`
        SELECT 
          vt.name as "typeName",
          COUNT(v.id) as count,
          SUM(v.total_amount) as "totalAmount"
        FROM vouchers v
        JOIN voucher_types vt ON v.voucher_type_id = vt.id
        GROUP BY vt.name
        ORDER BY count DESC
      `;
    });

    // Get count and total amount by status
    const statusStats = await executeQuery(() => {
      return sql`
        SELECT 
          vs.name as "statusName",
          vs.color as "statusColor",
          COUNT(v.id) as count,
          SUM(v.total_amount) as "totalAmount"
        FROM vouchers v
        JOIN voucher_status vs ON v.status_id = vs.id
        GROUP BY vs.name, vs.color
        ORDER BY vs.name
      `;
    });

    // Get monthly trend (last 6 months)
    const sixMonthsAgo = subMonths(new Date(), 5);
    const monthlyTrend = await executeQuery(() => {
      return sql`
        SELECT 
          to_char(v.voucher_date, 'Mon') as month,
          COUNT(v.id) as count,
          SUM(v.total_amount) as "totalAmount"
        FROM vouchers v
        WHERE v.voucher_date >= ${sixMonthsAgo}
        GROUP BY to_char(v.voucher_date, 'Mon'), EXTRACT(MONTH FROM v.voucher_date)
        ORDER BY EXTRACT(MONTH FROM v.voucher_date)
      `;
    });

    // Get top voucher preparers
    const topPreparers = await executeQuery(() => {
      return sql`
        SELECT 
          u.username as "userName",
          COUNT(v.id) as count,
          SUM(v.total_amount) as "totalAmount"
        FROM vouchers v
        JOIN users u ON v.created_by = u.id
        GROUP BY u.username
        ORDER BY COUNT(v.id) DESC
        LIMIT 5
      `;
    });

    // Extract the rows arrays from query results
    res.json({
      typeStats: Array.isArray(typeStats) ? typeStats : (typeStats?.rows || []),
      statusStats: Array.isArray(statusStats) ? statusStats : (statusStats?.rows || []),
      monthlyTrend: Array.isArray(monthlyTrend) ? monthlyTrend : (monthlyTrend?.rows || []),
      topPreparers: Array.isArray(topPreparers) ? topPreparers : (topPreparers?.rows || [])
    });
  } catch (error) {
    console.error("Error generating voucher summary report:", error);
    res.status(500).json({ message: "Failed to generate voucher summary report" });
  }
});

// Get account activity report
router.get("/account-activity/:accountId", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { from, to } = req.query;

    if (!accountId) {
      return res.status(400).json({ message: "Account ID is required" });
    }

    const fromDate = from ? new Date(from as string) : subMonths(new Date(), 1);
    const toDate = to ? new Date(to as string) : new Date();

    // Get account details
    const accountResult = await executeQuery(() => {
      return sql`
        SELECT 
          id, 
          account_code as "accountCode", 
          name,
          current_balance as "balance",
          parent_id as "parentId",
          account_type_id as "accountTypeId",
          is_active as "isActive"
        FROM chart_of_accounts
        WHERE id = ${parseInt(accountId)}
      `;
    });

    if (!accountResult || accountResult.length === 0) {
      return res.status(404).json({ message: "Account not found" });
    }

    const account = accountResult[0];

    // Get transactions for the account
    const transactions = await executeQuery(() => {
      return sql`
        WITH account_transactions AS (
          SELECT 
            v.id,
            v.voucher_date as "voucherDate",
            v.reference,
            v.description,
            vt.code as "voucherTypeCode",
            vt.name as "voucherType",
            v.voucher_number as "voucherNumber",
            vi.debit_amount as "debitAmount",
            vi.credit_amount as "creditAmount",
            vi.description as "lineDescription",
            ROW_NUMBER() OVER (ORDER BY v.voucher_date, v.id) as row_num
          FROM voucher_items vi
          JOIN vouchers v ON vi.voucher_id = v.id
          JOIN voucher_types vt ON v.voucher_type_id = vt.id
          WHERE vi.account_id = ${parseInt(accountId)}
          AND v.voucher_date BETWEEN ${fromDate} AND ${toDate}
          ORDER BY v.voucher_date, v.id
        )
        SELECT 
          id,
          "voucherDate",
          reference,
          description,
          "voucherTypeCode",
          "voucherType",
          "voucherNumber",
          "debitAmount",
          "creditAmount",
          "lineDescription",
          SUM("debitAmount" - "creditAmount") OVER (ORDER BY row_num ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as balance
        FROM account_transactions
        ORDER BY "voucherDate", id
      `;
    });

    // Extract the rows arrays from query results
    res.json({
      account: accountResult?.rows?.[0] || account,
      transactions: Array.isArray(transactions) ? transactions : (transactions?.rows || []),
      fromDate: format(fromDate, "yyyy-MM-dd"),
      toDate: format(toDate, "yyyy-MM-dd")
    });
  } catch (error) {
    console.error("Error generating account activity report:", error);
    res.status(500).json({ message: "Failed to generate account activity report" });
  }
});

// Get aging report
router.get("/aging", async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const voucherTypeCode = type as string;
    
    const today = new Date();
    const allVouchers = await executeQuery(() => {
      const baseQuery = sql`
        SELECT 
          v.id,
          v.voucher_number as "voucherNumber",
          v.voucher_date as "voucherDate",
          v.due_date as "dueDate",
          v.reference,
          v.description,
          v.total_amount as amount,
          vt.name as "voucherTypeName",
          vt.code as "voucherTypeCode",
          vs.name as "statusName",
          CASE 
            WHEN v.due_date IS NULL THEN 
              EXTRACT(DAY FROM (${today}::date - v.voucher_date::date))::integer
            ELSE
              EXTRACT(DAY FROM (${today}::date - v.due_date::date))::integer
          END as days_aging
        FROM vouchers v
        JOIN voucher_types vt ON v.voucher_type_id = vt.id
        JOIN voucher_status vs ON v.status_id = vs.id
        WHERE vs.name != 'Completed' AND vs.name != 'Voided'
      `;

      if (voucherTypeCode) {
        return sql`
          ${baseQuery}
          AND vt.code = ${voucherTypeCode}
          ORDER BY days_aging DESC
        `;
      } else {
        return sql`
          ${baseQuery}
          ORDER BY days_aging DESC
        `;
      }
    });

    // Group vouchers by aging buckets
    const aging = {
      current: [] as any[],
      "1_30": [] as any[],
      "31_60": [] as any[],
      "61_90": [] as any[],
      over_90: [] as any[]
    };

    // Track totals
    const totals = {
      current: 0,
      "1_30": 0,
      "31_60": 0,
      "61_90": 0,
      over_90: 0
    };

    // Extract rows from query result and sort vouchers into buckets
    const voucherList = Array.isArray(allVouchers) ? allVouchers : (allVouchers?.rows || []);
    
    voucherList.forEach((voucher: any) => {
      const daysAging = voucher.days_aging;
      
      if (daysAging <= 0) {
        aging.current.push(voucher);
        totals.current += parseFloat(voucher.amount);
      } else if (daysAging <= 30) {
        aging["1_30"].push(voucher);
        totals["1_30"] += parseFloat(voucher.amount);
      } else if (daysAging <= 60) {
        aging["31_60"].push(voucher);
        totals["31_60"] += parseFloat(voucher.amount);
      } else if (daysAging <= 90) {
        aging["61_90"].push(voucher);
        totals["61_90"] += parseFloat(voucher.amount);
      } else {
        aging.over_90.push(voucher);
        totals.over_90 += parseFloat(voucher.amount);
      }
    });

    res.json({
      aging,
      totals,
      generatedDate: format(today, "yyyy-MM-dd")
    });
  } catch (error) {
    console.error("Error generating aging report:", error);
    res.status(500).json({ message: "Failed to generate aging report" });
  }
});

export default router;