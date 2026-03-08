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
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Play, Bell, Plus, Trash2, ToggleLeft, ToggleRight,
  Loader2, Sparkles, CheckCircle2,
} from "lucide-react";

const triggerTypeColors: Record<string, string> = {
  EVENT: "bg-blue-100 text-blue-800",
  SCHEDULED: "bg-purple-100 text-purple-800",
};

const runStatusColors: Record<string, string> = {
  QUEUED: "bg-gray-100 text-gray-800",
  RUNNING: "bg-blue-100 text-blue-800",
  SUCCESS: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function AIAutomationPage() {
  const { toast } = useToast();

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    trigger_type: "EVENT",
    event_key: "",
    schedule_cron: "",
    conditions: "[]",
    actions: '[{"type":"notify","config":{"title":"Alert","message":"Triggered"}}]',
  });

  const { data: rules, isLoading: rulesLoading } = useQuery<any>({
    queryKey: ["/api/automation/rules"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: runs, isLoading: runsLoading } = useQuery<any>({
    queryKey: ["/api/automation/runs"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: notifications, isLoading: notificationsLoading } = useQuery<any>({
    queryKey: ["/api/automation/notifications"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: unreadCount } = useQuery<any>({
    queryKey: ["/api/automation/notifications/unread-count"],
    select: (res: any) => res?.count ?? 0,
  });

  const createRuleMutation = useMutation({
    mutationFn: () => {
      let conditionsParsed: any = [];
      let actionsParsed: any = [];
      try { conditionsParsed = JSON.parse(ruleForm.conditions); } catch {}
      try { actionsParsed = JSON.parse(ruleForm.actions); } catch {}

      return apiRequest("POST", "/api/automation/rules", {
        name: ruleForm.name,
        trigger_type: ruleForm.trigger_type,
        event_key: ruleForm.trigger_type === "EVENT" ? ruleForm.event_key : undefined,
        schedule_cron: ruleForm.trigger_type === "SCHEDULED" ? ruleForm.schedule_cron : undefined,
        conditions: conditionsParsed,
        actions: actionsParsed,
      });
    },
    onSuccess: () => {
      toast({ title: "Rule created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] });
      setRuleDialogOpen(false);
      setRuleForm({
        name: "", trigger_type: "EVENT", event_key: "", schedule_cron: "",
        conditions: "[]",
        actions: '[{"type":"notify","config":{"title":"Alert","message":"Triggered"}}]',
      });
    },
    onError: () => toast({ title: "Failed to create rule", variant: "destructive" }),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/automation/rules/${id}/toggle`),
    onSuccess: () => {
      toast({ title: "Rule toggled" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] });
    },
    onError: () => toast({ title: "Failed to toggle rule", variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/automation/rules/${id}`),
    onSuccess: () => {
      toast({ title: "Rule deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] });
    },
    onError: () => toast({ title: "Failed to delete rule", variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/automation/seed"),
    onSuccess: () => {
      toast({ title: "Default rules seeded" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] });
    },
    onError: () => toast({ title: "Failed to seed defaults", variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/automation/notifications/${id}/read`),
    onSuccess: () => {
      toast({ title: "Notification marked as read" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/notifications/unread-count"] });
    },
    onError: () => toast({ title: "Failed to mark as read", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-orange-500" /> AI Automation
          </h1>
          <p className="text-muted-foreground">Manage automation rules, view runs, and notifications</p>
        </div>

        <Tabs defaultValue="rules">
          <TabsList className="mb-4">
            <TabsTrigger value="rules" className="flex items-center gap-1">
              <Zap className="h-4 w-4" /> Rules
            </TabsTrigger>
            <TabsTrigger value="runs" className="flex items-center gap-1">
              <Play className="h-4 w-4" /> Runs
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1">
              <Bell className="h-4 w-4" /> Notifications
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1 text-xs">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Automation Rules</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={seedMutation.isPending}
                    onClick={() => seedMutation.mutate()}>
                    <Sparkles className="h-4 w-4 mr-1" />
                    {seedMutation.isPending ? "Seeding..." : "Seed Defaults"}
                  </Button>
                  <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Rule</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Automation Rule</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div>
                          <Label>Name</Label>
                          <Input placeholder="Rule name" value={ruleForm.name}
                            onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} />
                        </div>
                        <div>
                          <Label>Trigger Type</Label>
                          <Select value={ruleForm.trigger_type}
                            onValueChange={(val) => setRuleForm({ ...ruleForm, trigger_type: val })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select trigger type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EVENT">Event</SelectItem>
                              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {ruleForm.trigger_type === "EVENT" && (
                          <div>
                            <Label>Event Key</Label>
                            <Input placeholder="e.g. order.created" value={ruleForm.event_key}
                              onChange={(e) => setRuleForm({ ...ruleForm, event_key: e.target.value })} />
                          </div>
                        )}
                        {ruleForm.trigger_type === "SCHEDULED" && (
                          <div>
                            <Label>Schedule (Cron)</Label>
                            <Input placeholder="e.g. 0 9 * * *" value={ruleForm.schedule_cron}
                              onChange={(e) => setRuleForm({ ...ruleForm, schedule_cron: e.target.value })} />
                          </div>
                        )}
                        <div>
                          <Label>Conditions (JSON)</Label>
                          <Textarea rows={3} placeholder="[]" value={ruleForm.conditions}
                            onChange={(e) => setRuleForm({ ...ruleForm, conditions: e.target.value })} />
                        </div>
                        <div>
                          <Label>Actions (JSON)</Label>
                          <Textarea rows={3} value={ruleForm.actions}
                            onChange={(e) => setRuleForm({ ...ruleForm, actions: e.target.value })} />
                        </div>
                        <Button className="w-full" disabled={createRuleMutation.isPending}
                          onClick={() => createRuleMutation.mutate()}>
                          {createRuleMutation.isPending ? "Creating..." : "Create Rule"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {rulesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !rules?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No automation rules found. Click "Seed Defaults" to create sample rules.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Trigger Type</TableHead>
                        <TableHead>Event Key</TableHead>
                        <TableHead>Enabled</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule: any) => (
                        <TableRow key={rule.id}>
                          <TableCell>{rule.id}</TableCell>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell>
                            <Badge className={triggerTypeColors[rule.trigger_type] || "bg-gray-100 text-gray-800"}>
                              {rule.trigger_type}
                            </Badge>
                          </TableCell>
                          <TableCell>{rule.event_key || "-"}</TableCell>
                          <TableCell>
                            <span className={`inline-block h-3 w-3 rounded-full ${rule.enabled ? "bg-green-500" : "bg-gray-400"}`} />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost"
                                disabled={toggleRuleMutation.isPending}
                                onClick={() => toggleRuleMutation.mutate(rule.id)}
                                title={rule.enabled ? "Disable" : "Enable"}>
                                {rule.enabled ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                              </Button>
                              <Button size="sm" variant="ghost"
                                disabled={deleteRuleMutation.isPending}
                                onClick={() => deleteRuleMutation.mutate(rule.id)}
                                title="Delete rule">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
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

          <TabsContent value="runs">
            <Card>
              <CardHeader>
                <CardTitle>Automation Runs</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {runsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !runs?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No automation runs recorded yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Rule Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Started At</TableHead>
                        <TableHead>Finished At</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run: any) => (
                        <TableRow key={run.id}>
                          <TableCell>{run.id}</TableCell>
                          <TableCell className="font-medium">{run.rule_name || run.ruleName || "-"}</TableCell>
                          <TableCell>
                            <Badge className={runStatusColors[run.status] || "bg-gray-100 text-gray-800"}>
                              {run.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{run.started_at || run.startedAt ? new Date(run.started_at || run.startedAt).toLocaleString() : "-"}</TableCell>
                          <TableCell>{run.finished_at || run.finishedAt ? new Date(run.finished_at || run.finishedAt).toLocaleString() : "-"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-red-600">{run.error || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Notifications</h2>
                {unreadCount > 0 && (
                  <Badge variant="secondary">{unreadCount} unread</Badge>
                )}
              </div>
              {notificationsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !notifications?.length ? (
                <div className="text-center py-8 text-muted-foreground">No notifications.</div>
              ) : (
                notifications.map((n: any) => (
                  <Card key={n.id} className={n.is_read ? "opacity-60" : "border-l-4 border-l-blue-500"}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Bell className="h-4 w-4 text-blue-500" />
                            <span className="font-semibold">{n.title}</span>
                            {!n.is_read && (
                              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{n.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                          </p>
                        </div>
                        {!n.is_read && (
                          <Button size="sm" variant="outline"
                            disabled={markReadMutation.isPending}
                            onClick={() => markReadMutation.mutate(n.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Read
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}