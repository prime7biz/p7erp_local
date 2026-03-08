import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, DollarSign, AlertTriangle, AlertOctagon, CheckCircle, Loader2, BookOpen, ClipboardList, PlusCircle, Search, FileBarChart } from "lucide-react";
import { formatMoney } from "@/lib/formatters";

interface StockSummaryItem {
  item_id: number;
  item_code: string;
  item_name: string;
  warehouse_id: number;
  warehouse_name: string;
  unit: string;
  total_in: number;
  total_out: number;
  current_qty: number;
  total_value_in: number;
  total_value_out: number;
  current_value: number;
}

interface LowStockAlert {
  item_id: number;
  item_code: string;
  item_name: string;
  current_qty: number;
  min_stock_level: number;
  reorder_point: number;
  alert_level: "CRITICAL" | "LOW";
}

export default function StockDashboard() {
  const [search, setSearch] = useState("");

  const { data: summaryData, isLoading: loadingSummary } = useQuery<StockSummaryItem[]>({
    queryKey: ["/api/stock-ledger/summary"],
  });

  const { data: alertsData, isLoading: loadingAlerts } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stock-ledger/alerts/low-stock"],
  });

  const totalItems = summaryData?.length ?? 0;
  const totalValue = summaryData?.reduce((sum, item) => sum + (item.current_value || 0), 0) ?? 0;
  const lowStockCount = alertsData?.filter((a) => a.alert_level === "LOW").length ?? 0;
  const criticalStockCount = alertsData?.filter((a) => a.alert_level === "CRITICAL").length ?? 0;

  const filteredSummary = useMemo(() => {
    if (!summaryData) return [];
    if (!search.trim()) return summaryData;
    const q = search.toLowerCase();
    return summaryData.filter(
      (item) =>
        item.item_name?.toLowerCase().includes(q) ||
        item.item_code?.toLowerCase().includes(q)
    );
  }, [summaryData, search]);

  return (
    <DashboardContainer
      title="Stock Dashboard"
      subtitle="Overview of inventory stock levels and alerts"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/inventory/stock-valuation">
            <Button variant="outline" size="sm">
              <FileBarChart className="mr-2 h-4 w-4" /> Valuation Report
            </Button>
          </Link>
          <Link href="/inventory/stock-ledger">
            <Button variant="outline" size="sm">
              <BookOpen className="mr-2 h-4 w-4" /> Stock Ledger
            </Button>
          </Link>
          <Link href="/inventory/stock-adjustments/new">
            <Button size="sm">
              <PlusCircle className="mr-2 h-4 w-4" /> New Adjustment
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Items with Stock</p>
                  <p className="text-2xl font-bold">{totalItems}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Stock Value</p>
                  <p className="text-2xl font-bold">{formatMoney(totalValue)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Low Stock Items</p>
                  <p className="text-2xl font-bold text-amber-600">{lowStockCount}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className={criticalStockCount > 0 ? "border-red-200 bg-red-50/50" : ""}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critical Stock Items</p>
                  <p className="text-2xl font-bold text-red-600">{criticalStockCount}</p>
                </div>
                <AlertOctagon className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !alertsData || alertsData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle className="h-10 w-10 text-green-500 mb-2" />
                <p className="text-sm">No low stock alerts</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="text-right">Current Qty</TableHead>
                      <TableHead className="text-right">Min Stock Level</TableHead>
                      <TableHead className="text-right">Reorder Point</TableHead>
                      <TableHead>Alert Level</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertsData.map((alert) => (
                      <TableRow key={`${alert.item_id}-${alert.alert_level}`}>
                        <TableCell className="font-mono text-sm">{alert.item_code}</TableCell>
                        <TableCell>{alert.item_name}</TableCell>
                        <TableCell className="text-right">{alert.current_qty}</TableCell>
                        <TableCell className="text-right">{alert.min_stock_level}</TableCell>
                        <TableCell className="text-right">{alert.reorder_point}</TableCell>
                        <TableCell>
                          {alert.alert_level === "CRITICAL" ? (
                            <Badge className="bg-red-100 text-red-800">CRITICAL</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800">LOW</Badge>
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-base">Stock Summary</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by item name or code..."
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !filteredSummary || filteredSummary.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mb-2" />
                <p className="text-sm">No stock data found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Total In</TableHead>
                      <TableHead className="text-right">Total Out</TableHead>
                      <TableHead className="text-right">Current Qty</TableHead>
                      <TableHead className="text-right">Value (BDT)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSummary.map((item) => (
                      <TableRow
                        key={`${item.item_id}-${item.warehouse_id}`}
                        className={item.current_qty <= 0 ? "bg-red-50" : ""}
                      >
                        <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                        <TableCell>{item.item_name}</TableCell>
                        <TableCell>{item.warehouse_name}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell className="text-right text-green-600">{item.total_in}</TableCell>
                        <TableCell className="text-right text-red-600">{item.total_out}</TableCell>
                        <TableCell className={`text-right font-semibold ${item.current_qty <= 0 ? "text-red-600" : ""}`}>
                          {item.current_qty}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(item.current_value || 0)}
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
    </DashboardContainer>
  );
}