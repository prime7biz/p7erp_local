import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FlexiblePartySelector } from "@/components/party/FlexiblePartySelector";
import { InventoryItemSelector, SelectedItem } from "@/components/inventory/InventoryItemSelector";
import { Plus, Trash2, Save, Send, CheckCircle, XCircle, Loader2, ArrowLeft, Download, FileText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface GatePassItem {
  itemName: string;
  itemCode: string;
  description: string;
  quantity: string;
  unit: string;
  weight: string;
  batchNumber: string;
  condition: string;
  remarks: string;
}

const emptyItem: GatePassItem = {
  itemName: "", itemCode: "", description: "", quantity: "", unit: "pcs", weight: "", batchNumber: "", condition: "good", remarks: "",
};

export default function EnhancedGatePassForm() {
  const [, matchNew] = useRoute("/inventory/enhanced-gate-passes/new");
  const [, matchEdit] = useRoute("/inventory/enhanced-gate-passes/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const isNew = !!matchNew;
  const editId = matchEdit?.id ? parseInt(matchEdit.id) : null;

  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const defaultType = urlParams.get('type') || 'GP_IN';

  const [gatePassType, setGatePassType] = useState(defaultType);
  const [gatePassDate, setGatePassDate] = useState(new Date().toISOString().split('T')[0]);
  const [partyId, setPartyId] = useState<number | null>(null);
  const [partyName, setPartyName] = useState("");
  const [deliveryChallanId, setDeliveryChallanId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverContact, setDriverContact] = useState("");
  const [driverLicense, setDriverLicense] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [securityGuardName, setSecurityGuardName] = useState("");
  const [securityCheckpoint, setSecurityCheckpoint] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<GatePassItem[]>([{ ...emptyItem }]);
  const [workflowStatus, setWorkflowStatus] = useState("DRAFT");
  const [gatePassNumber, setGatePassNumber] = useState("");
  const [autoCreateChallan, setAutoCreateChallan] = useState(false);
  const [linkedDoc, setLinkedDoc] = useState<any>(null);

  const { data: existingData, isLoading: isLoadingExisting } = useQuery<any>({
    queryKey: ['/api/enhanced-gate-passes', editId],
    queryFn: async () => {
      if (!editId) return null;
      const res = await fetch(`/api/enhanced-gate-passes/${editId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch gate pass");
      return res.json();
    },
    enabled: !!editId,
  });

  const linkedDocQuery = useQuery<any>({
    queryKey: ['/api/enhanced-gate-passes', editId, 'linked-document'],
    queryFn: async () => {
      const res = await fetch(`/api/enhanced-gate-passes/${editId}/linked-document`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!editId,
  });

  useEffect(() => {
    if (existingData) {
      setGatePassType(existingData.gatePassType || 'GP_IN');
      setGatePassDate(existingData.gatePassDate || '');
      setPartyId(existingData.partyId);
      setPartyName(existingData.partyName || existingData.partyDisplayName || '');
      setDeliveryChallanId(existingData.deliveryChallanId ? String(existingData.deliveryChallanId) : '');
      setPurchaseOrderId(existingData.purchaseOrderId ? String(existingData.purchaseOrderId) : '');
      setVehicleNumber(existingData.vehicleNumber || '');
      setVehicleType(existingData.vehicleType || '');
      setDriverName(existingData.driverName || '');
      setDriverContact(existingData.driverContact || '');
      setDriverLicense(existingData.driverLicense || '');
      setTransporterName(existingData.transporterName || '');
      setSecurityGuardName(existingData.securityGuardName || '');
      setSecurityCheckpoint(existingData.securityCheckpoint || '');
      setPurpose(existingData.purpose || '');
      setNotes(existingData.notes || '');
      setWorkflowStatus(existingData.workflowStatus || 'DRAFT');
      setGatePassNumber(existingData.gatePassNumber || '');

      if (existingData.items && existingData.items.length > 0) {
        setItems(existingData.items.map((item: any) => ({
          itemName: item.itemName || '',
          itemCode: item.itemCode || '',
          description: item.description || '',
          quantity: item.quantity || '',
          unit: item.unit || 'pcs',
          weight: item.weight || '',
          batchNumber: item.batchNumber || '',
          condition: item.condition || 'good',
          remarks: item.remarks || '',
        })));
      }
    }
  }, [existingData]);

  const saveMutation = useMutation({
    mutationFn: async (submitAfter: boolean) => {
      const payload = {
        gatePassType,
        gatePassDate,
        partyId,
        partyName,
        deliveryChallanId: deliveryChallanId ? parseInt(deliveryChallanId) : null,
        purchaseOrderId: purchaseOrderId ? parseInt(purchaseOrderId) : null,
        vehicleNumber, vehicleType, driverName, driverContact, driverLicense, transporterName,
        securityGuardName, securityCheckpoint, purpose, notes,
        totalQuantity: items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0),
        items: items.filter(i => i.itemName.trim()),
        autoCreateChallan: gatePassType === 'GP_OUT' ? autoCreateChallan : false,
      };

      let result;
      if (isNew) {
        const res = await apiRequest('/api/enhanced-gate-passes', 'POST', payload);
        result = await res.json();
      } else {
        const res = await apiRequest(`/api/enhanced-gate-passes/${editId}`, 'PUT', payload);
        result = await res.json();
      }

      if (submitAfter && result.id) {
        await apiRequest(`/api/enhanced-gate-passes/${result.id}/submit`, 'POST');
      }

      return result;
    },
    onSuccess: (result, submitAfter) => {
      if (result.linkedChallan) {
        toast({ title: "Gate pass saved with linked Delivery Challan", description: `DC ${result.linkedChallan.challanNumber} created in DRAFT` });
      } else {
        toast({ title: submitAfter ? "Gate pass saved and submitted" : "Gate pass saved successfully" });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced-gate-passes'] });
      navigate(`/inventory/enhanced-gate-passes/${result.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const workflowMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await apiRequest(`/api/enhanced-gate-passes/${editId}/${action}`, 'POST');
      return res.json();
    },
    onSuccess: (_, action) => {
      toast({ title: `Gate pass ${action}ed successfully` });
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced-gate-passes'] });
    },
    onError: (error: any) => {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    },
  });

  const loadFromChallanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/enhanced-gate-passes/from-delivery-challan/${deliveryChallanId}`, 'POST');
      return res.json();
    },
    onSuccess: (result) => {
      toast({ title: "Gate pass created from delivery challan" });
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced-gate-passes'] });
      navigate(`/inventory/enhanced-gate-passes/${result.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Failed to load from challan", description: error.message, variant: "destructive" });
    },
  });

  const addItem = () => setItems([...items, { ...emptyItem }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  const updateItem = (index: number, field: keyof GatePassItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const isDraft = workflowStatus === 'DRAFT';
  const isReadOnly = !isNew && !isDraft;

  if (!isNew && isLoadingExisting) {
    return (
      <DashboardContainer title="Loading...">
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer
      title={isNew ? `New ${gatePassType === 'GP_IN' ? 'Inward' : 'Outward'} Gate Pass` : `Gate Pass: ${gatePassNumber}`}
      subtitle={isNew ? "Create a new security gate pass" : `Status: ${workflowStatus}`}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/inventory/enhanced-gate-passes")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          {editId && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/inventory/enhanced-gate-passes/${editId}/print`)}>
              <Download className="mr-2 h-4 w-4" /> Print
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {!isNew && workflowStatus !== 'DRAFT' && (
          <div className="flex items-center gap-2 flex-wrap">
            {workflowStatus === 'SUBMITTED' && (
              <>
                <Button size="sm" onClick={() => workflowMutation.mutate('approve')} disabled={workflowMutation.isPending}>
                  <CheckCircle className="mr-2 h-4 w-4" /> Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => workflowMutation.mutate('reject')} disabled={workflowMutation.isPending}>
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </Button>
              </>
            )}
            {workflowStatus === 'REJECTED' && (
              <Badge variant="destructive" className="text-base px-3 py-1">REJECTED</Badge>
            )}
            {workflowStatus === 'APPROVED' && (
              <Badge className="bg-green-100 text-green-800 text-base px-3 py-1">APPROVED</Badge>
            )}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Gate Pass Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Gate Pass Type</Label>
                <Select value={gatePassType} onValueChange={setGatePassType} disabled={!isNew}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GP_IN">Inward (GP_IN)</SelectItem>
                    <SelectItem value="GP_OUT">Outward (GP_OUT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={gatePassDate} onChange={(e) => setGatePassDate(e.target.value)} disabled={isReadOnly} />
              </div>
              {gatePassNumber && (
                <div>
                  <Label>Gate Pass Number</Label>
                  <Input value={gatePassNumber} disabled />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Party & Reference</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Party</Label>
                <FlexiblePartySelector
                  partyId={partyId}
                  partyName={partyName}
                  onPartyIdChange={setPartyId}
                  onPartyNameChange={setPartyName}
                  disabled={isReadOnly}
                />
              </div>
              {gatePassType === 'GP_OUT' ? (
                <div>
                  <Label>Delivery Challan ID</Label>
                  <div className="flex gap-2">
                    <Input value={deliveryChallanId} onChange={(e) => setDeliveryChallanId(e.target.value)} placeholder="Enter challan ID" disabled={isReadOnly} />
                    {isNew && deliveryChallanId && (
                      <Button variant="outline" size="sm" onClick={() => loadFromChallanMutation.mutate()} disabled={loadFromChallanMutation.isPending}>
                        {loadFromChallanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <Label>Purchase Order ID</Label>
                  <Input value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)} placeholder="Enter PO ID" disabled={isReadOnly} />
                </div>
              )}
            </div>
            {isNew && gatePassType === 'GP_OUT' && (
              <div className="flex items-center gap-2 mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <input 
                  type="checkbox" 
                  id="autoCreateChallan"
                  checked={autoCreateChallan}
                  onChange={(e) => setAutoCreateChallan(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="autoCreateChallan" className="text-sm font-medium text-blue-800">
                  Also create a Delivery Challan (DRAFT) from this gate pass
                </label>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Vehicle & Driver Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Vehicle Number</Label><Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. DHA-1234" disabled={isReadOnly} /></div>
              <div>
                <Label>Vehicle Type</Label>
                <Select value={vehicleType} onValueChange={setVehicleType} disabled={isReadOnly}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Truck">Truck</SelectItem>
                    <SelectItem value="Van">Van</SelectItem>
                    <SelectItem value="Container">Container</SelectItem>
                    <SelectItem value="Pickup">Pickup</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Transporter Name</Label><Input value={transporterName} onChange={(e) => setTransporterName(e.target.value)} disabled={isReadOnly} /></div>
              <div><Label>Driver Name</Label><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} disabled={isReadOnly} /></div>
              <div><Label>Driver Contact</Label><Input value={driverContact} onChange={(e) => setDriverContact(e.target.value)} disabled={isReadOnly} /></div>
              <div><Label>Driver License</Label><Input value={driverLicense} onChange={(e) => setDriverLicense(e.target.value)} disabled={isReadOnly} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Security Checkpoint</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Guard Name</Label><Input value={securityGuardName} onChange={(e) => setSecurityGuardName(e.target.value)} disabled={isReadOnly} /></div>
              <div><Label>Checkpoint</Label><Input value={securityCheckpoint} onChange={(e) => setSecurityCheckpoint(e.target.value)} placeholder="e.g. Main Gate" disabled={isReadOnly} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Items</CardTitle>
              {!isReadOnly && <Button variant="outline" size="sm" onClick={addItem}><Plus className="mr-2 h-4 w-4" /> Add Item</Button>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Remarks</TableHead>
                    {!isReadOnly && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="min-w-[200px]">
                        <InventoryItemSelector
                          value={item.itemName ? { itemId: 0, itemName: item.itemName, itemCode: item.itemCode, unit: item.unit } : null}
                          onChange={(selected) => {
                            if (selected) {
                              const updated = [...items];
                              updated[idx] = { ...updated[idx], itemName: selected.itemName, itemCode: selected.itemCode, unit: selected.unit };
                              setItems(updated);
                            } else {
                              const updated = [...items];
                              updated[idx] = { ...updated[idx], itemName: '', itemCode: '', unit: 'pcs' };
                              setItems(updated);
                            }
                          }}
                          disabled={isReadOnly}
                        />
                      </TableCell>
                      <TableCell><Input value={item.itemCode} disabled className="min-w-[80px]" /></TableCell>
                      <TableCell><Input type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} disabled={isReadOnly} className="min-w-[80px]" /></TableCell>
                      <TableCell>
                        <Select value={item.unit} onValueChange={(v) => updateItem(idx, 'unit', v)} disabled={isReadOnly}>
                          <SelectTrigger className="min-w-[80px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pcs">Pcs</SelectItem>
                            <SelectItem value="kg">Kg</SelectItem>
                            <SelectItem value="meter">Meter</SelectItem>
                            <SelectItem value="yard">Yard</SelectItem>
                            <SelectItem value="dozen">Dozen</SelectItem>
                            <SelectItem value="box">Box</SelectItem>
                            <SelectItem value="roll">Roll</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input type="number" value={item.weight} onChange={(e) => updateItem(idx, 'weight', e.target.value)} disabled={isReadOnly} className="min-w-[80px]" /></TableCell>
                      <TableCell><Input value={item.batchNumber} onChange={(e) => updateItem(idx, 'batchNumber', e.target.value)} disabled={isReadOnly} className="min-w-[80px]" /></TableCell>
                      <TableCell>
                        <Select value={item.condition} onValueChange={(v) => updateItem(idx, 'condition', v)} disabled={isReadOnly}>
                          <SelectTrigger className="min-w-[90px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="good">Good</SelectItem>
                            <SelectItem value="damaged">Damaged</SelectItem>
                            <SelectItem value="returned">Returned</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input value={item.remarks} onChange={(e) => updateItem(idx, 'remarks', e.target.value)} disabled={isReadOnly} className="min-w-[100px]" /></TableCell>
                      {!isReadOnly && (
                        <TableCell>
                          {items.length > 1 && (
                            <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Additional Information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Purpose</Label><Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose of this gate pass" disabled={isReadOnly} /></div>
              <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes" disabled={isReadOnly} /></div>
            </div>
          </CardContent>
        </Card>

        {!isNew && linkedDocQuery.data && (linkedDocQuery.data.linkedDocType || linkedDocQuery.data.linkedDocId) && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Linked Document
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{linkedDocQuery.data.linkedDocType === 'DELIVERY_CHALLAN' ? 'Delivery Challan' : linkedDocQuery.data.linkedDocType}</p>
                  <p className="text-sm text-muted-foreground">{linkedDocQuery.data.linkedDocNumber} — Status: {linkedDocQuery.data.linkedDocStatus}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/inventory/delivery-challans/${linkedDocQuery.data.linkedDocId}`)}>
                  View Document
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(isNew || isDraft) && (
          <div className="flex items-center gap-3 justify-end">
            <Button variant="outline" onClick={() => navigate("/inventory/enhanced-gate-passes")}>Cancel</Button>
            <Button variant="outline" onClick={() => saveMutation.mutate(false)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Draft
            </Button>
            <Button onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Save & Submit
            </Button>
          </div>
        )}
      </div>
    </DashboardContainer>
  );
}
