import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { 
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle 
} from '@/components/ui/card';
import { 
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage 
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { 
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter 
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  AlertCircle, Truck, ClipboardList, Loader2, FileText, 
  AlertTriangle, Printer, CalendarDays, Search, Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DashboardContainer } from '@/components/layout/dashboard-container';

// Gate pass schema
const gatePassSchema = z.object({
  type: z.string(),
  warehouseId: z.coerce.number(),
  items: z.array(
    z.object({
      itemId: z.coerce.number(),
      variantId: z.coerce.number().optional().nullable(),
      quantity: z.coerce.number().min(0.01, 'Quantity must be greater than 0'),
      unitCost: z.coerce.number().optional(),
      locationCode: z.string().optional(),
      lotNumber: z.string().optional(),
      expiryDate: z.date().optional().nullable()
    })
  ).min(1, 'At least one item is required'),
  gatePassNumber: z.string().optional(),
  transactionDate: z.date(),
  notes: z.string().optional(),
  referenceNumber: z.string().optional(),
  vehicleNumber: z.string().optional(),
  driverName: z.string().optional(),
  contactNumber: z.string().optional(),
  destinationAddress: z.string().optional(),
  expectedReturnDate: z.date().optional().nullable(),
  purpose: z.string().optional()
});

// Types for our UI
type WarehouseType = {
  id: number;
  warehouseId: string;
  name: string;
  location: string;
};

type ItemType = {
  id: number;
  itemId: string;
  name: string;
  description: string;
  categoryId: number;
  unitId: number;
  unitName?: string;
  categoryName?: string;
};

type GatePassType = {
  id: number;
  transactionId: string;
  type: string;
  warehouseId: number;
  transactionDate: string;
  status: string;
  items: Array<{
    itemId: number;
    variantId?: number | null;
    quantity: number;
    unitCost?: number;
    locationCode?: string;
    lotNumber?: string;
    expiryDate?: string | null;
    itemName?: string;
    unitName?: string;
  }>;
  gatePassNumber?: string;
  notes?: string;
  referenceNumber?: string;
  vehicleNumber?: string;
  driverName?: string;
  contactNumber?: string;
  destinationAddress?: string;
  expectedReturnDate?: string;
  purpose?: string;
  additionalData?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export default function GatePassesPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [gatePassToView, setGatePassToView] = useState<GatePassType | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  // Form for creating gate passes
  const form = useForm<z.infer<typeof gatePassSchema>>({
    resolver: zodResolver(gatePassSchema),
    defaultValues: {
      type: 'gate_pass',
      items: [{ 
        itemId: 0, 
        quantity: 1,
        variantId: null,
        unitCost: undefined,
        locationCode: '',
        lotNumber: '',
        expiryDate: null
      }],
      transactionDate: new Date(),
    }
  });

  // Fetch warehouses
  const { data: warehouses = [] } = useQuery<WarehouseType[]>({
    queryKey: ['/api/warehouses'],
  });

  // Fetch items
  const { data: items = [] } = useQuery<ItemType[]>({
    queryKey: ['/api/items'],
  });

  // Fetch gate passes (actually inventory movements with gate_pass or delivery_challan types)
  const { 
    data: gatePasses = [], 
    isLoading: isLoadingGatePasses,
    isError: isErrorGatePasses,
    error: gatePassesError,
    refetch: refetchGatePasses
  } = useQuery<GatePassType[]>({
    queryKey: ['/api/gate-passes'],
  });

  // Create gate pass mutation
  const createGatePassMutation = useMutation({
    mutationFn: async (data: z.infer<typeof gatePassSchema>) => {
      return await fetch('/api/gate-passes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      }).then(res => {
        if (!res.ok) throw new Error('Failed to create gate pass');
        return res.json();
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Gate pass created successfully",
        variant: "default",
      });
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/gate-passes'] });
      form.reset({
        type: 'gate_pass',
        items: [{ 
          itemId: 0, 
          quantity: 1,
          variantId: null,
          unitCost: undefined,
          locationCode: '',
          lotNumber: '',
          expiryDate: null
        }],
        transactionDate: new Date(),
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create gate pass: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Handle form submission
  const onSubmit = (data: z.infer<typeof gatePassSchema>) => {
    createGatePassMutation.mutate(data);
  };

  // Add an item row to the form
  const addItemRow = () => {
    const currentItems = form.getValues('items') || [];
    form.setValue('items', [
      ...currentItems, 
      { 
        itemId: 0, 
        quantity: 1, 
        variantId: null,
        unitCost: undefined,
        locationCode: '',
        lotNumber: '',
        expiryDate: null
      }
    ]);
  };

  // Remove an item row from the form
  const removeItemRow = (index: number) => {
    const currentItems = form.getValues('items');
    form.setValue('items', currentItems.filter((_, i) => i !== index));
  };

  // View gate pass details
  const viewGatePass = (gatePass: GatePassType) => {
    setGatePassToView(gatePass);
    setIsViewDialogOpen(true);
  };

  // Generate printable gate pass
  const printGatePass = (gatePass: GatePassType) => {
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Unable to open print window. Please check your browser settings.",
        variant: "destructive",
      });
      return;
    }

    // Get warehouse name
    const warehouse = warehouses.find(w => w.id === gatePass.warehouseId);

    // Format the print content
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${gatePass.type === 'gate_pass' ? 'Gate Pass' : 'Delivery Challan'} - ${gatePass.transactionId}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #f97316;
            padding-bottom: 10px;
          }
          .document-title {
            font-size: 24px;
            font-weight: bold;
            color: #f97316;
            margin: 0;
          }
          .document-number {
            font-size: 16px;
            margin: 5px 0 0;
          }
          .company-name {
            font-size: 18px;
            font-weight: bold;
            margin: 0 0 5px;
          }
          .info-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
          }
          .info-block {
            width: 48%;
          }
          .info-block h3 {
            margin: 0 0 5px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 3px;
            font-size: 14px;
          }
          .info-item {
            margin: 5px 0;
            font-size: 12px;
          }
          .label {
            font-weight: bold;
            display: inline-block;
            width: 140px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
            font-size: 12px;
          }
          th {
            background-color: #f5f5f5;
            font-weight: bold;
          }
          .footer {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
          }
          .signature-block {
            width: 30%;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #333;
            margin-top: 50px;
            padding-top: 5px;
            font-size: 12px;
          }
          .notes {
            margin: 20px 0;
            padding: 10px;
            background-color: #f9f9f9;
            border: 1px solid #ddd;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <p class="company-name">PrimeX ERP</p>
          <p class="document-title">${gatePass.type === 'gate_pass' ? 'GATE PASS' : 'DELIVERY CHALLAN'}</p>
          <p class="document-number">${gatePass.transactionId}</p>
        </div>
        
        <div class="info-section">
          <div class="info-block">
            <h3>Document Information</h3>
            <p class="info-item"><span class="label">Document No:</span> ${gatePass.gatePassNumber || gatePass.transactionId}</p>
            <p class="info-item"><span class="label">Date:</span> ${format(new Date(gatePass.transactionDate), 'MMM dd, yyyy')}</p>
            <p class="info-item"><span class="label">Status:</span> ${gatePass.status?.toUpperCase() || 'PROCESSED'}</p>
            ${gatePass.referenceNumber ? `<p class="info-item"><span class="label">Reference No:</span> ${gatePass.referenceNumber}</p>` : ''}
            <p class="info-item"><span class="label">Warehouse:</span> ${warehouse?.name || 'N/A'}</p>
          </div>
          
          <div class="info-block">
            <h3>Transport Information</h3>
            ${gatePass.vehicleNumber ? `<p class="info-item"><span class="label">Vehicle No:</span> ${gatePass.vehicleNumber}</p>` : ''}
            ${gatePass.driverName ? `<p class="info-item"><span class="label">Driver Name:</span> ${gatePass.driverName}</p>` : ''}
            ${gatePass.contactNumber ? `<p class="info-item"><span class="label">Contact No:</span> ${gatePass.contactNumber}</p>` : ''}
            ${gatePass.destinationAddress ? `<p class="info-item"><span class="label">Destination:</span> ${gatePass.destinationAddress}</p>` : ''}
            ${gatePass.expectedReturnDate ? `<p class="info-item"><span class="label">Expected Return:</span> ${format(new Date(gatePass.expectedReturnDate), 'MMM dd, yyyy')}</p>` : ''}
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>SL No.</th>
              <th>Item</th>
              <th>Quantity</th>
              <th>Lot/Batch No.</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${gatePass.items.map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${items.find(i => i.id === item.itemId)?.name || `Item #${item.itemId}`}</td>
                <td>${item.quantity} ${items.find(i => i.id === item.itemId)?.unitName || ''}</td>
                <td>${item.lotNumber || 'N/A'}</td>
                <td>${item.locationCode || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        ${gatePass.notes ? `
        <div class="notes">
          <strong>Notes:</strong> ${gatePass.notes}
        </div>
        ` : ''}
        
        ${gatePass.purpose ? `
        <div class="notes">
          <strong>Purpose:</strong> ${gatePass.purpose}
        </div>
        ` : ''}
        
        <div class="footer">
          <div class="signature-block">
            <div class="signature-line">Authorized By</div>
          </div>
          <div class="signature-block">
            <div class="signature-line">Issued By</div>
          </div>
          <div class="signature-block">
            <div class="signature-line">Received By</div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Write to the new window and print
    printWindow.document.open();
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load then print
    printWindow.onload = function() {
      printWindow.print();
    };
  };

  // Function to render status badge
  const renderStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <Badge variant="outline" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'cancelled':
        return <Badge variant="destructive" className="bg-red-100 text-red-800">Cancelled</Badge>;
      case 'returned':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800">Returned</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Filter gate passes based on filters
  const filteredGatePasses = gatePasses.filter(gatePass => {
    // Filter by status (skip filtering if "all" is selected)
    if (filterStatus && filterStatus !== 'all' && gatePass.status !== filterStatus) {
      return false;
    }
    
    // Filter by search term (transaction ID or reference number or gate pass number)
    if (searchTerm && !(
      gatePass.transactionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (gatePass.referenceNumber && gatePass.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (gatePass.gatePassNumber && gatePass.gatePassNumber.toLowerCase().includes(searchTerm.toLowerCase()))
    )) {
      return false;
    }
    
    // Filter by date range
    if (dateRange.from && new Date(gatePass.transactionDate) < dateRange.from) {
      return false;
    }
    if (dateRange.to && new Date(gatePass.transactionDate) > dateRange.to) {
      return false;
    }
    
    return true;
  });

  return (
    <DashboardContainer title="Gate Passes & Challans">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-2xl font-bold">Gate Passes & Delivery Challans</CardTitle>
          <CardDescription>
            Manage gate passes and delivery challans for item movement
          </CardDescription>
          
          <div className="flex flex-col md:flex-row justify-between gap-4 mt-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by ID or reference..."
                  className="pl-8 w-full sm:w-[250px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Select value={filterStatus || ""} onValueChange={(value) => setFilterStatus(value || null)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      "Date range"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => setDateRange(range || { from: undefined, to: undefined })}
                    numberOfMonths={2}
                  />
                  <div className="flex items-center justify-end gap-2 p-3 border-t">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setDateRange({ from: undefined, to: undefined })}
                    >
                      Clear
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => document.body.click()} // Close the popover
                    >
                      Apply
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => refetchGatePasses()}
                disabled={isLoadingGatePasses}
              >
                {isLoadingGatePasses ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AlertCircle className="h-4 w-4 mr-1" />
                )}
                Refresh
              </Button>
              
              <Button 
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Gate Pass
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {isErrorGatePasses && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {gatePassesError?.message || "Failed to load gate passes"}
              </AlertDescription>
            </Alert>
          )}
          
          {isLoadingGatePasses ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-lg">Loading gate passes...</span>
            </div>
          ) : filteredGatePasses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">No gate passes found</p>
              <p className="text-sm mt-1">
                {searchTerm || filterStatus || dateRange.from 
                  ? "Try adjusting your filters" 
                  : "Create your first gate pass to get started"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGatePasses.map((gatePass) => {
                    const warehouse = warehouses.find(w => w.id === gatePass.warehouseId);
                    
                    return (
                      <TableRow key={gatePass.id}>
                        <TableCell className="font-medium">
                          {gatePass.gatePassNumber || gatePass.transactionId}
                        </TableCell>
                        <TableCell>
                          {gatePass.type === 'gate_pass' ? (
                            <span className="flex items-center">
                              <Truck className="h-4 w-4 mr-1 text-blue-600" />
                              Gate Pass
                            </span>
                          ) : (
                            <span className="flex items-center">
                              <FileText className="h-4 w-4 mr-1 text-green-600" />
                              Delivery Challan
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(gatePass.transactionDate), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          {warehouse?.name || 'Unknown Warehouse'}
                        </TableCell>
                        <TableCell>
                          {gatePass.referenceNumber || '-'}
                        </TableCell>
                        <TableCell>
                          {renderStatusBadge(gatePass.status || 'processed')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => viewGatePass(gatePass)}
                                  >
                                    <Search className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>View Details</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => printGatePass(gatePass)}
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Print</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Gate Pass Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[900px] h-[90vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle>Create Gate Pass or Delivery Challan</DialogTitle>
            <DialogDescription>
              Create a new gate pass or delivery challan for item movement
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select document type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="gate_pass">Gate Pass</SelectItem>
                          <SelectItem value="delivery_challan">Delivery Challan</SelectItem>
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
                      <FormLabel>Warehouse</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select warehouse" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses.map((warehouse) => (
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
                  name="gatePassNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional - system will generate if empty" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="transactionDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "MMMM do, yyyy")
                              ) : (
                                <span>Select date</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="referenceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional reference number" />
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
                        <Input {...field} placeholder="Vehicle registration number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="driverName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Name of the driver" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="contactNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Driver's contact number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="destinationAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Destination</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Destination address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="expectedReturnDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Expected Return Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "MMMM do, yyyy")
                              ) : (
                                <span>Select date (if applicable)</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="purpose"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Purpose</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Purpose of gate pass/challan" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Additional notes or instructions"
                          className="min-h-[100px]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <Separator className="my-4" />
              
              <div>
                <h3 className="text-lg font-medium mb-4">Items</h3>
                <div className="space-y-4">
                  {form.watch("items")?.map((_, index) => (
                    <div key={index} className="border rounded-md p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">Item {index + 1}</h4>
                        {index > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItemRow(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.itemId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Item</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value?.toString()}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select item" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {items.map((item) => (
                                    <SelectItem key={item.id} value={item.id.toString()}>
                                      {item.name}
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
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Quantity</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`items.${index}.lotNumber`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Lot/Batch Number</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`items.${index}.locationCode`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location Code</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={addItemRow}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              
              <div className="flex justify-end gap-2 mt-6 sticky bottom-0 bg-white py-3 border-t">
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Create Document"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* View Gate Pass Dialog */}
      {gatePassToView && (
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                {gatePassToView.type === 'gate_pass' ? (
                  <>
                    <Truck className="h-5 w-5 mr-2 text-blue-600" />
                    Gate Pass
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5 mr-2 text-green-600" />
                    Delivery Challan
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {gatePassToView.gatePassNumber || gatePassToView.transactionId}
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 my-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Status
                </p>
                <div>
                  {renderStatusBadge(gatePassToView.status || 'processed')}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Warehouse
                </p>
                <p>
                  {warehouses.find(w => w.id === gatePassToView.warehouseId)?.name || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Date
                </p>
                <p>
                  {gatePassToView.transactionDate 
                    ? format(new Date(gatePassToView.transactionDate), 'MMMM d, yyyy')
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Reference Number
                </p>
                <p>{gatePassToView.referenceNumber || '-'}</p>
              </div>
              
              {gatePassToView.vehicleNumber && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Vehicle Number
                  </p>
                  <p>{gatePassToView.vehicleNumber}</p>
                </div>
              )}
              
              {gatePassToView.driverName && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Driver Name
                  </p>
                  <p>{gatePassToView.driverName}</p>
                </div>
              )}
              
              {gatePassToView.contactNumber && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Contact Number
                  </p>
                  <p>{gatePassToView.contactNumber}</p>
                </div>
              )}
              
              {gatePassToView.destinationAddress && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Destination
                  </p>
                  <p>{gatePassToView.destinationAddress}</p>
                </div>
              )}
              
              {gatePassToView.expectedReturnDate && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Expected Return Date
                  </p>
                  <p>{format(new Date(gatePassToView.expectedReturnDate), 'MMMM d, yyyy')}</p>
                </div>
              )}
              
              {gatePassToView.purpose && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Purpose
                  </p>
                  <p>{gatePassToView.purpose}</p>
                </div>
              )}
              
              {gatePassToView.notes && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Notes
                  </p>
                  <p>{gatePassToView.notes}</p>
                </div>
              )}
            </div>
            
            <Separator className="my-4" />
            
            <h3 className="text-lg font-medium mb-4">Items</h3>
            <ScrollArea className="h-[200px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Lot/Batch No.</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gatePassToView.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {items.find(i => i.id === item.itemId)?.name || `Item #${item.itemId}`}
                      </TableCell>
                      <TableCell>
                        {item.quantity} {items.find(i => i.id === item.itemId)?.unitName || ''}
                      </TableCell>
                      <TableCell>{item.lotNumber || '-'}</TableCell>
                      <TableCell>{item.locationCode || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={() => printGatePass(gatePassToView)}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DashboardContainer>
  );
}