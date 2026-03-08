import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Trash2, ArrowLeft, CheckCircle, Save, Package, Search, Filter, Loader2, User, Phone, Mail, MapPin, Building2 } from "lucide-react";
import { AIInsightsPanel } from "@/components/ai-insights-panel";

const grnSchema = z.object({
  purchaseOrderId: z.number().optional().nullable(),
  vendorId: z.number({ required_error: "Select a vendor" }),
  warehouseId: z.number({ required_error: "Select a warehouse" }),
  receivingDate: z.string().min(1, "Receiving date required"),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  invoiceAmount: z.string().optional(),
  challanNumber: z.string().optional(),
  vehicleNumber: z.string().optional(),
  transporterName: z.string().optional(),
  notes: z.string().optional(),
  qualityNotes: z.string().optional(),
  items: z.array(z.object({
    itemId: z.number(),
    variantId: z.number().optional().nullable(),
    purchaseOrderItemId: z.number().optional().nullable(),
    orderedQuantity: z.string().optional(),
    receivedQuantity: z.string(),
    acceptedQuantity: z.string().optional(),
    rejectedQuantity: z.string().optional().default("0"),
    unitId: z.number(),
    unitCost: z.string(),
    batchNumber: z.string().optional(),
    qualityStatus: z.string().default("pending"),
    qualityNotes: z.string().optional(),
  })).min(1, "At least one item required"),
});

type GRNFormValues = z.infer<typeof grnSchema>;

function calcLineTotal(qty: string, unitCost: string) {
  const q = parseFloat(qty) || 0;
  const c = parseFloat(unitCost) || 0;
  return q * c;
}

const qualityStatusOptions = [
  { value: "pending", label: "Pending" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "conditional", label: "Conditional" },
];

