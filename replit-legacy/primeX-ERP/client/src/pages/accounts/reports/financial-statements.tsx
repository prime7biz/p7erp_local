import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { PrintLayout } from "@/components/print/PrintLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Printer, TrendingUp, TrendingDown, Wallet, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Brain, Loader2, Lightbulb, Info } from "lucide-react";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";
import { apiRequest } from "@/lib/queryClient";
import { useTenantInfo } from "@/hooks/useTenantInfo";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";

interface PLGroupNode {
  groupId: number;
  groupName: string;
  level: number;
  accounts: Array<{ accountId: number; accountName: string; amount: number }>;
  subGroups: PLGroupNode[];
  total: number;
}

interface ProfitLossData {
  directIncome: PLGroupNode[];
  purchaseAccounts: PLGroupNode[];
  directExpenses: PLGroupNode[];
  indirectIncome: PLGroupNode[];
  indirectExpenses: PLGroupNode[];
  grossProfit: number;
  netProfit: number;
  totalDirectIncome: number;
  totalPurchases: number;
  totalDirectExpenses: number;
  totalIndirectIncome: number;
  totalIndirectExpenses: number;
}

interface BSGroupNode {
  groupId: number;
  groupName: string;
  level: number;
  accounts: Array<{ accountId: number; accountName: string; balance: number }>;
  subGroups: BSGroupNode[];
  total: number;
}

interface BalanceSheetData {
  assets: BSGroupNode[];
  liabilities: BSGroupNode[];
  totalAssets: number;
  totalLiabilities: number;
  difference: number;
}

interface CashBankEntry {
  id: number;
  postingDate: string;
  voucherNumber: string;
  voucherType: string;
  narration: string | null;
  debitAmount: string;
  creditAmount: string;
  runningBalance: number;
}

interface CashBankResult {
  openingBalance: number;
  entries: CashBankEntry[];
}

interface Account {
  id: number;
  accountNumber: string;
  name: string;
  isActive: boolean;
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

function formatCurrency(val: number): string {
  return Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function collectGroupIds(nodes: PLGroupNode[] | BSGroupNode[]): number[] {
  const ids: number[] = [];
  for (const n of nodes) {
    ids.push(n.groupId);
    ids.push(...collectGroupIds(n.subGroups));
  }
  return ids;
}

function PLGroupRows({ node, expanded, toggle, currencySymbol, indent = 0 }: {
  node: PLGroupNode;
  expanded: Set<number>;
  toggle: (id: number) => void;
  currencySymbol: string;
  indent?: number;
}) {
  const isExpanded = expanded.has(node.groupId);
  const hasChildren = node.accounts.length > 0 || node.subGroups.length > 0;

  return (
    <>
      <div
        className="flex justify-between items-center py-1.5 px-2 hover:bg-gray-50 rounded cursor-pointer"
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={() => toggle(node.groupId)}
      >
        <div className="flex items-center gap-1.5">
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          ) : <span className="w-3.5" />}
          <span className="font-semibold text-sm text-gray-800">{node.groupName}</span>
        </div>
        <span className="font-mono text-sm font-semibold">{currencySymbol}{formatCurrency(node.total)}</span>
      </div>
      {isExpanded && node.accounts.map((acct) => (
        <div key={acct.accountId} className="flex justify-between text-sm py-1 px-2 hover:bg-gray-50 rounded" style={{ paddingLeft: `${28 + indent}px` }}>
          <span className="text-gray-600">{acct.accountName}</span>
          <span className="font-mono">{formatCurrency(acct.amount)}</span>
        </div>
      ))}
      {isExpanded && node.subGroups.map((sg) => (
        <PLGroupRows key={sg.groupId} node={sg} expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} indent={indent + 16} />
      ))}
    </>
  );
}

