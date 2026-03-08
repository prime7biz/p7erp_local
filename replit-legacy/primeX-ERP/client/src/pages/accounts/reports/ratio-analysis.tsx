import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { Brain, Loader2, CheckCircle, AlertTriangle, XCircle, TrendingUp, Lightbulb, Info, Scale } from "lucide-react";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";


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

interface RatioInfo {
  name: string;
  value: number;
  displayValue: string;
  benchmark: string;
  status: "good" | "warning" | "poor";
  description: string;
}

function calculateRatios(groups: TrialBalanceGroup[], currencySymbol: string): RatioInfo[] {
  const byNature = (nature: string) => groups.filter(g => g.nature === nature);

  const assetGroups = byNature("Asset");
  const liabilityGroups = byNature("Liability");
  const equityGroups = byNature("Equity");
  const incomeGroups = byNature("Income");
  const expenseGroups = byNature("Expense");

  const totalAssets = assetGroups.reduce((s, g) => s + g.totalDebit - g.totalCredit, 0);
  const totalLiabilities = liabilityGroups.reduce((s, g) => s + g.totalCredit - g.totalDebit, 0);
  const totalEquity = equityGroups.reduce((s, g) => s + g.totalCredit - g.totalDebit, 0);
  const totalIncome = incomeGroups.reduce((s, g) => s + g.totalCredit - g.totalDebit, 0);
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.totalDebit - g.totalCredit, 0);

  const isDirectExpenseGroup = (name: string): boolean => {
    const lower = name.toLowerCase().trim();
    if (lower === "indirect expenses" || lower.startsWith("indirect ")) return false;
    return (
      lower === "direct expenses" ||
      lower === "cost of goods sold" ||
      lower === "manufacturing expenses" ||
      lower === "production expenses" ||
      lower === "purchase account" ||
      lower.startsWith("direct expense") ||
      lower.startsWith("manufacturing expense") ||
      lower.startsWith("production expense") ||
      lower.startsWith("purchase account") ||
      lower.startsWith("cost of goods")
    );
  };
  const collectDirectTotals = (group: TrialBalanceGroup): number => {
    if (isDirectExpenseGroup(group.groupName)) {
      return group.totalDebit - group.totalCredit;
    }
    let total = 0;
    if (group.subGroups) {
      for (const sg of group.subGroups) {
        total += collectDirectTotals(sg);
      }
    }
    return total;
  };
  const directExpenses = expenseGroups.reduce((s, g) => s + collectDirectTotals(g), 0);

  const netProfit = totalIncome - totalExpenses;
  const grossProfit = totalIncome - directExpenses;

  const currentRatio = totalLiabilities > 0 ? totalAssets / totalLiabilities : 0;
  const debtToEquity = totalEquity > 0 ? totalLiabilities / totalEquity : 0;
  const grossMargin = totalIncome > 0 ? (grossProfit / totalIncome) * 100 : 0;
  const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
  const workingCapital = totalAssets - totalLiabilities;
  const roa = totalAssets > 0 ? (netProfit / totalAssets) * 100 : 0;

  return [
    {
      name: "Current Ratio",
      value: currentRatio,
      displayValue: `${currentRatio.toFixed(2)}:1`,
      benchmark: "> 1.5",
      status: currentRatio >= 1.5 ? "good" : currentRatio >= 1.0 ? "warning" : "poor",
      description: "Measures ability to pay short-term obligations",
    },
    {
      name: "Debt-to-Equity",
      value: debtToEquity,
      displayValue: `${debtToEquity.toFixed(2)}:1`,
      benchmark: "< 2.0",
      status: debtToEquity <= 1.0 ? "good" : debtToEquity <= 2.0 ? "warning" : "poor",
      description: "Proportion of debt relative to shareholder equity",
    },
    {
      name: "Working Capital",
      value: workingCapital,
      displayValue: `${currencySymbol}${formatAmount(workingCapital)}`,
      benchmark: "> 0",
      status: workingCapital > 0 ? "good" : workingCapital === 0 ? "warning" : "poor",
      description: "Net current assets available for operations",
    },
    {
      name: "Gross Profit Margin",
      value: grossMargin,
      displayValue: `${grossMargin.toFixed(1)}%`,
      benchmark: "> 15%",
      status: grossMargin >= 15 ? "good" : grossMargin >= 8 ? "warning" : "poor",
      description: "Profitability after direct costs (Bangladesh garment avg: 15-25%)",
    },
    {
      name: "Net Profit Margin",
      value: netMargin,
      displayValue: `${netMargin.toFixed(1)}%`,
      benchmark: "> 10%",
      status: netMargin >= 10 ? "good" : netMargin >= 5 ? "warning" : "poor",
      description: "Overall profitability after all expenses",
    },
    {
      name: "Return on Assets",
      value: roa,
      displayValue: `${roa.toFixed(1)}%`,
      benchmark: "> 10%",
      status: roa >= 10 ? "good" : roa >= 5 ? "warning" : "poor",
      description: "Efficiency of asset utilization for profit generation",
    },
  ];
}

