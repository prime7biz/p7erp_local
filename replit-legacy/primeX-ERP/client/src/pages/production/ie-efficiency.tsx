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
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Factory, Plus, Loader2, ToggleLeft, Users, Grid3X3, Settings2,
} from "lucide-react";

export default function IEEfficiencyPage() {
  const { toast } = useToast();

  const [opDialogOpen, setOpDialogOpen] = useState(false);
  const [opForm, setOpForm] = useState({
    op_code: "", op_name: "", default_smv: "", machine_type: "", category: "",
  });

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    line_id: "", default_shift_minutes: "", default_efficiency_pct: "", standard_manpower: "",
  });

  const [operatorDialogOpen, setOperatorDialogOpen] = useState(false);
  const [operatorForm, setOperatorForm] = useState({
    name: "", emp_id: "", grade: "", default_line_id: "",
  });

  const { data: operations, isLoading: opsLoading } = useQuery<any>({
    queryKey: ["/api/production/ie/operations"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: lineConfigs, isLoading: configsLoading } = useQuery<any>({
    queryKey: ["/api/production/ie/line-configs"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: operators, isLoading: operatorsLoading } = useQuery<any>({
    queryKey: ["/api/production/ie/operators"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: skillMatrix, isLoading: skillLoading } = useQuery<any>({
    queryKey: ["/api/production/ie/skill-matrix"],
    select: (res: any) => res?.data ?? [],
  });

  const createOpMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/ie/operations", {
        op_code: opForm.op_code,
        op_name: opForm.op_name,
        default_smv: Number(opForm.default_smv),
        machine_type: opForm.machine_type,
        category: opForm.category,
      }),
    onSuccess: () => {
      toast({ title: "Operation added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/ie/operations"] });
      setOpDialogOpen(false);
      setOpForm({ op_code: "", op_name: "", default_smv: "", machine_type: "", category: "" });
    },
    onError: () => toast({ title: "Failed to add operation", variant: "destructive" }),
  });

  const toggleOpMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/production/ie/operations/${id}/toggle`),
    onSuccess: () => {
      toast({ title: "Operation toggled" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/ie/operations"] });
    },
    onError: () => toast({ title: "Failed to toggle operation", variant: "destructive" }),
  });

  const createConfigMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/ie/line-configs", {
        line_id: Number(configForm.line_id),
        default_shift_minutes: Number(configForm.default_shift_minutes),
        default_efficiency_pct: Number(configForm.default_efficiency_pct),
        standard_manpower: Number(configForm.standard_manpower),
      }),
    onSuccess: () => {
      toast({ title: "Line config saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/ie/line-configs"] });
      setConfigDialogOpen(false);
      setConfigForm({ line_id: "", default_shift_minutes: "", default_efficiency_pct: "", standard_manpower: "" });
    },
    onError: () => toast({ title: "Failed to save config", variant: "destructive" }),
  });

  const createOperatorMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/ie/operators", {
        name: operatorForm.name,
        emp_id: operatorForm.emp_id || undefined,
        grade: operatorForm.grade,
        default_line_id: operatorForm.default_line_id ? Number(operatorForm.default_line_id) : undefined,
      }),
    onSuccess: () => {
      toast({ title: "Operator added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/ie/operators"] });
      setOperatorDialogOpen(false);
      setOperatorForm({ name: "", emp_id: "", grade: "", default_line_id: "" });
    },
    onError: () => toast({ title: "Failed to add operator", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">IE & Efficiency</h1>
          <p className="text-muted-foreground">Manage operations, line configs, operators, and skill matrix</p>
        </div>

        <Tabs defaultValue="ie-library">
          <TabsList className="mb-4">
            <TabsTrigger value="ie-library">IE Library</TabsTrigger>
            <TabsTrigger value="line-configs">Line Configs</TabsTrigger>
            <TabsTrigger value="operators">Operators</TabsTrigger>
            <TabsTrigger value="skill-matrix">Skill Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="ie-library">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>IE Library - Operations</CardTitle>
                <Dialog open={opDialogOpen} onOpenChange={setOpDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Operation</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Operation</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Op Code</Label>
                        <Input placeholder="e.g. OP-001" value={opForm.op_code}
                          onChange={(e) => setOpForm({ ...opForm, op_code: e.target.value })} />
                      </div>
                      <div>
                        <Label>Op Name</Label>
                        <Input placeholder="Operation name" value={opForm.op_name}
                          onChange={(e) => setOpForm({ ...opForm, op_name: e.target.value })} />
                      </div>
                      <div>
                        <Label>Default SMV</Label>
                        <Input type="number" step="0.01" placeholder="e.g. 0.5" value={opForm.default_smv}
                          onChange={(e) => setOpForm({ ...opForm, default_smv: e.target.value })} />
                      </div>
                      <div>
                        <Label>Machine Type</Label>
                        <Input placeholder="e.g. SNLS, OL, Flatlock" value={opForm.machine_type}
                          onChange={(e) => setOpForm({ ...opForm, machine_type: e.target.value })} />
                      </div>
                      <div>
                        <Label>Category</Label>
                        <Input placeholder="e.g. Sewing, Finishing" value={opForm.category}
                          onChange={(e) => setOpForm({ ...opForm, category: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createOpMutation.isPending}
                        onClick={() => createOpMutation.mutate()}>
                        {createOpMutation.isPending ? "Adding..." : "Add Operation"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {opsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !operations?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No operations found.</div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Op Code</TableHead>
                          <TableHead>Op Name</TableHead>
                          <TableHead>Default SMV</TableHead>
                          <TableHead>Machine Type</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Active</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {operations.map((op: any) => (
                          <TableRow key={op.id}>
                            <TableCell className="font-medium">{op.op_code || op.opCode}</TableCell>
                            <TableCell>{op.op_name || op.opName}</TableCell>
                            <TableCell>{op.default_smv || op.defaultSmv || "-"}</TableCell>
                            <TableCell>{op.machine_type || op.machineType || "-"}</TableCell>
                            <TableCell>{op.category || "-"}</TableCell>
                            <TableCell>
                              <Badge className={op.is_active !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                                {op.is_active !== false ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline"
                                disabled={toggleOpMutation.isPending}
                                onClick={() => toggleOpMutation.mutate(op.id)}>
                                <ToggleLeft className="h-3 w-3 mr-1" /> Toggle
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="line-configs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Line Configurations</CardTitle>
                <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add/Edit Config</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add / Edit Line Config</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Line ID</Label>
                        <Input type="number" placeholder="Line ID" value={configForm.line_id}
                          onChange={(e) => setConfigForm({ ...configForm, line_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Default Shift Minutes</Label>
                        <Input type="number" placeholder="e.g. 480" value={configForm.default_shift_minutes}
                          onChange={(e) => setConfigForm({ ...configForm, default_shift_minutes: e.target.value })} />
                      </div>
                      <div>
                        <Label>Default Efficiency %</Label>
                        <Input type="number" step="0.1" placeholder="e.g. 75" value={configForm.default_efficiency_pct}
                          onChange={(e) => setConfigForm({ ...configForm, default_efficiency_pct: e.target.value })} />
                      </div>
                      <div>
                        <Label>Standard Manpower</Label>
                        <Input type="number" placeholder="e.g. 30" value={configForm.standard_manpower}
                          onChange={(e) => setConfigForm({ ...configForm, standard_manpower: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createConfigMutation.isPending}
                        onClick={() => createConfigMutation.mutate()}>
                        {createConfigMutation.isPending ? "Saving..." : "Save Config"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {configsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !lineConfigs?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No line configurations found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line ID</TableHead>
                        <TableHead>Line Code</TableHead>
                        <TableHead>Shift Minutes</TableHead>
                        <TableHead>Efficiency%</TableHead>
                        <TableHead>Manpower</TableHead>
                        <TableHead>Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineConfigs.map((cfg: any) => (
                        <TableRow key={cfg.id || cfg.line_id || cfg.lineId}>
                          <TableCell>{cfg.line_id || cfg.lineId}</TableCell>
                          <TableCell className="font-medium">{cfg.line_code || cfg.lineCode || "-"}</TableCell>
                          <TableCell>{cfg.default_shift_minutes || cfg.defaultShiftMinutes || "-"}</TableCell>
                          <TableCell>{cfg.default_efficiency_pct || cfg.defaultEfficiencyPct || "-"}%</TableCell>
                          <TableCell>{cfg.standard_manpower || cfg.standardManpower || "-"}</TableCell>
                          <TableCell>
                            <Badge className={cfg.is_active !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                              {cfg.is_active !== false ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operators">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Operators</CardTitle>
                <Dialog open={operatorDialogOpen} onOpenChange={setOperatorDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Operator</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Operator</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Name</Label>
                        <Input placeholder="Operator name" value={operatorForm.name}
                          onChange={(e) => setOperatorForm({ ...operatorForm, name: e.target.value })} />
                      </div>
                      <div>
                        <Label>Emp ID (optional)</Label>
                        <Input placeholder="Employee ID" value={operatorForm.emp_id}
                          onChange={(e) => setOperatorForm({ ...operatorForm, emp_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Grade</Label>
                        <Select value={operatorForm.grade} onValueChange={(v) => setOperatorForm({ ...operatorForm, grade: v })}>
                          <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">A</SelectItem>
                            <SelectItem value="B">B</SelectItem>
                            <SelectItem value="C">C</SelectItem>
                            <SelectItem value="D">D</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Default Line ID</Label>
                        <Input type="number" placeholder="Line ID" value={operatorForm.default_line_id}
                          onChange={(e) => setOperatorForm({ ...operatorForm, default_line_id: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createOperatorMutation.isPending}
                        onClick={() => createOperatorMutation.mutate()}>
                        {createOperatorMutation.isPending ? "Adding..." : "Add Operator"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {operatorsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !operators?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No operators found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Emp ID</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Default Line</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operators.map((op: any) => (
                        <TableRow key={op.id}>
                          <TableCell>{op.id}</TableCell>
                          <TableCell className="font-medium">{op.name}</TableCell>
                          <TableCell>{op.emp_id || op.empId || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{op.grade || "-"}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={op.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                              {op.status || "ACTIVE"}
                            </Badge>
                          </TableCell>
                          <TableCell>{op.default_line_id || op.defaultLineId || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skill-matrix">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Grid3X3 className="h-5 w-5" /> Skill Matrix
                </CardTitle>
              </CardHeader>
              <CardContent>
                {skillLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !skillMatrix?.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Grid3X3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">No skill data yet</p>
                    <p className="text-sm">Add operators and operations first, then assign skills.</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Operator</TableHead>
                          <TableHead>Operation</TableHead>
                          <TableHead>Skill Level</TableHead>
                          <TableHead>SMV</TableHead>
                          <TableHead>Assessed Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {skillMatrix.map((entry: any, idx: number) => (
                          <TableRow key={entry.id || idx}>
                            <TableCell className="font-medium">{entry.operator_name || entry.operatorName || entry.operator_id || "-"}</TableCell>
                            <TableCell>{entry.operation_name || entry.operationName || entry.operation_id || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{entry.skill_level || entry.skillLevel || "-"}</Badge>
                            </TableCell>
                            <TableCell>{entry.smv || entry.assessed_smv || "-"}</TableCell>
                            <TableCell>{entry.assessed_at || entry.assessedAt || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}