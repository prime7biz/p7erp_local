import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { Plus, Search, MoreHorizontal, Eye, Edit, Trash2, FileText, Loader2, Printer, Shield, ArrowDownToLine, ArrowUpFromLine, CheckCircle, Clock, Package } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function getTypeBadge(type: string) {
  if (type === 'GP_IN') return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Inward</Badge>;
  return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Outward</Badge>;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "DRAFT": return <Badge variant="outline">Draft</Badge>;
    case "SUBMITTED": return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Submitted</Badge>;
    case "APPROVED": return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>;
    case "REJECTED": return <Badge variant="destructive">Rejected</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try { return format(new Date(dateStr), "dd MMM yyyy"); } catch { return dateStr; }
}

export default function EnhancedGatePassesPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [selectedGPId, setSelectedGPId] = useState<number | null>(null);
  const [guardName, setGuardName] = useState("");
  const [checkpoint, setCheckpoint] = useState("");
  const { toast } = useToast();

  const gatePassType = activeTab === "all" ? undefined : activeTab === "inward" ? "GP_IN" : "GP_OUT";

  const queryParams = new URLSearchParams();
  if (gatePassType) queryParams.set("gatePassType", gatePassType);
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (searchQuery) queryParams.set("search", searchQuery);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/enhanced-gate-passes', activeTab, statusFilter, searchQuery, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/enhanced-gate-passes?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch gate passes");
      return res.json();
    },
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['/api/enhanced-gate-passes/summary'],
  });

  const ackMutation = useMutation({
    mutationFn: async ({ id, guardName, checkpoint }: { id: number; guardName: string; checkpoint: string }) => {
      const res = await apiRequest(`/api/enhanced-gate-passes/${id}/guard-acknowledge`, "POST", {
        securityGuardName: guardName,
        securityCheckpoint: checkpoint,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Guard acknowledged successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced-gate-passes'] });
      setAckDialogOpen(false);
      setSelectedGPId(null);
      setGuardName("");
      setCheckpoint("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to acknowledge", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/enhanced-gate-passes/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({ title: "Gate pass deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced-gate-passes'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const gatePasses = data?.gatePasses || [];

  return (
    <DashboardContainer
      title="Enhanced Gate Passes"
      subtitle="Security control for goods entering and leaving premises"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/inventory/enhanced-gate-passes/new?type=GP_IN">
            <Button variant="outline" size="sm">
              <ArrowDownToLine className="mr-2 h-4 w-4" /> New Inward
            </Button>
          </Link>
          <Link href="/inventory/enhanced-gate-passes/new?type=GP_OUT">
            <Button size="sm">
              <ArrowUpFromLine className="mr-2 h-4 w-4" /> New Outward
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Package className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Today</p>
                <p className="text-2xl font-bold">{summary?.totalToday || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><ArrowDownToLine className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Inward Today</p>
                <p className="text-2xl font-bold">{summary?.inwardToday || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg"><ArrowUpFromLine className="h-5 w-5 text-orange-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Outward Today</p>
                <p className="text-2xl font-bold">{summary?.outwardToday || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><Clock className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Ack.</p>
                <p className="text-2xl font-bold">{summary?.pendingAcknowledgment || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({summary?.totalAll || 0})</TabsTrigger>
          <TabsTrigger value="inward">Inward ({summary?.totalInward || 0})</TabsTrigger>
          <TabsTrigger value="outward">Outward ({summary?.totalOutward || 0})</TabsTrigger>
        </TabsList>

        <div className="mt-4 mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search GP number, party, vehicle..." className="pl-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" placeholder="From date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" placeholder="To date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <TabsContent value={activeTab} className="mt-0">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2">Loading gate passes...</span>
                </div>
              ) : gatePasses.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<FileText className="h-10 w-10" />}
                    title="No gate passes found"
                    description="Create your first gate pass to track goods movement."
                    action={
                      <Link href="/inventory/enhanced-gate-passes/new">
                        <Button><Plus className="mr-2 h-4 w-4" /> Create Gate Pass</Button>
                      </Link>
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Gate Pass No</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Party</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Guard</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gatePasses.map((gp: any) => (
                        <TableRow key={gp.id}>
                          <TableCell>
                            <Link href={`/inventory/enhanced-gate-passes/${gp.id}`}>
                              <span className="font-semibold text-primary hover:underline cursor-pointer">{gp.gatePassNumber}</span>
                            </Link>
                          </TableCell>
                          <TableCell>{formatDate(gp.gatePassDate)}</TableCell>
                          <TableCell>{getTypeBadge(gp.gatePassType)}</TableCell>
                          <TableCell>{gp.partyDisplayName || gp.partyName || "—"}</TableCell>
                          <TableCell>{gp.vehicleNumber || "—"}</TableCell>
                          <TableCell>{gp.itemsCount || gp.totalItems || 0}</TableCell>
                          <TableCell>{getStatusBadge(gp.workflowStatus)}</TableCell>
                          <TableCell>
                            {gp.guardAcknowledged ? (
                              <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" /> Done</span>
                            ) : (
                              <span className="text-red-500 text-sm">Pending</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <Link href={`/inventory/enhanced-gate-passes/${gp.id}`}>
                                  <DropdownMenuItem><Eye className="mr-2 h-4 w-4" /> View / Edit</DropdownMenuItem>
                                </Link>
                                <Link href={`/inventory/enhanced-gate-passes/${gp.id}/print`}>
                                  <DropdownMenuItem><Printer className="mr-2 h-4 w-4" /> Print</DropdownMenuItem>
                                </Link>
                                {gp.workflowStatus === 'APPROVED' && !gp.guardAcknowledged && (
                                  <DropdownMenuItem onClick={() => { setSelectedGPId(gp.id); setAckDialogOpen(true); }}>
                                    <Shield className="mr-2 h-4 w-4" /> Guard Acknowledge
                                  </DropdownMenuItem>
                                )}
                                {gp.workflowStatus === 'DRAFT' && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(gp.id)}>
                                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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
      </Tabs>

      <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guard Acknowledgment</DialogTitle>
            <DialogDescription>Confirm that the security guard has verified this gate pass.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Security Guard Name</label>
              <Input value={guardName} onChange={(e) => setGuardName(e.target.value)} placeholder="Enter guard name" />
            </div>
            <div>
              <label className="text-sm font-medium">Checkpoint</label>
              <Input value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)} placeholder="e.g. Main Gate, Gate 2" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => selectedGPId && ackMutation.mutate({ id: selectedGPId, guardName, checkpoint })} disabled={ackMutation.isPending}>
              {ackMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
              Acknowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
