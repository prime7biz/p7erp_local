import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FlexiblePartySelector } from "@/components/party/FlexiblePartySelector";
import { InventoryItemSelector, SelectedItem } from "@/components/inventory/InventoryItemSelector";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Save, Send, Loader2, CheckCircle, XCircle, Truck, FileText, Printer } from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ChallanItem {
  id?: number;
  itemId?: number;
  itemName: string;
  itemCode: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  color: string;
  size: string;
  batchNumber: string;
  remarks: string;
}

const emptyItem: ChallanItem = {
  itemName: "", itemCode: "", description: "", quantity: "", unit: "Pcs",
  rate: "", amount: "", color: "", size: "", batchNumber: "", remarks: "",
};

function getStatusBadge(status: string) {
  const map: Record<string, { className: string; label: string }> = {
    DRAFT: { className: "bg-gray-100 text-gray-800", label: "Draft" },
    SUBMITTED: { className: "bg-blue-100 text-blue-800", label: "Submitted" },
    CHECKED: { className: "bg-cyan-100 text-cyan-800", label: "Checked" },
    RECOMMENDED: { className: "bg-purple-100 text-purple-800", label: "Recommended" },
    APPROVED: { className: "bg-green-100 text-green-800", label: "Approved" },
    POSTED: { className: "bg-emerald-100 text-emerald-800", label: "Posted" },
    REJECTED: { className: "bg-red-100 text-red-800", label: "Rejected" },
  };
  const s = map[status] || { className: "", label: status };
  return <Badge className={s.className}>{s.label}</Badge>;
}

