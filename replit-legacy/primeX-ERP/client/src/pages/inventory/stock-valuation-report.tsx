import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Printer, Package, TrendingUp, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";

export default function StockValuationReport() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/stock-ledger/report/valuation'],
  });

  const items = data?.items || [];
  const summary = data?.summary || { totalItems: 0, totalValue: 0, reportDate: '' };

  const filtered = items.filter((item: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (item.item_name || '').toLowerCase().includes(s) ||
           (item.item_code || '').toLowerCase().includes(s);
  });

  const formatCurrency = (val: any) => {
    const num = parseFloat(val || '0');
    return `BDT ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatQty = (val: any) => {
    const num = parseFloat(val || '0');
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };

  if (isLoading) {
    return (
      <DashboardContainer title="Stock Valuation Report">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer
      title="Stock Valuation Report"
      subtitle={`Weighted Average Method — As of ${summary.reportDate}`}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/inventory/stock-dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="text-2xl font-bold">{summary.totalItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Stock Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(summary.totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valuation Method</p>
                  <p className="text-2xl font-bold">Weighted Avg</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Item-wise Valuation</CardTitle>
              <Input
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No stock entries found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Qty In</TableHead>
                      <TableHead className="text-right">Qty Out</TableHead>
                      <TableHead className="text-right">Balance Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Avg Rate</TableHead>
                      <TableHead className="text-right">Balance Value</TableHead>
                      <TableHead>Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item: any, idx: number) => (
                      <TableRow key={idx} className={parseFloat(item.balance_qty || '0') <= 0 ? 'bg-red-50' : ''}>
                        <TableCell className="font-mono text-xs">{item.item_code || '-'}</TableCell>
                        <TableCell className="font-medium">{item.item_name}</TableCell>
                        <TableCell>{item.warehouse_name || '-'}</TableCell>
                        <TableCell className="text-right text-green-600">{formatQty(item.total_qty_in)}</TableCell>
                        <TableCell className="text-right text-red-600">{formatQty(item.total_qty_out)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatQty(item.balance_qty)}</TableCell>
                        <TableCell>{item.unit || '-'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.avg_rate)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(item.balance_value)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{item.cost_method || 'average'}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <tfoot>
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={8} className="text-right">Total Stock Value:</TableCell>
                      <TableCell className="text-right">{formatCurrency(filtered.reduce((sum: number, i: any) => sum + parseFloat(i.balance_value || '0'), 0))}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </tfoot>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardContainer>
  );
}
