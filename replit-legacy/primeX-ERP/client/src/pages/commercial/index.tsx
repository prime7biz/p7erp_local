import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BarChart3, 
  TrendingUp, 
  Package, 
  FileText, 
  AlertTriangle, 
  ShoppingBag, 
  Truck, 
  Calendar,
  CreditCard,
  FileCheck,
  Lightbulb,
  RefreshCw,
  ArrowUpRight,
  Clock,
  PlusCircle
} from "lucide-react";
import { Link } from "wouter";

// Dashboard Stats Interface
interface DashboardStats {
  inquiriesCount: number;
  quotationsCount: number;
  ordersCount: number;
  shipmentsCount: number;
  lcCount: number;
  activeOrders: number;
  totalOrderValue: number;
}

// Pending Quotation Interface
interface PendingQuotation {
  id: number;
  quotationNumber: string;
  customerId: number;
  customerName?: string;
  quotationDate: string;
  validUntil: string;
  totalAmount: number;
  currencyCode: string;
}

// Recent Order Interface
interface RecentOrder {
  id: number;
  orderNumber: string;
  customerId: number;
  customerName?: string;
  orderDate: string;
  orderStatus: string;
  totalAmount: number;
  currencyCode: string;
}

// Upcoming Shipment Interface
interface UpcomingShipment {
  id: number;
  shipmentNumber: string;
  orderId: number;
  orderNumber?: string;
  shipmentDate: string;
  shipmentMode: string;
  status: string;
}

// Expiring LC Interface
interface ExpiringLC {
  id: number;
  lcNumber: string;
  orderId: number;
  orderNumber?: string;
  expiryDate: string;
  amount: number;
  currencyCode: string;
  status: string;
}

