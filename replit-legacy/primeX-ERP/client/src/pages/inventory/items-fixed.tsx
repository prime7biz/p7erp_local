import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Filter, Search, MoreHorizontal, Edit, Trash2, Layers, Box, Clipboard, Tag } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";

// Define Item type based on schema
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

// Create validation schema for item form
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

// Item type filter options
const itemTypes = [
  { value: "standard", label: "Standard" },
  { value: "fabric", label: "Fabric" },
  { value: "accessory", label: "Accessory" },
  { value: "finishing", label: "Finishing" },
];

// Cost method options
const costMethods = [
  { value: "average", label: "Average Cost" },
  { value: "fifo", label: "First In, First Out (FIFO)" },
  { value: "lifo", label: "Last In, First Out (LIFO)" },
  { value: "specific", label: "Specific Identification" },
];

export default function ItemsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean | null>(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch items with filtering
  const { data: items, isLoading, isError } = useQuery({
    queryKey: ["/api/items", searchQuery, selectedCategory, selectedSubcategory, selectedType, isActive],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      if (searchQuery) params.append("search", searchQuery);
      if (selectedCategory) params.append("categoryId", selectedCategory.toString());
      if (selectedSubcategory) params.append("subcategoryId", selectedSubcategory.toString());
      if (selectedType) params.append("type", selectedType);
      if (isActive !== null) params.append("isActive", isActive.toString());
      
      const queryString = params.toString();
      const url = queryString ? `/api/items?${queryString}` : "/api/items";
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch items");
      }
      return response.json();
    }
  });

  // Fetch categories for dropdown
  const { data: categories } = useQuery({
    queryKey: ["/api/item-categories"],
    queryFn: async () => {
      const response = await fetch("/api/item-categories");
      if (!response.ok) {
        throw new Error("Failed to fetch categories");
      }
      return response.json();
    }
  });

  // Fetch subcategories for dropdown
  const { data: subcategories } = useQuery({
    queryKey: ["/api/item-subcategories", selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.append("categoryId", selectedCategory.toString());
      
      const queryString = params.toString();
      const url = queryString ? `/api/item-subcategories?${queryString}` : "/api/item-subcategories";
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch subcategories");
      }
      return response.json();
    }
  });

  // Fetch units for dropdown
  const { data: units } = useQuery({
    queryKey: ["/api/item-units"],
    queryFn: async () => {
      const response = await fetch("/api/item-units");
      if (!response.ok) {
        throw new Error("Failed to fetch units");
      }
      return response.json();
    }
  });

  // Create item mutation
  const createItemMutation = useMutation({
    mutationFn: (itemData: ItemFormValues) => {
      return apiRequest("/api/items", "POST", itemData);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item created successfully",
      });
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create item",
        variant: "destructive",
      });
    },
  });

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ItemFormValues }) => {
      return apiRequest(`/api/items/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item updated successfully",
      });
      setIsEditDialogOpen(false);
      setSelectedItem(null);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update item",
        variant: "destructive",
      });
    },
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest(`/api/items/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item deleted successfully",
      });
      setIsDeleteDialogOpen(false);
      setSelectedItem(null);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete item",
        variant: "destructive",
      });
    },
  });

  // Create form
  const createForm = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      itemCode: "",
      name: "",
      description: "",
      type: "standard",
      costMethod: "average",
      isActive: true,
      isStockable: true,
      isServiceItem: false,
      isBillOfMaterial: false,
      hasVariants: false,
    },
  });

  // Edit form
  const editForm = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      itemCode: "",
      name: "",
      description: "",
      type: "standard",
      costMethod: "average",
      isActive: true,
      isStockable: true,
      isServiceItem: false,
      isBillOfMaterial: false,
      hasVariants: false,
    },
  });

  // Handle create form submission
  const onCreateFormSubmit = (data: ItemFormValues) => {
    createItemMutation.mutate(data);
  };

  // Handle edit form submission
  const onEditFormSubmit = (data: ItemFormValues) => {
    if (selectedItem) {
      updateItemMutation.mutate({ id: selectedItem.id, data });
    }
  };

  // Handle edit button click
  const handleEditItem = (item: Item) => {
    setSelectedItem(item);
    
    // Reset form with item data
    editForm.reset({
      itemCode: item.itemCode,
      name: item.name,
      description: item.description || "",
      categoryId: item.categoryId,
      subcategoryId: item.subcategoryId || undefined,
      unitId: item.unitId,
      purchaseUnitId: item.purchaseUnitId || undefined,
      type: item.type,
      sku: item.sku || "",
      barcode: item.barcode || "",
      hasVariants: item.hasVariants,
      isActive: item.isActive,
      isStockable: item.isStockable,
      isServiceItem: item.isServiceItem,
      isBillOfMaterial: item.isBillOfMaterial,
      costMethod: item.costMethod,
      defaultCost: item.defaultCost || "",
      defaultPrice: item.defaultPrice || "",
      minStockLevel: item.minStockLevel || "",
      maxStockLevel: item.maxStockLevel || "",
      reorderPoint: item.reorderPoint || "",
      leadTimeInDays: item.leadTimeInDays || undefined,
      color: item.color || "",
      size: item.size || "",
      tags: item.tags || [],
    });
    
    setIsEditDialogOpen(true);
  };

  // Handle delete button click
  const handleDeleteItem = (item: Item) => {
    setSelectedItem(item);
    setIsDeleteDialogOpen(true);
  };

  // Handle delete confirmation
  const confirmDelete = () => {
    if (selectedItem) {
      deleteItemMutation.mutate(selectedItem.id);
    }
  };

  // Create form watching for category change to update subcategory options
  const watchedCategory = createForm.watch("categoryId");
  React.useEffect(() => {
    if (watchedCategory) {
      createForm.setValue("subcategoryId", undefined as any);
    }
  }, [watchedCategory, createForm]);

  // Edit form watching for category change to update subcategory options
  const watchedEditCategory = editForm.watch("categoryId");
  React.useEffect(() => {
    if (watchedEditCategory && watchedEditCategory !== selectedItem?.categoryId) {
      editForm.setValue("subcategoryId", undefined as any);
    }
  }, [watchedEditCategory, editForm, selectedItem]);

  const getItemTypeBadgeColor = (type: string) => {
    switch (type) {
      case "standard":
        return "bg-blue-100 text-blue-800";
      case "fabric":
        return "bg-green-100 text-green-800";
      case "accessory":
        return "bg-purple-100 text-purple-800";
      case "finishing":
        return "bg-amber-100 text-amber-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

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
      {/* Filters & Search */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <Select
          value={selectedCategory?.toString() || "all"}
          onValueChange={(value) => setSelectedCategory(value ? parseInt(value) : null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Array.isArray(categories) 
              ? categories.map((category: ItemCategory) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))
              : null}
          </SelectContent>
        </Select>
        
        <Select
          value={selectedSubcategory?.toString() || "all"}
          onValueChange={(value) => setSelectedSubcategory(value ? parseInt(value) : null)}
          disabled={!selectedCategory}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Subcategories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subcategories</SelectItem>
            {Array.isArray(subcategories) 
              ? subcategories
                  .filter((subcategory: ItemSubcategory) => 
                    !selectedCategory || subcategory.categoryId === selectedCategory
                  )
                  .map((subcategory: ItemSubcategory) => (
                    <SelectItem key={subcategory.id} value={subcategory.id.toString()}>
                      {subcategory.name}
                    </SelectItem>
                  ))
              : null}
          </SelectContent>
        </Select>
        
        <Select
          value={selectedType || "all"}
          onValueChange={(value) => setSelectedType(value !== "all" ? value : null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {itemTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select
          value={isActive === null ? "all" : isActive ? "active" : "inactive"}
          onValueChange={(value) => 
            setIsActive(
              value === "all" ? null : value === "active"
            )}
        >
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Items</CardTitle>
          <CardDescription>
            {selectedCategory || selectedSubcategory || selectedType ? (
              <span className="flex items-center gap-1">
                <Filter className="h-4 w-4" /> Filtered results
              </span>
            ) : (
              <span>Showing all inventory items</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading items...</span>
            </div>
          ) : isError ? (
            <div className="flex h-96 flex-col items-center justify-center">
              <p className="text-destructive">Error loading items.</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/items"] })}
              >
                Retry
              </Button>
            </div>
          ) : !items || items.length === 0 ? (
            <EmptyState 
              icon={<Box className="h-10 w-10" />}
              title="No items found"
              description="Get started by creating your first inventory item."
              actions={
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Item
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: Item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.itemCode}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        {categories?.find((c: ItemCategory) => c.id === item.categoryId)?.name || "N/A"}
                        {item.subcategoryId && (
                          <span className="text-xs text-muted-foreground block">
                            {subcategories?.find((s: ItemSubcategory) => s.id === item.subcategoryId)?.name || ""}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={getItemTypeBadgeColor(item.type)}>
                          {itemTypes.find((t) => t.value === item.type)?.label || item.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {units?.find((u: ItemUnit) => u.id === item.unitId)?.name || "N/A"}
                      </TableCell>
                      <TableCell>
                        {item.isActive ? (
                          <Badge className="bg-green-100 text-green-800">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEditItem(item)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDeleteItem(item)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
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
                <FormField
                  control={createForm.control}
                  name="itemCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Code*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. ITEM-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Cotton T-Shirt" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter a description" 
                          {...field} 
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category*</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={(value) => field.onChange(parseInt(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories?.map((category: ItemCategory) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subcategory</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                        disabled={!createForm.watch("categoryId")}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a subcategory" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">None</SelectItem>
                          {subcategories
                            ?.filter((sub: ItemSubcategory) => 
                              sub.categoryId === parseInt(createForm.watch("categoryId")?.toString() || "0")
                            )
                            .map((subcategory: ItemSubcategory) => (
                              <SelectItem key={subcategory.id} value={subcategory.id.toString()}>
                                {subcategory.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Type*</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {itemTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="unitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit of Measurement*</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={(value) => field.onChange(parseInt(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {units?.map((unit: ItemUnit) => (
                            <SelectItem key={unit.id} value={unit.id.toString()}>
                              {unit.name} ({unit.unitCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. SKU12345" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Barcode</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 123456789" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="costMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Method</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a cost method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {costMethods.map((method) => (
                            <SelectItem key={method.value} value={method.value}>
                              {method.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="defaultCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Cost</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="e.g. 10.50" 
                          {...field} 
                          value={field.value || ""} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="defaultPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Selling Price</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="e.g. 15.99" 
                          {...field} 
                          value={field.value || ""} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="hasVariants"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Has Variants</FormLabel>
                            <FormDescription>
                              Item has variations like size, color, etc.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="isStockable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Stockable Item</FormLabel>
                            <FormDescription>
                              Track inventory quantity and value
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="isBillOfMaterial"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Bill of Materials</FormLabel>
                            <FormDescription>
                              Item is assembled from other items
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Active</FormLabel>
                            <FormDescription>
                              Item is active and can be used in transactions
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <DialogFooter>
                <Button 
                  type="submit" 
                  disabled={createItemMutation.isPending}
                >
                  {createItemMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
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
            <DialogDescription>
              Update item details. Fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditFormSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={editForm.control}
                  name="itemCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Code*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. ITEM-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Cotton T-Shirt" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter a description" 
                          {...field} 
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category*</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={(value) => field.onChange(parseInt(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories?.map((category: ItemCategory) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subcategory</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                        disabled={!editForm.watch("categoryId")}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a subcategory" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">None</SelectItem>
                          {subcategories
                            ?.filter((sub: ItemSubcategory) => 
                              sub.categoryId === parseInt(editForm.watch("categoryId")?.toString() || "0")
                            )
                            .map((subcategory: ItemSubcategory) => (
                              <SelectItem key={subcategory.id} value={subcategory.id.toString()}>
                                {subcategory.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Other fields similar to create form */}
                <FormField
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Type*</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {itemTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="unitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit of Measurement*</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={(value) => field.onChange(parseInt(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {units?.map((unit: ItemUnit) => (
                            <SelectItem key={unit.id} value={unit.id.toString()}>
                              {unit.name} ({unit.unitCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Additional fields can be added here */}
              </div>
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateItemMutation.isPending}
                >
                  {updateItemMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
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
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="py-4">
              <p className="mb-2 font-medium">Item Details:</p>
              <p><span className="text-muted-foreground">Code:</span> {selectedItem.itemCode}</p>
              <p><span className="text-muted-foreground">Name:</span> {selectedItem.name}</p>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setSelectedItem(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              disabled={deleteItemMutation.isPending}
            >
              {deleteItemMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}