import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AIInsightsPanel } from "@/components/ai-insights-panel";

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FormDescription } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Form schema for warehouse
const warehouseFormSchema = z.object({
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  name: z.string().min(1, "Warehouse name is required"),
  type: z.enum(["company", "vendor", "third_party"], {
    required_error: "Please select a warehouse type",
  }).default("company"),
  location: z.string().min(1, "Location is required"),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  totalCapacity: z.union([z.string(), z.number()]).optional()
    .transform(val => val === "" || val === null || val === undefined ? null : String(val)),
  usedCapacity: z.union([z.string(), z.number()]).optional()
    .transform(val => val === "" || val === null || val === undefined ? null : String(val)),
  capacityUnit: z.enum(["sqft", "sqm", "cbm"]).default("sqft"),
  isTemperatureControlled: z.boolean().default(false),
  temperatureRange: z.string().optional(),
  isHumidityControlled: z.boolean().default(false),
  humidityRange: z.string().optional(),
  vendorId: z.number().nullable().optional(),
  hasAlarmSystem: z.boolean().default(false),
  hasSprinklerSystem: z.boolean().default(false),
  hasSecurityPersonnel: z.boolean().default(false),
  hasCCTV: z.boolean().default(false),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
  tenantId: z.number().default(1), // Default tenant ID for now
});

type WarehouseFormValues = z.infer<typeof warehouseFormSchema>;

