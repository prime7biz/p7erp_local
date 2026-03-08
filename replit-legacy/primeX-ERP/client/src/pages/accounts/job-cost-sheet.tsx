import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Plus, Download, Loader2, FileSpreadsheet, TrendingUp, TrendingDown } from "lucide-react";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";

interface Category {
  categoryId: number;
  categoryName: string;
  categoryCode: string;
  plannedQty: number | null;
  plannedRate: number | null;
  plannedAmount: number;
  actualAmount: number;
  transactionCount: number;
  qtyVariance: number | null;
  rateVariance: number | null;
  totalVariance: number;
  variancePercent: number;
}

interface JobCostSheet {
  orderId: number;
  orderNumber: string;
  styleName: string;
  customerName: string;
  totalQuantity: number;
  deliveryDate: string;
  orderStatus: string;
  currency: string;
  createdAt: string;
  categories: Category[];
  uncategorizedActual: number;
  totalPlanned: number;
  totalActual: number;
  totalVariance: number;
  profitability: {
    orderValue: number;
    totalCost: number;
    grossProfit: number;
    grossMargin: number;
  };
}

interface CostCategory {
  id: number;
  name: string;
  code: string;
}

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  const prefix = amount < 0 ? "-BDT " : "BDT ";
  return `${prefix}${Math.abs(amount).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const getVarianceColor = (v: number) => (v > 0 ? "text-green-600" : v < 0 ? "text-red-600" : "text-muted-foreground");
const getVarianceBg = (v: number) => (v > 0 ? "bg-green-50" : v < 0 ? "bg-red-50" : "");

export default function JobCostSheet() {
  const params = useParams<{ id: string }>();
  const costCenterId = parseInt(params.id || "0");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [addBudgetOpen, setAddBudgetOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState({
    categoryId: "", description: "", plannedQuantity: "", plannedRate: "", plannedAmount: "", unit: "",
  });

  const { data: sheet, isLoading } = useQuery<JobCostSheet>({
    queryKey: ["/api/cost-centers", costCenterId, "job-cost-sheet"],
    queryFn: async () => {
      const res = await fetch(`/api/cost-centers/${costCenterId}/job-cost-sheet`);
      if (!res.ok) throw new Error("Failed to fetch job cost sheet");
      return res.json();
    },
    enabled: costCenterId > 0,
  });

  const { data: categories } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-centers/categories"],
  });

  const importBomMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/cost-centers/${costCenterId}/import-from-bom`),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({ title: "BOM Imported", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers", costCenterId] });
    },
    onError: (error: any) => {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    },
  });

  const addBudgetMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/cost-centers/${costCenterId}/budgets`, {
        items: [{
          categoryId: parseInt(budgetForm.categoryId),
          description: budgetForm.description || null,
          plannedQuantity: budgetForm.plannedQuantity ? parseFloat(budgetForm.plannedQuantity) : null,
          plannedRate: budgetForm.plannedRate ? parseFloat(budgetForm.plannedRate) : null,
          plannedAmount: parseFloat(budgetForm.plannedAmount) || 0,
          unit: budgetForm.unit || null,
        }],
      }),
    onSuccess: () => {
      toast({ title: "Budget Added", description: "Budget item has been added successfully." });
      setAddBudgetOpen(false);
      setBudgetForm({ categoryId: "", description: "", plannedQuantity: "", plannedRate: "", plannedAmount: "", unit: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers", costCenterId] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleQtyRateChange = (field: "plannedQuantity" | "plannedRate", value: string) => {
    const updated = { ...budgetForm, [field]: value };
    const qty = parseFloat(updated.plannedQuantity) || 0;
    const rate = parseFloat(updated.plannedRate) || 0;
    if (qty > 0 && rate > 0) {
      updated.plannedAmount = String(Math.round(qty * rate * 100) / 100);
    }
    setBudgetForm(updated);
  };

  if (isLoading) {
    return (
      <DashboardContainer title="Job Cost Sheet" subtitle="Loading...">
        <Skeleton className="h-64 w-full" />
      </DashboardContainer>
    );
  }

  if (!sheet) {
    return (
      <DashboardContainer title="Job Cost Sheet" subtitle="Not Found">
        <Card><CardContent className="p-8 text-center text-muted-foreground">Cost center not found.</CardContent></Card>
      </DashboardContainer>
    );
  }

  const totalVariancePercent = sheet.totalPlanned > 0 ? ((sheet.totalVariance / sheet.totalPlanned) * 100) : 0;

  return (
    <DashboardContainer
      title={`Job Cost Sheet — ${sheet.orderNumber}`}
      subtitle={`${sheet.styleName} | ${sheet.customerName}`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/accounts/cost-centers")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => importBomMutation.mutate()} disabled={importBomMutation.isPending}>
            {importBomMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
            Import from BOM
          </Button>
          <Button size="sm" onClick={() => setAddBudgetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Budget
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Order Qty</p>
            <p className="text-xl font-bold">{sheet.totalQuantity.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Budget</p>
            <p className="text-xl font-bold">{formatCurrency(sheet.totalPlanned)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Actual</p>
            <p className="text-xl font-bold">{formatCurrency(sheet.totalActual)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Variance</p>
            <p className={`text-xl font-bold ${getVarianceColor(sheet.totalVariance)}`}>
              {formatCurrency(sheet.totalVariance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Gross Margin</p>
            <p className={`text-xl font-bold ${getVarianceColor(sheet.profitability.grossMargin)}`}>
              {sheet.profitability.grossMargin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Cost Category Breakdown</CardTitle>
              <CardDescription>Budget vs Actual by cost category — variance analysis</CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Under Budget
              </Badge>
              <Badge variant="outline" className="gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Over Budget
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="min-w-[140px]">Cost Category</TableHead>
                  <TableHead className="text-right min-w-[90px]">Planned Qty</TableHead>
                  <TableHead className="text-right min-w-[90px]">Planned Rate</TableHead>
                  <TableHead className="text-right min-w-[110px]">Planned Amount</TableHead>
                  <TableHead className="text-right min-w-[110px]">Actual Amount</TableHead>
                  <TableHead className="text-right min-w-[100px]">Qty Variance</TableHead>
                  <TableHead className="text-right min-w-[100px]">Rate Variance</TableHead>
                  <TableHead className="text-right min-w-[110px]">Total Variance</TableHead>
                  <TableHead className="text-right min-w-[80px]">Var %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.categories.map((cat) => (
                  <TableRow key={cat.categoryId} className={getVarianceBg(cat.totalVariance)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{cat.categoryCode}</Badge>
                        {cat.categoryName}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{cat.plannedQty ? cat.plannedQty.toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right">{cat.plannedRate ? formatCurrency(cat.plannedRate) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(cat.plannedAmount)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {cat.actualAmount > 0 ? formatCurrency(cat.actualAmount) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={`text-right ${getVarianceColor(cat.qtyVariance || 0)}`}>
                      {cat.qtyVariance !== null ? formatCurrency(cat.qtyVariance) : "—"}
                    </TableCell>
                    <TableCell className={`text-right ${getVarianceColor(cat.rateVariance || 0)}`}>
                      {cat.rateVariance !== null ? formatCurrency(cat.rateVariance) : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${getVarianceColor(cat.totalVariance)}`}>
                      {cat.plannedAmount > 0 || cat.actualAmount > 0 ? formatCurrency(cat.totalVariance) : "—"}
                    </TableCell>
                    <TableCell className={`text-right ${getVarianceColor(cat.variancePercent)}`}>
                      {cat.plannedAmount > 0 ? `${cat.variancePercent.toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {sheet.uncategorizedActual > 0 && (
                  <TableRow className="bg-yellow-50">
                    <TableCell className="font-medium text-yellow-700">Uncategorized</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right font-medium text-yellow-700">{formatCurrency(sheet.uncategorizedActual)}</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-muted font-bold">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right"></TableCell>
                  <TableCell className="text-right"></TableCell>
                  <TableCell className="text-right">{formatCurrency(sheet.totalPlanned)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(sheet.totalActual)}</TableCell>
                  <TableCell className="text-right"></TableCell>
                  <TableCell className="text-right"></TableCell>
                  <TableCell className={`text-right ${getVarianceColor(sheet.totalVariance)}`}>
                    {formatCurrency(sheet.totalVariance)}
                  </TableCell>
                  <TableCell className={`text-right ${getVarianceColor(totalVariancePercent)}`}>
                    {sheet.totalPlanned > 0 ? `${totalVariancePercent.toFixed(1)}%` : "—"}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profitability Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Order Value</p>
              <p className="text-lg font-bold">{formatCurrency(sheet.profitability.orderValue)}</p>
              <p className="text-xs text-muted-foreground">{sheet.totalQuantity} pcs × {formatCurrency(sheet.profitability.orderValue / sheet.totalQuantity)}/pc</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-lg font-bold">{formatCurrency(sheet.profitability.totalCost)}</p>
              <p className="text-xs text-muted-foreground">{sheet.totalQuantity > 0 ? formatCurrency(sheet.profitability.totalCost / sheet.totalQuantity) : "—"}/pc</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gross Profit</p>
              <p className={`text-lg font-bold ${getVarianceColor(sheet.profitability.grossProfit)}`}>
                {formatCurrency(sheet.profitability.grossProfit)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gross Margin</p>
              <div className="flex items-center gap-2">
                {sheet.profitability.grossMargin >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
                <p className={`text-lg font-bold ${getVarianceColor(sheet.profitability.grossMargin)}`}>
                  {sheet.profitability.grossMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {sheet && (
        <ModuleAIPanel
          title="AI Cost Variance Analysis"
          endpoint={`/api/module-ai/cost-center/${costCenterId}`}
          requestData={{}}
          triggerKey={`cost-center-${costCenterId}`}
        />
      )}

      <Dialog open={addBudgetOpen} onOpenChange={setAddBudgetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Budget Item</DialogTitle>
            <DialogDescription>Add a planned budget for a cost category</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Cost Category</Label>
              <Select value={budgetForm.categoryId} onValueChange={(v) => setBudgetForm({ ...budgetForm, categoryId: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>{cat.name} ({cat.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input placeholder="e.g., Cotton fabric for main body" value={budgetForm.description} onChange={(e) => setBudgetForm({ ...budgetForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Planned Quantity</Label>
                <Input type="number" placeholder="0" value={budgetForm.plannedQuantity} onChange={(e) => handleQtyRateChange("plannedQuantity", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Planned Rate (BDT)</Label>
                <Input type="number" placeholder="0" value={budgetForm.plannedRate} onChange={(e) => handleQtyRateChange("plannedRate", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Planned Amount (BDT)</Label>
                <Input type="number" placeholder="0" value={budgetForm.plannedAmount} onChange={(e) => setBudgetForm({ ...budgetForm, plannedAmount: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Unit</Label>
                <Input placeholder="e.g., Yards, Pcs" value={budgetForm.unit} onChange={(e) => setBudgetForm({ ...budgetForm, unit: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddBudgetOpen(false)}>Cancel</Button>
            <Button onClick={() => addBudgetMutation.mutate()} disabled={!budgetForm.categoryId || !budgetForm.plannedAmount || addBudgetMutation.isPending}>
              {addBudgetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}