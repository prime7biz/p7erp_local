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
  Factory, Plus, Loader2, Play, ClipboardList, Settings2, BarChart3,
} from "lucide-react";

const jobStatusColors: Record<string, string> = {
  OPEN: "bg-gray-100 text-gray-800",
  ALLOCATED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function AdvancedPlanningPage() {
  const { toast } = useToast();

  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState({
    resource_code: "", type: "",
  });

  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobForm, setJobForm] = useState({
    job_type: "", required_qty: "", due_date: "",
  });

  const [allocateType, setAllocateType] = useState("");
  const [allocationJobFilter, setAllocationJobFilter] = useState("");

  const { data: resources, isLoading: resourcesLoading } = useQuery<any>({
    queryKey: ["/api/planning/resources"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery<any>({
    queryKey: ["/api/planning/jobs"],
    select: (res: any) => res?.data ?? [],
  });

  const allocationUrl = allocationJobFilter
    ? `/api/planning/allocations?job_id=${allocationJobFilter}`
    : "/api/planning/allocations";

  const { data: allocations, isLoading: allocationsLoading } = useQuery<any>({
    queryKey: ["/api/planning/allocations", allocationJobFilter],
    queryFn: () => fetch(allocationUrl, { credentials: "include" }).then(r => r.json()),
    select: (res: any) => res?.data ?? [],
  });

  const openJobs = (jobs || []).filter((j: any) => j.status === "OPEN");
  const totalResources = (resources || []).length;

  const createResourceMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/planning/resources", {
        resource_code: resourceForm.resource_code,
        type: resourceForm.type,
      }),
    onSuccess: () => {
      toast({ title: "Resource added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/planning/resources"] });
      setResourceDialogOpen(false);
      setResourceForm({ resource_code: "", type: "" });
    },
    onError: () => toast({ title: "Failed to add resource", variant: "destructive" }),
  });

  const createJobMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/planning/jobs", {
        job_type: jobForm.job_type,
        required_qty: Number(jobForm.required_qty),
        due_date: jobForm.due_date,
      }),
    onSuccess: () => {
      toast({ title: "Job created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/planning/jobs"] });
      setJobDialogOpen(false);
      setJobForm({ job_type: "", required_qty: "", due_date: "" });
    },
    onError: () => toast({ title: "Failed to create job", variant: "destructive" }),
  });

  const autoAllocateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/planning/allocate", { jobType: allocateType }),
    onSuccess: (res: any) => {
      toast({ title: "Auto-allocation complete", description: res?.message || "Jobs allocated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/planning/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning/allocations"] });
    },
    onError: () => toast({ title: "Auto-allocation failed", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Advanced Planning</h1>
          <p className="text-muted-foreground">Resource management, planning jobs, and allocations</p>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="jobs">Planning Jobs</TabsTrigger>
            <TabsTrigger value="allocations">Allocations</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            {jobsLoading || resourcesLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Open Jobs</p>
                        <p className="text-3xl font-bold text-amber-600">{openJobs.length}</p>
                      </div>
                      <ClipboardList className="h-8 w-8 text-amber-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Resources</p>
                        <p className="text-3xl font-bold text-blue-600">{totalResources}</p>
                      </div>
                      <Factory className="h-8 w-8 text-blue-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Jobs</p>
                        <p className="text-3xl font-bold text-green-600">{(jobs || []).length}</p>
                      </div>
                      <BarChart3 className="h-8 w-8 text-green-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Completed</p>
                        <p className="text-3xl font-bold text-purple-600">
                          {(jobs || []).filter((j: any) => j.status === "COMPLETED").length}
                        </p>
                      </div>
                      <Settings2 className="h-8 w-8 text-purple-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="resources">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Resources</CardTitle>
                <Dialog open={resourceDialogOpen} onOpenChange={setResourceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Resource</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Resource</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Resource Code</Label>
                        <Input placeholder="e.g. SEW-01" value={resourceForm.resource_code}
                          onChange={(e) => setResourceForm({ ...resourceForm, resource_code: e.target.value })} />
                      </div>
                      <div>
                        <Label>Type</Label>
                        <Select value={resourceForm.type} onValueChange={(v) => setResourceForm({ ...resourceForm, type: v })}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SEWING">SEWING</SelectItem>
                            <SelectItem value="KNITTING">KNITTING</SelectItem>
                            <SelectItem value="DYEING">DYEING</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full" disabled={createResourceMutation.isPending}
                        onClick={() => createResourceMutation.mutate()}>
                        {createResourceMutation.isPending ? "Adding..." : "Add Resource"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {resourcesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !resources?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No resources found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resources.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.id}</TableCell>
                          <TableCell className="font-medium">{r.resource_code || r.resourceCode}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={r.is_active !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                              {r.is_active !== false ? "Active" : "Inactive"}
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

          <TabsContent value="jobs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <CardTitle>Planning Jobs</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Select value={allocateType} onValueChange={setAllocateType}>
                      <SelectTrigger className="w-[140px]"><SelectValue placeholder="Job type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SEWING">SEWING</SelectItem>
                        <SelectItem value="KNITTING">KNITTING</SelectItem>
                        <SelectItem value="DYEING">DYEING</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline"
                      disabled={!allocateType || autoAllocateMutation.isPending}
                      onClick={() => autoAllocateMutation.mutate()}>
                      <Play className="h-4 w-4 mr-1" />
                      {autoAllocateMutation.isPending ? "Allocating..." : "Run Auto-Allocate"}
                    </Button>
                  </div>
                  <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Job</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Planning Job</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div>
                          <Label>Job Type</Label>
                          <Select value={jobForm.job_type} onValueChange={(v) => setJobForm({ ...jobForm, job_type: v })}>
                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SEWING">SEWING</SelectItem>
                              <SelectItem value="KNITTING">KNITTING</SelectItem>
                              <SelectItem value="DYEING">DYEING</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Required Qty</Label>
                          <Input type="number" placeholder="Quantity" value={jobForm.required_qty}
                            onChange={(e) => setJobForm({ ...jobForm, required_qty: e.target.value })} />
                        </div>
                        <div>
                          <Label>Due Date</Label>
                          <Input type="date" value={jobForm.due_date}
                            onChange={(e) => setJobForm({ ...jobForm, due_date: e.target.value })} />
                        </div>
                        <Button className="w-full" disabled={createJobMutation.isPending}
                          onClick={() => createJobMutation.mutate()}>
                          {createJobMutation.isPending ? "Creating..." : "Create Job"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {jobsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !jobs?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No planning jobs found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Required Qty</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job: any) => (
                        <TableRow key={job.id}>
                          <TableCell>{job.id}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{job.job_type || job.jobType}</Badge>
                          </TableCell>
                          <TableCell>{job.source || job.source_ref || "-"}</TableCell>
                          <TableCell>{Number(job.required_qty || job.requiredQty || 0).toLocaleString()}</TableCell>
                          <TableCell>{job.due_date || job.dueDate || "-"}</TableCell>
                          <TableCell>
                            <Badge className={jobStatusColors[job.status] || "bg-gray-100 text-gray-800"}>
                              {job.status}
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

          <TabsContent value="allocations">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Allocations</CardTitle>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Filter by Job ID:</Label>
                  <Input className="w-24" type="number" placeholder="All"
                    value={allocationJobFilter}
                    onChange={(e) => setAllocationJobFilter(e.target.value)} />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {allocationsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !allocations?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No allocations found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Resource Code</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Minutes</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocations.map((alloc: any, idx: number) => (
                        <TableRow key={alloc.id || idx}>
                          <TableCell>{alloc.job_id || alloc.jobId}</TableCell>
                          <TableCell className="font-medium">{alloc.resource_code || alloc.resourceCode || "-"}</TableCell>
                          <TableCell>{alloc.date || alloc.allocation_date || "-"}</TableCell>
                          <TableCell>{alloc.qty || alloc.allocated_qty || "-"}</TableCell>
                          <TableCell>{alloc.minutes || alloc.allocated_minutes || "-"}</TableCell>
                          <TableCell>
                            <Badge className={jobStatusColors[alloc.status] || "bg-gray-100 text-gray-800"}>
                              {alloc.status || "ALLOCATED"}
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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}