const statusConfig = {
  good: { label: "Good", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 border-green-200", badgeClass: "bg-green-100 text-green-800" },
  warning: { label: "Average", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", badgeClass: "bg-amber-100 text-amber-800" },
  poor: { label: "Poor", icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", badgeClass: "bg-red-100 text-red-800" },
};

function RatioCard({ ratio }: { ratio: RatioInfo }) {
  const config = statusConfig[ratio.status];
  const StatusIcon = config.icon;

  return (
    <Card className={`border-2 ${config.bg} transition-all hover:shadow-md`}>
      <CardContent className="pt-6 pb-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-gray-800 text-sm">{ratio.name}</h3>
          <StatusIcon className={`h-5 w-5 ${config.color}`} />
        </div>
        <div className="text-center py-3">
          <p className="text-3xl font-bold text-gray-900">{ratio.displayValue}</p>
        </div>
        <div className="flex items-center justify-between mt-3">
          <Badge className={`text-xs ${config.badgeClass}`}>
            {config.label}
          </Badge>
          <span className="text-xs text-gray-500">Benchmark: {ratio.benchmark}</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">{ratio.description}</p>
      </CardContent>
    </Card>
  );
}

export default function RatioAnalysisPage() {
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");

  const { data: groups, isLoading } = useQuery<TrialBalanceGroup[]>({
    queryKey: ["/api/accounting/reports/trial-balance"],
  });

  const ratios = groups ? calculateRatios(groups, currencySymbol) : [];
  const hasData = groups && groups.length > 0;

  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const generateAIAnalysis = async () => {
    if (!groups || groups.length === 0) return;
    setAiLoading(true);
    try {
      const ratioData = ratios.map(r => ({ name: r.name, value: r.value, status: r.status }));
      const res = await apiRequest("/api/ai-insights/erp/financial-statement", "POST", {
        reportType: "ratio-analysis",
        ratios: ratioData,
        groupDetails: groups.map(g => ({
          name: g.groupName,
          nature: g.nature,
          totalDebit: g.totalDebit,
          totalCredit: g.totalCredit,
        })),
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
      title="Ratio Analysis"
      subtitle="Key financial ratios with Bangladesh garment industry benchmarks"
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : !hasData ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <Scale className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-500">No data available</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Create some vouchers and journal entries to see ratio analysis.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ratios.map((ratio) => (
                <RatioCard key={ratio.name} ratio={ratio} />
              ))}
            </div>

            <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 no-print">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-600" />
                    <CardTitle className="text-lg text-purple-900">AI-Powered Ratio Analysis</CardTitle>
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
                    <span className="text-purple-700">Analyzing financial ratios with AI...</span>
                  </div>
                ) : aiInsights.length === 0 ? (
                  <div className="text-center py-6 text-purple-600">
                    <Brain className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Click "Generate AI Analysis" for intelligent ratio insights.</p>
                    <p className="text-xs text-purple-400 mt-1">Includes industry comparison and improvement recommendations</p>
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
          </>
        )}
      </div>
    </DashboardContainer>
  );
}
