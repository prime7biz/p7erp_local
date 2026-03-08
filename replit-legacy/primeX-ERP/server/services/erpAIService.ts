import { getAIResponse } from './aiUtilities';

export interface AIInsight {
  type: 'recommendation' | 'warning' | 'optimization' | 'info';
  title: string;
  description: string;
  impact?: 'high' | 'medium' | 'low';
  actionItems?: string[];
}

const BASE_SYSTEM_CONTEXT = `You are an AI assistant specialized in Bangladesh garment manufacturing ERP operations. 
All monetary values are in BDT (Bangladeshi Taka). Consider local supply chains, GSP compliance requirements, 
BGMEA/BKMEA regulations, and industry-specific challenges like seasonal demand, raw material sourcing from local 
and international suppliers, and export-oriented production cycles.

Always respond with valid JSON in this exact format:
{ "insights": [{ "type": "recommendation|warning|optimization|info", "title": "...", "description": "...", "impact": "high|medium|low", "actionItems": ["..."] }] }

Provide 3-5 actionable insights based on the data provided.`;

async function fetchInsights(systemPrompt: string, userPrompt: string, fallbackFn: () => AIInsight[]): Promise<AIInsight[]> {
  try {
    const result = await getAIResponse(systemPrompt, userPrompt);
    if (result?.insights && Array.isArray(result.insights)) {
      return result.insights;
    }
    return fallbackFn();
  } catch (error) {
    console.error('ERP AI Service error, using fallback:', error);
    return fallbackFn();
  }
}

export async function getSupplierLedgerInsights(data: { name: string; groupName: string; openingBalance: string; existingSuppliers: string[] }): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing a supplier ledger entry for a Bangladesh garment manufacturer. Consider supplier reliability, 
payment terms optimization, credit risk, and supply chain diversification for garment raw materials 
(fabric, trims, accessories, packaging).`;

  const userPrompt = JSON.stringify({
    context: 'supplier-ledger-analysis',
    supplierName: data.name,
    groupName: data.groupName,
    openingBalance: data.openingBalance,
    existingSupplierCount: data.existingSuppliers.length,
    existingSuppliers: data.existingSuppliers.slice(0, 10)
  });

  return fetchInsights(systemPrompt, userPrompt, getSupplierLedgerFallback);
}

export async function getPurchaseOrderInsights(data: { items: any[]; supplier: any; totalAmount: number; existingPOs: any[]; inventoryLevels: any[] }): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing a purchase order for a Bangladesh garment factory. Consider bulk discount opportunities, 
lead time optimization, inventory carrying costs in BDT, supplier consolidation, and alignment with 
production schedules. Factor in import duties for international suppliers and local sourcing advantages.`;

  const userPrompt = JSON.stringify({
    context: 'purchase-order-analysis',
    items: data.items,
    supplier: data.supplier,
    totalAmountBDT: data.totalAmount,
    recentPOCount: data.existingPOs.length,
    inventoryLevels: data.inventoryLevels.slice(0, 20)
  });

  return fetchInsights(systemPrompt, userPrompt, getPurchaseOrderFallback);
}

export async function getGRNInsights(data: { items: any[]; supplier: any; purchaseOrder?: any; priceHistory: any[] }): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing a Goods Received Note (GRN) for a garment manufacturing facility. Consider quality inspection 
requirements, quantity discrepancies, price variance analysis, supplier performance tracking, and storage 
optimization. Factor in fabric shrinkage allowances, color lot consistency, and trim compatibility.`;

  const userPrompt = JSON.stringify({
    context: 'grn-analysis',
    receivedItems: data.items,
    supplier: data.supplier,
    purchaseOrder: data.purchaseOrder,
    priceHistory: data.priceHistory.slice(0, 15)
  });

  return fetchInsights(systemPrompt, userPrompt, getGRNFallback);
}

export async function getItemInsights(data: { name: string; category: string; currentStock: number; reorderLevel: number; avgConsumption: number; priceHistory: any[] }): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing an inventory item for a garment factory. Consider optimal reorder points, Economic Order Quantity (EOQ), 
seasonal demand patterns for garment materials, shelf life for chemical inputs (dyes, finishing agents), 
and storage conditions. Factor in lead times from Dhaka-based vs. international suppliers.`;

  const userPrompt = JSON.stringify({
    context: 'item-analysis',
    itemName: data.name,
    category: data.category,
    currentStock: data.currentStock,
    reorderLevel: data.reorderLevel,
    avgDailyConsumption: data.avgConsumption,
    priceHistory: data.priceHistory.slice(0, 10)
  });

  return fetchInsights(systemPrompt, userPrompt, getItemFallback);
}

export async function getWarehouseInsights(data: { warehouse: any; items: any[]; capacity: any }): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing warehouse operations for a garment manufacturing facility. Consider space utilization, 
item placement optimization (ABC analysis), climate control for fabric storage, fire safety compliance 
per Bangladesh factory regulations, and efficient picking paths for production line supply.`;

  const userPrompt = JSON.stringify({
    context: 'warehouse-analysis',
    warehouse: data.warehouse,
    itemCount: data.items.length,
    topItems: data.items.slice(0, 20),
    capacity: data.capacity
  });

  return fetchInsights(systemPrompt, userPrompt, getWarehouseFallback);
}

export async function getInventoryDashboardInsights(data: { items: any[]; lowStockItems: any[]; deadStock: any[]; recentMovements: any[] }): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are providing a comprehensive inventory dashboard analysis for a garment factory. Consider overall inventory health, 
working capital tied up in stock, dead stock disposal strategies, low stock risks to production continuity, 
and inventory turnover optimization. Factor in seasonal production cycles and buyer order patterns.`;

  const userPrompt = JSON.stringify({
    context: 'inventory-dashboard-analysis',
    totalItems: data.items.length,
    lowStockCount: data.lowStockItems.length,
    lowStockItems: data.lowStockItems.slice(0, 10),
    deadStockCount: data.deadStock.length,
    deadStockItems: data.deadStock.slice(0, 10),
    recentMovements: data.recentMovements.slice(0, 15)
  });

  return fetchInsights(systemPrompt, userPrompt, getInventoryDashboardFallback);
}

export async function getAccountingInsights(data: { recentVouchers: any[]; pendingPayables: any[]; trialBalance: any }): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing accounting data for a garment manufacturing company. Consider cash flow optimization, 
payable aging analysis, GSP compliance documentation costs, LC (Letter of Credit) management, 
back-to-back LC optimization, VAT and tax implications under Bangladesh regulations, 
and working capital efficiency for export-oriented operations.`;

  const userPrompt = JSON.stringify({
    context: 'accounting-analysis',
    recentVoucherCount: data.recentVouchers.length,
    recentVouchers: data.recentVouchers.slice(0, 15),
    pendingPayablesCount: data.pendingPayables.length,
    pendingPayables: data.pendingPayables.slice(0, 10),
    trialBalance: data.trialBalance
  });

  return fetchInsights(systemPrompt, userPrompt, getAccountingFallback);
}

export async function getCOAAnalysisInsights(data: {
  totalGroups: number;
  totalLedgers: number;
  groupSummary: Array<{ name: string; nature: string; ledgerCount: number; totalDr: number; totalCr: number }>;
  topDebitAccounts: Array<{ name: string; balance: number; group: string }>;
  topCreditAccounts: Array<{ name: string; balance: number; group: string }>;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalIncome: number;
  totalExpenses: number;
}): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing the Chart of Accounts structure and opening balances for a Bangladesh garment manufacturer 
(Lakhsma Inner Wear Limited). This is a Tally ERP export with ~200+ ledger accounts imported into the system.
Analyze the COA structure for:
1. Balance sheet health (debt-to-equity, current ratio, working capital)
2. Account structure optimization (too many subgroups, missing categories)
3. Industry-specific insights for Bangladesh garment/knitwear manufacturers
4. Compliance readiness (Bangladesh Companies Act, BSEC, tax regulations)
5. Opening balance anomalies or data quality issues
All amounts are in BDT (Bangladeshi Taka).`;

  const userPrompt = JSON.stringify({
    context: 'coa-structure-analysis',
    summary: {
      totalGroups: data.totalGroups,
      totalLedgers: data.totalLedgers,
      totalAssetsBDT: data.totalAssets,
      totalLiabilitiesBDT: data.totalLiabilities,
      totalEquityBDT: data.totalEquity,
      totalIncomeBDT: data.totalIncome,
      totalExpensesBDT: data.totalExpenses,
    },
    groupBreakdown: data.groupSummary,
    topDebitAccounts: data.topDebitAccounts,
    topCreditAccounts: data.topCreditAccounts,
  });

  return fetchInsights(systemPrompt, userPrompt, getCOAAnalysisFallback);
}

