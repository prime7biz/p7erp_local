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
  ClipboardList, CheckCircle2, XCircle, Factory,
  Plus, Play, Lock, ThumbsUp, Loader2,
} from "lucide-react";

const planStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  APPROVED: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  CLOSED: "bg-amber-100 text-amber-800",
};

export default function ProductionPlanningPage() {
  const { toast } = useToast();

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    plan_date: "", style_id: "", planned_qty: "", target_qty: "", notes: "",
  });

  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [lineForm, setLineForm] = useState({
    line_code: "", floor: "", capacity_operators: "", default_shift_hours: "",
  });

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    name: "", start_time: "", end_time: "", break_minutes: "",
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery<any>({
    queryKey: ["/api/production/factory/dashboard"],
    select: (res: any) => res?.data ?? {},
  });

  const { data: plans, isLoading: plansLoading } = useQuery<any>({
    queryKey: ["/api/production/factory"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: lines, isLoading: linesLoading } = useQuery<any>({
    queryKey: ["/api/production/factory/lines/all"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: shifts, isLoading: shiftsLoading } = useQuery<any>({
    queryKey: ["/api/production/factory/shifts/all"],
    select: (res: any) => res?.data ?? [],
  });

  const createPlanMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/factory", {
        plan_date: planForm.plan_date,
        style_id: Number(planForm.style_id),
        planned_qty: Number(planForm.planned_qty),
        target_qty: Number(planForm.target_qty),
        notes: planForm.notes,
      }),
    onSuccess: () => {
      toast({ title: "Plan created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/factory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/factory/dashboard"] });
      setPlanDialogOpen(false);
      setPlanForm({ plan_date: "", style_id: "", planned_qty: "", target_qty: "", notes: "" });
    },
    onError: () => toast({ title: "Failed to create plan", variant: "destructive" }),
  });

  const planActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiRequest("POST", `/api/production/factory/${id}/${action}`),
    onSuccess: () => {
      toast({ title: "Plan updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/factory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/factory/dashboard"] });
    },
    onError: () => toast({ title: "Failed to update plan", variant: "destructive" }),
  });

  const createLineMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/factory/lines", {
        line_code: lineForm.line_code,
        floor: lineForm.floor,
        capacity_operators: Number(lineForm.capacity_operators),
        default_shift_hours: Number(lineForm.default_shift_hours),
      }),
    onSuccess: () => {
      toast({ title: "Line added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/factory/lines/all"] });
      setLineDialogOpen(false);
      setLineForm({ line_code: "", floor: "", capacity_operators: "", default_shift_hours: "" });
    },
    onError: () => toast({ title: "Failed to add line", variant: "destructive" }),
  });

  const createShiftMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/factory/shifts", {
        name: shiftForm.name,
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
        break_minutes: Number(shiftForm.break_minutes),
      }),
    onSuccess: () => {
      toast({ title: "Shift added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/factory/shifts/all"] });
      setShiftDialogOpen(false);
      setShiftForm({ name: "", start_time: "", end_time: "", break_minutes: "" });
    },
    onError: () => toast({ title: "Failed to add shift", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Production Planning</h1>
          <p className="text-muted-foreground">Manage production plans, sewing lines, and shifts</p>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="plans">Production Plans</TabsTrigger>
            <TabsTrigger value="lines">Sewing Lines</TabsTrigger>
            <TabsTrigger value="shifts">Shifts</TabsTrigger>
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
                        <p className="text-sm text-muted-foreground">Active Plans</p>
                        <p className="text-3xl font-bold text-blue-600">{dashboard?.activePlans ?? 0}</p>
                      </div>
                      <ClipboardList className="h-8 w-8 text-blue-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Good Output Today</p>
                        <p className="text-3xl font-bold text-green-600">{dashboard?.totalGoodToday ?? 0}</p>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Reject Today</p>
                        <p className="text-3xl font-bold text-red-600">{dashboard?.totalRejectToday ?? 0}</p>
                      </div>
                      <XCircle className="h-8 w-8 text-red-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Active Lines</p>
                        <p className="text-3xl font-bold text-purple-600">{dashboard?.activeLines ?? 0}</p>
                      </div>
                      <Factory className="h-8 w-8 text-purple-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="plans">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Production Plans</CardTitle>
                <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Plan</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Production Plan</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Plan Date</Label>
                        <Input type="date" value={planForm.plan_date}
                          onChange={(e) => setPlanForm({ ...planForm, plan_date: e.target.value })} />
                      </div>
                      <div>
                        <Label>Style ID</Label>
                        <Input type="number" placeholder="Style ID" value={planForm.style_id}
                          onChange={(e) => setPlanForm({ ...planForm, style_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Planned Qty</Label>
                        <Input type="number" placeholder="Planned quantity" value={planForm.planned_qty}
                          onChange={(e) => setPlanForm({ ...planForm, planned_qty: e.target.value })} />
                      </div>
                      <div>
                        <Label>Target Qty</Label>
                        <Input type="number" placeholder="Target quantity" value={planForm.target_qty}
                          onChange={(e) => setPlanForm({ ...planForm, target_qty: e.target.value })} />
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Input placeholder="Optional notes" value={planForm.notes}
                          onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createPlanMutation.isPending}
                        onClick={() => createPlanMutation.mutate()}>
                        {createPlanMutation.isPending ? "Creating..." : "Create Plan"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {plansLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !plans?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No production plans found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Plan Date</TableHead>
                        <TableHead>Style</TableHead>
                        <TableHead>Planned Qty</TableHead>
                        <TableHead>Target Qty</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plans.map((plan: any) => (
                        <TableRow key={plan.id}>
                          <TableCell>{plan.id}</TableCell>
                          <TableCell>{plan.plan_date || plan.planDate || "-"}</TableCell>
                          <TableCell>{plan.style_id || plan.styleId || "-"}</TableCell>
                          <TableCell>{Number(plan.planned_qty || plan.plannedQty || 0).toLocaleString()}</TableCell>
                          <TableCell>{Number(plan.target_qty || plan.targetQty || 0).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge className={planStatusColors[plan.status] || "bg-gray-100 text-gray-800"}>
                              {plan.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {plan.status === "DRAFT" && (
                                <Button size="sm" variant="outline"
                                  disabled={planActionMutation.isPending}
                                  onClick={() => planActionMutation.mutate({ id: plan.id, action: "approve" })}>
                                  <ThumbsUp className="h-3 w-3 mr-1" /> Approve
                                </Button>
                              )}
                              {plan.status === "APPROVED" && (
                                <Button size="sm" variant="outline"
                                  disabled={planActionMutation.isPending}
                                  onClick={() => planActionMutation.mutate({ id: plan.id, action: "activate" })}>
                                  <Play className="h-3 w-3 mr-1" /> Activate
                                </Button>
                              )}
                              {plan.status === "ACTIVE" && (
                                <Button size="sm" variant="outline"
                                  disabled={planActionMutation.isPending}
                                  onClick={() => planActionMutation.mutate({ id: plan.id, action: "close" })}>
                                  <Lock className="h-3 w-3 mr-1" /> Close
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

          <TabsContent value="lines">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Sewing Lines</CardTitle>
                <Dialog open={lineDialogOpen} onOpenChange={setLineDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Line</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Sewing Line</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Line Code</Label>
                        <Input placeholder="e.g. L-01" value={lineForm.line_code}
                          onChange={(e) => setLineForm({ ...lineForm, line_code: e.target.value })} />
                      </div>
                      <div>
                        <Label>Floor</Label>
                        <Input placeholder="e.g. 2nd Floor" value={lineForm.floor}
                          onChange={(e) => setLineForm({ ...lineForm, floor: e.target.value })} />
                      </div>
                      <div>
                        <Label>Capacity (Operators)</Label>
                        <Input type="number" placeholder="Number of operators" value={lineForm.capacity_operators}
                          onChange={(e) => setLineForm({ ...lineForm, capacity_operators: e.target.value })} />
                      </div>
                      <div>
                        <Label>Default Shift Hours</Label>
                        <Input type="number" placeholder="e.g. 8" value={lineForm.default_shift_hours}
                          onChange={(e) => setLineForm({ ...lineForm, default_shift_hours: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createLineMutation.isPending}
                        onClick={() => createLineMutation.mutate()}>
                        {createLineMutation.isPending ? "Adding..." : "Add Line"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {linesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !lines?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No sewing lines configured.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line Code</TableHead>
                        <TableHead>Floor</TableHead>
                        <TableHead>Capacity</TableHead>
                        <TableHead>Shift Hours</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line: any) => (
                        <TableRow key={line.id || line.line_code || line.lineCode}>
                          <TableCell className="font-medium">{line.line_code || line.lineCode}</TableCell>
                          <TableCell>{line.floor || "-"}</TableCell>
                          <TableCell>{line.capacity_operators || line.capacityOperators || "-"}</TableCell>
                          <TableCell>{line.default_shift_hours || line.defaultShiftHours || "-"}</TableCell>
                          <TableCell>
                            <Badge className={line.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                              {line.status || "ACTIVE"}
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

          <TabsContent value="shifts">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Shifts</CardTitle>
                <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Shift</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Shift</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Name</Label>
                        <Input placeholder="e.g. Morning Shift" value={shiftForm.name}
                          onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} />
                      </div>
                      <div>
                        <Label>Start Time</Label>
                        <Input type="time" value={shiftForm.start_time}
                          onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })} />
                      </div>
                      <div>
                        <Label>End Time</Label>
                        <Input type="time" value={shiftForm.end_time}
                          onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })} />
                      </div>
                      <div>
                        <Label>Break Minutes</Label>
                        <Input type="number" placeholder="e.g. 60" value={shiftForm.break_minutes}
                          onChange={(e) => setShiftForm({ ...shiftForm, break_minutes: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createShiftMutation.isPending}
                        onClick={() => createShiftMutation.mutate()}>
                        {createShiftMutation.isPending ? "Adding..." : "Add Shift"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {shiftsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !shifts?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No shifts configured.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Start Time</TableHead>
                        <TableHead>End Time</TableHead>
                        <TableHead>Break Minutes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shifts.map((shift: any) => (
                        <TableRow key={shift.id || shift.name}>
                          <TableCell className="font-medium">{shift.name}</TableCell>
                          <TableCell>{shift.start_time || shift.startTime || "-"}</TableCell>
                          <TableCell>{shift.end_time || shift.endTime || "-"}</TableCell>
                          <TableCell>{shift.break_minutes || shift.breakMinutes || "-"}</TableCell>
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