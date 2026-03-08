import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Factory, ArrowLeft, ArrowRight, CheckCircle, Package, Truck,
  AlertTriangle, Save, Loader2, Send, ClipboardCheck
} from "lucide-react";

const PROCESS_TYPES = [
  { value: "KNITTING", label: "Knitting" },
  { value: "DYEING", label: "Dyeing" },
  { value: "FINISHING", label: "Finishing" },
  { value: "CUTTING", label: "Cutting" },
  { value: "WASHING", label: "Washing" },
  { value: "PRINTING", label: "Printing" },
];

const processOrderSchema = z.object({
  processType: z.string().min(1, "Process type is required"),
  processMethod: z.enum(["in_house", "subcontract"]),
  linkedOrderId: z.string().optional(),
  vendorId: z.string().optional(),
  warehouseId: z.string().min(1, "Warehouse is required"),
  inputItemId: z.string().min(1, "Input material is required"),
  inputQuantity: z.string().min(1, "Input quantity is required"),
  inputRate: z.string().optional(),
  outputItemId: z.string().min(1, "Output material is required"),
  expectedOutputQty: z.string().min(1, "Expected output quantity is required"),
  expectedWastagePercent: z.string().optional(),
  remarks: z.string().optional(),
});

type ProcessOrderFormValues = z.infer<typeof processOrderSchema>;

