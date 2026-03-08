import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Download } from "lucide-react";

const fmt = (n: number | null | undefined) => {
  if (n == null || isNaN(Number(n))) return "BDT 0.00";
  return `BDT ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function downloadCSV(data: any[], filename: string) {
  if (!data || data.length === 0) return;
  const keys = Object.keys(data[0]);
  const csv = [keys.join(","), ...data.map(row => keys.map(k => `"${row[k] ?? ""}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CashflowCalendarPage() {
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [days, setDays] = useState("90");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/cashflow/calendar", startDate, days],
    queryFn: () => fetch(`/api/cashflow/calendar?startDate=${startDate}&days=${days}`, { credentials: "include" }).then(r => r.json()),
  });

  const entries = data?.entries || data?.days || (Array.isArray(data) ? data : []);
  const summaryData = data?.summary || {};

  const totalReceivables = summaryData.totalReceivables ?? entries.reduce((sum: number, e: any) => sum + Number(e.receivables ?? e.inflow ?? 0), 0);
  const totalPayables = summaryData.totalPayables ?? entries.reduce((sum: number, e: any) => sum + Number(e.payables ?? e.outflow ?? 0), 0);
  const netCashflow = summaryData.netCashflow ?? (totalReceivables - totalPayables);

  const summaryCards = [
    { label: "Total Receivables", value: fmt(totalReceivables), icon: TrendingUp, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
    { label: "Total Payables", value: fmt(totalPayables), icon: TrendingDown, iconBg: "bg-red-100", iconColor: "text-red-600" },
    { label: "Net Cashflow", value: fmt(netCashflow), icon: DollarSign, iconBg: netCashflow >= 0 ? "bg-emerald-100" : "bg-red-100", iconColor: netCashflow >= 0 ? "text-emerald-600" : "text-red-600" },
  ];

  return (
    <DashboardContainer title="Cashflow Calendar" subtitle="Projected cash inflows and outflows over time">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40 h-8 text-sm" />
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 Days</SelectItem>
              <SelectItem value="60">60 Days</SelectItem>
              <SelectItem value="90">90 Days</SelectItem>
              <SelectItem value="180">180 Days</SelectItem>
              <SelectItem value="365">365 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(entries, "cashflow-calendar.csv")} disabled={!entries.length} className="ml-auto">
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {summaryCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.label} className="shadow-sm border-0 shadow-gray-200/60">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                          <Icon className={`h-5 w-5 ${card.iconColor}`} />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                      <p className="text-xs text-gray-500 mt-1">{card.label}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {entries.length > 0 ? (
              <Card className="shadow-sm border-0 shadow-gray-200/60">
                <CardContent className="p-0">
                  <div className="max-h-[600px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="sticky top-0 bg-white z-10">
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Receivables</TableHead>
                          <TableHead className="text-right">Payables</TableHead>
                          <TableHead className="text-right">Net Flow</TableHead>
                          <TableHead className="text-right">Running Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry: any, idx: number) => {
                          const receivables = Number(entry.receivables ?? entry.inflow ?? 0);
                          const payables = Number(entry.payables ?? entry.outflow ?? 0);
                          const netFlow = entry.netFlow ?? entry.net ?? (receivables - payables);
                          const runningBalance = entry.runningBalance ?? entry.balance ?? 0;
                          const isPositive = netFlow >= 0;
                          const dateStr = entry.date ? new Date(entry.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : `Day ${idx + 1}`;
                          const isWeekend = entry.date ? [0, 6].includes(new Date(entry.date).getDay()) : false;

                          return (
                            <TableRow key={idx} className={isWeekend ? "bg-gray-50/50" : ""}>
                              <TableCell className="font-medium text-sm">{dateStr}</TableCell>
                              <TableCell className="text-right text-sm text-emerald-600">{receivables > 0 ? fmt(receivables) : "-"}</TableCell>
                              <TableCell className="text-right text-sm text-red-600">{payables > 0 ? fmt(payables) : "-"}</TableCell>
                              <TableCell className={`text-right text-sm font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                                {fmt(netFlow)}
                              </TableCell>
                              <TableCell className={`text-right text-sm font-medium ${Number(runningBalance) >= 0 ? "text-gray-900" : "text-red-600"}`}>
                                {fmt(runningBalance)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Calendar className="h-10 w-10 mb-3" />
                <p className="text-sm">No cashflow projection data available</p>
                <p className="text-xs mt-1">Try adjusting the date range</p>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardContainer>
  );
}
