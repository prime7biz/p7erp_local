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
  Scissors, Package, Send, Ruler,
  Plus, ThumbsUp, Loader2, CheckCircle2,
} from "lucide-react";

const markerStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  APPROVED: "bg-green-100 text-green-800",
};

const stageColors: Record<string, string> = {
  CUT: "bg-gray-100 text-gray-800",
  ISSUED: "bg-blue-100 text-blue-800",
  SEWING: "bg-amber-100 text-amber-800",
  FINISHING: "bg-green-100 text-green-800",
  PACKED: "bg-purple-100 text-purple-800",
};

export default function CuttingPage() {
  const { toast } = useToast();

  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const [markerForm, setMarkerForm] = useState({
    marker_ref: "", style_id: "", width: "", gsm: "", efficiency_pct: "", planned_pcs: "",
  });

  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [bundleForm, setBundleForm] = useState({
    ticket_id: "", bundle_size: "",
  });

  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({
    issue_no: "", to_line_id: "", production_plan_id: "",
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery<any>({
    queryKey: ["/api/production/cutting/dashboard"],
    select: (res: any) => res?.data ?? {},
  });

  const { data: markers, isLoading: markersLoading } = useQuery<any>({
    queryKey: ["/api/production/cutting/markers"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: bundles, isLoading: bundlesLoading } = useQuery<any>({
    queryKey: ["/api/production/cutting/bundles"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: issues, isLoading: issuesLoading } = useQuery<any>({
    queryKey: ["/api/production/cutting/issues"],
    select: (res: any) => res?.data ?? [],
  });

  const createMarkerMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/cutting/markers", {
        marker_ref: markerForm.marker_ref,
        style_id: Number(markerForm.style_id),
        width: Number(markerForm.width),
        gsm: Number(markerForm.gsm),
        efficiency_pct: Number(markerForm.efficiency_pct),
        planned_pcs: Number(markerForm.planned_pcs),
      }),
    onSuccess: () => {
      toast({ title: "Marker created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/markers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/dashboard"] });
      setMarkerDialogOpen(false);
      setMarkerForm({ marker_ref: "", style_id: "", width: "", gsm: "", efficiency_pct: "", planned_pcs: "" });
    },
    onError: () => toast({ title: "Failed to create marker", variant: "destructive" }),
  });

  const approveMarkerMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/production/cutting/markers/${id}/approve`),
    onSuccess: () => {
      toast({ title: "Marker approved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/markers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/dashboard"] });
    },
    onError: () => toast({ title: "Failed to approve marker", variant: "destructive" }),
  });

  const generateBundlesMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/cutting/bundles/generate", {
        ticket_id: Number(bundleForm.ticket_id),
        bundle_size: Number(bundleForm.bundle_size),
      }),
    onSuccess: () => {
      toast({ title: "Bundles generated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/bundles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/dashboard"] });
      setBundleDialogOpen(false);
      setBundleForm({ ticket_id: "", bundle_size: "" });
    },
    onError: () => toast({ title: "Failed to generate bundles", variant: "destructive" }),
  });

  const createIssueMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/production/cutting/issues", {
        issue_no: issueForm.issue_no,
        to_line_id: Number(issueForm.to_line_id),
        production_plan_id: Number(issueForm.production_plan_id),
      }),
    onSuccess: () => {
      toast({ title: "Issue created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/dashboard"] });
      setIssueDialogOpen(false);
      setIssueForm({ issue_no: "", to_line_id: "", production_plan_id: "" });
    },
    onError: () => toast({ title: "Failed to create issue", variant: "destructive" }),
  });

  const postIssueMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/production/cutting/issues/${id}/post`, {
        request_id: crypto.randomUUID(),
      }),
    onSuccess: () => {
      toast({ title: "Issue posted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/cutting/dashboard"] });
    },
    onError: () => toast({ title: "Failed to post issue", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Cutting Module</h1>
          <p className="text-muted-foreground">Manage marker plans, bundles, and bundle issues</p>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="markers">Marker Plans</TabsTrigger>
            <TabsTrigger value="bundles">Bundles</TabsTrigger>
            <TabsTrigger value="issues">Bundle Issues</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            {dashLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Markers</p>
                        <p className="text-3xl font-bold text-blue-600">{dashboard?.totalMarkers ?? 0}</p>
                      </div>
                      <Ruler className="h-8 w-8 text-blue-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Bundles Cut Today</p>
                        <p className="text-3xl font-bold text-green-600">{dashboard?.bundlesCutToday ?? 0}</p>
                      </div>
                      <Scissors className="h-8 w-8 text-green-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Bundles Issued Today</p>
                        <p className="text-3xl font-bold text-purple-600">{dashboard?.bundlesIssuedToday ?? 0}</p>
                      </div>
                      <Send className="h-8 w-8 text-purple-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="markers">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Marker Plans</CardTitle>
                <Dialog open={markerDialogOpen} onOpenChange={setMarkerDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Marker</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Marker Plan</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Marker Ref</Label>
                        <Input placeholder="e.g. MK-001" value={markerForm.marker_ref}
                          onChange={(e) => setMarkerForm({ ...markerForm, marker_ref: e.target.value })} />
                      </div>
                      <div>
                        <Label>Style ID</Label>
                        <Input type="number" placeholder="Style ID" value={markerForm.style_id}
                          onChange={(e) => setMarkerForm({ ...markerForm, style_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Width</Label>
                        <Input type="number" placeholder="Width in inches" value={markerForm.width}
                          onChange={(e) => setMarkerForm({ ...markerForm, width: e.target.value })} />
                      </div>
                      <div>
                        <Label>GSM</Label>
                        <Input type="number" placeholder="GSM" value={markerForm.gsm}
                          onChange={(e) => setMarkerForm({ ...markerForm, gsm: e.target.value })} />
                      </div>
                      <div>
                        <Label>Efficiency %</Label>
                        <Input type="number" placeholder="e.g. 85" value={markerForm.efficiency_pct}
                          onChange={(e) => setMarkerForm({ ...markerForm, efficiency_pct: e.target.value })} />
                      </div>
                      <div>
                        <Label>Planned Pcs</Label>
                        <Input type="number" placeholder="Planned pieces" value={markerForm.planned_pcs}
                          onChange={(e) => setMarkerForm({ ...markerForm, planned_pcs: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createMarkerMutation.isPending}
                        onClick={() => createMarkerMutation.mutate()}>
                        {createMarkerMutation.isPending ? "Creating..." : "Create Marker"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {markersLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !markers?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No marker plans found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Marker Ref</TableHead>
                        <TableHead>Style ID</TableHead>
                        <TableHead>Width</TableHead>
                        <TableHead>GSM</TableHead>
                        <TableHead>Efficiency%</TableHead>
                        <TableHead>Planned Pcs</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {markers.map((marker: any) => (
                        <TableRow key={marker.id}>
                          <TableCell>{marker.id}</TableCell>
                          <TableCell className="font-medium">{marker.marker_ref || marker.markerRef || "-"}</TableCell>
                          <TableCell>{marker.style_id || marker.styleId || "-"}</TableCell>
                          <TableCell>{marker.width ?? "-"}</TableCell>
                          <TableCell>{marker.gsm ?? "-"}</TableCell>
                          <TableCell>{marker.efficiency_pct || marker.efficiencyPct || "-"}%</TableCell>
                          <TableCell>{Number(marker.planned_pcs || marker.plannedPcs || 0).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge className={markerStatusColors[marker.status] || "bg-gray-100 text-gray-800"}>
                              {marker.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {marker.status === "DRAFT" && (
                              <Button size="sm" variant="outline"
                                disabled={approveMarkerMutation.isPending}
                                onClick={() => approveMarkerMutation.mutate(marker.id)}>
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

          <TabsContent value="bundles">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Bundles</CardTitle>
                <Dialog open={bundleDialogOpen} onOpenChange={setBundleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Generate Bundles</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Generate Bundles</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Ticket ID</Label>
                        <Input type="number" placeholder="Cutting ticket ID" value={bundleForm.ticket_id}
                          onChange={(e) => setBundleForm({ ...bundleForm, ticket_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Bundle Size</Label>
                        <Input type="number" placeholder="Pieces per bundle" value={bundleForm.bundle_size}
                          onChange={(e) => setBundleForm({ ...bundleForm, bundle_size: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={generateBundlesMutation.isPending}
                        onClick={() => generateBundlesMutation.mutate()}>
                        {generateBundlesMutation.isPending ? "Generating..." : "Generate Bundles"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {bundlesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !bundles?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No bundles found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bundle No</TableHead>
                        <TableHead>Bundle UID</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Line ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bundles.map((bundle: any) => (
                        <TableRow key={bundle.id || bundle.bundle_uid || bundle.bundleUid}>
                          <TableCell className="font-medium">{bundle.bundle_no || bundle.bundleNo || "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{bundle.bundle_uid || bundle.bundleUid || "-"}</TableCell>
                          <TableCell>{bundle.size || "-"}</TableCell>
                          <TableCell>{bundle.color || "-"}</TableCell>
                          <TableCell>{bundle.qty ?? "-"}</TableCell>
                          <TableCell>
                            <Badge className={stageColors[bundle.stage] || "bg-gray-100 text-gray-800"}>
                              {bundle.stage || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>{bundle.line_id || bundle.lineId || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issues">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Bundle Issues</CardTitle>
                <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Issue</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Bundle Issue</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Issue No</Label>
                        <Input placeholder="e.g. ISS-001" value={issueForm.issue_no}
                          onChange={(e) => setIssueForm({ ...issueForm, issue_no: e.target.value })} />
                      </div>
                      <div>
                        <Label>To Line ID</Label>
                        <Input type="number" placeholder="Target line ID" value={issueForm.to_line_id}
                          onChange={(e) => setIssueForm({ ...issueForm, to_line_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Production Plan ID</Label>
                        <Input type="number" placeholder="Production plan ID" value={issueForm.production_plan_id}
                          onChange={(e) => setIssueForm({ ...issueForm, production_plan_id: e.target.value })} />
                      </div>
                      <Button className="w-full" disabled={createIssueMutation.isPending}
                        onClick={() => createIssueMutation.mutate()}>
                        {createIssueMutation.isPending ? "Creating..." : "Create Issue"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {issuesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !issues?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No bundle issues found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Issue No</TableHead>
                        <TableHead>From Dept</TableHead>
                        <TableHead>To Line</TableHead>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {issues.map((issue: any) => (
                        <TableRow key={issue.id}>
                          <TableCell>{issue.id}</TableCell>
                          <TableCell className="font-medium">{issue.issue_no || issue.issueNo || "-"}</TableCell>
                          <TableCell>{issue.from_dept || issue.fromDept || "-"}</TableCell>
                          <TableCell>{issue.to_line_id || issue.toLineId || issue.to_line || "-"}</TableCell>
                          <TableCell>{issue.issue_date || issue.issueDate || "-"}</TableCell>
                          <TableCell>
                            <Badge className={
                              issue.status === "POSTED" ? "bg-green-100 text-green-800" :
                              issue.status === "DRAFT" ? "bg-gray-100 text-gray-800" :
                              "bg-gray-100 text-gray-800"
                            }>
                              {issue.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {issue.status === "DRAFT" && (
                              <Button size="sm" variant="outline"
                                disabled={postIssueMutation.isPending}
                                onClick={() => postIssueMutation.mutate(issue.id)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Post
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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}