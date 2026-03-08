import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, FileText, CreditCard, DollarSign, Wallet } from "lucide-react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { DashboardContainer } from "@/components/layout/dashboard-container";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B'];

export function VoucherReportsPage() {
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const [reportType, setReportType] = useState("summary");
  const [accountId, setAccountId] = useState("");
  const [dateRange, setDateRange] = useState({
    from: format(new Date(new Date().setDate(new Date().getDate() - 30)), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });
  const [voucherType, setVoucherType] = useState("");

  // Fetch accounts for account activity report
  const { data: accounts, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ["/api/accounting/chart-of-accounts"],
    enabled: reportType === "account-activity",
  });

  // Fetch summary report data
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["/api/accounting/reports/summary"],
    enabled: reportType === "summary",
  });

  // Fetch account activity data
  const { data: accountActivity, isLoading: isLoadingActivity } = useQuery({
    queryKey: [
      `/api/accounting/reports/account-activity/${accountId}`,
      { from: dateRange.from, to: dateRange.to },
    ],
    enabled: reportType === "account-activity" && !!accountId,
  });

  // Fetch aging report data
  const { data: agingData, isLoading: isLoadingAging } = useQuery({
    queryKey: [
      "/api/accounting/reports/aging",
      { type: voucherType || undefined },
    ],
    enabled: reportType === "aging",
  });

  // Fetch voucher types for filtering
  const { data: voucherTypes } = useQuery({
    queryKey: ["/api/accounting/vouchers/types"],
  });

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDateRange((prev) => ({ ...prev, [name]: value }));
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return `${currencySymbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const renderSummaryReport = () => {
    if (isLoadingSummary) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span>Loading summary report...</span>
        </div>
      );
    }

    if (!summaryData) {
      return (
        <div className="text-center py-20 text-gray-500">
          No summary data available
        </div>
      );
    }

    // Extract data with fallbacks for missing arrays
    const { 
      typeStats = [], 
      statusStats = [], 
      monthlyTrend = [], 
      topPreparers = [] 
    } = summaryData || {};

    // Format data for charts with safety checks
    const typeData = Array.isArray(typeStats) ? typeStats.map((type) => ({
      name: type.typeName,
      count: type.count,
      amount: parseFloat(type.totalAmount || '0'),
    })) : [];

    const statusData = Array.isArray(statusStats) ? statusStats.map((status) => ({
      name: status.statusName,
      count: status.count,
      amount: parseFloat(status.totalAmount || '0'),
      color: status.statusColor,
    })) : [];

    const trendData = Array.isArray(monthlyTrend) ? monthlyTrend.map((month) => ({
      month: month.month,
      count: month.count,
      amount: parseFloat(month.totalAmount || '0'),
    })) : [];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {statusData.map((status, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{status.name}</p>
                    <h3 className="text-2xl font-bold mt-1">
                      {status.count}
                    </h3>
                    <p className="text-sm font-medium mt-1">
                      {formatCurrency(status.amount)}
                    </p>
                  </div>
                  <div
                    className={`h-12 w-12 rounded-full flex items-center justify-center`}
                    style={{ backgroundColor: status.color || COLORS[index % COLORS.length] }}
                  >
                    {index === 0 ? (
                      <FileText className="h-6 w-6 text-white" />
                    ) : index === 1 ? (
                      <CreditCard className="h-6 w-6 text-white" />
                    ) : index === 2 ? (
                      <DollarSign className="h-6 w-6 text-white" />
                    ) : (
                      <Wallet className="h-6 w-6 text-white" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Vouchers by Type</CardTitle>
              <CardDescription>
                Distribution of vouchers by document type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="name"
                      label={({ name, percent }) =>
                        `${name}: ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {typeData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name, props) => [
                        value,
                        props.payload.name,
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Trend</CardTitle>
              <CardDescription>
                Voucher count and amounts by month
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={trendData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(tick) => formatCurrency(tick).slice(0, -3)}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        name === "amount"
                          ? formatCurrency(value)
                          : value,
                        name === "amount" ? "Amount" : "Count",
                      ]}
                    />
                    <Legend />
                    <Bar
                      yAxisId="left"
                      dataKey="count"
                      fill="#8884d8"
                      name="Count"
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="amount"
                      fill="#82ca9d"
                      name="Amount"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {topPreparers && topPreparers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Voucher Preparers</CardTitle>
              <CardDescription>
                Users who created the most vouchers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPreparers.map((preparer, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {preparer.userName || "Unknown"}
                      </TableCell>
                      <TableCell className="text-right">
                        {preparer.count}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(preparer.totalAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderAccountActivity = () => {
    if (!accountId) {
      return (
        <div className="text-center py-10">
          <p>Select an account to view activity</p>
        </div>
      );
    }

    if (isLoadingActivity) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span>Loading account activity...</span>
        </div>
      );
    }

    if (!accountActivity || !accountActivity.transactions || accountActivity.transactions.length === 0) {
      return (
        <div className="text-center py-10 text-gray-500">
          No transactions found for the selected criteria
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Account Name</p>
                <p className="font-medium">{accountActivity?.account?.name || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Account Code</p>
                <p className="font-medium">{accountActivity?.account?.accountCode || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Current Balance</p>
                <p className="font-medium">{formatCurrency(parseFloat(accountActivity?.account?.balance || "0"))}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              {format(new Date(accountActivity?.fromDate || new Date()), "MMMM d, yyyy")} to{" "}
              {format(new Date(accountActivity?.toDate || new Date()), "MMMM d, yyyy")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(accountActivity?.transactions || []).map((tx, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {format(new Date(tx?.voucherDate || new Date()), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      {tx?.voucherTypeCode || "—"}-{tx?.voucherNumber || "—"}
                    </TableCell>
                    <TableCell>{tx?.voucherType || "—"}</TableCell>
                    <TableCell>{tx?.description || tx?.reference || "—"}</TableCell>
                    <TableCell className="text-right">
                      {parseFloat(tx?.debitAmount || "0") > 0
                        ? formatCurrency(parseFloat(tx?.debitAmount || "0"))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {parseFloat(tx?.creditAmount || "0") > 0
                        ? formatCurrency(parseFloat(tx?.creditAmount || "0"))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(parseFloat(tx?.balance || "0"))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderAgingReport = () => {
    if (isLoadingAging) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span>Loading aging report...</span>
        </div>
      );
    }

    if (!agingData) {
      return (
        <div className="text-center py-10 text-gray-500">
          No aging data available
        </div>
      );
    }

    const { aging, totals } = agingData;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Current</h3>
              <p className="text-2xl font-bold mt-2">{formatCurrency(parseFloat(totals?.current || "0"))}</p>
              <p className="text-sm text-gray-500 mt-1">{(aging?.current || []).length} vouchers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-gray-500">1-30 Days</h3>
              <p className="text-2xl font-bold mt-2">{formatCurrency(parseFloat(totals?.['1_30'] || "0"))}</p>
              <p className="text-sm text-gray-500 mt-1">{(aging?.['1_30'] || []).length} vouchers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-gray-500">31-60 Days</h3>
              <p className="text-2xl font-bold mt-2">{formatCurrency(parseFloat(totals?.['31_60'] || "0"))}</p>
              <p className="text-sm text-gray-500 mt-1">{(aging?.['31_60'] || []).length} vouchers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-gray-500">61-90 Days</h3>
              <p className="text-2xl font-bold mt-2">{formatCurrency(parseFloat(totals?.['61_90'] || "0"))}</p>
              <p className="text-sm text-gray-500 mt-1">{(aging?.['61_90'] || []).length} vouchers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Over 90 Days</h3>
              <p className="text-2xl font-bold mt-2">{formatCurrency(parseFloat(totals?.over_90 || "0"))}</p>
              <p className="text-sm text-gray-500 mt-1">{(aging?.over_90 || []).length} vouchers</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Aging Distribution</CardTitle>
            <CardDescription>
              Breakdown of voucher aging by period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Current", value: parseFloat(totals?.current || "0") },
                      { name: "1-30 Days", value: parseFloat(totals?.['1_30'] || "0") },
                      { name: "31-60 Days", value: parseFloat(totals?.['31_60'] || "0") },
                      { name: "61-90 Days", value: parseFloat(totals?.['61_90'] || "0") },
                      { name: "Over 90 Days", value: parseFloat(totals?.over_90 || "0") },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    <Cell fill="#4ade80" /> {/* green for current */}
                    <Cell fill="#facc15" /> {/* yellow for 1-30 */}
                    <Cell fill="#fb923c" /> {/* orange for 31-60 */}
                    <Cell fill="#f87171" /> {/* light red for 61-90 */}
                    <Cell fill="#ef4444" /> {/* red for over 90 */}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6">
          {Object.keys(aging).map((period) => {
            // Skip empty buckets
            if (aging[period].length === 0) return null;

            let periodLabel = "";
            switch (period) {
              case "current":
                periodLabel = "Current Vouchers";
                break;
              case "1_30":
                periodLabel = "1-30 Days";
                break;
              case "31_60":
                periodLabel = "31-60 Days";
                break;
              case "61_90":
                periodLabel = "61-90 Days";
                break;
              case "over_90":
                periodLabel = "Over 90 Days";
                break;
              default:
                periodLabel = period;
            }

            return (
              <Card key={period}>
                <CardHeader>
                  <CardTitle>{periodLabel}</CardTitle>
                  <CardDescription>
                    {aging[period].length} vouchers, Total:{" "}
                    {formatCurrency(totals[period])}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Voucher #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aging[period].map((voucher, i) => (
                        <TableRow key={i}>
                          <TableCell>{voucher.voucherNumber}</TableCell>
                          <TableCell>
                            {format(new Date(voucher.voucherDate), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>{voucher.voucherTypeName}</TableCell>
                          <TableCell>{voucher.reference || "—"}</TableCell>
                          <TableCell>{voucher.description || "—"}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(voucher.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <DashboardContainer title="Voucher Reports">
      <Tabs value={reportType} onValueChange={setReportType} className="w-full">
        <div className="border-b">
          <div className="container mx-auto">
            <TabsList className="w-full bg-white">
              <TabsTrigger value="summary" className="flex-1">Summary</TabsTrigger>
              <TabsTrigger value="account-activity" className="flex-1">Account Activity</TabsTrigger>
              <TabsTrigger value="aging" className="flex-1">Aging Analysis</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="container mx-auto py-4">
          {/* Report Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {reportType === "account-activity" && (
                  <>
                    <div>
                      <Label htmlFor="account">Account</Label>
                      <Select
                        value={accountId}
                        onValueChange={setAccountId}
                        disabled={isLoadingAccounts}
                      >
                        <SelectTrigger id="account" className="mt-1">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts?.map((account) => (
                            <SelectItem 
                              key={account.id} 
                              value={account.id.toString()}
                            >
                              {account.accountCode} - {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="from-date">From Date</Label>
                      <Input
                        id="from-date"
                        type="date"
                        name="from"
                        value={dateRange.from}
                        onChange={handleDateChange}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="to-date">To Date</Label>
                      <Input
                        id="to-date"
                        type="date"
                        name="to"
                        value={dateRange.to}
                        onChange={handleDateChange}
                        className="mt-1"
                      />
                    </div>
                  </>
                )}

                {reportType === "aging" && (
                  <div>
                    <Label htmlFor="voucher-type">Voucher Type</Label>
                    <Select
                      value={voucherType || "all"}
                      onValueChange={(value) => setVoucherType(value === "all" ? "" : value)}
                    >
                      <SelectTrigger id="voucher-type" className="mt-1">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {voucherTypes?.map((type) => (
                          <SelectItem 
                            key={type.id} 
                            value={type.code}
                          >
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <TabsContent value="summary" className="mt-0">
            {renderSummaryReport()}
          </TabsContent>

          <TabsContent value="account-activity" className="mt-0">
            {renderAccountActivity()}
          </TabsContent>

          <TabsContent value="aging" className="mt-0">
            {renderAgingReport()}
          </TabsContent>
        </div>
      </Tabs>
    </DashboardContainer>
  );
}