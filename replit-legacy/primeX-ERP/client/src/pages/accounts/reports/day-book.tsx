import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { PrintLayout } from "@/components/print/PrintLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Printer, BookOpen, Filter } from "lucide-react";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";
import { useTenantInfo } from "@/hooks/useTenantInfo";

interface DayBookItem {
  accountId: number;
  accountName: string;
  accountNumber: string;
  description: string | null;
  debitAmount: string;
  creditAmount: string;
}

interface DayBookEntry {
  voucherId: number;
  voucherDate: string;
  voucherNumber: string;
  voucherType: string;
  voucherTypeCode: string;
  narration: string | null;
  amount: string;
  items: DayBookItem[];
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
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DayBookPage() {
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [voucherType, setVoucherType] = useState<string>("");
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const { tenantInfo } = useTenantInfo();

  const queryUrl = `/api/accounting/reports/day-book?startDate=${startDate}&endDate=${endDate}${voucherType && voucherType !== "all" ? `&voucherType=${voucherType}` : ""}`;

  const { data: entries, isLoading } = useQuery<DayBookEntry[]>({
    queryKey: [queryUrl],
    enabled: !!startDate && !!endDate,
  });

  const { data: voucherTypes } = useQuery<Array<{ id: number; code: string; name: string }>>({
    queryKey: ["/api/accounting/vouchers/types"],
  });

  const grouped = (entries || []).reduce<Record<string, DayBookEntry[]>>((acc, entry) => {
    const date = entry.voucherDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();

  let grandTotalDebit = 0;
  let grandTotalCredit = 0;

  return (
    <DashboardContainer
      title="Day Book"
      subtitle="Daily transaction register showing all voucher entries"
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      }
    >
      <PrintLayout 
        title="Day Book"
        dateRange={`${startDate} to ${endDate}`}
        companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined}
        showSignatures={false}
      >
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 min-w-0">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Voucher Type</label>
              <Select value={voucherType} onValueChange={setVoucherType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {(voucherTypes || []).map((vt) => (
                    <SelectItem key={vt.code} value={vt.code}>{vt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-500">No entries found</h3>
              <p className="text-sm text-gray-400 mt-1">
                No voucher entries exist for the selected date range and filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead>Voucher No.</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="min-w-[200px]">Particulars</TableHead>
                    <TableHead className="text-right w-[140px]">{`Debit (${currencySymbol})`}</TableHead>
                    <TableHead className="text-right w-[140px]">{`Credit (${currencySymbol})`}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDates.map((date) => {
                    let dateTotalDebit = 0;
                    let dateTotalCredit = 0;

                    const dateRows = grouped[date].flatMap((entry) => {
                      return entry.items.map((item) => {
                        const debit = parseFloat(item.debitAmount || "0");
                        const credit = parseFloat(item.creditAmount || "0");
                        dateTotalDebit += debit;
                        dateTotalCredit += credit;
                        return { entry, item, debit, credit };
                      });
                    });

                    grandTotalDebit += dateTotalDebit;
                    grandTotalCredit += dateTotalCredit;

                    return (
                      <Fragment key={`group-${date}`}>
                        <TableRow className="bg-orange-50/50">
                          <TableCell colSpan={6} className="font-semibold text-orange-800 py-2">
                            {formatDate(date)}
                          </TableCell>
                        </TableRow>
                        {dateRows.map((row, idx) => (
                          <TableRow key={`${date}-${idx}`} className="hover:bg-gray-50">
                            <TableCell className="text-sm text-gray-500"></TableCell>
                            <TableCell className="font-mono text-sm">{row.entry.voucherNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{row.entry.voucherType}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="font-medium">{row.item.accountName}</div>
                              {(row.entry.narration || row.item.description) && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {row.item.description || row.entry.narration}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {row.debit > 0 ? formatCurrency(row.debit) : ""}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {row.credit > 0 ? formatCurrency(row.credit) : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow key={`subtotal-${date}`} className="border-t-2 border-gray-200">
                          <TableCell colSpan={4} className="text-right text-sm font-semibold text-gray-600">
                            Sub-total for {formatDate(date)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-sm">
                            {formatCurrency(dateTotalDebit)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-sm">
                            {formatCurrency(dateTotalCredit)}
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                  <TableRow className="bg-gray-100 border-t-2 border-gray-300">
                    <TableCell colSpan={4} className="text-right font-bold text-gray-800">
                      Grand Total
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-gray-800">
                      {formatCurrency(grandTotalDebit)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-gray-800">
                      {formatCurrency(grandTotalCredit)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </PrintLayout>
    </DashboardContainer>
  );
}
