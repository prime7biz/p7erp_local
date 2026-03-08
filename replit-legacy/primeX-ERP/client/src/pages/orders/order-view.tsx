import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation, Link } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
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
import { Badge } from "@/components/ui/badge";
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
  ArrowLeft, 
  Download, 
  Edit, 
  FileText, 
  Loader2, 
  Mail, 
  Printer, 
  Truck,
  ClipboardList,
  Factory,
  Calendar,
  Users,
  Package,
  Scissors,
  Box,
  History,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { DocumentHeader } from "@/components/erp/document-header";
import { DeliveryMatrix } from "@/components/erp/delivery-matrix";

// Status badges with appropriate colors
const OrderStatusBadge = ({ status }: { status: string }) => {
  const statusMap: Record<string, { color: string, label: string }> = {
    new: { color: "bg-blue-500", label: "New" },
    in_progress: { color: "bg-indigo-500", label: "In Progress" },
    ready_for_production: { color: "bg-purple-500", label: "Ready for Production" },
    in_production: { color: "bg-amber-500", label: "In Production" },
    completed: { color: "bg-emerald-500", label: "Completed" },
    shipped: { color: "bg-green-500", label: "Shipped" },
    delivered: { color: "bg-teal-500", label: "Delivered" },
    canceled: { color: "bg-red-500", label: "Canceled" }
  };

  const displayInfo = statusMap[status] || { color: "bg-gray-500", label: status };

  return (
    <Badge className={`text-white ${displayInfo.color}`}>
      {displayInfo.label}
    </Badge>
  );
};

const OrderView: React.FC = () => {
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [isUpdateStatusDialogOpen, setIsUpdateStatusDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  
  // Fetch order data
  const { 
    data: order, 
    isLoading: isLoadingOrder, 
    error: orderError,
    refetch: refetchOrder
  } = useQuery({
    queryKey: [`/api/orders/${params.id}`],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${params.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch order');
      }
      return response.json();
    },
  });
  
  // Fetch order color/size breakdown
  const { data: colorSizeBreakdown } = useQuery({
    queryKey: [`/api/orders/${params.id}/color-size-breakdown`],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${params.id}/color-size-breakdown`);
      if (!response.ok) {
        throw new Error('Failed to fetch color/size breakdown');
      }
      return response.json();
    },
    enabled: !!order,
  });
  
  // Fetch order materials
  const { data: materials } = useQuery({
    queryKey: [`/api/orders/${params.id}/materials`],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${params.id}/materials`);
      if (!response.ok) {
        throw new Error('Failed to fetch materials');
      }
      return response.json();
    },
    enabled: !!order,
  });
  
  // Fetch customer data
  const { data: customer } = useQuery({
    queryKey: [`/api/customers/${order?.customerId}`],
    queryFn: async () => {
      const response = await fetch(`/api/customers/${order?.customerId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch customer details');
      }
      return response.json();
    },
    enabled: !!order?.customerId,
  });

  // Handle printing document
  const handlePrint = () => {
    window.print();
  };

  // Handle updating order status
  const handleUpdateStatus = async (newStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${params.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update order status');
      }

      refetchOrder();
      
      toast({
        title: "Status updated",
        description: `Order status has been updated to ${newStatus}`,
      });
      
      setIsUpdateStatusDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive",
      });
    }
  };

  // Loading state
  if (isLoadingOrder) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
      </div>
    );
  }

  // Error state
  if (orderError || !order) {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-bold">Order Not Found</h2>
        <p className="mt-2">The requested order could not be found.</p>
        <Button className="mt-4" onClick={() => navigate("/orders")}>Back to Orders</Button>
      </div>
    );
  }

  // Status options for updating
  const getNextStatusOptions = (currentStatus: string): string[] => {
    const statusFlow: Record<string, string[]> = {
      new: ['in_progress', 'canceled'],
      in_progress: ['ready_for_production', 'canceled'],
      ready_for_production: ['in_production', 'canceled'],
      in_production: ['completed', 'canceled'],
      completed: ['shipped', 'canceled'],
      shipped: ['delivered'],
      delivered: [],
      canceled: []
    };

    return statusFlow[currentStatus] || [];
  };

  const nextStatusOptions = getNextStatusOptions(order.orderStatus);

  // Format statuses for display
  const formatStatusLabel = (status: string): string => {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <DocumentHeader
        title="Sales Order"
        docNo={order.orderId}
        date={order.createdAt}
        status={order.orderStatus?.replace(/_/g, " ") || "new"}
        amounts={[
          { label: "Total Qty", value: order.totalQuantity?.toLocaleString() || "0" },
          { label: "Price", value: order.priceConfirmed || "0" },
          ...(order.deliveryDate ? [{ label: "Delivery", value: formatDate(order.deliveryDate) }] : []),
        ]}
      />

      {/* Order header */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" onClick={() => navigate("/orders")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold flex items-center">
              Order {order.orderId}
              <OrderStatusBadge status={order.orderStatus} />
            </h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Created on {formatDate(order.createdAt)}
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {nextStatusOptions.length > 0 && (
            <AlertDialog open={isUpdateStatusDialogOpen} onOpenChange={setIsUpdateStatusDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  Update Status
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Update Order Status</AlertDialogTitle>
                  <AlertDialogDescription>
                    Select the new status for order {order.orderId}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-2 py-4">
                  {nextStatusOptions.map((status) => (
                    <Button 
                      key={status} 
                      variant={status === 'canceled' ? 'destructive' : 'outline'}
                      className={status !== 'canceled' ? 'border-primary text-primary' : ''}
                      onClick={() => {
                        setSelectedStatus(status);
                        handleUpdateStatus(status);
                      }}
                    >
                      {formatStatusLabel(status)}
                    </Button>
                  ))}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          
          <Link href={`/orders/${params.id}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          
          <Button className="bg-primary hover:bg-primary/90">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      {/* Main content area with tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview" className="flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="colorSizes" className="flex items-center">
            <Package className="h-4 w-4 mr-2" />
            Color/Size Breakdown
          </TabsTrigger>
          <TabsTrigger value="materials" className="flex items-center">
            <Scissors className="h-4 w-4 mr-2" />
            Materials
          </TabsTrigger>
          <TabsTrigger value="production" className="flex items-center">
            <Factory className="h-4 w-4 mr-2" />
            Production Schedule
          </TabsTrigger>
          <TabsTrigger value="deliveries" className="flex items-center">
            <Box className="h-4 w-4 mr-2" />
            Deliveries
          </TabsTrigger>
          <TabsTrigger value="shipment" className="flex items-center">
            <Truck className="h-4 w-4 mr-2" />
            Shipment
          </TabsTrigger>
          <TabsTrigger value="rmRequirements" className="flex items-center">
            <ClipboardList className="h-4 w-4 mr-2" />
            RM Requirements
          </TabsTrigger>
          <TabsTrigger value="tna" className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            TNA Plan
          </TabsTrigger>
          <TabsTrigger value="amendments" className="flex items-center">
            <Edit className="h-4 w-4 mr-2" />
            Amendments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Order Summary */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Order Details</CardTitle>
                <CardDescription>
                  Complete details for order {order.orderId}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Style Name</h3>
                    <p className="mt-1">{order.styleName}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Department</h3>
                    <p className="mt-1">{order.department}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Total Quantity</h3>
                    <p className="mt-1">{order.totalQuantity.toLocaleString()}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Price</h3>
                    <p className="mt-1">{formatCurrency(order.priceConfirmed)} {order.currency}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Delivery Date</h3>
                    <p className="mt-1">{formatDate(order.deliveryDate)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Delivery Mode</h3>
                    <p className="mt-1">{order.deliveryMode}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Delivery Port</h3>
                    <p className="mt-1">{order.deliveryPort || "Not specified"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Payment Terms</h3>
                    <p className="mt-1">{order.paymentTerms || "Not specified"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
                    <div className="mt-1">
                      <OrderStatusBadge status={order.orderStatus} />
                    </div>
                  </div>
                </div>
                
                {order.notes && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Notes</h3>
                    <p className="mt-1 whitespace-pre-line text-sm">{order.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customer ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Customer Name</h3>
                      <p className="mt-1">{customer.customerName}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Customer ID</h3>
                      <p className="mt-1">{customer.customerId}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Country</h3>
                      <p className="mt-1">{customer.country}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Contact Person</h3>
                      <p className="mt-1">{customer.contactPerson}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <Mail className="h-4 w-4 mr-2" />
                        {customer.email}
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <Phone className="h-4 w-4 mr-2" />
                        {customer.phone}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    <p className="mt-2 text-sm text-muted-foreground">Loading customer information...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Production Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Production Timeline
              </CardTitle>
              <CardDescription>
                Key dates and milestones for this order
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                <div className="space-y-8 relative">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center z-10 mr-4">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">Order Created</h3>
                      <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center z-10 mr-4">
                      <Scissors className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">Material Procurement</h3>
                      <p className="text-sm text-muted-foreground">Expected to start on {formatDate(new Date(new Date(order.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000))}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center z-10 mr-4">
                      <Factory className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">Production</h3>
                      <p className="text-sm text-muted-foreground">Expected to start on {formatDate(new Date(new Date(order.createdAt).getTime() + 21 * 24 * 60 * 60 * 1000))}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center z-10 mr-4">
                      <Truck className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">Delivery</h3>
                      <p className="text-sm text-muted-foreground">Expected by {formatDate(order.deliveryDate)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="colorSizes">
          <Card>
            <CardHeader>
              <CardTitle>Color & Size Breakdown</CardTitle>
              <CardDescription>
                Detailed breakdown of quantities by color and size
              </CardDescription>
            </CardHeader>
            <CardContent>
              {colorSizeBreakdown?.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Color</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Percentage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {colorSizeBreakdown.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <div 
                                className="h-4 w-4 rounded-full" 
                                style={{ backgroundColor: item.color.toLowerCase() }}
                              ></div>
                              <span>{item.color}</span>
                            </div>
                          </TableCell>
                          <TableCell>{item.size}</TableCell>
                          <TableCell className="text-right">{item.quantity.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {((item.quantity / order.totalQuantity) * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Box className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">No color/size breakdown available for this order</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials">
          <Card>
            <CardHeader>
              <CardTitle>Materials</CardTitle>
              <CardDescription>
                Raw materials and components for this order
              </CardDescription>
            </CardHeader>
            <CardContent>
              {materials?.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material Type</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead>Booking Status</TableHead>
                        <TableHead>Expected Delivery</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materials.map((material, index) => (
                        <TableRow key={index}>
                          <TableCell>{material.materialType}</TableCell>
                          <TableCell>{material.itemName || "Unnamed Item"}</TableCell>
                          <TableCell className="text-right">
                            {Number(material.quantityNeeded).toLocaleString()} {material.unitName || "units"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(material.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(material.totalCost)}
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              material.bookingStatus === 'received' ? 'bg-green-500' :
                              material.bookingStatus === 'booked' ? 'bg-blue-500' : 
                              'bg-amber-500'
                            }>
                              {material.bookingStatus.charAt(0).toUpperCase() + material.bookingStatus.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {material.expectedDeliveryDate ? formatDate(material.expectedDeliveryDate) : "Not scheduled"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Scissors className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">No materials have been added to this order yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="production">
          <Card>
            <CardHeader>
              <CardTitle>Production Schedule</CardTitle>
              <CardDescription>
                Current production status and schedule
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Factory className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Production schedule is not available yet</p>
                <p className="text-sm text-muted-foreground">
                  Production scheduling will be available once the order status is updated to "Ready for Production"
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deliveries">
          <DeliveryMatrix
            orderId={parseInt(params.id)}
            styleId={order.styleId || null}
            totalQuantity={order.totalQuantity || 0}
          />
        </TabsContent>

        <TabsContent value="shipment">
          <Card>
            <CardHeader>
              <CardTitle>Shipment Information</CardTitle>
              <CardDescription>
                Shipping details and documentation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Truck className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Shipment information is not available yet</p>
                <p className="text-sm text-muted-foreground">
                  Shipment details will be available once the order status is updated to "Completed" or "Shipped"
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rmRequirements">
          <RmRequirementsTab orderId={parseInt(params.id)} styleId={order.styleId} />
        </TabsContent>

        <TabsContent value="tna">
          <TnaPlanTab orderId={parseInt(params.id)} orderName={order.orderId || `Order #${params.id}`} />
        </TabsContent>

        <TabsContent value="amendments">
          <AmendmentsTab orderId={parseInt(params.id)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RmRequirementsTab({ orderId, styleId }: { orderId: number; styleId?: number | null }) {
  const { toast } = useToast();
  const [rmData, setRmData] = useState<any>(null);

  const generateMutation = useMutation({
    mutationFn: () => apiRequest(`/api/orders/${orderId}/generate-rm-requirement`, 'POST'),
    onSuccess: async (res) => {
      const result = await res.json();
      const data = result?.data || result;
      setRmData(data);
      toast({ title: 'RM Requirement Generated', description: 'Raw material requirements have been calculated.' });
    },
    onError: (err: any) => {
      const msg = err.message || '';
      if (msg.includes('No approved BOM') || msg.includes('NO_BOM')) {
        toast({
          title: 'No Approved BOM',
          description: 'No approved BOM found for this style. Please approve a BOM first.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Error', description: msg || 'Failed to generate RM requirement.', variant: 'destructive' });
      }
    },
  });

  const rmLines = rmData?.lines || [];

  const totals = rmLines.reduce(
    (acc: any, line: any) => ({
      grossQty: acc.grossQty + parseFloat(line.grossQty || 0),
      wastageQty: acc.wastageQty + parseFloat(line.wastageQty || 0),
      bufferQty: acc.bufferQty + parseFloat(line.bufferQty || 0),
      netRequiredQty: acc.netRequiredQty + parseFloat(line.netRequiredQty || 0),
      availableStock: acc.availableStock + parseFloat(line.availableStock || 0),
      shortageQty: acc.shortageQty + parseFloat(line.shortageQty || 0),
    }),
    { grossQty: 0, wastageQty: 0, bufferQty: 0, netRequiredQty: 0, availableStock: 0, shortageQty: 0 }
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>RM Requirements</CardTitle>
            <CardDescription>Generate raw material requirements from the approved BOM</CardDescription>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ClipboardList className="h-4 w-4 mr-2" />
            )}
            Generate RM Requirement
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!rmData && !generateMutation.isPending && (
          <div className="text-center py-8">
            <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">No RM requirements generated yet</p>
            <p className="text-sm text-muted-foreground">
              Click "Generate RM Requirement" to calculate raw material needs from the approved BOM.
            </p>
            {styleId && (
              <Link href={`/merchandising/bom/${styleId}`}>
                <Button variant="link" className="mt-2">Go to BOM Builder →</Button>
              </Link>
            )}
          </div>
        )}

        {generateMutation.isPending && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
          </div>
        )}

        {rmData && rmLines.length > 0 && (
          <div className="space-y-4 print:space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{rmData.status || 'DRAFT'}</Badge>
              {rmData.notes && <span>{rmData.notes}</span>}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead className="text-right">Gross Qty</TableHead>
                    <TableHead className="text-right">Wastage</TableHead>
                    <TableHead className="text-right">Buffer</TableHead>
                    <TableHead className="text-right">Net Required</TableHead>
                    <TableHead className="text-right">Available Stock</TableHead>
                    <TableHead className="text-right">Shortage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rmLines.map((line: any, idx: number) => {
                    const shortage = parseFloat(line.shortageQty || 0);
                    return (
                      <TableRow key={line.id || idx}>
                        <TableCell className="font-medium">{line.itemDescription || `Item #${line.itemId || idx + 1}`}</TableCell>
                        <TableCell>{line.uom}</TableCell>
                        <TableCell className="text-right">{parseFloat(line.grossQty || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{parseFloat(line.wastageQty || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{parseFloat(line.bufferQty || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">{parseFloat(line.netRequiredQty || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{parseFloat(line.availableStock || 0).toFixed(2)}</TableCell>
                        <TableCell className={`text-right font-semibold ${shortage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {shortage.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/50 font-bold border-t-2">
                    <TableCell>Totals</TableCell>
                    <TableCell />
                    <TableCell className="text-right">{totals.grossQty.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{totals.wastageQty.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{totals.bufferQty.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{totals.netRequiredQty.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{totals.availableStock.toFixed(2)}</TableCell>
                    <TableCell className={`text-right ${totals.shortageQty > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {totals.shortageQty.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {rmData && rmLines.length === 0 && (
          <div className="text-center py-8">
            <Package className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">RM requirement generated but no BOM lines found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Fix missing Phone component
const Phone = (props: any) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
  </svg>
);

function TnaPlanTab({ orderId, orderName }: { orderId: number; orderName: string }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: tnaPlans, isLoading } = useQuery({
    queryKey: ['/api/tna/plans', { orderId }],
    queryFn: async () => {
      const res = await fetch(`/api/tna/plans?orderId=${orderId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data?.data || [];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ['/api/tna/templates'],
  });

  const linkedPlans = Array.isArray(tnaPlans) ? tnaPlans : [];
  const templateList = Array.isArray(templates) ? templates : templates?.data || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          <p className="mt-2 text-muted-foreground">Loading TNA plans...</p>
        </CardContent>
      </Card>
    );
  }

  if (linkedPlans.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Time & Action Plans
          </CardTitle>
          <CardDescription>TNA plans linked to this order</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedPlans.map((plan: any) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name || plan.planName || `TNA Plan #${plan.id}`}</TableCell>
                  <TableCell><Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>{plan.status || 'Draft'}</Badge></TableCell>
                  <TableCell>{plan.createdAt ? formatDate(plan.createdAt) : '-'}</TableCell>
                  <TableCell>
                    <Link href={`/tna/plans/${plan.id}`}>
                      <Button variant="outline" size="sm">View Plan</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Time & Action Plan
        </CardTitle>
        <CardDescription>No TNA plan linked to this order yet</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center py-6 border border-dashed rounded-lg">
          <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Generate TNA Plan</h3>
          <p className="text-sm text-muted-foreground mb-4">Create a Time & Action plan to track milestones for this order</p>
          {templateList.length > 0 ? (
            <Button onClick={() => navigate(`/tna/plans?orderId=${orderId}`)}>
              <Calendar className="h-4 w-4 mr-2" />
              Create TNA Plan
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-600">No TNA templates found. Create a template first.</p>
              <Button variant="outline" onClick={() => navigate('/tna/templates')}>
                Go to TNA Templates
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AmendmentsTab({ orderId }: { orderId: number }) {
  const { data: amendments, isLoading } = useQuery({
    queryKey: ['/api/orders', orderId, 'amendments'],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/amendments`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data?.data || [];
    },
  });

  const amendmentList = Array.isArray(amendments) ? amendments : [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          <p className="mt-2 text-muted-foreground">Loading amendments...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit className="h-5 w-5" />
          Order Amendments
        </CardTitle>
        <CardDescription>
          {amendmentList.length > 0
            ? `${amendmentList.length} amendment(s) recorded for this order`
            : 'No amendments have been made to this order'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {amendmentList.length === 0 ? (
          <div className="text-center py-8 border border-dashed rounded-lg">
            <Edit className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Amendments are automatically tracked when confirmed orders are edited</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Field Changed</TableHead>
                <TableHead>Old Value</TableHead>
                <TableHead>New Value</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {amendmentList.map((amend: any) => (
                <TableRow key={amend.id}>
                  <TableCell className="font-medium">#{amend.amendmentNumber}</TableCell>
                  <TableCell>{amend.fieldChanged}</TableCell>
                  <TableCell className="text-red-600">{amend.oldValue || '-'}</TableCell>
                  <TableCell className="text-green-600">{amend.newValue || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{amend.reason}</TableCell>
                  <TableCell>
                    <Badge variant={amend.status === 'approved' ? 'default' : amend.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {amend.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{amend.createdAt ? formatDate(amend.createdAt) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default OrderView;