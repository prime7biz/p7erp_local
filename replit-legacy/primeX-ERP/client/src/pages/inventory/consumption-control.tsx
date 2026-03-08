import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Lock, Unlock, ShieldCheck, AlertTriangle, FileText, Plus, Check, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

function OrderConsumptionTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

  const { data: orders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/orders"],
    staleTime: 5 * 60 * 1000,
  });

  const finalizeMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await apiRequest(`/api/consumption-control/finalize-order/${orderId}`, "POST");
      return res.json();
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption-control/snapshot", orderId] });
      toast({ title: "Order Finalized", description: "BOM snapshot has been locked successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to finalize order", variant: "destructive" });
    },
  });

  const toggleExpand = (orderId: number) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {Array(5).fill(null).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Order BOM Snapshots
        </CardTitle>
        <CardDescription>
          Finalize orders to lock their Bill of Materials for consumption tracking
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Style</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>BOM Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders && orders.length > 0 ? (
              orders.map((order: any) => {
                const isFinalized = order.bomFinalized || order.status === "FINALIZED" || order.isLocked;
                const isExpanded = expandedOrders.has(order.id);
                return (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isFinalized={isFinalized}
                    isExpanded={isExpanded}
                    onToggleExpand={() => toggleExpand(order.id)}
                    onFinalize={() => finalizeMutation.mutate(order.id)}
                    isPending={finalizeMutation.isPending}
                  />
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No orders found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function OrderRow({
  order,
  isFinalized,
  isExpanded,
  onToggleExpand,
  onFinalize,
  isPending,
}: {
  order: any;
  isFinalized: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onFinalize: () => void;
  isPending: boolean;
}) {
  const { data: snapshot, isLoading: snapshotLoading } = useQuery<any>({
    queryKey: ["/api/consumption-control/snapshot", order.id],
    enabled: isExpanded && isFinalized,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={isFinalized ? onToggleExpand : undefined}>
        <TableCell>
          {isFinalized && (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} className="p-0.5">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </TableCell>
        <TableCell className="font-medium">{order.orderNumber || order.id}</TableCell>
        <TableCell>{order.buyerName || order.customerName || "—"}</TableCell>
        <TableCell>{order.styleName || order.style || "—"}</TableCell>
        <TableCell>{order.quantity ? Number(order.quantity).toLocaleString() : "—"}</TableCell>
        <TableCell>
          <Badge variant="outline">{order.status || "—"}</Badge>
        </TableCell>
        <TableCell>
          {isFinalized ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
              <Lock className="h-3 w-3 mr-1" /> Locked
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              <Unlock className="h-3 w-3 mr-1" /> Open
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          {!isFinalized && (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onFinalize(); }}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
              Finalize
            </Button>
          )}
        </TableCell>
      </TableRow>
      {isExpanded && isFinalized && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30 p-0">
            <div className="p-4">
              {snapshotLoading ? (
                <div className="space-y-2">
                  {Array(3).fill(null).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : snapshot && snapshot.items && snapshot.items.length > 0 ? (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    Frozen BOM — Snapshot taken on {snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleDateString() : "—"}
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Material Type</TableHead>
                        <TableHead className="text-right">Required Qty</TableHead>
                        <TableHead className="text-right">Wastage %</TableHead>
                        <TableHead className="text-right">Total Required</TableHead>
                        <TableHead className="text-right">Est. Rate (BDT)</TableHead>
                        <TableHead className="text-right">Est. Cost (BDT)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshot.items.map((item: any, idx: number) => {
                        const wastage = item.wastagePercent || 0;
                        const totalRequired = item.totalRequiredQty || (item.requiredQty * (1 + wastage / 100));
                        const estimatedCost = item.estimatedCost || (totalRequired * (item.estimatedRate || 0));
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{item.itemName || item.name}</TableCell>
                            <TableCell>{item.materialType || "—"}</TableCell>
                            <TableCell className="text-right">{Number(item.requiredQty || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right">{Number(wastage).toFixed(1)}%</TableCell>
                            <TableCell className="text-right">{Number(totalRequired).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right">BDT {Number(item.estimatedRate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right">BDT {Number(estimatedCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No BOM snapshot data available for this order.</p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function MaterialReservationsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [issueQty, setIssueQty] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [issueWarning, setIssueWarning] = useState<string | null>(null);

  const { data: orders } = useQuery<any[]>({
    queryKey: ["/api/orders"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: reservations, isLoading: reservationsLoading } = useQuery<any[]>({
    queryKey: ["/api/consumption-control/reservations", selectedOrderId],
    enabled: !!selectedOrderId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: warehouses } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
    staleTime: 10 * 60 * 1000,
  });

  const issueMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("/api/consumption-control/issue-material", "POST", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consumption-control/reservations", selectedOrderId] });
      toast({ title: "Material Issued", description: "Material has been issued successfully" });
      setIssueDialogOpen(false);
      resetIssueForm();
    },
    onError: (error: any) => {
      if (error.message?.includes("403") || error.message?.includes("exceed")) {
        setIssueWarning("Issue quantity exceeds reservation. Additional approval may be required.");
      } else {
        toast({ title: "Error", description: error.message || "Failed to issue material", variant: "destructive" });
      }
    },
  });

  const resetIssueForm = () => {
    setIssueQty("");
    setWarehouseId("");
    setRemarks("");
    setSelectedItem(null);
    setIssueWarning(null);
  };

  const openIssueDialog = (item: any) => {
    resetIssueForm();
    setSelectedItem(item);
    setIssueDialogOpen(true);
  };

  const handleIssue = () => {
    if (!selectedItem || !issueQty || !selectedOrderId) return;
    issueMutation.mutate({
      orderId: parseInt(selectedOrderId),
      itemId: selectedItem.itemId || selectedItem.id,
      warehouseId: warehouseId ? parseInt(warehouseId) : null,
      issueQty: parseFloat(issueQty),
      remarks,
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Material Reservations
          </CardTitle>
          <CardDescription>
            Track reserved materials against orders and issue from warehouse
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <label className="text-sm font-medium mb-1.5 block">Filter by Order</label>
            <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select an order" />
              </SelectTrigger>
              <SelectContent>
                {orders?.map((order: any) => (
                  <SelectItem key={order.id} value={order.id.toString()}>
                    {order.orderNumber || order.id} — {order.buyerName || order.customerName || "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedOrderId ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Select an order to view material reservations</p>
            </div>
          ) : reservationsLoading ? (
            <div className="space-y-3">
              {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : reservations && reservations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Reserved Qty</TableHead>
                  <TableHead className="text-right">Issued Qty</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((item: any, idx: number) => {
                  const reserved = Number(item.reservedQty || 0);
                  const issued = Number(item.issuedQty || 0);
                  const remaining = reserved - issued;
                  const pct = reserved > 0 ? Math.min((issued / reserved) * 100, 100) : 0;
                  const status = remaining <= 0 ? "Fulfilled" : issued > 0 ? "Partial" : "Pending";
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.itemName || item.name || "—"}</TableCell>
                      <TableCell className="text-right">{reserved.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{issued.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Math.max(remaining, 0).toLocaleString()}</TableCell>
                      <TableCell className="w-[140px]">
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            status === "Fulfilled"
                              ? "bg-green-100 text-green-800"
                              : status === "Partial"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }
                          variant="secondary"
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {remaining > 0 && (
                          <Button size="sm" variant="outline" onClick={() => openIssueDialog(item)}>
                            Issue Material
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No reservations found for this order.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Material</DialogTitle>
            <DialogDescription>
              Issue material for: {selectedItem?.itemName || selectedItem?.name || "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {issueWarning && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{issueWarning}</AlertDescription>
              </Alert>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Issue Quantity</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter quantity to issue"
                value={issueQty}
                onChange={(e) => setIssueQty(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Warehouse</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((wh: any) => (
                    <SelectItem key={wh.id} value={wh.id.toString()}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Remarks</label>
              <Textarea
                placeholder="Optional remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleIssue} disabled={issueMutation.isPending || !issueQty}>
              {issueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChangeRequestsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [newCRDialogOpen, setNewCRDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const [crOrderId, setCrOrderId] = useState("");
  const [crReason, setCrReason] = useState("");
  const [crChangeType, setCrChangeType] = useState("");
  const [crItems, setCrItems] = useState<Array<{ itemId: string; previousQty: number; newQty: string; reason: string }>>([
    { itemId: "", previousQty: 0, newQty: "", reason: "" },
  ]);

  const { data: orders } = useQuery<any[]>({
    queryKey: ["/api/orders"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: changeRequests, isLoading } = useQuery<any[]>({
    queryKey: ["/api/consumption-control/change-requests"],
    staleTime: 2 * 60 * 1000,
  });

  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/consumption-control/snapshot", crOrderId],
    enabled: !!crOrderId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: items } = useQuery<any[]>({
    queryKey: ["/api/items"],
    staleTime: 10 * 60 * 1000,
  });

  const createCRMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("/api/consumption-control/change-request", "POST", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consumption-control/change-requests"] });
      toast({ title: "Change Request Created", description: "Your change request has been submitted for approval" });
      setNewCRDialogOpen(false);
      resetCRForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create change request", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/consumption-control/change-requests/${id}/approve`, "POST");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consumption-control/change-requests"] });
      toast({ title: "Approved", description: "Change request has been approved" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to approve change request", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await apiRequest(`/api/consumption-control/change-requests/${id}/reject`, "POST", { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consumption-control/change-requests"] });
      toast({ title: "Rejected", description: "Change request has been rejected" });
      setRejectDialogOpen(false);
      setRejectingId(null);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reject change request", variant: "destructive" });
    },
  });

  const resetCRForm = () => {
    setCrOrderId("");
    setCrReason("");
    setCrChangeType("");
    setCrItems([{ itemId: "", previousQty: 0, newQty: "", reason: "" }]);
  };

  const addCRItem = () => {
    setCrItems([...crItems, { itemId: "", previousQty: 0, newQty: "", reason: "" }]);
  };

  const removeCRItem = (idx: number) => {
    setCrItems(crItems.filter((_, i) => i !== idx));
  };

  const updateCRItem = (idx: number, field: string, value: any) => {
    const updated = [...crItems];
    (updated[idx] as any)[field] = value;
    if (field === "itemId" && snapshot?.items) {
      const snapshotItem = snapshot.items.find((si: any) => String(si.itemId || si.id) === value);
      updated[idx].previousQty = snapshotItem ? Number(snapshotItem.requiredQty || snapshotItem.totalRequiredQty || 0) : 0;
    }
    setCrItems(updated);
  };

  const handleSubmitCR = () => {
    if (!crOrderId || !crChangeType || !crReason) return;
    createCRMutation.mutate({
      orderId: parseInt(crOrderId),
      reason: crReason,
      changeType: crChangeType,
      items: crItems.map((item) => ({
        itemId: parseInt(item.itemId),
        previousQty: item.previousQty,
        newQty: parseFloat(item.newQty),
        reason: item.reason,
      })),
    });
  };

  const openRejectDialog = (id: number) => {
    setRejectingId(id);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const filteredCRs = changeRequests?.filter((cr: any) => {
    if (statusFilter === "ALL") return true;
    return cr.status === statusFilter;
  }) || [];

  const CHANGE_TYPES = [
    { value: "QUANTITY_INCREASE", label: "Quantity Increase" },
    { value: "QUANTITY_DECREASE", label: "Quantity Decrease" },
    { value: "ITEM_SUBSTITUTION", label: "Item Substitution" },
    { value: "NEW_ITEM", label: "New Item" },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
      case "APPROVED":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "REJECTED":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Change Requests
              </CardTitle>
              <CardDescription>
                Manage BOM change requests for locked orders
              </CardDescription>
            </div>
            <Button onClick={() => { resetCRForm(); setNewCRDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> New Change Request
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <label className="text-sm font-medium mb-1.5 block">Filter by Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filteredCRs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CR #</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Change Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCRs.map((cr: any) => (
                  <TableRow key={cr.id}>
                    <TableCell className="font-medium">CR-{String(cr.id).padStart(4, "0")}</TableCell>
                    <TableCell>{cr.orderNumber || cr.orderId || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CHANGE_TYPES.find((ct) => ct.value === cr.changeType)?.label || cr.changeType}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{cr.reason || "—"}</TableCell>
                    <TableCell>{getStatusBadge(cr.status)}</TableCell>
                    <TableCell>{cr.requestedBy || cr.createdByName || "—"}</TableCell>
                    <TableCell>{cr.createdAt ? new Date(cr.createdAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      {cr.status === "PENDING" && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => approveMutation.mutate(cr.id)}
                            disabled={approveMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => openRejectDialog(cr.id)}
                          >
                            <X className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No change requests found.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={newCRDialogOpen} onOpenChange={setNewCRDialogOpen}>
        <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Change Request</DialogTitle>
            <DialogDescription>
              Submit a change request for a locked order's BOM
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Order *</label>
                <Select value={crOrderId} onValueChange={setCrOrderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select order" />
                  </SelectTrigger>
                  <SelectContent>
                    {orders?.map((order: any) => (
                      <SelectItem key={order.id} value={order.id.toString()}>
                        {order.orderNumber || order.id} — {order.buyerName || order.customerName || ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Change Type *</label>
                <Select value={crChangeType} onValueChange={setCrChangeType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANGE_TYPES.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>
                        {ct.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Reason *</label>
              <Textarea
                placeholder="Explain why this change is needed"
                value={crReason}
                onChange={(e) => setCrReason(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Items</label>
                <Button type="button" size="sm" variant="outline" onClick={addCRItem}>
                  <Plus className="h-3 w-3 mr-1" /> Add Item
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Previous Qty</TableHead>
                    <TableHead className="text-right">New Qty</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crItems.map((crItem, idx) => {
                    const delta = crItem.newQty ? parseFloat(crItem.newQty) - crItem.previousQty : 0;
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select
                            value={crItem.itemId}
                            onValueChange={(v) => updateCRItem(idx, "itemId", v)}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              {(snapshot?.items || items || []).map((item: any) => (
                                <SelectItem key={item.itemId || item.id} value={String(item.itemId || item.id)}>
                                  {item.itemName || item.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">{crItem.previousQty.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-[100px] ml-auto text-right"
                            value={crItem.newQty}
                            onChange={(e) => updateCRItem(idx, "newQty", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={delta > 0 ? "text-red-600" : delta < 0 ? "text-green-600" : ""}>
                            {delta > 0 ? "+" : ""}{delta.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Reason"
                            className="w-[140px]"
                            value={crItem.reason}
                            onChange={(e) => updateCRItem(idx, "reason", e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          {crItems.length > 1 && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeCRItem(idx)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCRDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitCR}
              disabled={createCRMutation.isPending || !crOrderId || !crChangeType || !crReason}
            >
              {createCRMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Submit Change Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Change Request</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting CR-{rejectingId ? String(rejectingId).padStart(4, "0") : ""}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Rejection Reason *</label>
            <Textarea
              placeholder="Enter reason for rejection"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectingId && rejectMutation.mutate({ id: rejectingId, reason: rejectionReason })}
              disabled={rejectMutation.isPending || !rejectionReason}
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ConsumptionControlPage = () => {
  return (
    <DashboardContainer
      title="Consumption Control"
      subtitle="Order BOM locking, material reservations & change management"
    >
      <Tabs defaultValue="order-consumption" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="order-consumption" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Order Consumption
          </TabsTrigger>
          <TabsTrigger value="material-reservations" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Material Reservations
          </TabsTrigger>
          <TabsTrigger value="change-requests" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Change Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="order-consumption">
          <OrderConsumptionTab />
        </TabsContent>

        <TabsContent value="material-reservations">
          <MaterialReservationsTab />
        </TabsContent>

        <TabsContent value="change-requests">
          <ChangeRequestsTab />
        </TabsContent>
      </Tabs>
    </DashboardContainer>
  );
};

export default ConsumptionControlPage;