export async function getLedgerInsights(data: {
  ledgerName: string;
  groupName: string;
  nature: string;
  openingBalance: number;
  normalBalance: string;
  isBankAccount: boolean;
  isCashAccount: boolean;
  isMaterialSupplier: boolean;
}): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing a specific ledger account for a Bangladesh garment manufacturer (Lakhsma Inner Wear Limited).
Provide insights about this specific account: its purpose, optimization opportunities, compliance requirements,
and potential risks. Consider Bangladesh accounting standards (BAS/BFRS), NBR tax regulations, and garment 
industry best practices. All amounts in BDT.`;

  const userPrompt = JSON.stringify({
    context: 'ledger-analysis',
    accountName: data.ledgerName,
    groupName: data.groupName,
    nature: data.nature,
    openingBalanceBDT: data.openingBalance,
    normalBalance: data.normalBalance,
    isBankAccount: data.isBankAccount,
    isCashAccount: data.isCashAccount,
    isMaterialSupplier: data.isMaterialSupplier,
  });

  return fetchInsights(systemPrompt, userPrompt, getLedgerFallback);
}

function getCOAAnalysisFallback(): AIInsight[] {
  return [
    {
      type: 'recommendation',
      title: 'High Debt-to-Equity Ratio Detected',
      description: 'The loan liabilities significantly exceed equity capital, indicating heavy debt financing. For Bangladesh garment manufacturers, maintaining a D/E ratio below 3:1 is recommended for bank covenant compliance and future borrowing capacity.',
      impact: 'high',
      actionItems: ['Review loan repayment schedule', 'Consider equity injection or retained earnings capitalization', 'Negotiate better interest rates on term loans']
    },
    {
      type: 'warning',
      title: 'Back-to-Back LC Exposure',
      description: 'Multiple back-to-back LC liabilities detected. Ensure proper tracking of LC maturity dates and buyer payment timelines to avoid settlement delays and bank charges.',
      impact: 'high',
      actionItems: ['Create LC maturity calendar', 'Match buyer LC dates with supplier LC dates', 'Monitor FDBC realization timelines']
    },
    {
      type: 'optimization',
      title: 'Account Structure Optimization',
      description: 'Consider consolidating similar expense categories. Multiple granular accounts for similar expenses (e.g., separate fuel accounts per vehicle) may complicate reporting without adding analytical value.',
      impact: 'medium',
      actionItems: ['Review expense account granularity', 'Consolidate similar accounts where practical', 'Use cost centers instead of separate accounts for vehicle-wise tracking']
    },
    {
      type: 'info',
      title: 'Depreciation Schedule Review',
      description: 'Fixed assets and accumulated depreciation accounts are properly structured. Verify depreciation rates comply with Bangladesh Income Tax Ordinance Third Schedule rates for garment manufacturing equipment.',
      impact: 'medium',
      actionItems: ['Cross-check depreciation rates with tax allowances', 'Ensure plant & machinery uses correct rate (20% diminishing)', 'Review intangible asset amortization policy']
    }
  ];
}

function getLedgerFallback(): AIInsight[] {
  return [
    {
      type: 'info',
      title: 'Account Classification Review',
      description: 'Verify this account is correctly classified under its current group. Proper classification ensures accurate financial reporting under Bangladesh Accounting Standards (BAS).',
      impact: 'medium',
      actionItems: ['Confirm account nature matches group classification', 'Review normal balance direction']
    },
    {
      type: 'recommendation',
      title: 'Transaction Activity Check',
      description: 'Monitor this account for regular activity. Dormant accounts with balances should be investigated and cleared or reclassified as appropriate.',
      impact: 'low',
      actionItems: ['Review last transaction date', 'Investigate any stale balances']
    }
  ];
}

function getSupplierLedgerFallback(): AIInsight[] {
  return [
    {
      type: 'recommendation',
      title: 'Verify Supplier Trade License',
      description: 'Ensure the supplier has a valid trade license and VAT registration (BIN) before initiating transactions. This is required for input VAT credit claims under Bangladesh tax regulations.',
      impact: 'high',
      actionItems: ['Request updated trade license copy', 'Verify BIN number with NBR database', 'Check BGMEA/BKMEA membership if applicable']
    },
    {
      type: 'info',
      title: 'Payment Terms Benchmarking',
      description: 'Standard payment terms for garment raw material suppliers in Bangladesh range from 30-90 days. Negotiate terms aligned with your production cycle and LC realization timeline.',
      impact: 'medium',
      actionItems: ['Review current payment terms against industry standards', 'Align payment schedule with buyer payment cycles']
    },
    {
      type: 'optimization',
      title: 'Supplier Group Consolidation',
      description: 'Consider consolidating purchases within this supplier group to negotiate better volume discounts and streamline accounts payable processing.',
      impact: 'medium',
      actionItems: ['Analyze spending patterns across group suppliers', 'Negotiate group-level pricing agreements']
    }
  ];
}

function getPurchaseOrderFallback(): AIInsight[] {
  return [
    {
      type: 'recommendation',
      title: 'Bulk Order Discount Opportunity',
      description: 'Consider consolidating orders for the same material category to qualify for bulk pricing. Many local fabric mills offer 5-10% discount on orders above 5,000 yards.',
      impact: 'high',
      actionItems: ['Review upcoming production requirements for similar materials', 'Request bulk pricing from supplier', 'Compare with alternative suppliers']
    },
    {
      type: 'warning',
      title: 'Lead Time Risk Assessment',
      description: 'Verify supplier lead times against your production schedule. Late material delivery is the leading cause of shipment delays in Bangladesh garment exports.',
      impact: 'high',
      actionItems: ['Confirm delivery date with supplier', 'Set up milestone tracking for this PO', 'Identify backup suppliers for critical items']
    },
    {
      type: 'optimization',
      title: 'Inventory Carrying Cost Review',
      description: 'Evaluate if the ordered quantity aligns with near-term production needs. Excess inventory ties up working capital and incurs storage costs estimated at 15-20% of inventory value annually.',
      impact: 'medium',
      actionItems: ['Match order quantity to confirmed production orders', 'Consider just-in-time delivery scheduling']
    }
  ];
}

function getGRNFallback(): AIInsight[] {
  return [
    {
      type: 'warning',
      title: 'Quality Inspection Required',
      description: 'Perform a 4-point inspection system check on received fabric. Industry standard allows maximum 28 points per 100 square yards for export-quality garments.',
      impact: 'high',
      actionItems: ['Conduct 4-point fabric inspection', 'Check GSM consistency across rolls', 'Verify color matching against approved lab dips']
    },
    {
      type: 'recommendation',
      title: 'Price Variance Monitoring',
      description: 'Compare received item prices against historical purchase prices to identify significant variances. Flag any price increase exceeding 5% for management review.',
      impact: 'medium',
      actionItems: ['Review price against last 3 purchase orders', 'Document reasons for any price variance', 'Update standard cost if price change is permanent']
    },
    {
      type: 'info',
      title: 'Supplier Performance Tracking',
      description: 'Update supplier scorecard with this delivery data including on-time delivery, quantity accuracy, and quality acceptance rate for future procurement decisions.',
      impact: 'medium',
      actionItems: ['Record delivery timeliness', 'Update quantity accuracy metrics', 'Log any quality issues found']
    }
  ];
}

function getItemFallback(): AIInsight[] {
  return [
    {
      type: 'warning',
      title: 'Reorder Level Assessment',
      description: 'Review the reorder level based on current consumption patterns and supplier lead times. Buffer stock should account for 7-14 days of production requirements for critical materials.',
      impact: 'high',
      actionItems: ['Calculate safety stock based on demand variability', 'Factor in supplier lead time reliability', 'Adjust reorder point for seasonal demand changes']
    },
    {
      type: 'optimization',
      title: 'Economic Order Quantity (EOQ)',
      description: 'Calculate the optimal order quantity to minimize total inventory costs including ordering costs, carrying costs, and potential stockout costs.',
      impact: 'medium',
      actionItems: ['Calculate EOQ using current cost parameters', 'Compare EOQ with current order quantities', 'Adjust for minimum order quantity constraints']
    },
    {
      type: 'info',
      title: 'Price Trend Analysis',
      description: 'Monitor price trends for this item category. Raw material prices in Bangladesh garment industry typically fluctuate with cotton market prices and currency exchange rates.',
      impact: 'low',
      actionItems: ['Track price changes over last 6 months', 'Set up price alerts for significant changes']
    }
  ];
}

function getWarehouseFallback(): AIInsight[] {
  return [
    {
      type: 'optimization',
      title: 'ABC Classification for Storage',
      description: 'Implement ABC analysis for warehouse items. Place high-value, high-turnover items (A-class) in easily accessible locations near production lines to minimize picking time.',
      impact: 'high',
      actionItems: ['Classify items by annual consumption value', 'Reorganize storage zones by ABC category', 'Implement cycle counting for A-class items']
    },
    {
      type: 'warning',
      title: 'Fire Safety Compliance',
      description: 'Ensure warehouse meets Bangladesh Fire Service and Civil Defence requirements. Maintain proper aisle widths, fire extinguisher placement, and fabric storage height limits.',
      impact: 'high',
      actionItems: ['Schedule fire safety audit', 'Verify fire extinguisher maintenance dates', 'Check emergency exit accessibility']
    },
    {
      type: 'recommendation',
      title: 'Climate Control for Fabric Storage',
      description: 'Maintain humidity levels between 55-65% for fabric storage to prevent mold growth and maintain quality, especially during Bangladesh monsoon season (June-September).',
      impact: 'medium',
      actionItems: ['Install humidity monitoring sensors', 'Check dehumidifier maintenance schedule', 'Ensure proper ventilation in fabric storage areas']
    }
  ];
}

function getInventoryDashboardFallback(): AIInsight[] {
  return [
    {
      type: 'warning',
      title: 'Low Stock Items Require Attention',
      description: 'Items below reorder level need immediate procurement action to avoid production line stoppages. Each hour of production downtime costs approximately BDT 50,000-100,000.',
      impact: 'high',
      actionItems: ['Generate urgent purchase requisitions for critical low-stock items', 'Contact suppliers for expedited delivery', 'Check if substitute materials are available']
    },
    {
      type: 'optimization',
      title: 'Dead Stock Disposal Strategy',
      description: 'Dead stock items tie up valuable warehouse space and working capital. Consider liquidation, donation, or repurposing for items with no movement in the last 90 days.',
      impact: 'medium',
      actionItems: ['Categorize dead stock by recovery potential', 'Contact surplus material buyers', 'Calculate write-off impact on financials']
    },
    {
      type: 'recommendation',
      title: 'Inventory Turnover Improvement',
      description: 'Optimize inventory turnover ratio by aligning procurement with confirmed production orders. Target industry benchmark of 8-12 inventory turns per year for garment manufacturing.',
      impact: 'medium',
      actionItems: ['Review slow-moving items for demand validation', 'Implement just-in-time procurement for non-critical items', 'Set up automated reorder alerts']
    },
    {
      type: 'info',
      title: 'Seasonal Inventory Planning',
      description: 'Adjust inventory levels for upcoming seasonal demand. Bangladesh garment exports typically peak during July-September (fall/winter orders) and January-March (spring/summer orders).',
      impact: 'low',
      actionItems: ['Review confirmed orders for next quarter', 'Pre-position critical materials for peak production']
    }
  ];
}

export async function getTrialBalanceInsights(data: { 
  totalDebit: number; totalCredit: number; isBalanced: boolean;
  groupSummary: Array<{ name: string; nature: string; totalDebit: number; totalCredit: number }>;
  accountCount: number;
}): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing a Trial Balance for a Bangladesh garment manufacturer (Lakhsma Inner Wear Limited). 
Analyze the balance sheet structure, detect anomalies, check accounting equation integrity, 
identify unusual balances, and provide ratio analysis. Consider industry benchmarks for garment manufacturing.
Focus on: debt-to-equity ratio, current ratio implications, expense structure analysis, and working capital indicators.`;

  const userPrompt = JSON.stringify({
    context: 'trial-balance-analysis',
    ...data
  });

  return fetchInsights(systemPrompt, userPrompt, () => [{
    type: 'info', title: 'Trial Balance Analysis', 
    description: 'AI analysis temporarily unavailable. The trial balance shows standard structure.',
    impact: 'low', actionItems: ['Review manually for any unusual balances']
  }]);
}

