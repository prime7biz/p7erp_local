import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useLocation, Link, useLocation as useWouterLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import QuotationAIInsights from '@/components/quotations/QuotationAIInsights';
import { formatMoney } from '@/lib/formatters';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Copy,
  Download, 
  Edit, 
  FileText, 
  Loader2, 
  Mail, 
  MoreHorizontal,
  Printer, 
  Trash2,
  CheckCircle,
  Send,
  ClipboardCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const QuotationView: React.FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const [location, setLocation] = useWouterLocation();
  const [activeTab, setActiveTab] = useState("overview");
  
  // Fetch quotation data
  const { 
    data: quotation, 
    isLoading, 
    isError, 
    error 
  } = useQuery({
    queryKey: ['/api/quotations', params.id],
    queryFn: async () => {
      const response = await fetch(`/api/quotations/${params.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch quotation details');
      }
      return response.json();
    },
  });

  const materials: any[] = quotation?.materials || [];
  const manufacturing: any[] = quotation?.manufacturing || [];
  const otherCosts: any[] = quotation?.otherCosts || [];
  
  // Fetch customer data
  const { data: customer } = useQuery({
    queryKey: ['/api/customers', quotation?.customerId],
    queryFn: async () => {
      const response = await fetch(`/api/customers/${quotation?.customerId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch customer details');
      }
      return response.json();
    },
    enabled: !!quotation?.customerId,
  });
  
  // Format date to display in local format
  const formatDate = (date: string | Date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  };
  
  const calculateTotals = () => {
    const materialsTotal = parseFloat(quotation?.materialCost || '0') ||
      materials?.reduce((sum: number, item: any) => sum + parseFloat(item.totalAmount || '0'), 0) || 0;
    const manufacturingTotal = parseFloat(quotation?.manufacturingCost || '0') ||
      manufacturing?.reduce((sum: number, item: any) => sum + parseFloat(item.totalOrderCost || '0'), 0) || 0;
    const otherCostsTotal = parseFloat(quotation?.otherCost || '0') ||
      otherCosts?.reduce((sum: number, item: any) => sum + parseFloat(item.calculatedAmount || item.totalAmount || '0'), 0) || 0;

    const baseCost = materialsTotal + manufacturingTotal + otherCostsTotal;
    const profitPercentage = quotation ? parseFloat(quotation.profitPercentage || '0') : 0;
    const profitAmount = baseCost * (profitPercentage / 100);
    const total = parseFloat(quotation?.quotedPrice || '0') || (baseCost + profitAmount);

    return { materialsTotal, manufacturingTotal, otherCostsTotal, baseCost, profitAmount, total };
  };

  const totals = calculateTotals();
  
  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'DRAFT':
        return 'bg-gray-200 text-gray-800';
      case 'SUBMITTED':
        return 'bg-yellow-200 text-yellow-800';
      case 'APPROVED':
        return 'bg-green-200 text-green-800';
      case 'SENT':
        return 'bg-blue-200 text-blue-800';
      case 'REJECTED':
        return 'bg-red-200 text-red-800';
      case 'CONVERTED TO ORDER':
        return 'bg-purple-200 text-purple-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };
  
  // Print quotation handler
  const handlePrint = () => {
    toast({
      title: "Print initiated",
      description: "The quotation is being prepared for printing.",
    });
    setTimeout(() => {
      window.print();
    }, 300);
  };
  
  // Send quotation by email handler
  const handleSendEmail = () => {
    toast({
      title: "Feature not available",
      description: "Email sending is not available in this release. Please use Print or Export PDF instead.",
    });
  };
  
  // Delete quotation handler
  const handleDeleteQuotation = () => {
    toast({
      title: "Deletion in progress",
      description: "The quotation is being deleted...",
    });
    
    fetch(`/api/quotations/${params.id}`, {
      method: 'DELETE',
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to delete quotation');
        }
        toast({
          title: "Success",
          description: "Quotation has been deleted successfully.",
        });
        navigate('/quotations');
      })
      .catch(error => {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to delete quotation.",
        });
      });
  };
  
  // Generate PDF handler
  const handleGeneratePdf = () => {
    if (params.id) {
      window.open(`/api/quotations/${params.id}/pdf`, '_blank');
    }
  };

  const workflowStatus = quotation?.workflowStatus || quotation?.status || 'DRAFT';

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await apiRequest(`/api/quotations/${params.id}`, 'PATCH', {
        workflowStatus: newStatus,
        status: newStatus.toLowerCase(),
      });
      return res.json();
    },
    onSuccess: (_, newStatus) => {
      qc.invalidateQueries({ queryKey: ['/api/quotations'] });
      qc.invalidateQueries({ queryKey: ['/api/quotations', params.id] });
      toast({ title: 'Status updated', description: `Quotation status changed to ${newStatus}` });
    },
    onError: (err: any) => {
      toast({ title: 'Status update failed', description: String(err), variant: 'destructive' });
    },
  });
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading quotation data...</span>
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Quotation Details</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error instanceof Error ? error.message : "An unknown error occurred"}</span>
        </div>
      </div>
    );
  }
  
  if (!quotation) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Quotation Details</h1>
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Not Found: </strong>
          <span className="block sm:inline">The requested quotation could not be found</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center mb-6">
        <Button variant="ghost" onClick={() => navigate('/quotations')} className="mr-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Quotations
        </Button>
        <h1 className="text-2xl font-bold">
          Quotation Details: {quotation.quotationId}
        </h1>
      </div>
      
      {/* Header Action Buttons */}
      <div className="flex flex-wrap justify-between items-center mb-6">
        <div className="flex items-center">
          <Badge className={`text-sm py-1.5 px-3 ${getStatusColor(workflowStatus)}`}>
            {workflowStatus}
          </Badge>
          
          <span className="mx-4 text-neutral-dark">
            Created on: {formatDate(quotation.createdAt)}
          </span>
          
          <span className="text-neutral-dark">
            Valid until: {formatDate(quotation.validUntil)}
          </span>
        </div>
        
        <div className="flex gap-2 mt-2 sm:mt-0">
          {workflowStatus === 'DRAFT' && (
            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate('SUBMITTED')} disabled={statusMutation.isPending}>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Submit for Review
            </Button>
          )}
          {workflowStatus === 'SUBMITTED' && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => statusMutation.mutate('APPROVED')} disabled={statusMutation.isPending}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>
          )}
          {workflowStatus === 'APPROVED' && (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => statusMutation.mutate('SENT')} disabled={statusMutation.isPending}>
              <Send className="h-4 w-4 mr-2" />
              Mark as Sent
            </Button>
          )}
          <Button 
            className="bg-orange-600 hover:bg-orange-700"
            size="sm" 
            onClick={() => setLocation(`/quotations/${params.id}/convert-to-order`)}
            disabled={workflowStatus === "CONVERTED TO ORDER"}
          >
            <FileText className="h-4 w-4 mr-2" />
            Convert to Order
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4 mr-2" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem 
                onClick={handlePrint}
                className="cursor-pointer"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={handleSendEmail}
                className="cursor-pointer"
              >
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={handleGeneratePdf}
                className="cursor-pointer"
              >
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                className="cursor-pointer"
                disabled={workflowStatus === "CONVERTED TO ORDER"}
                onClick={() => setLocation(`/quotations/${params.id}/edit`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:text-red-600"
                    disabled={workflowStatus === "CONVERTED TO ORDER"}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the
                      quotation and remove it from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleDeleteQuotation}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="materials">Materials</TabsTrigger>
              <TabsTrigger value="manufacturing">Manufacturing</TabsTrigger>
              <TabsTrigger value="others">Other Costs</TabsTrigger>
            </TabsList>
            
            {/* Overview Tab */}
            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle>Quotation Overview</CardTitle>
                  <CardDescription>
                    Basic details and information about this quotation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-dark mb-1">Style Details</h3>
                      <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                        <p className="text-lg font-medium mb-1">{quotation.styleName}</p>
                        <p className="text-sm text-neutral-dark mb-2">Department: {quotation.department}</p>
                        <p className="text-sm text-neutral-dark">Projected Quantity: {quotation.projectedQuantity.toLocaleString()}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-dark mb-1">Delivery & Pricing</h3>
                      <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm text-neutral-dark">Target Price:</span>
                          <span className="font-medium">{formatMoney(parseFloat(quotation.targetPrice))}</span>
                        </div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm text-neutral-dark">Quoted Price:</span>
                          <span className="font-medium text-primary">{formatMoney(parseFloat(quotation.quotedPrice))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-dark">Delivery Date:</span>
                          <span className="font-medium">{formatDate(quotation.projectedDeliveryDate)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-dark mb-1">Notes</h3>
                    <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200 min-h-[100px]">
                      {quotation.notes ? (
                        <p className="text-sm whitespace-pre-line">{quotation.notes}</p>
                      ) : (
                        <p className="text-sm text-neutral-dark italic">No notes added to this quotation</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-dark mb-1">Cost Summary</h3>
                    <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-dark">Materials:</span>
                          <span>{formatMoney(totals.materialsTotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-dark">Manufacturing:</span>
                          <span>{formatMoney(totals.manufacturingTotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-dark">Other Costs:</span>
                          <span>{formatMoney(totals.otherCostsTotal)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">Base Cost:</span>
                          <span className="font-medium">{formatMoney(totals.baseCost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-dark">Profit ({quotation.profitPercentage}%):</span>
                          <span>{formatMoney(totals.profitAmount)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-base font-semibold">Total:</span>
                          <span className="text-base font-semibold text-primary">{formatMoney(totals.total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Materials Tab */}
            <TabsContent value="materials">
              <Card>
                <CardHeader>
                  <CardTitle>Materials</CardTitle>
                  <CardDescription>
                    Fabric, trim, accessories, and other materials required for production
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {materials && materials.length > 0 ? (
                          materials.map((material: any) => (
                            <TableRow key={material.id}>
                              <TableCell>{material.description}</TableCell>
                              <TableCell className="text-right">{material.quantity}</TableCell>
                              <TableCell className="text-right">{formatMoney(parseFloat(material.unitPrice))}</TableCell>
                              <TableCell className="text-right font-medium">{formatMoney(parseFloat(material.totalPrice))}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                              <p className="text-muted-foreground">No materials added to this quotation</p>
                            </TableCell>
                          </TableRow>
                        )}
                        
                        {materials && materials.length > 0 && (
                          <TableRow className="bg-neutral-50">
                            <TableCell colSpan={3} className="text-right font-semibold">Total Materials Cost:</TableCell>
                            <TableCell className="text-right font-semibold">{formatMoney(totals.materialsTotal)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Manufacturing Tab */}
            <TabsContent value="manufacturing">
              <Card>
                <CardHeader>
                  <CardTitle>Manufacturing Costs</CardTitle>
                  <CardDescription>
                    Labor, processing, and other manufacturing costs for this style
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manufacturing && manufacturing.length > 0 ? (
                          manufacturing.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.description}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatMoney(parseFloat(item.unitPrice))}</TableCell>
                              <TableCell className="text-right font-medium">{formatMoney(parseFloat(item.totalPrice))}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                              <p className="text-muted-foreground">No manufacturing costs added to this quotation</p>
                            </TableCell>
                          </TableRow>
                        )}
                        
                        {manufacturing && manufacturing.length > 0 && (
                          <TableRow className="bg-neutral-50">
                            <TableCell colSpan={3} className="text-right font-semibold">Total Manufacturing Cost:</TableCell>
                            <TableCell className="text-right font-semibold">{formatMoney(totals.manufacturingTotal)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Other Costs Tab */}
            <TabsContent value="others">
              <Card>
                <CardHeader>
                  <CardTitle>Other Costs</CardTitle>
                  <CardDescription>
                    Shipping, taxes, duties, and any other costs associated with this style
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {otherCosts && otherCosts.length > 0 ? (
                          otherCosts.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.description}</TableCell>
                              <TableCell>{item.notes || '-'}</TableCell>
                              <TableCell className="text-right font-medium">{formatMoney(parseFloat(item.amount))}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="h-24 text-center">
                              <p className="text-muted-foreground">No other costs added to this quotation</p>
                            </TableCell>
                          </TableRow>
                        )}
                        
                        {otherCosts && otherCosts.length > 0 && (
                          <TableRow className="bg-neutral-50">
                            <TableCell colSpan={2} className="text-right font-semibold">Total Other Costs:</TableCell>
                            <TableCell className="text-right font-semibold">{formatMoney(totals.otherCostsTotal)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Right Column - Customer Info and Actions */}
        <div>
          {/* Customer Info Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Customer Information</CardTitle>
            </CardHeader>
            <CardContent>
              {customer ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold">Customer Name</h4>
                    <p>{customer.customerName}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Customer ID</h4>
                    <p>{customer.customerId}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Contact Person</h4>
                    <p>{customer.contactPerson || 'Not specified'}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Email</h4>
                    <p>{customer.email || 'Not specified'}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Phone</h4>
                    <p>{customer.phone || 'Not specified'}</p>
                  </div>
                  <div className="pt-2">
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link to={`/customers/${customer.id}`}>
                        View Customer Profile
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  <p className="mt-2 text-sm text-neutral-dark">Loading customer information...</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Quotation Actions Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Quotation Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <Button asChild variant="default" className="w-auto">
                  <Link to={`/quotations/${params.id}/convert-to-order`}>
                    <FileText className="h-4 w-4 mr-2" />
                    Convert to Order
                  </Link>
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to={`/quotations/${params.id}/edit`} className="w-full cursor-pointer">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Quotation
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSendEmail} className="cursor-pointer">
                      <Mail className="h-4 w-4 mr-2" />
                      Send to Customer
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to={`/quotations/${params.id}/duplicate`} className="w-full cursor-pointer">
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <div className="text-red-500 cursor-pointer px-2 py-1.5 text-sm flex items-center" onClick={(e) => e.stopPropagation()}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Quotation
                        </div>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the quotation {quotation.quotationId}. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={handleDeleteQuotation}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
          
          {/* Quotation Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Quotation Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-dark">Quotation ID:</span>
                  <span className="font-medium">{quotation.quotationId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-dark">Created Date:</span>
                  <span>{formatDate(quotation.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-dark">Quotation Date:</span>
                  <span>{formatDate(quotation.quotationDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-dark">Valid Until:</span>
                  <span>{formatDate(quotation.validUntil)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-dark">Delivery Date:</span>
                  <span>{formatDate(quotation.projectedDeliveryDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-dark">Status:</span>
                  <Badge className={getStatusColor(workflowStatus)}>
                    {workflowStatus}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-dark">Profit Margin:</span>
                  <span>{quotation.profitPercentage}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Right Column - AI Insights */}
        <div className="col-span-1">
          {quotation && (
            <QuotationAIInsights quotationId={quotation.id} />
          )}
        </div>
      </div>
    </div>
  );
};

export default QuotationView;