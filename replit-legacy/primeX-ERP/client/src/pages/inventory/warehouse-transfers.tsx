import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRightLeft, Plus, Truck, Check, Package, Eye, Loader2, Trash2 } from "lucide-react";

interface TransferItem {
  itemId: number;
  itemName?: string;
  quantity: number;
  unit: string;
  rate: number;
  receivedQuantity?: number;
}

interface Transfer {
  id: number;
  transferNumber: string;
  transferDate: string;
  sourceWarehouseId: number;
  sourceWarehouseName?: string;
  destinationWarehouseId: number;
  destinationWarehouseName?: string;
  reason?: string;
  status: string;
  items?: TransferItem[];
  totalItems?: number;
  createdAt?: string;
}

function getStatusBadge(status: string) {
  switch (status?.toUpperCase()) {
    case "DRAFT":
      return <Badge variant="outline" className="bg-gray-100 text-gray-800 hover:bg-gray-100">Draft</Badge>;
    case "APPROVED":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Approved</Badge>;
    case "SHIPPED":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Shipped</Badge>;
    case "RECEIVED":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Received</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function WarehouseTransfersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [isReceiving, setIsReceiving] = useState(false);
  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});

  const [formData, setFormData] = useState({
    sourceWarehouseId: "",
    destinationWarehouseId: "",
    transferDate: new Date().toISOString().split("T")[0],
    reason: "",
  });
  const [formItems, setFormItems] = useState<{ itemId: string; quantity: string; unit: string; rate: string }[]>([]);

  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: transfers, isLoading } = useQuery<Transfer[]>({
    queryKey: ["/api/warehouse-transfers", statusFilter !== "all" ? statusFilter : undefined],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/warehouse-transfers${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transfers");
      return res.json();
    },
  });

  const { data: warehouses } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: items } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/warehouse-transfers", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/warehouse-transfers"] });
      toast({ title: "Transfer Created", description: "Warehouse transfer has been created successfully." });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create transfer", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/warehouse-transfers/${id}/approve`, "POST", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/warehouse-transfers"] });
      toast({ title: "Transfer Approved", description: "Transfer has been approved." });
      setIsViewOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to approve transfer", variant: "destructive" });
    },
  });

  const shipMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/warehouse-transfers/${id}/ship`, "POST", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/warehouse-transfers"] });
      toast({ title: "Transfer Shipped", description: "Stock has been dispatched from source warehouse." });
      setIsViewOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to ship transfer", variant: "destructive" });
    },
  });

  const receiveMutation = useMutation({
    mutationFn: ({ id, receivedItems }: { id: number; receivedItems: any }) =>
      apiRequest(`/api/warehouse-transfers/${id}/receive`, "POST", { receivedItems }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/warehouse-transfers"] });
      toast({ title: "Transfer Received", description: "Stock has been received at destination warehouse." });
      setIsViewOpen(false);
      setIsReceiving(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to receive transfer", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      sourceWarehouseId: "",
      destinationWarehouseId: "",
      transferDate: new Date().toISOString().split("T")[0],
      reason: "",
    });
    setFormItems([]);
  };

  const addFormItem = () => {
    setFormItems([...formItems, { itemId: "", quantity: "", unit: "", rate: "" }]);
  };

  const removeFormItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const updateFormItem = (index: number, field: string, value: string) => {
    const updated = [...formItems];
    (updated[index] as any)[field] = value;
    if (field === "itemId" && items) {
      const item = items.find((i: any) => String(i.id) === value);
      if (item) {
        updated[index].unit = item.unit || item.baseUnit || "";
        updated[index].rate = String(item.rate || item.costPrice || 0);
      }
    }
    setFormItems(updated);
  };

  const handleCreate = () => {
    if (!formData.sourceWarehouseId || !formData.destinationWarehouseId) {
      toast({ title: "Error", description: "Please select source and destination warehouses", variant: "destructive" });
      return;
    }
    if (formData.sourceWarehouseId === formData.destinationWarehouseId) {
      toast({ title: "Error", description: "Source and destination warehouses must be different", variant: "destructive" });
      return;
    }
    if (formItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      sourceWarehouseId: Number(formData.sourceWarehouseId),
      destinationWarehouseId: Number(formData.destinationWarehouseId),
      transferDate: formData.transferDate,
      reason: formData.reason,
      items: formItems.map((fi) => ({
        itemId: Number(fi.itemId),
        quantity: Number(fi.quantity),
        unit: fi.unit,
        rate: Number(fi.rate),
      })),
    });
  };

  const handleViewTransfer = async (transfer: Transfer) => {
    try {
      const res = await fetch(`/api/warehouse-transfers/${transfer.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transfer details");
      const detail = await res.json();
      setSelectedTransfer(detail);
      setIsReceiving(false);
      setReceivedQtys({});
      setIsViewOpen(true);
    } catch {
      setSelectedTransfer(transfer);
      setIsViewOpen(true);
    }
  };

  const handleReceive = () => {
    if (!selectedTransfer) return;
    const receivedItems = (selectedTransfer.items || []).map((item, idx) => ({
      itemId: item.itemId,
      receivedQuantity: receivedQtys[idx] ?? item.quantity,
    }));
    receiveMutation.mutate({ id: selectedTransfer.id, receivedItems });
  };

  const totalCount = (transfers || []).length;
  const draftCount = (transfers || []).filter((t) => t.status?.toUpperCase() === "DRAFT").length;
  const shippedCount = (transfers || []).filter((t) => t.status?.toUpperCase() === "SHIPPED").length;

  return (
    <DashboardContainer
      title="Warehouse Transfers"
      subtitle="Manage stock transfers between warehouses"
      actions={
        <Button size="sm" onClick={() => { resetForm(); setIsCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Transfer
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-sm text-muted-foreground">Total Transfers</div>
              <div className="text-2xl font-bold">{totalCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-sm text-muted-foreground">Draft</div>
              <div className="text-2xl font-bold text-gray-600">{draftCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-sm text-muted-foreground">In Transit</div>
              <div className="text-2xl font-bold text-amber-600">{shippedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-sm text-muted-foreground">Completed</div>
              <div className="text-2xl font-bold text-green-600">
                {(transfers || []).filter((t) => t.status?.toUpperCase() === "RECEIVED").length}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="SHIPPED">Shipped</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transfer List
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Loading transfers...</span>
              </div>
            ) : !transfers || transfers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ArrowRightLeft className="h-10 w-10 mb-3" />
                <p className="text-lg font-medium">No transfers found</p>
                <p className="text-sm">Create your first warehouse transfer to move stock between locations.</p>
                <Button className="mt-4" onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" /> Create Transfer
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transfer #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Source Warehouse</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead className="text-right"># Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers.map((transfer) => (
                      <TableRow key={transfer.id}>
                        <TableCell className="font-semibold text-primary">
                          {transfer.transferNumber || `WT-${transfer.id}`}
                        </TableCell>
                        <TableCell>
                          {transfer.transferDate ? new Date(transfer.transferDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>{transfer.sourceWarehouseName || `WH-${transfer.sourceWarehouseId}`}</TableCell>
                        <TableCell>{transfer.destinationWarehouseName || `WH-${transfer.destinationWarehouseId}`}</TableCell>
                        <TableCell className="text-right">{transfer.totalItems || transfer.items?.length || 0}</TableCell>
                        <TableCell>{getStatusBadge(transfer.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleViewTransfer(transfer)}>
                            <Eye className="mr-1 h-4 w-4" /> View
                          </Button>
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Warehouse Transfer</DialogTitle>
            <DialogDescription>Create a transfer to move stock between warehouses</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Source Warehouse</label>
                <Select value={formData.sourceWarehouseId} onValueChange={(v) => setFormData({ ...formData, sourceWarehouseId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehouses || []).map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Destination Warehouse</label>
                <Select value={formData.destinationWarehouseId} onValueChange={(v) => setFormData({ ...formData, destinationWarehouseId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehouses || []).map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Transfer Date</label>
                <Input
                  type="date"
                  value={formData.transferDate}
                  onChange={(e) => setFormData({ ...formData, transferDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Reason</label>
                <Textarea
                  placeholder="Reason for transfer..."
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  rows={1}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Transfer Items</label>
                <Button type="button" variant="outline" size="sm" onClick={addFormItem}>
                  <Plus className="mr-1 h-3 w-3" /> Add Item
                </Button>
              </div>
              {formItems.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border rounded-md">
                  <Package className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">No items added. Click "Add Item" to start.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formItems.map((fi, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Select value={fi.itemId} onValueChange={(v) => updateFormItem(idx, "itemId", v)}>
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Select item" />
                              </SelectTrigger>
                              <SelectContent>
                                {(items || []).map((item: any) => (
                                  <SelectItem key={item.id} value={String(item.id)}>
                                    {item.name || item.itemName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              className="w-24"
                              value={fi.quantity}
                              onChange={(e) => updateFormItem(idx, "quantity", e.target.value)}
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-20"
                              value={fi.unit}
                              onChange={(e) => updateFormItem(idx, "unit", e.target.value)}
                              placeholder="Unit"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              className="w-24"
                              value={fi.rate}
                              onChange={(e) => updateFormItem(idx, "rate", e.target.value)}
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeFormItem(idx)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
              ) : (
                "Create Transfer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewOpen} onOpenChange={(open) => { setIsViewOpen(open); if (!open) setIsReceiving(false); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transfer Details — {selectedTransfer?.transferNumber || `WT-${selectedTransfer?.id}`}
            </DialogTitle>
            <DialogDescription>
              {selectedTransfer?.status && getStatusBadge(selectedTransfer.status)}
            </DialogDescription>
          </DialogHeader>

          {selectedTransfer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Source Warehouse</p>
                  <p className="font-medium">{selectedTransfer.sourceWarehouseName || `WH-${selectedTransfer.sourceWarehouseId}`}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Destination Warehouse</p>
                  <p className="font-medium">{selectedTransfer.destinationWarehouseName || `WH-${selectedTransfer.destinationWarehouseId}`}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Transfer Date</p>
                  <p className="font-medium">
                    {selectedTransfer.transferDate ? new Date(selectedTransfer.transferDate).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reason</p>
                  <p className="font-medium">{selectedTransfer.reason || "—"}</p>
                </div>
              </div>

              {selectedTransfer.items && selectedTransfer.items.length > 0 && (
                <div className="overflow-x-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Rate (BDT)</TableHead>
                        <TableHead className="text-right">Amount (BDT)</TableHead>
                        {isReceiving && <TableHead className="text-right">Received Qty</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTransfer.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.itemName || `Item #${item.itemId}`}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell className="text-right">BDT {(item.rate || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            BDT {((item.quantity || 0) * (item.rate || 0)).toLocaleString()}
                          </TableCell>
                          {isReceiving && (
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="0"
                                max={item.quantity}
                                className="w-24 ml-auto"
                                value={receivedQtys[idx] ?? item.quantity}
                                onChange={(e) => setReceivedQtys({ ...receivedQtys, [idx]: Number(e.target.value) })}
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {selectedTransfer?.status?.toUpperCase() === "DRAFT" && (
              <>
                <Button
                  variant="default"
                  onClick={() => approveMutation.mutate(selectedTransfer.id)}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving...</>
                  ) : (
                    <><Check className="mr-2 h-4 w-4" /> Approve</>
                  )}
                </Button>
              </>
            )}
            {selectedTransfer?.status?.toUpperCase() === "APPROVED" && (
              <Button
                onClick={() => shipMutation.mutate(selectedTransfer.id)}
                disabled={shipMutation.isPending}
              >
                {shipMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Shipping...</>
                ) : (
                  <><Truck className="mr-2 h-4 w-4" /> Ship</>
                )}
              </Button>
            )}
            {selectedTransfer?.status?.toUpperCase() === "SHIPPED" && !isReceiving && (
              <Button onClick={() => setIsReceiving(true)}>
                <Package className="mr-2 h-4 w-4" /> Receive
              </Button>
            )}
            {isReceiving && (
              <Button
                onClick={handleReceive}
                disabled={receiveMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {receiveMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Receiving...</>
                ) : (
                  <><Check className="mr-2 h-4 w-4" /> Confirm Receive</>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}

export default WarehouseTransfersPage;