export async function getFinancialStatementInsights(data: {
  reportType: 'balance-sheet' | 'profit-loss';
  totalAssets?: number; totalLiabilities?: number; difference?: number;
  grossProfit?: number; netProfit?: number; totalIncome?: number; totalExpenses?: number;
  groupDetails: Array<{ name: string; total: number }>;
}): Promise<AIInsight[]> {
  const reportName = data.reportType === 'balance-sheet' ? 'Balance Sheet' : 'Profit & Loss Statement';
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing a ${reportName} for a Bangladesh garment manufacturer (Lakhsma Inner Wear Limited).
For Balance Sheet: Analyze liquidity ratios, solvency ratios, asset utilization, working capital adequacy.
For P&L: Analyze gross margin, operating margin, expense ratios, cost structure, profitability trends.
Consider Bangladesh garment industry benchmarks (typical gross margin 15-25%, net margin 5-12%).
Provide specific, actionable recommendations for improvement.`;

  const userPrompt = JSON.stringify({
    context: `${data.reportType}-analysis`,
    ...data
  });

  return fetchInsights(systemPrompt, userPrompt, () => [{
    type: 'info', title: `${reportName} Analysis`,
    description: 'AI analysis temporarily unavailable.',
    impact: 'low', actionItems: ['Review financial statements manually']
  }]);
}

export async function getVoucherEntryInsights(data: {
  voucherType: string; totalAmount: number; description: string;
  items: Array<{ accountName: string; debitAmount: number; creditAmount: number }>;
  recentVouchers?: Array<{ voucherNumber: string; amount: number; description: string }>;
}): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are helping with voucher entry for a Bangladesh garment manufacturer. Analyze the voucher being created and provide:
1. Smart account suggestions based on the description and voucher type
2. Duplicate detection warnings if similar recent vouchers exist
3. Amount validation and reasonableness checks
4. Correct debit/credit placement guidance
5. GST/VAT compliance reminders if applicable
Keep insights brief and actionable. Focus on preventing errors.`;

  const userPrompt = JSON.stringify({
    context: 'voucher-entry-assistance',
    ...data
  });

  return fetchInsights(systemPrompt, userPrompt, () => [{
    type: 'info', title: 'Voucher Entry Assistant',
    description: 'AI suggestions temporarily unavailable.',
    impact: 'low', actionItems: ['Verify debit and credit accounts manually']
  }]);
}

