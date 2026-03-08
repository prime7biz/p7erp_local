import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Box, ClipboardList, FileText,
  Plus, Play, CheckCircle2, Lock, Unlock, Loader2,
} from "lucide-react";

const batchStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  ACTIVE: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
};

const cartonStatusColors: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  SEALED: "bg-green-100 text-green-800",
};

const plStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  ISSUED: "bg-green-100 text-green-800",
};

export default function FinishingPackingPage() {
  const { toast } = useToast();

  const [finishingDialogOpen, setFinishingDialogOpen] = useState(false);
  const [finishingForm, setFinishingForm] = useState({
    batch_no: "", production_plan_id: "", style_id: "",
  });

  const [packingDialogOpen, setPackingDialogOpen] = useState(false);
  const [packingForm, setPackingForm] = useState({
    batch_no: "", production_plan_id: "", style_id: "",
  });

  const [cartonDialogOpen, setCartonDialogOpen] = useState(false);
  const [cartonForm, setCartonForm] = useState({
    carton_no: "", packing_batch_id: "", gross_weight: "", net_weight: "", cbm: "",
  });

  const [plDialogOpen, setPlDialogOpen] = useState(false);
  const [plForm, setPlForm] = useState({
    packing_list_no: "", sales_order_id: "",
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery<any>({
    queryKey: ["/api/production/finishing-packing/dashboard"],
    select: (res: any) => res?.data ?? {},
  });

  const { data: finishing, isLoading: finishingLoading } = useQuery<any>({
    queryKey: ["/api/production/finishing-packing/finishing-batches"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: packing, isLoading: packingLoading } = useQuery<any>({
    queryKey: ["/api/production/finishing-packing/packing-batches"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: cartons, isLoading: cartonsLoading } = useQuery<any>({
    queryKey: ["/api/production/finishing-packing/cartons"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: packingLists, isLoading: plLoading } = useQuery<any>({
    queryKey: ["/api/production/finishing-packing/packing-lists"],
    select: (res: any) => res?.data ?? [],
  });

  const createFinishingMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/finishing-packing/finishing-batches", {
        batch_no: finishingForm.batch_no,
        production_plan_id: Number(finishingForm.production_plan_id),
        style_id: Number(finishingForm.style_id),
      }),
    onSuccess: () => {
      toast({ title: "Finishing batch created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/finishing-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/dashboard"] });
      setFinishingDialogOpen(false);
      setFinishingForm({ batch_no: "", production_plan_id: "", style_id: "" });
    },
    onError: () => toast({ title: "Failed to create finishing batch", variant: "destructive" }),
  });

  const finishingActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiRequest("POST", `/api/production/finishing-packing/finishing-batches/${id}/${action}`),
    onSuccess: () => {
      toast({ title: "Finishing batch updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/finishing-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/dashboard"] });
    },
    onError: () => toast({ title: "Failed to update batch", variant: "destructive" }),
  });

  const createPackingMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/finishing-packing/packing-batches", {
        batch_no: packingForm.batch_no,
        production_plan_id: Number(packingForm.production_plan_id),
        style_id: Number(packingForm.style_id),
      }),
    onSuccess: () => {
      toast({ title: "Packing batch created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/packing-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/dashboard"] });
      setPackingDialogOpen(false);
      setPackingForm({ batch_no: "", production_plan_id: "", style_id: "" });
    },
    onError: () => toast({ title: "Failed to create packing batch", variant: "destructive" }),
  });

  const packingActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiRequest("POST", `/api/production/finishing-packing/packing-batches/${id}/${action}`),
    onSuccess: () => {
      toast({ title: "Packing batch updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/packing-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/dashboard"] });
    },
    onError: () => toast({ title: "Failed to update batch", variant: "destructive" }),
  });

  const createCartonMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/finishing-packing/cartons", {
        carton_no: cartonForm.carton_no,
        packing_batch_id: Number(cartonForm.packing_batch_id),
        gross_weight: Number(cartonForm.gross_weight),
        net_weight: Number(cartonForm.net_weight),
        cbm: Number(cartonForm.cbm),
      }),
    onSuccess: () => {
      toast({ title: "Carton created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/cartons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/dashboard"] });
      setCartonDialogOpen(false);
      setCartonForm({ carton_no: "", packing_batch_id: "", gross_weight: "", net_weight: "", cbm: "" });
    },
    onError: () => toast({ title: "Failed to create carton", variant: "destructive" }),
  });

  const cartonActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiRequest("POST", `/api/production/finishing-packing/cartons/${id}/${action}`),
    onSuccess: () => {
      toast({ title: "Carton updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/cartons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/dashboard"] });
    },
    onError: () => toast({ title: "Failed to update carton", variant: "destructive" }),
  });

  const createPlMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/finishing-packing/packing-lists", {
        packing_list_no: plForm.packing_list_no,
        sales_order_id: Number(plForm.sales_order_id),
      }),
    onSuccess: () => {
      toast({ title: "Packing list created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/packing-lists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/dashboard"] });
      setPlDialogOpen(false);
      setPlForm({ packing_list_no: "", sales_order_id: "" });
    },
    onError: () => toast({ title: "Failed to create packing list", variant: "destructive" }),
  });

  const plActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiRequest("POST", `/api/production/finishing-packing/packing-lists/${id}/${action}`),
    onSuccess: () => {
      toast({ title: "Packing list updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/packing-lists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/finishing-packing/dashboard"] });
    },
    onError: () => toast({ title: "Failed to update packing list", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Finishing & Packing</h1>
          <p className="text-muted-foreground">Manage finishing batches, packing, cartons, and packing lists</p>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="finishing">Finishing Batches</TabsTrigger>
            <TabsTrigger value="packing">Packing Batches</TabsTrigger>
            <TabsTrigger value="cartons">Cartons</TabsTrigger>
            <TabsTrigger value="packing-lists">Packing Lists</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            {dashLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Finishing Output Today</p>
                      <div className="mt-2 space-y-1">
                        <p className="text-2xl font-bold text-green-600">{typeof dashboard?.finishingOutputToday === "object" ? dashboard?.finishingOutputToday?.good ?? 0 : dashboard?.finishingOutputToday ?? 0}</p>
                        {typeof dashboard?.finishingOutputToday === "object" && (
                          <div className="text-xs text-muted-foreground">
                            <p>Good: {dashboard?.finishingOutputToday?.good ?? 0}</p>
                            <p>Rework: {dashboard?.finishingOutputToday?.rework ?? 0}</p>
                            <p>Reject: {dashboard?.finishingOutputToday?.reject ?? 0}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <Package className="h-8 w-8 text-blue-500 opacity-50 mt-2" />
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Packing Output Today</p>
                      <div className="mt-2 space-y-1">
                        <p className="text-2xl font-bold text-green-600">{typeof dashboard?.packingOutputToday === "object" ? dashboard?.packingOutputToday?.packed ?? 0 : dashboard?.packingOutputToday ?? 0}</p>
                        {typeof dashboard?.packingOutputToday === "object" && (
                          <div className="text-xs text-muted-foreground">
                            <p>Packed: {dashboard?.packingOutputToday?.packed ?? 0}</p>
                            <p>Rework: {dashboard?.packingOutputToday?.rework ?? 0}</p>
                            <p>Rejected: {dashboard?.packingOutputToday?.rejected ?? 0}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <Box className="h-8 w-8 text-green-500 opacity-50 mt-2" />
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Cartons Sealed Today</p>
                        <p className="text-3xl font-bold text-amber-600">{dashboard?.cartonsSealedToday ?? 0}</p>
                      </div>
                      <ClipboardList className="h-8 w-8 text-amber-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Packing Lists Issued</p>
                        <p className="text-3xl font-bold text-purple-600">{dashboard?.packingListsIssuedToday ?? 0}</p>
                      </div>
                      <FileText className="h-8 w-8 text-purple-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="finishing">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Finishing Batches</CardTitle>
                <Dialog open={finishingDialogOpen} onOpenChange={setFinishingDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Batch</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Finishing Batch</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Batch No</Label>
                        <Input placeholder="e.g. FB-001" value={finishingForm.batch_no}
                          onChange={(e) => setFinishingForm({ ...finishingForm, batch_no: e.target.value })} />
                      </div>
                      <div>
                        <Label>Production Plan ID</Label>
                        <Input type="number" placeholder="Plan ID" value={finishingForm.production_plan_id}
                          onChange={(e) => setFinishingForm({ ...finishingForm, production_plan_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Style ID</Label>
                        <Input type="number" placeholder="Style ID" value={finishingForm.style_id}
                          onChange={(e) => setFinishingForm({ ...finishingForm, style_id: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createFinishingMutation.isPending}
                        onClick={() => createFinishingMutation.mutate()}>
                        {createFinishingMutation.isPending ? "Creating..." : "Create Batch"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {finishingLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !finishing?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No finishing batches found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Batch No</TableHead>
                        <TableHead>Plan ID</TableHead>
                        <TableHead>Style ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {finishing.map((batch: any) => (
                        <TableRow key={batch.id}>
                          <TableCell>{batch.id}</TableCell>
                          <TableCell className="font-medium">{batch.batch_no || batch.batchNo || "-"}</TableCell>
                          <TableCell>{batch.production_plan_id || batch.productionPlanId || "-"}</TableCell>
                          <TableCell>{batch.style_id || batch.styleId || "-"}</TableCell>
                          <TableCell>
                            <Badge className={batchStatusColors[batch.status] || "bg-gray-100 text-gray-800"}>
                              {batch.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{batch.created_at || batch.createdAt ? new Date(batch.created_at || batch.createdAt).toLocaleDateString() : "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {batch.status === "DRAFT" && (
                                <Button size="sm" variant="outline"
                                  disabled={finishingActionMutation.isPending}
                                  onClick={() => finishingActionMutation.mutate({ id: batch.id, action: "activate" })}>
                                  <Play className="h-3 w-3 mr-1" /> Activate
                                </Button>
                              )}
                              {batch.status === "ACTIVE" && (
                                <Button size="sm" variant="outline"
                                  disabled={finishingActionMutation.isPending}
                                  onClick={() => finishingActionMutation.mutate({ id: batch.id, action: "complete" })}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="packing">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Packing Batches</CardTitle>
                <Dialog open={packingDialogOpen} onOpenChange={setPackingDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Batch</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Packing Batch</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Batch No</Label>
                        <Input placeholder="e.g. PB-001" value={packingForm.batch_no}
                          onChange={(e) => setPackingForm({ ...packingForm, batch_no: e.target.value })} />
                      </div>
                      <div>
                        <Label>Production Plan ID</Label>
                        <Input type="number" placeholder="Plan ID" value={packingForm.production_plan_id}
                          onChange={(e) => setPackingForm({ ...packingForm, production_plan_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Style ID</Label>
                        <Input type="number" placeholder="Style ID" value={packingForm.style_id}
                          onChange={(e) => setPackingForm({ ...packingForm, style_id: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createPackingMutation.isPending}
                        onClick={() => createPackingMutation.mutate()}>
                        {createPackingMutation.isPending ? "Creating..." : "Create Batch"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {packingLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !packing?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No packing batches found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Batch No</TableHead>
                        <TableHead>Plan ID</TableHead>
                        <TableHead>Style ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packing.map((batch: any) => (
                        <TableRow key={batch.id}>
                          <TableCell>{batch.id}</TableCell>
                          <TableCell className="font-medium">{batch.batch_no || batch.batchNo || "-"}</TableCell>
                          <TableCell>{batch.production_plan_id || batch.productionPlanId || "-"}</TableCell>
                          <TableCell>{batch.style_id || batch.styleId || "-"}</TableCell>
                          <TableCell>
                            <Badge className={batchStatusColors[batch.status] || "bg-gray-100 text-gray-800"}>
                              {batch.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{batch.created_at || batch.createdAt ? new Date(batch.created_at || batch.createdAt).toLocaleDateString() : "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {batch.status === "DRAFT" && (
                                <Button size="sm" variant="outline"
                                  disabled={packingActionMutation.isPending}
                                  onClick={() => packingActionMutation.mutate({ id: batch.id, action: "activate" })}>
                                  <Play className="h-3 w-3 mr-1" /> Activate
                                </Button>
                              )}
                              {batch.status === "ACTIVE" && (
                                <Button size="sm" variant="outline"
                                  disabled={packingActionMutation.isPending}
                                  onClick={() => packingActionMutation.mutate({ id: batch.id, action: "complete" })}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cartons">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Cartons</CardTitle>
                <Dialog open={cartonDialogOpen} onOpenChange={setCartonDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Carton</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Carton</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Carton No</Label>
                        <Input placeholder="e.g. CTN-001" value={cartonForm.carton_no}
                          onChange={(e) => setCartonForm({ ...cartonForm, carton_no: e.target.value })} />
                      </div>
                      <div>
                        <Label>Packing Batch ID</Label>
                        <Input type="number" placeholder="Packing Batch ID" value={cartonForm.packing_batch_id}
                          onChange={(e) => setCartonForm({ ...cartonForm, packing_batch_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Gross Weight</Label>
                        <Input type="number" step="0.01" placeholder="Gross weight (kg)" value={cartonForm.gross_weight}
                          onChange={(e) => setCartonForm({ ...cartonForm, gross_weight: e.target.value })} />
                      </div>
                      <div>
                        <Label>Net Weight</Label>
                        <Input type="number" step="0.01" placeholder="Net weight (kg)" value={cartonForm.net_weight}
                          onChange={(e) => setCartonForm({ ...cartonForm, net_weight: e.target.value })} />
                      </div>
                      <div>
                        <Label>CBM</Label>
                        <Input type="number" step="0.001" placeholder="Cubic meters" value={cartonForm.cbm}
                          onChange={(e) => setCartonForm({ ...cartonForm, cbm: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createCartonMutation.isPending}
                        onClick={() => createCartonMutation.mutate()}>
                        {createCartonMutation.isPending ? "Creating..." : "Create Carton"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {cartonsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !cartons?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No cartons found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Carton No</TableHead>
                        <TableHead>Gross Wt</TableHead>
                        <TableHead>Net Wt</TableHead>
                        <TableHead>CBM</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartons.map((carton: any) => (
                        <TableRow key={carton.id}>
                          <TableCell>{carton.id}</TableCell>
                          <TableCell className="font-medium">{carton.carton_no || carton.cartonNo || "-"}</TableCell>
                          <TableCell>{carton.gross_weight || carton.grossWeight || "-"}</TableCell>
                          <TableCell>{carton.net_weight || carton.netWeight || "-"}</TableCell>
                          <TableCell>{carton.cbm || "-"}</TableCell>
                          <TableCell>
                            <Badge className={cartonStatusColors[carton.status] || "bg-gray-100 text-gray-800"}>
                              {carton.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {carton.status === "OPEN" && (
                                <Button size="sm" variant="outline"
                                  disabled={cartonActionMutation.isPending}
                                  onClick={() => cartonActionMutation.mutate({ id: carton.id, action: "seal" })}>
                                  <Lock className="h-3 w-3 mr-1" /> Seal
                                </Button>
                              )}
                              {carton.status === "SEALED" && (
                                <Button size="sm" variant="outline"
                                  disabled={cartonActionMutation.isPending}
                                  onClick={() => cartonActionMutation.mutate({ id: carton.id, action: "reopen" })}>
                                  <Unlock className="h-3 w-3 mr-1" /> Reopen
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="packing-lists">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Packing Lists</CardTitle>
                <Dialog open={plDialogOpen} onOpenChange={setPlDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create PL</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Packing List</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Packing List No</Label>
                        <Input placeholder="e.g. PL-001" value={plForm.packing_list_no}
                          onChange={(e) => setPlForm({ ...plForm, packing_list_no: e.target.value })} />
                      </div>
                      <div>
                        <Label>Sales Order ID</Label>
                        <Input type="number" placeholder="Sales Order ID" value={plForm.sales_order_id}
                          onChange={(e) => setPlForm({ ...plForm, sales_order_id: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createPlMutation.isPending}
                        onClick={() => createPlMutation.mutate()}>
                        {createPlMutation.isPending ? "Creating..." : "Create Packing List"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {plLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !packingLists?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No packing lists found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>PL No</TableHead>
                        <TableHead>Sales Order</TableHead>
                        <TableHead>Total Cartons</TableHead>
                        <TableHead>Total Qty</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packingLists.map((pl: any) => (
                        <TableRow key={pl.id}>
                          <TableCell>{pl.id}</TableCell>
                          <TableCell className="font-medium">{pl.packing_list_no || pl.packingListNo || "-"}</TableCell>
                          <TableCell>{pl.sales_order_id || pl.salesOrderId || "-"}</TableCell>
                          <TableCell>{pl.total_cartons || pl.totalCartons || 0}</TableCell>
                          <TableCell>{pl.total_qty || pl.totalQty || 0}</TableCell>
                          <TableCell>
                            <Badge className={plStatusColors[pl.status] || "bg-gray-100 text-gray-800"}>
                              {pl.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {pl.status === "DRAFT" && (
                                <Button size="sm" variant="outline"
                                  disabled={plActionMutation.isPending}
                                  onClick={() => plActionMutation.mutate({ id: pl.id, action: "issue" })}>
                                  <FileText className="h-3 w-3 mr-1" /> Issue
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}