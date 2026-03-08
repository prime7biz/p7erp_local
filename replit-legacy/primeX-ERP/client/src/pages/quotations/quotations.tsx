import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Badge,
} from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Plus, FileText, Filter, Search, ArrowUpDown, Trash2, Edit, Eye, MoreHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatMoney } from '@/lib/formatters';

interface Quotation {
  id: number;
  quotationId: string;
  customerId: number;
  customerName?: string;
  inquiryId: number;
  styleName: string;
  department: string;
  projectedQuantity: number;
  projectedDeliveryDate: Date;
  quotationDate: Date;
  validUntil: Date;
  targetPrice: string;
  quotedPrice: string;
  profitPercentage: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Customer {
  id: number;
  customerId: string;
  name: string;
}

interface Inquiry {
  id: number;
  inquiryId: string;
  styleName: string;
  department: string;
}

const QuotationsPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for filtering and pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>(undefined);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const itemsPerPage = 10;
  
  // Convert inquiry to quotation dialog state
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [selectedInquiryId, setSelectedInquiryId] = useState<number | null>(null);
  const [profitPercentage, setProfitPercentage] = useState('15');
  
  // Fetch quotations
  const { 
    data: quotations, 
    isLoading, 
    isError, 
    error 
  } = useQuery({ 
    queryKey: [
      '/api/quotations', 
      searchQuery, 
      statusFilter, 
      departmentFilter, 
      currentPage, 
      sortField, 
      sortDirection
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter) params.append('status', statusFilter);
      if (departmentFilter) params.append('departments', departmentFilter);
      params.append('limit', String(itemsPerPage));
      params.append('offset', String((currentPage - 1) * itemsPerPage));
      params.append('sortBy', sortField);
      params.append('sortDirection', sortDirection);
      
      const response = await fetch(`/api/quotations?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch quotations');
      }
      return response.json() as Promise<Quotation[]>;
    }
  });
  
  // Fetch inquiries for convert dialog
  const {
    data: inquiries,
    isLoading: isLoadingInquiries
  } = useQuery({
    queryKey: ['/api/inquiries'],
    enabled: showConvertDialog
  });

  // Fetch customers for displaying customer names
  const {
    data: customers
  } = useQuery({
    queryKey: ['/api/customers'],
  });
  
  // Convert inquiry to quotation mutation
  const convertInquiryMutation = useMutation({
    mutationFn: async (inquiryId: number) => {
      console.log("Converting inquiry ID:", inquiryId, "with profit percentage:", profitPercentage);
      try {
        const response = await apiRequest(`/api/quotations/convert-inquiry/${inquiryId}`, 'POST', 
          { profitPercentage: Number(profitPercentage) }
        );
        // The apiRequest function already throws if the response is not ok
        return await response.json();
      } catch (error) {
        console.error("Error converting inquiry:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Conversion successful",
        description: "Inquiry has been successfully converted to quotation.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quotations'] });
      setShowConvertDialog(false);
      setSelectedInquiryId(null);
      setProfitPercentage('15');
    },
    onError: (error) => {
      toast({
        title: "Conversion failed",
        description: error instanceof Error ? error.message : "An error occurred during conversion",
        variant: "destructive",
      });
    }
  });
  
  // Delete quotation mutation
  const deleteQuotationMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/quotations/${id}`, 'DELETE');
    },
    onSuccess: () => {
      toast({
        title: "Quotation deleted",
        description: "The quotation has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quotations'] });
    },
    onError: (error) => {
      toast({
        title: "Deletion failed",
        description: error instanceof Error ? error.message : "An error occurred while deleting the quotation",
        variant: "destructive",
      });
    }
  });
  
  // Handle sort toggle
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // Format date to display in local format
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString();
  };
  
  // Get customer name by customerId
  const getCustomerName = (customerId: number) => {
    const customer = customers?.find(c => c.id === customerId);
    return customer?.customerName || 'Unknown Customer';
  };
  
  // Handle conversion submission
  const handleConvertSubmit = () => {
    if (!selectedInquiryId) {
      toast({
        title: "No inquiry selected",
        description: "Please select an inquiry to convert.",
        variant: "destructive",
      });
      return;
    }
    
    convertInquiryMutation.mutate(selectedInquiryId);
  };
  
  // Status badge color mapping
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
  
