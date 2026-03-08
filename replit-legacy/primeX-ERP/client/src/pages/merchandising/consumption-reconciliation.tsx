import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { BarChart3, AlertTriangle, CheckCircle2, Package } from "lucide-react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import Spinner from "@/components/ui/spinner";

interface Order {
  id: number;
  orderId: string;
  customerName?: string;
  styleName: string;
  totalQuantity: number;
  orderStatus: string;
}

interface ReconciliationItem {
  itemId: number;
  itemName: string;
  materialType: string;
  unitName: string;
  plannedQty: number;
  actualQty: number;
  variance: number;
  variancePct: number;
}

interface ReconciliationData {
  order: { id: number; orderId: string; styleName: string; totalQuantity: number };
  items: ReconciliationItem[];
  summary: { totalPlanned: number; totalActual: number; overallVariancePct: number; itemsExceedingTolerance: number };
}

export default function ConsumptionReconciliationPage() {
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const { data: reconData, isLoading: reconLoading } = useQuery<ReconciliationData>({
    queryKey: ["/api/merch/consumption-reconciliation", selectedOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/merch/consumption-reconciliation/${selectedOrderId}`);
      if (!res.ok) throw new Error('Failed to fetch reconciliation data');
      return res.json();
    },
    enabled: !!selectedOrderId,
  });

  const getVarianceBadge = (variancePct: number) => {
    const absPct = Math.abs(variancePct);
    if (absPct <= 2) return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">On Target</Badge>;
    if (absPct <= 5) return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Minor Variance</Badge>;
    return <Badge variant="destructive">Exceeds Tolerance</Badge>;
  };

  const formatNumber = (n: number) => {
    if (n === 0) return "0";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Consumption Reconciliation
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Compare BOM planned vs. actual material consumption per order
            </p>
          </div>
          <div className="w-72">
            <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an order..." />
              </SelectTrigger>
              <SelectContent>
                {ordersLoading ? (
                  <div className="p-3 text-center text-sm text-gray-500">Loading orders...</div>
                ) : !orders || orders.length === 0 ? (
                  <div className="p-3 text-center text-sm text-gray-500">No orders found</div>
                ) : (
                  orders.map((order) => (
                    <SelectItem key={order.id} value={String(order.id)}>
                      {order.orderId} — {order.styleName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!selectedOrderId && (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Select an order to view reconciliation</p>
              <p className="text-sm mt-1">Choose an order from the dropdown above to compare planned vs. actual material usage</p>
            </CardContent>
          </Card>
        )}

        {selectedOrderId && reconLoading && (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        )}

        {selectedOrderId && reconData && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-500">Order</div>
                  <div className="text-lg font-semibold">{reconData.order.orderId}</div>
                  <div className="text-sm text-gray-500">{reconData.order.styleName}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-500">Total Planned Qty</div>
                  <div className="text-lg font-semibold">{formatNumber(reconData.summary.totalPlanned)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-500">Total Actual Qty</div>
                  <div className="text-lg font-semibold">{formatNumber(reconData.summary.totalActual)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    Items Exceeding 5% Tolerance
                    {reconData.summary.itemsExceedingTolerance > 0 && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className={`text-lg font-semibold ${reconData.summary.itemsExceedingTolerance > 0 ? "text-red-600" : "text-green-600"}`}>
                    {reconData.summary.itemsExceedingTolerance}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5" />
                  Material Variance Detail
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reconData.items.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No BOM data found for this order</p>
                    <p className="text-sm mt-1">Ensure a BOM snapshot exists for this order</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="text-right">Planned Qty</TableHead>
                          <TableHead className="text-right">Actual Qty</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                          <TableHead className="text-right">Variance %</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Usage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reconData.items.map((item) => {
                          const absPct = Math.abs(item.variancePct);
                          const exceedsTolerance = absPct > 5;
                          const usagePct = item.plannedQty > 0 ? Math.min((item.actualQty / item.plannedQty) * 100, 150) : 0;
                          return (
                            <TableRow key={item.itemId} className={exceedsTolerance ? "bg-red-50/50" : ""}>
                              <TableCell className="font-medium">{item.itemName}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{item.materialType}</Badge>
                              </TableCell>
                              <TableCell>{item.unitName}</TableCell>
                              <TableCell className="text-right font-mono">{formatNumber(item.plannedQty)}</TableCell>
                              <TableCell className="text-right font-mono">{formatNumber(item.actualQty)}</TableCell>
                              <TableCell className={`text-right font-mono ${item.variance > 0 ? "text-red-600" : item.variance < 0 ? "text-green-600" : ""}`}>
                                {item.variance > 0 ? "+" : ""}{formatNumber(item.variance)}
                              </TableCell>
                              <TableCell className={`text-right font-mono font-semibold ${exceedsTolerance ? "text-red-600" : absPct <= 2 ? "text-green-600" : "text-yellow-600"}`}>
                                {item.variancePct > 0 ? "+" : ""}{item.variancePct.toFixed(1)}%
                              </TableCell>
                              <TableCell>{getVarianceBadge(item.variancePct)}</TableCell>
                              <TableCell className="w-32">
                                <Progress
                                  value={usagePct}
                                  className={`h-2 ${usagePct > 105 ? "[&>div]:bg-red-500" : usagePct > 95 ? "[&>div]:bg-green-500" : "[&>div]:bg-blue-500"}`}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {reconData.items.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-6 flex-wrap text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-gray-600">On Target (&le;2%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-gray-600">Minor Variance (2–5%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-gray-600">Exceeds Tolerance (&gt;5%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
