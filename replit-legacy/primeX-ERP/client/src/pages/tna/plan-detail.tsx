import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, differenceInDays } from "date-fns";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import Spinner from "@/components/ui/spinner";
import {
  AlertTriangle, Calendar as CalendarIcon, Clock, CheckCircle2,
  XCircle, Pause, Edit, MessageSquare, ArrowLeft, Activity,
} from "lucide-react";
import { useLocation } from "wouter";

const statusBarColors: Record<string, string> = {
  NOT_STARTED: "bg-gray-400",
  IN_PROGRESS: "bg-blue-500",
  DONE: "bg-green-500",
  BLOCKED: "bg-red-500",
  DELAYED: "bg-amber-500",
};

const statusBadgeColors: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  BLOCKED: "bg-red-100 text-red-800",
  DELAYED: "bg-amber-100 text-amber-800",
};

const riskColors: Record<string, string> = {
  LOW: "bg-green-100 text-green-800 border-green-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  HIGH: "bg-red-100 text-red-800 border-red-300",
};

const planStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  ACTIVE: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const statusTransitions: Record<string, string[]> = {
  NOT_STARTED: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["DONE", "BLOCKED", "DELAYED"],
  BLOCKED: ["IN_PROGRESS", "NOT_STARTED"],
  DELAYED: ["IN_PROGRESS", "DONE"],
  DONE: [],
};

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  try { return format(new Date(d), "MMM dd, yyyy"); } catch { return "-"; }
}

