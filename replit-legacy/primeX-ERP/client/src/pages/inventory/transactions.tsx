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
  Tabs, TabsContent, TabsList, TabsTrigger 
} from '@/components/ui/tabs';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  AlertCircle, Check, ChevronsUpDown, Tag, Truck, RotateCcw, 
  ClipboardList, ArrowDownUp, ArrowDown, ArrowUp, PackageOpen, FileText, 
  AlertTriangle, Loader2, Factory, Archive, TrendingUp, Printer, Download
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportToExcel } from '@/lib/exportToExcel';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Transaction type schema - we'll extend this as needed for specific transaction types
const transactionSchema = z.object({
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
  targetWarehouseId: z.coerce.number().optional(),
  processingUnitId: z.coerce.number().optional(),
  subcontractorId: z.coerce.number().optional(),
  sourceDocType: z.string().optional(),
  sourceDocId: z.coerce.number().optional(),
  transactionDate: z.date(),
  notes: z.string().optional(),
  referenceNumber: z.string().optional()
});

// Specific validation schemas for different transaction types
const receiveGoodsSchema = transactionSchema.extend({
  vendorId: z.coerce.number().optional(),
  purchaseOrderId: z.coerce.number().optional()
});

const transferSchema = transactionSchema.extend({
  targetWarehouseId: z.coerce.number({
    required_error: "Target warehouse is required for transfers"
  })
});

const processingUnitSchema = transactionSchema.extend({
  processingUnitId: z.coerce.number({
    required_error: "Processing unit is required"
  }),
  expectedReturnDate: z.date().optional()
});