// Warehouse page component
const WarehousesPage: React.FC = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isStockSummaryDialogOpen, setIsStockSummaryDialogOpen] = useState(false);
  const [isMovementDialogOpen, setIsMovementDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch warehouses
  const { data: warehouses, isLoading, error } = useQuery({
    queryKey: ["/api/warehouses"],
  });

  // Fetch vendors for vendor selector
  const { data: vendors } = useQuery<any[]>({
    queryKey: ["/api/vendors"],
  });

  // Fetch stock summary for selected warehouse
  const { data: stockSummary, isLoading: isStockSummaryLoading } = useQuery<any[]>({
    queryKey: ["/api/stock-ledger/summary", selectedWarehouse?.id],
    queryFn: async () => {
      const response = await fetch(`/api/stock-ledger/summary?warehouseId=${selectedWarehouse?.id}`);
      if (!response.ok) throw new Error('Failed to fetch stock summary');
      return response.json();
    },
    enabled: isStockSummaryDialogOpen && !!selectedWarehouse?.id,
  });

  // Fetch movement details for selected warehouse
  const { data: movementData, isLoading: isMovementLoading } = useQuery<any>({
    queryKey: ["/api/stock-ledger/ledger", selectedWarehouse?.id],
    queryFn: async () => {
      const response = await fetch(`/api/stock-ledger/ledger?warehouseId=${selectedWarehouse?.id}&limit=50`);
      if (!response.ok) throw new Error('Failed to fetch movement details');
      return response.json();
    },
    enabled: isMovementDialogOpen && !!selectedWarehouse?.id,
  });

  // Add warehouse mutation
  const addWarehouseMutation = useMutation({
    mutationFn: (data: WarehouseFormValues) => 
      apiRequest("/api/warehouses", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      setIsAddDialogOpen(false);
      toast({
        title: "Warehouse added",
        description: "Warehouse has been added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error adding warehouse",
        description: error.message || "An error occurred while adding the warehouse",
        variant: "destructive",
      });
    },
  });

  // Edit warehouse mutation
  const editWarehouseMutation = useMutation({
    mutationFn: (data: WarehouseFormValues & { id: number }) => 
      apiRequest(`/api/warehouses/${data.id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      setIsEditDialogOpen(false);
      setSelectedWarehouse(null);
      toast({
        title: "Warehouse updated",
        description: "Warehouse has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating warehouse",
        description: error.message || "An error occurred while updating the warehouse",
        variant: "destructive",
      });
    },
  });

  // Delete warehouse mutation
  const deleteWarehouseMutation = useMutation({
    mutationFn: (id: number) => 
      apiRequest(`/api/warehouses/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({
        title: "Warehouse deleted",
        description: "Warehouse has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting warehouse",
        description: error.message || "An error occurred while deleting the warehouse",
        variant: "destructive",
      });
    },
  });

  // Add warehouse form
  const addForm = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseFormSchema),
    defaultValues: {
      warehouseId: "",
      name: "",
      location: "",
      address: "",
      contactPerson: "",
      contactPhone: "",
      isActive: true,
      tenantId: 1,
    },
  });

  // Edit warehouse form
  const editForm = useForm<WarehouseFormValues & { id: number }>({
    resolver: zodResolver(warehouseFormSchema.extend({
      id: z.number(),
    })),
    defaultValues: {
      id: 0,
      warehouseId: "",
      name: "",
      location: "",
      address: "",
      contactPerson: "",
      contactPhone: "",
      isActive: true,
      tenantId: 1,
    },
  });

  // Handle add warehouse form submission
  const onAddSubmit = (data: WarehouseFormValues) => {
    addWarehouseMutation.mutate(data);
  };

  // Handle edit warehouse form submission
  const onEditSubmit = (data: WarehouseFormValues & { id: number }) => {
    editWarehouseMutation.mutate(data);
  };

  // Open edit dialog with selected warehouse data
  const handleEdit = (warehouse: any) => {
    setSelectedWarehouse(warehouse);
    editForm.reset({
      id: warehouse.id,
      warehouseId: warehouse.warehouseId,
      name: warehouse.name,
      location: warehouse.location,
      address: warehouse.address || "",
      contactPerson: warehouse.contactPerson || "",
      contactPhone: warehouse.contactPhone || "",
      isActive: warehouse.isActive,
      tenantId: warehouse.tenantId,
    });
    setIsEditDialogOpen(true);
  };

  // Handle view warehouse details
  const handleView = (warehouse: any) => {
    setSelectedWarehouse(warehouse);
    setIsViewDialogOpen(true);
  };

  // Handle stock summary
  const handleStockSummary = (warehouseId: number) => {
    const warehouse = warehouses.find((w: any) => w.id === warehouseId);
    setSelectedWarehouse(warehouse);
    setIsStockSummaryDialogOpen(true);
  };

  // Handle movement details
  const handleMovementDetails = (warehouseId: number) => {
    const warehouse = warehouses.find((w: any) => w.id === warehouseId);
    setSelectedWarehouse(warehouse);
    setIsMovementDialogOpen(true);
  };

  // Handle delete warehouse
  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this warehouse?")) {
      deleteWarehouseMutation.mutate(id);
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <Skeleton className="h-10 w-1/4" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array(5).fill(null).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Warehouses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">
              {error instanceof Error ? error.message : "An unknown error occurred"}
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] })}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Inventory</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink>Warehouses</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Main content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Warehouses</CardTitle>
            <CardDescription>
              Manage all warehouse locations for inventory management
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <span className="material-icons mr-2 text-sm">add</span>
                Add Warehouse
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Warehouse</DialogTitle>
                <DialogDescription>
                  Fill in the details to add a new warehouse location
                </DialogDescription>
              </DialogHeader>
              
              <Form {...addForm}>
                <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                  <FormField
                    control={addForm.control}
                    name="warehouseId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warehouse ID</FormLabel>
                        <FormControl>
                          <Input placeholder="WH-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warehouse Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Main Warehouse" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warehouse Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select warehouse type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="company">Company Premises</SelectItem>
                            <SelectItem value="vendor">Vendor Premises</SelectItem>
                            <SelectItem value="third_party">Third Party</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Type of warehouse ownership and operation
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input placeholder="City, Country" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="vendorId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vendor</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(value ? parseInt(value) : null)} 
                            value={field.value?.toString() || ""}
                            disabled={addForm.watch("type") === "company"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select vendor" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {vendors && vendors.length > 0 ? (
                                vendors.map((v: any) => (
                                  <SelectItem key={v.id} value={String(v.id)}>{v.vendorName}</SelectItem>
                                ))
                              ) : (
                                <SelectItem value="__none" disabled>No vendors available</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {addForm.watch("type") === "company" 
                              ? "Not applicable for company premises" 
                              : "Select associated vendor"}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={addForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="Full address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="contactPerson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Person</FormLabel>
                          <FormControl>
                            <Input placeholder="John Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="contactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 234 567 8900" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={addForm.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="contact@example.com" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={addForm.control}
                      name="totalCapacity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Capacity</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="5000" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="usedCapacity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Used Capacity</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="2500" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="capacityUnit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select unit" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="sqft">Square Feet</SelectItem>
                              <SelectItem value="sqm">Square Meters</SelectItem>
                              <SelectItem value="cbm">Cubic Meters</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="isTemperatureControlled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Temperature Controlled</FormLabel>
                            <FormDescription>
                              Warehouse has temperature control
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="temperatureRange"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Temperature Range</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="18-22°C" 
                              {...field} 
                              value={field.value || ''}
                              disabled={!addForm.watch("isTemperatureControlled")} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="isHumidityControlled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Humidity Controlled</FormLabel>
                            <FormDescription>
                              Warehouse has humidity control
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="humidityRange"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Humidity Range</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="40-60%" 
                              {...field} 
                              value={field.value || ''}
                              disabled={!addForm.watch("isHumidityControlled")} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="hasAlarmSystem"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Alarm System</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="hasSprinklerSystem"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Sprinkler System</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="hasSecurityPersonnel"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Security Personnel</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={addForm.control}
                      name="hasCCTV"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>CCTV System</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={addForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Additional warehouse information" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={addForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Active Status</FormLabel>
                          <FormDescription>
                            Is this warehouse currently active?
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsAddDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={addWarehouseMutation.isPending}>
                      {addWarehouseMutation.isPending && (
                        <span className="material-icons animate-spin mr-2">refresh</span>
                      )}
                      Save
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Stock Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses && warehouses.length > 0 ? (
                warehouses.map((warehouse: any) => (
                  <TableRow key={warehouse.id}>
                    <TableCell className="font-medium">{warehouse.warehouseId}</TableCell>
                    <TableCell>{warehouse.name}</TableCell>
                    <TableCell>{warehouse.location}</TableCell>
                    <TableCell>{warehouse.contactPerson || "—"}</TableCell>
                    <TableCell className="font-medium">
                      {warehouse.stockValue ? 
                        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BDT' }).format(warehouse.stockValue) 
                        : 
                        "BDT 0.00"
                      }
                    </TableCell>
                    <TableCell>
                      {warehouse.isActive ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-800 hover:bg-gray-200">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <span className="material-icons">more_vert</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleView(warehouse)}>
                            <span className="material-icons mr-2 text-sm">visibility</span>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(warehouse)}>
                            <span className="material-icons mr-2 text-sm">edit</span>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStockSummary(warehouse.id)}>
                            <span className="material-icons mr-2 text-sm">inventory_2</span>
                            Stock Summary
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleMovementDetails(warehouse.id)}>
                            <span className="material-icons mr-2 text-sm">swap_horiz</span>
                            Movement Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDelete(warehouse.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <span className="material-icons mr-2 text-sm">delete</span>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    No warehouses found. Create your first warehouse to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Warehouse Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Warehouse Details</DialogTitle>
            <DialogDescription>
              Detailed information about the warehouse
            </DialogDescription>
          </DialogHeader>
          
          {selectedWarehouse && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Warehouse ID</h4>
                  <p className="text-base">{selectedWarehouse.warehouseId}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Name</h4>
                  <p className="text-base">{selectedWarehouse.name}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Location</h4>
                  <p className="text-base">{selectedWarehouse.location}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Type</h4>
                  <p className="text-base capitalize">{selectedWarehouse.type || "Company"}</p>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Address</h4>
                <p className="text-base">{selectedWarehouse.address || "—"}</p>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Contact Person</h4>
                  <p className="text-base">{selectedWarehouse.contactPerson || "—"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Contact Phone</h4>
                  <p className="text-base">{selectedWarehouse.contactPhone || "—"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Contact Email</h4>
                  <p className="text-base">{selectedWarehouse.contactEmail || "—"}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Total Capacity</h4>
                  <p className="text-base">{selectedWarehouse.totalCapacity ? `${selectedWarehouse.totalCapacity} ${selectedWarehouse.capacityUnit || 'sqft'}` : "—"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Used Capacity</h4>
                  <p className="text-base">{selectedWarehouse.usedCapacity ? `${selectedWarehouse.usedCapacity} ${selectedWarehouse.capacityUnit || 'sqft'}` : "—"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                  <Badge className={selectedWarehouse.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                    {selectedWarehouse.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Temperature Control</h4>
                  <p className="text-base">{selectedWarehouse.isTemperatureControlled ? `Yes (${selectedWarehouse.temperatureRange || 'Not specified'})` : "No"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Humidity Control</h4>
                  <p className="text-base">{selectedWarehouse.isHumidityControlled ? `Yes (${selectedWarehouse.humidityRange || 'Not specified'})` : "No"}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Security Features</h4>
                  <ul className="text-sm list-disc pl-5 mt-1">
                    {selectedWarehouse.hasAlarmSystem && <li>Alarm System</li>}
                    {selectedWarehouse.hasSprinklerSystem && <li>Sprinkler System</li>}
                    {selectedWarehouse.hasSecurityPersonnel && <li>Security Personnel</li>}
                    {selectedWarehouse.hasCCTV && <li>CCTV</li>}
                    {!selectedWarehouse.hasAlarmSystem && 
                     !selectedWarehouse.hasSprinklerSystem && 
                     !selectedWarehouse.hasSecurityPersonnel && 
                     !selectedWarehouse.hasCCTV && <li>None</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Notes</h4>
                  <p className="text-base">{selectedWarehouse.notes || "—"}</p>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button type="button" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Stock Summary Dialog */}
      <Dialog open={isStockSummaryDialogOpen} onOpenChange={setIsStockSummaryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock Summary</DialogTitle>
            <DialogDescription>
              {selectedWarehouse ? `Inventory summary for ${selectedWarehouse.name}` : "Warehouse stock summary"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {isStockSummaryLoading ? (
              <div className="space-y-2">
                {Array(3).fill(null).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : stockSummary && stockSummary.length > 0 ? (
              <div className="rounded-md border max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty In</TableHead>
                      <TableHead className="text-right">Qty Out</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockSummary.map((row: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>{row.item_name || row.itemName || `Item #${row.item_id || row.itemId}`}</TableCell>
                        <TableCell className="text-right">{parseFloat(row.total_qty_in || row.totalQtyIn || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{parseFloat(row.total_qty_out || row.totalQtyOut || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">{parseFloat(row.balance_qty || row.balanceQty || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border p-6 text-center">
                <span className="material-icons text-5xl text-muted-foreground mb-2">inventory_2</span>
                <h3 className="text-lg font-medium">No stock data yet</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  No inventory movements have been recorded for this warehouse.
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button type="button" onClick={() => setIsStockSummaryDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Movement Details Dialog */}
      <Dialog open={isMovementDialogOpen} onOpenChange={setIsMovementDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Movement Details</DialogTitle>
            <DialogDescription>
              {selectedWarehouse ? `Inventory movements for ${selectedWarehouse.name}` : "Warehouse movement details"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {isMovementLoading ? (
              <div className="space-y-2">
                {Array(3).fill(null).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : movementData?.entries && movementData.entries.length > 0 ? (
              <div className="rounded-md border max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty In</TableHead>
                      <TableHead className="text-right">Qty Out</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movementData.entries.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">{entry.postingDate ? new Date(entry.postingDate).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>{entry.itemName || `Item #${entry.itemId}`}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{entry.docType || '—'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{parseFloat(entry.qtyIn || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{parseFloat(entry.qtyOut || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {movementData.total > movementData.entries.length && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing {movementData.entries.length} of {movementData.total} entries
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border p-6 text-center">
                <span className="material-icons text-5xl text-muted-foreground mb-2">swap_horiz</span>
                <h3 className="text-lg font-medium">No movements yet</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  No inventory movements have been recorded for this warehouse.
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button type="button" onClick={() => setIsMovementDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Warehouse</DialogTitle>
            <DialogDescription>
              Update the details of the warehouse
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warehouse ID</FormLabel>
                    <FormControl>
                      <Input placeholder="WH-001" {...field} />
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
                    <FormLabel>Warehouse Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Main Warehouse" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="City, Country" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Full address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 234 567 8900" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active Status</FormLabel>
                      <FormDescription>
                        Is this warehouse currently active?
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setSelectedWarehouse(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editWarehouseMutation.isPending}>
                  {editWarehouseMutation.isPending && (
                    <span className="material-icons animate-spin mr-2">refresh</span>
                  )}
                  Update
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AIInsightsPanel 
        context="warehouse"
        data={{}}
        className="mt-6"
      />
    </div>
  );
};

export default WarehousesPage;