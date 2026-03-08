import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { PrintLayout } from "@/components/print/PrintLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Printer, BookText } from "lucide-react";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";
import { useTenantInfo } from "@/hooks/useTenantInfo";

interface Account {
  id: number;
  accountNumber: string;
  name: string;
  isActive: boolean;
}

interface LedgerEntry {
  id: number;
  postingDate: string;
  voucherNumber: string;
  voucherType: string;
  narration: string | null;
  debitAmount: string;
  creditAmount: string;
  runningBalance: number;
}

interface LedgerResult {
  openingBalance: number;
  entries: LedgerEntry[];
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

function BalanceDisplay({ label, amount, currencySymbol }: { label: string; amount: number; currencySymbol: string }) {
  const suffix = amount >= 0 ? "Dr" : "Cr";
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <span className={`font-mono font-bold text-lg ${amount >= 0 ? "text-blue-700" : "text-orange-700"}`}>
        {currencySymbol}{formatCurrency(amount)} {suffix}
      </span>
    </div>
  );
}

export default function LedgerReportPage() {
  const params = useParams<{ accountId?: string }>();
  const defaults = getDefaultDateRange();
  const [accountId, setAccountId] = useState<string>(params.accountId || "");
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const { tenantInfo } = useTenantInfo();

  useEffect(() => {
    if (params.accountId) {
      setAccountId(params.accountId);
    }
  }, [params.accountId]);

  const { data: accounts, isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounting/chart-of-accounts"],
  });

  const queryUrl = `/api/accounting/reports/ledger/${accountId}?startDate=${startDate}&endDate=${endDate}`;

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery<LedgerResult>({
    queryKey: ["/api/accounting/reports/ledger", accountId, startDate, endDate],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include", headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error("Failed to fetch ledger");
      return res.json();
    },
    enabled: !!accountId && !!startDate && !!endDate,
  });

  const selectedAccount = (accounts || []).find(a => a.id.toString() === accountId);

  const closingBalance = ledgerData
    ? (ledgerData.entries.length > 0
      ? ledgerData.entries[ledgerData.entries.length - 1].runningBalance
      : ledgerData.openingBalance)
    : 0;

  const totalDebit = (ledgerData?.entries || []).reduce((s, e) => s + parseFloat(e.debitAmount || "0"), 0);
  const totalCredit = (ledgerData?.entries || []).reduce((s, e) => s + parseFloat(e.creditAmount || "0"), 0);

  return (
    <DashboardContainer
      title="Ledger Report"
      subtitle={selectedAccount ? `Account: ${selectedAccount.name} (${selectedAccount.accountNumber})` : "View detailed account transactions"}
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      }
    >
      <PrintLayout 
        title="Ledger Report"
        subtitle={selectedAccount ? `Account: ${selectedAccount.name}` : ""}
        dateRange={`${startDate} to ${endDate}`}
        companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined}
        showSignatures={false}
      >
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 min-w-0">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Account</label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts || []).filter(a => a.isActive).map((acc) => (
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
        </CardHeader>
        <CardContent>
          {!accountId ? (
            <div className="text-center py-16">
              <BookText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-500">Select an account</h3>
              <p className="text-sm text-gray-400 mt-1">Choose an account from the dropdown to view its ledger.</p>
            </div>
          ) : ledgerLoading || accountsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !ledgerData ? (
            <div className="text-center py-16">
              <BookText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-500">No data available</h3>
              <p className="text-sm text-gray-400 mt-1">Could not load ledger data for this account.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <BalanceDisplay label="Opening Balance" amount={ledgerData.openingBalance} currencySymbol={currencySymbol} />

              {ledgerData.entries.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No transactions found in this period.
                </div>
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
                      {ledgerData.entries.map((entry) => {
                        const debit = parseFloat(entry.debitAmount || "0");
                        const credit = parseFloat(entry.creditAmount || "0");
                        return (
                          <TableRow key={entry.id} className="hover:bg-gray-50">
                            <TableCell className="text-sm">{formatDate(entry.postingDate)}</TableCell>
                            <TableCell className="font-mono text-sm">{entry.voucherNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{entry.voucherType}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">{entry.narration || "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {debit > 0 ? formatCurrency(debit) : ""}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {credit > 0 ? formatCurrency(credit) : ""}
                            </TableCell>
                            <TableCell className={`text-right font-mono text-sm font-medium ${entry.runningBalance >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                              {formatCurrency(entry.runningBalance)} {entry.runningBalance >= 0 ? "Dr" : "Cr"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-gray-100 border-t-2 border-gray-300">
                        <TableCell colSpan={4} className="text-right font-bold text-gray-800">
                          Total
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-gray-800">
                          {formatCurrency(totalDebit)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-gray-800">
                          {formatCurrency(totalCredit)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}

              <BalanceDisplay label="Closing Balance" amount={closingBalance} currencySymbol={currencySymbol} />
            </div>
          )}
        </CardContent>
      </Card>
      </PrintLayout>
    </DashboardContainer>
  );
}
