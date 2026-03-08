import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Trash2, ArrowLeft, Send, Save, Loader2, User, Phone, Mail, MapPin, CreditCard, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AIInsightsPanel } from "@/components/ai-insights-panel";
import { DocumentHeader } from "@/components/erp/document-header";

const purchaseOrderSchema = z.object({
  supplierId: z.number({ required_error: "Select a supplier" }),
  orderDate: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  currency: z.string().optional(),
  exchangeRate: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryAddress: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    itemId: z.number(),
    remarks: z.string().optional(),
    quantity: z.string(),
    unitId: z.number().optional().nullable(),
    unitPrice: z.string(),
    taxPercent: z.string().optional().default("0"),
    discountPercent: z.string().optional().default("0"),
  })).min(1, "At least one item required"),
});

type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>;

function calcLineTotal(qty: string, unitPrice: string, taxRate: string, discountPct: string) {
  const q = parseFloat(qty) || 0;
  const p = parseFloat(unitPrice) || 0;
  const t = parseFloat(taxRate) || 0;
  const d = parseFloat(discountPct) || 0;
  const subtotal = q * p;
  const taxAmt = subtotal * (t / 100);
  const discAmt = subtotal * (d / 100);
  return subtotal + taxAmt - discAmt;
}

export default function PurchaseOrderFormPage() {
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const isEditMode = !!params.id;
  const id = params.id;

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const bomId = searchParams.get("bomId");

  const { data: existingPO, isLoading: isLoadingPO } = useQuery<any>({
    queryKey: ["/api/purchase-orders", id],
    enabled: isEditMode,
  });

  const { data: vendors } = useQuery<any[]>({ queryKey: ["/api/vendors"] });
  const { data: materialSuppliers } = useQuery<any[]>({ 
    queryKey: ["/api/accounting/chart-of-accounts/material-suppliers"] 
  });
  const { data: items } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: units } = useQuery<any[]>({ queryKey: ["/api/item-units"] });
  const { data: nextNumber } = useQuery<any>({
    queryKey: ["/api/purchase-orders/next-number"],
    enabled: !isEditMode,
  });

  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      supplierId: undefined as any,
      orderDate: new Date().toISOString().split("T")[0],
      expectedDeliveryDate: "",
      currency: "BDT",
      exchangeRate: "1",
      paymentTerms: "",
      deliveryAddress: "",
      notes: "",
      items: [
        {
          itemId: undefined as any,
          remarks: "",
          quantity: "1",
          unitId: undefined as any,
          unitPrice: "0",
          taxPercent: "0",
          discountPercent: "0",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  useState(() => {
    if (isEditMode && existingPO) {
      form.reset({
        supplierId: existingPO.supplierId,
        orderDate: existingPO.orderDate?.split("T")[0] || "",
        expectedDeliveryDate: existingPO.expectedDeliveryDate?.split("T")[0] || "",
        currency: existingPO.currency || "BDT",
        exchangeRate: existingPO.exchangeRate || "1",
        paymentTerms: existingPO.paymentTerms || "",
        deliveryAddress: existingPO.deliveryAddress || "",
        notes: existingPO.notes || "",
        items: existingPO.items?.length
          ? existingPO.items.map((item: any) => ({
              itemId: item.itemId,
              remarks: item.remarks || "",
              quantity: String(item.quantity || "1"),
              unitId: item.unitId,
              unitPrice: String(item.unitPrice || "0"),
              taxPercent: String(item.taxPercent || "0"),
              discountPercent: String(item.discountPercent || "0"),
            }))
          : [{ itemId: undefined as any, remarks: "", quantity: "1", unitId: undefined as any, unitPrice: "0", taxPercent: "0", discountPercent: "0" }],
      });
    }
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/purchase-orders", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase Order created successfully" });
      setLocation("/inventory/purchase-orders");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create purchase order", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/purchase-orders/${id}`, "PUT", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase Order updated successfully" });
      setLocation("/inventory/purchase-orders");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update purchase order", variant: "destructive" });
    },
  });

  const watchedItems = form.watch("items");

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    (watchedItems || []).forEach((item) => {
      const q = parseFloat(item.quantity) || 0;
      const p = parseFloat(item.unitPrice) || 0;
      const t = parseFloat(item.taxPercent || "0") || 0;
      const d = parseFloat(item.discountPercent || "0") || 0;
      const lineSubtotal = q * p;
      subtotal += lineSubtotal;
      taxTotal += lineSubtotal * (t / 100);
      discountTotal += lineSubtotal * (d / 100);
    });

    return {
      subtotal,
      taxTotal,
      discountTotal,
      grandTotal: subtotal + taxTotal - discountTotal,
    };
  }, [watchedItems]);

  const onSubmit = (data: PurchaseOrderFormValues, status: string = "draft") => {
    const payload = {
      ...data,
      status,
      subtotal: totals.subtotal.toString(),
      taxAmount: totals.taxTotal.toString(),
      totalAmount: totals.grandTotal.toString(),
    };

    if (isEditMode) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const selectedSupplierId = form.watch("supplierId");
  const selectedVendor = useMemo(() => {
    if (!selectedSupplierId || !Array.isArray(vendors)) return null;
    return vendors.find((v: any) => v.id === selectedSupplierId) || null;
  }, [vendors, selectedSupplierId]);

  const matchedMaterialSupplier = useMemo(() => {
    if (!selectedVendor || !Array.isArray(materialSuppliers)) return null;
    const vendorName = (selectedVendor.vendorName || selectedVendor.name || '').toLowerCase().trim();
    if (!vendorName) return null;
    return materialSuppliers.find((ms: any) => {
      const msName = (ms.accountName || ms.name || '').toLowerCase().trim();
      return msName === vendorName || msName.includes(vendorName) || vendorName.includes(msName);
    }) || null;
  }, [selectedVendor, materialSuppliers]);

  if (isEditMode && isLoadingPO) {
    return (
      <DashboardContainer title="Loading..." subtitle="">
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading purchase order...</span>
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer
      title={isEditMode ? "Edit Purchase Order" : "New Purchase Order"}
      subtitle={isEditMode ? `Editing PO #${existingPO?.poNumber || id}` : (nextNumber?.nextNumber ? `Next PO: ${nextNumber.nextNumber}` : "Create a new purchase order")}
      actions={
        <Link href="/inventory/purchase-orders">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
          </Button>
        </Link>
      }
    >
      {isEditMode && existingPO && (
        <DocumentHeader
          title="Purchase Order"
          docNo={existingPO.poNumber || `PO-${id}`}
          date={existingPO.orderDate}
          status={existingPO.status || "draft"}
          amounts={[
            { label: "Total Amount", value: totals.grandTotal },
          ]}
        />
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => onSubmit(data, "draft"))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier *</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : ""}
                        onValueChange={(val) => {
                          const id = parseInt(val);
                          field.onChange(id);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select supplier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.isArray(vendors) && vendors.map((v: any) => (
                            <SelectItem key={v.id} value={String(v.id)}>
                              {v.vendorName || v.name}
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
                  name="orderDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expectedDeliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Delivery Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="BDT">BDT - Bangladeshi Taka</SelectItem>
                          <SelectItem value="USD">USD - US Dollar</SelectItem>
                          <SelectItem value="EUR">EUR - Euro</SelectItem>
                          <SelectItem value="GBP">GBP - British Pound</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="exchangeRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exchange Rate</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.0001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Terms</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Net 30" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>

              <div className="mt-6">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional notes or instructions..." rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {selectedVendor && (
            <Card className="border-blue-100 bg-blue-50/30">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-sm">{selectedVendor.vendorName || selectedVendor.name}</span>
                  {matchedMaterialSupplier && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">Linked Ledger Account</Badge>
                  )}
                </div>
                {matchedMaterialSupplier && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                    {matchedMaterialSupplier.supplierContactPerson && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        <span>{matchedMaterialSupplier.supplierContactPerson}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierPhone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{matchedMaterialSupplier.supplierPhone}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierEmail && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span>{matchedMaterialSupplier.supplierEmail}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierAddress && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>{matchedMaterialSupplier.supplierAddress}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierPaymentTerms && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <CreditCard className="h-3 w-3 shrink-0" />
                        <span>{matchedMaterialSupplier.supplierPaymentTerms}</span>
                      </div>
                    )}
                    {matchedMaterialSupplier.supplierCreditLimit && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <CreditCard className="h-3 w-3 shrink-0" />
                        <span>Limit: {parseFloat(matchedMaterialSupplier.supplierCreditLimit).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="min-w-[200px]">Item</TableHead>
                      <TableHead className="min-w-[150px]">Description</TableHead>
                      <TableHead className="w-24">Qty</TableHead>
                      <TableHead className="w-32">Unit</TableHead>
                      <TableHead className="w-28">Unit Price</TableHead>
                      <TableHead className="w-24">Tax %</TableHead>
                      <TableHead className="w-24">Discount %</TableHead>
                      <TableHead className="w-28 text-right">Total</TableHead>
                      <TableHead className="w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => {
                      const lineItem = watchedItems?.[index];
                      const lineTotal = lineItem
                        ? calcLineTotal(lineItem.quantity, lineItem.unitPrice, lineItem.taxPercent || "0", lineItem.discountPercent || "0")
                        : 0;
                      const currency = form.watch("currency") || "BDT";

                      return (
                        <TableRow key={field.id}>
                          <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.itemId`}
                              render={({ field: f }) => (
                                <Select
                                  value={f.value ? String(f.value) : ""}
                                  onValueChange={(val) => {
                                    f.onChange(parseInt(val));
                                    const selected = items?.find((i: any) => i.id === parseInt(val));
                                    if (selected) {
                                      form.setValue(`items.${index}.remarks`, selected.name || "");
                                      if (selected.unitId) form.setValue(`items.${index}.unitId`, selected.unitId);
                                      if (selected.defaultCost) form.setValue(`items.${index}.unitPrice`, selected.defaultCost);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="min-w-[180px]">
                                    <SelectValue placeholder="Select item" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.isArray(items) && items.map((i: any) => (
                                      <SelectItem key={i.id} value={String(i.id)}>
                                        {i.itemCode} - {i.name}
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
                              name={`items.${index}.remarks`}
                              render={({ field: f }) => (
                                <Input placeholder="Remarks" value={f.value || ""} onChange={f.onChange} className="min-w-[120px]" />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.quantity`}
                              render={({ field: f }) => (
                                <Input type="number" step="0.01" min="0" {...f} className="w-20" />
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
                                  <SelectTrigger className="min-w-[100px]">
                                    <SelectValue placeholder="Unit" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.isArray(units) && units.map((u: any) => (
                                      <SelectItem key={u.id} value={String(u.id)}>
                                        {u.name}
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
                              name={`items.${index}.unitPrice`}
                              render={({ field: f }) => (
                                <Input type="number" step="0.01" min="0" {...f} className="w-24" />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.taxPercent`}
                              render={({ field: f }) => (
                                <Input type="number" step="0.01" min="0" max="100" value={f.value || ""} onChange={f.onChange} className="w-20" />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.discountPercent`}
                              render={({ field: f }) => (
                                <Input type="number" step="0.01" min="0" max="100" value={f.value || ""} onChange={f.onChange} className="w-20" />
                              )}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {currency} {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            {fields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => remove(index)}
                                className="h-8 w-8 p-0 text-destructive"
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

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() =>
                  append({
                    itemId: undefined as any,
                    remarks: "",
                    quantity: "1",
                    unitId: undefined as any,
                    unitPrice: "0",
                    taxPercent: "0",
                    discountPercent: "0",
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" /> Add Item
              </Button>

              <div className="mt-6 flex justify-end">
                <div className="w-full max-w-sm space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{form.watch("currency") || "BDT"} {totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax Total</span>
                    <span>{form.watch("currency") || "BDT"} {totals.taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount Total</span>
                    <span>- {form.watch("currency") || "BDT"} {totals.discountTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-base font-semibold">
                    <span>Grand Total</span>
                    <span>{form.watch("currency") || "BDT"} {totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <AIInsightsPanel 
            context="purchase-order"
            data={{
              items: watchedItems,
              supplierId: form.watch("supplierId"),
              totalAmount: totals.grandTotal,
              currency: form.watch("currency")
            }}
          />

          <div className="flex justify-end gap-3">
            <Link href="/inventory/purchase-orders">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              variant="outline"
              disabled={isPending}
            >
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save as Draft
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={() => form.handleSubmit((data) => onSubmit(data, "pending_approval"))()}
            >
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Submit for Approval
            </Button>
          </div>
        </form>
      </Form>
    </DashboardContainer>
  );
}