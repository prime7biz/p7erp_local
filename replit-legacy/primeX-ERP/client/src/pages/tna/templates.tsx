import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Spinner from "@/components/ui/spinner";
import {
  Plus, ChevronDown, ChevronRight, AlertTriangle, ListChecks, FileText,
} from "lucide-react";

export default function TnaTemplatesPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  const [templateForm, setTemplateForm] = useState({ name: "", appliesTo: "", productType: "" });
  const [taskForm, setTaskForm] = useState({
    name: "", department: "", defaultOffsetDays: 0, durationDays: 1,
    isCritical: false, defaultOwnerRole: "", sortOrder: 0,
  });

  const { data: templatesRes, isLoading } = useQuery<any>({
    queryKey: ["/api/tna/templates"],
  });
  const templates = templatesRes?.data || [];

  const { data: templateDetailRes } = useQuery<any>({
    queryKey: ["/api/tna/templates", expandedTemplate],
    enabled: !!expandedTemplate,
  });
  const templateDetail = templateDetailRes?.data;

  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/tna/templates", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tna/templates"] });
      toast({ title: "Success", description: "Template created successfully." });
      setShowCreateDialog(false);
      setTemplateForm({ name: "", appliesTo: "", productType: "" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create template.", variant: "destructive" });
    },
  });

  const addTasksMutation = useMutation({
    mutationFn: ({ templateId, tasks }: { templateId: number; tasks: any[] }) =>
      apiRequest(`/api/tna/templates/${templateId}/tasks`, "POST", { tasks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tna/templates", expandedTemplate] });
      queryClient.invalidateQueries({ queryKey: ["/api/tna/templates"] });
      toast({ title: "Success", description: "Task added to template." });
      setShowAddTaskDialog(false);
      setTaskForm({ name: "", department: "", defaultOffsetDays: 0, durationDays: 1, isCritical: false, defaultOwnerRole: "", sortOrder: 0 });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add task.", variant: "destructive" });
    },
  });

  const handleCreateTemplate = () => {
    if (!templateForm.name || !templateForm.appliesTo) {
      toast({ title: "Validation Error", description: "Name and Applies To are required.", variant: "destructive" });
      return;
    }
    createTemplateMutation.mutate({
      name: templateForm.name,
      appliesTo: templateForm.appliesTo,
      productType: templateForm.productType || undefined,
    });
  };

  const handleAddTask = () => {
    if (!taskForm.name || !selectedTemplateId) {
      toast({ title: "Validation Error", description: "Task name is required.", variant: "destructive" });
      return;
    }
    addTasksMutation.mutate({
      templateId: selectedTemplateId,
      tasks: [taskForm],
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedTemplate(expandedTemplate === id ? null : id);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">TNA Templates</h1>
            <p className="text-muted-foreground">Manage Time & Action plan templates and their tasks</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Template
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center p-8">
                <Spinner size="lg" />
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <FileText className="h-12 w-12 mb-3" />
                <p className="text-lg font-medium">No templates found</p>
                <p className="text-sm">Create your first TNA template to get started.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Product Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template: any) => (
                    <Collapsible key={template.id} open={expandedTemplate === template.id} onOpenChange={() => toggleExpand(template.id)} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className="cursor-pointer hover:bg-muted/50">
                            <TableCell>
                              {expandedTemplate === template.id ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{template.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{template.appliesTo}</Badge>
                            </TableCell>
                            <TableCell>{template.productType || "-"}</TableCell>
                            <TableCell>
                              <Badge className={template.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                                {template.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <ListChecks className="h-4 w-4 text-muted-foreground" />
                                {template.taskCount || 0}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTemplateId(template.id);
                                setExpandedTemplate(template.id);
                                setShowAddTaskDialog(true);
                              }}>
                                <Plus className="h-4 w-4 mr-1" /> Add Task
                              </Button>
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30 p-0">
                              <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="font-medium text-sm">Template Tasks</h4>
                                  <Button variant="outline" size="sm" onClick={() => {
                                    setSelectedTemplateId(template.id);
                                    setShowAddTaskDialog(true);
                                  }}>
                                    <Plus className="h-3 w-3 mr-1" /> Add Task
                                  </Button>
                                </div>
                                {templateDetail?.tasks && templateDetail.tasks.length > 0 ? (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Offset Days</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Critical</TableHead>
                                        <TableHead>Dependencies</TableHead>
                                        <TableHead>Sort Order</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {templateDetail.tasks.map((task: any) => (
                                        <TableRow key={task.id}>
                                          <TableCell className="font-medium">{task.name}</TableCell>
                                          <TableCell>{task.department || "-"}</TableCell>
                                          <TableCell>{task.defaultOffsetDays}</TableCell>
                                          <TableCell>{task.durationDays} days</TableCell>
                                          <TableCell>
                                            {task.isCritical ? (
                                              <Badge className="bg-red-100 text-red-800">
                                                <AlertTriangle className="h-3 w-3 mr-1" /> Critical
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline">Normal</Badge>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {task.dependsOnTaskIds?.length > 0
                                              ? task.dependsOnTaskIds.join(", ")
                                              : "-"}
                                          </TableCell>
                                          <TableCell>{task.sortOrder}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                ) : (
                                  <p className="text-sm text-muted-foreground text-center py-4">
                                    No tasks defined yet. Add tasks to this template.
                                  </p>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create TNA Template</DialogTitle>
              <DialogDescription>Define a new Time & Action template</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Template Name *</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g., Standard Woven Order"
                />
              </div>
              <div>
                <Label>Applies To *</Label>
                <Select value={templateForm.appliesTo} onValueChange={(v) => setTemplateForm({ ...templateForm, appliesTo: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORDER">Order</SelectItem>
                    <SelectItem value="SAMPLE">Sample</SelectItem>
                    <SelectItem value="STYLE">Style</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Product Type (optional)</Label>
                <Input
                  value={templateForm.productType}
                  onChange={(e) => setTemplateForm({ ...templateForm, productType: e.target.value })}
                  placeholder="e.g., Woven, Knit"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateTemplate} disabled={createTemplateMutation.isPending}>
                {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddTaskDialog} onOpenChange={setShowAddTaskDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Template Task</DialogTitle>
              <DialogDescription>Add a task to the TNA template</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Task Name *</Label>
                <Input
                  value={taskForm.name}
                  onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                  placeholder="e.g., Fabric Sourcing"
                />
              </div>
              <div>
                <Label>Department</Label>
                <Input
                  value={taskForm.department}
                  onChange={(e) => setTaskForm({ ...taskForm, department: e.target.value })}
                  placeholder="e.g., Procurement"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Offset Days</Label>
                  <Input
                    type="number"
                    value={taskForm.defaultOffsetDays}
                    onChange={(e) => setTaskForm({ ...taskForm, defaultOffsetDays: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Duration (days)</Label>
                  <Input
                    type="number"
                    value={taskForm.durationDays}
                    onChange={(e) => setTaskForm({ ...taskForm, durationDays: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={taskForm.isCritical}
                  onCheckedChange={(checked) => setTaskForm({ ...taskForm, isCritical: checked })}
                />
                <Label>Critical Path Task</Label>
              </div>
              <div>
                <Label>Default Owner Role</Label>
                <Input
                  value={taskForm.defaultOwnerRole}
                  onChange={(e) => setTaskForm({ ...taskForm, defaultOwnerRole: e.target.value })}
                  placeholder="e.g., Merchandiser"
                />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={taskForm.sortOrder}
                  onChange={(e) => setTaskForm({ ...taskForm, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddTaskDialog(false)}>Cancel</Button>
              <Button onClick={handleAddTask} disabled={addTasksMutation.isPending}>
                {addTasksMutation.isPending ? "Adding..." : "Add Task"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
