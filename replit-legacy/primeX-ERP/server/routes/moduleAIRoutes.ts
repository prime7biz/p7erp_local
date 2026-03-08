import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../db';
import { sql, eq, and } from 'drizzle-orm';
import {
  getPartyAnalysisInsights,
  getBillWiseInsights,
  getCostCenterInsights,
  getDeliveryGatePassInsights,
} from '../services/erpAIService';

const router = express.Router();

router.post('/party-analysis', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { partyId } = req.body;

    if (!partyId) {
      return res.status(400).json({ message: 'partyId is required' });
    }

    let partyData: any = {};
    let totalOutstanding = 0;
    let totalBills = 0;
    let overdueAmount = 0;
    let overdueBills = 0;
    let recentTransactions: any[] = [];

    try {
      const [party] = await db.execute(sql`
        SELECT id, name, party_type, credit_limit, credit_period_days, is_active
        FROM parties WHERE id = ${partyId} AND tenant_id = ${tenantId}
      `) as unknown as any[];
      if (party) partyData = party;
    } catch (e) {
      console.log('Could not fetch party:', e);
    }

    try {
      const billStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_bills,
          COALESCE(SUM(CAST(pending_amount AS DECIMAL)), 0) as total_outstanding,
          COALESCE(SUM(CASE WHEN due_date < NOW() AND CAST(pending_amount AS DECIMAL) > 0 THEN CAST(pending_amount AS DECIMAL) ELSE 0 END), 0) as overdue_amount,
          COUNT(CASE WHEN due_date < NOW() AND CAST(pending_amount AS DECIMAL) > 0 THEN 1 END) as overdue_bills
        FROM bill_references 
        WHERE party_id = ${partyId} AND tenant_id = ${tenantId} AND status != 'CANCELLED'
      `) as unknown as any[];
      if (billStats.length > 0) {
        totalBills = parseInt(billStats[0].total_bills as string) || 0;
        totalOutstanding = parseFloat(billStats[0].total_outstanding as string) || 0;
        overdueAmount = parseFloat(billStats[0].overdue_amount as string) || 0;
        overdueBills = parseInt(billStats[0].overdue_bills as string) || 0;
      }
    } catch (e) {
      console.log('Could not fetch bill stats:', e);
    }

    try {
      const txns = await db.execute(sql`
        SELECT je.id, je.debit_amount, je.credit_amount, v.voucher_date, v.narration
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        JOIN parties p ON p.ledger_account_id = coa.id
        WHERE p.id = ${partyId} AND p.tenant_id = ${tenantId}
        ORDER BY v.voucher_date DESC LIMIT 10
      `) as unknown as any[];
      recentTransactions = txns || [];
    } catch (e) {
      console.log('Could not fetch transactions:', e);
    }

    const insights = await getPartyAnalysisInsights({
      partyName: partyData.name || 'Unknown',
      partyType: partyData.party_type || 'vendor',
      totalOutstanding,
      totalBills,
      overdueAmount,
      overdueBills,
      averagePaymentDays: 0,
      creditLimit: parseFloat(partyData.credit_limit || '0'),
      creditPeriodDays: partyData.credit_period_days || 0,
      recentTransactions,
    });

    return res.json({ insights });
  } catch (error: any) {
    console.error('Party analysis insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get party analysis insights' });
  }
});

router.post('/bill-wise', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    let totalReceivable = 0;
    let totalPayable = 0;
    let overdueReceivable = 0;
    let overduePayable = 0;
    let agingBuckets: any[] = [];
    let topOverdueParties: any[] = [];

    try {
      const summary = await db.execute(sql`
        SELECT 
          bill_type,
          COALESCE(SUM(CAST(pending_amount AS DECIMAL)), 0) as total_pending,
          COALESCE(SUM(CASE WHEN due_date < NOW() AND CAST(pending_amount AS DECIMAL) > 0 THEN CAST(pending_amount AS DECIMAL) ELSE 0 END), 0) as overdue_amount
        FROM bill_references 
        WHERE tenant_id = ${tenantId} AND status != 'CANCELLED' AND status != 'SETTLED'
        GROUP BY bill_type
      `) as unknown as any[];
      for (const row of summary) {
        if (row.bill_type === 'RECEIVABLE') {
          totalReceivable = parseFloat(row.total_pending as string) || 0;
          overdueReceivable = parseFloat(row.overdue_amount as string) || 0;
        } else if (row.bill_type === 'PAYABLE') {
          totalPayable = parseFloat(row.total_pending as string) || 0;
          overduePayable = parseFloat(row.overdue_amount as string) || 0;
        }
      }
    } catch (e) {
      console.log('Could not fetch bill summary:', e);
    }

    try {
      const aging = await db.execute(sql`
        SELECT 
          CASE 
            WHEN due_date >= NOW() - INTERVAL '30 days' THEN '0-30'
            WHEN due_date >= NOW() - INTERVAL '60 days' THEN '31-60'
            WHEN due_date >= NOW() - INTERVAL '90 days' THEN '61-90'
            ELSE '90+'
          END as bucket,
          COALESCE(SUM(CASE WHEN bill_type = 'RECEIVABLE' THEN CAST(pending_amount AS DECIMAL) ELSE 0 END), 0) as receivable,
          COALESCE(SUM(CASE WHEN bill_type = 'PAYABLE' THEN CAST(pending_amount AS DECIMAL) ELSE 0 END), 0) as payable
        FROM bill_references 
        WHERE tenant_id = ${tenantId} AND status != 'CANCELLED' AND status != 'SETTLED' AND due_date IS NOT NULL
        GROUP BY bucket ORDER BY bucket
      `) as unknown as any[];
      agingBuckets = (aging || []).map((r: any) => ({
        bucket: r.bucket,
        receivable: parseFloat(r.receivable as string) || 0,
        payable: parseFloat(r.payable as string) || 0,
      }));
    } catch (e) {
      console.log('Could not fetch aging data:', e);
    }

    try {
      const overdue = await db.execute(sql`
        SELECT p.name, 
          COALESCE(SUM(CAST(b.pending_amount AS DECIMAL)), 0) as amount,
          COALESCE(MAX(EXTRACT(DAY FROM NOW() - b.due_date)::INTEGER), 0) as days
        FROM bill_references b
        JOIN parties p ON b.party_id = p.id
        WHERE b.tenant_id = ${tenantId} AND b.due_date < NOW() AND CAST(b.pending_amount AS DECIMAL) > 0
          AND b.status != 'CANCELLED' AND b.status != 'SETTLED'
        GROUP BY p.id, p.name
        ORDER BY amount DESC LIMIT 10
      `) as unknown as any[];
      topOverdueParties = (overdue || []).map((r: any) => ({
        name: r.name,
        amount: parseFloat(r.amount as string) || 0,
        days: parseInt(r.days as string) || 0,
      }));
    } catch (e) {
      console.log('Could not fetch overdue parties:', e);
    }

    const insights = await getBillWiseInsights({
      totalReceivable,
      totalPayable,
      overdueReceivable,
      overduePayable,
      agingBuckets,
      topOverdueParties,
    });

    return res.json({ insights });
  } catch (error: any) {
    console.error('Bill-wise insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get bill-wise insights' });
  }
});

router.post('/cost-center/:costCenterId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const costCenterId = parseIntParam(req.params.costCenterId, "costCenterId");

    if (!costCenterId || isNaN(costCenterId)) {
      return res.status(400).json({ message: 'Valid costCenterId is required' });
    }

    let orderNumber = '';
    let styleName = '';
    let totalPlanned = 0;
    let totalActual = 0;
    let totalVariance = 0;
    let categories: any[] = [];
    let profitMargin = 0;

    try {
      const ccData = await db.execute(sql`
        SELECT cc.id, o.order_number, o.style_name, o.total_quantity,
          COALESCE(o.total_amount, 0) as order_value
        FROM cost_centers cc
        LEFT JOIN orders o ON cc.order_id = o.id
        WHERE cc.id = ${costCenterId} AND cc.tenant_id = ${tenantId}
      `) as unknown as any[];
      if (ccData.length > 0) {
        orderNumber = ccData[0].order_number as string || `CC-${costCenterId}`;
        styleName = ccData[0].style_name as string || 'N/A';
      }
    } catch (e) {
      console.log('Could not fetch cost center:', e);
      orderNumber = `CC-${costCenterId}`;
    }

    try {
      const budgetData = await db.execute(sql`
        SELECT 
          ccc.name as category_name,
          COALESCE(SUM(ccb.planned_amount), 0) as planned,
          0 as actual
        FROM cost_center_budgets ccb
        JOIN cost_center_categories ccc ON ccb.category_id = ccc.id
        WHERE ccb.cost_center_id = ${costCenterId} AND ccb.tenant_id = ${tenantId}
        GROUP BY ccc.name
      `) as unknown as any[];
      categories = (budgetData || []).map((r: any) => ({
        name: r.category_name,
        planned: parseFloat(r.planned as string) || 0,
        actual: parseFloat(r.actual as string) || 0,
        variance: (parseFloat(r.planned as string) || 0) - (parseFloat(r.actual as string) || 0),
      }));
      totalPlanned = categories.reduce((s, c) => s + c.planned, 0);
      totalActual = categories.reduce((s, c) => s + c.actual, 0);
      totalVariance = totalPlanned - totalActual;
    } catch (e) {
      console.log('Could not fetch budget data:', e);
    }

    profitMargin = totalPlanned > 0 ? ((totalVariance / totalPlanned) * 100) : 0;

    const insights = await getCostCenterInsights({
      orderNumber,
      styleName,
      totalPlanned,
      totalActual,
      totalVariance,
      categories,
      profitMargin,
    });

    return res.json({ insights });
  } catch (error: any) {
    console.error('Cost center insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get cost center insights' });
  }
});

router.post('/delivery-security', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    let totalChallans = 0;
    let totalGatePasses = 0;
    let pendingGatePasses = 0;
    let challansByStatus: Record<string, number> = {};
    let recentAnomalies: any[] = [];

    try {
      const challanStats = await db.execute(sql`
        SELECT status, COUNT(*) as count
        FROM delivery_challans 
        WHERE tenant_id = ${tenantId}
        GROUP BY status
      `) as unknown as any[];
      for (const row of challanStats) {
        const status = row.status as string;
        const count = parseInt(row.count as string) || 0;
        challansByStatus[status] = count;
        totalChallans += count;
      }
    } catch (e) {
      console.log('Could not fetch challan stats:', e);
    }

    try {
      const gpStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' OR status = 'PENDING' THEN 1 END) as pending
        FROM enhanced_gate_passes 
        WHERE tenant_id = ${tenantId}
      `) as unknown as any[];
      if (gpStats.length > 0) {
        totalGatePasses = parseInt(gpStats[0].total as string) || 0;
        pendingGatePasses = parseInt(gpStats[0].pending as string) || 0;
      }
    } catch (e) {
      console.log('Could not fetch gate pass stats:', e);
    }

    const insights = await getDeliveryGatePassInsights({
      totalChallans,
      totalGatePasses,
      pendingGatePasses,
      averageProcessingTime: 0,
      recentAnomalies,
      challansByStatus,
    });

    return res.json({ insights });
  } catch (error: any) {
    console.error('Delivery security insights error:', error);
    return res.status(500).json({ message: error.message || 'Failed to get delivery security insights' });
  }
});

export default router;
