import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Search, TrendingUp, TrendingDown, DollarSign, Package, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";

interface CostCenterSummary {
  orderId: number;
  orderNumber: string;
  styleName: string;
  customerName: string | null;
  orderStatus: string;
  totalQuantity: number;
  budgetTotal: number;
  actualTotal: number;
  variance: number;
  variancePercent: number;
}

interface SummaryResponse {
  costCenters: CostCenterSummary[];
  totalCostCenters: number;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
}

const formatCurrency = (amount: number) => {
  return `BDT ${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const getVarianceColor = (variance: number) => {
  if (variance > 0) return "text-green-600";
  if (variance < 0) return "text-red-600";
  return "text-muted-foreground";
};

const getVarianceBadge = (variancePercent: number) => {
  if (variancePercent > 5) return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Under Budget</Badge>;
  if (variancePercent < -5) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Over Budget</Badge>;
  if (variancePercent === 0 && true) return <Badge variant="outline">No Budget</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">On Track</Badge>;
};

export default function CostCenterDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: summary, isLoading } = useQuery<SummaryResponse>({
    queryKey: ["/api/cost-centers/summary"],
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cost-centers/categories/seed"),
    onSuccess: () => {
      toast({ title: "Categories seeded", description: "Default cost categories have been created." });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to seed categories", variant: "destructive" });
    },
  });

  const filtered = summary?.costCenters?.filter((cc) => {
    const matchesSearch =
      !search ||
      cc.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      cc.styleName.toLowerCase().includes(search.toLowerCase()) ||
      (cc.customerName || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || cc.orderStatus === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const top5ByVariance = [...(summary?.costCenters || [])]
    .filter((c) => c.budgetTotal > 0 || c.actualTotal > 0)
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, 5)
    .map((c) => ({
      name: c.orderNumber,
      budget: c.budgetTotal,
      actual: c.actualTotal,
      variance: c.variance,
    }));

  if (isLoading) {
    return (
      <DashboardContainer title="Cost Center Dashboard" subtitle="Job Costing & Variance Analysis">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-8 w-24" /><Skeleton className="h-4 w-32 mt-2" /></CardContent></Card>
          ))}
        </div>
      </DashboardContainer>
    );
  }

  const totalVariance = summary?.totalVariance || 0;

  return (
    <DashboardContainer
      title="Cost Center Dashboard"
      subtitle="Job Costing — Budget vs Actual Variance Analysis"
      actions={
        <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
          {seedMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Seed Default Categories
        </Button>
      }
    >
      <ModuleAIPanel
        title="AI Cost Center Analysis"
        endpoint="/api/ai-insights/erp/accounting"
        requestData={{}}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Cost Centers</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalCostCenters || 0}</div>
            <p className="text-xs text-muted-foreground">Orders as cost centers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.totalBudget || 0)}</div>
            <p className="text-xs text-muted-foreground">Planned across all orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Actual</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.totalActual || 0)}</div>
            <p className="text-xs text-muted-foreground">Actual expenses recorded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overall Variance</CardTitle>
            {totalVariance >= 0 ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getVarianceColor(totalVariance)}`}>
              {formatCurrency(totalVariance)}
            </div>
            <p className="text-xs text-muted-foreground">{totalVariance >= 0 ? "Under budget" : "Over budget"}</p>
          </CardContent>
        </Card>
      </div>

      {top5ByVariance.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 5 Cost Centers by Variance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={top5ByVariance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `BDT ${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={80} fontSize={12} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="budget" name="Budget" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Budget vs Actual Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={top5ByVariance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis tickFormatter={(v) => `BDT ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="budget" name="Budget" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cost Center List</CardTitle>
          <div className="flex flex-col sm:flex-row gap-3 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by order, style, or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="in_production">In Production</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Var %</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {summary?.costCenters?.length === 0 ? "No orders found. Create orders to use as cost centers." : "No matching cost centers."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((cc) => (
                    <TableRow key={cc.orderId} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/accounts/cost-centers/${cc.orderId}`)}>
                      <TableCell className="font-medium">{cc.orderNumber}</TableCell>
                      <TableCell>{cc.styleName}</TableCell>
                      <TableCell>{cc.customerName || "—"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cc.budgetTotal)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cc.actualTotal)}</TableCell>
                      <TableCell className={`text-right font-medium ${getVarianceColor(cc.variance)}`}>
                        {formatCurrency(cc.variance)}
                      </TableCell>
                      <TableCell className={`text-right ${getVarianceColor(cc.variancePercent)}`}>
                        {cc.variancePercent.toFixed(1)}%
                      </TableCell>
                      <TableCell>{getVarianceBadge(cc.variancePercent)}</TableCell>
                      <TableCell>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </DashboardContainer>
  );
}