export async function getPartyAnalysisInsights(data: {
  partyName: string;
  partyType: string;
  totalOutstanding: number;
  totalBills: number;
  overdueAmount: number;
  overdueBills: number;
  averagePaymentDays: number;
  creditLimit: number;
  creditPeriodDays: number;
  recentTransactions: any[];
}): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing a party (vendor/customer) for a Bangladesh garment manufacturer. 
Assess credit risk, payment behavior, recommend credit terms, identify supply chain risks.
Consider BDT currency, local business practices, and garment industry norms.
Evaluate outstanding amounts against credit limits and payment patterns.`;

  const userPrompt = JSON.stringify({
    context: 'party-analysis',
    partyName: data.partyName,
    partyType: data.partyType,
    totalOutstandingBDT: data.totalOutstanding,
    totalBills: data.totalBills,
    overdueAmountBDT: data.overdueAmount,
    overdueBills: data.overdueBills,
    averagePaymentDays: data.averagePaymentDays,
    creditLimitBDT: data.creditLimit,
    creditPeriodDays: data.creditPeriodDays,
    recentTransactions: data.recentTransactions.slice(0, 10)
  });

  return fetchInsights(systemPrompt, userPrompt, getPartyAnalysisFallback);
}

export async function getBillWiseInsights(data: {
  totalReceivable: number;
  totalPayable: number;
  overdueReceivable: number;
  overduePayable: number;
  agingBuckets: { bucket: string; receivable: number; payable: number }[];
  topOverdueParties: { name: string; amount: number; days: number }[];
}): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing outstanding bills (receivables and payables) for a Bangladesh garment manufacturer.
Analyze outstanding patterns, predict cash flow issues, suggest collection strategies.
Consider LC payment cycles, buyer payment behavior, and supplier payment terms.
Focus on overdue recovery priorities and working capital optimization.`;

  const userPrompt = JSON.stringify({
    context: 'bill-wise-analysis',
    totalReceivableBDT: data.totalReceivable,
    totalPayableBDT: data.totalPayable,
    overdueReceivableBDT: data.overdueReceivable,
    overduePayableBDT: data.overduePayable,
    agingBuckets: data.agingBuckets,
    topOverdueParties: data.topOverdueParties.slice(0, 10)
  });

  return fetchInsights(systemPrompt, userPrompt, getBillWiseFallback);
}

