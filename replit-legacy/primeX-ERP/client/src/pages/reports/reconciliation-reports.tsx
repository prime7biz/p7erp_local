import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Download, AlertTriangle, CheckCircle } from "lucide-react";

const fmt = (n: number | null | undefined) => {
  if (n == null || isNaN(Number(n))) return "BDT 0.00";
  return `BDT ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const pct = (n: number | null | undefined) => {
  if (n == null || isNaN(Number(n))) return "0.00%";
  return `${Number(n).toFixed(2)}%`;
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

function SummaryCard({ title, value, subtitle, variant }: { title: string; value: string; subtitle?: string; variant?: "default" | "success" | "warning" | "danger" }) {
  const colorMap = {
    default: "text-gray-900",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };
  return (
    <Card className="shadow-sm border-0 shadow-gray-200/60">
      <CardContent className="p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${colorMap[variant || "default"]}`}>{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <AlertTriangle className="h-10 w-10 mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function StockVsGLTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/reports/reconciliation/stock-vs-gl"] });

  if (isLoading) return <LoadingState />;
  
  const summary = data?.summary || data;
  const details = data?.details || data?.items || [];

  const stockValue = summary?.stockValue ?? summary?.totalStockValue ?? 0;
  const glBalance = summary?.glBalance ?? summary?.totalGLBalance ?? 0;
  const variance = summary?.variance ?? (stockValue - glBalance);
  const variancePct = summary?.variancePercent ?? summary?.variancePercentage ?? (glBalance ? ((variance / glBalance) * 100) : 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => downloadCSV(details, "stock-vs-gl.csv")} disabled={!details.length}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Stock Value" value={fmt(stockValue)} />
        <SummaryCard title="GL Balance" value={fmt(glBalance)} />
        <SummaryCard title="Variance" value={fmt(variance)} variant={Math.abs(variance) < 1 ? "success" : "danger"} />
        <SummaryCard title="Variance %" value={pct(variancePct)} variant={Math.abs(variancePct) < 1 ? "success" : "warning"} />
      </div>
      {details.length > 0 ? (
        <Card className="shadow-sm border-0 shadow-gray-200/60">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item / Category</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead className="text-right">GL Balance</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((row: any, idx: number) => {
                  const v = row.variance ?? ((row.stockValue ?? 0) - (row.glBalance ?? 0));
                  const matched = Math.abs(v) < 1;
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name || row.category || row.item || `Item ${idx + 1}`}</TableCell>
                      <TableCell className="text-right">{fmt(row.stockValue)}</TableCell>
                      <TableCell className="text-right">{fmt(row.glBalance)}</TableCell>
                      <TableCell className={`text-right font-medium ${matched ? "text-emerald-600" : "text-red-600"}`}>{fmt(v)}</TableCell>
                      <TableCell className="text-center">
                        {matched ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle className="h-3 w-3 mr-1" />Matched</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><AlertTriangle className="h-3 w-3 mr-1" />Mismatch</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState message="No stock vs GL reconciliation data available" />
      )}
    </div>
  );
}

function WipVsGLTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/reports/reconciliation/wip-vs-gl"] });

  if (isLoading) return <LoadingState />;

  const summary = data?.summary || data;
  const details = data?.details || data?.items || [];

  const wipValue = summary?.wipValue ?? summary?.totalWipValue ?? 0;
  const glBalance = summary?.glBalance ?? summary?.totalGLBalance ?? 0;
  const variance = summary?.variance ?? (wipValue - glBalance);
  const variancePct = summary?.variancePercent ?? (glBalance ? ((variance / glBalance) * 100) : 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => downloadCSV(details, "wip-vs-gl.csv")} disabled={!details.length}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="WIP Value" value={fmt(wipValue)} />
        <SummaryCard title="GL Balance" value={fmt(glBalance)} />
        <SummaryCard title="Variance" value={fmt(variance)} variant={Math.abs(variance) < 1 ? "success" : "danger"} />
        <SummaryCard title="Variance %" value={pct(variancePct)} variant={Math.abs(variancePct) < 1 ? "success" : "warning"} />
      </div>
      {details.length > 0 ? (
        <Card className="shadow-sm border-0 shadow-gray-200/60">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order / Process</TableHead>
                  <TableHead className="text-right">WIP Value</TableHead>
                  <TableHead className="text-right">GL Balance</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((row: any, idx: number) => {
                  const v = row.variance ?? ((row.wipValue ?? 0) - (row.glBalance ?? 0));
                  const matched = Math.abs(v) < 1;
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name || row.order || row.process || `Order ${idx + 1}`}</TableCell>
                      <TableCell className="text-right">{fmt(row.wipValue)}</TableCell>
                      <TableCell className="text-right">{fmt(row.glBalance)}</TableCell>
                      <TableCell className={`text-right font-medium ${matched ? "text-emerald-600" : "text-red-600"}`}>{fmt(v)}</TableCell>
                      <TableCell className="text-center">
                        {matched ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle className="h-3 w-3 mr-1" />Matched</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><AlertTriangle className="h-3 w-3 mr-1" />Mismatch</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState message="No WIP vs GL reconciliation data available" />
      )}
    </div>
  );
}

function OrderProfitabilityTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/reports/reconciliation/order-profitability"] });

  if (isLoading) return <LoadingState />;

  const orders = data?.orders || data?.items || (Array.isArray(data) ? data : []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => downloadCSV(orders, "order-profitability.csv")} disabled={!orders.length}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>
      {orders.length > 0 ? (
        <Card className="shadow-sm border-0 shadow-gray-200/60">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((row: any, idx: number) => {
                  const revenue = row.revenue ?? row.totalRevenue ?? 0;
                  const cost = row.cost ?? row.totalCost ?? 0;
                  const profit = row.profit ?? (revenue - cost);
                  const margin = row.margin ?? row.marginPercent ?? (revenue ? ((profit / revenue) * 100) : 0);
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.orderNumber || row.order || `ORD-${idx + 1}`}</TableCell>
                      <TableCell>{row.customer || row.customerName || "-"}</TableCell>
                      <TableCell className="text-right">{fmt(revenue)}</TableCell>
                      <TableCell className="text-right">{fmt(cost)}</TableCell>
                      <TableCell className={`text-right font-medium ${profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(profit)}</TableCell>
                      <TableCell className="text-right">{pct(margin)}</TableCell>
                      <TableCell className="text-center">
                        {margin >= 20 ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Healthy</Badge>
                        ) : margin >= 10 ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Moderate</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Low</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState message="No order profitability data available" />
      )}
    </div>
  );
}

export default function ReconciliationReportsPage() {
  const [activeTab, setActiveTab] = useState("stock-vs-gl");

  return (
    <DashboardContainer title="Reconciliation Reports" subtitle="Compare sub-ledger balances with general ledger for accuracy">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="stock-vs-gl">Stock vs GL</TabsTrigger>
          <TabsTrigger value="wip-vs-gl">WIP vs GL</TabsTrigger>
          <TabsTrigger value="order-profitability">Order Profitability</TabsTrigger>
        </TabsList>
        <TabsContent value="stock-vs-gl" className="mt-4">
          <StockVsGLTab />
        </TabsContent>
        <TabsContent value="wip-vs-gl" className="mt-4">
          <WipVsGLTab />
        </TabsContent>
        <TabsContent value="order-profitability" className="mt-4">
          <OrderProfitabilityTab />
        </TabsContent>
      </Tabs>
    </DashboardContainer>
  );
}