export default function GRNFormPage() {
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const isEditMode = !!params.id;
  const id = params.id;

  const { data: existingGRN, isLoading: isLoadingGRN } = useQuery<any>({
    queryKey: ["/api/grn", id],
    enabled: isEditMode,
  });

  const { data: purchaseOrders } = useQuery<any[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: vendors } = useQuery<any[]>({ queryKey: ["/api/vendors"] });
  const { data: materialSuppliers } = useQuery<any[]>({ 
    queryKey: ["/api/accounting/chart-of-accounts/material-suppliers"] 
  });
  const { data: warehouses } = useQuery<any[]>({ queryKey: ["/api/warehouses"] });
  const { data: items } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: units } = useQuery<any[]>({ queryKey: ["/api/item-units"] });
  const { data: nextNumber } = useQuery<any>({
    queryKey: ["/api/grn/next-number"],
    enabled: !isEditMode,
  });

  const availablePOs = useMemo(() => {
    if (!purchaseOrders) return [];
    return purchaseOrders.filter((po: any) =>
      po.status === "approved" || po.status === "partially_received"
    );
  }, [purchaseOrders]);

  const vendorList = useMemo(() => {
    if (!Array.isArray(vendors)) return [];
    return vendors.map((v: any) => ({
      id: v.id,
      name: v.vendorName || v.name,
    }));
  }, [vendors]);

  const form = useForm<GRNFormValues>({
    resolver: zodResolver(grnSchema),
    defaultValues: {
      purchaseOrderId: null,
      vendorId: undefined as any,
      warehouseId: undefined as any,
      receivingDate: new Date().toISOString().split("T")[0],
      invoiceNumber: "",
      invoiceDate: "",
      invoiceAmount: "",
      challanNumber: "",
      vehicleNumber: "",
      transporterName: "",
      notes: "",
      qualityNotes: "",
      items: [
        {
          itemId: undefined as any,
          variantId: null,
          purchaseOrderItemId: null,
          orderedQuantity: "",
          receivedQuantity: "1",
          acceptedQuantity: "",
          rejectedQuantity: "0",
          unitId: undefined as any,
          unitCost: "0",
          batchNumber: "",
          qualityStatus: "pending",
          qualityNotes: "",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedVendorId = form.watch("vendorId");
  const selectedVendor = useMemo(() => {
    if (!watchedVendorId || !Array.isArray(vendors)) return null;
    return vendors.find((v: any) => v.id === watchedVendorId) || null;
  }, [watchedVendorId, vendors]);

  const matchedMaterialSupplier = useMemo(() => {
    if (!selectedVendor || !Array.isArray(materialSuppliers)) return null;
    const vendorName = (selectedVendor.vendorName || selectedVendor.name || '').toLowerCase().trim();
    if (!vendorName) return null;
    return materialSuppliers.find((ms: any) => {
      const msName = (ms.accountName || ms.name || '').toLowerCase().trim();
      return msName === vendorName || msName.includes(vendorName) || vendorName.includes(msName);
    }) || null;
  }, [selectedVendor, materialSuppliers]);

  useEffect(() => {
    if (existingGRN && isEditMode) {
      form.reset({
        purchaseOrderId: existingGRN.purchaseOrderId || null,
        vendorId: existingGRN.vendorId,
        warehouseId: existingGRN.warehouseId,
        receivingDate: existingGRN.receivingDate ? new Date(existingGRN.receivingDate).toISOString().split("T")[0] : "",
        invoiceNumber: existingGRN.invoiceNumber || "",
        invoiceDate: existingGRN.invoiceDate ? new Date(existingGRN.invoiceDate).toISOString().split("T")[0] : "",
        invoiceAmount: existingGRN.invoiceAmount || "",
        challanNumber: existingGRN.challanNumber || "",
        vehicleNumber: existingGRN.vehicleNumber || "",
        transporterName: existingGRN.transporterName || "",
        notes: existingGRN.notes || "",
        qualityNotes: existingGRN.qualityNotes || "",
        items: existingGRN.items?.length > 0
          ? existingGRN.items.map((item: any) => ({
              itemId: item.itemId,
              variantId: item.variantId || null,
              purchaseOrderItemId: item.purchaseOrderItemId || null,
              orderedQuantity: item.orderedQuantity || "",
              receivedQuantity: item.receivedQuantity || "0",
              acceptedQuantity: item.acceptedQuantity || "",
              rejectedQuantity: item.rejectedQuantity || "0",
              unitId: item.unitId,
              unitCost: item.unitCost || "0",
              batchNumber: item.batchNumber || "",
              qualityStatus: item.qualityStatus || "pending",
              qualityNotes: item.qualityNotes || "",
            }))
          : [{
              itemId: undefined as any,
              variantId: null,
              purchaseOrderItemId: null,
              orderedQuantity: "",
              receivedQuantity: "1",
              acceptedQuantity: "",
              rejectedQuantity: "0",
              unitId: undefined as any,
              unitCost: "0",
              batchNumber: "",
              qualityStatus: "pending",
              qualityNotes: "",
            }],
      });
    }
  }, [existingGRN, isEditMode, form]);

  const handlePOSelect = (poId: string) => {
    const po = purchaseOrders?.find((p: any) => String(p.id) === poId);
    if (!po) return;

    form.setValue("purchaseOrderId", po.id);
    form.setValue("vendorId", po.vendorId);
    if (po.warehouseId) {
      form.setValue("warehouseId", po.warehouseId);
    }

    if (po.items && po.items.length > 0) {
      const poItems = po.items.map((item: any) => ({
        itemId: item.itemId,
        variantId: item.variantId || null,
        purchaseOrderItemId: item.id || null,
        orderedQuantity: String(item.quantity || item.orderedQuantity || "0"),
        receivedQuantity: String(item.quantity || item.orderedQuantity || "0"),
        acceptedQuantity: "",
        rejectedQuantity: "0",
        unitId: item.unitId,
        unitCost: String(item.unitPrice || item.unitCost || "0"),
        batchNumber: "",
        qualityStatus: "pending",
        qualityNotes: "",
      }));
      form.setValue("items", poItems);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: GRNFormValues) => {
      const res = await apiRequest("/api/grn", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "GRN created successfully" });
      qc.invalidateQueries({ queryKey: ["/api/grn"] });
      setLocation("/inventory/goods-receiving");
    },
    onError: (error: any) => {
      toast({ title: "Error creating GRN", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: GRNFormValues) => {
      const res = await apiRequest(`/api/grn/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "GRN updated successfully" });
      qc.invalidateQueries({ queryKey: ["/api/grn"] });
      qc.invalidateQueries({ queryKey: ["/api/grn", id] });
      setLocation("/inventory/goods-receiving");
    },
    onError: (error: any) => {
      toast({ title: "Error updating GRN", description: error.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (data: GRNFormValues) => {
      if (isEditMode) {
        await apiRequest(`/api/grn/${id}`, "PUT", data);
      } else {
        const res = await apiRequest("/api/grn", "POST", data);
        const created = await res.json();
        await apiRequest(`/api/grn/${created.id}/complete`, "POST");
        return;
      }
      await apiRequest(`/api/grn/${id}/complete`, "POST");
    },
    onSuccess: () => {
      toast({ title: "GRN completed successfully", description: "Stock has been updated." });
      qc.invalidateQueries({ queryKey: ["/api/grn"] });
      setLocation("/inventory/goods-receiving");
    },
    onError: (error: any) => {
      toast({ title: "Error completing GRN", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: GRNFormValues) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const onComplete = () => {
    const data = form.getValues();
    const result = grnSchema.safeParse(data);
    if (!result.success) {
      toast({ title: "Please fix form errors before completing", variant: "destructive" });
      return;
    }
    completeMutation.mutate(result.data);
  };

  const grandTotal = useMemo(() => {
    const watchedItems = form.watch("items");
    return (watchedItems || []).reduce((sum, item) => {
      return sum + calcLineTotal(item.receivedQuantity, item.unitCost);
    }, 0);
  }, [form.watch("items")]);

  if (isEditMode && isLoadingGRN) {
    return (
      <DashboardContainer title="Loading GRN...">
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading...</span>
        </div>
      </DashboardContainer>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending || completeMutation.isPending;

  return (
    <DashboardContainer
      title={isEditMode ? "Edit Goods Receiving Note" : "New Goods Receiving Note"}
      subtitle={nextNumber?.nextNumber ? `GRN Number: ${nextNumber.nextNumber}` : undefined}
      actions={
        <Link href="/inventory/goods-receiving">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to GRN List
          </Button>
        </Link>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>GRN Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>PO Reference</Label>
                  <Select
                    value={form.watch("purchaseOrderId") ? String(form.watch("purchaseOrderId")) : "none"}
                    onValueChange={(val) => {
                      if (val === "none") {
                        form.setValue("purchaseOrderId", null);
                      } else {
                        handlePOSelect(val);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Purchase Order (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No PO Reference</SelectItem>
                      {availablePOs.map((po: any) => (
                        <SelectItem key={po.id} value={String(po.id)}>
                          {po.poNumber || po.purchaseOrderNumber || `PO-${po.id}`} — {po.vendorName || "Unknown Vendor"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <FormField
                  control={form.control}
                  name="vendorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor / Supplier *</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : ""}
                        onValueChange={(val) => field.onChange(parseInt(val))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select vendor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {vendorList.map((v: any) => (
                            <SelectItem key={v.id} value={String(v.id)}>
                              {v.name}
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
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Warehouse *</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : ""}
                        onValueChange={(val) => field.onChange(parseInt(val))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select warehouse" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.isArray(warehouses) && warehouses.map((w: any) => (
                            <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="receivingDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Receiving Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Invoice number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="invoiceDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="invoiceAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Amount</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="challanNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Challan Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Challan number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vehicleNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Vehicle number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="transporterName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transporter Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Transporter name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="md:col-span-2 lg:col-span-3">
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea placeholder="General notes..." rows={2} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="md:col-span-2 lg:col-span-3">
                  <FormField
                    control={form.control}
                    name="qualityNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quality Notes</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Quality inspection notes..." rows={2} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedVendor && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  {selectedVendor.vendorName || selectedVendor.name}
                  {matchedMaterialSupplier && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">Linked Ledger Account</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              {matchedMaterialSupplier && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {matchedMaterialSupplier.supplierContactPerson && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Contact:</span>
                        <span className="font-medium">{matchedMaterialSupplier.supplierContactPerson}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierPhone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Phone:</span>
                        <span className="font-medium">{matchedMaterialSupplier.supplierPhone}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierEmail && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Email:</span>
                        <span className="font-medium">{matchedMaterialSupplier.supplierEmail}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierAddress && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Address:</span>
                        <span className="font-medium">{matchedMaterialSupplier.supplierAddress}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierPaymentTerms && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Payment Terms:</span>
                        <span className="font-medium">{matchedMaterialSupplier.supplierPaymentTerms}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierCreditLimit && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Credit Limit:</span>
                        <span className="font-medium">{parseFloat(matchedMaterialSupplier.supplierCreditLimit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Line Items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    itemId: undefined as any,
                    variantId: null,
                    purchaseOrderItemId: null,
                    orderedQuantity: "",
                    receivedQuantity: "1",
                    acceptedQuantity: "",
                    rejectedQuantity: "0",
                    unitId: undefined as any,
                    unitCost: "0",
                    batchNumber: "",
                    qualityStatus: "pending",
                    qualityNotes: "",
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </CardHeader>
            <CardContent>
              {form.formState.errors.items?.message && (
                <p className="text-sm text-destructive mb-4">{form.formState.errors.items.message}</p>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Item</TableHead>
                      <TableHead className="w-[90px]">Ordered Qty</TableHead>
                      <TableHead className="w-[90px]">Received Qty</TableHead>
                      <TableHead className="w-[90px]">Accepted Qty</TableHead>
                      <TableHead className="w-[90px]">Rejected Qty</TableHead>
                      <TableHead className="w-[120px]">Unit</TableHead>
                      <TableHead className="w-[100px]">Unit Cost</TableHead>
                      <TableHead className="w-[100px]">Total Cost</TableHead>
                      <TableHead className="w-[120px]">Batch No.</TableHead>
                      <TableHead className="w-[130px]">Quality Status</TableHead>
                      <TableHead className="w-[150px]">Quality Notes</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => {
                      const watchedItem = form.watch(`items.${index}`);
                      const lineTotal = calcLineTotal(watchedItem?.receivedQuantity || "0", watchedItem?.unitCost || "0");

                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.itemId`}
                              render={({ field: f }) => (
                                <Select
                                  value={f.value ? String(f.value) : ""}
                                  onValueChange={(val) => f.onChange(parseInt(val))}
                                >
                                  <SelectTrigger className="min-w-[160px]">
                                    <SelectValue placeholder="Select item" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.isArray(items) && items.map((item: any) => (
                                      <SelectItem key={item.id} value={String(item.id)}>
                                        {item.name || item.itemName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.orderedQuantity`}
                              render={({ field: f }) => (
                                <Input
                                  type="number"
                                  className="w-20"
                                  {...f}
                                  disabled
                                  placeholder="—"
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.receivedQuantity`}
                              render={({ field: f }) => (
                                <Input type="number" min="0" step="0.01" className="w-20" {...f} />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.acceptedQuantity`}
                              render={({ field: f }) => (
                                <Input type="number" min="0" step="0.01" className="w-20" {...f} placeholder="—" />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.rejectedQuantity`}
                              render={({ field: f }) => (
                                <Input type="number" min="0" step="0.01" className="w-20" {...f} />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.unitId`}
                              render={({ field: f }) => (
                                <Select
                                  value={f.value ? String(f.value) : ""}
                                  onValueChange={(val) => f.onChange(parseInt(val))}
                                >
                                  <SelectTrigger className="w-[110px]">
                                    <SelectValue placeholder="Unit" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.isArray(units) && units.map((u: any) => (
                                      <SelectItem key={u.id} value={String(u.id)}>
                                        {u.name || u.abbreviation}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.unitCost`}
                              render={({ field: f }) => (
                                <Input type="number" min="0" step="0.01" className="w-24" {...f} />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">
                              {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.batchNumber`}
                              render={({ field: f }) => (
                                <Input className="w-[110px]" placeholder="Batch #" {...f} />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.qualityStatus`}
                              render={({ field: f }) => (
                                <Select value={f.value || "pending"} onValueChange={f.onChange}>
                                  <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {qualityStatusOptions.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.qualityNotes`}
                              render={({ field: f }) => (
                                <Input className="w-[140px]" placeholder="Notes" {...f} />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            {fields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                className="h-8 w-8 text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex justify-end">
                <div className="text-right">
                  <span className="text-sm text-muted-foreground mr-2">Grand Total:</span>
                  <span className="text-lg font-bold">
                    {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <AIInsightsPanel 
            context="grn"
            data={{
              items: form.watch("items"),
              vendorId: form.watch("vendorId"),
              purchaseOrderId: form.watch("purchaseOrderId"),
              invoiceAmount: form.watch("invoiceAmount"),
              grandTotal
            }}
          />

          <div className="flex items-center justify-end gap-3">
            <Link href="/inventory/goods-receiving">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isEditMode ? "Update GRN" : "Save as Draft"}
            </Button>
            <Button type="button" onClick={onComplete} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {completeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Complete GRN
            </Button>
          </div>
        </form>
      </Form>
    </DashboardContainer>
  );
}
