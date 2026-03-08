import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Clock, Users, Building } from "lucide-react";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";

interface AgingEntry {
  accountId: number;
  accountName: string;
  accountNumber: string;
  currentAmount: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
}

function formatCurrency(val: number): string {
  return Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseNum(val: string): number {
  return parseFloat(val) || 0;
}

export default function ArApAgingPage() {
  const [type, setType] = useState<"receivable" | "payable">("receivable");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");

  const queryUrl = `/api/accounting/reports/ar-ap-aging?type=${type}&asOfDate=${asOfDate}`;

  const { data: entries, isLoading } = useQuery<AgingEntry[]>({
    queryKey: ["/api/accounting/reports/ar-ap-aging", type, asOfDate],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const totals = (entries || []).reduce(
    (acc, e) => ({
      current: acc.current + parseNum(e.currentAmount),
      days31to60: acc.days31to60 + parseNum(e.days31to60),
      days61to90: acc.days61to90 + parseNum(e.days61to90),
      over90: acc.over90 + parseNum(e.over90),
      total: acc.total + parseNum(e.total),
    }),
    { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 }
  );

  return (
    <DashboardContainer
      title="AR/AP Aging Report"
      subtitle="Analyze outstanding receivables and payables by aging buckets"
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      }
    >
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div>
              <Tabs value={type} onValueChange={(v) => setType(v as "receivable" | "payable")}>
                <TabsList>
                  <TabsTrigger value="receivable" className="gap-1.5">
                    <Users className="h-4 w-4" />
                    Accounts Receivable
                  </TabsTrigger>
                  <TabsTrigger value="payable" className="gap-1.5">
                    <Building className="h-4 w-4" />
                    Accounts Payable
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="w-full md:w-64">
              <label className="text-sm font-medium text-gray-700 mb-1 block">As of Date</label>
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-500">
                No {type === "receivable" ? "receivable" : "payable"} data
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                No outstanding {type === "receivable" ? "receivables" : "payables"} found as of the selected date.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-[120px]">Acc. No.</TableHead>
                    <TableHead className="min-w-[200px]">Account Name</TableHead>
                    <TableHead className="text-right w-[130px]">Current (0-30)</TableHead>
                    <TableHead className="text-right w-[130px]">31-60 Days</TableHead>
                    <TableHead className="text-right w-[130px]">61-90 Days</TableHead>
                    <TableHead className="text-right w-[130px]">Over 90 Days</TableHead>
                    <TableHead className="text-right w-[130px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const currentVal = parseNum(entry.currentAmount);
                    const d31 = parseNum(entry.days31to60);
                    const d61 = parseNum(entry.days61to90);
                    const o90 = parseNum(entry.over90);
                    const totalVal = parseNum(entry.total);
                    return (
                      <TableRow key={entry.accountId} className="hover:bg-gray-50">
                        <TableCell className="font-mono text-sm">{entry.accountNumber}</TableCell>
                        <TableCell className="font-medium">{entry.accountName}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {currentVal !== 0 ? formatCurrency(currentVal) : "-"}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${d31 > 0 ? "text-yellow-700" : ""}`}>
                          {d31 !== 0 ? formatCurrency(d31) : "-"}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${d61 > 0 ? "text-orange-700" : ""}`}>
                          {d61 !== 0 ? formatCurrency(d61) : "-"}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${o90 > 0 ? "text-red-700 font-semibold" : ""}`}>
                          {o90 !== 0 ? formatCurrency(o90) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {formatCurrency(totalVal)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 bg-gray-50 font-bold">
                    <TableCell colSpan={2} className="text-right font-bold text-gray-800">
                      Grand Total
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(totals.current)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-yellow-700">
                      {formatCurrency(totals.days31to60)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-orange-700">
                      {formatCurrency(totals.days61to90)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-red-700">
                      {formatCurrency(totals.over90)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(totals.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {entries && entries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Current (0-30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">{currencySymbol}{formatCurrency(totals.current)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-yellow-600">31-60 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono text-yellow-700">{currencySymbol}{formatCurrency(totals.days31to60)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-600">61-90 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono text-orange-700">{currencySymbol}{formatCurrency(totals.days61to90)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-600">Over 90 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono text-red-700">{currencySymbol}{formatCurrency(totals.over90)}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardContainer>
  );
}
