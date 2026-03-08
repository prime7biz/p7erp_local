import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Spinner from "@/components/ui/spinner";
import {
  ClipboardList, Activity, AlertTriangle, Clock, CalendarClock,
} from "lucide-react";

const statusBadgeColors: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  BLOCKED: "bg-red-100 text-red-800",
  DELAYED: "bg-amber-100 text-amber-800",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  try { return format(new Date(d), "MMM dd, yyyy"); } catch { return "-"; }
}

export default function TnaDashboardPage() {
  const [, setLocation] = useLocation();

  const { data: summaryRes, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/tna/dashboard/summary"],
  });
  const summary = summaryRes?.data;

  const { data: upcomingRes, isLoading: upcomingLoading } = useQuery<any>({
    queryKey: ["/api/tna/dashboard/upcoming?days=7"],
  });
  const upcomingTasks = upcomingRes?.data || [];

  const { data: overdueRes, isLoading: overdueLoading } = useQuery<any>({
    queryKey: ["/api/tna/dashboard/overdue"],
  });
  const overdueTasks = overdueRes?.data || [];

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">TNA Dashboard</h1>
          <p className="text-muted-foreground">Overview of Time & Action plans and tasks</p>
        </div>

        {summaryLoading ? (
          <div className="flex justify-center p-8"><Spinner size="lg" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Plans</p>
                    <p className="text-3xl font-bold text-blue-600">{summary?.totalPlans || 0}</p>
                  </div>
                  <ClipboardList className="h-8 w-8 text-blue-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Plans</p>
                    <p className="text-3xl font-bold text-green-600">{summary?.activePlans || 0}</p>
                  </div>
                  <Activity className="h-8 w-8 text-green-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Overdue Tasks</p>
                    <p className="text-3xl font-bold text-red-600">{summary?.overdueTasks || 0}</p>
                  </div>
                  <Clock className="h-8 w-8 text-red-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">High Risk Plans</p>
                    <p className="text-3xl font-bold text-red-600">{summary?.highRiskPlans || 0}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarClock className="h-5 w-5" />
                Upcoming Tasks (7 days)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {upcomingLoading ? (
                <div className="flex justify-center p-8"><Spinner size="md" /></div>
              ) : upcomingTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No upcoming tasks in the next 7 days.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingTasks.map((task: any) => (
                      <TableRow
                        key={task.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setLocation(`/tna/plans/${task.planId}`)}
                      >
                        <TableCell className="font-medium">{task.name}</TableCell>
                        <TableCell>{task.planNo || `Plan #${task.planId}`}</TableCell>
                        <TableCell>{task.department || "-"}</TableCell>
                        <TableCell>{formatDate(task.plannedEnd)}</TableCell>
                        <TableCell>
                          <Badge className={statusBadgeColors[task.status] || "bg-gray-100 text-gray-800"}>
                            {task.status?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Overdue Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {overdueLoading ? (
                <div className="flex justify-center p-8"><Spinner size="md" /></div>
              ) : overdueTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No overdue tasks. Great job!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Overdue</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueTasks.map((task: any) => (
                      <TableRow
                        key={task.id}
                        className="cursor-pointer hover:bg-muted/50 bg-red-50/50"
                        onClick={() => setLocation(`/tna/plans/${task.planId}`)}
                      >
                        <TableCell className="font-medium">{task.name}</TableCell>
                        <TableCell>{task.planNo || `Plan #${task.planId}`}</TableCell>
                        <TableCell>{task.department || "-"}</TableCell>
                        <TableCell>{formatDate(task.plannedEnd)}</TableCell>
                        <TableCell>
                          <Badge className="bg-red-100 text-red-800">
                            {task.daysOverdue || 0} days
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusBadgeColors[task.status] || "bg-gray-100 text-gray-800"}>
                            {task.status?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
