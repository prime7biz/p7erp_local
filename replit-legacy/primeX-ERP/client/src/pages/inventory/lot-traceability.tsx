import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Plus, Search, Filter, Eye, ArrowRightLeft, ClipboardList, AlertTriangle, Calendar } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "bg-green-100 text-green-800",
  RESERVED: "bg-blue-100 text-blue-800",
  DEPLETED: "bg-gray-100 text-gray-600",
  EXPIRED: "bg-red-100 text-red-800",
  ON_HOLD: "bg-orange-100 text-orange-800",
  QUARANTINE: "bg-purple-100 text-purple-800",
};

const TRANSACTION_TYPES = ["RECEIPT", "ISSUE", "TRANSFER", "ADJUSTMENT", "RETURN", "PRODUCTION_IN", "PRODUCTION_OUT"];
const ALLOCATION_TYPES = ["SALES_ORDER", "PRODUCTION_ORDER", "DELIVERY_CHALLAN"];
const LOT_STATUSES = ["AVAILABLE", "RESERVED", "DEPLETED", "EXPIRED", "ON_HOLD", "QUARANTINE"];

export default function LotTraceabilityPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);

  const [newLot, setNewLot] = useState({ lotNumber: "", itemId: "", warehouseId: "", quantity: "", unitCost: "", batchDate: "", expiryDate: "", notes: "" });
  const [newTxn, setNewTxn] = useState({ transactionType: "RECEIPT", quantity: "", referenceType: "", referenceId: "", notes: "" });
  const [newAlloc, setNewAlloc] = useState({ allocationType: "SALES_ORDER", allocationId: "", quantity: "" });

  const queryParams = new URLSearchParams();
  if (statusFilter && statusFilter !== "ALL") queryParams.set("status", statusFilter);
  const queryString = queryParams.toString();

  const { data: lotsData, isLoading } = useQuery<any[]>({
    queryKey: ["/api/lots", queryString],
    queryFn: () => fetch(`/api/lots${queryString ? `?${queryString}` : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: lotDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/lots", selectedLotId],
    queryFn: () => fetch(`/api/lots/${selectedLotId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedLotId && detailOpen,
  });

  const { data: expiringLots } = useQuery<any[]>({
    queryKey: ["/api/lots/expiring"],
    queryFn: () => fetch("/api/lots/expiring?days=30", { credentials: "include" }).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/lots", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      setCreateOpen(false);
      setNewLot({ lotNumber: "", itemId: "", warehouseId: "", quantity: "", unitCost: "", batchDate: "", expiryDate: "", notes: "" });
      toast({ title: "Lot created successfully" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const txnMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/lots/${selectedLotId}/transactions`, "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      setTransactionOpen(false);
      setNewTxn({ transactionType: "RECEIPT", quantity: "", referenceType: "", referenceId: "", notes: "" });
      toast({ title: "Transaction recorded" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const allocMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/lots/${selectedLotId}/allocate`, "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      setAllocateOpen(false);
      setNewAlloc({ allocationType: "SALES_ORDER", allocationId: "", quantity: "" });
      toast({ title: "Allocation created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest(`/api/lots/${id}/status`, "PUT", { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      toast({ title: "Status updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filteredLots = (lotsData || []).filter((lot: any) =>
    !search || lot.lotNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const expiringCount = Array.isArray(expiringLots) ? expiringLots.length : 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Lot / Batch Traceability
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Track lots from receipt to consumption</p>
        </div>
        <div className="flex items-center gap-2">
          {expiringCount > 0 && (
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {expiringCount} expiring soon
            </Badge>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Lot
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search by lot number..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-1" />
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {LOT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : filteredLots.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p>No lots found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot #</TableHead>
                    <TableHead>Item ID</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Unit Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Batch Date</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLots.map((lot: any) => (
                    <TableRow key={lot.id} className="cursor-pointer hover:bg-gray-50">
                      <TableCell className="font-medium">{lot.lotNumber}</TableCell>
                      <TableCell>{lot.itemId}</TableCell>
                      <TableCell>{parseFloat(lot.quantity).toLocaleString()}</TableCell>
                      <TableCell>{parseFloat(lot.remainingQty).toLocaleString()}</TableCell>
                      <TableCell>{lot.unitCost ? parseFloat(lot.unitCost).toFixed(2) : "-"}</TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_COLORS[lot.status] || "bg-gray-100 text-gray-600"} text-[11px]`}>
                          {lot.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{lot.batchDate || "-"}</TableCell>
                      <TableCell className="text-sm">{lot.expiryDate || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedLotId(lot.id); setDetailOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedLotId(lot.id); setTransactionOpen(true); }}>
                            <ArrowRightLeft className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedLotId(lot.id); setAllocateOpen(true); }}>
                            <ClipboardList className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Lot</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lot Number *</Label>
              <Input value={newLot.lotNumber} onChange={e => setNewLot({ ...newLot, lotNumber: e.target.value })} placeholder="LOT-001" />
            </div>
            <div>
              <Label>Item ID *</Label>
              <Input type="number" value={newLot.itemId} onChange={e => setNewLot({ ...newLot, itemId: e.target.value })} />
            </div>
            <div>
              <Label>Warehouse ID</Label>
              <Input type="number" value={newLot.warehouseId} onChange={e => setNewLot({ ...newLot, warehouseId: e.target.value })} />
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input type="number" step="0.0001" value={newLot.quantity} onChange={e => setNewLot({ ...newLot, quantity: e.target.value })} />
            </div>
            <div>
              <Label>Unit Cost</Label>
              <Input type="number" step="0.0001" value={newLot.unitCost} onChange={e => setNewLot({ ...newLot, unitCost: e.target.value })} />
            </div>
            <div>
              <Label>Batch Date</Label>
              <Input type="date" value={newLot.batchDate} onChange={e => setNewLot({ ...newLot, batchDate: e.target.value })} />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={newLot.expiryDate} onChange={e => setNewLot({ ...newLot, expiryDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={newLot.notes} onChange={e => setNewLot({ ...newLot, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!newLot.lotNumber || !newLot.itemId || !newLot.quantity || createMutation.isPending}
              onClick={() => createMutation.mutate({
                lotNumber: newLot.lotNumber,
                itemId: parseInt(newLot.itemId),
                warehouseId: newLot.warehouseId ? parseInt(newLot.warehouseId) : undefined,
                quantity: newLot.quantity,
                unitCost: newLot.unitCost || undefined,
                batchDate: newLot.batchDate || undefined,
                expiryDate: newLot.expiryDate || undefined,
                notes: newLot.notes || undefined,
              })}
            >
              {createMutation.isPending ? "Creating..." : "Create Lot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedLotId(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Lot Detail — {lotDetail?.lotNumber}</DialogTitle></DialogHeader>
          {detailLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>
          ) : lotDetail ? (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="allocations">Allocations</TabsTrigger>
                <TabsTrigger value="trace">Trace</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <InfoField label="Lot Number" value={lotDetail.lotNumber} />
                  <InfoField label="Item ID" value={lotDetail.itemId} />
                  <InfoField label="Warehouse ID" value={lotDetail.warehouseId || "-"} />
                  <InfoField label="Quantity" value={parseFloat(lotDetail.quantity).toLocaleString()} />
                  <InfoField label="Remaining" value={parseFloat(lotDetail.remainingQty).toLocaleString()} />
                  <InfoField label="Unit Cost" value={lotDetail.unitCost ? parseFloat(lotDetail.unitCost).toFixed(2) : "-"} />
                  <InfoField label="Batch Date" value={lotDetail.batchDate || "-"} />
                  <InfoField label="Expiry Date" value={lotDetail.expiryDate || "-"} />
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <Badge className={`${STATUS_COLORS[lotDetail.status] || ""} mt-0.5`}>{lotDetail.status}</Badge>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Select onValueChange={(val) => statusMutation.mutate({ id: lotDetail.id, status: val })}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Change Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOT_STATUSES.filter(s => s !== lotDetail.status).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
              <TabsContent value="transactions" className="mt-3">
                {lotDetail.transactions?.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No transactions yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Ref Type</TableHead>
                        <TableHead>Ref ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lotDetail.transactions?.map((t: any) => (
                        <TableRow key={t.id}>
                          <TableCell><Badge variant="outline" className="text-[11px]">{t.transactionType}</Badge></TableCell>
                          <TableCell>{parseFloat(t.quantity).toLocaleString()}</TableCell>
                          <TableCell className="text-sm">{t.referenceType || "-"}</TableCell>
                          <TableCell className="text-sm">{t.referenceId || "-"}</TableCell>
                          <TableCell className="text-sm">{t.transactionDate ? new Date(t.transactionDate).toLocaleDateString() : "-"}</TableCell>
                          <TableCell className="text-sm max-w-[150px] truncate">{t.notes || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="allocations" className="mt-3">
                {lotDetail.allocations?.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No allocations yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Alloc ID</TableHead>
                        <TableHead>Allocated</TableHead>
                        <TableHead>Issued</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lotDetail.allocations?.map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-sm">{a.allocationType}</TableCell>
                          <TableCell className="text-sm">{a.allocationId}</TableCell>
                          <TableCell>{parseFloat(a.allocatedQty).toLocaleString()}</TableCell>
                          <TableCell>{parseFloat(a.issuedQty || "0").toLocaleString()}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[11px]">{a.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="trace" className="mt-3">
                <TraceView lotId={lotDetail.id} />
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={transactionOpen} onOpenChange={(open) => { setTransactionOpen(open); if (!open) setSelectedLotId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Transaction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Transaction Type *</Label>
              <Select value={newTxn.transactionType} onValueChange={val => setNewTxn({ ...newTxn, transactionType: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input type="number" step="0.0001" value={newTxn.quantity} onChange={e => setNewTxn({ ...newTxn, quantity: e.target.value })} />
            </div>
            <div>
              <Label>Reference Type</Label>
              <Input value={newTxn.referenceType} onChange={e => setNewTxn({ ...newTxn, referenceType: e.target.value })} placeholder="GRN, DELIVERY_CHALLAN, etc." />
            </div>
            <div>
              <Label>Reference ID</Label>
              <Input type="number" value={newTxn.referenceId} onChange={e => setNewTxn({ ...newTxn, referenceId: e.target.value })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={newTxn.notes} onChange={e => setNewTxn({ ...newTxn, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionOpen(false)}>Cancel</Button>
            <Button
              disabled={!newTxn.quantity || txnMutation.isPending}
              onClick={() => txnMutation.mutate({
                transactionType: newTxn.transactionType,
                quantity: newTxn.quantity,
                referenceType: newTxn.referenceType || undefined,
                referenceId: newTxn.referenceId ? parseInt(newTxn.referenceId) : undefined,
                notes: newTxn.notes || undefined,
              })}
            >
              {txnMutation.isPending ? "Recording..." : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={allocateOpen} onOpenChange={(open) => { setAllocateOpen(open); if (!open) setSelectedLotId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Allocate from Lot</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Allocation Type *</Label>
              <Select value={newAlloc.allocationType} onValueChange={val => setNewAlloc({ ...newAlloc, allocationType: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALLOCATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Allocation ID (Order/Challan ID) *</Label>
              <Input type="number" value={newAlloc.allocationId} onChange={e => setNewAlloc({ ...newAlloc, allocationId: e.target.value })} />
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input type="number" step="0.0001" value={newAlloc.quantity} onChange={e => setNewAlloc({ ...newAlloc, quantity: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocateOpen(false)}>Cancel</Button>
            <Button
              disabled={!newAlloc.allocationId || !newAlloc.quantity || allocMutation.isPending}
              onClick={() => allocMutation.mutate({
                allocationType: newAlloc.allocationType,
                allocationId: parseInt(newAlloc.allocationId),
                quantity: newAlloc.quantity,
              })}
            >
              {allocMutation.isPending ? "Allocating..." : "Allocate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function TraceView({ lotId }: { lotId: number }) {
  const { data: trace, isLoading } = useQuery<any>({
    queryKey: ["/api/lots", lotId, "trace"],
    queryFn: () => fetch(`/api/lots/${lotId}/trace`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return <Skeleton className="h-40" />;
  if (!trace) return <p className="text-sm text-gray-500 text-center py-4">No trace data</p>;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm text-green-700">Receipt</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2">
          {trace.receipt?.length > 0 ? trace.receipt.map((r: any) => (
            <p key={r.id} className="text-sm">
              {r.transactionType} — Qty: {parseFloat(r.quantity).toLocaleString()} — {r.referenceType || ""} #{r.referenceId || ""}
            </p>
          )) : <p className="text-xs text-gray-400">No receipts</p>}
        </CardContent>
      </Card>

      <div className="flex justify-center"><span className="text-gray-400">↓</span></div>

      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm text-blue-700">Allocations ({trace.allocations?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2">
          {trace.allocations?.length > 0 ? trace.allocations.map((a: any) => (
            <p key={a.id} className="text-sm">
              {a.allocationType} #{a.allocationId} — Alloc: {parseFloat(a.allocatedQty).toLocaleString()}, Issued: {parseFloat(a.issuedQty || "0").toLocaleString()} — {a.status}
            </p>
          )) : <p className="text-xs text-gray-400">No allocations</p>}
        </CardContent>
      </Card>

      <div className="flex justify-center"><span className="text-gray-400">↓</span></div>

      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm text-orange-700">Issues ({trace.issues?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2">
          {trace.issues?.length > 0 ? trace.issues.map((i: any) => (
            <p key={i.id} className="text-sm">
              {i.transactionType} — Qty: {parseFloat(i.quantity).toLocaleString()} — {i.referenceType || ""} #{i.referenceId || ""}
            </p>
          )) : <p className="text-xs text-gray-400">No issues</p>}
        </CardContent>
      </Card>

      {trace.transfers?.length > 0 && (
        <>
          <div className="flex justify-center"><span className="text-gray-400">↓</span></div>
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm text-purple-700">Transfers ({trace.transfers.length})</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2">
              {trace.transfers.map((t: any) => (
                <p key={t.id} className="text-sm">
                  WH {t.fromWarehouseId} → WH {t.toWarehouseId} — Qty: {parseFloat(t.quantity).toLocaleString()}
                </p>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Card className="bg-gray-50">
        <CardContent className="p-3">
          <p className="text-xs text-gray-500 font-medium mb-1">Summary</p>
          <div className="flex gap-4 text-sm">
            <span>Original: <strong>{parseFloat(trace.lot?.quantity || "0").toLocaleString()}</strong></span>
            <span>Remaining: <strong>{parseFloat(trace.lot?.remainingQty || "0").toLocaleString()}</strong></span>
            <span>Status: <Badge className={`${STATUS_COLORS[trace.lot?.status] || ""} text-[11px]`}>{trace.lot?.status}</Badge></span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
