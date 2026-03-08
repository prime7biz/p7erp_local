import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Edit, Trash2, Box, Package, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportToExcel } from '@/lib/exportToExcel';
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { AIInsightsPanel } from "@/components/ai-insights-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ErpTable, StatusBadge, ConfirmDialog } from "@/components/erp/erp-table";
import type { ErpTableColumn, ErpFilter } from "@/components/erp/erp-table";

interface Item {
  id: number;
  itemCode: string;
  name: string;
  description: string | null;
  categoryId: number;
  subcategoryId: number | null;
  unitId: number;
  purchaseUnitId: number | null;
  sku: string | null;
  barcode: string | null;
  hasVariants: boolean;
  type: string;
  minStockLevel: string | null;
  maxStockLevel: string | null;
  reorderPoint: string | null;
  leadTimeInDays: number | null;
  isActive: boolean;
  isStockable: boolean;
  isServiceItem: boolean;
  isBillOfMaterial: boolean;
  costMethod: string;
  defaultCost: string | null;
  defaultPrice: string | null;
  images: string[] | null;
  tags: string[] | null;
  attributes: any | null;
  meta: any | null;
  color: string | null;
  size: string | null;
  tenantId: number;
  createdAt: string;
  updatedAt: string;
}

interface ItemCategory {
  id: number;
  categoryId: string;
  name: string;
  description: string | null;
}

interface ItemSubcategory {
  id: number;
  subcategoryId: string;
  name: string;
  description: string | null;
  categoryId: number;
}

interface ItemUnit {
  id: number;
  unitCode: string;
  name: string;
  description: string | null;
  type: string;
  baseUnit: boolean;
  conversionFactor: string | null;
  baseUnitId: number | null;
}

const itemFormSchema = z.object({
  itemCode: z.string().min(2, "Item code must be at least 2 characters").max(20, "Item code cannot exceed 20 characters"),
  name: z.string().min(2, "Name must be at least 2 characters").max(255, "Name cannot exceed 255 characters"),
  description: z.string().optional().nullable(),
  categoryId: z.coerce.number().int().positive("You must select a category"),
  subcategoryId: z.coerce.number().int().positive("You must select a subcategory").optional().nullable(),
  unitId: z.coerce.number().int().positive("You must select a unit of measurement"),
  purchaseUnitId: z.coerce.number().int().positive("You must select a purchase unit").optional().nullable(),
  type: z.string().min(2, "You must select an item type"),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  hasVariants: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isStockable: z.boolean().default(true),
  isServiceItem: z.boolean().default(false),
  isBillOfMaterial: z.boolean().default(false),
  costMethod: z.string().default("average"),
  defaultCost: z.string().optional().nullable(),
  defaultPrice: z.string().optional().nullable(),
  minStockLevel: z.string().optional().nullable(),
  maxStockLevel: z.string().optional().nullable(),
  reorderPoint: z.string().optional().nullable(),
  leadTimeInDays: z.coerce.number().int().min(0).optional().nullable(),
  color: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
});

type ItemFormValues = z.infer<typeof itemFormSchema>;

const itemTypes = [
  { value: "standard", label: "Standard" },
  { value: "fabric", label: "Fabric" },
  { value: "accessory", label: "Accessory" },
  { value: "finishing", label: "Finishing" },
];

const costMethods = [
  { value: "average", label: "Average Cost" },
  { value: "fifo", label: "First In, First Out (FIFO)" },
  { value: "lifo", label: "Last In, First Out (LIFO)" },
  { value: "specific", label: "Specific Identification" },
];