export default function TnaPlanDetailPage() {
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const planId = params.id;

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [updateForm, setUpdateForm] = useState({ status: "", actualStart: undefined as Date | undefined, actualEnd: undefined as Date | undefined, remarks: "" });
  const [comment, setComment] = useState("");

  const { data: planRes, isLoading } = useQuery<any>({
    queryKey: ["/api/tna/plans", planId],
    enabled: !!planId,
  });
  const plan = planRes?.data;
  const tasks = plan?.tasks || [];

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data: any }) =>
      apiRequest(`/api/tna/tasks/${taskId}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tna/plans", planId] });
      toast({ title: "Success", description: "Task updated successfully." });
      setShowUpdateModal(false);
      setSelectedTask(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update task.", variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ taskId, comment }: { taskId: number; comment: string }) =>
      apiRequest(`/api/tna/tasks/${taskId}/comment`, "POST", { comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tna/plans", planId] });
      toast({ title: "Success", description: "Comment added." });
      setShowCommentModal(false);
      setComment("");
      setSelectedTask(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add comment.", variant: "destructive" });
    },
  });

  const openUpdateModal = (task: any) => {
    setSelectedTask(task);
    setUpdateForm({
      status: task.status,
      actualStart: task.actualStart ? new Date(task.actualStart) : undefined,
      actualEnd: task.actualEnd ? new Date(task.actualEnd) : undefined,
      remarks: task.remarks || "",
    });
    setShowUpdateModal(true);
  };

  const handleUpdateTask = () => {
    if (!selectedTask) return;
    const data: any = {};
    if (updateForm.status && updateForm.status !== selectedTask.status) data.status = updateForm.status;
    if (updateForm.actualStart) data.actualStart = updateForm.actualStart.toISOString();
    if (updateForm.actualEnd) data.actualEnd = updateForm.actualEnd.toISOString();
    if (updateForm.remarks) data.remarks = updateForm.remarks;
    updateTaskMutation.mutate({ taskId: selectedTask.id, data });
  };

  const handleAddComment = () => {
    if (!selectedTask || !comment.trim()) return;
    addCommentMutation.mutate({ taskId: selectedTask.id, comment: comment.trim() });
  };

  const timelineData = useMemo(() => {
    if (!tasks.length || !plan?.anchorDate) return { tasks: [], minDay: 0, maxDay: 30, totalDays: 30 };

    const anchor = new Date(plan.anchorDate);
    let minDay = 0, maxDay = 30;

    const mapped = tasks.map((t: any) => {
      const startDay = t.plannedStart ? differenceInDays(new Date(t.plannedStart), anchor) : 0;
      const endDay = t.plannedEnd ? differenceInDays(new Date(t.plannedEnd), anchor) : startDay + 1;
      const actualStartDay = t.actualStart ? differenceInDays(new Date(t.actualStart), anchor) : null;
      const actualEndDay = t.actualEnd ? differenceInDays(new Date(t.actualEnd), anchor) : null;
      
      minDay = Math.min(minDay, startDay, actualStartDay ?? startDay);
      maxDay = Math.max(maxDay, endDay, actualEndDay ?? endDay);

      return { ...t, startDay, endDay, actualStartDay, actualEndDay };
    });

    const totalDays = maxDay - minDay + 1;
    return { tasks: mapped, minDay, maxDay, totalDays };
  }, [tasks, plan?.anchorDate]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center p-12">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!plan) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <p className="text-muted-foreground">Plan not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/tna/plans")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Plans
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" className="mb-4" onClick={() => setLocation("/tna/plans")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Plans
        </Button>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold">{plan.planNo || `TNA Plan #${plan.id}`}</h1>
          <Badge variant="outline">{plan.relatedType} #{plan.relatedId}</Badge>
          <Badge className={planStatusColors[plan.status] || "bg-gray-100 text-gray-800"}>
            {plan.status}
          </Badge>
          {plan.riskScore && (
            <Badge className={riskColors[plan.riskScore] || ""}>
              {plan.riskScore === "HIGH" && <AlertTriangle className="h-3 w-3 mr-1" />}
              Risk: {plan.riskScore}
            </Badge>
          )}
          <div className="ml-auto text-sm text-muted-foreground flex items-center gap-1">
            <CalendarIcon className="h-4 w-4" />
            Anchor: {formatDate(plan.anchorDate)}
          </div>
        </div>

        {plan.riskScore && (
          <Card className={`mb-6 border ${plan.riskScore === "HIGH" ? "border-red-300 bg-red-50" : plan.riskScore === "MEDIUM" ? "border-amber-300 bg-amber-50" : "border-green-300 bg-green-50"}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Risk Level</span>
                  <p className="font-semibold">{plan.riskScore}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Tasks</span>
                  <p className="font-semibold">{tasks.length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed</span>
                  <p className="font-semibold">{tasks.filter((t: any) => t.status === "DONE").length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Overdue/Delayed</span>
                  <p className="font-semibold text-red-600">
                    {tasks.filter((t: any) => t.status === "DELAYED" || t.status === "BLOCKED").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Timeline</CardTitle>
            <CardDescription>Visual overview of task schedule</CardDescription>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No tasks in this plan.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  <div className="flex items-center text-xs text-muted-foreground mb-2 px-[200px]">
                    <span>Day {timelineData.minDay}</span>
                    <span className="ml-auto">Day {timelineData.maxDay}</span>
                  </div>
                  <div className="space-y-2">
                    {timelineData.tasks.map((task: any) => {
                      const leftPct = ((task.startDay - timelineData.minDay) / timelineData.totalDays) * 100;
                      const widthPct = Math.max(((task.endDay - task.startDay) / timelineData.totalDays) * 100, 1);
                      
                      let actualLeftPct = 0, actualWidthPct = 0;
                      if (task.actualStartDay !== null) {
                        actualLeftPct = ((task.actualStartDay - timelineData.minDay) / timelineData.totalDays) * 100;
                        const aEnd = task.actualEndDay ?? task.actualStartDay + 1;
                        actualWidthPct = Math.max(((aEnd - task.actualStartDay) / timelineData.totalDays) * 100, 0.5);
                      }

                      return (
                        <div key={task.id} className="flex items-center gap-2">
                          <div className="w-[190px] text-xs truncate flex items-center gap-1 shrink-0">
                            {task.isCritical && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                            <span className={task.isCritical ? "font-semibold" : ""}>{task.name}</span>
                          </div>
                          <div className="flex-1 relative h-8 bg-gray-100 rounded overflow-hidden">
                            <div
                              className={`absolute top-1 h-3 rounded ${statusBarColors[task.status] || "bg-gray-400"} ${task.isCritical ? "ring-1 ring-red-500" : ""}`}
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              title={`Planned: ${formatDate(task.plannedStart)} → ${formatDate(task.plannedEnd)}`}
                            />
                            {task.actualStartDay !== null && (
                              <div
                                className="absolute bottom-1 h-2 rounded bg-indigo-400 opacity-70"
                                style={{ left: `${actualLeftPct}%`, width: `${actualWidthPct}%` }}
                                title={`Actual: ${formatDate(task.actualStart)} → ${formatDate(task.actualEnd)}`}
                              />
                            )}
                          </div>
                          <div className="w-[60px] shrink-0">
                            <Badge className={`text-[10px] px-1 py-0 ${statusBadgeColors[task.status] || ""}`}>
                              {task.status?.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4 px-[200px]">
                    <div className="flex items-center gap-1"><div className="w-3 h-2 bg-gray-400 rounded" /> Planned</div>
                    <div className="flex items-center gap-1"><div className="w-3 h-2 bg-indigo-400 rounded" /> Actual</div>
                    <div className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Critical</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tasks</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Planned Start</TableHead>
                  <TableHead>Planned End</TableHead>
                  <TableHead>Actual Start</TableHead>
                  <TableHead>Actual End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Critical</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No tasks in this plan.
                    </TableCell>
                  </TableRow>
                ) : (
                  tasks.map((task: any) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.name}</TableCell>
                      <TableCell>{task.department || "-"}</TableCell>
                      <TableCell>{formatDate(task.plannedStart)}</TableCell>
                      <TableCell>{formatDate(task.plannedEnd)}</TableCell>
                      <TableCell>{formatDate(task.actualStart)}</TableCell>
                      <TableCell>{formatDate(task.actualEnd)}</TableCell>
                      <TableCell>
                        <Badge className={statusBadgeColors[task.status] || "bg-gray-100 text-gray-800"}>
                          {task.status?.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>{task.assigneeName || task.assignedToUserId || "-"}</TableCell>
                      <TableCell>
                        {task.isCritical ? (
                          <Badge className="bg-red-100 text-red-800">
                            <AlertTriangle className="h-3 w-3 mr-1" /> Yes
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openUpdateModal(task)} title="Update task">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedTask(task); setShowCommentModal(true); }} title="Add comment">
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={showUpdateModal} onOpenChange={setShowUpdateModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Task: {selectedTask?.name}</DialogTitle>
              <DialogDescription>Update task status and actual dates</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Status</Label>
                <Select value={updateForm.status} onValueChange={(v) => setUpdateForm({ ...updateForm, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedTask && (statusTransitions[selectedTask.status] || []).map((s: string) => (
                      <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                    ))}
                    {selectedTask && <SelectItem value={selectedTask.status}>{selectedTask.status.replace("_", " ")} (current)</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Actual Start</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {updateForm.actualStart ? format(updateForm.actualStart, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={updateForm.actualStart} onSelect={(d) => setUpdateForm({ ...updateForm, actualStart: d })} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Actual End</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {updateForm.actualEnd ? format(updateForm.actualEnd, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={updateForm.actualEnd} onSelect={(d) => setUpdateForm({ ...updateForm, actualEnd: d })} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Remarks</Label>
                <Textarea
                  value={updateForm.remarks}
                  onChange={(e) => setUpdateForm({ ...updateForm, remarks: e.target.value })}
                  placeholder="Add remarks..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUpdateModal(false)}>Cancel</Button>
              <Button onClick={handleUpdateTask} disabled={updateTaskMutation.isPending}>
                {updateTaskMutation.isPending ? "Updating..." : "Update Task"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showCommentModal} onOpenChange={setShowCommentModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Comment: {selectedTask?.name}</DialogTitle>
              <DialogDescription>Add a comment to this task</DialogDescription>
            </DialogHeader>
            <div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter your comment..."
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCommentModal(false)}>Cancel</Button>
              <Button onClick={handleAddComment} disabled={addCommentMutation.isPending || !comment.trim()}>
                {addCommentMutation.isPending ? "Adding..." : "Add Comment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
