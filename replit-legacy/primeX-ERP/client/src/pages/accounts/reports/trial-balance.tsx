import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { PrintLayout } from "@/components/print/PrintLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Printer, AlertTriangle, CheckCircle, Scale, ChevronDown, ChevronRight, Brain, Loader2, Lightbulb, TrendingUp, Info } from "lucide-react";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";
import { useTenantInfo } from "@/hooks/useTenantInfo";

interface TrialBalanceEntry {
  accountId: number;
  accountNumber: string;
  accountName: string;
  accountTypeName: string;
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

function formatCurrency(val: number): string {
  return Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const natureColors: Record<string, string> = {
  Asset: "bg-blue-100 text-blue-800",
  Liability: "bg-orange-100 text-orange-800",
  Equity: "bg-purple-100 text-purple-800",
  Income: "bg-green-100 text-green-800",
  Expense: "bg-red-100 text-red-800",
};

function GroupRows({ group, expanded, toggleGroup, currencySymbol }: {
  group: TrialBalanceGroup;
  expanded: Set<number>;
  toggleGroup: (id: number) => void;
  currencySymbol: string;
}) {
  const isExpanded = expanded.has(group.groupId);
  const hasChildren = group.accounts.length > 0 || group.subGroups.length > 0;
  const indent = group.level * 20;

  return (
    <>
      <TableRow
        className={`cursor-pointer ${group.level === 0 ? "bg-gray-100 hover:bg-gray-200" : "bg-gray-50/50 hover:bg-gray-100"}`}
        onClick={() => toggleGroup(group.groupId)}
      >
        <TableCell colSpan={2} className="py-2" style={{ paddingLeft: `${12 + indent}px` }}>
          <div className="flex items-center gap-2">
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
            ) : <span className="w-4" />}
            <span className={`font-semibold ${group.level === 0 ? "text-gray-900" : "text-gray-700 text-sm"}`}>
              {group.groupName}
            </span>
            {group.level === 0 && (
              <Badge className={`text-xs ${natureColors[group.nature] || "bg-gray-100 text-gray-800"}`}>
                {group.nature}
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right font-mono text-sm font-semibold">
          {group.totalDebit > 0 ? formatCurrency(group.totalDebit) : ""}
        </TableCell>
        <TableCell className="text-right font-mono text-sm font-semibold">
          {group.totalCredit > 0 ? formatCurrency(group.totalCredit) : ""}
        </TableCell>
      </TableRow>

      {isExpanded && group.accounts.map((entry) => (
        <TableRow key={entry.accountId} className="hover:bg-gray-50">
          <TableCell className="font-mono text-xs text-gray-500" style={{ paddingLeft: `${32 + indent}px` }}>
            {entry.accountNumber}
          </TableCell>
          <TableCell>
            <Link href={`/accounts/reports/ledger/${entry.accountId}`}>
              <span className="text-blue-600 hover:text-blue-800 hover:underline text-sm">
                {entry.accountName}
              </span>
            </Link>
          </TableCell>
          <TableCell className="text-right font-mono text-sm">
            {entry.debitTotal > 0 ? formatCurrency(entry.debitTotal) : ""}
          </TableCell>
          <TableCell className="text-right font-mono text-sm">
            {entry.creditTotal > 0 ? formatCurrency(entry.creditTotal) : ""}
          </TableCell>
        </TableRow>
      ))}

      {isExpanded && group.subGroups.map((sg) => (
        <GroupRows key={sg.groupId} group={sg} expanded={expanded} toggleGroup={toggleGroup} currencySymbol={currencySymbol} />
      ))}
    </>
  );
}

function collectAllGroupIds(groups: TrialBalanceGroup[]): number[] {
  const ids: number[] = [];
  for (const g of groups) {
    ids.push(g.groupId);
    ids.push(...collectAllGroupIds(g.subGroups));
  }
  return ids;
}

export default function TrialBalancePage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const { tenantInfo } = useTenantInfo();

  const queryUrl = `/api/accounting/reports/trial-balance${asOfDate ? `?asOfDate=${asOfDate}` : ""}`;

  const { data: groups, isLoading } = useQuery<TrialBalanceGroup[]>({
    queryKey: [queryUrl],
  });

  const totalDebit = (groups || []).reduce((sum, g) => sum + g.totalDebit, 0);
  const totalCredit = (groups || []).reduce((sum, g) => sum + g.totalCredit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const hasData = groups && groups.length > 0;

  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const generateAIAnalysis = async () => {
    if (!groups || groups.length === 0) return;
    setAiLoading(true);
    try {
      const groupSummary = groups.map(g => ({
        name: g.groupName, nature: g.nature,
        totalDebit: g.totalDebit, totalCredit: g.totalCredit
      }));
      const res = await apiRequest("/api/ai-insights/erp/trial-balance", "POST", {
        totalDebit, totalCredit, isBalanced,
        groupSummary,
        accountCount: groups.reduce((sum, g) => sum + g.accounts.length, 0)
      });
      const data = await res.json();
      setAiInsights(data.insights || []);
    } catch (err) {
      setAiInsights([{ type: "info", title: "AI Insights Unavailable", description: "AI analysis could not be completed at this time. Please try again later." }]);
    } finally {
      setAiLoading(false);
    }
  };

  const toggleGroup = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (groups) {
      setExpanded(new Set(collectAllGroupIds(groups)));
    }
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  return (
    <DashboardContainer
      title="Trial Balance"
      subtitle="Summary of all account balances to verify accounting accuracy"
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      }
    >
      <PrintLayout 
        title="Trial Balance" 
        subtitle={`As of ${asOfDate}`}
        companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined}
        showSignatures={false}
      >
      <ModuleAIPanel
        title="AI Trial Balance Analysis"
        endpoint="/api/ai-insights/erp/trial-balance"
        requestData={{
          totalDebit,
          totalCredit,
          isBalanced,
          groupSummary: (groups || []).map(g => ({ name: g.groupName, nature: g.nature, totalDebit: g.totalDebit, totalCredit: g.totalCredit })),
          accountCount: (groups || []).reduce((sum, g) => sum + g.accounts.length, 0)
        }}
      />
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-64">
              <label className="text-sm font-medium text-gray-700 mb-1 block">As of Date</label>
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
              />
            </div>
            {hasData && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse All</Button>
                {isBalanced ? (
                  <Badge className="bg-green-100 text-green-800 gap-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Balanced
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Difference: {currencySymbol}{formatCurrency(Math.abs(totalDebit - totalCredit))}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !hasData ? (
            <div className="text-center py-16">
              <Scale className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-500">No trial balance data</h3>
              <p className="text-sm text-gray-400 mt-1">
                No accounts with balances found as of the selected date.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-[120px]">Acc. No.</TableHead>
                    <TableHead className="min-w-[250px]">Account / Group</TableHead>
                    <TableHead className="text-right w-[160px]">{`Debit (${currencySymbol})`}</TableHead>
                    <TableHead className="text-right w-[160px]">{`Credit (${currencySymbol})`}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups!.map((group) => (
                    <GroupRows
                      key={group.groupId}
                      group={group}
                      expanded={expanded}
                      toggleGroup={toggleGroup}
                      currencySymbol={currencySymbol}
                    />
                  ))}
                  <TableRow className={`border-t-2 ${isBalanced ? "bg-green-50" : "bg-red-50"}`}>
                    <TableCell colSpan={2} className="text-right font-bold text-gray-800">
                      Grand Total
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-gray-800">
                      {formatCurrency(totalDebit)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-gray-800">
                      {formatCurrency(totalCredit)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {hasData && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">P&L Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const incomeGroups = (groups || []).filter(g => g.nature === "Income");
                const expenseGroups = (groups || []).filter(g => g.nature === "Expense");
                const totalIncome = incomeGroups.reduce((s, g) => s + g.totalCredit, 0);
                const totalExpense = expenseGroups.reduce((s, g) => s + g.totalDebit, 0);
                const netProfit = totalIncome - totalExpense;
                return (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Income</span>
                      <span className="font-mono font-medium text-green-700">{currencySymbol}{formatCurrency(totalIncome)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Expenses</span>
                      <span className="font-mono font-medium text-red-700">{currencySymbol}{formatCurrency(totalExpense)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between">
                      <span className="font-semibold">Net Profit / (Loss)</span>
                      <span className={`font-mono font-bold ${netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {currencySymbol}{netProfit >= 0 ? "" : "("}{formatCurrency(netProfit)}{netProfit < 0 ? ")" : ""}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Balance Sheet Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const assetGroups = (groups || []).filter(g => g.nature === "Asset");
                const liabEquityGroups = (groups || []).filter(g => g.nature === "Liability" || g.nature === "Equity");
                const totalAssets = assetGroups.reduce((s, g) => s + g.totalDebit - g.totalCredit, 0);
                const totalLiabilities = liabEquityGroups.reduce((s, g) => s + g.totalCredit - g.totalDebit, 0);
                return (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Assets</span>
                      <span className="font-mono font-medium">{currencySymbol}{formatCurrency(totalAssets)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Liabilities & Equity</span>
                      <span className="font-mono font-medium">{currencySymbol}{formatCurrency(totalLiabilities)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between">
                      <span className="font-semibold">Difference</span>
                      <span className={`font-mono font-bold ${Math.abs(totalAssets - totalLiabilities) < 0.01 ? "text-green-700" : "text-red-700"}`}>
                        {currencySymbol}{formatCurrency(totalAssets - totalLiabilities)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* AI Insights Panel */}
        <Card className="mt-4 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-lg text-purple-900">AI-Powered Analysis</CardTitle>
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
                <span className="text-purple-700">Analyzing trial balance with AI...</span>
              </div>
            ) : aiInsights.length === 0 ? (
              <div className="text-center py-6 text-purple-600">
                <Brain className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Click "Generate AI Analysis" to get intelligent insights about your trial balance.</p>
                <p className="text-xs text-purple-400 mt-1">Includes anomaly detection, ratio analysis, and industry benchmarks</p>
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
      </PrintLayout>
    </DashboardContainer>
  );
}
