import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Save, Trash2, ArrowLeft, Loader2, BarChart3 } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Account {
  id: number;
  accountNumber: string;
  name: string;
  isActive: boolean;
}

interface BudgetRow {
  accountId: number;
  months: number[];
}

interface Budget {
  id: number;
  name: string;
  description: string | null;
  fiscalYearId: number;
  budgetType: string;
  status: string;
}

interface BudgetItem {
  id: number;
  budgetId: number;
  accountId: number;
  month: number;
  amount: string;
}

export default function BudgetEntryPage() {
  const params = useParams<{ id: string }>();
  const budgetId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data: budgetData, isLoading: loadingBudget } = useQuery<{ budget: Budget; items: BudgetItem[] }>({
    queryKey: ["/api/accounting/budgets", budgetId],
    enabled: !!budgetId,
  });

  const { data: accounts, isLoading: loadingAccounts } = useQuery<Account[]>({
    queryKey: ["/api/accounting/chart-of-accounts"],
  });

  const activeAccounts = useMemo(() => {
    return (accounts || []).filter((a) => a.isActive).sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  }, [accounts]);

  useEffect(() => {
    if (budgetData && !initialized) {
      const items = budgetData.items || [];
      if (items.length > 0) {
        const grouped: Record<number, number[]> = {};
        for (const item of items) {
          if (!grouped[item.accountId]) {
            grouped[item.accountId] = new Array(12).fill(0);
          }
          const monthIdx = item.month - 1;
          if (monthIdx >= 0 && monthIdx < 12) {
            grouped[item.accountId][monthIdx] = parseFloat(item.amount) || 0;
          }
        }
        setRows(Object.entries(grouped).map(([accountId, months]) => ({
          accountId: parseInt(accountId),
          months,
        })));
      } else {
        setRows([{ accountId: 0, months: new Array(12).fill(0) }]);
      }
      setInitialized(true);
    }
  }, [budgetData, initialized]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/accounting/budgets/${budgetId}/items`, "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/budgets", budgetId] });
      toast({ title: "Budget items saved successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save budget items", description: err.message, variant: "destructive" });
    },
  });

  const addRow = () => {
    setRows([...rows, { accountId: 0, months: new Array(12).fill(0) }]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateAccountId = (index: number, accountId: number) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], accountId };
    setRows(updated);
  };

  const updateMonth = (rowIndex: number, monthIndex: number, value: string) => {
    const updated = [...rows];
    const months = [...updated[rowIndex].months];
    months[monthIndex] = parseFloat(value) || 0;
    updated[rowIndex] = { ...updated[rowIndex], months };
    setRows(updated);
  };

  const getRowTotal = (row: BudgetRow) => row.months.reduce((sum, v) => sum + v, 0);

  const getMonthTotal = (monthIndex: number) => rows.reduce((sum, row) => sum + row.months[monthIndex], 0);

  const getGrandTotal = () => rows.reduce((sum, row) => sum + getRowTotal(row), 0);

  const handleSave = () => {
    const items = rows
      .filter((r) => r.accountId > 0)
      .flatMap((r) =>
        r.months.map((amount, monthIdx) => ({
          accountId: r.accountId,
          month: monthIdx + 1,
          amount: amount.toString(),
        }))
      );
    saveMutation.mutate({ items });
  };

  const formatAmount = (val: number) =>
    val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const usedAccountIds = rows.map((r) => r.accountId).filter((id) => id > 0);
  const availableAccounts = (idx: number) =>
    activeAccounts.filter((a) => !usedAccountIds.includes(a.id) || a.id === rows[idx]?.accountId);

  if (loadingBudget || loadingAccounts) {
    return (
      <DashboardContainer title="Budget Entry" subtitle="Loading...">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </DashboardContainer>
    );
  }

  const budget = budgetData?.budget;

  return (
    <DashboardContainer
      title={budget?.name || "Budget Entry"}
      subtitle={budget?.description || "Allocate monthly budget amounts per account"}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation("/accounts/budgets")}>
            <ArrowLeft className="h-4 w-4 mr-2" />Back
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/accounts/budgets/${budgetId}/vs-actual`)}>
            <BarChart3 className="h-4 w-4 mr-2" />vs Actual
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Budget
          </Button>
        </div>
      }
    >
      {budget && (
        <div className="flex items-center gap-3 mb-4">
          <Badge variant="outline" className="capitalize">{budget.budgetType}</Badge>
          <Badge className={budget.status === "active" ? "bg-green-100 text-green-800" : budget.status === "closed" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}>
            {budget.status}
          </Badge>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Budget Allocation</CardTitle>
              <CardDescription>Enter monthly budget amounts for each account</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" />Add Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px] sticky left-0 bg-white z-10">Account</TableHead>
                  {MONTHS.map((m) => (
                    <TableHead key={m} className="min-w-[100px] text-right">{m}</TableHead>
                  ))}
                  <TableHead className="min-w-[120px] text-right font-bold">Annual Total</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    <TableCell className="sticky left-0 bg-white z-10">
                      <Select
                        value={row.accountId > 0 ? row.accountId.toString() : ""}
                        onValueChange={(val) => updateAccountId(rowIdx, parseInt(val))}
                      >
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableAccounts(rowIdx).map((acc) => (
                            <SelectItem key={acc.id} value={acc.id.toString()}>
                              {acc.accountNumber} - {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {row.months.map((val, mIdx) => (
                      <TableCell key={mIdx} className="p-1">
                        <Input
                          type="number"
                          className="h-8 text-right text-xs w-[100px]"
                          value={val || ""}
                          onChange={(e) => updateMonth(rowIdx, mIdx, e.target.value)}
                          placeholder="0.00"
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold text-sm">
                      BDT {formatAmount(getRowTotal(row))}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => removeRow(rowIdx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-gray-50 font-bold">
                  <TableCell className="sticky left-0 bg-gray-50 z-10">Grand Total</TableCell>
                  {MONTHS.map((_, mIdx) => (
                    <TableCell key={mIdx} className="text-right text-xs">
                      BDT {formatAmount(getMonthTotal(mIdx))}
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-sm">
                    BDT {formatAmount(getGrandTotal())}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </DashboardContainer>
  );
}
