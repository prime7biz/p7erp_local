import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { type Customer } from "@shared/schema";
import { 
  Calendar,
  BarChart3,
  Users,
  UserPlus,
  MessageSquare,
  PieChart,
  LayoutDashboard,
  MessagesSquare,
  Send,
  FileText,
  CheckSquare,
  ShoppingBag
} from "lucide-react";

const MetricCard = ({ 
  title, 
  value, 
  icon, 
  change, 
  changeType 
}: { 
  title: string; 
  value: string; 
  icon: React.ReactNode;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
}) => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-sm font-medium text-neutral-dark">{title}</CardTitle>
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-neutral-darkest mb-1">{value}</div>
        {change && (
          <div className={`text-xs font-medium ${
            changeType === "positive" ? "text-green-600" : 
            changeType === "negative" ? "text-red-600" : 
            "text-neutral-dark"
          }`}>
            {change}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const CustomerCard = ({ customer }: { customer: Customer }) => {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const statusColors = {
    active: "bg-green-100 text-green-800",
    inactive: "bg-red-100 text-red-800",
    lead: "bg-blue-100 text-blue-800",
    prospect: "bg-purple-100 text-purple-800"
  };

  const statusColor = statusColors[customer.status as keyof typeof statusColors] || "bg-gray-100 text-gray-800";

  return (
    <Card className="mb-4 overflow-hidden border-l-4 border-l-orange-400">
      <div className="flex p-4">
        <Avatar className="h-12 w-12 border-2 border-orange-100">
          <AvatarImage src={customer.logo || ""} />
          <AvatarFallback className="bg-orange-100 text-orange-800">
            {getInitials(customer.customerName)}
          </AvatarFallback>
        </Avatar>
        <div className="ml-4 flex-1">
          <div className="flex justify-between">
            <div>
              <h3 className="font-medium text-neutral-darkest">{customer.customerName}</h3>
              <div className="flex items-center text-sm text-neutral-dark">
                <span className="mr-2">{customer.customerId}</span>
                <Badge variant="outline" className={statusColor}>
                  {customer.status}
                </Badge>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                <Link href={`/customers/${customer.id}`}>
                  <span className="sr-only">View</span>
                  <Users className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Message</span>
                <MessageSquare className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-center text-xs text-neutral-dark">
            <div className="flex items-center mr-4">
              <span className="material-icons text-xs mr-1">email</span>
              {customer.email || "No email"}
            </div>
            <div className="flex items-center">
              <span className="material-icons text-xs mr-1">phone</span>
              {customer.phone || "No phone"}
            </div>
          </div>
        </div>
      </div>
      <CardFooter className="bg-neutral-50 px-4 py-2 border-t border-neutral-100 flex justify-between">
        <div className="text-xs text-neutral-dark">
          Last interaction: <span className="font-medium">3 days ago</span>
        </div>
        <div className="flex">
          <Badge variant="outline" className="mr-2 text-xs bg-white">
            {customer.orderCount || 0} Orders
          </Badge>
          <Badge variant="outline" className="text-xs bg-white">
            {customer.inquiryCount || 0} Inquiries
          </Badge>
        </div>
      </CardFooter>
    </Card>
  );
};

const RecentActivityItem = ({ 
  title, 
  description, 
  time, 
  icon,
  iconColor
}: { 
  title: string; 
  description: string; 
  time: string; 
  icon: React.ReactNode; 
  iconColor: string;
}) => {
  return (
    <div className="flex items-start mb-4 last:mb-0">
      <div className={`h-8 w-8 rounded-full ${iconColor} flex items-center justify-center flex-shrink-0 mt-1`}>
        {icon}
      </div>
      <div className="ml-3 flex-1">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-medium text-neutral-darkest text-sm">{title}</h4>
            <p className="text-neutral-dark text-xs">{description}</p>
          </div>
          <span className="text-neutral-dark text-xs">{time}</span>
        </div>
      </div>
    </div>
  );
};

const ApprovalItem = ({ 
  type, 
  title, 
  customer, 
  status, 
  date 
}: { 
  type: "sample" | "trim"; 
  title: string; 
  customer: string; 
  status: "pending" | "approved" | "rejected"; 
  date: string;
}) => {
  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800"
  };

  const typeIcons = {
    sample: <FileText className="h-4 w-4" />,
    trim: <CheckSquare className="h-4 w-4" />
  };

  return (
    <div className="p-3 border border-neutral-200 rounded-lg mb-3 last:mb-0">
      <div className="flex items-start">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          {typeIcons[type]}
        </div>
        <div className="ml-3 flex-1">
          <div className="flex justify-between">
            <h4 className="font-medium text-neutral-darkest">{title}</h4>
            <Badge className={statusColors[status]}>
              {status}
            </Badge>
          </div>
          <p className="text-neutral-dark text-xs mt-1">Customer: {customer}</p>
          <div className="flex items-center mt-2">
            <span className="text-xs text-neutral-dark">{date}</span>
            <div className="ml-auto">
              <Button variant="outline" size="sm" className="h-7 mr-2">
                View Details
              </Button>
              {status === "pending" && (
                <Button size="sm" className="h-7">
                  Review
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CRMDashboard = () => {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title="Total Customers" 
          value="124" 
          icon={<Users className="h-4 w-4" />}
          change="↑ 8.1% from last month" 
          changeType="positive" 
        />
        <MetricCard 
          title="Active Buyers" 
          value="86" 
          icon={<ShoppingBag className="h-4 w-4" />}
          change="↑ 4.3% from last month" 
          changeType="positive" 
        />
        <MetricCard 
          title="Recent Interactions" 
          value="342" 
          icon={<MessageSquare className="h-4 w-4" />}
          change="↑ 12.5% from last month" 
          changeType="positive" 
        />
        <MetricCard 
          title="Portal Logins" 
          value="289" 
          icon={<Users className="h-4 w-4" />}
          change="↑ 16.8% from last month" 
          changeType="positive" 
        />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Customer Insights</CardTitle>
              <Button variant="outline" size="sm">
                View All
              </Button>
            </div>
            <CardDescription>
              AI-generated insights based on customer interactions and data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 border border-blue-100 bg-blue-50 rounded-lg">
                <div className="flex items-start">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 flex-shrink-0">
                    <PieChart className="h-4 w-4" />
                  </div>
                  <div className="ml-3">
                    <h4 className="font-medium text-blue-800">Buying Pattern Detected</h4>
                    <p className="text-blue-700 text-sm mt-1">
                      StyleCraft Inc. has shown a consistent pattern of placing large orders in Q2 each year, typically 15-20% larger than other quarters. Consider proactive outreach in April to maximize order volume.
                    </p>
                    <div className="mt-2">
                      <Badge variant="outline" className="bg-white mr-2">
                        High confidence
                      </Badge>
                      <Badge variant="outline" className="bg-white">
                        Pattern recognition
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-green-100 bg-green-50 rounded-lg">
                <div className="flex items-start">
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-500 flex-shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="ml-3">
                    <h4 className="font-medium text-green-800">Customer Loyalty Opportunity</h4>
                    <p className="text-green-700 text-sm mt-1">
                      Fashion Forward Ltd. has placed consistent orders for 3 consecutive years. They are an ideal candidate for a loyalty program with volume discounts. This could increase retention and order values.
                    </p>
                    <div className="mt-2">
                      <Badge variant="outline" className="bg-white mr-2">
                        Medium confidence
                      </Badge>
                      <Badge variant="outline" className="bg-white">
                        Loyalty analysis
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg">
                <div className="flex items-start">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div className="ml-3">
                    <h4 className="font-medium text-primary">Cross-Selling Opportunity</h4>
                    <p className="text-primary/80 text-sm mt-1">
                      GarmentPro has never ordered outerwear products despite being a major buyer in other categories. Based on their market segment, introducing our premium outerwear line could generate additional revenue.
                    </p>
                    <div className="mt-2">
                      <Badge variant="outline" className="bg-white mr-2">
                        High confidence
                      </Badge>
                      <Badge variant="outline" className="bg-white">
                        Sales analysis
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest customer interactions and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <RecentActivityItem 
                title="Sample Approval Request" 
                description="ElegantWear requested sample approval for Spring'25 collection"
                time="10 min ago"
                icon={<CheckSquare className="h-4 w-4 text-white" />}
                iconColor="bg-blue-500"
              />
              <RecentActivityItem 
                title="Portal Message" 
                description="StyleCraft sent a message regarding Order #ORD-2023-15"
                time="1 hour ago"
                icon={<MessageSquare className="h-4 w-4 text-white" />}
                iconColor="bg-green-500"
              />
              <RecentActivityItem 
                title="Quote Viewed" 
                description="FashionForward viewed quotation #QT-2023-089"
                time="2 hours ago"
                icon={<FileText className="h-4 w-4 text-white" />}
                iconColor="bg-purple-500"
              />
              <RecentActivityItem 
                title="New Lead" 
                description="Sales team registered EcoApparel as a new lead"
                time="Yesterday"
                icon={<UserPlus className="h-4 w-4 text-white" />}
                iconColor="bg-orange-500"
              />
              <RecentActivityItem 
                title="Order Confirmed" 
                description="GarmentPro confirmed order #ORD-2023-12"
                time="Yesterday"
                icon={<ShoppingBag className="h-4 w-4 text-white" />}
                iconColor="bg-teal-500"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const CustomerList = ({ customers }: { customers: Customer[] }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-neutral-darkest">Customers</h2>
          <p className="text-neutral-dark">Manage your customer relationships</p>
        </div>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {customers.map((customer) => (
          <CustomerCard key={customer.id} customer={customer} />
        ))}
        {customers.length === 0 && (
          <div className="col-span-2 py-10 text-center bg-neutral-50 rounded-lg border border-dashed border-neutral-200">
            <Users className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-neutral-darkest mb-1">No customers found</h3>
            <p className="text-neutral-dark mb-4">Start by adding your first customer</p>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const ApprovalRequests = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-neutral-darkest">Approvals</h2>
          <p className="text-neutral-dark">Manage sample and trim approvals</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline">
            Approved
          </Button>
          <Button>
            Pending
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-lg font-medium text-neutral-darkest mb-4 flex items-center">
            <FileText className="h-5 w-5 mr-2 text-orange-500" />
            Sample Approvals
          </h3>
          <div className="space-y-3">
            <ApprovalItem 
              type="sample"
              title="Summer Cotton T-Shirt Sample"
              customer="StyleCraft Inc."
              status="pending"
              date="Requested on May 10, 2023"
            />
            <ApprovalItem 
              type="sample"
              title="Denim Jacket - Stonewashed"
              customer="FashionForward Ltd."
              status="approved"
              date="Approved on May 8, 2023"
            />
            <ApprovalItem 
              type="sample"
              title="Winter Collection - Wool Blend Sweater"
              customer="ElegantWear Co."
              status="rejected"
              date="Rejected on May 5, 2023"
            />
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-medium text-neutral-darkest mb-4 flex items-center">
            <CheckSquare className="h-5 w-5 mr-2 text-orange-500" />
            Trim Approvals
          </h3>
          <div className="space-y-3">
            <ApprovalItem 
              type="trim"
              title="Custom Metal Buttons for Denim Line"
              customer="GarmentPro Inc."
              status="pending"
              date="Requested on May 12, 2023"
            />
            <ApprovalItem 
              type="trim"
              title="Eco-friendly Zippers - YKK"
              customer="GreenThreads"
              status="pending"
              date="Requested on May 9, 2023"
            />
            <ApprovalItem 
              type="trim"
              title="Woven Labels - Brand Package"
              customer="LuxuryApparel"
              status="approved"
              date="Approved on May 7, 2023"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const MessagingView = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border rounded-lg overflow-hidden h-[70vh]">
      <div className="border-r">
        <div className="p-4 border-b bg-neutral-50">
          <h2 className="font-medium">Conversations</h2>
        </div>
        <div className="overflow-y-auto h-[calc(70vh-57px)]">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div key={idx} className={`p-4 border-b hover:bg-neutral-50 cursor-pointer ${idx === 1 ? 'bg-orange-50' : ''}`}>
              <div className="flex items-start">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-orange-100 text-orange-800">
                    {idx === 1 ? 'SC' : idx === 2 ? 'FF' : idx === 3 ? 'GP' : idx === 4 ? 'EW' : 'LX'}
                  </AvatarFallback>
                </Avatar>
                <div className="ml-3 flex-1">
                  <div className="flex justify-between">
                    <h4 className="font-medium text-neutral-darkest">
                      {idx === 1 ? 'StyleCraft Inc.' : idx === 2 ? 'FashionForward Ltd.' : idx === 3 ? 'GarmentPro' : idx === 4 ? 'ElegantWear' : 'LuxuryApparel'}
                    </h4>
                    <span className="text-xs text-neutral-dark">
                      {idx === 1 ? '10m' : idx === 2 ? '1h' : idx === 3 ? '3h' : idx === 4 ? 'Yesterday' : 'Monday'}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-dark truncate">
                    {idx === 1 ? 'When can we expect the revised samples?' : idx === 2 ? 'Thank you for the quotation update' : idx === 3 ? 'The order looks good, we approve' : idx === 4 ? 'Please check the new color options' : 'We need to discuss the delivery timeline'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="lg:col-span-2 flex flex-col">
        <div className="p-4 border-b flex items-center">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-orange-100 text-orange-800">SC</AvatarFallback>
          </Avatar>
          <div className="ml-3">
            <h3 className="font-medium">StyleCraft Inc.</h3>
            <p className="text-xs text-neutral-dark">Last active: 5 minutes ago</p>
          </div>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <span className="material-icons">more_vert</span>
            </Button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50">
          <div className="flex justify-start">
            <div className="bg-white p-3 rounded-lg shadow-sm max-w-[80%]">
              <p className="text-sm">Hi there, I wanted to check on the status of our recent sample request for the Summer Cotton T-Shirts.</p>
              <p className="text-xs text-neutral-dark mt-1">10:24 AM</p>
            </div>
          </div>
          
          <div className="flex justify-end">
            <div className="bg-orange-100 p-3 rounded-lg shadow-sm max-w-[80%]">
              <p className="text-sm">Hello! We've completed the samples and they're currently in QC. You should receive them by end of this week.</p>
              <p className="text-xs text-neutral-dark mt-1">10:30 AM</p>
            </div>
          </div>
          
          <div className="flex justify-start">
            <div className="bg-white p-3 rounded-lg shadow-sm max-w-[80%]">
              <p className="text-sm">That's great news! Also, we'd like to discuss some modifications to the fabric weight. When can we schedule a call?</p>
              <p className="text-xs text-neutral-dark mt-1">10:35 AM</p>
            </div>
          </div>
          
          <div className="flex justify-end">
            <div className="bg-orange-100 p-3 rounded-lg shadow-sm max-w-[80%]">
              <p className="text-sm">I'm available tomorrow between 2-4 PM. Would that work for you?</p>
              <p className="text-xs text-neutral-dark mt-1">10:40 AM</p>
            </div>
          </div>
          
          <div className="flex justify-start">
            <div className="bg-white p-3 rounded-lg shadow-sm max-w-[80%]">
              <p className="text-sm">Perfect! Let's do 2:30 PM. I'll send a calendar invite.</p>
              <p className="text-xs text-neutral-dark mt-1">10:45 AM</p>
            </div>
          </div>
          
          <div className="flex justify-start">
            <div className="bg-white p-3 rounded-lg shadow-sm max-w-[80%]">
              <p className="text-sm">Also, when can we expect the revised samples?</p>
              <p className="text-xs text-neutral-dark mt-1">11:10 AM</p>
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t bg-white">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
              <span className="material-icons">attach_file</span>
            </Button>
            <div className="flex-1 mx-2">
              <input 
                type="text" 
                placeholder="Type a message..." 
                className="w-full p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-300"
              />
            </div>
            <Button size="sm" className="h-9 w-9 p-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function CRMPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Fetch customers data
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["/api/customers"],
    select: (data: any) => data || [],
  });

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-darkest">Customer Relationship Management</h1>
            <p className="text-neutral-dark">Manage your customer relationships and communications</p>
          </div>
          <Button asChild>
            <Link href="/customers/new">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Customer
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard" className="flex items-center">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center">
              <Users className="h-4 w-4 mr-2" />
              Customers
            </TabsTrigger>
            <TabsTrigger value="approvals" className="flex items-center">
              <CheckSquare className="h-4 w-4 mr-2" />
              Approvals
            </TabsTrigger>
            <TabsTrigger value="messaging" className="flex items-center">
              <MessagesSquare className="h-4 w-4 mr-2" />
              Messaging
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <CRMDashboard />
          </TabsContent>
          <TabsContent value="customers">
            <CustomerList customers={customers} />
          </TabsContent>
          <TabsContent value="approvals">
            <ApprovalRequests />
          </TabsContent>
          <TabsContent value="messaging">
            <MessagingView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}