export default function ItemsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const selectedCategory = activeFilters.categoryId ? parseInt(activeFilters.categoryId) : null;
  const selectedType = activeFilters.type || null;
  const isActive = activeFilters.status === "active" ? true : activeFilters.status === "inactive" ? false : null;

  const { data: items, isLoading } = useQuery({
    queryKey: ["/api/items", searchQuery, selectedCategory, selectedType, isActive],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (selectedCategory) params.append("categoryId", selectedCategory.toString());
      if (selectedType) params.append("type", selectedType);
      if (isActive !== null) params.append("isActive", isActive.toString());
      const queryString = params.toString();
      const url = queryString ? `/api/items?${queryString}` : "/api/items";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch items");
      return response.json();
    }
  });

  const { data: categories } = useQuery({
    queryKey: ["/api/item-categories"],
    queryFn: async () => {
      const response = await fetch("/api/item-categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    }
  });

  const { data: subcategories } = useQuery({
    queryKey: ["/api/item-subcategories", selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.append("categoryId", selectedCategory.toString());
      const queryString = params.toString();
      const url = queryString ? `/api/item-subcategories?${queryString}` : "/api/item-subcategories";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch subcategories");
      return response.json();
    }
  });

  const { data: units } = useQuery({
    queryKey: ["/api/item-units"],
    queryFn: async () => {
      const response = await fetch("/api/item-units");
      if (!response.ok) throw new Error("Failed to fetch units");
      return response.json();
    }
  });

  const createItemMutation = useMutation({
    mutationFn: (itemData: ItemFormValues) => apiRequest("/api/items", "POST", itemData),
    onSuccess: () => {
      toast({ title: "Success", description: "Item created successfully" });
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create item", variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ItemFormValues }) => apiRequest(`/api/items/${id}`, "PATCH", data),
    onSuccess: () => {
      toast({ title: "Success", description: "Item updated successfully" });
      setIsEditDialogOpen(false);
      setSelectedItem(null);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update item", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/items/${id}`, "DELETE"),
    onSuccess: () => {
      toast({ title: "Success", description: "Item deleted successfully" });
      setIsDeleteDialogOpen(false);
      setSelectedItem(null);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete item", variant: "destructive" });
    },
  });

  const createForm = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      itemCode: "", name: "", description: "", type: "standard", costMethod: "average",
      isActive: true, isStockable: true, isServiceItem: false, isBillOfMaterial: false, hasVariants: false,
    },
  });

  const editForm = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      itemCode: "", name: "", description: "", type: "standard", costMethod: "average",
      isActive: true, isStockable: true, isServiceItem: false, isBillOfMaterial: false, hasVariants: false,
    },
  });

  const onCreateFormSubmit = (data: ItemFormValues) => createItemMutation.mutate(data);
  const onEditFormSubmit = (data: ItemFormValues) => {
    if (selectedItem) updateItemMutation.mutate({ id: selectedItem.id, data });
  };

  const handleEditItem = (item: Item) => {
    setSelectedItem(item);
    editForm.reset({
      itemCode: item.itemCode, name: item.name, description: item.description || "",
      categoryId: item.categoryId, subcategoryId: item.subcategoryId || undefined,
      unitId: item.unitId, purchaseUnitId: item.purchaseUnitId || undefined,
      type: item.type, sku: item.sku || "", barcode: item.barcode || "",
      hasVariants: item.hasVariants, isActive: item.isActive, isStockable: item.isStockable,
      isServiceItem: item.isServiceItem, isBillOfMaterial: item.isBillOfMaterial,
      costMethod: item.costMethod, defaultCost: item.defaultCost || "",
      defaultPrice: item.defaultPrice || "", minStockLevel: item.minStockLevel || "",
      maxStockLevel: item.maxStockLevel || "", reorderPoint: item.reorderPoint || "",
      leadTimeInDays: item.leadTimeInDays || undefined, color: item.color || "",
      size: item.size || "", tags: item.tags || [],
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteItem = (item: Item) => {
    setSelectedItem(item);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedItem) deleteItemMutation.mutate(selectedItem.id);
  };

  const watchedCategory = createForm.watch("categoryId");
  React.useEffect(() => {
    if (watchedCategory) createForm.setValue("subcategoryId", undefined as any);
  }, [watchedCategory, createForm]);

  const watchedEditCategory = editForm.watch("categoryId");
  React.useEffect(() => {
    if (watchedEditCategory && watchedEditCategory !== selectedItem?.categoryId) {
      editForm.setValue("subcategoryId", undefined as any);
    }
  }, [watchedEditCategory, editForm, selectedItem]);

  const columns: ErpTableColumn<Item>[] = [
    { key: "itemCode", label: "Item Code", sticky: true, width: "120px" },
    { key: "name", label: "Name" },
    {
      key: "categoryId", label: "Category",
      render: (row) => {
        const cat = categories?.find((c: ItemCategory) => c.id === row.categoryId);
        const sub = row.subcategoryId && Array.isArray(subcategories)
          ? subcategories.find((s: ItemSubcategory) => s.id === row.subcategoryId) : null;
        return (
          <div>
            <span>{cat?.name || "N/A"}</span>
            {sub && <span className="text-xs text-muted-foreground block">{sub.name}</span>}
          </div>
        );
      },
    },
    {
      key: "type", label: "Type",
      render: (row) => {
        const colors: Record<string, string> = {
          standard: "bg-blue-100 text-blue-800",
          fabric: "bg-green-100 text-green-800",
          accessory: "bg-purple-100 text-purple-800",
          finishing: "bg-amber-100 text-amber-800",
        };
        return (
          <Badge className={colors[row.type] || "bg-gray-100 text-gray-800"}>
            {itemTypes.find((t) => t.value === row.type)?.label || row.type}
          </Badge>
        );
      },
    },
    {
      key: "unitId", label: "Unit",
      render: (row) => units?.find((u: ItemUnit) => u.id === row.unitId)?.name || "N/A",
    },
    {
      key: "defaultCost", label: "Cost", align: "right", isMoney: true,
      render: (row) => row.defaultCost ? parseFloat(row.defaultCost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—",
    },
    {
      key: "defaultPrice", label: "Price", align: "right", isMoney: true,
      render: (row) => row.defaultPrice ? parseFloat(row.defaultPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—",
    },
    {
      key: "minStockLevel", label: "Stock Level", align: "right",
      render: (row) => row.minStockLevel || "—",
    },
    {
      key: "isActive", label: "Status",
      render: (row) => <StatusBadge status={row.isActive ? "Active" : "Inactive"} />,
    },
  ];

  const categoryFilterOptions = Array.isArray(categories)
    ? categories.map((c: ItemCategory) => ({ label: c.name, value: c.id.toString() }))
    : [];

  const filters: ErpFilter[] = [
    {
      key: "categoryId", label: "Category", type: "select",
      options: categoryFilterOptions,
    },
    {
      key: "type", label: "Type", type: "select",
      options: itemTypes.map((t) => ({ label: t.label, value: t.value })),
    },
    {
      key: "status", label: "Status", type: "select",
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const handleClearFilters = () => setActiveFilters({});

  return (
    <DashboardContainer
      title="Inventory Items"
      subtitle="Manage your product items"
      actions={
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Item
        </Button>
      }
    >
      <ErpTable
        tableId="inventory-items"
        columns={columns}
        data={Array.isArray(items) ? items : []}
        isLoading={isLoading}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search items..."
        filters={filters}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        showTotals={true}
        emptyIcon={<Package className="h-12 w-12 opacity-40" />}
        emptyTitle="No items found"
        emptyDescription="Start by adding your first inventory item"
        emptyAction={{ label: "Add Item", onClick: () => setIsCreateDialogOpen(true) }}
        headerActions={
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Download className="h-4 w-4 mr-1.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportToExcel(
                  Array.isArray(items) ? items : [],
                  [
                    { key: "itemCode", header: "Item Code" },
                    { key: "name", header: "Name" },
                    { key: "type", header: "Type" },
                    { key: "costMethod", header: "Cost Method" },
                    { key: "defaultCost", header: "Default Cost" },
                    { key: "defaultPrice", header: "Default Price" },
                    { key: "minStockLevel", header: "Min Stock" },
                    { key: "isActive", header: "Active" },
                  ],
                  "inventory-items",
                  "xlsx"
                )}>
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportToExcel(
                  Array.isArray(items) ? items : [],
                  [
                    { key: "itemCode", header: "Item Code" },
                    { key: "name", header: "Name" },
                    { key: "type", header: "Type" },
                    { key: "costMethod", header: "Cost Method" },
                    { key: "defaultCost", header: "Default Cost" },
                    { key: "defaultPrice", header: "Default Price" },
                    { key: "minStockLevel", header: "Min Stock" },
                    { key: "isActive", header: "Active" },
                  ],
                  "inventory-items",
                  "csv"
                )}>
                  Export as CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setIsCreateDialogOpen(true)} className="h-9">
              <Plus className="mr-1.5 h-4 w-4" /> Add Item
            </Button>
          </div>
        }
        rowActions={(row) => [
          { label: "Edit", icon: <Edit className="h-4 w-4 mr-2" />, onClick: () => handleEditItem(row) },
          { label: "Delete", icon: <Trash2 className="h-4 w-4 mr-2" />, onClick: () => handleDeleteItem(row), variant: "destructive" },
        ]}
      />

      {/* Create Item Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Item</DialogTitle>
            <DialogDescription>
              Add a new item to your inventory. Fill in the details below.
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreateFormSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={createForm.control} name="itemCode" render={({ field }) => (
                  <FormItem><FormLabel>Item Code*</FormLabel><FormControl><Input placeholder="e.g. ITEM-001" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Name*</FormLabel><FormControl><Input placeholder="e.g. Cotton T-Shirt" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Enter a description" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="categoryId" render={({ field }) => (
                  <FormItem><FormLabel>Category*</FormLabel>
                    <Select value={field.value?.toString() || ""} onValueChange={(value) => field.onChange(parseInt(value))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger></FormControl>
                      <SelectContent>{categories?.map((category: ItemCategory) => (<SelectItem key={category.id} value={category.id.toString()}>{category.name}</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="subcategoryId" render={({ field }) => (
                  <FormItem><FormLabel>Subcategory</FormLabel>
                    <Select value={field.value?.toString() || ""} onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} disabled={!createForm.watch("categoryId")}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a subcategory" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="null">None</SelectItem>
                        {subcategories?.filter((sub: ItemSubcategory) => sub.categoryId === parseInt(createForm.watch("categoryId")?.toString() || "0")).map((subcategory: ItemSubcategory) => (
                          <SelectItem key={subcategory.id} value={subcategory.id.toString()}>{subcategory.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="type" render={({ field }) => (
                  <FormItem><FormLabel>Item Type*</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl>
                      <SelectContent>{itemTypes.map((type) => (<SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="unitId" render={({ field }) => (
                  <FormItem><FormLabel>Unit of Measurement*</FormLabel>
                    <Select value={field.value?.toString() || ""} onValueChange={(value) => field.onChange(parseInt(value))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a unit" /></SelectTrigger></FormControl>
                      <SelectContent>{units?.map((unit: ItemUnit) => (<SelectItem key={unit.id} value={unit.id.toString()}>{unit.name} ({unit.unitCode})</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="sku" render={({ field }) => (
                  <FormItem><FormLabel>SKU</FormLabel><FormControl><Input placeholder="e.g. SKU12345" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="barcode" render={({ field }) => (
                  <FormItem><FormLabel>Barcode</FormLabel><FormControl><Input placeholder="e.g. 123456789" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="costMethod" render={({ field }) => (
                  <FormItem><FormLabel>Cost Method</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a cost method" /></SelectTrigger></FormControl>
                      <SelectContent>{costMethods.map((method) => (<SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="defaultCost" render={({ field }) => (
                  <FormItem><FormLabel>Default Cost</FormLabel><FormControl><Input type="number" placeholder="e.g. 10.50" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="defaultPrice" render={({ field }) => (
                  <FormItem><FormLabel>Default Selling Price</FormLabel><FormControl><Input type="number" placeholder="e.g. 15.99" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <FormField control={createForm.control} name="hasVariants" render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <div className="space-y-1 leading-none"><FormLabel>Has Variants</FormLabel><FormDescription>Item has variations like size, color, etc.</FormDescription></div>
                      </FormItem>
                    )} />
                    <FormField control={createForm.control} name="isStockable" render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <div className="space-y-1 leading-none"><FormLabel>Stockable Item</FormLabel><FormDescription>Track inventory quantity and value</FormDescription></div>
                      </FormItem>
                    )} />
                  </div>
                  <div className="space-y-4">
                    <FormField control={createForm.control} name="isBillOfMaterial" render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <div className="space-y-1 leading-none"><FormLabel>Bill of Materials</FormLabel><FormDescription>Item is assembled from other items</FormDescription></div>
                      </FormItem>
                    )} />
                    <FormField control={createForm.control} name="isActive" render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <div className="space-y-1 leading-none"><FormLabel>Active</FormLabel><FormDescription>Item is active and can be used in transactions</FormDescription></div>
                      </FormItem>
                    )} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createItemMutation.isPending}>
                  {createItemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Item
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>Update item details. Fields marked with * are required.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditFormSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={editForm.control} name="itemCode" render={({ field }) => (
                  <FormItem><FormLabel>Item Code*</FormLabel><FormControl><Input placeholder="e.g. ITEM-001" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Name*</FormLabel><FormControl><Input placeholder="e.g. Cotton T-Shirt" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Enter a description" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="categoryId" render={({ field }) => (
                  <FormItem><FormLabel>Category*</FormLabel>
                    <Select value={field.value?.toString() || ""} onValueChange={(value) => field.onChange(parseInt(value))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger></FormControl>
                      <SelectContent>{categories?.map((category: ItemCategory) => (<SelectItem key={category.id} value={category.id.toString()}>{category.name}</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="subcategoryId" render={({ field }) => (
                  <FormItem><FormLabel>Subcategory</FormLabel>
                    <Select value={field.value?.toString() || ""} onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} disabled={!editForm.watch("categoryId")}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a subcategory" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="null">None</SelectItem>
                        {subcategories?.filter((sub: ItemSubcategory) => sub.categoryId === parseInt(editForm.watch("categoryId")?.toString() || "0")).map((subcategory: ItemSubcategory) => (
                          <SelectItem key={subcategory.id} value={subcategory.id.toString()}>{subcategory.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="type" render={({ field }) => (
                  <FormItem><FormLabel>Item Type*</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl>
                      <SelectContent>{itemTypes.map((type) => (<SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="unitId" render={({ field }) => (
                  <FormItem><FormLabel>Unit of Measurement*</FormLabel>
                    <Select value={field.value?.toString() || ""} onValueChange={(value) => field.onChange(parseInt(value))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a unit" /></SelectTrigger></FormControl>
                      <SelectContent>{units?.map((unit: ItemUnit) => (<SelectItem key={unit.id} value={unit.id.toString()}>{unit.name} ({unit.unitCode})</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateItemMutation.isPending}>
                  {updateItemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Item Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>Are you sure you want to delete this item? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="py-4">
              <p className="mb-2 font-medium">Item Details:</p>
              <p><span className="text-muted-foreground">Code:</span> {selectedItem.itemCode}</p>
              <p><span className="text-muted-foreground">Name:</span> {selectedItem.name}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDeleteDialogOpen(false); setSelectedItem(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteItemMutation.isPending}>
              {deleteItemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AIInsightsPanel context="inventory-dashboard" data={{}} className="mt-6" />
    </DashboardContainer>
  );
}