const subcontractorSchema = transactionSchema.extend({
  subcontractorId: z.coerce.number({
    required_error: "Subcontractor is required"
  }),
  expectedCompletionDate: z.date().optional()
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
  itemCode: string;
  name: string;
  categoryId: number;
  subcategoryId?: number;
  unitId: number;
  type: string;
};

type ItemVariantType = {
  id: number;
  itemId: number;
  sku: string;
  color: string;
  size: string;
};

type VendorType = {
  id: number;
  vendorId: string;
  name: string;
};

type ProcessingUnitType = {
  id: number;
  name: string;
  type: string;
};

type SubcontractorType = {
  id: number;
  name: string;
  type: string;
};

type ItemUnitType = {
  id: number;
  unitCode: string;
  name: string;
};

type TransactionItemType = {
  itemId: number;
  variantId?: number | null;
  quantity: number;
  unitCost?: number;
  locationCode?: string;
  lotNumber?: string;
  expiryDate?: Date | null;
  // UI only fields
  itemName?: string;
  variantName?: string;
  unitName?: string;
};

type TransactionType = {
  id?: number;
  movementId?: string;
  type: string;
  warehouseId: number;
  items: TransactionItemType[];
  targetWarehouseId?: number;
  processingUnitId?: number;
  subcontractorId?: number;
  sourceDocType?: string;
  sourceDocId?: number;
  transactionDate: Date;
  notes?: string;
  referenceNumber?: string;
  status?: string;
  vendorId?: number;
  purchaseOrderId?: number;
  expectedReturnDate?: Date;
  expectedCompletionDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

// Available transaction types
const transactionTypes = [
  { id: 'receive', name: 'Receive Goods', icon: <ArrowDown className="mr-2 h-4 w-4" /> },
  { id: 'issue', name: 'Issue Goods', icon: <ArrowUp className="mr-2 h-4 w-4" /> },
  { id: 'transfer', name: 'Transfer Between Warehouses', icon: <ArrowDownUp className="mr-2 h-4 w-4" /> },
  { id: 'processing_send', name: 'Send to Processing Unit', icon: <Factory className="mr-2 h-4 w-4" /> },
  { id: 'processing_receive', name: 'Receive from Processing Unit', icon: <PackageOpen className="mr-2 h-4 w-4" /> },
  { id: 'subcontract_send', name: 'Send to Subcontractor', icon: <Truck className="mr-2 h-4 w-4" /> },
  { id: 'subcontract_receive', name: 'Receive from Subcontractor', icon: <ClipboardList className="mr-2 h-4 w-4" /> },
  { id: 'return', name: 'Return Goods', icon: <RotateCcw className="mr-2 h-4 w-4" /> },
  { id: 'adjustment', name: 'Inventory Adjustment', icon: <Tag className="mr-2 h-4 w-4" /> },
  { id: 'manufacturing', name: 'Manufacturing Journal', icon: <TrendingUp className="mr-2 h-4 w-4" /> }
];

export default function InventoryTransactionsPage() {
  const { toast } = useToast();
  const [currentTab, setCurrentTab] = useState("transactions");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTransactionType, setSelectedTransactionType] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<TransactionItemType[]>([]);
  const [transactionToView, setTransactionToView] = useState<TransactionType | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [isGeneratingDocument, setIsGeneratingDocument] = useState(false);
  const [documentType, setDocumentType] = useState<string | null>(null);

  // Fetch data
  const { data: warehouses = [], isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: async () => {
      return fetch('/api/warehouses').then(res => res.json());
    }
  });

  const { data: items = [], isLoading: isLoadingItems } = useQuery({
    queryKey: ['/api/items'],
    queryFn: async () => {
      return fetch('/api/items').then(res => res.json());
    }
  });

  const { data: vendors = [], isLoading: isLoadingVendors } = useQuery({
    queryKey: ['/api/vendors'],
    queryFn: async () => {
      return fetch('/api/vendors').then(res => res.json());
    }
  });

  const { data: processingUnits = [], isLoading: isLoadingProcessingUnits } = useQuery({
    queryKey: ['/api/processing-units'],
    queryFn: async () => {
      return fetch('/api/processing-units').then(res => res.json());
    }
  });

  const { data: subcontractors = [], isLoading: isLoadingSubcontractors } = useQuery({
    queryKey: ['/api/subcontractors'],
    queryFn: async () => {
      return fetch('/api/subcontractors').then(res => res.json());
    }
  });

  const { data: itemUnits = [], isLoading: isLoadingItemUnits } = useQuery({
    queryKey: ['/api/item-units'],
    queryFn: async () => {
      return fetch('/api/item-units').then(res => res.json());
    }
  });

  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/inventory-movements'],
    queryFn: async () => {
      return fetch('/api/inventory-movements').then(res => res.json())
        .catch(err => {
          console.error("Error fetching transactions:", err);
          return [];
        });
    }
  });

  const { data: aiRecommendations = [], isLoading: isLoadingAiRecommendations } = useQuery({
    queryKey: ['/api/public/ai-recommendations'],
    queryFn: async () => {
      return fetch('/api/public/ai-recommendations').then(res => res.json())
        .catch(err => {
          console.error("Error fetching AI recommendations:", err);
          return [];
        });
    }
  });

  // Create transaction form
  const form = useForm<TransactionType>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: '',
      warehouseId: 0,
      items: [{ itemId: 0, quantity: 1 }],
      transactionDate: new Date(),
    },
  });

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: async (data: TransactionType) => {
      return await apiRequest('POST', '/api/inventory-movements', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/item-stock'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Transaction Created",
        description: "Inventory transaction has been successfully recorded",
      });
      form.reset();
      setSelectedItems([]);
      setSelectedTransactionType(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create inventory transaction. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Generate document mutation
  const generateDocumentMutation = useMutation({
    mutationFn: async ({ transactionId, documentType }: { transactionId: number, documentType: string }) => {
      return await apiRequest('POST', `/api/inventory-movements/${transactionId}/documents`, { documentType });
    },
    onSuccess: () => {
      setIsPrintDialogOpen(false);
      setIsGeneratingDocument(false);
      toast({
        title: "Document Generated",
        description: "The document has been generated and is ready for printing",
      });
    },
    onError: (error) => {
      setIsGeneratingDocument(false);
      toast({
        title: "Error",
        description: "Failed to generate document. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Handle form submission
  const onSubmit = (data: TransactionType) => {
    // Include item details for UI display
    const enrichedItems = data.items.map(item => {
      const foundItem = items.find(i => i.id === item.itemId);
      const unit = foundItem ? itemUnits.find(u => u.id === foundItem.unitId) : undefined;
      
      return {
        ...item,
        itemName: foundItem?.name || 'Unknown Item',
        unitName: unit?.name || 'Unit'
      };
    });

    const transactionData = {
      ...data,
      items: enrichedItems
    };

    createTransactionMutation.mutate(transactionData);
  };

  // Add an item to the transaction
  const addItemRow = () => {
    const currentItems = form.getValues("items") || [];
    form.setValue("items", [...currentItems, { itemId: 0, quantity: 1 }]);
  };

  // Remove an item from the transaction
  const removeItemRow = (index: number) => {
    const currentItems = form.getValues("items") || [];
    if (currentItems.length > 1) {
      form.setValue("items", currentItems.filter((_, i) => i !== index));
    }
  };

  // Set the schema based on selected transaction type
  useEffect(() => {
    if (selectedTransactionType) {
      form.setValue("type", selectedTransactionType);
      
      // Reset form values that might not be needed for the new transaction type
      form.setValue("targetWarehouseId", undefined);
      form.setValue("processingUnitId", undefined);
      form.setValue("subcontractorId", undefined);
      form.setValue("vendorId", undefined);
      form.setValue("purchaseOrderId", undefined);
      form.setValue("expectedReturnDate", undefined);
      form.setValue("expectedCompletionDate", undefined);
    }
  }, [selectedTransactionType, form]);

  // Dynamic validation schema based on transaction type
  useEffect(() => {
    const type = form.watch("type");
    let schema = transactionSchema;

    switch (type) {
      case 'receive':
        schema = receiveGoodsSchema;
        break;
      case 'transfer':
        schema = transferSchema;
        break;
      case 'processing_send':
      case 'processing_receive':
        schema = processingUnitSchema;
        break;
      case 'subcontract_send':
      case 'subcontract_receive':
        schema = subcontractorSchema;
        break;
      default:
        schema = transactionSchema;
    }

    form.clearErrors();
  }, [form.watch("type"), form]);

  const renderTransactionStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case 'processed':
        return <Badge className="bg-blue-100 text-blue-800">Processed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      case 'draft':
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>;
    }
  };

  const getTransactionTypeName = (type: string) => {
    return transactionTypes.find(t => t.id === type)?.name || type;
  };

  const getTransactionTypeIcon = (type: string) => {
    return transactionTypes.find(t => t.id === type)?.icon || <Tag className="h-4 w-4" />;
  };

  const viewTransactionDetails = (transaction: TransactionType) => {
    setTransactionToView(transaction);
    setIsViewDialogOpen(true);
  };

  const openPrintDialog = (transaction: TransactionType) => {
    setTransactionToView(transaction);
    setIsPrintDialogOpen(true);
  };

  const generateDocument = () => {
    if (transactionToView?.id && documentType) {
      setIsGeneratingDocument(true);
      generateDocumentMutation.mutate({ 
        transactionId: transactionToView.id, 
        documentType 
      });
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Inventory Transactions</h1>
          <p className="text-muted-foreground">
            Manage all inventory movements including receipts, issues, transfers and more
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-1.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportToExcel(
                transactions.map((t: any) => ({
                  ...t,
                  warehouseName: warehouses.find((w: any) => w.id === t.warehouseId)?.name || '',
                  transactionDateFormatted: t.transactionDate ? format(new Date(t.transactionDate), 'yyyy-MM-dd') : '',
                })),
                [
                  { key: "movementId", header: "Reference" },
                  { key: "type", header: "Type" },
                  { key: "warehouseName", header: "Warehouse" },
                  { key: "transactionDateFormatted", header: "Date" },
                  { key: "status", header: "Status" },
                  { key: "notes", header: "Notes" },
                ],
                "inventory-movements",
                "xlsx"
              )}>
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToExcel(
                transactions.map((t: any) => ({
                  ...t,
                  warehouseName: warehouses.find((w: any) => w.id === t.warehouseId)?.name || '',
                  transactionDateFormatted: t.transactionDate ? format(new Date(t.transactionDate), 'yyyy-MM-dd') : '',
                })),
                [
                  { key: "movementId", header: "Reference" },
                  { key: "type", header: "Type" },
                  { key: "warehouseName", header: "Warehouse" },
                  { key: "transactionDateFormatted", header: "Date" },
                  { key: "status", header: "Status" },
                  { key: "notes", header: "Notes" },
                ],
                "inventory-movements",
                "csv"
              )}>
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-primary hover:bg-primary/90"
          >
            Create Transaction
          </Button>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="documents">Documents & Reports</TabsTrigger>
          <TabsTrigger value="insights">AI Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>
                View and manage all inventory movements
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTransactions ? (
                <div className="flex justify-center my-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center p-8 border rounded-lg">
                  <Archive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Transactions Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Get started by creating your first inventory transaction
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    Create Transaction
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            {transaction.movementId || transaction.referenceNumber || '-'}
                          </TableCell>
                          <TableCell className="flex items-center gap-2">
                            {getTransactionTypeIcon(transaction.type)}
                            {getTransactionTypeName(transaction.type)}
                          </TableCell>
                          <TableCell>
                            {warehouses.find(w => w.id === transaction.warehouseId)?.name || '-'}
                          </TableCell>
                          <TableCell>
                            {transaction.transactionDate 
                              ? format(new Date(transaction.transactionDate), 'MMM dd, yyyy')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {renderTransactionStatusBadge(transaction.status || 'draft')}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => viewTransactionDetails(transaction)}
                            >
                              View
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openPrintDialog(transaction)}
                            >
                              <Printer className="h-4 w-4 mr-1" />
                              Print
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Documents & Reports</CardTitle>
              <CardDescription>
                Generate and manage inventory-related documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-primary" />
                      Delivery Challans
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Generate and print delivery challans for goods dispatch
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-primary" />
                      Gate Passes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Create gate passes for material movement in and out
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-primary" />
                      Transfer Vouchers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Print transfer vouchers for inter-warehouse transfers
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-primary" />
                      Inventory Reports
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Generate detailed inventory valuation reports
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-primary" />
                      Stock Movement History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      View and export stock movement history by item
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-primary" />
                      Manufacturing Journals
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Track material consumption and output in manufacturing
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>AI-Powered Inventory Insights</CardTitle>
              <CardDescription>
                Data-driven recommendations to optimize your inventory management
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAiRecommendations ? (
                <div className="flex justify-center my-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  <Alert className="bg-blue-50 border-blue-200">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-800">Inventory Optimization Insights</AlertTitle>
                    <AlertDescription className="text-blue-700">
                      AI-powered recommendations based on your transaction patterns and inventory levels
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {aiRecommendations && aiRecommendations.itemRecommendations && Array.isArray(aiRecommendations.itemRecommendations) ? (
                      aiRecommendations.itemRecommendations.slice(0, 6).map((recommendation, index) => (
                        <Card key={index} className="overflow-hidden">
                          <CardHeader className="pb-2 bg-slate-50">
                            <CardTitle className="text-lg flex items-center">
                              <Check className="h-5 w-5 mr-2 text-green-500" />
                              {recommendation.itemName}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-4">
                            <p className="text-sm text-muted-foreground mb-2">
                              {recommendation.recommendation}
                            </p>
                            {recommendation.action && (
                              <div className="mt-2 text-sm font-medium">
                                Suggested action: {recommendation.action}
                              </div>
                            )}
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <div className="flex flex-col bg-slate-50 p-2 rounded">
                                <span className="text-xs text-muted-foreground">Current Stock</span>
                                <span className="font-medium">{recommendation.currentStock}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : Array.isArray(aiRecommendations) ? (
                      aiRecommendations.slice(0, 6).map((recommendation, index) => (
                        <Card key={index} className="overflow-hidden">
                          <CardHeader className="pb-2 bg-slate-50">
                            <CardTitle className="text-lg flex items-center">
                              {recommendation.type === 'warning' 
                                ? <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
                                : <Check className="h-5 w-5 mr-2 text-green-500" />
                              }
                              {recommendation.title}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-4">
                            <p className="text-sm text-muted-foreground mb-2">
                              {recommendation.description}
                            </p>
                            {recommendation.suggestedAction && (
                              <div className="mt-2 text-sm font-medium">
                                Suggested action: {recommendation.suggestedAction}
                              </div>
                            )}
                            {recommendation.metrics && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {Object.entries(recommendation.metrics).map(([key, value]) => (
                                  <div key={key} className="text-xs bg-gray-50 p-2 rounded">
                                    <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}: </span>
                                    <span className="font-medium">{value}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="col-span-2">
                        <Card className="bg-slate-50">
                          <CardContent className="pt-6">
                            <div className="flex flex-col items-center justify-center text-center p-6">
                              <AlertCircle className="h-10 w-10 text-muted-foreground mb-2" />
                              <h3 className="text-lg font-semibold">AI Recommendations</h3>
                              <p className="text-muted-foreground mb-2">
                                AI-powered recommendations are currently being generated. Check back soon for insights.
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </div>

                  <div className="mt-8">
                    <h3 className="text-xl font-bold mb-4">Intelligent Forecasting</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">Predicted Stockouts</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-red-500">4</div>
                          <p className="text-sm text-muted-foreground">
                            Items at risk of stockout in the next 30 days
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">Excess Inventory</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-amber-500">7</div>
                          <p className="text-sm text-muted-foreground">
                            Items with surplus inventory based on demand forecasts
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">Optimized Inventory</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-green-500">85%</div>
                          <p className="text-sm text-muted-foreground">
                            Inventory health score based on turnover and levels
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <div className="mt-8">
                    <h3 className="text-xl font-bold mb-4">Seasonal Demand Patterns</h3>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="h-64 w-full bg-slate-50 flex items-center justify-center rounded-md border">
                          <p className="text-muted-foreground">
                            Seasonal demand forecast chart visualization
                          </p>
                        </div>
                        <div className="mt-4 text-sm text-muted-foreground">
                          <p>
                            Based on historical data patterns, we predict a 22% increase in demand for cotton fabrics in the upcoming quarter.
                            Consider increasing your stock levels for these items to meet the forecasted demand.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Transaction Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[900px] h-[90vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle>Create Inventory Transaction</DialogTitle>
            <DialogDescription>
              Record a new inventory movement by filling out the form below
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {!selectedTransactionType ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {transactionTypes.map((type) => (
                  <div
                    key={type.id}
                    className="border rounded-lg p-4 flex items-center cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedTransactionType(type.id)}
                  >
                    <div className="p-2 bg-primary/10 rounded-full mr-3">
                      {type.icon}
                    </div>
                    <div>
                      <h3 className="font-medium">{type.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {getTransactionDescription(type.id)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="flex items-center space-x-2 mb-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedTransactionType(null)}
                    >
                      Back
                    </Button>
                    <h2 className="text-xl font-semibold flex items-center">
                      {getTransactionTypeIcon(selectedTransactionType)}
                      <span className="ml-2">{getTransactionTypeName(selectedTransactionType)}</span>
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="warehouseId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Warehouse</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            defaultValue={field.value?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select warehouse" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {warehouses.map((warehouse) => (
                                <SelectItem 
                                  key={warehouse.id} 
                                  value={warehouse.id.toString()}
                                >
                                  {warehouse.name} ({warehouse.location})
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
                        <FormItem className="flex flex-col">
                          <FormLabel>Transaction Date</FormLabel>
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
                                    <span>Pick a date</span>
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

                    {/* Dynamic fields based on transaction type */}
                    {renderDynamicTransactionFields()}
                  </div>

                  <Separator />

                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium">Items</h3>
                      <Button 
                        type="button" 
                        size="sm" 
                        variant="outline"
                        onClick={addItemRow}
                      >
                        Add Item
                      </Button>
                    </div>

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
                                    onValueChange={(value) => field.onChange(parseInt(value))}
                                    defaultValue={field.value?.toString()}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select item" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {items.map((item) => (
                                        <SelectItem 
                                          key={item.id} 
                                          value={item.id.toString()}
                                        >
                                          {item.itemCode} - {item.name}
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
                                      {...field} 
                                      type="number" 
                                      min="0.01" 
                                      step="0.01" 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {['receive', 'adjustment'].includes(selectedTransactionType) && (
                              <FormField
                                control={form.control}
                                name={`items.${index}.unitCost`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Unit Cost</FormLabel>
                                    <FormControl>
                                      <Input 
                                        {...field} 
                                        type="number" 
                                        min="0" 
                                        step="0.01" 
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

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
                              name={`items.${index}.expiryDate`}
                              render={({ field }) => (
                                <FormItem className="flex flex-col">
                                  <FormLabel>Expiry Date (if applicable)</FormLabel>
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
                                            <span>Select expiry date</span>
                                          )}
                                        </Button>
                                      </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                      <Calendar
                                        mode="single"
                                        selected={field.value as Date}
                                        onSelect={field.onChange}
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field}
                            placeholder="Add any relevant notes about this transaction"
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsCreateDialogOpen(false)}
                      className="mr-2"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createTransactionMutation.isPending}>
                      {createTransactionMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Create Transaction
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* View Transaction Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              {transactionToView && getTransactionTypeIcon(transactionToView.type)}
              <span className="ml-2">
                {transactionToView && getTransactionTypeName(transactionToView.type)}
              </span>
            </DialogTitle>
            <DialogDescription>
              Inventory transaction details
            </DialogDescription>
          </DialogHeader>

          {transactionToView && (
            <div className="mt-4 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Reference Number
                  </p>
                  <p className="font-semibold">
                    {transactionToView.movementId || transactionToView.referenceNumber || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Status
                  </p>
                  <div>
                    {renderTransactionStatusBadge(transactionToView.status || 'draft')}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Warehouse
                  </p>
                  <p>
                    {warehouses.find(w => w.id === transactionToView.warehouseId)?.name || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Date
                  </p>
                  <p>
                    {transactionToView.transactionDate 
                      ? format(new Date(transactionToView.transactionDate), 'MMMM d, yyyy')
                      : '-'}
                  </p>
                </div>

                {transactionToView.targetWarehouseId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Target Warehouse
                    </p>
                    <p>
                      {warehouses.find(w => w.id === transactionToView.targetWarehouseId)?.name || '-'}
                    </p>
                  </div>
                )}

                {transactionToView.processingUnitId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Processing Unit
                    </p>
                    <p>
                      {processingUnits.find(p => p.id === transactionToView.processingUnitId)?.name || '-'}
                    </p>
                  </div>
                )}

                {transactionToView.subcontractorId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Subcontractor
                    </p>
                    <p>
                      {subcontractors.find(s => s.id === transactionToView.subcontractorId)?.name || '-'}
                    </p>
                  </div>
                )}

                {transactionToView.vendorId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Vendor
                    </p>
                    <p>
                      {vendors.find(v => v.id === transactionToView.vendorId)?.name || '-'}
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-3">Items</h3>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit</TableHead>
                        {['receive', 'adjustment'].includes(transactionToView.type) && (
                          <TableHead>Unit Cost</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactionToView.items?.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.itemName || 'Unknown Item'}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unitName || '-'}</TableCell>
                          {['receive', 'adjustment'].includes(transactionToView.type) && (
                            <TableCell>{item.unitCost || '-'}</TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {transactionToView.notes && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-medium mb-2">Notes</h3>
                    <p className="text-sm">{transactionToView.notes}</p>
                  </div>
                </>
              )}

              <DialogFooter>
                <Button onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Generate Document</DialogTitle>
            <DialogDescription>
              Select the type of document you want to generate for this transaction
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="delivery-challan" 
                  checked={documentType === 'delivery-challan'}
                  onCheckedChange={() => setDocumentType('delivery-challan')}
                />
                <label
                  htmlFor="delivery-challan"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delivery Challan
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="gate-pass" 
                  checked={documentType === 'gate-pass'}
                  onCheckedChange={() => setDocumentType('gate-pass')}
                />
                <label
                  htmlFor="gate-pass"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Gate Pass
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="transfer-voucher" 
                  checked={documentType === 'transfer-voucher'}
                  onCheckedChange={() => setDocumentType('transfer-voucher')}
                />
                <label
                  htmlFor="transfer-voucher"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Transfer Voucher
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="transaction-slip" 
                  checked={documentType === 'transaction-slip'}
                  onCheckedChange={() => setDocumentType('transaction-slip')}
                />
                <label
                  htmlFor="transaction-slip"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Transaction Slip
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsPrintDialogOpen(false)} 
              className="mr-2"
            >
              Cancel
            </Button>
            <Button 
              onClick={generateDocument} 
              disabled={!documentType || isGeneratingDocument}
            >
              {isGeneratingDocument && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // Helper function to render dynamic fields based on transaction type
  function renderDynamicTransactionFields() {
    const type = form.watch("type");
    const fields = [];

    // Reference number field for all transaction types
    fields.push(
      <FormField
        key="referenceNumber"
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
    );

    // Conditional fields based on transaction type
    switch (type) {
      case 'transfer':
        fields.push(
          <FormField
            key="targetWarehouseId"
            control={form.control}
            name="targetWarehouseId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Warehouse</FormLabel>
                <Select 
                  onValueChange={(value) => field.onChange(parseInt(value))}
                  defaultValue={field.value?.toString()}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination warehouse" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem 
                        key={warehouse.id} 
                        value={warehouse.id.toString()}
                        disabled={warehouse.id === form.watch("warehouseId")}
                      >
                        {warehouse.name} ({warehouse.location})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        );
        break;

      case 'receive':
        fields.push(
          <FormField
            key="vendorId"
            control={form.control}
            name="vendorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vendor (Optional)</FormLabel>
                <Select 
                  onValueChange={(value) => field.onChange(parseInt(value))}
                  defaultValue={field.value?.toString()}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {vendors.map((vendor) => (
                      <SelectItem 
                        key={vendor.id} 
                        value={vendor.id.toString()}
                      >
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        );
        break;

      case 'processing_send':
      case 'processing_receive':
        fields.push(
          <FormField
            key="processingUnitId"
            control={form.control}
            name="processingUnitId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Processing Unit</FormLabel>
                <Select 
                  onValueChange={(value) => field.onChange(parseInt(value))}
                  defaultValue={field.value?.toString()}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select processing unit" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {processingUnits.map((unit) => (
                      <SelectItem 
                        key={unit.id} 
                        value={unit.id.toString()}
                      >
                        {unit.name} ({unit.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        );

        if (type === 'processing_send') {
          fields.push(
            <FormField
              key="expectedReturnDate"
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
                            <span>Select expected return date</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.value as Date}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          );
        }
        break;

      case 'subcontract_send':
      case 'subcontract_receive':
        fields.push(
          <FormField
            key="subcontractorId"
            control={form.control}
            name="subcontractorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subcontractor</FormLabel>
                <Select 
                  onValueChange={(value) => field.onChange(parseInt(value))}
                  defaultValue={field.value?.toString()}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subcontractor" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {subcontractors.map((subcontractor) => (
                      <SelectItem 
                        key={subcontractor.id} 
                        value={subcontractor.id.toString()}
                      >
                        {subcontractor.name} ({subcontractor.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        );

        if (type === 'subcontract_send') {
          fields.push(
            <FormField
              key="expectedCompletionDate"
              control={form.control}
              name="expectedCompletionDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Expected Completion Date</FormLabel>
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
                            <span>Select expected completion date</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.value as Date}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          );
        }
        break;
    }

    return fields;
  }

  // Helper function to get transaction type description
  function getTransactionDescription(type: string): string {
    switch (type) {
      case 'receive':
        return "Record receipt of goods from vendors or purchase orders";
      case 'issue':
        return "Issue items from inventory for production or sales";
      case 'transfer':
        return "Move inventory between warehouses or locations";
      case 'processing_send':
        return "Send materials to internal processing units for value addition";
      case 'processing_receive':
        return "Receive processed items back from processing units";
      case 'subcontract_send':
        return "Send materials to subcontractors for external processing";
      case 'subcontract_receive':
        return "Receive processed items back from subcontractors";
      case 'return':
        return "Record returns of items to inventory from various sources";
      case 'adjustment':
        return "Make quantity adjustments after physical count or reconciliation";
      case 'manufacturing':
        return "Record material consumption and output in manufacturing process";
      default:
        return "Record inventory movement";
    }
  }
}