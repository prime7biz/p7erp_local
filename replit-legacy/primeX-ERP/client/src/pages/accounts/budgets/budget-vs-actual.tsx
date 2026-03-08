import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { PrintLayout } from "@/components/print/PrintLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer, Brain, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";
import { useTenantInfo } from "@/hooks/useTenantInfo";

interface VsActualRow {
  accountId: number;
  accountName: string;
  accountNumber: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePercent: number;
}

interface BudgetVsActualData {
  budget: {
    id: number;
    name: string;
    description: string | null;
    budgetType: string;
    status: string;
  };
  comparison: VsActualRow[];
}

export default function BudgetVsActualPage() {
  const params = useParams<{ id: string }>();
  const budgetId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const { tenantInfo } = useTenantInfo();

  const { data, isLoading } = useQuery<BudgetVsActualData>({
    queryKey: ["/api/accounting/budgets", budgetId, "vs-actual"],
    enabled: !!budgetId,
  });

  const formatAmount = (val: number) =>
    val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getVarianceColor = (variance: number) => {
    if (variance > 0) return "text-green-600";
    if (variance < 0) return "text-red-600";
    return "text-gray-500";
  };

  const getVarianceBg = (variance: number) => {
    if (variance > 0) return "bg-green-50";
    if (variance < 0) return "bg-red-50";
    return "";
  };

  const totals = (data?.comparison || []).reduce(
    (acc, row) => ({
      budget: acc.budget + row.budgetAmount,
      actual: acc.actual + row.actualAmount,
      variance: acc.variance + row.variance,
    }),
    { budget: 0, actual: 0, variance: 0 }
  );
  const totalVariancePercent = totals.budget !== 0 ? (totals.variance / totals.budget) * 100 : 0;

  const handleAIAnalysis = async () => {
    if (!data) return;
    setAiLoading(true);
    try {
      const reportData = {
        reportType: "budget-vs-actual",
        budgetName: data.budget.name,
        totalBudget: totals.budget,
        totalActual: totals.actual,
        totalVariance: totals.variance,
        totalVariancePercent: totalVariancePercent,
        items: data.comparison.map((r) => ({
          accountName: r.accountName,
          budget: r.budgetAmount,
          actual: r.actualAmount,
          variance: r.variance,
          variancePercent: r.variancePercent,
        })),
      };
      const res = await apiRequest("/api/ai-insights/erp/financial-statement", "POST", reportData);
      const result = await res.json();
      setAiInsights(result.insights);
    } catch (err: any) {
      toast({ title: "AI analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <DashboardContainer title="Budget vs Actual" subtitle="Loading...">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </DashboardContainer>
    );
  }

  const comparison = data?.comparison || [];

  return (
    <DashboardContainer
      title={`Budget vs Actual — ${data?.budget?.name || ""}`}
      subtitle="Compare planned budget with actual spending"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation(`/accounts/budgets/${budgetId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />Back to Budget
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />Print
          </Button>
          <Button onClick={handleAIAnalysis} disabled={aiLoading || comparison.length === 0}>
            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
            AI Analysis
          </Button>
        </div>
      }
    >
      <ModuleAIPanel
        title="AI Budget Analysis"
        endpoint="/api/ai-insights/erp/accounting"
        requestData={{}}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500 uppercase">Total Budget</p>
            <p className="text-xl font-bold mt-1">BDT {formatAmount(totals.budget)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500 uppercase">Total Actual</p>
            <p className="text-xl font-bold mt-1">BDT {formatAmount(totals.actual)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500 uppercase">Variance</p>
            <p className={`text-xl font-bold mt-1 ${getVarianceColor(totals.variance)}`}>
              {totals.variance >= 0 ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
              BDT {formatAmount(Math.abs(totals.variance))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500 uppercase">Variance %</p>
            <p className={`text-xl font-bold mt-1 ${getVarianceColor(totalVariancePercent)}`}>
              {totalVariancePercent >= 0 ? "+" : ""}{totalVariancePercent.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="print-only hidden print:block">
        <PrintLayout title="Budget vs Actual Report" subtitle={data?.budget?.name} companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined} showSignatures>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">Variance %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>{row.accountNumber} - {row.accountName}</TableCell>
                  <TableCell className="text-right">BDT {formatAmount(row.budgetAmount)}</TableCell>
                  <TableCell className="text-right">BDT {formatAmount(row.actualAmount)}</TableCell>
                  <TableCell className="text-right">BDT {formatAmount(row.variance)}</TableCell>
                  <TableCell className="text-right">{row.variancePercent.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PrintLayout>
      </div>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Comparison Details</CardTitle>
          <CardDescription>
            {comparison.length} account(s) with budget allocations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {comparison.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No budget items found. Please add budget allocations first.</p>
              <Button className="mt-3" variant="outline" onClick={() => setLocation(`/accounts/budgets/${budgetId}`)}>
                Go to Budget Entry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Budget (BDT)</TableHead>
                    <TableHead className="text-right">Actual (BDT)</TableHead>
                    <TableHead className="text-right">Variance (BDT)</TableHead>
                    <TableHead className="text-right">Variance %</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.map((row) => (
                    <TableRow key={row.accountId} className={getVarianceBg(row.variance)}>
                      <TableCell>
                        <span className="font-mono text-xs text-gray-400 mr-2">{row.accountNumber}</span>
                        <span className="font-medium">{row.accountName}</span>
                      </TableCell>
                      <TableCell className="text-right">BDT {formatAmount(row.budgetAmount)}</TableCell>
                      <TableCell className="text-right">BDT {formatAmount(row.actualAmount)}</TableCell>
                      <TableCell className={`text-right font-semibold ${getVarianceColor(row.variance)}`}>
                        {row.variance >= 0 ? "+" : ""}BDT {formatAmount(row.variance)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${getVarianceColor(row.variancePercent)}`}>
                        {row.variancePercent >= 0 ? "+" : ""}{row.variancePercent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-center">
                        {row.variance > 0 ? (
                          <Badge className="bg-green-100 text-green-800">Under Budget</Badge>
                        ) : row.variance < 0 ? (
                          <Badge className="bg-red-100 text-red-800">Over Budget</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-800">On Target</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-gray-50 font-bold">
                    <TableCell>Grand Total</TableCell>
                    <TableCell className="text-right">BDT {formatAmount(totals.budget)}</TableCell>
                    <TableCell className="text-right">BDT {formatAmount(totals.actual)}</TableCell>
                    <TableCell className={`text-right ${getVarianceColor(totals.variance)}`}>
                      {totals.variance >= 0 ? "+" : ""}BDT {formatAmount(totals.variance)}
                    </TableCell>
                    <TableCell className={`text-right ${getVarianceColor(totalVariancePercent)}`}>
                      {totalVariancePercent >= 0 ? "+" : ""}{totalVariancePercent.toFixed(1)}%
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {aiInsights && (
        <Card className="mt-6 border-blue-200 print:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-600" />
              AI Budget Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
              {aiInsights}
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardContainer>
  );
}