export async function getCostCenterInsights(data: {
  orderNumber: string;
  styleName: string;
  totalPlanned: number;
  totalActual: number;
  totalVariance: number;
  categories: { name: string; planned: number; actual: number; variance: number }[];
  profitMargin: number;
}): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing a job cost sheet (cost center) for a Bangladesh garment manufacturing order.
Analyze BOM vs actual variances, identify cost overruns, suggest optimizations.
Consider fabric wastage norms (typically 3-7%), labor efficiency rates, and overhead allocation.
Provide actionable insights to improve profitability on this and future orders.`;

  const userPrompt = JSON.stringify({
    context: 'cost-center-variance-analysis',
    orderNumber: data.orderNumber,
    styleName: data.styleName,
    totalPlannedBDT: data.totalPlanned,
    totalActualBDT: data.totalActual,
    totalVarianceBDT: data.totalVariance,
    categories: data.categories.slice(0, 15),
    profitMarginPercent: data.profitMargin
  });

  return fetchInsights(systemPrompt, userPrompt, getCostCenterFallback);
}

export async function getDeliveryGatePassInsights(data: {
  totalChallans: number;
  totalGatePasses: number;
  pendingGatePasses: number;
  averageProcessingTime: number;
  recentAnomalies: any[];
  challansByStatus: Record<string, number>;
}): Promise<AIInsight[]> {
  const systemPrompt = `${BASE_SYSTEM_CONTEXT}