export default function CommercialDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch dashboard statistics
  const { data: dashboardStats, isLoading: isLoadingStats } = useQuery<DashboardStats>({
    queryKey: ['/api/commercial/dashboard'],
  });

  // Fetch pending quotations
  const { data: pendingQuotations, isLoading: isLoadingQuotations } = useQuery<PendingQuotation[]>({
    queryKey: ['/api/commercial/dashboard/pending-quotations'],
  });

  // Fetch recent orders
  const { data: recentOrders, isLoading: isLoadingOrders } = useQuery<RecentOrder[]>({
    queryKey: ['/api/commercial/dashboard/recent-orders'],
  });

  // Fetch upcoming shipments
  const { data: upcomingShipments, isLoading: isLoadingShipments } = useQuery<UpcomingShipment[]>({
    queryKey: ['/api/commercial/dashboard/upcoming-shipments'],
  });

  // Fetch expiring LCs
  const { data: expiringLCs, isLoading: isLoadingLCs } = useQuery<ExpiringLC[]>({
    queryKey: ['/api/commercial/dashboard/expiring-lcs'],
  });

  // Format currency
  const formatCurrency = (amount: number, currency: string = "BDT") => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    return new Date(dateStr).toLocaleDateString('en-US', options);
  };

  // Calculate days until date
  const daysUntil = (dateStr: string) => {
    const today = new Date();
    const targetDate = new Date(dateStr);
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    
    const differenceMs = targetDate.getTime() - today.getTime();
    return Math.ceil(differenceMs / (1000 * 60 * 60 * 24));
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'confirmed':
      case 'approved':
      case 'completed':
        return "bg-green-100 text-green-800 hover:bg-green-100";
      case 'pending':
      case 'in progress':
      case 'processing':
        return "bg-blue-100 text-blue-800 hover:bg-blue-100";
      case 'draft':
      case 'planned':
        return "bg-gray-100 text-gray-800 hover:bg-gray-100";
      case 'expired':
      case 'cancelled':
      case 'rejected':
        return "bg-red-100 text-red-800 hover:bg-red-100";
      case 'shipped':
      case 'delivered':
        return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
      case 'on hold':
        return "bg-amber-100 text-amber-800 hover:bg-amber-100";
      default:
        return "bg-slate-100 text-slate-800 hover:bg-slate-100";
    }
  };

  return (
    <DashboardContainer
      title="Commercial Module"
      subtitle="Manage inquiries, quotations, orders, and export documentation for Bangladesh garment manufacturers"
      actions={
        <div className="flex space-x-2">
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button className="bg-primary hover:bg-primary/90">
            <PlusCircle className="h-4 w-4 mr-2" />
            New Inquiry
          </Button>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-xl mx-auto mb-6">
          <TabsTrigger value="overview" className="font-medium">
            Overview
          </TabsTrigger>
          <TabsTrigger value="insights" className="font-medium">
            Business Insights
          </TabsTrigger>
          <TabsTrigger value="workflow" className="font-medium">
            Workflow
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-blue-50/20 border-blue-100 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-sm font-medium text-blue-800">
                  <FileText className="h-4 w-4 mr-1 text-blue-600" />
                  Inquiries & Quotations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-3xl font-bold text-blue-900">
                      {isLoadingStats ? "..." : dashboardStats?.inquiriesCount || 0}
                    </p>
                    <p className="text-xs text-blue-600">Total Inquiries</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-blue-900">
                      {isLoadingStats ? "..." : dashboardStats?.quotationsCount || 0}
                    </p>
                    <p className="text-xs text-blue-600">Total Quotations</p>
                  </div>
                </div>
                <div className="mt-4">
                  <Link href="/commercial/inquiries">
                    <Button size="sm" variant="ghost" className="text-blue-700 hover:text-blue-900 hover:bg-blue-100 w-full">
                      Manage Inquiries
                      <ArrowUpRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-green-50/20 border-green-100 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-sm font-medium text-green-800">
                  <ShoppingBag className="h-4 w-4 mr-1 text-green-600" />
                  Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-3xl font-bold text-green-900">
                      {isLoadingStats ? "..." : dashboardStats?.ordersCount || 0}
                    </p>
                    <p className="text-xs text-green-600">Total Orders</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-green-900">
                      {isLoadingStats ? "..." : dashboardStats?.activeOrders || 0}
                    </p>
                    <p className="text-xs text-green-600">Active Orders</p>
                  </div>
                </div>
                <div className="mt-4">
                  <Link href="/commercial/orders">
                    <Button size="sm" variant="ghost" className="text-green-700 hover:text-green-900 hover:bg-green-100 w-full">
                      Manage Orders
                      <ArrowUpRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-purple-50/20 border-purple-100 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-sm font-medium text-purple-800">
                  <CreditCard className="h-4 w-4 mr-1 text-purple-600" />
                  LC & Documentation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-3xl font-bold text-purple-900">
                      {isLoadingStats ? "..." : dashboardStats?.lcCount || 0}
                    </p>
                    <p className="text-xs text-purple-600">Letter of Credits</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-purple-900">
                      {isLoadingStats ? "..." : (expiringLCs?.length || 0)}
                    </p>
                    <p className="text-xs text-purple-600">Expiring Soon</p>
                  </div>
                </div>
                <div className="mt-4">
                  <Link href="/commercial/letter-of-credits">
                    <Button size="sm" variant="ghost" className="text-purple-700 hover:text-purple-900 hover:bg-purple-100 w-full">
                      Manage LCs
                      <ArrowUpRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-amber-50/20 border-amber-100 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-sm font-medium text-amber-800">
                  <Truck className="h-4 w-4 mr-1 text-amber-600" />
                  Shipments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-3xl font-bold text-amber-900">
                      {isLoadingStats ? "..." : dashboardStats?.shipmentsCount || 0}
                    </p>
                    <p className="text-xs text-amber-600">Total Shipments</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-amber-900">
                      {isLoadingStats ? "..." : (upcomingShipments?.length || 0)}
                    </p>
                    <p className="text-xs text-amber-600">Upcoming</p>
                  </div>
                </div>
                <div className="mt-4">
                  <Link href="/commercial/shipments">
                    <Button size="sm" variant="ghost" className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 w-full">
                      Manage Shipments
                      <ArrowUpRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Order Value Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Total Order Value</CardTitle>
                <CardDescription>Current fiscal year</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{isLoadingStats ? "..." : formatCurrency(dashboardStats?.totalOrderValue || 0)}</p>
                <div className="h-48 flex items-end space-x-2 pt-6">
                  <div className="flex-1 bg-primary/10 rounded-t h-[20%]"></div>
                  <div className="flex-1 bg-primary/20 rounded-t h-[35%]"></div>
                  <div className="flex-1 bg-primary/30 rounded-t h-[25%]"></div>
                  <div className="flex-1 bg-primary/40 rounded-t h-[45%]"></div>
                  <div className="flex-1 bg-primary/50 rounded-t h-[60%]"></div>
                  <div className="flex-1 bg-primary/60 rounded-t h-[70%]"></div>
                  <div className="flex-1 bg-primary/70 rounded-t h-[85%]"></div>
                  <div className="flex-1 bg-primary/80 rounded-t h-[65%]"></div>
                  <div className="flex-1 bg-primary/90 rounded-t h-[90%]"></div>
                  <div className="flex-1 bg-primary rounded-t h-[55%]"></div>
                  <div className="flex-1 bg-primary/70 rounded-t h-[40%]"></div>
                  <div className="flex-1 bg-primary/50 rounded-t h-[30%]"></div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pt-2">
                  <span>Jan</span>
                  <span>Feb</span>
                  <span>Mar</span>
                  <span>Apr</span>
                  <span>May</span>
                  <span>Jun</span>
                  <span>Jul</span>
                  <span>Aug</span>
                  <span>Sep</span>
                  <span>Oct</span>
                  <span>Nov</span>
                  <span>Dec</span>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
                <CardDescription>Last 30 days activity</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="px-6 py-2 space-y-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center mr-3">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">New Inquiry Created</p>
                      <p className="text-xs text-muted-foreground">Summer Collection from ABC Company</p>
                      <p className="text-xs text-muted-foreground mt-1">2 hours ago</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-50 flex items-center justify-center mr-3">
                      <ShoppingBag className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Order Confirmed</p>
                      <p className="text-xs text-muted-foreground">ORD-2305-0015 - Winter Jackets</p>
                      <p className="text-xs text-muted-foreground mt-1">Yesterday</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center mr-3">
                      <CreditCard className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">LC Amended</p>
                      <p className="text-xs text-muted-foreground">LC-2023-0055 - Adjustment to shipment date</p>
                      <p className="text-xs text-muted-foreground mt-1">3 days ago</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center mr-3">
                      <Truck className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Shipment Completed</p>
                      <p className="text-xs text-muted-foreground">SHP-2305-0008 - Delivered to UK port</p>
                      <p className="text-xs text-muted-foreground mt-1">5 days ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0 pb-4">
                <Button variant="ghost" className="w-full text-sm">View All Activity</Button>
              </CardFooter>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pending Quotations */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center">
                  <FileCheck className="mr-2 h-4 w-4 text-blue-600" />
                  Pending Quotations
                </CardTitle>
                <CardDescription>
                  Quotations awaiting approval
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingQuotations ? (
                  <div className="flex justify-center items-center h-48">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : pendingQuotations && pendingQuotations.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quotation</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Valid Until</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingQuotations.map((quotation) => (
                        <TableRow key={quotation.id}>
                          <TableCell className="font-medium">
                            <Link href={`/commercial/quotations/${quotation.id}`} className="text-primary hover:underline">
                              {quotation.quotationNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{formatDate(quotation.quotationDate)}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              <span>{formatDate(quotation.validUntil)}</span>
                              {daysUntil(quotation.validUntil) <= 7 && (
                                <Badge variant="outline" className="bg-red-50 text-red-700 ml-1 text-[10px]">
                                  {daysUntil(quotation.validUntil)}d
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{formatCurrency(quotation.totalAmount, quotation.currencyCode)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileCheck className="h-10 w-10 text-gray-300 mb-2" />
                    <p className="text-muted-foreground">No pending quotations</p>
                  </div>
                )}
              </CardContent>
              {pendingQuotations && pendingQuotations.length > 0 && (
                <CardFooter className="pt-0 pb-4">
                  <Link href="/commercial/quotations">
                    <Button variant="ghost" className="w-full text-sm">View All Quotations</Button>
                  </Link>
                </CardFooter>
              )}
            </Card>

            {/* Expiring LCs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center">
                  <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" />
                  Expiring LCs
                </CardTitle>
                <CardDescription>
                  Letters of Credit expiring within 30 days
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingLCs ? (
                  <div className="flex justify-center items-center h-48">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : expiringLCs && expiringLCs.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>LC Number</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expiringLCs.map((lc) => (
                        <TableRow key={lc.id}>
                          <TableCell className="font-medium">
                            <Link href={`/commercial/letter-of-credits/${lc.id}`} className="text-primary hover:underline">
                              {lc.lcNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              <span>{formatDate(lc.expiryDate)}</span>
                              <Badge variant="outline" className="bg-red-50 text-red-700 ml-1 text-[10px]">
                                {daysUntil(lc.expiryDate)}d
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>{formatCurrency(lc.amount, lc.currencyCode)}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(lc.status)}>
                              {lc.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CreditCard className="h-10 w-10 text-gray-300 mb-2" />
                    <p className="text-muted-foreground">No LCs expiring soon</p>
                  </div>
                )}
              </CardContent>
              {expiringLCs && expiringLCs.length > 0 && (
                <CardFooter className="pt-0 pb-4">
                  <Link href="/commercial/letter-of-credits">
                    <Button variant="ghost" className="w-full text-sm">View All LCs</Button>
                  </Link>
                </CardFooter>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Orders */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center">
                  <ShoppingBag className="mr-2 h-4 w-4 text-green-600" />
                  Recent Orders
                </CardTitle>
                <CardDescription>
                  Latest customer orders
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingOrders ? (
                  <div className="flex justify-center items-center h-48">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : recentOrders && recentOrders.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">
                            <Link href={`/commercial/orders/${order.id}`} className="text-primary hover:underline">
                              {order.orderNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{formatDate(order.orderDate)}</TableCell>
                          <TableCell>{formatCurrency(order.totalAmount, order.currencyCode)}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(order.orderStatus)}>
                              {order.orderStatus}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ShoppingBag className="h-10 w-10 text-gray-300 mb-2" />
                    <p className="text-muted-foreground">No recent orders</p>
                  </div>
                )}
              </CardContent>
              {recentOrders && recentOrders.length > 0 && (
                <CardFooter className="pt-0 pb-4">
                  <Link href="/commercial/orders">
                    <Button variant="ghost" className="w-full text-sm">View All Orders</Button>
                  </Link>
                </CardFooter>
              )}
            </Card>

            {/* Upcoming Shipments */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center">
                  <Truck className="mr-2 h-4 w-4 text-amber-600" />
                  Upcoming Shipments
                </CardTitle>
                <CardDescription>
                  Shipments scheduled in the next 30 days
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingShipments ? (
                  <div className="flex justify-center items-center h-48">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  </div>
                ) : upcomingShipments && upcomingShipments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Shipment</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upcomingShipments.map((shipment) => (
                        <TableRow key={shipment.id}>
                          <TableCell className="font-medium">
                            <Link href={`/commercial/shipments/${shipment.id}`} className="text-primary hover:underline">
                              {shipment.shipmentNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              <span>{formatDate(shipment.shipmentDate)}</span>
                              {daysUntil(shipment.shipmentDate) <= 5 && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 ml-1 text-[10px]">
                                  {daysUntil(shipment.shipmentDate)}d
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{shipment.shipmentMode}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(shipment.status)}>
                              {shipment.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Truck className="h-10 w-10 text-gray-300 mb-2" />
                    <p className="text-muted-foreground">No upcoming shipments</p>
                  </div>
                )}
              </CardContent>
              {upcomingShipments && upcomingShipments.length > 0 && (
                <CardFooter className="pt-0 pb-4">
                  <Link href="/commercial/shipments">
                    <Button variant="ghost" className="w-full text-sm">View All Shipments</Button>
                  </Link>
                </CardFooter>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* Business Insights Tab */}
        <TabsContent value="insights" className="space-y-6">
          <Alert className="bg-primary/5 border-primary/10">
            <div className="flex items-start">
              <Lightbulb className="h-5 w-5 text-primary mr-2 mt-0.5" />
              <div>
                <AlertTitle>AI-Enhanced Business Intelligence</AlertTitle>
                <AlertDescription>
                  Gain strategic insights about your business operations, market trends, and customer preferences.
                </AlertDescription>
              </div>
            </div>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Order Value by Customer Segment</CardTitle>
                <CardDescription>Top 5 customer segments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span>Premium Brands</span>
                      <span className="font-medium">$1,250,000</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-primary h-2 rounded-full" style={{ width: "70%" }}></div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span>Fast Fashion</span>
                      <span className="font-medium">$980,000</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-primary h-2 rounded-full" style={{ width: "55%" }}></div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span>Athleisure</span>
                      <span className="font-medium">$850,000</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-primary h-2 rounded-full" style={{ width: "48%" }}></div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span>Sustainable Fashion</span>
                      <span className="font-medium">$620,000</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-primary h-2 rounded-full" style={{ width: "35%" }}></div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span>Workwear & Uniforms</span>
                      <span className="font-medium">$420,000</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-primary h-2 rounded-full" style={{ width: "24%" }}></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Order Timeline</CardTitle>
                <CardDescription>Average lead time by order stage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium">Inquiry to Quotation</p>
                        <p className="text-sm">3.2 days</p>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: "15%" }}></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <FileCheck className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium">Quotation to Order</p>
                        <p className="text-sm">5.8 days</p>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: "25%" }}></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <Package className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium">Order to Production</p>
                        <p className="text-sm">7.3 days</p>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: "32%" }}></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium">Production Time</p>
                        <p className="text-sm">45.2 days</p>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: "80%" }}></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                      <Truck className="h-4 w-4 text-red-600" />
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium">Shipping Time</p>
                        <p className="text-sm">18.5 days</p>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div className="bg-red-500 h-1.5 rounded-full" style={{ width: "50%" }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <p className="text-xs text-muted-foreground">
                  AI analysis of your commercial processes from inquiry to delivery.
                </p>
              </CardFooter>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Market Insight</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Growing Demand</p>
                    <p className="text-xs text-muted-foreground mt-1">Sustainable fabrics seeing a 28% year-over-year growth in European markets.</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mr-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Supply Chain Risk</p>
                    <p className="text-xs text-muted-foreground mt-1">Cotton prices expected to rise by 15% due to supply constraints in key regions.</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Fashion Trend</p>
                    <p className="text-xs text-muted-foreground mt-1">Athleisure styles projected to maintain strong demand through 2024.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Supplier Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                    <Lightbulb className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Cost Optimization</p>
                    <p className="text-xs text-muted-foreground mt-1">Consolidating orders with Supplier A could yield 8% cost reduction on trims.</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mr-3">
                    <Clock className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Lead Time Warning</p>
                    <p className="text-xs text-muted-foreground mt-1">Supplier B showing increasing delays. Consider alternative sources for critical materials.</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                    <Lightbulb className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Sustainability Rating</p>
                    <p className="text-xs text-muted-foreground mt-1">New eco-friendly fabric supplier identified with excellent quality ratings.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Shipping Analytics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Cost Comparison</p>
                    <p className="text-xs text-muted-foreground mt-1">Air freight costs have increased 12% this quarter, while sea freight remains stable.</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mr-3">
                    <Calendar className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Seasonal Pattern</p>
                    <p className="text-xs text-muted-foreground mt-1">Shipping delays historically increase by 30% during monsoon season (June-August).</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                    <Lightbulb className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Recommendation</p>
                    <p className="text-xs text-muted-foreground mt-1">Consolidate shipments to EU destinations for a potential 15% reduction in freight costs.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Workflow Tab */}
        <TabsContent value="workflow" className="space-y-6">
          <Alert className="bg-primary/5 border-primary/10">
            <div className="flex items-start">
              <Lightbulb className="h-5 w-5 text-primary mr-2 mt-0.5" />
              <div>
                <AlertTitle>Garment Manufacturing Workflow</AlertTitle>
                <AlertDescription>
                  Visualize your commercial process from inquiry to shipment and manage critical stages.
                </AlertDescription>
              </div>
            </div>
          </Alert>

          <div className="relative py-10 px-4 overflow-x-auto">
            <div className="flex justify-between min-w-[800px]">
              {/* Step 1 - Inquiry */}
              <div className="flex flex-col items-center space-y-2 w-[16%]">
                <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm">
                  <FileText className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">Inquiry</p>
                <Badge className="bg-green-100 text-green-800">25 Active</Badge>
              </div>
              
              {/* Step 2 - Quotation */}
              <div className="flex flex-col items-center space-y-2 w-[16%]">
                <div className="w-16 h-16 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shadow-sm">
                  <FileCheck className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">Quotation</p>
                <Badge className="bg-amber-100 text-amber-800">18 Pending</Badge>
              </div>
              
              {/* Step 3 - Order */}
              <div className="flex flex-col items-center space-y-2 w-[16%]">
                <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center shadow-sm">
                  <ShoppingBag className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">Order</p>
                <Badge className="bg-blue-100 text-blue-800">32 Processing</Badge>
              </div>
              
              {/* Step 4 - LC & Doc */}
              <div className="flex flex-col items-center space-y-2 w-[16%]">
                <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center shadow-sm">
                  <CreditCard className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">LC & Doc</p>
                <Badge className="bg-purple-100 text-purple-800">14 Active</Badge>
              </div>
              
              {/* Step 5 - Production */}
              <div className="flex flex-col items-center space-y-2 w-[16%]">
                <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
                  <Package className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">Production</p>
                <Badge className="bg-green-100 text-green-800">45 In Progress</Badge>
              </div>
              
              {/* Step 6 - Shipment */}
              <div className="flex flex-col items-center space-y-2 w-[16%]">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm">
                  <Truck className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">Shipment</p>
                <Badge className="bg-blue-100 text-blue-800">8 Scheduled</Badge>
              </div>
            </div>
            
            {/* Connector Line */}
            <div className="absolute top-[42px] left-[8%] right-[8%] h-1 bg-gray-200"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/commercial/inquiries/new">
                  <Button variant="outline" className="w-full justify-start">
                    <FileText className="mr-2 h-4 w-4 text-blue-600" />
                    Create New Inquiry
                  </Button>
                </Link>
                <Link href="/commercial/quotations/pending">
                  <Button variant="outline" className="w-full justify-start">
                    <FileCheck className="mr-2 h-4 w-4 text-purple-600" />
                    Review Pending Quotations
                  </Button>
                </Link>
                <Link href="/commercial/orders/processing">
                  <Button variant="outline" className="w-full justify-start">
                    <ShoppingBag className="mr-2 h-4 w-4 text-green-600" />
                    View Processing Orders
                  </Button>
                </Link>
                <Link href="/commercial/letter-of-credits/expiring">
                  <Button variant="outline" className="w-full justify-start">
                    <AlertTriangle className="mr-2 h-4 w-4 text-red-600" />
                    Check Expiring LCs
                  </Button>
                </Link>
                <Link href="/commercial/shipments/upcoming">
                  <Button variant="outline" className="w-full justify-start">
                    <Truck className="mr-2 h-4 w-4 text-amber-600" />
                    View Upcoming Shipments
                  </Button>
                </Link>
              </CardContent>
            </Card>
            
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Critical Path Items</CardTitle>
                <CardDescription>Items requiring immediate attention</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">
                        <Link href="/commercial/quotations/125" className="text-primary hover:underline">
                          QT-2305-0125
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-purple-100 text-purple-800">Quotation</Badge>
                      </TableCell>
                      <TableCell className="text-red-600">Today</TableCell>
                      <TableCell>Approval Pending</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        <Link href="/commercial/letter-of-credits/87" className="text-primary hover:underline">
                          LC-2023-0087
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-red-100 text-red-800">LC</Badge>
                      </TableCell>
                      <TableCell className="text-red-600">2 days</TableCell>
                      <TableCell>Amendment Required</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        <Link href="/commercial/orders/156" className="text-primary hover:underline">
                          ORD-2305-0156
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800">Order</Badge>
                      </TableCell>
                      <TableCell className="text-amber-600">3 days</TableCell>
                      <TableCell>Production Delay</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        <Link href="/commercial/shipments/43" className="text-primary hover:underline">
                          SHP-2305-0043
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-amber-100 text-amber-800">Shipment</Badge>
                      </TableCell>
                      <TableCell className="text-amber-600">5 days</TableCell>
                      <TableCell>Documentation Pending</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardContainer>
  );
}