export default function DeliveryChallanForm() {
  const params = useParams<{ id: string }>();
  const challanId = params.id ? parseInt(params.id) : undefined;
  const isNew = !challanId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [partyId, setPartyId] = useState<number | null>(null);
  const [partyName, setPartyName] = useState("");
  const [orderId, setOrderId] = useState<string>("");
  const [challanDate, setChallanDate] = useState(new Date().toISOString().split("T")[0]);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverContact, setDriverContact] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverContact, setReceiverContact] = useState("");
  const [notes, setNotes] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [items, setItems] = useState<ChallanItem[]>([{ ...emptyItem }]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [autoCreateGatePass, setAutoCreateGatePass] = useState(false);

  const { data: challanData, isLoading: loadingChallan } = useQuery<any>({
    queryKey: ['/api/delivery-challans', challanId],
    queryFn: async () => {
      const res = await fetch(`/api/delivery-challans/${challanId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!challanId,
  });

  const linkedDocQuery = useQuery<any>({
    queryKey: ['/api/delivery-challans', challanId, 'linked-document'],
    queryFn: async () => {
      const res = await fetch(`/api/delivery-challans/${challanId}/linked-document`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!challanId,
  });

  const resyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/delivery-challans/${challanId}/resync-from-source`, "POST", {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Challan resynced from gate pass" });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans", challanId] });
    },
    onError: (error: any) => {
      toast({ title: "Resync failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (challanData) {
      setPartyId(challanData.partyId || null);
      setPartyName(challanData.partyName || "");
      setOrderId(challanData.orderId ? String(challanData.orderId) : "");
      setChallanDate(challanData.challanDate || "");
      setVehicleNumber(challanData.vehicleNumber || "");
      setDriverName(challanData.driverName || "");
      setDriverContact(challanData.driverContact || "");
      setTransporterName(challanData.transporterName || "");
      setDeliveryAddress(challanData.deliveryAddress || "");
      setReceiverName(challanData.receiverName || "");
      setReceiverContact(challanData.receiverContact || "");
      setNotes(challanData.notes || "");
      setSpecialInstructions(challanData.specialInstructions || "");
      if (challanData.items && challanData.items.length > 0) {
        setItems(challanData.items.map((item: any) => ({
          id: item.id,
          itemId: item.itemId,
          itemName: item.itemName || "",
          itemCode: item.itemCode || "",
          description: item.description || "",
          quantity: item.quantity || "",
          unit: item.unit || "Pcs",
          rate: item.rate || "",
          amount: item.amount || "",
          color: item.color || "",
          size: item.size || "",
          batchNumber: item.batchNumber || "",
          remarks: item.remarks || "",
        })));
      }
    }
  }, [challanData]);

  const totalQuantity = useMemo(() =>
    items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0), [items]);
  const totalAmount = useMemo(() =>
    items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0), [items]);

  const updateItem = (index: number, field: keyof ChallanItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === "quantity" || field === "rate") {
      const qty = parseFloat(field === "quantity" ? value : newItems[index].quantity) || 0;
      const rate = parseFloat(field === "rate" ? value : newItems[index].rate) || 0;
      newItems[index].amount = (qty * rate).toFixed(2);
    }
    setItems(newItems);
  };

  const addItem = () => setItems([...items, { ...emptyItem }]);
  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const validItems = items.filter(i => i.itemName.trim());
      const body = {
        challanDate,
        partyId,
        partyName,
        orderId: orderId ? parseInt(orderId) : null,
        vehicleNumber, driverName, driverContact, transporterName,
        deliveryAddress, receiverName, receiverContact,
        totalQuantity: String(totalQuantity),
        totalAmount: String(totalAmount),
        notes, specialInstructions,
        workflowStatus: status,
        items: validItems,
        autoCreateGatePass,
      };
      if (isNew) {
        const res = await apiRequest("/api/delivery-challans", "POST", body);
        return res.json();
      } else {
        const res = await apiRequest(`/api/delivery-challans/${challanId}`, "PUT", body);
        return res.json();
      }
    },
    onSuccess: (data) => {
      if (data.linkedGatePass) {
        toast({ title: "Challan created with linked Gate Pass", description: `${data.linkedGatePass.gatePassNumber} created in DRAFT` });
      } else {
        toast({ title: isNew ? "Challan created" : "Challan updated", description: `${data.challanNumber || "Delivery Challan"} saved successfully` });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans"] });
      if (isNew && data.id) {
        setLocation(`/inventory/delivery-challans/${data.id}`);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const workflowMutation = useMutation({
    mutationFn: async ({ action, reason }: { action: string; reason?: string }) => {
      const res = await apiRequest(`/api/delivery-challans/${challanId}/${action}`, "POST", reason ? { reason } : {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans", challanId] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/delivery-challans/${challanId}/create-invoice`, "POST");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Invoice created", description: `Voucher ${data.voucherNumber} created` });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans", challanId] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const currentStatus = challanData?.workflowStatus || "DRAFT";
  const isDraft = currentStatus === "DRAFT";
  const isEditable = isNew || isDraft;
  const isPending = saveMutation.isPending || workflowMutation.isPending;

  if (!isNew && loadingChallan) {
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
      title={isNew ? "New Delivery Challan" : `Delivery Challan — ${challanData?.challanNumber || ""}`}
      subtitle={isNew ? "Create a new delivery challan" : "View and manage delivery challan"}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/inventory/delivery-challans">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
          {!isNew && (
            <Link href={`/inventory/delivery-challans/${challanId}/print`}>
              <Button variant="outline" size="sm">
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
            </Link>
          )}
          {!isNew && challanData && getStatusBadge(currentStatus)}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Party & Order Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Party</Label>
                <FlexiblePartySelector
                  partyId={partyId}
                  partyName={partyName}
                  onPartyIdChange={setPartyId}
                  onPartyNameChange={setPartyName}
                  disabled={!isEditable}
                />
              </div>
              <div>
                <Label>Order ID (optional)</Label>
                <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order reference" disabled={!isEditable} />
              </div>
              <div>
                <Label>Challan Date</Label>
                <Input type="date" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} disabled={!isEditable} />
              </div>
              {isNew && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <input 
                    type="checkbox" 
                    id="autoCreateGatePass"
                    checked={autoCreateGatePass}
                    onChange={(e) => setAutoCreateGatePass(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="autoCreateGatePass" className="text-sm font-medium text-amber-800">
                    Also create an Outward Gate Pass (DRAFT) for this challan
                  </label>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Vehicle & Transport Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Vehicle Number</Label>
                  <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. DHA-12-3456" disabled={!isEditable} />
                </div>
                <div>
                  <Label>Transporter Name</Label>
                  <Input value={transporterName} onChange={(e) => setTransporterName(e.target.value)} placeholder="Transport company" disabled={!isEditable} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Driver Name</Label>
                  <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} disabled={!isEditable} />
                </div>
                <div>
                  <Label>Driver Contact</Label>
                  <Input value={driverContact} onChange={(e) => setDriverContact(e.target.value)} disabled={!isEditable} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Delivery Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Delivery Address</Label>
                <Textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={2} disabled={!isEditable} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Receiver Name</Label>
                  <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} disabled={!isEditable} />
                </div>
                <div>
                  <Label>Receiver Contact</Label>
                  <Input value={receiverContact} onChange={(e) => setReceiverContact(e.target.value)} disabled={!isEditable} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={!isEditable} />
              </div>
              <div>
                <Label>Special Instructions</Label>
                <Textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} rows={2} disabled={!isEditable} />
              </div>
            </CardContent>
          </Card>
        </div>

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
                    <TableHead className="w-[180px]">Item Name</TableHead>
                    <TableHead className="w-[120px]">Description</TableHead>
                    <TableHead className="w-[80px]">Color</TableHead>
                    <TableHead className="w-[60px]">Size</TableHead>
                    <TableHead className="w-[80px]">Qty</TableHead>
                    <TableHead className="w-[60px]">Unit</TableHead>
                    <TableHead className="w-[90px]">Rate</TableHead>
                    <TableHead className="w-[100px]">Amount</TableHead>
                    <TableHead className="w-[90px]">Batch</TableHead>
                    {isEditable && <TableHead className="w-[40px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="min-w-[200px]">
                        <InventoryItemSelector
                          value={item.itemName ? { itemId: item.itemId || 0, itemName: item.itemName, itemCode: item.itemCode, unit: item.unit } : null}
                          onChange={(selected) => {
                            if (selected) {
                              const newItems = [...items];
                              newItems[idx] = { ...newItems[idx], itemId: selected.itemId, itemName: selected.itemName, itemCode: selected.itemCode, unit: selected.unit };
                              setItems(newItems);
                            } else {
                              const newItems = [...items];
                              newItems[idx] = { ...newItems[idx], itemId: undefined, itemName: '', itemCode: '', unit: 'Pcs' };
                              setItems(newItems);
                            }
                          }}
                          disabled={!isEditable}
                        />
                      </TableCell>
                      <TableCell>
                        <Input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Desc" disabled={!isEditable} className="h-8 text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input value={item.color} onChange={(e) => updateItem(idx, "color", e.target.value)} disabled={!isEditable} className="h-8 text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input value={item.size} onChange={(e) => updateItem(idx, "size", e.target.value)} disabled={!isEditable} className="h-8 text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} disabled={!isEditable} className="h-8 text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} disabled={!isEditable} className="h-8 text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={item.rate} onChange={(e) => updateItem(idx, "rate", e.target.value)} disabled={!isEditable} className="h-8 text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input value={item.amount} readOnly className="h-8 text-sm bg-muted" />
                      </TableCell>
                      <TableCell>
                        <Input value={item.batchNumber} onChange={(e) => updateItem(idx, "batchNumber", e.target.value)} disabled={!isEditable} className="h-8 text-sm" />
                      </TableCell>
                      {isEditable && (
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} disabled={items.length <= 1} className="h-8 w-8 p-0">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end mt-4 gap-8 text-sm">
              <div><span className="text-muted-foreground">Total Quantity: </span><span className="font-semibold">{totalQuantity.toLocaleString()}</span></div>
              <div><span className="text-muted-foreground">Total Amount: </span><span className="font-semibold">BDT {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>
          </CardContent>
        </Card>

        {!isNew && linkedDocQuery.data && (linkedDocQuery.data.sourceDoc || (linkedDocQuery.data.linkedGatePasses && linkedDocQuery.data.linkedGatePasses.length > 0)) && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Linked Documents
                </CardTitle>
                {isDraft && linkedDocQuery.data.sourceDoc && !challanData?.isManuallyModified && (
                  <Button variant="outline" size="sm" onClick={() => resyncMutation.mutate()} disabled={resyncMutation.isPending}>
                    {resyncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Re-sync from Gate Pass
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedDocQuery.data.sourceDoc && (
                <div className="flex items-center justify-between p-2 bg-white rounded border">
                  <div>
                    <p className="text-sm font-medium">Source: Gate Pass</p>
                    <p className="text-xs text-muted-foreground">{linkedDocQuery.data.sourceDoc.gatePassNumber} — {linkedDocQuery.data.sourceDoc.workflowStatus}</p>
                  </div>
                  <Link href={`/inventory/enhanced-gate-passes/${linkedDocQuery.data.sourceDoc.id}`}>
                    <Button variant="outline" size="sm">View</Button>
                  </Link>
                </div>
              )}
              {linkedDocQuery.data.linkedGatePasses?.map((gp: any) => (
                <div key={gp.id} className="flex items-center justify-between p-2 bg-white rounded border">
                  <div>
                    <p className="text-sm font-medium">Gate Pass</p>
                    <p className="text-xs text-muted-foreground">{gp.gatePassNumber} — {gp.workflowStatus}</p>
                  </div>
                  <Link href={`/inventory/enhanced-gate-passes/${gp.id}`}>
                    <Button variant="outline" size="sm">View</Button>
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <div>
            {isEditable && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")} disabled={isPending}>
                  {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save as Draft
                </Button>
                <Button onClick={() => {
                  if (isNew) {
                    saveMutation.mutate("DRAFT");
                  } else {
                    saveMutation.mutate("DRAFT");
                  }
                }} variant="outline" disabled={isPending}>
                  <Save className="mr-2 h-4 w-4" /> Save
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {!isNew && isDraft && (
              <Button onClick={() => workflowMutation.mutate({ action: "submit" })} disabled={isPending}>
                <Send className="mr-2 h-4 w-4" /> Submit
              </Button>
            )}
            {!isNew && currentStatus === "SUBMITTED" && (
              <Button onClick={() => workflowMutation.mutate({ action: "check" })} disabled={isPending} className="bg-cyan-600 hover:bg-cyan-700">
                <CheckCircle className="mr-2 h-4 w-4" /> Mark Checked
              </Button>
            )}
            {!isNew && currentStatus === "CHECKED" && (
              <Button onClick={() => workflowMutation.mutate({ action: "recommend" })} disabled={isPending} className="bg-purple-600 hover:bg-purple-700">
                <CheckCircle className="mr-2 h-4 w-4" /> Recommend
              </Button>
            )}
            {!isNew && currentStatus === "RECOMMENDED" && (
              <Button onClick={() => workflowMutation.mutate({ action: "approve" })} disabled={isPending} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="mr-2 h-4 w-4" /> Approve
              </Button>
            )}
            {!isNew && currentStatus === "APPROVED" && (
              <Button onClick={() => workflowMutation.mutate({ action: "post" })} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
                <Truck className="mr-2 h-4 w-4" /> Post (Dispatch)
              </Button>
            )}
            {!isNew && currentStatus === "POSTED" && !challanData?.invoiceCreated && (
              <Button onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending} variant="outline">
                <FileText className="mr-2 h-4 w-4" /> Create Invoice
              </Button>
            )}
            {!isNew && currentStatus !== "POSTED" && currentStatus !== "REJECTED" && currentStatus !== "DRAFT" && (
              <Button variant="destructive" onClick={() => setRejectDialogOpen(true)} disabled={isPending}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Delivery Challan</DialogTitle>
            <DialogDescription>Provide a reason for rejection.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              workflowMutation.mutate({ action: "reject", reason: rejectReason });
              setRejectDialogOpen(false);
              setRejectReason("");
            }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}