You are analyzing delivery challans and gate passes for a Bangladesh garment factory.
Detect anomalies, unusual patterns, and security risks in material movement.
Consider factory gate security requirements, BGMEA compliance, and export shipment protocols.
Focus on preventing pilferage, ensuring proper documentation, and optimizing dispatch workflows.`;

  const userPrompt = JSON.stringify({
    context: 'delivery-gate-pass-analysis',
    totalChallans: data.totalChallans,
    totalGatePasses: data.totalGatePasses,
    pendingGatePasses: data.pendingGatePasses,
    averageProcessingTimeHours: data.averageProcessingTime,
    recentAnomalies: data.recentAnomalies.slice(0, 10),
    challansByStatus: data.challansByStatus
  });

  return fetchInsights(systemPrompt, userPrompt, getDeliveryGatePassFallback);
}

function getPartyAnalysisFallback(): AIInsight[] {
  return [
    {
      type: 'recommendation',
      title: 'Credit Risk Assessment',
      description: 'Review the party credit limit against current outstanding amount. For garment industry vendors, maintain credit exposure within 2x of average monthly transaction volume to mitigate risk.',
      impact: 'high',
      actionItems: ['Compare outstanding vs credit limit utilization', 'Review payment history for last 6 months', 'Set up automated credit limit alerts at 80% utilization']
    },
    {
      type: 'warning',
      title: 'Payment Behavior Analysis',
      description: 'Monitor average payment days against agreed credit period. Late payments beyond 15 days of due date should trigger escalation procedures to prevent bad debt accumulation.',
      impact: 'high',
      actionItems: ['Track payment delays against credit terms', 'Send automated payment reminders at 7 and 14 days overdue', 'Escalate to management for payments exceeding 30 days overdue']
    },
    {
      type: 'optimization',
      title: 'Credit Terms Optimization',
      description: 'Consider adjusting credit terms based on payment reliability. Reliable parties may qualify for extended credit periods, while chronic late-payers should have stricter terms.',
      impact: 'medium',
      actionItems: ['Classify parties into A/B/C tiers based on payment reliability', 'Offer early payment discounts (2/10 net 30) for top-tier parties', 'Reduce credit period for parties with poor payment history']
    },
    {
      type: 'info',
      title: 'Supply Chain Diversification',
      description: 'Ensure no single vendor accounts for more than 30% of total procurement value. Over-reliance on a single supplier creates supply chain vulnerability for garment production.',
      impact: 'medium',
      actionItems: ['Review vendor concentration ratio', 'Identify alternative suppliers for critical materials', 'Maintain approved vendor list with minimum 2 suppliers per material category']
    }
  ];
}

function getBillWiseFallback(): AIInsight[] {
  return [
    {
      type: 'warning',
      title: 'Overdue Receivables Alert',
      description: 'Outstanding receivables beyond 90 days require immediate attention. In the Bangladesh garment industry, prolonged receivables often indicate buyer disputes or financial distress.',
      impact: 'high',
      actionItems: ['Prioritize collection calls for 90+ day overdue accounts', 'Review buyer order status for potential disputes', 'Consider offering settlement discounts for longstanding overdue amounts']
    },
    {
      type: 'optimization',
      title: 'Cash Flow Forecasting',
      description: 'Align payable due dates with expected receivable collections. Typical garment export payment cycle is 60-90 days post-shipment through LC realization.',
      impact: 'high',
      actionItems: ['Map expected LC realization dates against supplier payment schedules', 'Negotiate staggered payment plans with key suppliers during cash-tight periods', 'Maintain minimum 15-day cash buffer for operational expenses']
    },
    {
      type: 'recommendation',
      title: 'Aging Bucket Analysis',
      description: 'Focus collection efforts on the 31-60 day aging bucket where recovery probability is highest. Recovery rates drop significantly beyond 90 days in the garment industry.',
      impact: 'medium',
      actionItems: ['Assign dedicated collection follow-up for 31-60 day bucket', 'Implement automated payment reminders before due dates', 'Review credit terms for parties with frequent overdue patterns']
    },
    {
      type: 'info',
      title: 'Net Position Monitoring',
      description: 'Monitor net receivable vs payable position weekly. A healthy garment manufacturer typically maintains a net receivable position of 1.2-1.5x of net payable.',
      impact: 'low',
      actionItems: ['Generate weekly receivable-payable summary', 'Alert management if net position ratio falls below 1.0x']
    }
  ];
}

function getCostCenterFallback(): AIInsight[] {
  return [
    {
      type: 'warning',
      title: 'Cost Overrun Detection',
      description: 'Monitor categories where actual costs exceed planned budgets by more than 10%. In garment manufacturing, fabric cost (typically 60-65% of FOB) and labor cost variances are the primary margin erosion factors.',
      impact: 'high',
      actionItems: ['Investigate top 3 categories with highest negative variance', 'Review fabric consumption vs planned markers for waste reduction', 'Audit labor hours charged against this order']
    },
    {
      type: 'optimization',
      title: 'BOM Accuracy Improvement',
      description: 'Compare planned vs actual material consumption rates. Fabric wastage exceeding 5% indicates potential issues with cutting markers, fabric quality, or operator efficiency.',
      impact: 'high',
      actionItems: ['Review cutting marker efficiency (target 85%+ utilization)', 'Check fabric inspection rejection rates', 'Standardize BOM costing methodology across similar styles']
    },
    {
      type: 'recommendation',
      title: 'Profitability Enhancement',
      description: 'Identify cost savings opportunities without compromising quality. Consider alternative sourcing for non-critical trim items and negotiate better rates for future orders of similar styles.',
      impact: 'medium',
      actionItems: ['Benchmark costs against similar past orders', 'Negotiate volume-based discounts for recurring materials', 'Evaluate local vs import sourcing for cost optimization']
    },
    {
      type: 'info',
      title: 'Variance Trend Analysis',
      description: 'Track variance patterns across orders to identify systematic costing issues. Consistent underestimation in specific categories may indicate the need to update standard rates.',
      impact: 'medium',
      actionItems: ['Compare variance patterns across last 5 similar orders', 'Update standard costing rates based on actual averages', 'Review overhead allocation methodology']
    }
  ];
}

function getDeliveryGatePassFallback(): AIInsight[] {
  return [
    {
      type: 'warning',
      title: 'Pending Gate Pass Backlog',
      description: 'Unprocessed gate passes create security risks and documentation gaps. Ensure all material movements are authorized and documented within 24 hours per factory security protocols.',
      impact: 'high',
      actionItems: ['Clear pending gate pass backlog immediately', 'Implement same-day gate pass processing policy', 'Set up alerts for gate passes pending more than 8 hours']
    },
    {
      type: 'optimization',
      title: 'Dispatch Processing Efficiency',
      description: 'Optimize the challan-to-gate-pass workflow to reduce processing time. Average processing time should be under 2 hours for standard dispatches in a well-organized factory.',
      impact: 'medium',
      actionItems: ['Streamline approval chain for standard dispatches', 'Pre-authorize recurring material movements', 'Implement barcode/QR scanning for faster gate processing']
    },
    {
      type: 'recommendation',
      title: 'Security Compliance Review',
      description: 'Ensure all outward material movements match delivery challans. Discrepancies between challan quantities and actual gate pass records should trigger immediate investigation.',
      impact: 'high',
      actionItems: ['Reconcile challan quantities with gate pass records weekly', 'Implement dual-verification for high-value shipments', 'Review CCTV records for any discrepancy incidents']
    },
    {
      type: 'info',
      title: 'Documentation Status',
      description: 'Monitor challan completion rates and ensure all dispatches have proper documentation for customs and buyer compliance requirements.',
      impact: 'low',
      actionItems: ['Verify all export shipments have complete documentation', 'Ensure delivery challans reference correct purchase order numbers', 'Archive completed challans per BGMEA record retention requirements']
    }
  ];
}

function getAccountingFallback(): AIInsight[] {
  return [
    {
      type: 'warning',
      title: 'Payables Aging Alert',
      description: 'Review outstanding payables approaching or exceeding payment terms. Late payments can damage supplier relationships and affect credit terms, critical for maintaining production continuity.',
      impact: 'high',
      actionItems: ['Prioritize payments by due date and supplier criticality', 'Negotiate extended terms for non-critical payables', 'Ensure LC-backed payments are processed on time']
    },
    {
      type: 'optimization',
      title: 'Cash Flow Optimization',
      description: 'Align payment schedules with export LC realization timelines. Typical buyer payment cycle is 60-90 days from shipment, requiring careful working capital management.',
      impact: 'high',
      actionItems: ['Map cash inflows from upcoming LC realizations', 'Schedule supplier payments after expected inflows', 'Consider factoring for immediate cash needs']
    },
    {
      type: 'recommendation',
      title: 'VAT & Tax Compliance Review',
      description: 'Ensure monthly VAT returns (Mushak 9.1) are filed on time. Export-oriented garment manufacturers are eligible for VAT exemptions on raw material imports under SRO provisions.',
      impact: 'medium',
      actionItems: ['Verify VAT return filing status', 'Reconcile input VAT claims with purchase invoices', 'Review eligibility for export incentive claims']
    },
    {
      type: 'info',
      title: 'Financial Reporting Readiness',
      description: 'Ensure trial balance is balanced and all adjusting entries are posted. Quarterly financial statements may be required for bank loan compliance and buyer audit readiness.',
      impact: 'low',
      actionItems: ['Reconcile bank statements', 'Post any pending adjusting entries', 'Review depreciation schedules for accuracy']
    }
  ];
}

export interface ExchangeRateSuggestion {
  rate: number;
  source: string;
  confidence: string;
  note: string;
}

export async function getAIExchangeRateSuggestion(data: {
  fromCurrency: string;
  toCurrency: string;
  date: string;
}): Promise<ExchangeRateSuggestion> {
  try {
    const { fetchLiveRate } = await import('./forexService');
    const liveResult = await fetchLiveRate(data.fromCurrency, data.toCurrency);
    if (liveResult.liveRate && liveResult.liveRate > 0) {
      return {
        rate: liveResult.liveRate,
        source: `Live market rate (${liveResult.liveSource})`,
        confidence: 'high',
        note: `Real-time exchange rate updated ${liveResult.liveUpdated ? new Date(liveResult.liveUpdated).toLocaleDateString() : 'today'}. 1 ${data.fromCurrency} = ${liveResult.liveRate} ${data.toCurrency}`
      };
    }
  } catch (err) {
    console.error('Live forex API failed, trying AI fallback:', err);
  }

  const systemPrompt = `You are a foreign exchange rate assistant for an ERP system used by garment manufacturers.
