import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Save, CheckCircle, Loader2 } from "lucide-react";

interface AdjustmentItem {
  itemId: string;
  itemName: string;
  itemCode: string;
  currentQty: number;
  adjustedQty: string;
  rate: string;
  unit: string;
  reason: string;
}

const emptyItem: AdjustmentItem = {
  itemId: "",
  itemName: "",
  itemCode: "",
  currentQty: 0,
  adjustedQty: "",
  rate: "",
  unit: "",
  reason: "",
};

export default function StockAdjustmentForm() {
  const params = useParams<{ id: string }>();
  const adjustmentId = params.id ? parseInt(params.id) : undefined;
  const isNew = !adjustmentId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [adjustmentType, setAdjustmentType] = useState("INCREASE");
  const [warehouse, setWarehouse] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<AdjustmentItem[]>([{ ...emptyItem }]);
  const [status, setStatus] = useState("DRAFT");

  const { data: existingData, isLoading: loadingExisting } = useQuery<any>({
    queryKey: ["/api/stock-ledger/adjustments", adjustmentId],
    queryFn: async () => {
      const res = await fetch(`/api/stock-ledger/adjustments/${adjustmentId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch adjustment");
      return res.json();
    },
    enabled: !!adjustmentId,
  });

  useEffect(() => {
    if (existingData) {
      setAdjustmentDate(existingData.adjustmentDate || existingData.adjustment_date || "");
      setAdjustmentType(existingData.adjustmentType || existingData.adjustment_type || "INCREASE");
      setWarehouse(existingData.warehouse || "");
      setReason(existingData.reason || "");
      setNotes(existingData.notes || "");
      setStatus(existingData.status || "DRAFT");
      if (existingData.items && existingData.items.length > 0) {
        setItems(
          existingData.items.map((item: any) => ({
            itemId: item.itemId ? String(item.itemId) : item.item_id ? String(item.item_id) : "",
            itemName: item.itemName || item.item_name || "",
            itemCode: item.itemCode || item.item_code || "",
            currentQty: item.currentQty ?? item.current_qty ?? 0,
            adjustedQty: item.adjustedQty ?? item.adjusted_qty ?? "",
            rate: item.rate ?? "",
            unit: item.unit || "",
            reason: item.reason || "",
          }))
        );
      }
    }
  }, [existingData]);

  const fetchCurrentStock = async (itemId: string, index: number) => {
    if (!itemId) return;
    try {
      const res = await fetch(`/api/stock-ledger/items/${itemId}/current`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const newItems = [...items];
        newItems[index] = {
          ...newItems[index],
          currentQty: data.current_qty ?? data.currentQty ?? 0,
          itemName: data.item_name ?? data.itemName ?? newItems[index].itemName,
          itemCode: data.item_code ?? data.itemCode ?? newItems[index].itemCode,
          unit: data.unit ?? newItems[index].unit,
        };
        setItems(newItems);
      }
    } catch {
    }
  };

  const updateItem = (index: number, field: keyof AdjustmentItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);

    if (field === "itemId" && value) {
      fetchCurrentStock(value, index);
    }
  };

  const addItem = () => setItems([...items, { ...emptyItem }]);
  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const getDifference = (item: AdjustmentItem) => {
    const adjusted = parseFloat(item.adjustedQty) || 0;
    return adjusted - item.currentQty;
  };

  const getValue = (item: AdjustmentItem) => {
    const diff = Math.abs(getDifference(item));
    const rate = parseFloat(item.rate) || 0;
    return diff * rate;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter((i) => i.itemName.trim() || i.itemId);
      const body = {
        adjustmentDate,
        adjustmentType,
        warehouse,
        reason,
        notes,
        items: validItems.map((i) => ({
          itemId: i.itemId ? parseInt(i.itemId) : null,
          itemName: i.itemName,
          itemCode: i.itemCode,
          currentQty: i.currentQty,
          adjustedQty: parseFloat(i.adjustedQty) || 0,
          difference: getDifference(i),
          rate: parseFloat(i.rate) || 0,
          value: getValue(i),
          unit: i.unit,
          reason: i.reason,
        })),
      };
      if (isNew) {
        const res = await apiRequest("/api/stock-ledger/adjustments", "POST", body);
        return res.json();
      } else {
        const res = await apiRequest(`/api/stock-ledger/adjustments/${adjustmentId}`, "PUT", body);
        return res.json();
      }
    },
    onSuccess: (data) => {
      toast({ title: isNew ? "Adjustment created" : "Adjustment updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-ledger/adjustments"] });
      if (adjustmentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/stock-ledger/adjustments", adjustmentId] });
      }
      if (isNew && data?.id) {
        setLocation(`/inventory/stock-adjustments/${data.id}`);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/stock-ledger/adjustments/${adjustmentId}/approve`, "POST");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Adjustment approved" });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-ledger/adjustments", adjustmentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-ledger/summary"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isDraft = status === "DRAFT";
  const isEditable = isNew || isDraft;
  const isPending = saveMutation.isPending || approveMutation.isPending;

  if (!isNew && loadingExisting) {
    return (
      <DashboardContainer title="Loading...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer
      title={isNew ? "New Stock Adjustment" : `Stock Adjustment #${adjustmentId}`}
      subtitle={isNew ? "Create a stock adjustment entry" : `Status: ${status}`}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/inventory/stock-dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
          {!isNew && (
            <Badge className={status === "APPROVED" ? "bg-green-100 text-green-800" : status === "DRAFT" ? "bg-gray-100 text-gray-800" : "bg-blue-100 text-blue-800"}>
              {status}
            </Badge>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adjustment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Adjustment Date</Label>
                <Input
                  type="date"
                  value={adjustmentDate}
                  onChange={(e) => setAdjustmentDate(e.target.value)}
                  disabled={!isEditable}
                />
              </div>
              <div>
                <Label>Adjustment Type</Label>
                <Select value={adjustmentType} onValueChange={setAdjustmentType} disabled={!isEditable}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCREASE">Increase</SelectItem>
                    <SelectItem value="DECREASE">Decrease</SelectItem>
                    <SelectItem value="PHYSICAL_COUNT">Physical Count</SelectItem>
                    <SelectItem value="WRITE_OFF">Write Off</SelectItem>
                    <SelectItem value="OPENING_STOCK">Opening Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Warehouse</Label>
                <Input
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  placeholder="Warehouse name"
                  disabled={!isEditable}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for adjustment"
                  rows={2}
                  disabled={!isEditable}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes"
                  rows={2}
                  disabled={!isEditable}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Items</CardTitle>
              {isEditable && (
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="mr-2 h-4 w-4" /> Add Item
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Item ID</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead className="text-right">Current Qty</TableHead>
                    <TableHead className="text-right w-[100px]">Adjusted Qty</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="text-right w-[100px]">Rate</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Reason</TableHead>
                    {isEditable && <TableHead className="w-[40px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => {
                    const diff = getDifference(item);
                    const value = getValue(item);
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input
                            value={item.itemId}
                            onChange={(e) => updateItem(idx, "itemId", e.target.value)}
                            placeholder="ID"
                            disabled={!isEditable}
                            className="h-8 text-sm w-16"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.itemName}
                            onChange={(e) => updateItem(idx, "itemName", e.target.value)}
                            placeholder="Item name"
                            disabled={!isEditable}
                            className="h-8 text-sm min-w-[120px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.itemCode}
                            onChange={(e) => updateItem(idx, "itemCode", e.target.value)}
                            placeholder="Code"
                            disabled={!isEditable}
                            className="h-8 text-sm min-w-[80px]"
                          />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.currentQty}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.adjustedQty}
                            onChange={(e) => updateItem(idx, "adjustedQty", e.target.value)}
                            disabled={!isEditable}
                            className="h-8 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className={`text-right font-medium ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : ""}`}>
                          {item.adjustedQty ? (diff > 0 ? `+${diff}` : diff) : "-"}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.rate}
                            onChange={(e) => updateItem(idx, "rate", e.target.value)}
                            disabled={!isEditable}
                            className="h-8 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {value ? `BDT ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.unit}
                            onChange={(e) => updateItem(idx, "unit", e.target.value)}
                            placeholder="Unit"
                            disabled={!isEditable}
                            className="h-8 text-sm w-16"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.reason}
                            onChange={(e) => updateItem(idx, "reason", e.target.value)}
                            placeholder="Reason"
                            disabled={!isEditable}
                            className="h-8 text-sm min-w-[100px]"
                          />
                        </TableCell>
                        {isEditable && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(idx)}
                              disabled={items.length <= 1}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {isEditable && (
            <>
              <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={isPending}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save as Draft
              </Button>
              {!isNew && isDraft && (
                <Button onClick={() => approveMutation.mutate()} disabled={isPending}>
                  {approveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  Approve
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardContainer>
  );
}