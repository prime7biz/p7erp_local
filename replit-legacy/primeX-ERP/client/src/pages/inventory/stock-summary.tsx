import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Warehouse, AlertTriangle, TrendingDown, Factory, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
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
  stock_group_id?: number;
  stock_group_name?: string;
  min_stock_level?: number;
  reorder_point?: number;
}

interface StockGroup {
  id: number;
  name: string;
  parentId?: number | null;
  children?: StockGroup[];
}

interface ProcessOrder {
  id: number;
  processNumber: string;
  processType: string;
  inputItemName?: string;
  inputMaterial?: string;
  outputItemName?: string;
  outputMaterial?: string;
  inputQuantity?: number;
  status: string;
}

function StockSummaryPage() {
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: summaryData, isLoading: loadingSummary } = useQuery<StockSummaryItem[]>({
    queryKey: ["/api/stock-ledger/summary"],
  });

  const { data: stockGroups } = useQuery<StockGroup[]>({
    queryKey: ["/api/stock-groups/tree"],
  });

  const { data: warehouses } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: processOrders } = useQuery<ProcessOrder[]>({
    queryKey: ["/api/process-orders", { status: "ISSUED" }],
    queryFn: async () => {
      const res = await fetch("/api/process-orders?status=ISSUED", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch process orders");
      return res.json();
    },
  });

  const filteredData = useMemo(() => {
    if (!summaryData) return [];
    return summaryData.filter((item) => {
      if (warehouseFilter !== "all" && String(item.warehouse_id) !== warehouseFilter) return false;
      if (groupFilter !== "all" && String(item.stock_group_id) !== groupFilter) return false;
      return true;
    });
  }, [summaryData, warehouseFilter, groupFilter]);

  const totalItems = filteredData.length;
  const totalValue = filteredData.reduce((sum, item) => sum + (item.current_value || 0), 0);
  const lowStockItems = filteredData.filter(
    (item) => item.reorder_point && item.current_qty < item.reorder_point
  );
  const activeProcessOrders = (processOrders || []).filter(
    (po) => po.status?.toUpperCase() === "ISSUED"
  );

  const groupedByStockGroup = useMemo(() => {
    const groups: Record<string, { name: string; items: StockSummaryItem[]; totalQty: number; totalValue: number }> = {};
    filteredData.forEach((item) => {
      const groupName = item.stock_group_name || "Ungrouped";
      const groupId = String(item.stock_group_id || "ungrouped");
      if (!groups[groupId]) {
        groups[groupId] = { name: groupName, items: [], totalQty: 0, totalValue: 0 };
      }
      groups[groupId].items.push(item);
      groups[groupId].totalQty += item.current_qty || 0;
      groups[groupId].totalValue += item.current_value || 0;
    });
    return groups;
  }, [filteredData]);

  const warehouseData = useMemo(() => {
    const whMap: Record<string, { name: string; items: StockSummaryItem[] }> = {};
    (summaryData || []).forEach((item) => {
      const whId = String(item.warehouse_id);
      if (!whMap[whId]) {
        whMap[whId] = { name: item.warehouse_name || `Warehouse ${whId}`, items: [] };
      }
      whMap[whId].items.push(item);
    });
    return whMap;
  }, [summaryData]);

  const toggleGroup = (groupId: string) => {
    const next = new Set(expandedGroups);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setExpandedGroups(next);
  };

  return (
    <DashboardContainer
      title="Stock Summary"
      subtitle="Inventory overview with group-wise and warehouse-wise breakdown"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="text-2xl font-bold">{loadingSummary ? "—" : totalItems.toLocaleString()}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Value</p>
                  <p className="text-2xl font-bold">
                    {loadingSummary ? "—" : formatMoney(totalValue)}
                  </p>
                </div>
                <TrendingDown className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className={lowStockItems.length > 0 ? "border-amber-200 bg-amber-50/50" : ""}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Low Stock Alerts</p>
                  <p className="text-2xl font-bold text-amber-600">{loadingSummary ? "—" : lowStockItems.length}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Process Orders</p>
                  <p className="text-2xl font-bold text-blue-600">{activeProcessOrders.length}</p>
                </div>
                <Factory className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="All Warehouses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Warehouses</SelectItem>
              {(warehouses || []).map((w: any) => (
                <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="All Stock Groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock Groups</SelectItem>
              {(stockGroups || []).map((g: any) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Stock by Group
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <div className="space-y-3">
                {Array(4).fill(null).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : Object.keys(groupedByStockGroup).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2" />
                <p className="text-sm">No stock data available</p>
              </div>
            ) : (
              <div className="space-y-1">
                {Object.entries(groupedByStockGroup).map(([groupId, group]) => (
                  <div key={groupId} className="border rounded-md">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                      onClick={() => toggleGroup(groupId)}
                    >
                      <div className="flex items-center gap-2">
                        {expandedGroups.has(groupId) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{group.name}</span>
                        <Badge variant="outline" className="ml-2">{group.items.length} items</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Qty: {group.totalQty.toLocaleString()}</span>
                        <span>Value: {formatMoney(group.totalValue)}</span>
                      </div>
                    </button>
                    {expandedGroups.has(groupId) && (
                      <div className="border-t">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item Code</TableHead>
                              <TableHead>Item Name</TableHead>
                              <TableHead>Warehouse</TableHead>
                              <TableHead>Unit</TableHead>
                              <TableHead className="text-right">Current Qty</TableHead>
                              <TableHead className="text-right">Value (BDT)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.items.map((item) => (
                              <TableRow key={`${item.item_id}-${item.warehouse_id}`}>
                                <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                                <TableCell>{item.item_name}</TableCell>
                                <TableCell>{item.warehouse_name}</TableCell>
                                <TableCell>{item.unit}</TableCell>
                                <TableCell className={`text-right font-semibold ${item.current_qty <= 0 ? "text-red-600" : ""}`}>
                                  {item.current_qty.toLocaleString()}
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              Warehouse-wise Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : Object.keys(warehouseData).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Warehouse className="h-10 w-10 mx-auto mb-2" />
                <p className="text-sm">No warehouse stock data available</p>
              </div>
            ) : (
              <Tabs defaultValue={Object.keys(warehouseData)[0]} className="w-full">
                <TabsList className="flex-wrap h-auto">
                  {Object.entries(warehouseData).map(([whId, wh]) => (
                    <TabsTrigger key={whId} value={whId} className="text-sm">
                      {wh.name} ({wh.items.length})
                    </TabsTrigger>
                  ))}
                </TabsList>
                {Object.entries(warehouseData).map(([whId, wh]) => (
                  <TabsContent key={whId} value={whId}>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item Code</TableHead>
                            <TableHead>Item Name</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead className="text-right">Total In</TableHead>
                            <TableHead className="text-right">Total Out</TableHead>
                            <TableHead className="text-right">Current Qty</TableHead>
                            <TableHead className="text-right">Value (BDT)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wh.items.map((item) => (
                            <TableRow key={item.item_id} className={item.current_qty <= 0 ? "bg-red-50" : ""}>
                              <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                              <TableCell>{item.item_name}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                              <TableCell className="text-right text-green-600">{item.total_in.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-red-600">{item.total_out.toLocaleString()}</TableCell>
                              <TableCell className={`text-right font-semibold ${item.current_qty <= 0 ? "text-red-600" : ""}`}>
                                {item.current_qty.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatMoney(item.current_value || 0)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>

        <Card className={lowStockItems.length > 0 ? "border-amber-200" : ""}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : lowStockItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 text-green-500 mb-2" />
                <p className="text-sm">All items are within safe stock levels</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Current Qty</TableHead>
                      <TableHead className="text-right">Reorder Point</TableHead>
                      <TableHead className="text-right">Shortage</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStockItems.map((item) => {
                      const shortage = (item.reorder_point || 0) - item.current_qty;
                      const isCritical = item.min_stock_level != null && item.current_qty < item.min_stock_level;
                      return (
                        <TableRow key={`${item.item_id}-${item.warehouse_id}`} className={isCritical ? "bg-red-50" : "bg-amber-50/50"}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{item.item_name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{item.item_code}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{item.current_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{(item.reorder_point || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">{shortage.toLocaleString()}</TableCell>
                          <TableCell>
                            {isCritical ? (
                              <Badge className="bg-red-100 text-red-800 hover:bg-red-100">CRITICAL</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">LOW</Badge>
                            )}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Factory className="h-4 w-4 text-purple-500" />
              Process Orders (WIP Tracker)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!processOrders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : activeProcessOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Factory className="h-10 w-10 mb-2" />
                <p className="text-sm">No active process orders</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Process #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Input Material</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expected Output</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeProcessOrders.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell className="font-semibold text-primary">
                          {po.processNumber || `PO-${po.id}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{po.processType}</Badge>
                        </TableCell>
                        <TableCell>{po.inputItemName || po.inputMaterial || "—"}</TableCell>
                        <TableCell>
                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Issued</Badge>
                        </TableCell>
                        <TableCell>{po.outputItemName || po.outputMaterial || "—"}</TableCell>
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

export default StockSummaryPage;
