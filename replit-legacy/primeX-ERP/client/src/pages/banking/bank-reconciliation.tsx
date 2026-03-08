import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Upload, Wand2, Link2, CheckCircle2, XCircle, Clock, FileSpreadsheet,
  ArrowLeftRight, RefreshCw, Landmark, AlertCircle
} from "lucide-react";
import { formatMoney } from "@/lib/formatters";

interface BankAccount {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  currentBalance: string | number;
}

interface StatementLine {
  id: number;
  date: string;
  description: string;
  reference?: string;
  amount: string | number;
  type: string;
  matchStatus: string;
  matchedVoucherId?: number;
}

interface MatchedVoucher {
  id: number;
  voucherNumber: string;
  date: string;
  amount: string | number;
  type: string;
  narration?: string;
}

interface ReconciliationData {
  statement?: {
    id: number;
    statementDate: string;
    lines: StatementLine[];
  };
  unmatchedVouchers?: MatchedVoucher[];
  summary?: {
    statementBalance: number;
    bookBalance: number;
    adjustedBalance: number;
    matchedCount: number;
    unmatchedCount: number;
  };
}

export default function BankReconciliationPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [statementDate, setStatementDate] = useState(new Date().toISOString().split("T")[0]);
  const [statementBalance, setStatementBalance] = useState("");
  const [csvLines, setCsvLines] = useState<any[]>([]);

  const { data: accounts, isLoading: accountsLoading } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank/accounts"],
  });

  const { data: reconciliation, isLoading: reconLoading } = useQuery<ReconciliationData>({
    queryKey: ["/api/bank/accounts", selectedAccountId, "reconciliation"],
    enabled: !!selectedAccountId,
    queryFn: async () => {
      const res = await fetch(`/api/bank/accounts/${selectedAccountId}/reconciliation`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load reconciliation data");
      return res.json();
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { lines: any[]; statementDate: string }) => {
      const res = await apiRequest(`/api/bank/accounts/${selectedAccountId}/import`, "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts", selectedAccountId, "reconciliation"] });
      toast({ title: "Statement imported successfully" });
      setCsvLines([]);
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const stmtId = reconciliation?.statement?.id;
      if (!stmtId) throw new Error("No statement to match");
      const res = await apiRequest(`/api/bank/statements/${stmtId}/auto-match`, "POST");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts", selectedAccountId, "reconciliation"] });
      toast({ title: "Auto-match complete", description: `${data?.matchedCount || 0} lines matched` });
    },
    onError: (err: Error) => {
      toast({ title: "Auto-match failed", description: err.message, variant: "destructive" });
    },
  });

  const manualMatchMutation = useMutation({
    mutationFn: async ({ lineId, voucherId }: { lineId: number; voucherId: number }) => {
      const res = await apiRequest(`/api/bank/statement-lines/${lineId}/match`, "POST", { voucherId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts", selectedAccountId, "reconciliation"] });
      toast({ title: "Match recorded" });
      setSelectedLineId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Match failed", description: err.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const createRes = await apiRequest("/api/bank/reconciliations", "POST", {
        bankAccountId: Number(selectedAccountId),
        reconciliationDate: statementDate,
        statementBalance: Number(statementBalance || 0),
      });
      const recon = await createRes.json();
      const completeRes = await apiRequest(`/api/bank/reconciliations/${recon.id}/complete`, "POST");
      return completeRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts", selectedAccountId, "reconciliation"] });
      toast({ title: "Reconciliation completed" });
    },
    onError: (err: Error) => {
      toast({ title: "Reconciliation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = text.split("\n").filter(r => r.trim());
      if (rows.length < 2) {
        toast({ title: "Invalid CSV", description: "File must have a header row and data rows", variant: "destructive" });
        return;
      }
      const headers = rows[0].split(",").map(h => h.trim().toLowerCase());
      const lines = rows.slice(1).map(row => {
        const cols = row.split(",").map(c => c.trim());
        const line: Record<string, string> = {};
        headers.forEach((h, i) => { line[h] = cols[i] || ""; });
        return {
          date: line.date || statementDate,
          description: line.description || line.narration || line.memo || "",
          reference: line.reference || line.ref || line.cheque || "",
          amount: parseFloat(line.amount || line.debit || line.credit || "0"),
          type: parseFloat(line.amount || "0") >= 0 ? "CREDIT" : "DEBIT",
        };
      });
      setCsvLines(lines);
      toast({ title: `Parsed ${lines.length} lines from CSV` });
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (csvLines.length === 0) return;
    importMutation.mutate({ lines: csvLines, statementDate });
  };

  const matchStatusBadge = (status: string) => {
    const map: Record<string, { cls: string; icon: any; label: string }> = {
      UNMATCHED: { cls: "bg-red-100 text-red-700 border-red-200", icon: XCircle, label: "Unmatched" },
      AUTO_MATCHED: { cls: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock, label: "Auto Matched" },
      MANUALLY_MATCHED: { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2, label: "Matched" },
    };
    const cfg = map[status] || map.UNMATCHED;
    const Icon = cfg.icon;
    return (
      <Badge variant="outline" className={`gap-1 ${cfg.cls}`}>
        <Icon className="h-3 w-3" /> {cfg.label}
      </Badge>
    );
  };

  const formatAmount = (val: string | number) => {
    const num = Number(val || 0);
    return formatMoney(Math.abs(num));
  };

  const accountList = Array.isArray(accounts) ? accounts : [];
  const stmtLines = reconciliation?.statement?.lines || [];
  const unmatchedVouchers = reconciliation?.unmatchedVouchers || [];
  const summary = reconciliation?.summary;

  return (
    <DashboardContainer
      title="Bank Reconciliation"
      subtitle="Match bank statement lines with accounting vouchers"
    >
      <Card className="shadow-sm border-0 shadow-gray-200/60">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 min-w-[200px]">
              <Label className="text-xs font-medium">Bank Account</Label>
              {accountsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountList.map(acc => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.bankName} - {acc.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Statement Date</Label>
              <Input
                type="date"
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Statement Balance</Label>
              <Input
                type="number"
                step="0.01"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
                placeholder="BDT 0.00"
                className="w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedAccountId && (
        <>
          <Card className="shadow-sm border-0 shadow-gray-200/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" /> Import Bank Statement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Choose CSV File
                </Button>
                {csvLines.length > 0 && (
                  <>
                    <Badge variant="secondary">{csvLines.length} lines parsed</Badge>
                    <Button onClick={handleImport} disabled={importMutation.isPending} className="gap-2">
                      {importMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Import Lines
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                CSV format: date, description, reference, amount (positive for credits, negative for debits)
              </p>
            </CardContent>
          </Card>

          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="shadow-sm border-0 shadow-gray-200/60">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Statement Balance</p>
                  <p className="text-xl font-bold text-gray-900">{formatAmount(summary.statementBalance)}</p>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-0 shadow-gray-200/60">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Book Balance</p>
                  <p className="text-xl font-bold text-gray-900">{formatAmount(summary.bookBalance)}</p>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-0 shadow-gray-200/60">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Adjusted Balance</p>
                  <p className={`text-xl font-bold ${summary.statementBalance === summary.adjustedBalance ? "text-emerald-600" : "text-amber-600"}`}>
                    {formatAmount(summary.adjustedBalance)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => autoMatchMutation.mutate()}
              disabled={autoMatchMutation.isPending || !reconciliation?.statement}
              className="gap-2"
            >
              {autoMatchMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Auto Match
            </Button>
            {selectedLineId && (
              <Badge variant="secondary" className="gap-1">
                <Link2 className="h-3 w-3" /> Select a voucher to match with line #{selectedLineId}
              </Badge>
            )}
            <Button
              variant="outline"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending || !statementBalance}
              className="gap-2 ml-auto"
            >
              {completeMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Complete Reconciliation
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-0 shadow-gray-200/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-4 w-4" /> Bank Statement Lines
                  {stmtLines.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">{stmtLines.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {reconLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : stmtLines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <FileSpreadsheet className="h-10 w-10 text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">No statement lines imported yet</p>
                    <p className="text-xs text-gray-400 mt-1">Upload a CSV file to get started</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50/80">
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Description</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stmtLines.map(line => (
                          <TableRow
                            key={line.id}
                            className={`cursor-pointer transition-colors ${
                              selectedLineId === line.id
                                ? "bg-primary/5 ring-1 ring-primary/20"
                                : line.matchStatus === "UNMATCHED" ? "hover:bg-red-50/50" : "hover:bg-gray-50/50"
                            }`}
                            onClick={() => {
                              if (line.matchStatus === "UNMATCHED") {
                                setSelectedLineId(selectedLineId === line.id ? null : line.id);
                              }
                            }}
                          >
                            <TableCell className="text-xs">{new Date(line.date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-xs max-w-[160px] truncate">{line.description}</TableCell>
                            <TableCell className={`text-xs text-right font-medium ${Number(line.amount) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {Number(line.amount) >= 0 ? "+" : "-"}{formatAmount(line.amount)}
                            </TableCell>
                            <TableCell>{matchStatusBadge(line.matchStatus)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-0 shadow-gray-200/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4" /> Unmatched Vouchers
                  {unmatchedVouchers.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">{unmatchedVouchers.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {reconLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : unmatchedVouchers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <CheckCircle2 className="h-10 w-10 text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">No unmatched vouchers</p>
                    <p className="text-xs text-gray-400 mt-1">All vouchers have been reconciled</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50/80">
                          <TableHead className="text-xs">Voucher #</TableHead>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unmatchedVouchers.map(voucher => (
                          <TableRow
                            key={voucher.id}
                            className={`transition-colors ${selectedLineId ? "cursor-pointer hover:bg-primary/5" : "hover:bg-gray-50/50"}`}
                            onClick={() => {
                              if (selectedLineId) {
                                manualMatchMutation.mutate({ lineId: selectedLineId, voucherId: voucher.id });
                              }
                            }}
                          >
                            <TableCell className="text-xs font-mono">{voucher.voucherNumber}</TableCell>
                            <TableCell className="text-xs">{new Date(voucher.date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{formatAmount(voucher.amount)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{voucher.type}</Badge>
                            </TableCell>
                            <TableCell>
                              {selectedLineId && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                                  <Link2 className="h-3 w-3" /> Match
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!selectedAccountId && (
        <Card className="shadow-sm border-0 shadow-gray-200/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">Select a Bank Account</h3>
            <p className="text-sm text-gray-500">Choose a bank account above to begin reconciliation</p>
          </CardContent>
        </Card>
      )}
    </DashboardContainer>
  );
}