  if (isError) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Quotations</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error instanceof Error ? error.message : "An unknown error occurred"}</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quotations</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowConvertDialog(true)}>
            <FileText className="mr-2 h-4 w-4" />
            Convert Inquiry
          </Button>
          <Button asChild variant="outline">
            <Link to="/quotations/multi-currency">
              <Plus className="mr-2 h-4 w-4" />
              Multi-Currency Quote
            </Link>
          </Button>
          <Button asChild>
            <Link to="/quotations/new">
              <Plus className="mr-2 h-4 w-4" />
              New Quotation
            </Link>
          </Button>
        </div>
      </div>
      
      {/* Filter & Search Section */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-md font-medium">Filters & Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search quotations..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="w-[150px]">
              <Select value={statusFilter || "all"} onValueChange={(val) => setStatusFilter(val === "all" ? undefined : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[180px]">
              <Select value={departmentFilter || "all"} onValueChange={(val) => setDepartmentFilter(val === "all" ? undefined : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="mens">Men's</SelectItem>
                  <SelectItem value="womens">Women's</SelectItem>
                  <SelectItem value="kids">Kids</SelectItem>
                  <SelectItem value="accessories">Accessories</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Quotations Table */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px] cursor-pointer" onClick={() => handleSort('quotationId')}>
                    ID
                    <ArrowUpDown className="ml-2 h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('styleName')}>
                    Style
                    <ArrowUpDown className="ml-2 h-4 w-4 inline" />
                  </TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('department')}>
                    Department
                    <ArrowUpDown className="ml-2 h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('projectedQuantity')}>
                    Quantity
                    <ArrowUpDown className="ml-2 h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('quotationDate')}>
                    Date
                    <ArrowUpDown className="ml-2 h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('quotedPrice')}>
                    Price
                    <ArrowUpDown className="ml-2 h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                    Status
                    <ArrowUpDown className="ml-2 h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <span className="mt-2 block text-sm text-gray-500">Loading quotations...</span>
                    </TableCell>
                  </TableRow>
                ) : quotations && quotations.length > 0 ? (
                  quotations.map((quotation) => (
                    <TableRow key={quotation.id}>
                      <TableCell className="font-medium">{quotation.quotationId}</TableCell>
                      <TableCell>{quotation.styleName}</TableCell>
                      <TableCell>{getCustomerName(quotation.customerId)}</TableCell>
                      <TableCell>{quotation.department}</TableCell>
                      <TableCell>{quotation.projectedQuantity.toLocaleString()}</TableCell>
                      <TableCell>{formatDate(quotation.quotationDate)}</TableCell>
                      <TableCell>{formatMoney(parseFloat(quotation.quotedPrice))}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(quotation.workflowStatus || quotation.status)}>
                          {quotation.workflowStatus || quotation.status || 'DRAFT'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/quotations/${quotation.id}`} className="cursor-pointer w-full">
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/quotations/${quotation.id}/edit`} className="cursor-pointer w-full">
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/quotations/${quotation.id}/convert-to-order`} className="cursor-pointer w-full">
                                <FileText className="h-4 w-4 mr-2" />
                                Convert to Order
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer text-red-500">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
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
                                  <AlertDialogAction onClick={() => deleteQuotationMutation.mutate(quotation.id)}>
                                    {deleteQuotationMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : null}
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <p className="text-muted-foreground">No quotations found</p>
                      {searchQuery || statusFilter || departmentFilter ? (
                        <Button 
                          variant="link" 
                          onClick={() => {
                            setSearchQuery('');
                            setStatusFilter(undefined);
                            setDepartmentFilter(undefined);
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-2">
                          Create a new quotation or convert an inquiry to get started
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between items-center py-4">
          <div className="text-sm text-muted-foreground">
            {quotations ? `Showing ${quotations.length} out of many quotations` : 'Loading...'}
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
              
              {[...Array(3)].map((_, i) => {
                const pageNumber = currentPage + i - 1;
                if (pageNumber < 1) return null;
                
                return (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink
                      isActive={currentPage === pageNumber}
                      onClick={() => setCurrentPage(pageNumber)}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className={!quotations || quotations.length < itemsPerPage ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </CardFooter>
      </Card>
      
      {/* Convert Inquiry to Quotation Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Convert Inquiry to Quotation</DialogTitle>
            <DialogDescription>
              Select an inquiry and set profit percentage to convert it to a quotation.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="inquiry" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Select Inquiry
              </label>
              <Select 
                value={selectedInquiryId?.toString() || ""} 
                onValueChange={(val) => setSelectedInquiryId(val ? Number(val) : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an inquiry" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingInquiries ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading...
                    </div>
                  ) : inquiries && inquiries.length > 0 ? (
                    inquiries.map((inquiry) => (
                      <SelectItem key={inquiry.id} value={inquiry.id.toString()}>
                        {inquiry.inquiryId} - {inquiry.styleName}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      No inquiries available
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="profit" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Profit Percentage
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  id="profit"
                  type="number"
                  min="0"
                  max="100"
                  value={profitPercentage}
                  onChange={(e) => setProfitPercentage(e.target.value)}
                />
                <span>%</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConvertSubmit} disabled={!selectedInquiryId || convertInquiryMutation.isPending}>
              {convertInquiryMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuotationsPage;