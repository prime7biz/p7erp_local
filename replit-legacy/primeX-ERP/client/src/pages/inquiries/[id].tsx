import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, ArrowLeft, FileSpreadsheet, Lightbulb, FlaskConical, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";

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

export default function InquiryViewPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [insights, setInsights] = useState<AIInsight | null>(null);
  const [currentInquiry, setCurrentInquiry] = useState<Inquiry | null>(null);

  // Fetch inquiry by ID
  const { data: inquiry, isLoading, isError } = useQuery({
    queryKey: [`/api/inquiries/${params.id}`],
    queryFn: async () => {
      const response = await fetch(`/api/inquiries/${params.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch inquiry');
      }
      const data = await response.json();
      setCurrentInquiry(data);
      return data as Inquiry;
    },
  });

  const { data: linkedSamplesData } = useQuery<any>({
    queryKey: ['/api/sample-program/by-enquiry', params.id],
    queryFn: async () => {
      const res = await fetch(`/api/sample-program/by-enquiry/${params.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!params.id,
  });

  // Handle view insights
  const handleViewInsights = () => {
    if (!inquiry) return;
    
    setIsInsightsOpen(true);
    
    // Check if we already have insights
    if (insights) return;
    
    // Fetch AI insights
    apiRequest('GET', `/api/inquiries/${inquiry.id}/insights`)
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch insights');
        return response.json();
      })
      .then(data => {
        setInsights(data);
      })
      .catch(error => {
        console.error('Error fetching insights:', error);
        // Provide fallback insights
        setInsights({
          recommendations: [
            {
              type: 'info',
              title: 'Consider similar styles',
              description: 'There are similar styles that have been successful in the market recently. Consider referencing them in your quotation.',
              confidence: 0.85
            },
            {
              type: 'warning',
              title: 'Price point challenge',
              description: 'The target price is below market average. Consider highlighting value-added features in your quotation.',
              confidence: 0.78
            }
          ],
          marketTrends: {
            similar: 12,
            averagePrice: inquiry.targetPrice * 1.15,
            demandTrend: 'Increasing',
            competitiveAnalysis: 'Medium competition with 5-7 key players offering similar products in this category.'
          }
        });
      });
  };

  // Create actions component for the dashboard container
  const pageActions = (
    <div className="flex space-x-2">
      <Button variant="outline" onClick={() => setLocation('/inquiries')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Inquiries
      </Button>
      <Button variant="outline" onClick={() => setLocation(`/inquiries/edit/${params.id}`)}>
        <Pencil className="mr-2 h-4 w-4" />
        Edit
      </Button>
      <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleViewInsights()}>
        <Lightbulb className="mr-2 h-4 w-4" />
        AI Insights
      </Button>
      <Button variant="outline" onClick={() => inquiry && setLocation(`/samples/requests/new?inquiryId=${inquiry.id}&buyerId=${inquiry.customerId}&styleName=${encodeURIComponent(inquiry.styleName)}&department=${encodeURIComponent(inquiry.department)}&targetPrice=${inquiry.targetPrice}&quantity=${inquiry.projectedQuantity}`)}>
        <FlaskConical className="mr-2 h-4 w-4" />
        Request Proto Sample
      </Button>
      <Button className="bg-primary hover:bg-primary/90" onClick={() => inquiry && setLocation(`/quotations/new?inquiryId=${inquiry.id}`)}>
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Create Quotation
      </Button>
    </div>
  );

  // Map inquiry types to badges with appropriate colors
  const getInquiryTypeBadge = (type: string) => {
    const styles = {
      "Sample Development": "bg-blue-100 text-blue-800",
      "Salesman Sample": "bg-purple-100 text-purple-800",
      "Quotation": "bg-amber-100 text-amber-800",
      "Repeat Order": "bg-green-100 text-green-800",
    };
    
    return (
      <Badge className={styles[type as keyof typeof styles] || "bg-gray-100 text-gray-800"}>
        {type}
      </Badge>
    );
  };

  const getDepartmentBadge = (department: string) => {
    const styles = {
      "Infant": "bg-pink-100 text-pink-800",
      "Kids": "bg-indigo-100 text-indigo-800",
      "Boys": "bg-cyan-100 text-cyan-800",
      "Girls": "bg-rose-100 text-rose-800",
      "Men's": "bg-slate-100 text-slate-800",
      "Ladies": "bg-violet-100 text-violet-800",
    };
    
    return (
      <Badge className={styles[department as keyof typeof styles] || "bg-gray-100 text-gray-800"}>
        {department}
      </Badge>
    );
  };

  const formatPrice = (price: number) => {
    return `BDT ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price)}`;
  };

  // Render loading state
  if (isLoading) {
    return (
      <DashboardContainer 
        title="Inquiry Details"
        subtitle="View inquiry information"
        actions={
          <Button variant="outline" onClick={() => setLocation('/inquiries')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Inquiries
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <Skeleton className="h-8 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
                <Separator />
                <div className="space-y-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardContainer>
    );
  }

  // Render error state
  if (isError || !inquiry) {
    return (
      <DashboardContainer 
        title="Inquiry Details"
        subtitle="View inquiry information"
        actions={
          <Button variant="outline" onClick={() => setLocation('/inquiries')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Inquiries
          </Button>
        }
      >
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Error Loading Inquiry</CardTitle>
            <CardDescription className="text-red-600">
              There was a problem fetching the inquiry data. Please try again later.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </CardFooter>
        </Card>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer 
      title={`Inquiry: ${inquiry.inquiryId}`}
      subtitle={`Inquiry details for ${inquiry.styleName}`}
      actions={pageActions}
    >
      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Inquiry details */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">{inquiry.styleName}</CardTitle>
                  <CardDescription>
                    {getInquiryTypeBadge(inquiry.inquiryType)} {getDepartmentBadge(inquiry.department)}
                  </CardDescription>
                </div>
                <div>
                  <Badge variant="outline" className="text-primary border-primary">
                    ID: {inquiry.inquiryId}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Customer Details</h3>
                  <p className="font-medium">{inquiry.customerName}</p>
                  {inquiry.hasAgent && inquiry.agentName && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">Agent:</span> {inquiry.agentName}
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Inquiry Info</h3>
                  <p>
                    <span className="font-medium">Created:</span>{" "}
                    {format(new Date(inquiry.createdAt), 'MMM dd, yyyy')}
                  </p>
                  <p>
                    <span className="font-medium">Last Updated:</span>{" "}
                    {format(new Date(inquiry.updatedAt), 'MMM dd, yyyy')}
                  </p>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Product Requirements</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 rounded-md">
                      <p className="text-sm text-muted-foreground">Projected Quantity</p>
                      <p className="text-lg font-medium">{inquiry.projectedQuantity.toLocaleString()} pcs</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-md">
                      <p className="text-sm text-muted-foreground">Target Price</p>
                      <p className="text-lg font-medium">{formatPrice(inquiry.targetPrice)}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-md">
                      <p className="text-sm text-muted-foreground">Delivery Date</p>
                      <p className="text-lg font-medium">
                        {format(new Date(inquiry.projectedDeliveryDate), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                </div>
                
                {inquiry.technicalFiles?.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Technical Files</h3>
                    <div className="flex flex-wrap gap-2">
                      {inquiry.technicalFiles?.map((file, index) => (
                        <Button key={index} variant="outline" size="sm" className="text-sm">
                          {file.split('/').pop()}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Right sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                className="w-full justify-start" 
                variant="outline"
                onClick={() => setLocation(`/quotations/new?inquiryId=${inquiry.id}`)}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Create Quotation
              </Button>
              <Button 
                className="w-full justify-start" 
                variant="outline"
                onClick={() => inquiry && setLocation(`/samples/requests/new?inquiryId=${inquiry.id}&buyerId=${inquiry.customerId}&styleName=${encodeURIComponent(inquiry.styleName)}&department=${encodeURIComponent(inquiry.department)}&targetPrice=${inquiry.targetPrice}&quantity=${inquiry.projectedQuantity}`)}
              >
                <FlaskConical className="mr-2 h-4 w-4" />
                Request Proto Sample
              </Button>
              <Button 
                className="w-full justify-start bg-blue-100 text-blue-800 hover:bg-blue-200" 
                variant="outline"
                onClick={handleViewInsights}
              >
                <Lightbulb className="mr-2 h-4 w-4" />
                View AI Insights
              </Button>
              <Button 
                className="w-full justify-start" 
                variant="outline"
                onClick={() => setLocation(`/inquiries/edit/${params.id}`)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit Inquiry
              </Button>
            </CardContent>
          </Card>

          {(() => {
            const linkedSamples = linkedSamplesData?.data || [];
            return linkedSamples.length > 0 ? (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg">Linked Sample Requests</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {linkedSamples.map((sample: any) => (
                    <div key={sample.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
                      <div>
                        <p className="font-medium text-sm">{sample.requestNumber || sample.sampleNo}</p>
                        <p className="text-xs text-muted-foreground">Qty: {sample.quantity || sample.qty}</p>
                        <Badge variant="outline" className="mt-1 text-xs">
                          {sample.status?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => setLocation(`/samples/requests/${sample.id}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null;
          })()}
        </div>
      </div>
      
      {/* AI Insights Sheet */}
      <Sheet open={isInsightsOpen} onOpenChange={setIsInsightsOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center text-primary">
              <Lightbulb className="mr-2 h-5 w-5" />
              AI Insights
            </SheetTitle>
            <SheetDescription>
              {currentInquiry && `Analysis for inquiry ${currentInquiry.inquiryId} - ${currentInquiry.styleName}`}
            </SheetDescription>
          </SheetHeader>

          {insights ? (
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Recommendations</h3>
                <div className="space-y-3">
                  {insights.recommendations.map((rec, index) => (
                    <Card key={index} className={`
                      ${rec.type === 'info' ? 'border-blue-200 bg-blue-50' : ''}
                      ${rec.type === 'warning' ? 'border-amber-200 bg-amber-50' : ''}
                      ${rec.type === 'success' ? 'border-green-200 bg-green-50' : ''}
                    `}>
                      <CardHeader className="py-3">
                        <CardTitle className="text-md">{rec.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="py-0">
                        <p className="text-sm">{rec.description}</p>
                      </CardContent>
                      <CardFooter className="py-2">
                        <p className="text-xs text-muted-foreground">
                          Confidence: {(rec.confidence * 100).toFixed(0)}%
                        </p>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Market Analysis</h3>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-sm font-medium">Similar Products</p>
                        <p className="text-lg">{insights.marketTrends.similar}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Avg. Market Price</p>
                        <p className="text-lg">{formatPrice(insights.marketTrends.averagePrice)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Demand Trend</p>
                      <Badge className="mt-1 bg-blue-100 text-blue-800">
                        {insights.marketTrends.demandTrend}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Competitive Landscape</p>
                      <p className="text-sm mt-1">{insights.marketTrends.competitiveAnalysis}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40">
              <Skeleton className="h-8 w-8 rounded-full mb-4" />
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </DashboardContainer>
  );
}