function BSGroupRows({ node, expanded, toggle, currencySymbol, indent = 0 }: {
  node: BSGroupNode;
  expanded: Set<number>;
  toggle: (id: number) => void;
  currencySymbol: string;
  indent?: number;
}) {
  const isExpanded = expanded.has(node.groupId);
  const hasChildren = node.accounts.length > 0 || node.subGroups.length > 0;

  return (
    <>
      <div
        className="flex justify-between items-center py-1.5 px-2 hover:bg-gray-50 rounded cursor-pointer"
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={() => toggle(node.groupId)}
      >
        <div className="flex items-center gap-1.5">
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          ) : <span className="w-3.5" />}
          <span className="font-semibold text-sm text-gray-800">{node.groupName}</span>
        </div>
        <span className="font-mono text-sm font-semibold">{currencySymbol}{formatCurrency(node.total)}</span>
      </div>
      {isExpanded && node.accounts.map((acct) => (
        <div key={acct.accountId} className="flex justify-between text-sm py-1 px-2 hover:bg-gray-50 rounded" style={{ paddingLeft: `${28 + indent}px` }}>
          <span className="text-gray-600">{acct.accountName}</span>
          <span className="font-mono">{formatCurrency(acct.balance)}</span>
        </div>
      ))}
      {isExpanded && node.subGroups.map((sg) => (
        <BSGroupRows key={sg.groupId} node={sg} expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} indent={indent + 16} />
      ))}
    </>
  );
}

