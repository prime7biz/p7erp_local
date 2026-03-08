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
  ClipboardCheck, TrendingUp, AlertTriangle, AlertCircle,
  Plus, ToggleLeft, Play, CheckCircle2, Edit, Loader2,
} from "lucide-react";

const severityColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const typeColors: Record<string, string> = {
  INLINE: "bg-blue-100 text-blue-800",
  ENDLINE: "bg-amber-100 text-amber-800",
  FINAL: "bg-purple-100 text-purple-800",
};

const resultColors: Record<string, string> = {
  PASS: "bg-green-100 text-green-800",
  FAIL: "bg-red-100 text-red-800",
};

const lotStatusColors: Record<string, string> = {
  PLANNED: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  PASS: "bg-green-100 text-green-800",
  FAIL: "bg-red-100 text-red-800",
};

const caStatusColors: Record<string, string> = {
  OPEN: "bg-red-100 text-red-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  CLOSED: "bg-green-100 text-green-800",
};

export default function QCManagementPage() {
  const { toast } = useToast();

  const [defectDialogOpen, setDefectDialogOpen] = useState(false);
  const [defectForm, setDefectForm] = useState({
    defect_code: "", defect_name: "", process: "", category: "", severity: "",
  });

  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [inspectionForm, setInspectionForm] = useState({
    type: "", department: "", inspected_qty: "", defect_qty: "", result: "", line_id: "", remarks: "",
  });

  const [lotDialogOpen, setLotDialogOpen] = useState(false);
  const [lotForm, setLotForm] = useState({
    lot_no: "", total_qty: "", related_type: "", related_id: "",
  });

  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [resultsLotId, setResultsLotId] = useState<number | null>(null);
  const [resultsForm, setResultsForm] = useState({ found_defects: "" });

  const [caDialogOpen, setCaDialogOpen] = useState(false);
  const [caForm, setCaForm] = useState({
    action_type: "", inspection_id: "", due_date: "", notes: "",
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery<any>({
    queryKey: ["/api/qc/dashboard"],
    select: (res: any) => res?.data ?? {},
  });

  const { data: defects, isLoading: defectsLoading } = useQuery<any>({
    queryKey: ["/api/qc/defects"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: inspections, isLoading: inspectionsLoading } = useQuery<any>({
    queryKey: ["/api/qc/inspections"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: finalLots, isLoading: lotsLoading } = useQuery<any>({
    queryKey: ["/api/qc/final-lots"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: correctiveActions, isLoading: caLoading } = useQuery<any>({
    queryKey: ["/api/qc/corrective-actions"],
    select: (res: any) => res?.data ?? [],
  });

  const createDefectMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/qc/defects", {
        defect_code: defectForm.defect_code,
        defect_name: defectForm.defect_name,
        process: defectForm.process,
        category: defectForm.category,
        severity: defectForm.severity,
      }),
    onSuccess: () => {
      toast({ title: "Defect added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/defects"] });
      setDefectDialogOpen(false);
      setDefectForm({ defect_code: "", defect_name: "", process: "", category: "", severity: "" });
    },
    onError: () => toast({ title: "Failed to add defect", variant: "destructive" }),
  });

  const toggleDefectMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/qc/defects/${id}/toggle`),
    onSuccess: () => {
      toast({ title: "Defect toggled" });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/defects"] });
    },
    onError: () => toast({ title: "Failed to toggle defect", variant: "destructive" }),
  });

  const createInspectionMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/qc/inspections", {
        type: inspectionForm.type,
        department: inspectionForm.department,
        inspected_qty: Number(inspectionForm.inspected_qty),
        defect_qty: Number(inspectionForm.defect_qty),
        result: inspectionForm.result,
        line_id: inspectionForm.line_id ? Number(inspectionForm.line_id) : undefined,
        remarks: inspectionForm.remarks,
      }),
    onSuccess: () => {
      toast({ title: "Inspection added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/inspections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/dashboard"] });
      setInspectionDialogOpen(false);
      setInspectionForm({ type: "", department: "", inspected_qty: "", defect_qty: "", result: "", line_id: "", remarks: "" });
    },
    onError: () => toast({ title: "Failed to add inspection", variant: "destructive" }),
  });

  const createLotMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/qc/final-lots", {
        lot_no: lotForm.lot_no,
        total_qty: Number(lotForm.total_qty),
        related_type: lotForm.related_type,
        related_id: lotForm.related_id ? Number(lotForm.related_id) : undefined,
      }),
    onSuccess: () => {
      toast({ title: "Final lot created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/final-lots"] });
      setLotDialogOpen(false);
      setLotForm({ lot_no: "", total_qty: "", related_type: "", related_id: "" });
    },
    onError: () => toast({ title: "Failed to create lot", variant: "destructive" }),
  });

  const updateResultsMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/qc/final-lots/${resultsLotId}/results`, {
        found_defects: Number(resultsForm.found_defects),
      }),
    onSuccess: () => {
      toast({ title: "Results updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/final-lots"] });
      setResultsDialogOpen(false);
      setResultsLotId(null);
      setResultsForm({ found_defects: "" });
    },
    onError: () => toast({ title: "Failed to update results", variant: "destructive" }),
  });

  const createCaMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/qc/corrective-actions", {
        action_type: caForm.action_type,
        inspection_id: caForm.inspection_id ? Number(caForm.inspection_id) : undefined,
        due_date: caForm.due_date,
        notes: caForm.notes,
      }),
    onSuccess: () => {
      toast({ title: "Corrective action created" });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/corrective-actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/dashboard"] });
      setCaDialogOpen(false);
      setCaForm({ action_type: "", inspection_id: "", due_date: "", notes: "" });
    },
    onError: () => toast({ title: "Failed to create action", variant: "destructive" }),
  });

  const caStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("POST", `/api/qc/corrective-actions/${id}/status`, { status }),
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/corrective-actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/qc/dashboard"] });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">QC Management</h1>
          <p className="text-muted-foreground">Quality control inspections, defects, and corrective actions</p>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="defects">Defect Master</TabsTrigger>
            <TabsTrigger value="inspections">Inspections</TabsTrigger>
            <TabsTrigger value="final-lots">Final Lots</TabsTrigger>
            <TabsTrigger value="corrective-actions">Corrective Actions</TabsTrigger>
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
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Inspections Today</p>
                        <p className="text-3xl font-bold text-blue-600">{dashboard?.inspectionsToday ?? 0}</p>
                      </div>
                      <ClipboardCheck className="h-8 w-8 text-blue-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pass Rate</p>
                        <p className="text-3xl font-bold text-green-600">{dashboard?.passRate ?? 0}%</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Avg DHU</p>
                        <p className="text-3xl font-bold text-amber-600">{dashboard?.avgDHU ?? 0}%</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-amber-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Open Actions</p>
                        <p className="text-3xl font-bold text-red-600">{dashboard?.openCorrectiveActions ?? 0}</p>
                      </div>
                      <AlertCircle className="h-8 w-8 text-red-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="defects">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Defect Master</CardTitle>
                <Dialog open={defectDialogOpen} onOpenChange={setDefectDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Defect</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Defect</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Defect Code</Label>
                        <Input placeholder="e.g. DEF-001" value={defectForm.defect_code}
                          onChange={(e) => setDefectForm({ ...defectForm, defect_code: e.target.value })} />
                      </div>
                      <div>
                        <Label>Defect Name</Label>
                        <Input placeholder="e.g. Broken Stitch" value={defectForm.defect_name}
                          onChange={(e) => setDefectForm({ ...defectForm, defect_name: e.target.value })} />
                      </div>
                      <div>
                        <Label>Process</Label>
                        <Select value={defectForm.process} onValueChange={(v) => setDefectForm({ ...defectForm, process: v })}>
                          <SelectTrigger><SelectValue placeholder="Select process" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CUTTING">CUTTING</SelectItem>
                            <SelectItem value="SEWING">SEWING</SelectItem>
                            <SelectItem value="FINISHING">FINISHING</SelectItem>
                            <SelectItem value="PACKING">PACKING</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Category</Label>
                        <Input placeholder="e.g. Stitching" value={defectForm.category}
                          onChange={(e) => setDefectForm({ ...defectForm, category: e.target.value })} />
                      </div>
                      <div>
                        <Label>Severity</Label>
                        <Select value={defectForm.severity} onValueChange={(v) => setDefectForm({ ...defectForm, severity: v })}>
                          <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LOW">LOW</SelectItem>
                            <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                            <SelectItem value="HIGH">HIGH</SelectItem>
                            <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full" disabled={createDefectMutation.isPending}
                        onClick={() => createDefectMutation.mutate()}>
                        {createDefectMutation.isPending ? "Adding..." : "Add Defect"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {defectsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !defects?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No defects configured.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Process</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {defects.map((defect: any) => (
                        <TableRow key={defect.id}>
                          <TableCell>{defect.id}</TableCell>
                          <TableCell className="font-medium">{defect.defect_code || defect.defectCode || "-"}</TableCell>
                          <TableCell>{defect.defect_name || defect.defectName || "-"}</TableCell>
                          <TableCell>{defect.process || "-"}</TableCell>
                          <TableCell>{defect.category || "-"}</TableCell>
                          <TableCell>
                            <Badge className={severityColors[defect.severity] || "bg-gray-100 text-gray-800"}>
                              {defect.severity}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={defect.active !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                              {defect.active !== false ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline"
                              disabled={toggleDefectMutation.isPending}
                              onClick={() => toggleDefectMutation.mutate(defect.id)}>
                              <ToggleLeft className="h-3 w-3 mr-1" /> Toggle
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inspections">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Inspections</CardTitle>
                <Dialog open={inspectionDialogOpen} onOpenChange={setInspectionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Inspection</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Inspection</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Type</Label>
                        <Select value={inspectionForm.type} onValueChange={(v) => setInspectionForm({ ...inspectionForm, type: v })}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="INLINE">INLINE</SelectItem>
                            <SelectItem value="ENDLINE">ENDLINE</SelectItem>
                            <SelectItem value="FINAL">FINAL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Department</Label>
                        <Input placeholder="e.g. Sewing" value={inspectionForm.department}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, department: e.target.value })} />
                      </div>
                      <div>
                        <Label>Inspected Qty</Label>
                        <Input type="number" placeholder="Inspected quantity" value={inspectionForm.inspected_qty}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, inspected_qty: e.target.value })} />
                      </div>
                      <div>
                        <Label>Defect Qty</Label>
                        <Input type="number" placeholder="Defect quantity" value={inspectionForm.defect_qty}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, defect_qty: e.target.value })} />
                      </div>
                      <div>
                        <Label>Result</Label>
                        <Select value={inspectionForm.result} onValueChange={(v) => setInspectionForm({ ...inspectionForm, result: v })}>
                          <SelectTrigger><SelectValue placeholder="Select result" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PASS">PASS</SelectItem>
                            <SelectItem value="FAIL">FAIL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Line ID</Label>
                        <Input type="number" placeholder="Line ID (optional)" value={inspectionForm.line_id}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, line_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Remarks</Label>
                        <Input placeholder="Optional remarks" value={inspectionForm.remarks}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, remarks: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createInspectionMutation.isPending}
                        onClick={() => createInspectionMutation.mutate()}>
                        {createInspectionMutation.isPending ? "Adding..." : "Add Inspection"}
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
                  <div className="text-center py-8 text-muted-foreground">No inspections found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Department</TableHead>
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
                          <TableCell>
                            <Badge className={typeColors[insp.type] || "bg-gray-100 text-gray-800"}>
                              {insp.type}
                            </Badge>
                          </TableCell>
                          <TableCell>{insp.department || "-"}</TableCell>
                          <TableCell>{insp.inspected_qty || insp.inspectedQty || 0}</TableCell>
                          <TableCell>{insp.defect_qty || insp.defectQty || 0}</TableCell>
                          <TableCell>
                            <Badge className={resultColors[insp.result] || "bg-gray-100 text-gray-800"}>
                              {insp.result}
                            </Badge>
                          </TableCell>
                          <TableCell>{insp.created_at || insp.createdAt ? new Date(insp.created_at || insp.createdAt).toLocaleDateString() : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="final-lots">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Final Lots</CardTitle>
                <Dialog open={lotDialogOpen} onOpenChange={setLotDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Lot</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Final Lot</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Lot No</Label>
                        <Input placeholder="e.g. LOT-001" value={lotForm.lot_no}
                          onChange={(e) => setLotForm({ ...lotForm, lot_no: e.target.value })} />
                      </div>
                      <div>
                        <Label>Total Qty</Label>
                        <Input type="number" placeholder="Total quantity" value={lotForm.total_qty}
                          onChange={(e) => setLotForm({ ...lotForm, total_qty: e.target.value })} />
                      </div>
                      <div>
                        <Label>Related Type</Label>
                        <Input placeholder="e.g. ORDER" value={lotForm.related_type}
                          onChange={(e) => setLotForm({ ...lotForm, related_type: e.target.value })} />
                      </div>
                      <div>
                        <Label>Related ID</Label>
                        <Input type="number" placeholder="Related ID (optional)" value={lotForm.related_id}
                          onChange={(e) => setLotForm({ ...lotForm, related_id: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createLotMutation.isPending}
                        onClick={() => createLotMutation.mutate()}>
                        {createLotMutation.isPending ? "Creating..." : "Create Lot"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {lotsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !finalLots?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No final lots found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Lot No</TableHead>
                        <TableHead>Total Qty</TableHead>
                        <TableHead>Sample Size</TableHead>
                        <TableHead>Allowed</TableHead>
                        <TableHead>Found</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {finalLots.map((lot: any) => (
                        <TableRow key={lot.id}>
                          <TableCell>{lot.id}</TableCell>
                          <TableCell className="font-medium">{lot.lot_no || lot.lotNo || "-"}</TableCell>
                          <TableCell>{lot.total_qty || lot.totalQty || 0}</TableCell>
                          <TableCell>{lot.sample_size || lot.sampleSize || 0}</TableCell>
                          <TableCell>{lot.allowed_defects || lot.allowedDefects || 0}</TableCell>
                          <TableCell>{lot.found_defects || lot.foundDefects || 0}</TableCell>
                          <TableCell>
                            <Badge className={lotStatusColors[lot.status] || "bg-gray-100 text-gray-800"}>
                              {lot.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline"
                              onClick={() => {
                                setResultsLotId(lot.id);
                                setResultsForm({ found_defects: String(lot.found_defects || lot.foundDefects || "") });
                                setResultsDialogOpen(true);
                              }}>
                              <Edit className="h-3 w-3 mr-1" /> Update Results
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Dialog open={resultsDialogOpen} onOpenChange={setResultsDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Update Results</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Found Defects</Label>
                    <Input type="number" placeholder="Number of defects found" value={resultsForm.found_defects}
                      onChange={(e) => setResultsForm({ found_defects: e.target.value })} />
                  </div>
                  <Button className="w-full" disabled={updateResultsMutation.isPending}
                    onClick={() => updateResultsMutation.mutate()}>
                    {updateResultsMutation.isPending ? "Updating..." : "Update Results"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="corrective-actions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Corrective Actions</CardTitle>
                <Dialog open={caDialogOpen} onOpenChange={setCaDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Action</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Corrective Action</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Action Type</Label>
                        <Select value={caForm.action_type} onValueChange={(v) => setCaForm({ ...caForm, action_type: v })}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="REWORK">REWORK</SelectItem>
                            <SelectItem value="REPAIR">REPAIR</SelectItem>
                            <SelectItem value="REPLACE">REPLACE</SelectItem>
                            <SelectItem value="SCRAP">SCRAP</SelectItem>
                            <SelectItem value="OTHER">OTHER</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Inspection ID</Label>
                        <Input type="number" placeholder="Inspection ID (optional)" value={caForm.inspection_id}
                          onChange={(e) => setCaForm({ ...caForm, inspection_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Due Date</Label>
                        <Input type="date" value={caForm.due_date}
                          onChange={(e) => setCaForm({ ...caForm, due_date: e.target.value })} />
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Input placeholder="Description or notes" value={caForm.notes}
                          onChange={(e) => setCaForm({ ...caForm, notes: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createCaMutation.isPending}
                        onClick={() => createCaMutation.mutate()}>
                        {createCaMutation.isPending ? "Creating..." : "Create Action"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {caLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !correctiveActions?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No corrective actions found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Action Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {correctiveActions.map((ca: any) => (
                        <TableRow key={ca.id}>
                          <TableCell>{ca.id}</TableCell>
                          <TableCell className="font-medium">{ca.action_type || ca.actionType || "-"}</TableCell>
                          <TableCell>
                            <Badge className={caStatusColors[ca.status] || "bg-gray-100 text-gray-800"}>
                              {ca.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{ca.due_date || ca.dueDate ? new Date(ca.due_date || ca.dueDate).toLocaleDateString() : "-"}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{ca.notes || "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {ca.status === "OPEN" && (
                                <Button size="sm" variant="outline"
                                  disabled={caStatusMutation.isPending}
                                  onClick={() => caStatusMutation.mutate({ id: ca.id, status: "IN_PROGRESS" })}>
                                  <Play className="h-3 w-3 mr-1" /> Start
                                </Button>
                              )}
                              {ca.status === "IN_PROGRESS" && (
                                <Button size="sm" variant="outline"
                                  disabled={caStatusMutation.isPending}
                                  onClick={() => caStatusMutation.mutate({ id: ca.id, status: "CLOSED" })}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Close
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