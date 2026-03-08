import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FileText, AlertTriangle, CheckCircle2, ClipboardList, BarChart2, Search, Calendar, User, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartTooltip, 
  Legend, 
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";

// Schema for physical inventory count form
const physicalInventorySchema = z.object({
  warehouseId: z.string().min(1, "Warehouse is required"),
  transactionDate: z.string().min(1, "Date is required"),
  countedBy: z.string().min(1, "Counter name is required"),
  countMethod: z.string().min(1, "Count method is required"),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      itemId: z.string().min(1, "Item is required"),
      itemName: z.string().optional(),
      itemCode: z.string().optional(),
      quantity: z.string().min(1, "Quantity is required"),
      unitType: z.string().optional(),
    })
  ).min(1, "At least one item is required"),
});

export default function PhysicalInventoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("counts");
  const [openNewCountDialog, setOpenNewCountDialog] = useState(false);
  const [selectedCount, setSelectedCount] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [viewAIAnalysis, setViewAIAnalysis] = useState(false);

  // Fetch warehouses
  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
  });

  // Fetch inventory items
  const { data: inventoryItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['/api/items'],
  });

  // Fetch physical inventory counts
  const { 
    data: physicalCounts, 
    isLoading: countsLoading,
    isError: countsError,
    refetch: refetchCounts
  } = useQuery({
    queryKey: ['/api/inventory-movements?type=physical_count'],
  });

  // Fetch AI recommendations for counts
  const {
    data: aiRecommendations,
    isLoading: aiRecommendationsLoading,
  } = useQuery({
    queryKey: ['/api/inventory-recommendations/count-schedule'],
  });

  // Create physical inventory count mutation
  const createPhysicalCount = useMutation({
    mutationFn: (data: any) => {
      return apiRequest('POST', '/api/inventory-movements', {
        ...data,
        movementType: 'physical_count'
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Physical inventory count created successfully",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
      setOpenNewCountDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create physical inventory count",
        variant: "destructive",
      });
    },
  });

  // Update physical inventory count status mutation
  const updatePhysicalCountStatus = useMutation({
    mutationFn: ({ id, status }: { id: number, status: string }) => {
      return apiRequest('PATCH', `/api/inventory-movements/${id}`, { status });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Physical inventory count status updated successfully",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update physical inventory count status",
        variant: "destructive",
      });
    },
  });

  // Delete physical inventory count mutation
  const deletePhysicalCount = useMutation({
    mutationFn: (id: number) => {
      return apiRequest('DELETE', `/api/inventory-movements/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Physical inventory count deleted successfully",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete physical inventory count",
        variant: "destructive",
      });
    },
  });

  // Get AI analysis for a specific count
  const { 
    data: aiAnalysis,
    isLoading: aiAnalysisLoading,
    refetch: refetchAiAnalysis
  } = useQuery({
    queryKey: ['/api/inventory-movements/ai-analysis', selectedCount?.id],
    enabled: !!selectedCount && viewAIAnalysis,
  });

  // Form for creating new physical inventory count
  const form = useForm<z.infer<typeof physicalInventorySchema>>({
    resolver: zodResolver(physicalInventorySchema),
    defaultValues: {
      transactionDate: format(new Date(), "yyyy-MM-dd"),
      countMethod: "manual",
      notes: "",
      items: [{ itemId: "", quantity: "" }],
    },
  });

  // Handle form submission
  const onSubmit = (values: z.infer<typeof physicalInventorySchema>) => {
    // Convert item IDs to numbers
    const formattedValues = {
      ...values,
      warehouseId: parseInt(values.warehouseId),
      items: values.items.map(item => ({
        ...item,
        itemId: parseInt(item.itemId),
        quantity: parseFloat(item.quantity),
      })),
    };
    
    createPhysicalCount.mutate(formattedValues);
  };

  // Add item to form
  const addItem = () => {
    const currentItems = form.getValues("items") || [];
    form.setValue("items", [...currentItems, { itemId: "", quantity: "" }]);
  };

  // Remove item from form
  const removeItem = (index: number) => {
    const currentItems = form.getValues("items") || [];
    if (currentItems.length > 1) {
      form.setValue(
        "items",
        currentItems.filter((_, i) => i !== index)
      );
    }
  };

  // Format status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // View count details
  const viewCountDetails = (count: any) => {
    setSelectedCount(count);
    setSelectedItems(count.items || []);
    setViewAIAnalysis(false);
  };

  // View AI analysis for a count
  const viewAIInsights = (count: any) => {
    setSelectedCount(count);
    setSelectedItems(count.items || []);
    setViewAIAnalysis(true);
    refetchAiAnalysis();
  };

  // Discrepancy visualization data
  const discrepancyData = selectedItems.map(item => ({
    name: item.itemName || `Item ${item.itemId}`,
    system: item.systemQuantity || 0,
    counted: parseFloat(item.quantity) || 0,
    discrepancy: item.discrepancy || 0
  }));

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'BDT',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Physical Inventory</h2>
          <p className="text-muted-foreground">
            Manage and track physical inventory counts with AI-powered discrepancy analysis
          </p>
        </div>
        <Button onClick={() => setOpenNewCountDialog(true)}>
          New Count
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="counts">Physical Counts</TabsTrigger>
          <TabsTrigger value="recommendations">AI Recommendations</TabsTrigger>
        </TabsList>
        
        {/* Physical Counts Tab */}
        <TabsContent value="counts" className="space-y-4">
          {countsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : countsError ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center text-center p-6">
                  <AlertCircle className="h-10 w-10 text-destructive mb-2" />
                  <h3 className="text-lg font-semibold">Error Loading Counts</h3>
                  <p className="text-muted-foreground mb-2">Failed to load physical inventory counts</p>
                  <Button variant="outline" onClick={() => refetchCounts()}>
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : physicalCounts?.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center text-center p-6">
                  <ClipboardList className="h-10 w-10 text-muted-foreground mb-2" />
                  <h3 className="text-lg font-semibold">No Physical Counts</h3>
                  <p className="text-muted-foreground mb-4">Start counting your inventory to identify discrepancies</p>
                  <Button onClick={() => setOpenNewCountDialog(true)}>
                    Create First Count
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Physical Inventory Counts</CardTitle>
                <CardDescription>Track and manage your physical inventory counting processes</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Counted By</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Discrepancy Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {physicalCounts?.map((count: any) => (
                      <TableRow key={count.id}>
                        <TableCell>{count.transactionId}</TableCell>
                        <TableCell>{format(new Date(count.transactionDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          {warehouses?.find((w: any) => w.id === count.warehouseId)?.name || count.warehouseId}
                        </TableCell>
                        <TableCell>{count.countedBy}</TableCell>
                        <TableCell>{count.items?.length || 0} items</TableCell>
                        <TableCell>
                          {count.discrepancyValue !== undefined ? (
                            <span className={count.discrepancyValue < 0 ? 'text-destructive' : count.discrepancyValue > 0 ? 'text-success' : ''}>
                              {formatCurrency(count.discrepancyValue)}
                            </span>
                          ) : 'N/A'}
                        </TableCell>
                        <TableCell>{getStatusBadge(count.status)}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => viewCountDetails(count)}>
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View Details</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => viewAIInsights(count)}>
                                    <BarChart2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>AI Analysis</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            
                            {count.status === "pending" && (
                              <>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon"
                                        onClick={() => updatePhysicalCountStatus.mutate({ id: count.id, status: "approved" })}
                                      >
                                        <CheckCircle2 className="h-4 w-4 text-success" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Approve</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon"
                                        onClick={() => updatePhysicalCountStatus.mutate({ id: count.id, status: "rejected" })}
                                      >
                                        <AlertTriangle className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Reject</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon"
                                        onClick={() => {
                                          if (confirm('Are you sure you want to delete this count?')) {
                                            deletePhysicalCount.mutate(count.id);
                                          }
                                        }}
                                      >
                                        <AlertCircle className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* AI Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          {aiRecommendationsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recommended Count Schedule</CardTitle>
                  <CardDescription>Based on historical patterns and inventory value</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Warehouse Priority</h3>
                      <div className="space-y-2">
                        {aiRecommendations?.warehouseGroups?.map((group: any, index: number) => (
                          <Card key={index} className="p-4">
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col">
                                <h4 className="font-medium">{group.name}</h4>
                                <p className="text-sm text-muted-foreground">Last counted: {group.lastCount ? format(new Date(group.lastCount), 'dd MMM yyyy') : 'Never'}</p>
                              </div>
                              <Badge variant={index === 0 ? "destructive" : index === 1 ? "outline" : "secondary"}>
                                {index === 0 ? 'High Priority' : index === 1 ? 'Medium Priority' : 'Low Priority'}
                              </Badge>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>High-Value Items</CardTitle>
                  <CardDescription>Items that should be counted more frequently</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {aiRecommendations?.highValueItems?.map((item: any, index: number) => (
                      <div key={index} className="flex justify-between items-center border-b pb-2">
                        <div>
                          <h4 className="font-medium">{item.name}</h4>
                          <p className="text-sm text-muted-foreground">{item.sku || item.code}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(item.value)}</p>
                          <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* New Count Dialog */}
      <Dialog open={openNewCountDialog} onOpenChange={setOpenNewCountDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>New Physical Inventory Count</DialogTitle>
            <DialogDescription>
              Create a new physical inventory count to track discrepancies
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Warehouse</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select warehouse" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses?.map((warehouse: any) => (
                            <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                              {warehouse.name}
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
                  name="transactionDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Count Date</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                          <Input type="date" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="countedBy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Counted By</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <User className="w-4 h-4 mr-2 text-muted-foreground" />
                          <Input placeholder="Enter counter name" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="countMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Count Method</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="manual">Manual Count</SelectItem>
                          <SelectItem value="barcode">Barcode Scanner</SelectItem>
                          <SelectItem value="cycle">Cycle Count</SelectItem>
                          <SelectItem value="weighing">Weighing Scale</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Enter any additional notes" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Items</h3>
                  <Button type="button" variant="outline" onClick={addItem}>Add Item</Button>
                </div>
                
                <div className="border rounded-md p-4">
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-4">
                      {form.getValues("items")?.map((_, index) => (
                        <div key={index} className="grid grid-cols-12 gap-4 items-end">
                          <div className="col-span-5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.itemId`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className={index !== 0 ? "sr-only" : ""}>Item</FormLabel>
                                  <Select
                                    onValueChange={(value) => {
                                      field.onChange(value);
                                      const selectedItem = inventoryItems?.find((item: any) => item.id.toString() === value);
                                      if (selectedItem) {
                                        form.setValue(`items.${index}.itemName`, selectedItem.name);
                                        form.setValue(`items.${index}.itemCode`, selectedItem.code);
                                        form.setValue(`items.${index}.unitType`, selectedItem.unitType);
                                      }
                                    }}
                                    value={field.value?.toString()}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select item" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {inventoryItems?.map((item: any) => (
                                        <SelectItem key={item.id} value={item.id.toString()}>
                                          {item.name} ({item.code})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="col-span-5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.quantity`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className={index !== 0 ? "sr-only" : ""}>Quantity</FormLabel>
                                  <FormControl>
                                    <Input type="number" placeholder="Enter quantity" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="col-span-2">
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => removeItem(index)}
                              disabled={form.getValues("items")?.length <= 1}
                            >
                              <AlertCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
              
              <DialogFooter>
                <Button type="submit" disabled={createPhysicalCount.isPending}>
                  {createPhysicalCount.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Count"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Count Details Dialog */}
      <Dialog open={!!selectedCount && !viewAIAnalysis} onOpenChange={(open) => !open && setSelectedCount(null)}>
        {selectedCount && (
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Physical Count Details</DialogTitle>
              <DialogDescription>
                Details for {selectedCount.transactionId} on {format(new Date(selectedCount.transactionDate), 'dd MMM yyyy')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <span>{getStatusBadge(selectedCount.status)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Warehouse:</span>
                        <span>{warehouses?.find((w: any) => w.id === selectedCount.warehouseId)?.name || selectedCount.warehouseId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Counted By:</span>
                        <span>{selectedCount.countedBy}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Method:</span>
                        <span className="capitalize">{selectedCount.countMethod}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Items:</span>
                        <span>{selectedItems.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Items with Discrepancies:</span>
                        <span>{selectedItems.filter((item: any) => item.discrepancy !== 0).length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Discrepancy Value:</span>
                        <span className={`font-medium ${selectedCount.discrepancyValue < 0 ? 'text-destructive' : selectedCount.discrepancyValue > 0 ? 'text-success' : ''}`}>
                          {formatCurrency(selectedCount.discrepancyValue || 0)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {selectedCount.notes || "No notes provided."}
                    </p>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>System Quantity</TableHead>
                        <TableHead>Counted Quantity</TableHead>
                        <TableHead>Discrepancy</TableHead>
                        <TableHead>Value Impact</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedItems.map((item: any, index: number) => {
                        const itemDetail = inventoryItems?.find((i: any) => i.id === item.itemId);
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{itemDetail?.name || `Item ${item.itemId}`}</div>
                                <div className="text-sm text-muted-foreground">{itemDetail?.code || ""}</div>
                              </div>
                            </TableCell>
                            <TableCell>{item.systemQuantity || 0}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>
                              <span className={item.discrepancy < 0 ? 'text-destructive' : item.discrepancy > 0 ? 'text-success' : ''}>
                                {item.discrepancy > 0 ? '+' : ''}{item.discrepancy}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={item.valueImpact < 0 ? 'text-destructive' : item.valueImpact > 0 ? 'text-success' : ''}>
                                {formatCurrency(item.valueImpact || 0)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">Discrepancy Visualization</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={discrepancyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <RechartTooltip />
                    <Legend />
                    <Bar dataKey="system" name="System Quantity" fill="#94a3b8" />
                    <Bar dataKey="counted" name="Counted Quantity" fill="#3b82f6" />
                    <Bar dataKey="discrepancy" name="Discrepancy" fill="#f43f5e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <DialogFooter>
              <Button onClick={() => {
                setViewAIAnalysis(true);
                refetchAiAnalysis();
              }}>
                View AI Analysis
              </Button>
              <Button variant="outline" onClick={() => setSelectedCount(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      
      {/* AI Analysis Dialog */}
      <Dialog open={!!selectedCount && viewAIAnalysis} onOpenChange={(open) => !open && setSelectedCount(null)}>
        {selectedCount && (
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>AI Discrepancy Analysis</DialogTitle>
              <DialogDescription>
                Intelligent analysis of inventory discrepancies for {selectedCount.transactionId}
              </DialogDescription>
            </DialogHeader>
            
            {aiAnalysisLoading ? (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                </div>
                <p className="text-center text-muted-foreground">
                  Analyzing inventory discrepancies with AI...
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Discrepancy Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Items Counted:</span>
                        <span className="font-medium">{selectedItems.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Items with Discrepancies:</span>
                        <span className="font-medium">
                          {selectedItems.filter(item => (item.discrepancy || 0) !== 0).length}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Discrepancy Value:</span>
                        <span className={`font-medium ${selectedCount.discrepancyValue < 0 ? 'text-destructive' : selectedCount.discrepancyValue > 0 ? 'text-success' : ''}`}>
                          {formatCurrency(selectedCount.discrepancyValue || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Average Discrepancy %:</span>
                        <span className="font-medium">
                          {(selectedItems.reduce((acc: number, item: any) => acc + (item.discrepancyPercent || 0), 0) / selectedItems.length).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>AI Insights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium mb-1">Root Causes</h4>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          {aiAnalysis?.rootCauses?.map((cause: string, index: number) => (
                            <li key={index}>{cause}</li>
                          )) || (
                            <>
                              <li>Potential data entry errors during receiving process</li>
                              <li>Items may be stored in incorrect locations</li>
                              <li>Possible unauthorized movement of items between warehouses</li>
                              <li>Inventory system may not be updated after physical movements</li>
                            </>
                          )}
                        </ul>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium mb-1">Pattern Analysis</h4>
                        <p className="text-muted-foreground">
                          {aiAnalysis?.patternAnalysis || 
                            "Most discrepancies are negative (counted less than system), suggesting items may be missing or were never properly received in the system. The discrepancies are concentrated in high-value items, which is a risk factor that should be investigated further."
                          }
                        </p>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium mb-1">Recommendations</h4>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          {aiAnalysis?.recommendations?.map((rec: string, index: number) => (
                            <li key={index}>{rec}</li>
                          )) || (
                            <>
                              <li>Review receiving procedures to ensure all items are properly recorded</li>
                              <li>Implement regular cycle counting for high-value items</li>
                              <li>Train staff on proper inventory movement documentation</li>
                              <li>Investigate possible unreported damage or shrinkage</li>
                              <li>Consider implementing barcode scanning for all inventory movements</li>
                            </>
                          )}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Items Requiring Attention</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Discrepancy</TableHead>
                          <TableHead>Value Impact</TableHead>
                          <TableHead>Risk Level</TableHead>
                          <TableHead>Recommendation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aiAnalysis?.criticalItems?.map((item: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>{item.itemName}</TableCell>
                            <TableCell>
                              <span className={item.discrepancy < 0 ? 'text-destructive' : item.discrepancy > 0 ? 'text-success' : ''}>
                                {item.discrepancy}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={item.valueImpact < 0 ? 'text-destructive' : item.valueImpact > 0 ? 'text-success' : ''}>
                                {formatCurrency(item.valueImpact)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.riskLevel === 'high' ? 'destructive' : item.riskLevel === 'medium' ? 'outline' : 'secondary'}>
                                {item.riskLevel}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.recommendation}</TableCell>
                          </TableRow>
                        )) || selectedItems
                          .filter((item: any) => Math.abs(item.discrepancy || 0) > 0)
                          .map((item: any, index: number) => {
                            const itemDetail = inventoryItems?.find((i: any) => i.id === item.itemId);
                            const isHighValue = Math.abs(item.valueImpact || 0) > 5000;
                            return (
                              <TableRow key={index}>
                                <TableCell>{itemDetail?.name || `Item ${item.itemId}`}</TableCell>
                                <TableCell>
                                  <span className={item.discrepancy < 0 ? 'text-destructive' : item.discrepancy > 0 ? 'text-success' : ''}>
                                    {item.discrepancy}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className={item.valueImpact < 0 ? 'text-destructive' : item.valueImpact > 0 ? 'text-success' : ''}>
                                    {formatCurrency(item.valueImpact || 0)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={isHighValue ? 'destructive' : Math.abs(item.discrepancy) > 5 ? 'outline' : 'secondary'}>
                                    {isHighValue ? 'High' : Math.abs(item.discrepancy) > 5 ? 'Medium' : 'Low'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {isHighValue ? 'Immediate investigation required' : Math.abs(item.discrepancy) > 5 ? 'Cycle count recommended' : 'Monitor in next count'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}
            
            <DialogFooter>
              <Button onClick={() => {
                setViewAIAnalysis(false);
              }} variant="outline">
                Back to Details
              </Button>
              <Button variant="outline" onClick={() => setSelectedCount(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}