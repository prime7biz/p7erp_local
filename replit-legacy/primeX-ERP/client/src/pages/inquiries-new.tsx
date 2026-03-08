import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, MoreHorizontal, Eye, Pencil, Trash2, Brain, FileSpreadsheet, Lightbulb, FlaskConical } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";



type Inquiry = {
  id: number;
  inquiryId: string;
  customerId: number;
  customerName: string;
  hasAgent: boolean;
  agentName: string | null;
  styleName: string;
  inquiryType: string;
  department: string;
  projectedQuantity: number;
  projectedDeliveryDate: string;
  targetPrice: number;
  status: string;
  technicalFiles: string[];
  createdAt: string;
  updatedAt: string;
};

type AIInsight = {
  recommendations: {
    type: string;
    title: string;
    description: string;
    confidence: number;
  }[];
  marketTrends: {
    similar: number;
    averagePrice: number;
    demandTrend: string;
    competitiveAnalysis: string;
  };
};

export default function InquiriesPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentInquiry, setCurrentInquiry] = useState<Inquiry | null>(null);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [insights, setInsights] = useState<AIInsight | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formInquiryType, setFormInquiryType] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const { toast } = useToast();

  const { data: inquiries = [], isLoading, isError } = useQuery({
    queryKey: ["/api/inquiries"],
  });

  const { data: customers = [] } = useQuery({ queryKey: ["/api/customers"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/inquiries", "POST", data);
    },
    onSuccess: () => {
      toast({ title: "Inquiry created", description: "The inquiry has been created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      handleFormClose();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create inquiry", description: error.message || "There was an error creating the inquiry.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest(`/api/inquiries/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      toast({ title: "Inquiry updated", description: "The inquiry has been updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      handleFormClose();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update inquiry", description: error.message || "There was an error updating the inquiry.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/inquiries/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Inquiry deleted",
        description: "The inquiry has been deleted successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete inquiry",
        description: "There was an error deleting the inquiry.",
        variant: "destructive",
      });
      console.error("Delete error:", error);
    },
  });

  // Get AI insights
  const getInsights = async (id: number) => {
    try {
      const response = await apiRequest(`/api/inquiries/${id}/insights`);
      const data = await response.json();
      setInsights(data);
      setIsInsightsOpen(true);
    } catch (error) {
      toast({
        title: "Failed to get insights",
        description: "There was an error fetching AI insights for this inquiry.",
        variant: "destructive",
      });
      console.error("Insights error:", error);
    }
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  const handleEdit = (inquiry: Inquiry) => {
    setCurrentInquiry(inquiry);
    setFormCustomerId(inquiry.customerId?.toString() || "");
    setFormInquiryType(inquiry.inquiryType || "");
    setFormDepartment(inquiry.department || "");
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleViewInsights = (inquiry: Inquiry) => {
    setCurrentInquiry(inquiry);
    setSelectedInquiry(inquiry);
    getInsights(inquiry.id);
  };

  const handleAIInsights = async (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setIsLoadingInsights(true);
    setIsInsightsOpen(true);
    
    try {
      const response = await apiRequest(`/api/inquiries/${inquiry.id}/insights`);
      const data = await response.json();
      setInsights(data);
    } catch (error) {
      console.error("Failed to fetch AI insights:", error);
      toast({
        title: "AI Insights Error",
        description: "Failed to generate AI insights. Please try again.",
        variant: "destructive",
      });
      setIsInsightsOpen(false);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  // Convert inquiry to quotation
  const handleConvertToQuotation = (inquiry: Inquiry) => {
    // Navigate to quotation creation page with inquiry data using wouter
    setLocation(`/quotations/new?inquiryId=${inquiry.id}`);
    
    // Update inquiry status mutation will be handled in the quotation form
    toast({
      title: "Converting to quotation",
      description: "Redirecting to create a quotation based on this inquiry.",
    });
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setIsEditing(false);
    setCurrentInquiry(null);
    setFormCustomerId("");
    setFormInquiryType("");
    setFormDepartment("");
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setIsEditing(false);
    setCurrentInquiry(null);
    queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
  };

  const filteredInquiries = searchQuery && Array.isArray(inquiries) 
    ? inquiries.filter((inquiry: Inquiry) => 
        inquiry?.inquiryId?.toLowerCase?.().includes(searchQuery.toLowerCase()) ||
        inquiry?.customerName?.toLowerCase?.().includes(searchQuery.toLowerCase()) ||
        inquiry?.styleName?.toLowerCase?.().includes(searchQuery.toLowerCase()) ||
        inquiry?.inquiryType?.toLowerCase?.().includes(searchQuery.toLowerCase()) ||
        inquiry?.department?.toLowerCase?.().includes(searchQuery.toLowerCase())
      )
    : (Array.isArray(inquiries) ? inquiries : []);

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col gap-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customer Inquiries</h1>
            <p className="text-gray-600">Manage and track customer inquiries and convert them to quotations</p>
          </div>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Inquiry
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Inquiry Management</CardTitle>
            <CardDescription>
              View, manage, and analyze customer inquiries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2 mb-4">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search inquiries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : isError ? (
              <div className="text-center py-8">
                <p className="text-red-500">Failed to load inquiries. Please try again.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inquiry ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Style Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Target Price</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInquiries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        <p className="text-gray-500">No inquiries found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInquiries.map((inquiry: Inquiry) => (
                      <TableRow key={inquiry.id}>
                        <TableCell className="font-medium">{inquiry.inquiryId}</TableCell>
                        <TableCell>{inquiry.customerName}</TableCell>
                        <TableCell>{inquiry.styleName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{inquiry.inquiryType}</Badge>
                        </TableCell>
                        <TableCell>{inquiry.department}</TableCell>
                        <TableCell>{inquiry.projectedQuantity?.toLocaleString()}</TableCell>
                        <TableCell>${inquiry.targetPrice}</TableCell>
                        <TableCell>
                          {inquiry.projectedDeliveryDate ? 
                            new Date(inquiry.projectedDeliveryDate).toLocaleDateString() : 'Not set'}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            inquiry.status === 'quotation_sent' ? 'bg-green-100 text-green-700' :
                            inquiry.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                            inquiry.status === 'converted_to_order' ? 'bg-purple-100 text-purple-700' :
                            inquiry.status === 'closed' ? 'bg-gray-100 text-gray-600' :
                            'bg-blue-100 text-blue-700'
                          }>
                            {inquiry.status === 'quotation_sent' ? 'Quoted' :
                             inquiry.status === 'in_progress' ? 'In Progress' :
                             inquiry.status === 'converted_to_order' ? 'Converted' :
                             inquiry.status === 'closed' ? 'Closed' :
                             'New'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setLocation(`/inquiries/${inquiry.id}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(inquiry)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleConvertToQuotation(inquiry)}>
                                <FileSpreadsheet className="mr-2 h-4 w-4" />
                                Create Quotation
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLocation(`/samples/requests/new?inquiryId=${inquiry.id}&buyerId=${inquiry.customerId}&styleName=${encodeURIComponent(inquiry.styleName)}&department=${encodeURIComponent(inquiry.department)}&targetPrice=${inquiry.targetPrice}&quantity=${inquiry.projectedQuantity}`)}>
                                <FlaskConical className="mr-2 h-4 w-4" />
                                Request Proto Sample
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAIInsights(inquiry)}>
                                <Brain className="mr-2 h-4 w-4" />
                                AI Insights
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete the inquiry "{inquiry.inquiryId} - {inquiry.styleName}".
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleDelete(inquiry.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
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
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {isFormOpen && (
        <Dialog open={isFormOpen} onOpenChange={handleFormClose}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Inquiry' : 'New Inquiry'}</DialogTitle>
              <DialogDescription>
                {isEditing ? 'Update inquiry details' : 'Create a new customer inquiry'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const payload: any = {
                customerId: parseInt(formCustomerId),
                styleName: fd.get("styleName") as string,
                inquiryType: formInquiryType,
                department: formDepartment,
                projectedQuantity: parseInt(fd.get("projectedQuantity") as string),
                projectedDeliveryDate: fd.get("projectedDeliveryDate") as string,
                targetPrice: parseFloat(fd.get("targetPrice") as string),
              };
              const seasonYear = fd.get("seasonYear") as string;
              if (seasonYear) payload.seasonYear = seasonYear;
              const brand = fd.get("brand") as string;
              if (brand) payload.brand = brand;
              const materialComposition = fd.get("materialComposition") as string;
              if (materialComposition) payload.materialComposition = materialComposition;
              const sizeRange = fd.get("sizeRange") as string;
              if (sizeRange) payload.sizeRange = sizeRange;
              const specialRequirements = fd.get("specialRequirements") as string;
              if (specialRequirements) payload.specialRequirements = specialRequirements;

              if (isEditing && currentInquiry) {
                updateMutation.mutate({ id: currentInquiry.id, data: payload });
              } else {
                createMutation.mutate(payload);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer <span className="text-red-500">*</span></Label>
                  <Select value={formCustomerId} onValueChange={setFormCustomerId} required>
                    <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                    <SelectContent>
                      {Array.isArray(customers) && customers.map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.customerName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Style Name <span className="text-red-500">*</span></Label>
                  <Input name="styleName" required defaultValue={currentInquiry?.styleName || ""} placeholder="e.g. V-Neck Basic Tee" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Inquiry Type <span className="text-red-500">*</span></Label>
                  <Select value={formInquiryType} onValueChange={setFormInquiryType} required>
                    <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sample Development">Sample Development</SelectItem>
                      <SelectItem value="Salesman Sample">Salesman Sample</SelectItem>
                      <SelectItem value="Quotation">Quotation</SelectItem>
                      <SelectItem value="Repeat Order">Repeat Order</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Department <span className="text-red-500">*</span></Label>
                  <Select value={formDepartment} onValueChange={setFormDepartment} required>
                    <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Infant">Infant</SelectItem>
                      <SelectItem value="Kids">Kids</SelectItem>
                      <SelectItem value="Boys">Boys</SelectItem>
                      <SelectItem value="Girls">Girls</SelectItem>
                      <SelectItem value="Men's">Men's</SelectItem>
                      <SelectItem value="Ladies">Ladies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Projected Quantity <span className="text-red-500">*</span></Label>
                  <Input name="projectedQuantity" type="number" min="1" required defaultValue={currentInquiry?.projectedQuantity || ""} placeholder="e.g. 5000" />
                </div>
                <div>
                  <Label>Target Price ($) <span className="text-red-500">*</span></Label>
                  <Input name="targetPrice" type="number" step="0.01" min="0" required defaultValue={currentInquiry?.targetPrice || ""} placeholder="e.g. 12.50" />
                </div>
                <div>
                  <Label>Delivery Date <span className="text-red-500">*</span></Label>
                  <Input name="projectedDeliveryDate" type="date" required defaultValue={currentInquiry?.projectedDeliveryDate ? new Date(currentInquiry.projectedDeliveryDate).toISOString().split('T')[0] : ""} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Season / Year</Label>
                  <Input name="seasonYear" placeholder="e.g. SS-2026" defaultValue={(currentInquiry as any)?.seasonYear || ""} />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input name="brand" placeholder="e.g. H&M" defaultValue={(currentInquiry as any)?.brand || ""} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Material Composition</Label>
                  <Input name="materialComposition" placeholder="e.g. 95% Cotton, 5% Elastane" defaultValue={(currentInquiry as any)?.materialComposition || ""} />
                </div>
                <div>
                  <Label>Size Range</Label>
                  <Input name="sizeRange" placeholder="e.g. S-XXL" defaultValue={(currentInquiry as any)?.sizeRange || ""} />
                </div>
              </div>

              <div>
                <Label>Special Requirements</Label>
                <Textarea name="specialRequirements" placeholder="Any certifications, treatments, or special notes..." defaultValue={(currentInquiry as any)?.specialRequirements || ""} rows={3} />
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !formCustomerId || !formInquiryType || !formDepartment}>
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : (isEditing ? "Update Inquiry" : "Create Inquiry")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* AI Insights Dialog */}
      <Dialog open={isInsightsOpen} onOpenChange={setIsInsightsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-600" />
              AI Business Insights
            </DialogTitle>
            <DialogDescription>
              Advanced analysis and recommendations for inquiry {selectedInquiry?.inquiryId}
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingInsights ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2">Generating AI insights...</span>
              </div>
            </div>
          ) : insights ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Market Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold text-blue-600">
                      {insights.marketTrends.similar} Similar Items
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Avg Price: ${insights.marketTrends.averagePrice}
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Demand Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold text-green-600">
                      {insights.marketTrends.demandTrend}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Market status</p>
                  </CardContent>
                </Card>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-gray-800">AI Recommendations:</h4>
                {insights.recommendations.map((rec, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-500 mt-1 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{rec.title}</p>
                        <p className="text-xs text-gray-600 mt-1">{rec.description}</p>
                        <Badge variant="outline" className="mt-2">
                          {Math.round(rec.confidence * 100)}% confidence
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-700">{insights.marketTrends.competitiveAnalysis}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No insights available</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}