You must provide the most accurate current market exchange rate for the requested currency pair.
Consider official central bank rates, interbank rates, and market conditions.

Respond with valid JSON in this exact format:
{
  "rate": <number with up to 6 decimal places>,
  "source": "<brief description of rate basis, e.g. 'Market mid-rate estimate'>",
  "confidence": "high|medium|low",
  "note": "<brief context about the rate, any recent trends or considerations>"
}

Important:
- The rate should represent: 1 unit of fromCurrency = ? units of toCurrency
- Use realistic market rates based on your training data
- If you are not confident about the exact current rate, indicate medium or low confidence
- Always provide your best estimate even if uncertain`;

  const userPrompt = JSON.stringify({
    context: 'exchange-rate-suggestion',
    fromCurrency: data.fromCurrency,
    toCurrency: data.toCurrency,
    date: data.date,
    instruction: `What is the exchange rate for 1 ${data.fromCurrency} to ${data.toCurrency} as of ${data.date}?`
  });

  try {
    const result = await getAIResponse(systemPrompt, userPrompt, 0.1);
    if (result?.rate && typeof result.rate === 'number' && result.rate > 0) {
      return {
        rate: result.rate,
        source: result.source || 'AI market estimate',
        confidence: result.confidence || 'medium',
        note: result.note || `Estimated rate for ${data.fromCurrency}/${data.toCurrency}`
      };
    }
    return getExchangeRateFallback(data.fromCurrency, data.toCurrency);
  } catch (error) {
    console.error('AI exchange rate suggestion error, using fallback:', error);
    return getExchangeRateFallback(data.fromCurrency, data.toCurrency);
  }
}

function getExchangeRateFallback(fromCurrency: string, toCurrency: string): ExchangeRateSuggestion {
  const bdtRates: Record<string, number> = {
    USD: 119.50, EUR: 130.25, GBP: 151.80, JPY: 0.79, CNY: 16.45,
    INR: 1.43, AUD: 77.50, CAD: 87.20, CHF: 135.60, SGD: 89.30,
    HKD: 15.30, KRW: 0.089, THB: 3.35, MYR: 25.40, AED: 32.55,
    SAR: 31.85, PKR: 0.43, LKR: 0.37,
  };

  let rate = 1;
  if (toCurrency === 'BDT' && bdtRates[fromCurrency]) {
    rate = bdtRates[fromCurrency];
  } else if (fromCurrency === 'BDT' && bdtRates[toCurrency]) {
    rate = 1 / bdtRates[toCurrency];
  } else if (bdtRates[fromCurrency] && bdtRates[toCurrency]) {
    rate = bdtRates[fromCurrency] / bdtRates[toCurrency];
  }

  return {
    rate: parseFloat(rate.toFixed(6)),
    source: 'Reference rate (offline estimate)',
    confidence: 'low',
    note: `Approximate reference rate for ${fromCurrency}/${toCurrency}. Please verify with your bank or financial institution.`
  };
}
