import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import Spinner from "@/components/ui/spinner";
import {
  Plus, Eye, Calendar as CalendarIcon, FileText, AlertTriangle, Activity,
} from "lucide-react";

const riskColors: Record<string, string> = {
  LOW: "bg-green-100 text-green-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  ACTIVE: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  try { return format(new Date(d), "MMM dd, yyyy"); } catch { return "-"; }
}

export default function TnaPlansPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [filterRelatedType, setFilterRelatedType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [anchorDate, setAnchorDate] = useState<Date | undefined>();

  const [planForm, setPlanForm] = useState({
    templateId: "", relatedType: "", relatedId: "",
    anchorDateType: "SHIPMENT_DATE", anchorDate: "",
  });

  const queryParams = new URLSearchParams();
  if (filterRelatedType && filterRelatedType !== "all") queryParams.set("relatedType", filterRelatedType);
  if (filterStatus && filterStatus !== "all") queryParams.set("status", filterStatus);
  const queryString = queryParams.toString();

  const { data: plansRes, isLoading } = useQuery<any>({
    queryKey: ["/api/tna/plans" + (queryString ? `?${queryString}` : "")],
  });
  const plans = plansRes?.data || [];

  const { data: templatesRes } = useQuery<any>({
    queryKey: ["/api/tna/templates"],
  });
  const templatesList = templatesRes?.data || [];

  const generatePlanMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/tna/plans", "POST", data),
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tna/plans"] });
      toast({ title: "Success", description: "TNA Plan generated successfully." });
      setShowGenerateDialog(false);
      try {
        const result = await res.json();
        if (result?.data?.id) setLocation(`/tna/plans/${result.data.id}`);
      } catch {}
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate plan.", variant: "destructive" });
    },
  });

  const handleGeneratePlan = () => {
    if (!planForm.templateId || !planForm.relatedType || !planForm.relatedId || !anchorDate) {
      toast({ title: "Validation Error", description: "All fields are required.", variant: "destructive" });
      return;
    }
    generatePlanMutation.mutate({
      templateId: parseInt(planForm.templateId),
      relatedType: planForm.relatedType,
      relatedId: parseInt(planForm.relatedId),
      anchorDateType: planForm.anchorDateType,
      anchorDate: anchorDate.toISOString(),
    });
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">TNA Plans</h1>
            <p className="text-muted-foreground">View and manage Time & Action plans</p>
          </div>
          <Button onClick={() => setShowGenerateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" /> Generate Plan
          </Button>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Related Type</Label>
                <Select value={filterRelatedType} onValueChange={setFilterRelatedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="ORDER">Order</SelectItem>
                    <SelectItem value="SAMPLE">Sample</SelectItem>
                    <SelectItem value="STYLE">Style</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center p-8">
                <Spinner size="lg" />
              </div>
            ) : plans.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <FileText className="h-12 w-12 mb-3" />
                <p className="text-lg font-medium">No plans found</p>
                <p className="text-sm">Generate a new TNA plan to get started.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan No</TableHead>
                    <TableHead>Related Type</TableHead>
                    <TableHead>Related ID</TableHead>
                    <TableHead>Anchor Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan: any) => (
                    <TableRow key={plan.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/tna/plans/${plan.id}`)}>
                      <TableCell className="font-medium">{plan.planNo || `TNA-${plan.id}`}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{plan.relatedType}</Badge>
                      </TableCell>
                      <TableCell>{plan.relatedId}</TableCell>
                      <TableCell>{formatDate(plan.anchorDate)}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[plan.status] || "bg-gray-100 text-gray-800"}>
                          {plan.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Activity className="h-3 w-3" />
                          {plan.completedTasks || 0}/{plan.totalTasks || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        {plan.riskScore ? (
                          <Badge className={riskColors[plan.riskScore] || "bg-gray-100 text-gray-800"}>
                            {plan.riskScore === "HIGH" && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {plan.riskScore}
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setLocation(`/tna/plans/${plan.id}`); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate TNA Plan</DialogTitle>
              <DialogDescription>Create a new Time & Action plan from a template</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Template *</Label>
                <Select value={planForm.templateId} onValueChange={(v) => setPlanForm({ ...planForm, templateId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templatesList.map((t: any) => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Related Type *</Label>
                <Select value={planForm.relatedType} onValueChange={(v) => setPlanForm({ ...planForm, relatedType: v })}>
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
                <Label>Related ID *</Label>
                <Input
                  type="number"
                  value={planForm.relatedId}
                  onChange={(e) => setPlanForm({ ...planForm, relatedId: e.target.value })}
                  placeholder="Enter order/sample/style ID"
                />
              </div>
              <div>
                <Label>Anchor Date Type</Label>
                <Select value={planForm.anchorDateType} onValueChange={(v) => setPlanForm({ ...planForm, anchorDateType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SHIPMENT_DATE">Shipment Date</SelectItem>
                    <SelectItem value="ORDER_DATE">Order Date</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Anchor Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {anchorDate ? format(anchorDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={anchorDate} onSelect={setAnchorDate} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
              <Button onClick={handleGeneratePlan} disabled={generatePlanMutation.isPending}>
                {generatePlanMutation.isPending ? "Generating..." : "Generate Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
