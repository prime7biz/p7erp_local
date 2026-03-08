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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Plus, ThumbsUp, Activity, CheckCircle2, AlertTriangle,
  BarChart3, ClipboardList, Factory, Shield,
} from "lucide-react";

export default function SewingPage() {
  const { toast } = useToast();

  const [obDialogOpen, setObDialogOpen] = useState(false);
  const [obForm, setObForm] = useState({ style_id: "" });

  const [lineLoadDialogOpen, setLineLoadDialogOpen] = useState(false);
  const [lineLoadForm, setLineLoadForm] = useState({
    line_id: "", style_id: "", ob_id: "",
    planned_start_date: "", planned_end_date: "",
    target_per_hour: "", target_per_day: "",
    planned_efficiency_pct: "", planned_manpower: "",
  });

  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [inspectionForm, setInspectionForm] = useState({
    line_id: "", bundle_id: "", inspected_qty: "", result: "", remarks: "",
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery<any>({
    queryKey: ["/api/sewing/dashboard"],
    select: (res: any) => res?.data ?? {},
  });

  const { data: obs, isLoading: obsLoading } = useQuery<any>({
    queryKey: ["/api/sewing/obs"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: lineLoads, isLoading: lineLoadsLoading } = useQuery<any>({
    queryKey: ["/api/sewing/line-loads"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: inspections, isLoading: inspectionsLoading } = useQuery<any>({
    queryKey: ["/api/sewing/inspections/inline"],
    select: (res: any) => res?.data ?? [],
  });

  const createObMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/sewing/obs", {
        style_id: Number(obForm.style_id),
      }),
    onSuccess: () => {
      toast({ title: "Operation Bulletin created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/sewing/obs"] });
      setObDialogOpen(false);
      setObForm({ style_id: "" });
    },
    onError: () => toast({ title: "Failed to create OB", variant: "destructive" }),
  });

  const approveObMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/sewing/obs/${id}/approve`),
    onSuccess: () => {
      toast({ title: "OB approved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/sewing/obs"] });
    },
    onError: () => toast({ title: "Failed to approve OB", variant: "destructive" }),
  });

  const createLineLoadMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/sewing/line-loads", {
        line_id: Number(lineLoadForm.line_id),
        style_id: Number(lineLoadForm.style_id),
        ob_id: Number(lineLoadForm.ob_id),
        planned_start_date: lineLoadForm.planned_start_date,
        planned_end_date: lineLoadForm.planned_end_date,
        target_per_hour: Number(lineLoadForm.target_per_hour),
        target_per_day: Number(lineLoadForm.target_per_day),
        planned_efficiency_pct: Number(lineLoadForm.planned_efficiency_pct),
        planned_manpower: Number(lineLoadForm.planned_manpower),
      }),
    onSuccess: () => {
      toast({ title: "Line Load created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/sewing/line-loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sewing/dashboard"] });
      setLineLoadDialogOpen(false);
      setLineLoadForm({
        line_id: "", style_id: "", ob_id: "",
        planned_start_date: "", planned_end_date: "",
        target_per_hour: "", target_per_day: "",
        planned_efficiency_pct: "", planned_manpower: "",
      });
    },
    onError: () => toast({ title: "Failed to create line load", variant: "destructive" }),
  });

  const createInspectionMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/sewing/inspections/inline", {
        line_id: Number(inspectionForm.line_id),
        bundle_id: inspectionForm.bundle_id ? Number(inspectionForm.bundle_id) : undefined,
        inspected_qty: Number(inspectionForm.inspected_qty),
        result: inspectionForm.result,
        remarks: inspectionForm.remarks,
        defects: [],
      }),
    onSuccess: () => {
      toast({ title: "Inspection recorded successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/sewing/inspections/inline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sewing/dashboard"] });
      setInspectionDialogOpen(false);
      setInspectionForm({ line_id: "", bundle_id: "", inspected_qty: "", result: "", remarks: "" });
    },
    onError: () => toast({ title: "Failed to record inspection", variant: "destructive" }),
  });

  const sewingOutput = dashboard?.sewingOutput ?? {};
  const avgDHU = Number(dashboard?.avgDHU ?? 0);

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Sewing Execution</h1>
          <p className="text-muted-foreground">Manage operation bulletins, line loads, and inline quality control</p>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="obs">Operation Bulletins</TabsTrigger>
            <TabsTrigger value="line-loads">Line Loads</TabsTrigger>
            <TabsTrigger value="inline-qc">Inline QC</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            {dashLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Active Line Loads</p>
                        <p className="text-3xl font-bold text-blue-600">{dashboard?.activeLineLoads ?? 0}</p>
                      </div>
                      <Factory className="h-8 w-8 text-blue-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Sewing Output Today</p>
                        <p className="text-3xl font-bold text-green-600">{sewingOutput.total_good ?? 0}</p>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="text-red-500">Reject: {sewingOutput.total_reject ?? 0}</span>
                          <span className="text-amber-500">Rework: {sewingOutput.total_rework ?? 0}</span>
                        </div>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className={`border-l-4 ${avgDHU > 5 ? "border-l-red-500" : "border-l-amber-500"}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Average DHU%</p>
                        <p className={`text-3xl font-bold ${avgDHU > 5 ? "text-red-600" : "text-amber-600"}`}>
                          {avgDHU.toFixed(2)}%
                        </p>
                      </div>
                      <AlertTriangle className={`h-8 w-8 opacity-50 ${avgDHU > 5 ? "text-red-500" : "text-amber-500"}`} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="obs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Operation Bulletins</CardTitle>
                <Dialog open={obDialogOpen} onOpenChange={setObDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create OB</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Operation Bulletin</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Style ID</Label>
                        <Input type="number" placeholder="Style ID" value={obForm.style_id}
                          onChange={(e) => setObForm({ ...obForm, style_id: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createObMutation.isPending}
                        onClick={() => createObMutation.mutate()}>
                        {createObMutation.isPending ? "Creating..." : "Create OB"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {obsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !obs?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No operation bulletins found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Style ID</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total SMV</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {obs.map((ob: any) => (
                        <TableRow key={ob.id}>
                          <TableCell>{ob.id}</TableCell>
                          <TableCell>{ob.style_id || ob.styleId || "-"}</TableCell>
                          <TableCell>{ob.version ?? 1}</TableCell>
                          <TableCell>
                            <Badge className={ob.status === "APPROVED" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                              {ob.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{ob.total_smv || ob.totalSmv || "0.00"}</TableCell>
                          <TableCell>
                            {ob.status === "DRAFT" && (
                              <Button size="sm" variant="outline"
                                disabled={approveObMutation.isPending}
                                onClick={() => approveObMutation.mutate(ob.id)}>
                                <ThumbsUp className="h-3 w-3 mr-1" /> Approve
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="line-loads">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Line Loads</CardTitle>
                <Dialog open={lineLoadDialogOpen} onOpenChange={setLineLoadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Line Load</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Create Line Load</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
                      <div>
                        <Label>Line ID</Label>
                        <Input type="number" placeholder="Line ID" value={lineLoadForm.line_id}
                          onChange={(e) => setLineLoadForm({ ...lineLoadForm, line_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Style ID</Label>
                        <Input type="number" placeholder="Style ID" value={lineLoadForm.style_id}
                          onChange={(e) => setLineLoadForm({ ...lineLoadForm, style_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>OB ID</Label>
                        <Input type="number" placeholder="Operation Bulletin ID" value={lineLoadForm.ob_id}
                          onChange={(e) => setLineLoadForm({ ...lineLoadForm, ob_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Planned Start Date</Label>
                        <Input type="date" value={lineLoadForm.planned_start_date}
                          onChange={(e) => setLineLoadForm({ ...lineLoadForm, planned_start_date: e.target.value })} />
                      </div>
                      <div>
                        <Label>Planned End Date</Label>
                        <Input type="date" value={lineLoadForm.planned_end_date}
                          onChange={(e) => setLineLoadForm({ ...lineLoadForm, planned_end_date: e.target.value })} />
                      </div>
                      <div>
                        <Label>Target / Hour</Label>
                        <Input type="number" placeholder="Target per hour" value={lineLoadForm.target_per_hour}
                          onChange={(e) => setLineLoadForm({ ...lineLoadForm, target_per_hour: e.target.value })} />
                      </div>
                      <div>
                        <Label>Target / Day</Label>
                        <Input type="number" placeholder="Target per day" value={lineLoadForm.target_per_day}
                          onChange={(e) => setLineLoadForm({ ...lineLoadForm, target_per_day: e.target.value })} />
                      </div>
                      <div>
                        <Label>Efficiency %</Label>
                        <Input type="number" placeholder="e.g. 75" value={lineLoadForm.planned_efficiency_pct}
                          onChange={(e) => setLineLoadForm({ ...lineLoadForm, planned_efficiency_pct: e.target.value })} />
                      </div>
                      <div>
                        <Label>Manpower</Label>
                        <Input type="number" placeholder="Planned manpower" value={lineLoadForm.planned_manpower}
                          onChange={(e) => setLineLoadForm({ ...lineLoadForm, planned_manpower: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createLineLoadMutation.isPending}
                        onClick={() => createLineLoadMutation.mutate()}>
                        {createLineLoadMutation.isPending ? "Creating..." : "Create Line Load"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {lineLoadsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !lineLoads?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No line loads found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Line ID</TableHead>
                          <TableHead>Style</TableHead>
                          <TableHead>OB ID</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead>Target/Hour</TableHead>
                          <TableHead>Target/Day</TableHead>
                          <TableHead>Efficiency%</TableHead>
                          <TableHead>Manpower</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineLoads.map((ll: any) => (
                          <TableRow key={ll.id}>
                            <TableCell>{ll.id}</TableCell>
                            <TableCell>{ll.line_id || ll.lineId || "-"}</TableCell>
                            <TableCell>{ll.style_id || ll.styleId || "-"}</TableCell>
                            <TableCell>{ll.ob_id || ll.obId || "-"}</TableCell>
                            <TableCell>{ll.planned_start_date || ll.plannedStartDate || "-"}</TableCell>
                            <TableCell>{ll.planned_end_date || ll.plannedEndDate || "-"}</TableCell>
                            <TableCell>{ll.target_per_hour || ll.targetPerHour || "-"}</TableCell>
                            <TableCell>{ll.target_per_day || ll.targetPerDay || "-"}</TableCell>
                            <TableCell>{ll.planned_efficiency_pct || ll.plannedEfficiencyPct || "-"}%</TableCell>
                            <TableCell>{ll.planned_manpower || ll.plannedManpower || "-"}</TableCell>
                            <TableCell>
                              <Badge className={
                                ll.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                                ll.status === "COMPLETED" ? "bg-blue-100 text-blue-800" :
                                "bg-gray-100 text-gray-800"
                              }>
                                {ll.status || "PLANNED"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inline-qc">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Inline QC Inspections</CardTitle>
                <Dialog open={inspectionDialogOpen} onOpenChange={setInspectionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Inspection</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Inline Inspection</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Line ID</Label>
                        <Input type="number" placeholder="Line ID" value={inspectionForm.line_id}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, line_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Bundle ID (optional)</Label>
                        <Input type="number" placeholder="Bundle ID" value={inspectionForm.bundle_id}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, bundle_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Inspected Qty</Label>
                        <Input type="number" placeholder="Inspected quantity" value={inspectionForm.inspected_qty}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, inspected_qty: e.target.value })} />
                      </div>
                      <div>
                        <Label>Result</Label>
                        <Select value={inspectionForm.result}
                          onValueChange={(v) => setInspectionForm({ ...inspectionForm, result: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select result" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PASS">PASS</SelectItem>
                            <SelectItem value="FAIL">FAIL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Remarks</Label>
                        <Input placeholder="Optional remarks" value={inspectionForm.remarks}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, remarks: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createInspectionMutation.isPending}
                        onClick={() => createInspectionMutation.mutate()}>
                        {createInspectionMutation.isPending ? "Saving..." : "Add Inspection"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {inspectionsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !inspections?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No inline inspections found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Line ID</TableHead>
                        <TableHead>Inspected Qty</TableHead>
                        <TableHead>Defect Qty</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inspections.map((insp: any) => (
                        <TableRow key={insp.id}>
                          <TableCell>{insp.id}</TableCell>
                          <TableCell>{insp.line_id || insp.lineId || "-"}</TableCell>
                          <TableCell>{insp.inspected_qty || insp.inspectedQty || 0}</TableCell>
                          <TableCell>{insp.defect_qty || insp.defectQty || 0}</TableCell>
                          <TableCell>
                            <Badge className={
                              insp.result === "PASS" ? "bg-green-100 text-green-800" :
                              insp.result === "FAIL" ? "bg-red-100 text-red-800" :
                              "bg-gray-100 text-gray-800"
                            }>
                              {insp.result}
                            </Badge>
                          </TableCell>
                          <TableCell>{insp.created_at || insp.createdAt || insp.inspection_date || "-"}</TableCell>
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