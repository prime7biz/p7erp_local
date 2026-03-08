import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { PrintLayout } from "@/components/print/PrintLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { Printer, Brain, Loader2, AlertTriangle, Lightbulb, TrendingUp, Info, Scale, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";
import { useTenantInfo } from "@/hooks/useTenantInfo";

interface TrialBalanceEntry {
  accountId: number;
  accountNumber: string;
  accountName: string;
  debitTotal: number;
  creditTotal: number;
  closingBalance: number;
}

interface TrialBalanceGroup {
  groupId: number;
  groupName: string;
  nature: string;
  level: number;
  parentGroupId: number | null;
  accounts: TrialBalanceEntry[];
  subGroups: TrialBalanceGroup[];
  totalDebit: number;
  totalCredit: number;
}

function formatAmount(val: number): string {
  return Math.abs(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

interface CashFlowSection {
  title: string;
  items: { name: string; amount: number }[];
  total: number;
}

const fixedAssetKeywords = ["fixed asset", "property", "plant", "equipment", "furniture", "vehicle", "machinery", "building", "land", "capital work"];
const financingKeywords = ["loan", "borrowing", "capital", "share", "reserve", "retained", "dividend", "debenture", "secured", "unsecured"];

function buildCashFlow(groups: TrialBalanceGroup[]): { operating: CashFlowSection; investing: CashFlowSection; financing: CashFlowSection; netChange: number } {
  const incomeGroups = groups.filter(g => g.nature === "Income");
  const expenseGroups = groups.filter(g => g.nature === "Expense");
  const assetGroups = groups.filter(g => g.nature === "Asset");
  const liabilityGroups = groups.filter(g => g.nature === "Liability");
  const equityGroups = groups.filter(g => g.nature === "Equity");

  const operatingItems: { name: string; amount: number }[] = [];
  for (const g of incomeGroups) {
    const amt = g.totalCredit - g.totalDebit;
    if (Math.abs(amt) > 0.01) operatingItems.push({ name: g.groupName, amount: amt });
  }
  for (const g of expenseGroups) {
    const amt = -(g.totalDebit - g.totalCredit);
    if (Math.abs(amt) > 0.01) operatingItems.push({ name: g.groupName, amount: amt });
  }
  const operatingTotal = operatingItems.reduce((s, i) => s + i.amount, 0);

  const investingItems: { name: string; amount: number }[] = [];
  for (const g of assetGroups) {
    const isFixed = fixedAssetKeywords.some(k => g.groupName.toLowerCase().includes(k));
    if (isFixed) {
      const amt = -(g.totalDebit - g.totalCredit);
      if (Math.abs(amt) > 0.01) investingItems.push({ name: g.groupName, amount: amt });
    }
  }
  const investingTotal = investingItems.reduce((s, i) => s + i.amount, 0);

  const financingItems: { name: string; amount: number }[] = [];
  for (const g of liabilityGroups) {
    const isFinancing = financingKeywords.some(k => g.groupName.toLowerCase().includes(k));
    if (isFinancing) {
      const amt = g.totalCredit - g.totalDebit;
      if (Math.abs(amt) > 0.01) financingItems.push({ name: g.groupName, amount: amt });
    }
  }
  for (const g of equityGroups) {
    const amt = g.totalCredit - g.totalDebit;
    if (Math.abs(amt) > 0.01) financingItems.push({ name: g.groupName, amount: amt });
  }
  const financingTotal = financingItems.reduce((s, i) => s + i.amount, 0);

  return {
    operating: { title: "A. Cash Flow from Operating Activities", items: operatingItems, total: operatingTotal },
    investing: { title: "B. Cash Flow from Investing Activities", items: investingItems, total: investingTotal },
    financing: { title: "C. Cash Flow from Financing Activities", items: financingItems, total: financingTotal },
    netChange: operatingTotal + investingTotal + financingTotal,
  };
}

function CashFlowSectionView({ section, currencySymbol }: { section: CashFlowSection; currencySymbol: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-1">{section.title}</h3>
      {section.items.length === 0 ? (
        <p className="text-sm text-gray-400 italic pl-4 py-2">No items in this category</p>
      ) : (
        <div className="space-y-1.5 pl-4">
          {section.items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center py-1">
              <span className="text-sm text-gray-700">{item.name}</span>
              <span className={`font-mono text-sm font-medium ${item.amount >= 0 ? "text-green-700" : "text-red-700"}`}>
                {item.amount < 0 ? "(" : ""}{currencySymbol}{formatAmount(item.amount)}{item.amount < 0 ? ")" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed pl-4">
        <span className="font-semibold text-sm text-gray-800">
          Net Cash from {section.title.includes("Operating") ? "Operations" : section.title.includes("Investing") ? "Investing" : "Financing"}
        </span>
        <span className={`font-mono font-bold text-sm ${section.total >= 0 ? "text-green-700" : "text-red-700"}`}>
          {section.total < 0 ? "(" : ""}{currencySymbol}{formatAmount(section.total)}{section.total < 0 ? ")" : ""}
        </span>
      </div>
    </div>
  );
}

export default function CashFlowPage() {
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const { tenantInfo } = useTenantInfo();

  const queryUrl = `/api/accounting/reports/trial-balance?asOfDate=${endDate}`;

  const { data: groups, isLoading } = useQuery<TrialBalanceGroup[]>({
    queryKey: [queryUrl],
  });

  const cashFlow = groups ? buildCashFlow(groups) : null;
  const hasData = groups && groups.length > 0;

  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const generateAIAnalysis = async () => {
    if (!cashFlow) return;
    setAiLoading(true);
    try {
      const res = await apiRequest("/api/ai-insights/erp/financial-statement", "POST", {
        reportType: "cash-flow",
        operatingCashFlow: cashFlow.operating.total,
        investingCashFlow: cashFlow.investing.total,
        financingCashFlow: cashFlow.financing.total,
        netChange: cashFlow.netChange,
        groupDetails: [
          ...cashFlow.operating.items.map(i => ({ name: i.name, total: i.amount })),
          ...cashFlow.investing.items.map(i => ({ name: i.name, total: i.amount })),
          ...cashFlow.financing.items.map(i => ({ name: i.name, total: i.amount })),
        ],
      });
      const data = await res.json();
      setAiInsights(data.insights || []);
    } catch (err) {
      setAiInsights([{ type: "info", title: "AI Insights Unavailable", description: "AI analysis could not be completed at this time. Please try again later." }]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <DashboardContainer
      title="Cash Flow Statement"
      subtitle="Analysis of cash inflows and outflows by activity type"
      actions={
        <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      }
    >
      <PrintLayout
        title="Cash Flow Statement"
        dateRange={`For the period ${startDate} to ${endDate}`}
        companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined}
        showSignatures={false}
      >
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row gap-4 items-end no-print">
              <div className="w-full md:w-48">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="w-full md:w-48">
                <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : !hasData || !cashFlow ? (
              <div className="text-center py-16">
                <Scale className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-500">No cash flow data</h3>
                <p className="text-sm text-gray-400 mt-1">
                  No transactions found for the selected period.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                <CashFlowSectionView section={cashFlow.operating} currencySymbol={currencySymbol} />
                <CashFlowSectionView section={cashFlow.investing} currencySymbol={currencySymbol} />
                <CashFlowSectionView section={cashFlow.financing} currencySymbol={currencySymbol} />

                <div className="border-t-4 border-double border-gray-400 pt-4 mt-6">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {cashFlow.netChange >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-green-600" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-600" />
                      )}
                      <span className="font-bold text-lg text-gray-900">
                        Net {cashFlow.netChange >= 0 ? "Increase" : "Decrease"} in Cash
                      </span>
                    </div>
                    <span className={`font-mono font-bold text-xl ${cashFlow.netChange >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {cashFlow.netChange < 0 ? "(" : ""}{currencySymbol}{formatAmount(cashFlow.netChange)}{cashFlow.netChange < 0 ? ")" : ""}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-6 print:mt-4">
                  <div className={`rounded-lg p-3 text-center ${cashFlow.operating.total >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                    <p className="text-xs text-gray-500 mb-1">Operating</p>
                    <p className={`font-mono font-bold text-sm ${cashFlow.operating.total >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {currencySymbol}{formatAmount(cashFlow.operating.total)}
                    </p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${cashFlow.investing.total >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                    <p className="text-xs text-gray-500 mb-1">Investing</p>
                    <p className={`font-mono font-bold text-sm ${cashFlow.investing.total >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {currencySymbol}{formatAmount(cashFlow.investing.total)}
                    </p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${cashFlow.financing.total >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                    <p className="text-xs text-gray-500 mb-1">Financing</p>
                    <p className={`font-mono font-bold text-sm ${cashFlow.financing.total >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {currencySymbol}{formatAmount(cashFlow.financing.total)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {hasData && cashFlow && (
          <Card className="mt-4 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 no-print">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  <CardTitle className="text-lg text-purple-900">AI Cash Flow Analysis</CardTitle>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-purple-300 text-purple-700 hover:bg-purple-100"
                  onClick={generateAIAnalysis}
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Brain className="mr-2 h-4 w-4" />
                  )}
                  {aiInsights.length > 0 ? "Refresh Analysis" : "Generate AI Analysis"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {aiLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-500 mr-3" />
                  <span className="text-purple-700">Analyzing cash flow with AI...</span>
                </div>
              ) : aiInsights.length === 0 ? (
                <div className="text-center py-6 text-purple-600">
                  <Brain className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Click "Generate AI Analysis" for cash flow insights.</p>
                  <p className="text-xs text-purple-400 mt-1">Includes liquidity assessment and cash management recommendations</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {aiInsights.map((insight: any, idx: number) => {
                    const icon = insight.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
                      insight.type === 'recommendation' ? <Lightbulb className="h-4 w-4 text-blue-500" /> :
                      insight.type === 'optimization' ? <TrendingUp className="h-4 w-4 text-green-500" /> :
                      <Info className="h-4 w-4 text-gray-500" />;
                    const bgColor = insight.type === 'warning' ? 'bg-amber-50 border-amber-200' :
                      insight.type === 'recommendation' ? 'bg-blue-50 border-blue-200' :
                      insight.type === 'optimization' ? 'bg-green-50 border-green-200' :
                      'bg-gray-50 border-gray-200';
                    const impactBadge = insight.impact === 'high' ? 'bg-red-100 text-red-700' :
                      insight.impact === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700';
                    return (
                      <div key={idx} className={`p-3 rounded-lg border ${bgColor}`}>
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{icon}</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">{insight.title}</span>
                              {insight.impact && (
                                <Badge className={`text-xs ${impactBadge}`}>{insight.impact}</Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-700">{insight.description}</p>
                            {insight.actionItems && insight.actionItems.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {insight.actionItems.map((item: string, i: number) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                                    <span className="text-purple-400 mt-0.5">•</span>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </PrintLayout>
    </DashboardContainer>
  );
}