function getStatusBadge(status: string) {
  switch (status?.toUpperCase()) {
    case "DRAFT":
      return <Badge variant="outline" className="bg-gray-100 text-gray-800">Draft</Badge>;
    case "ISSUED":
      return <Badge className="bg-blue-100 text-blue-800">Issued</Badge>;
    case "RECEIVED":
      return <Badge className="bg-green-100 text-green-800">Received</Badge>;
    case "APPROVED":
      return <Badge className="bg-purple-100 text-purple-800">Approved</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatCurrency(amount: string | number | null | undefined) {
  if (!amount && amount !== 0) return "BDT 0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "BDT 0.00";
  return `BDT ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ProcessOrderFormPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const isNew = !id || id === "new";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [actualOutputQty, setActualOutputQty] = useState("");
  const [processingCharges, setProcessingCharges] = useState("");

  const { data: order, isLoading: orderLoading } = useQuery<any>({
    queryKey: ["/api/process-orders", id],
    enabled: !isNew && !!id,
  });

  const { data: items } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: orders } = useQuery<any[]>({
    queryKey: ["/api/orders"],
  });

  const { data: vendors } = useQuery<any[]>({
    queryKey: ["/api/vendors"],
  });

  const { data: warehouses } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
  });

  const form = useForm<ProcessOrderFormValues>({
    resolver: zodResolver(processOrderSchema),
    defaultValues: {
      processType: "",
      processMethod: "in_house",
      linkedOrderId: "",
      vendorId: "",
      warehouseId: "",
      inputItemId: "",
      inputQuantity: "",
      inputRate: "",
      outputItemId: "",
      expectedOutputQty: "",
      expectedWastagePercent: "",
      remarks: "",
    },
  });

  const processMethod = form.watch("processMethod");
  const inputQty = parseFloat(form.watch("inputQuantity") || "0");
  const expectedOutQty = parseFloat(form.watch("expectedOutputQty") || "0");

  useEffect(() => {
    if (inputQty > 0 && expectedOutQty > 0 && expectedOutQty <= inputQty) {
      const wastage = ((inputQty - expectedOutQty) / inputQty * 100).toFixed(2);
      form.setValue("expectedWastagePercent", wastage);
    }
  }, [inputQty, expectedOutQty]);

  useEffect(() => {
    if (order && !isNew) {
      form.reset({
        processType: order.processType || "",
        processMethod: order.processMethod || "in_house",
        linkedOrderId: order.linkedOrderId?.toString() || "",
        vendorId: order.vendorId?.toString() || "",
        warehouseId: order.warehouseId?.toString() || "",
        inputItemId: order.inputItemId?.toString() || "",
        inputQuantity: order.inputQuantity?.toString() || "",
        inputRate: order.inputRate?.toString() || "",
        outputItemId: order.outputItemId?.toString() || "",
        expectedOutputQty: order.expectedOutputQty?.toString() || "",
        expectedWastagePercent: order.expectedWastagePercent?.toString() || "",
        remarks: order.remarks || "",
      });
    }
  }, [order, isNew]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/process-orders", "POST", data),
    onSuccess: async (res) => {
      qc.invalidateQueries({ queryKey: ["/api/process-orders"] });
      toast({ title: "Success", description: "Process order created successfully" });
      const result = await res.json();
      navigate(`/inventory/process-orders/${result.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create process order", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/process-orders/${id}`, "PUT", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/process-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/process-orders", id] });
      toast({ title: "Success", description: "Process order updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update process order", variant: "destructive" });
    },
  });

  const issueMutation = useMutation({
    mutationFn: () => apiRequest(`/api/process-orders/${id}/issue`, "POST", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/process-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/process-orders", id] });
      setIssueDialogOpen(false);
      toast({ title: "Success", description: "Materials issued successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to issue materials", variant: "destructive" });
    },
  });

  const receiveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/process-orders/${id}/receive`, "POST", {
        actualOutputQty: parseFloat(actualOutputQty),
        processingCharges: parseFloat(processingCharges || "0"),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/process-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/process-orders", id] });
      setReceiveDialogOpen(false);
      toast({ title: "Success", description: "Output received successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to receive output", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => apiRequest(`/api/process-orders/${id}/approve`, "POST", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/process-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/process-orders", id] });
      setApproveDialogOpen(false);
      toast({ title: "Success", description: "Process order approved successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to approve process order", variant: "destructive" });
    },
  });

  const onSubmit = (values: ProcessOrderFormValues) => {
    const payload = {
      ...values,
      linkedOrderId: values.linkedOrderId ? parseInt(values.linkedOrderId) : null,
      vendorId: values.vendorId ? parseInt(values.vendorId) : null,
      warehouseId: parseInt(values.warehouseId),
      inputItemId: parseInt(values.inputItemId),
      inputQuantity: parseFloat(values.inputQuantity),
      inputRate: values.inputRate ? parseFloat(values.inputRate) : null,
      outputItemId: parseInt(values.outputItemId),
      expectedOutputQty: parseFloat(values.expectedOutputQty),
      expectedWastagePercent: values.expectedWastagePercent ? parseFloat(values.expectedWastagePercent) : null,
    };

    if (isNew) {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate(payload);
    }
  };

  const isViewMode = !isNew && order && order.status?.toUpperCase() !== "DRAFT";
  const currentStatus = order?.status?.toUpperCase();

  if (!isNew && orderLoading) {
    return (
      <DashboardContainer title="Process Order" subtitle="Loading...">
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer
      title={isNew ? "New Process Order" : `Process Order ${order?.processNumber || `#${id}`}`}
      subtitle={isNew ? "Create a new material conversion process" : "View and manage process order"}
      actions={
        <Link href="/inventory/process-orders">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
          </Button>
        </Link>
      }
    >
      {!isNew && order && (
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            {getStatusBadge(order.status)}
          </div>

          {currentStatus === "DRAFT" && (
            <Button size="sm" onClick={() => setIssueDialogOpen(true)}>
              <Send className="mr-2 h-4 w-4" /> Issue Materials
            </Button>
          )}
          {currentStatus === "ISSUED" && (
            <Button size="sm" onClick={() => setReceiveDialogOpen(true)}>
              <Package className="mr-2 h-4 w-4" /> Receive Output
            </Button>
          )}
          {currentStatus === "RECEIVED" && (
            <Button size="sm" onClick={() => setApproveDialogOpen(true)}>
              <CheckCircle className="mr-2 h-4 w-4" /> Approve
            </Button>
          )}
        </div>
      )}

      {isViewMode ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Process Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-muted-foreground text-xs">Process Type</Label>
                    <p className="font-medium">{PROCESS_TYPES.find((t) => t.value === order.processType)?.label || order.processType}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Method</Label>
                    <p className="font-medium flex items-center gap-1">
                      {order.processMethod === "subcontract" ? (
                        <><Truck className="h-4 w-4 text-orange-600" /> Subcontract</>
                      ) : (
                        <><Factory className="h-4 w-4 text-blue-600" /> In-House</>
                      )}
                    </p>
                  </div>
                </div>
                {order.linkedOrderId && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Linked Order</Label>
                    <p className="font-medium">Order #{order.linkedOrderId}</p>
                  </div>
                )}
                {order.vendorId && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Vendor</Label>
                    <p className="font-medium">{order.vendorName || `Vendor #${order.vendorId}`}</p>
                  </div>
                )}
                <div>
                  <Label className="text-muted-foreground text-xs">Warehouse</Label>
                  <p className="font-medium">{order.warehouseName || `Warehouse #${order.warehouseId}`}</p>
                </div>
                {order.remarks && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Remarks</Label>
                    <p className="text-sm">{order.remarks}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Materials</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-muted-foreground text-xs">Input Material</Label>
                  <p className="font-medium">{order.inputItemName || `Item #${order.inputItemId}`}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-muted-foreground text-xs">Input Quantity</Label>
                    <p className="font-medium">{order.inputQuantity}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Input Rate</Label>
                    <p className="font-medium">{formatCurrency(order.inputRate)}</p>
                  </div>
                </div>
                <Separator />
                <div>
                  <Label className="text-muted-foreground text-xs">Output Material</Label>
                  <p className="font-medium">{order.outputItemName || `Item #${order.outputItemId}`}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-muted-foreground text-xs">Expected Output Qty</Label>
                    <p className="font-medium">{order.expectedOutputQty}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Expected Wastage</Label>
                    <p className="font-medium">{order.expectedWastagePercent ? `${order.expectedWastagePercent}%` : "—"}</p>
                  </div>
                </div>
                {order.actualOutputQty !== null && order.actualOutputQty !== undefined && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Actual Output Qty</Label>
                    <p className="font-medium text-green-700">{order.actualOutputQty}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {(currentStatus === "RECEIVED" || currentStatus === "APPROVED") && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Cost Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">Input Value</Label>
                    <p className="text-lg font-bold">{formatCurrency(order.inputValue || (order.inputQuantity * (order.inputRate || 0)))}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Processing Charges</Label>
                    <p className="text-lg font-bold">{formatCurrency(order.processingCharges)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Output Value</Label>
                    <p className="text-lg font-bold text-green-700">{formatCurrency(order.outputValue)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Process Loss</Label>
                    <p className="text-lg font-bold text-red-600">
                      {order.actualOutputQty && order.inputQuantity
                        ? `${(((order.inputQuantity - order.actualOutputQty) / order.inputQuantity) * 100).toFixed(2)}%`
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{isNew ? "Process Order Details" : "Edit Process Order"}</CardTitle>
            <CardDescription>Fill in the details for the material conversion process</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="processType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Process Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select process type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PROCESS_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="processMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Process Method *</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex gap-4 pt-2"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="in_house" id="in_house" />
                              <Label htmlFor="in_house" className="flex items-center gap-1 cursor-pointer">
                                <Factory className="h-4 w-4 text-blue-600" /> In-House
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="subcontract" id="subcontract" />
                              <Label htmlFor="subcontract" className="flex items-center gap-1 cursor-pointer">
                                <Truck className="h-4 w-4 text-orange-600" /> Subcontract
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="linkedOrderId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Linked Order (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select order" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(orders || []).map((o: any) => (
                              <SelectItem key={o.id} value={o.id.toString()}>
                                {o.orderNumber || `Order #${o.id}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {processMethod === "subcontract" && (
                    <FormField
                      control={form.control}
                      name="vendorId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vendor</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select vendor" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {(vendors || []).map((v: any) => (
                                <SelectItem key={v.id} value={v.id.toString()}>
                                  {v.name || v.companyName || `Vendor #${v.id}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="warehouseId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warehouse *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select warehouse" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(warehouses || []).map((w: any) => (
                              <SelectItem key={w.id} value={w.id.toString()}>
                                {w.name || `Warehouse #${w.id}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="inputItemId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Input Material *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select input material" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(items || []).map((item: any) => (
                              <SelectItem key={item.id} value={item.id.toString()}>
                                {item.name} {item.itemCode ? `(${item.itemCode})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="inputQuantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Input Quantity *</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="inputRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Input Rate (BDT)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="Auto from avg" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="outputItemId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Output Material *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select output material" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(items || []).map((item: any) => (
                              <SelectItem key={item.id} value={item.id.toString()}>
                                {item.name} {item.itemCode ? `(${item.itemCode})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expectedOutputQty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Output Qty *</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expectedWastagePercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Wastage %</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="Auto-calculated" readOnly {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Any additional notes..." {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3">
                  <Link href="/inventory/process-orders">
                    <Button type="button" variant="outline">Cancel</Button>
                  </Link>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <Save className="mr-2 h-4 w-4" />
                    {isNew ? "Create Process Order" : "Update Process Order"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Materials</DialogTitle>
            <DialogDescription>
              Are you sure you want to issue materials for this process order? This will deduct input materials from inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-md text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span>This action cannot be undone. Input materials will be consumed.</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending}>
              {issueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" /> Confirm Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Output</DialogTitle>
            <DialogDescription>
              Enter the actual output quantity received from this process.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Actual Output Quantity *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={actualOutputQty}
                onChange={(e) => setActualOutputQty(e.target.value)}
              />
            </div>
            <div>
              <Label>Processing Charges (BDT)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={processingCharges}
                onChange={(e) => setProcessingCharges(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => receiveMutation.mutate()}
              disabled={receiveMutation.isPending || !actualOutputQty}
            >
              {receiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Package className="mr-2 h-4 w-4" /> Receive Output
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Process Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this process order? This will finalize all inventory movements.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle className="mr-2 h-4 w-4" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}

export default ProcessOrderFormPage;