function PLSection({ title, nodes, color, expanded, toggle, currencySymbol }: {
  title: string;
  nodes: PLGroupNode[];
  color: string;
  expanded: Set<number>;
  toggle: (id: number) => void;
  currencySymbol: string;
}) {
  const total = nodes.reduce((s, n) => s + n.total, 0);
  if (nodes.length === 0) return null;

  return (
    <div className="mb-4">
      <h4 className={`text-sm font-semibold uppercase tracking-wide mb-2 ${color}`}>{title}</h4>
      {nodes.map((node) => (
        <PLGroupRows key={node.groupId} node={node} expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} />
      ))}
      <div className="flex justify-between font-semibold text-sm py-1.5 px-2 mt-1 bg-gray-50 rounded border">
        <span>Total {title}</span>
        <span className="font-mono">{currencySymbol}{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function ProfitLossTab() {
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const { tenantInfo } = useTenantInfo();

  const [plAiInsights, setPlAiInsights] = useState<any[]>([]);
  const [plAiLoading, setPlAiLoading] = useState(false);

  const { data, isLoading } = useQuery<ProfitLossData>({
    queryKey: [`/api/accounting/reports/profit-and-loss?startDate=${startDate}&endDate=${endDate}`],
    enabled: !!startDate && !!endDate,
  });

  const generatePLAnalysis = async () => {
    setPlAiLoading(true);
    try {
      const res = await apiRequest("/api/ai-insights/erp/financial-statement", "POST", {
        reportType: 'profit-loss',
        grossProfit: data?.grossProfit || 0,
        netProfit: data?.netProfit || 0,
        totalIncome: data?.totalDirectIncome || 0,
        totalExpenses: (data?.totalDirectExpenses || 0) + (data?.totalIndirectExpenses || 0),
        groupDetails: [
          ...(data?.directIncome || []).map((g: any) => ({ name: g.groupName, total: g.total })),
          ...(data?.directExpenses || []).map((g: any) => ({ name: g.groupName, total: g.total })),
          ...(data?.indirectExpenses || []).map((g: any) => ({ name: g.groupName, total: g.total })),
        ]
      });
      const aiData = await res.json();
      setPlAiInsights(aiData.insights || []);
    } catch (err) { console.error(err); }
    finally { setPlAiLoading(false); }
  };

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!data) return;
    const ids = [
      ...collectGroupIds(data.directIncome),
      ...collectGroupIds(data.purchaseAccounts),
      ...collectGroupIds(data.directExpenses),
      ...collectGroupIds(data.indirectIncome),
      ...collectGroupIds(data.indirectExpenses),
    ];
    setExpanded(new Set(ids));
  };

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <PrintLayout title="Profit & Loss Statement" dateRange={`${startDate} to ${endDate}`} companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined} showSignatures={false}>
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="w-full md:w-48">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="w-full md:w-48">
          <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {data && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
            <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>Collapse All</Button>
          </div>
        )}
      </div>

      {!data ? (
        <div className="text-center py-12 text-gray-500">No data available for the selected period.</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <PLSection title="Direct Income" nodes={data.directIncome} color="text-green-700" expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} />
              <PLSection title="Purchase Accounts" nodes={data.purchaseAccounts} color="text-amber-700" expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} />
              <PLSection title="Direct Expenses" nodes={data.directExpenses} color="text-red-700" expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} />

              <div className={`flex justify-between items-center p-3 rounded-lg border-2 mb-4 ${data.grossProfit >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <span className="font-bold">Gross Profit / (Loss)</span>
                <span className={`font-mono font-bold text-lg ${data.grossProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {currencySymbol}{data.grossProfit < 0 ? "(" : ""}{formatCurrency(data.grossProfit)}{data.grossProfit < 0 ? ")" : ""}
                </span>
              </div>
            </div>

            <div>
              <PLSection title="Indirect Income" nodes={data.indirectIncome} color="text-green-600" expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} />
              <PLSection title="Indirect Expenses" nodes={data.indirectExpenses} color="text-red-600" expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} />

              <div className={`flex justify-between items-center p-3 rounded-lg border-2 ${data.netProfit >= 0 ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
                <div className="flex items-center gap-2">
                  {data.netProfit >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
                  <span className="font-bold text-lg">Net Profit / (Loss)</span>
                </div>
                <span className={`font-mono font-bold text-xl ${data.netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {currencySymbol}{data.netProfit < 0 ? "(" : ""}{formatCurrency(data.netProfit)}{data.netProfit < 0 ? ")" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      <Card className="mt-4 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 no-print">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-lg text-purple-900">AI Analysis</CardTitle>
            </div>
            <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-100"
              onClick={generatePLAnalysis} disabled={plAiLoading}>
              {plAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              {plAiInsights.length > 0 ? "Refresh" : "Analyze"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {plAiLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-purple-500 mr-2" />
              <span className="text-purple-700 text-sm">Running AI analysis...</span>
            </div>
          ) : plAiInsights.length === 0 ? (
            <p className="text-center py-4 text-sm text-purple-600">Click Analyze for AI-powered insights</p>
          ) : (
            <div className="space-y-2">
              {plAiInsights.map((insight: any, idx: number) => (
                <div key={idx} className={`p-3 rounded-lg border ${
                  insight.type === 'warning' ? 'bg-amber-50 border-amber-200' :
                  insight.type === 'recommendation' ? 'bg-blue-50 border-blue-200' :
                  insight.type === 'optimization' ? 'bg-green-50 border-green-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-start gap-2">
                    {insight.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" /> :
                     insight.type === 'recommendation' ? <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5" /> :
                     <Info className="h-4 w-4 text-gray-500 mt-0.5" />}
                    <div>
                      <span className="font-semibold text-sm">{insight.title}</span>
                      {insight.impact && <Badge className={`ml-2 text-xs ${insight.impact === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{insight.impact}</Badge>}
                      <p className="text-sm text-gray-700 mt-1">{insight.description}</p>
                      {insight.actionItems?.length > 0 && (
                        <ul className="mt-1 space-y-0.5">{insight.actionItems.map((a: string, i: number) => (
                          <li key={i} className="text-xs text-gray-600">• {a}</li>
                        ))}</ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </PrintLayout>
  );
}

function BalanceSheetTab() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const { tenantInfo } = useTenantInfo();

  const [bsAiInsights, setBsAiInsights] = useState<any[]>([]);
  const [bsAiLoading, setBsAiLoading] = useState(false);

  const { data, isLoading } = useQuery<BalanceSheetData>({
    queryKey: [`/api/accounting/reports/balance-sheet?asOfDate=${asOfDate}`],
  });

  const generateBSAnalysis = async () => {
    setBsAiLoading(true);
    try {
      const res = await apiRequest("/api/ai-insights/erp/financial-statement", "POST", {
        reportType: 'balance-sheet',
        totalAssets: data?.totalAssets || 0,
        totalLiabilities: data?.totalLiabilities || 0,
        difference: data?.difference || 0,
        groupDetails: [
          ...(data?.assets || []).map((g: any) => ({ name: g.groupName, total: g.total })),
          ...(data?.liabilities || []).map((g: any) => ({ name: g.groupName, total: g.total })),
        ]
      });
      const aiData = await res.json();
      setBsAiInsights(aiData.insights || []);
    } catch (err) { console.error(err); }
    finally { setBsAiLoading(false); }
  };

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!data) return;
    const ids = [...collectGroupIds(data.assets), ...collectGroupIds(data.liabilities)];
    setExpanded(new Set(ids));
  };

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  const isBalanced = data ? Math.abs(data.difference) < 0.01 : true;

  return (
    <PrintLayout title="Balance Sheet" subtitle={`As of ${asOfDate}`} companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined} showSignatures={false}>
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="w-full md:w-48">
          <label className="text-sm font-medium text-gray-700 mb-1 block">As of Date</label>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </div>
        {data && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
            <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>Collapse All</Button>
            {isBalanced ? (
              <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="h-3.5 w-3.5" />Balanced</Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Difference: {currencySymbol}{formatCurrency(data.difference)}
              </Badge>
            )}
          </div>
        )}
      </div>

      {!data ? (
        <div className="text-center py-12 text-gray-500">No data available.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-blue-700">Assets</CardTitle>
            </CardHeader>
            <CardContent>
              {data.assets.map((node) => (
                <BSGroupRows key={node.groupId} node={node} expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} />
              ))}
              <div className="flex justify-between items-center p-3 mt-3 bg-blue-50 rounded-lg border-2 border-blue-200">
                <span className="font-bold">Total Assets</span>
                <span className="font-mono font-bold text-lg text-blue-700">{currencySymbol}{formatCurrency(data.totalAssets)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-orange-700">Liabilities & Equity</CardTitle>
            </CardHeader>
            <CardContent>
              {data.liabilities.map((node) => (
                <BSGroupRows key={node.groupId} node={node} expanded={expanded} toggle={toggle} currencySymbol={currencySymbol} />
              ))}
              <div className="flex justify-between items-center p-3 mt-3 bg-orange-50 rounded-lg border-2 border-orange-200">
                <span className="font-bold">Total Liabilities & Equity</span>
                <span className="font-mono font-bold text-lg text-orange-700">{currencySymbol}{formatCurrency(data.totalLiabilities)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <Card className="mt-4 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 no-print">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-lg text-purple-900">AI Analysis</CardTitle>
            </div>
            <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-100"
              onClick={generateBSAnalysis} disabled={bsAiLoading}>
              {bsAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              {bsAiInsights.length > 0 ? "Refresh" : "Analyze"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {bsAiLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-purple-500 mr-2" />
              <span className="text-purple-700 text-sm">Running AI analysis...</span>
            </div>
          ) : bsAiInsights.length === 0 ? (
            <p className="text-center py-4 text-sm text-purple-600">Click Analyze for AI-powered insights</p>
          ) : (
            <div className="space-y-2">
              {bsAiInsights.map((insight: any, idx: number) => (
                <div key={idx} className={`p-3 rounded-lg border ${
                  insight.type === 'warning' ? 'bg-amber-50 border-amber-200' :
                  insight.type === 'recommendation' ? 'bg-blue-50 border-blue-200' :
                  insight.type === 'optimization' ? 'bg-green-50 border-green-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-start gap-2">
                    {insight.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" /> :
                     insight.type === 'recommendation' ? <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5" /> :
                     <Info className="h-4 w-4 text-gray-500 mt-0.5" />}
                    <div>
                      <span className="font-semibold text-sm">{insight.title}</span>
                      {insight.impact && <Badge className={`ml-2 text-xs ${insight.impact === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{insight.impact}</Badge>}
                      <p className="text-sm text-gray-700 mt-1">{insight.description}</p>
                      {insight.actionItems?.length > 0 && (
                        <ul className="mt-1 space-y-0.5">{insight.actionItems.map((a: string, i: number) => (
                          <li key={i} className="text-xs text-gray-600">• {a}</li>
                        ))}</ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </PrintLayout>
  );
}

function CashBankBookTab() {
  const defaults = getDefaultDateRange();
  const [accountId, setAccountId] = useState<string>("");
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");

  const { data: cashBankAccounts } = useQuery<Account[]>({
    queryKey: ["/api/accounting/cash-and-bank-accounts"],
  });

  const { data: cbData, isLoading } = useQuery<CashBankResult>({
    queryKey: ["/api/accounting/reports/cash-bank-book", accountId, startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/reports/cash-bank-book/${accountId}?startDate=${startDate}&endDate=${endDate}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!accountId && !!startDate && !!endDate,
  });

  const closingBalance = cbData
    ? (cbData.entries.length > 0 ? cbData.entries[cbData.entries.length - 1].runningBalance : cbData.openingBalance)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 min-w-0">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Cash/Bank Account</label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Select cash/bank account" />
            </SelectTrigger>
            <SelectContent>
              {(cashBankAccounts || []).map((acc) => (
                <SelectItem key={acc.id} value={acc.id.toString()}>
                  {acc.accountNumber} — {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-44">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="w-full md:w-44">
          <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      {!accountId ? (
        <div className="text-center py-12">
          <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500">Select an account</h3>
          <p className="text-sm text-gray-400 mt-1">Choose a cash or bank account to view its book.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : !cbData ? (
        <div className="text-center py-12 text-gray-500">No data available.</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-600">Opening Balance</span>
            <span className={`font-mono font-bold text-lg ${cbData.openingBalance >= 0 ? "text-blue-700" : "text-orange-700"}`}>
              {currencySymbol}{formatCurrency(cbData.openingBalance)} {cbData.openingBalance >= 0 ? "Dr" : "Cr"}
            </span>
          </div>

          {cbData.entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No transactions found.</div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-[110px]">Date</TableHead>
                    <TableHead>Voucher No.</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="min-w-[180px]">Narration</TableHead>
                    <TableHead className="text-right w-[130px]">{`Debit (${currencySymbol})`}</TableHead>
                    <TableHead className="text-right w-[130px]">{`Credit (${currencySymbol})`}</TableHead>
                    <TableHead className="text-right w-[150px]">{`Balance (${currencySymbol})`}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cbData.entries.map((entry) => {
                    const debit = parseFloat(entry.debitAmount || "0");
                    const credit = parseFloat(entry.creditAmount || "0");
                    return (
                      <TableRow key={entry.id} className="hover:bg-gray-50">
                        <TableCell className="text-sm">{formatDate(entry.postingDate)}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.voucherNumber}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{entry.voucherType}</Badge></TableCell>
                        <TableCell className="text-sm text-gray-600">{entry.narration || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{debit > 0 ? formatCurrency(debit) : ""}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{credit > 0 ? formatCurrency(credit) : ""}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${entry.runningBalance >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                          {formatCurrency(entry.runningBalance)} {entry.runningBalance >= 0 ? "Dr" : "Cr"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-600">Closing Balance</span>
            <span className={`font-mono font-bold text-lg ${closingBalance >= 0 ? "text-blue-700" : "text-orange-700"}`}>
              {currencySymbol}{formatCurrency(closingBalance)} {closingBalance >= 0 ? "Dr" : "Cr"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FinancialStatementsPage() {
  return (
    <DashboardContainer
      title="Financial Statements"
      subtitle="Profit & Loss, Balance Sheet, and Cash/Bank Book reports"
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      }
    >
      <ModuleAIPanel
        title="AI Financial Statement Analysis"
        endpoint="/api/ai-insights/erp/financial-statement"
        requestData={{}}
      />
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="profit-loss">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="profit-loss">Profit & Loss</TabsTrigger>
              <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
              <TabsTrigger value="cash-bank">Cash/Bank Book</TabsTrigger>
            </TabsList>

            <TabsContent value="profit-loss">
              <ProfitLossTab />
            </TabsContent>
            <TabsContent value="balance-sheet">
              <BalanceSheetTab />
            </TabsContent>
            <TabsContent value="cash-bank">
              <CashBankBookTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </DashboardContainer>
  );
}
