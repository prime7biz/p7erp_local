import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, BarChart, LineChart, PieChart } from "@/components/charts";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

type PeriodType = 'day' | 'week' | 'month' | 'quarter' | 'year';

interface FinancialSummary {
  revenue: {
    current: number;
    previous: number;
    change: number;
  };
  expenses: {
    current: number;
    previous: number;
    change: number;
  };
  profit: {
    current: number;
    previous: number;
    change: number;
  };
  cashBalance: {
    current: number;
    previous: number;
    change: number;
  };
  period: string;
}

interface FinancialInsight {
  id: number;
  type: "warning" | "positive" | "info";
  title: string;
  description: string;
  recommendations: string[];
  confidence: number;
  createdAt: string;
}

interface DashboardMetrics {
  monthlyData: Array<{ month: string; income: number; expense: number; netProfit: number }>;
  cashFlowData: Array<{ month: string; inflow: number; outflow: number; netFlow: number }>;
  expenseBreakdown: Array<{ name: string; value: number }>;
}

export default function AccountingDashboard() {
  const [period, setPeriod] = useState<PeriodType>('month');
  const [chartTimeRange, setChartTimeRange] = useState<PeriodType>('month');
  const { toast } = useToast();

  const { data: summary, isLoading: summaryLoading } = useQuery<FinancialSummary>({
    queryKey: ['/api/accounting/dashboard/summary', { period }],
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<FinancialInsight[]>({
    queryKey: ['/api/accounting/insights'],
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ['/api/accounting/dashboard/metrics'],
  });

  const { data: recentJournals, isLoading: journalsLoading } = useQuery<any[]>({
    queryKey: ['/api/accounting/journals/recent'],
  });

  const { data: currentFiscalYear, isLoading: fiscalYearLoading } = useQuery<{
    id: number; name: string; startDate: string; endDate: string; isActive: boolean;
  }>({
    queryKey: ['/api/accounting/fiscal-years/current'],
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'BDT',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getChangeClass = (change: number) => {
    if (change > 0) return 'text-status-success';
    if (change < 0) return 'text-status-error';
    return 'text-neutral-dark';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return 'trending_up';
    if (change < 0) return 'trending_down';
    return 'remove';
  };

  const getInsightTypeColor = (type: string) => {
    switch (type) {
      case 'warning': return 'text-status-warning';
      case 'positive': return 'text-status-success';
      case 'info': return 'text-primary';
      default: return 'text-neutral-dark';
    }
  };

  const getInsightTypeIcon = (type: string) => {
    switch (type) {
      case 'warning': return 'warning';
      case 'positive': return 'check_circle';
      case 'info': return 'info';
      default: return 'help';
    }
  };

  const hasMonthlyData = metrics?.monthlyData && metrics.monthlyData.some(m => m.income !== 0 || m.expense !== 0);
  const hasCashFlowData = metrics?.cashFlowData && metrics.cashFlowData.some(m => m.inflow !== 0 || m.outflow !== 0);
  const hasExpenseData = metrics?.expenseBreakdown && metrics.expenseBreakdown.length > 0;

  const revenueChartData = metrics?.monthlyData?.map(m => ({ month: m.month, revenue: m.income })) || [];
  const plChartData = metrics?.monthlyData?.map(m => ({ month: m.month, revenue: m.income, expenses: m.expense, profit: m.netProfit })) || [];
  const cfChartData = metrics?.cashFlowData || [];

  const totalRevenue = summary?.revenue.current || 0;
  const totalExpenses = summary?.expenses.current || 0;
  const totalProfit = summary?.profit.current || 0;

  return (
    <DashboardContainer 
      title="Financial Dashboard" 
      subtitle="Comprehensive financial overview and analytics"
      actions={
        <div className="flex space-x-2">
          <Select value={period} onValueChange={(value) => setPeriod(value as PeriodType)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <span className="material-icons mr-2 text-sm">download</span>
            Export
          </Button>
          <Button>
            <span className="material-icons mr-2 text-sm">refresh</span>
            Refresh
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-md font-medium flex items-center">
              <span className="material-icons mr-2 text-primary">payments</span>
              Revenue
            </CardTitle>
            <CardDescription>
              {period === 'day' ? 'Today' : 
               period === 'week' ? 'This Week' : 
               period === 'month' ? 'This Month' : 
               period === 'quarter' ? 'This Quarter' : 'This Year'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary?.revenue.current || 0)}
                </div>
                <div className={`flex items-center mt-1 text-sm ${getChangeClass(summary?.revenue.change || 0)}`}>
                  <span className="material-icons text-sm mr-1">
                    {getChangeIcon(summary?.revenue.change || 0)}
                  </span>
                  <span>{summary?.revenue.change || 0}%</span>
                  <span className="ml-1 text-neutral-dark">vs previous period</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-md font-medium flex items-center">
              <span className="material-icons mr-2 text-orange-600">receipt_long</span>
              Expenses
            </CardTitle>
            <CardDescription>
              {period === 'day' ? 'Today' : 
               period === 'week' ? 'This Week' : 
               period === 'month' ? 'This Month' : 
               period === 'quarter' ? 'This Quarter' : 'This Year'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary?.expenses.current || 0)}
                </div>
                <div className={`flex items-center mt-1 text-sm ${getChangeClass(-1 * (summary?.expenses.change || 0))}`}>
                  <span className="material-icons text-sm mr-1">
                    {getChangeIcon(-1 * (summary?.expenses.change || 0))}
                  </span>
                  <span>{summary?.expenses.change || 0}%</span>
                  <span className="ml-1 text-neutral-dark">vs previous period</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-md font-medium flex items-center">
              <span className="material-icons mr-2 text-status-success">trending_up</span>
              Profit
            </CardTitle>
            <CardDescription>
              {period === 'day' ? 'Today' : 
               period === 'week' ? 'This Week' : 
               period === 'month' ? 'This Month' : 
               period === 'quarter' ? 'This Quarter' : 'This Year'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary?.profit.current || 0)}
                </div>
                <div className={`flex items-center mt-1 text-sm ${getChangeClass(summary?.profit.change || 0)}`}>
                  <span className="material-icons text-sm mr-1">
                    {getChangeIcon(summary?.profit.change || 0)}
                  </span>
                  <span>{summary?.profit.change || 0}%</span>
                  <span className="ml-1 text-neutral-dark">vs previous period</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-md font-medium flex items-center">
              <span className="material-icons mr-2 text-blue-500">account_balance</span>
              Cash Balance
            </CardTitle>
            <CardDescription>
              Current Position
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary?.cashBalance.current || 0)}
                </div>
                <div className={`flex items-center mt-1 text-sm ${getChangeClass(summary?.cashBalance.change || 0)}`}>
                  <span className="material-icons text-sm mr-1">
                    {getChangeIcon(summary?.cashBalance.change || 0)}
                  </span>
                  <span>{summary?.cashBalance.change || 0}%</span>
                  <span className="ml-1 text-neutral-dark">vs previous period</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center">
            <span className="material-icons mr-2">event_note</span>
            Current Fiscal Year
          </CardTitle>
          <CardDescription>
            {fiscalYearLoading ? 'Loading fiscal year information...' : 
             currentFiscalYear ? 
             `${currentFiscalYear.name} (${new Date(currentFiscalYear.startDate).toLocaleDateString()} - ${new Date(currentFiscalYear.endDate).toLocaleDateString()})` : 
             'No active fiscal year found'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentFiscalYear && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Current Progress</span>
                  <span className="text-sm text-neutral-dark">
                    {(() => {
                      const start = new Date(currentFiscalYear.startDate).getTime();
                      const end = new Date(currentFiscalYear.endDate).getTime();
                      const now = Date.now();
                      const progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
                      return `${progress}% Complete`;
                    })()}
                  </span>
                </div>
                <Progress value={(() => {
                  const start = new Date(currentFiscalYear.startDate).getTime();
                  const end = new Date(currentFiscalYear.endDate).getTime();
                  const now = Date.now();
                  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
                })()} className="h-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-orange-50 rounded-lg p-3">
                  <div className="text-sm text-neutral-dark">Total Revenue</div>
                  <div className="text-lg font-medium">{formatCurrency(totalRevenue)}</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                  <div className="text-sm text-neutral-dark">Total Expenses</div>
                  <div className="text-lg font-medium">{formatCurrency(totalExpenses)}</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                  <div className="text-sm text-neutral-dark">Net Profit</div>
                  <div className="text-lg font-medium">{formatCurrency(totalProfit)}</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-6">
        <Tabs defaultValue="overview" className="w-full">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="profit-loss">Profit & Loss</TabsTrigger>
              <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
              <TabsTrigger value="expense-breakdown">Expense Breakdown</TabsTrigger>
            </TabsList>
            
            <Select value={chartTimeRange} onValueChange={(value) => setChartTimeRange(value as PeriodType)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="quarter">Quarterly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <TabsContent value="overview" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trends</CardTitle>
                <CardDescription>Monthly revenue performance for last 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : hasMonthlyData ? (
                  <div className="h-[300px]">
                    <AreaChart
                      data={revenueChartData}
                      index="month"
                      categories={["revenue"]}
                      colors={["orange"]}
                      valueFormatter={(value) => formatCurrency(value)}
                    />
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-neutral-dark">
                    No transactions yet. Revenue data will appear here once vouchers are posted.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="profit-loss" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Profit & Loss Statement</CardTitle>
                <CardDescription>Monthly revenue, expenses, and profit breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : hasMonthlyData ? (
                  <div className="h-[300px]">
                    <BarChart
                      data={plChartData}
                      index="month"
                      categories={["revenue", "expenses", "profit"]}
                      colors={["orange", "red", "green"]}
                      valueFormatter={(value) => formatCurrency(value)}
                      stack={false}
                    />
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-neutral-dark">
                    No transactions yet. P&L data will appear here once vouchers are posted.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="cash-flow" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Cash Flow Analysis</CardTitle>
                <CardDescription>Monthly cash inflows, outflows, and net flow</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : hasCashFlowData ? (
                  <div className="h-[300px]">
                    <LineChart
                      data={cfChartData}
                      index="month"
                      categories={["inflow", "outflow", "netFlow"]}
                      colors={["green", "red", "blue"]}
                      valueFormatter={(value) => formatCurrency(value)}
                    />
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-neutral-dark">
                    No cash/bank transactions yet. Cash flow data will appear here once cash or bank vouchers are posted.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="expense-breakdown" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Expense Breakdown</CardTitle>
                <CardDescription>Expense distribution by category</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : hasExpenseData ? (
                  <div className="h-[300px]">
                    <PieChart
                      data={metrics!.expenseBreakdown}
                      index="name"
                      category="value"
                      valueFormatter={(value) => formatCurrency(value)}
                    />
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-neutral-dark">
                    No expense transactions yet. Expense breakdown will appear here once expense vouchers are posted.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center">
                <span className="material-icons mr-2">psychology</span>
                Financial Insights
              </CardTitle>
              <CardDescription>Insights based on your financial data</CardDescription>
            </CardHeader>
            <CardContent>
              {insightsLoading ? (
                <div className="flex justify-center items-center p-6">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : insights && insights.length > 0 ? (
                <div className="space-y-4">
                  {insights.map((insight) => (
                    <div key={insight.id} className="border border-border rounded-lg p-4">
                      <div className="flex items-start">
                        <span className={`material-icons mr-3 ${getInsightTypeColor(insight.type)}`}>
                          {getInsightTypeIcon(insight.type)}
                        </span>
                        <div>
                          <h4 className="font-medium text-lg">{insight.title}</h4>
                          <p className="text-neutral-dark mt-1">{insight.description}</p>
                          
                          {insight.recommendations && insight.recommendations.length > 0 && (
                            <div className="mt-3">
                              <h5 className="font-medium text-sm">Recommendations:</h5>
                              <ul className="list-disc pl-5 mt-1 space-y-1">
                                {insight.recommendations.map((rec, idx) => (
                                  <li key={idx} className="text-sm">{rec}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          <div className="mt-3 flex items-center text-sm text-neutral-dark">
                            <span>Confidence:</span>
                            <div className="ml-2 w-24 bg-gray-200 rounded-full h-1.5">
                              <div 
                                className="bg-primary h-1.5 rounded-full" 
                                style={{ width: `${insight.confidence * 100}%` }}
                              ></div>
                            </div>
                            <span className="ml-2">{Math.round(insight.confidence * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 text-neutral-dark">
                  No insights available. Insights will appear once you have financial transactions.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center">
                <span className="material-icons mr-2">summarize</span>
                Financial Summary
              </CardTitle>
              <CardDescription>Current period overview</CardDescription>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (summary?.revenue.current || 0) === 0 && (summary?.expenses.current || 0) === 0 ? (
                <div className="text-center p-6 text-neutral-dark">
                  No financial data for this period yet.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <div className="text-sm text-neutral-dark">Revenue</div>
                    <div className="text-lg font-medium">{formatCurrency(summary?.revenue.current || 0)}</div>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <div className="text-sm text-neutral-dark">Expenses</div>
                    <div className="text-lg font-medium">{formatCurrency(summary?.expenses.current || 0)}</div>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <div className="text-sm text-neutral-dark">Net Profit</div>
                    <div className="text-lg font-medium">{formatCurrency(summary?.profit.current || 0)}</div>
                  </div>
                  {(summary?.profit.current || 0) !== 0 && (summary?.revenue.current || 0) !== 0 && (
                    <div className="mt-2">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Profit Margin</span>
                        <span className="text-sm text-neutral-dark">
                          {Math.round(((summary?.profit.current || 0) / (summary?.revenue.current || 1)) * 100)}%
                        </span>
                      </div>
                      <Progress value={Math.max(0, Math.min(100, Math.round(((summary?.profit.current || 0) / (summary?.revenue.current || 1)) * 100)))} className="h-2" />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className="material-icons mr-2">article</span>
            Recent Journal Entries
          </CardTitle>
          <CardDescription>Latest financial transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {journalsLoading ? (
            <div className="flex justify-center items-center py-6">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : recentJournals && Array.isArray(recentJournals) && recentJournals.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-orange-50">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium">Date</th>
                    <th className="text-left p-3 text-sm font-medium">Reference</th>
                    <th className="text-left p-3 text-sm font-medium">Description</th>
                    <th className="text-right p-3 text-sm font-medium">Debit</th>
                    <th className="text-right p-3 text-sm font-medium">Credit</th>
                    <th className="text-center p-3 text-sm font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(recentJournals as any[]).map((journal: any, idx: number) => (
                    <tr key={journal.id || idx}>
                      <td className="p-3 text-sm">{journal.date ? new Date(journal.date).toLocaleDateString() : '—'}</td>
                      <td className="p-3 text-sm">{journal.referenceNumber || journal.voucherNumber || '—'}</td>
                      <td className="p-3 text-sm">{journal.narration || journal.description || '—'}</td>
                      <td className="p-3 text-sm text-right">{journal.totalDebit ? formatCurrency(parseFloat(journal.totalDebit)) : '—'}</td>
                      <td className="p-3 text-sm text-right">{journal.totalCredit ? formatCurrency(parseFloat(journal.totalCredit)) : '—'}</td>
                      <td className="p-3 text-sm text-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          journal.isPosted ? 'bg-status-success/20 text-status-success' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {journal.isPosted ? 'Posted' : journal.status || 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center p-6 text-neutral-dark">
              No recent journal entries found.
            </div>
          )}
          <div className="flex justify-center mt-4">
            <Button variant="outline">View All Journal Entries</Button>
          </div>
        </CardContent>
      </Card>
    </DashboardContainer>
  );
}
