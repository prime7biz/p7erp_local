import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { AIInsightsPanel } from "@/components/ai-insights-panel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Play, CheckCircle, Pause, Factory, Package, Scissors, Droplets,
  Loader2, Save, SkipForward, Layers, Grid3X3, Palette, Printer, Eye, AlertTriangle, Building2
} from "lucide-react";
import { format } from "date-fns";

function stageIcon(stageName: string) {
  const icons: Record<string, string> = {
    yarn_sourcing: "🧵",
    knitting: "🧶",
    dyeing: "🎨",
    printing: "🖨️",
    cutting: "✂️",
    sewing: "🪡",
    washing: "🫧",
    finishing: "📦",
    quality_check: "✅",
  };
  return icons[stageName] || "⚙️";
}

function formatStageName(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusVariant(status: string): "default" | "outline" | "destructive" | "secondary" {
  switch (status) {
    case "completed": return "default";
    case "in_progress": return "secondary";
    case "failed": return "destructive";
    case "skipped": return "outline";
    default: return "outline";
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="outline">Draft</Badge>;
    case "planned":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Planned</Badge>;
    case "in_progress":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">In Progress</Badge>;
    case "on_hold":
      return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">On Hold</Badge>;
    case "completed":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
    case "cancelled":
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: string | number | null | undefined) {
  if (!amount) return "BDT 0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `BDT ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ManufacturingOrderForm() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const isNew = !id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedStage, setSelectedStage] = useState<any>(null);

  const [formData, setFormData] = useState({
    finishedItemId: "",
    bomId: "",
    plannedQuantity: "",
    unit: "pcs",
    plannedStartDate: "",
    plannedEndDate: "",
    targetWarehouseId: "",
    notes: "",
  });

  const [stageEditData, setStageEditData] = useState<any>({});

  const { data: order, isLoading: orderLoading } = useQuery<any>({
    queryKey: ["/api/manufacturing-orders", id],
    enabled: !!id,
  });

  const { data: stages } = useQuery<any[]>({
    queryKey: ["/api/manufacturing-orders", id, "stages"],
    enabled: !!id,
  });

  const { data: processingUnits } = useQuery<any[]>({
    queryKey: ["/api/processing-units"],
  });

  const { data: items } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: warehouses } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: materialSuppliers } = useQuery<any[]>({
    queryKey: ["/api/accounting/chart-of-accounts/material-suppliers"],
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/manufacturing-orders"] });
    if (id) {
      qc.invalidateQueries({ queryKey: ["/api/manufacturing-orders", id] });
      qc.invalidateQueries({ queryKey: ["/api/manufacturing-orders", id, "stages"] });
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/manufacturing-orders", "POST", data),
    onSuccess: async (res) => {
      const result = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/manufacturing-orders"] });
      toast({ title: "Manufacturing Order created with process stages" });
      navigate(`/inventory/manufacturing-orders/${result.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Error creating order", description: error.message, variant: "destructive" });
    },
  });

  const startMutation = useMutation({
    mutationFn: () => apiRequest(`/api/manufacturing-orders/${id}/start`, "POST"),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Manufacturing started" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/manufacturing-orders/${id}/complete`, "POST"),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Manufacturing order completed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const holdMutation = useMutation({
    mutationFn: () => apiRequest(`/api/manufacturing-orders/${id}/hold`, "POST"),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Manufacturing order put on hold" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/manufacturing-orders/${id}/resume`, "POST"),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Manufacturing order resumed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startStageMutation = useMutation({
    mutationFn: (stageId: number) => apiRequest(`/api/manufacturing-orders/stages/${stageId}/start`, "POST"),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Stage started" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const completeStageMutation = useMutation({
    mutationFn: (stageId: number) => apiRequest(`/api/manufacturing-orders/stages/${stageId}/complete`, "POST"),
    onSuccess: () => {
      invalidateAll();
      setSelectedStage(null);
      toast({ title: "Stage completed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const skipStageMutation = useMutation({
    mutationFn: (stageId: number) => apiRequest(`/api/manufacturing-orders/stages/${stageId}/skip`, "POST"),
    onSuccess: () => {
      invalidateAll();
      setSelectedStage(null);
      toast({ title: "Stage skipped" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ stageId, data }: { stageId: number; data: any }) =>
      apiRequest(`/api/manufacturing-orders/stages/${stageId}`, "PUT", data),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Stage updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      finishedItemId: formData.finishedItemId ? parseInt(formData.finishedItemId) : null,
      bomId: formData.bomId ? parseInt(formData.bomId) : null,
      plannedQuantity: parseFloat(formData.plannedQuantity) || 0,
      unit: formData.unit,
      plannedStartDate: formData.plannedStartDate || null,
      plannedEndDate: formData.plannedEndDate || null,
      targetWarehouseId: formData.targetWarehouseId ? parseInt(formData.targetWarehouseId) : null,
      notes: formData.notes || null,
    });
  };

  const handleSelectStage = (stage: any) => {
    setSelectedStage(stage);
    setStageEditData({
      processingUnitId: stage.processingUnitId || "",
      supplierId: stage.supplierId || "",
      stageType: stage.stageType || "internal",
      inputQuantity: stage.inputQuantity || "",
      outputQuantity: stage.outputQuantity || "",
      expectedLossPercentage: stage.expectedLossPercentage || "",
      processingCost: stage.processingCost || "",
      materialCost: stage.materialCost || "",
      overheadCost: stage.overheadCost || "",
      gatePassOutNumber: stage.gatePassOutNumber || "",
      gatePassInNumber: stage.gatePassInNumber || "",
      challanNumber: stage.challanNumber || "",
      startDate: stage.startDate || "",
      endDate: stage.endDate || "",
      qualityCheckResult: stage.qualityCheckResult || "",
      notes: stage.notes || "",
    });
  };

  const handleSaveStage = () => {
    if (!selectedStage) return;
    updateStageMutation.mutate({
      stageId: selectedStage.id,
      data: {
        processingUnitId: stageEditData.processingUnitId ? parseInt(stageEditData.processingUnitId) : null,
        supplierId: stageEditData.supplierId ? parseInt(stageEditData.supplierId) : null,
        stageType: stageEditData.stageType || "internal",
        inputQuantity: stageEditData.inputQuantity ? parseFloat(stageEditData.inputQuantity) : null,
        outputQuantity: stageEditData.outputQuantity ? parseFloat(stageEditData.outputQuantity) : null,
        expectedLossPercentage: stageEditData.expectedLossPercentage ? parseFloat(stageEditData.expectedLossPercentage) : null,
        processingCost: stageEditData.processingCost ? parseFloat(stageEditData.processingCost) : null,
        materialCost: stageEditData.materialCost ? parseFloat(stageEditData.materialCost) : null,
        overheadCost: stageEditData.overheadCost ? parseFloat(stageEditData.overheadCost) : null,
        gatePassOutNumber: stageEditData.gatePassOutNumber || null,
        gatePassInNumber: stageEditData.gatePassInNumber || null,
        challanNumber: stageEditData.challanNumber || null,
        startDate: stageEditData.startDate || null,
        endDate: stageEditData.endDate || null,
        qualityCheckResult: stageEditData.qualityCheckResult || null,
        notes: stageEditData.notes || null,
      },
    });
  };

  if (isNew) {
    return (
      <DashboardContainer
        title="New Manufacturing Order"
        subtitle="Create a new manufacturing order to track garment production"
        actions={
          <Link href="/inventory/manufacturing-orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
            </Button>
          </Link>
        }
      >
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Manufacturing Order Details
            </CardTitle>
            <CardDescription>Fill in the details to create a new manufacturing order. Process stages will be automatically generated.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Finished Item *</Label>
                <Select value={formData.finishedItemId} onValueChange={(v) => setFormData({ ...formData, finishedItemId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select finished item" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(items) && items.map((item: any) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name || item.itemName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Bill of Materials (BOM)</Label>
                <Input
                  placeholder="BOM ID (optional)"
                  value={formData.bomId}
                  onChange={(e) => setFormData({ ...formData, bomId: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Planned Quantity *</Label>
                <Input
                  type="number"
                  placeholder="e.g., 1000"
                  value={formData.plannedQuantity}
                  onChange={(e) => setFormData({ ...formData, plannedQuantity: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                    <SelectItem value="dozen">Dozen</SelectItem>
                    <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    <SelectItem value="meter">Meters</SelectItem>
                    <SelectItem value="yard">Yards</SelectItem>
                    <SelectItem value="set">Sets</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Planned Start Date</Label>
                <Input
                  type="date"
                  value={formData.plannedStartDate}
                  onChange={(e) => setFormData({ ...formData, plannedStartDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Planned End Date</Label>
                <Input
                  type="date"
                  value={formData.plannedEndDate}
                  onChange={(e) => setFormData({ ...formData, plannedEndDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Target Warehouse</Label>
                <Select value={formData.targetWarehouseId} onValueChange={(v) => setFormData({ ...formData, targetWarehouseId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(warehouses) && warehouses.map((wh: any) => (
                      <SelectItem key={wh.id} value={String(wh.id)}>
                        {wh.name || wh.warehouseName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Add any special instructions or notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Creating this order will automatically generate 9 default manufacturing process stages:
                Yarn Sourcing → Knitting → Dyeing → Printing → Cutting → Sewing → Washing → Finishing → Quality Check
              </p>
            </div>

            <AIInsightsPanel 
              context="purchase-order"
              data={{}}
              className="mt-6"
            />

            <div className="flex gap-3">
              <Button onClick={handleCreate} disabled={createMutation.isPending || !formData.plannedQuantity}>
                {createMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Create Manufacturing Order
              </Button>
              <Link href="/inventory/manufacturing-orders">
                <Button variant="outline">Cancel</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </DashboardContainer>
    );
  }

  if (orderLoading) {
    return (
      <DashboardContainer title="Manufacturing Order" subtitle="Loading...">
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading manufacturing order...</span>
        </div>
      </DashboardContainer>
    );
  }

  const processLoss = parseFloat(order?.processLossPercentage || order?.totalProcessLoss || "0");
  const allStagesComplete = stages?.every((s: any) => s.status === "completed" || s.status === "skipped") || false;

  return (
    <DashboardContainer
      title={order?.moNumber || `Manufacturing Order #${id}`}
      subtitle="Manufacturing order detail with process stage workflow"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/inventory/manufacturing-orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
            </Button>
          </Link>
          {(order?.status === "draft" || order?.status === "planned") && (
            <Button size="sm" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              {startMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start Production
            </Button>
          )}
          {order?.status === "in_progress" && allStagesComplete && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              {completeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Complete Manufacturing
            </Button>
          )}
          {order?.status === "in_progress" && (
            <Button size="sm" variant="outline" onClick={() => holdMutation.mutate()} disabled={holdMutation.isPending}>
              <Pause className="mr-2 h-4 w-4" /> Put On Hold
            </Button>
          )}
          {order?.status === "on_hold" && (
            <Button size="sm" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
              <Play className="mr-2 h-4 w-4" /> Resume
            </Button>
          )}
        </div>
      }
    >
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5" />
                {order?.moNumber || `MO-${id}`}
              </CardTitle>
              <CardDescription>
                {order?.finishedItemName || order?.itemName || "Manufacturing Order"}
              </CardDescription>
            </div>
            <div>{getStatusBadge(order?.status || "draft")}</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Planned Qty</p>
              <p className="font-semibold">{order?.plannedQuantity || 0} {order?.unit || "pcs"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed Qty</p>
              <p className="font-semibold">{order?.completedQuantity || 0} {order?.unit || "pcs"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Process Loss</p>
              <p className={cn("font-semibold", processLoss > 5 && "text-red-600")}>
                {processLoss > 0 ? `${processLoss.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Cost</p>
              <p className="font-semibold">{formatCurrency(order?.totalCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Planned Start</p>
              <p className="font-semibold">{formatDate(order?.plannedStartDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Planned End</p>
              <p className="font-semibold">{formatDate(order?.plannedEndDate)}</p>
            </div>
          </div>
          {order?.notes && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{order.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Process Stage Workflow</CardTitle>
          <CardDescription>Click on a stage to view details and manage it</CardDescription>
        </CardHeader>
        <CardContent>
          {!stages || stages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Factory className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No process stages found for this order.</p>
            </div>
          ) : (
            <div className="flex items-center overflow-x-auto gap-2 py-4 px-2">
              {stages.map((stage: any, index: number) => (
                <Fragment key={stage.id}>
                  <div
                    onClick={() => handleSelectStage(stage)}
                    className={cn(
                      "flex-shrink-0 w-32 p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md",
                      stage.status === "completed" && "border-green-500 bg-green-50",
                      stage.status === "in_progress" && "border-yellow-500 bg-yellow-50 animate-pulse",
                      stage.status === "pending" && "border-gray-300 bg-gray-50",
                      stage.status === "skipped" && "border-gray-200 bg-gray-100 opacity-60",
                      stage.status === "failed" && "border-red-500 bg-red-50",
                      selectedStage?.id === stage.id && "ring-2 ring-primary shadow-lg",
                    )}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">{stageIcon(stage.stageName)}</div>
                      <div className={cn(
                        "text-xs font-medium truncate",
                        stage.status === "skipped" && "line-through"
                      )}>
                        {formatStageName(stage.stageName)}
                      </div>
                      <Badge variant={statusVariant(stage.status)} className="mt-1 text-[10px]">
                        {stage.status === "in_progress" ? "active" : stage.status}
                      </Badge>
                      {stage.inputQuantity > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          In: {stage.inputQuantity} → Out: {stage.outputQuantity || "—"}
                        </div>
                      )}
                      {parseFloat(stage.processLossPercentage || "0") > 0 && (
                        <div className="text-xs text-red-500 mt-1">
                          {parseFloat(stage.processLossPercentage).toFixed(1)}% loss
                        </div>
                      )}
                      {stage.processingUnitName && (
                        <div className="text-[10px] text-blue-600 mt-1 truncate">
                          {stage.processingUnitName}
                        </div>
                      )}
                      {stage.supplierId && (() => {
                        const supplier = Array.isArray(materialSuppliers) && materialSuppliers.find((s: any) => s.id === stage.supplierId);
                        return supplier ? (
                          <div className="flex items-center justify-center gap-0.5 mt-1">
                            <Building2 className="h-2.5 w-2.5 text-purple-600" />
                            <span className="text-[9px] text-purple-600 font-medium truncate">{supplier.name}</span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {index < stages.length - 1 && (
                    <div className={cn(
                      "flex-shrink-0 text-xl font-bold",
                      stages[index + 1]?.status === "completed" || stage.status === "completed"
                        ? "text-green-400"
                        : "text-muted-foreground"
                    )}>
                      →
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedStage && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">{stageIcon(selectedStage.stageName)}</span>
                  {formatStageName(selectedStage.stageName)} — Stage Details
                </CardTitle>
                <CardDescription>
                  Stage #{selectedStage.stageOrder} • {selectedStage.status}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {selectedStage.status === "pending" && (
                  <Button
                    size="sm"
                    onClick={() => startStageMutation.mutate(selectedStage.id)}
                    disabled={startStageMutation.isPending}
                  >
                    {startStageMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Start Stage
                  </Button>
                )}
                {selectedStage.status === "in_progress" && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => completeStageMutation.mutate(selectedStage.id)}
                    disabled={completeStageMutation.isPending}
                  >
                    {completeStageMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    Complete Stage
                  </Button>
                )}
                {(selectedStage.status === "pending" || selectedStage.status === "in_progress") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => skipStageMutation.mutate(selectedStage.id)}
                    disabled={skipStageMutation.isPending}
                  >
                    <SkipForward className="mr-2 h-4 w-4" /> Skip Stage
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedStage(null)}>
                  ✕
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Processing Unit</Label>
                <Select
                  value={stageEditData.processingUnitId ? String(stageEditData.processingUnitId) : "none"}
                  onValueChange={(v) => setStageEditData({ ...stageEditData, processingUnitId: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select processing unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {Array.isArray(processingUnits) && processingUnits.map((pu: any) => (
                      <SelectItem key={pu.id} value={String(pu.id)}>
                        {pu.name || pu.unitName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Supplier / Subcontractor</Label>
                <Select
                  value={stageEditData.supplierId ? String(stageEditData.supplierId) : "none"}
                  onValueChange={(v) => setStageEditData({ ...stageEditData, supplierId: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {Array.isArray(materialSuppliers) && materialSuppliers.map((sup: any) => (
                      <SelectItem key={sup.id} value={String(sup.id)}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <span>{sup.name}</span>
                          {sup.accountNumber && <span className="text-xs text-muted-foreground">({sup.accountNumber})</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Stage Type</Label>
                <Select value={stageEditData.stageType || "internal"} onValueChange={(v) => setStageEditData({ ...stageEditData, stageType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="subcontract">Subcontract</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Expected Loss %</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={stageEditData.expectedLossPercentage}
                  onChange={(e) => setStageEditData({ ...stageEditData, expectedLossPercentage: e.target.value })}
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Input Quantity</Label>
                <Input
                  type="number"
                  value={stageEditData.inputQuantity}
                  onChange={(e) => {
                    const input = parseFloat(e.target.value) || 0;
                    const loss = parseFloat(stageEditData.expectedLossPercentage) || 0;
                    const output = input - (input * loss / 100);
                    setStageEditData({
                      ...stageEditData,
                      inputQuantity: e.target.value,
                      outputQuantity: output > 0 ? output.toFixed(2) : "",
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Output Quantity</Label>
                <Input
                  type="number"
                  value={stageEditData.outputQuantity}
                  onChange={(e) => setStageEditData({ ...stageEditData, outputQuantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Actual Loss</Label>
                <div className="flex items-center gap-2 mt-1">
                  {stageEditData.inputQuantity && stageEditData.outputQuantity ? (
                    <>
                      <span className="text-sm font-medium">
                        {(parseFloat(stageEditData.inputQuantity) - parseFloat(stageEditData.outputQuantity)).toFixed(2)} units
                      </span>
                      <Badge variant={
                        ((parseFloat(stageEditData.inputQuantity) - parseFloat(stageEditData.outputQuantity)) / parseFloat(stageEditData.inputQuantity) * 100) > 5
                          ? "destructive" : "outline"
                      }>
                        {((parseFloat(stageEditData.inputQuantity) - parseFloat(stageEditData.outputQuantity)) / parseFloat(stageEditData.inputQuantity) * 100).toFixed(1)}%
                      </Badge>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Enter quantities to calculate</span>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Processing Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={stageEditData.processingCost}
                  onChange={(e) => setStageEditData({ ...stageEditData, processingCost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Material Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={stageEditData.materialCost}
                  onChange={(e) => setStageEditData({ ...stageEditData, materialCost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Overhead Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={stageEditData.overheadCost}
                  onChange={(e) => setStageEditData({ ...stageEditData, overheadCost: e.target.value })}
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Gate Pass Out #</Label>
                <Input
                  value={stageEditData.gatePassOutNumber}
                  onChange={(e) => setStageEditData({ ...stageEditData, gatePassOutNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Gate Pass In #</Label>
                <Input
                  value={stageEditData.gatePassInNumber}
                  onChange={(e) => setStageEditData({ ...stageEditData, gatePassInNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Challan Number</Label>
                <Input
                  value={stageEditData.challanNumber}
                  onChange={(e) => setStageEditData({ ...stageEditData, challanNumber: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={stageEditData.startDate ? stageEditData.startDate.split("T")[0] : ""}
                  onChange={(e) => setStageEditData({ ...stageEditData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={stageEditData.endDate ? stageEditData.endDate.split("T")[0] : ""}
                  onChange={(e) => setStageEditData({ ...stageEditData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Quality Check Result</Label>
              <Select
                value={stageEditData.qualityCheckResult || "none"}
                onValueChange={(v) => setStageEditData({ ...stageEditData, qualityCheckResult: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select result" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not checked</SelectItem>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                  <SelectItem value="conditional">Conditional Pass</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Stage notes or observations..."
                value={stageEditData.notes}
                onChange={(e) => setStageEditData({ ...stageEditData, notes: e.target.value })}
                rows={3}
              />
            </div>

            {selectedStage.materials && selectedStage.materials.length > 0 && (
              <>
                <Separator />
                <div>
                  <Label className="text-sm font-semibold">Materials</Label>
                  <div className="mt-2 space-y-2">
                    {selectedStage.materials.map((mat: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                        <span>{mat.materialName || mat.name}</span>
                        <span>{mat.quantity} {mat.unit}</span>
                        <Badge variant={mat.type === "input" ? "outline" : "default"}>
                          {mat.type || "input"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveStage} disabled={updateStageMutation.isPending}>
                {updateStageMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Stage Changes
              </Button>
              <Button variant="outline" onClick={() => setSelectedStage(null)}>
                Close
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardContainer>
  );
}
