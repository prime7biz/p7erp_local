import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Plus, Search, Edit, Trash2, Check, X, User, MoreHorizontal, Eye, AlertCircle, LineChart, Lightbulb, BarChart3, GitBranch, Leaf, Landmark, Download } from "lucide-react";
import { exportToExcel } from '@/lib/exportToExcel';
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { GarmentIndustryInsights } from "@/components/customers/GarmentIndustryInsights";

// Customer type definition
interface Customer {
  id: number;
  customerId: string;
  customerName: string;
  address?: string;
  website?: string;
  country: string;
  hasAgent: boolean;
  contactPerson: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Garment Industry specific fields
  orderCount?: number;
  inquiryCount?: number;
  totalSpend?: number;
  avgOrderValue?: number;
  lastOrderDate?: string;
  paymentTerms?: string;
  leadTime?: number;
  industrySegment?: string;
  sustainabilityRating?: number;
  complianceLevel?: string;
  agent?: {
    id: number;
    agentName: string;
    agentEmail: string;
    agentPhone: string;
    agentAddress?: string;
  }
}

// Define AI Insight interface
interface AIInsight {
  id: string;
  title: string;
  description: string;
  type: 'info' | 'warning' | 'success';
  confidence: number;
  recommendations: string[];
}

// Country list for dropdown
const countries = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", 
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", 
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", 
  "Cameroon", "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", 
  "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", 
  "Dominican Republic", "East Timor", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", 
  "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", 
  "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", 
  "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", 
  "Kiribati", "North Korea", "South Korea", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", 
  "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macedonia", "Madagascar", "Malawi", "Malaysia", "Maldives", 
  "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", 
  "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", 
  "New Zealand", "Nicaragua", "Niger", "Nigeria", "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea", 
  "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", 
  "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", 
  "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", 
  "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Swaziland", "Sweden", "Switzerland", 
  "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", 
  "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", 
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
].sort();

// Industry segments for garment industry
const industrySegments = [
  "Luxury Apparel", "Fast Fashion", "Sportswear", "Casual Wear", 
  "Formal Wear", "Workwear & Uniforms", "Children's Wear", "Accessories"
];

// Payment terms for garment industry
const paymentTerms = [
  "Advance Payment", "Net 30", "Net 60", "Net 90", 
  "Letter of Credit", "Telegraphic Transfer"
];

// Compliance levels
const complianceLevels = [
  "Basic", "Standard", "Comprehensive", "Certified"
];

const PartyInfoCard = ({ customerId }: { customerId: number }) => {
  const { data: partyInfo, isLoading } = useQuery<any>({
    queryKey: ['/api/customers', customerId, 'party-info'],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/party-info`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch party info");
      return res.json();
    },
    enabled: !!customerId,
  });

  if (isLoading) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-green-600" />
          <span className="ml-2 text-sm text-muted-foreground">Loading party info...</span>
        </CardContent>
      </Card>
    );
  }

  if (!partyInfo || !partyInfo.linked) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center">
            <Landmark className="h-4 w-4 mr-2 text-green-600" />
            Party & Accounting Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No linked accounting party</p>
        </CardContent>
      </Card>
    );
  }

  const { party, ledgerAccount, outstandingBalance } = partyInfo;
  const balance = typeof outstandingBalance === "string" ? parseFloat(outstandingBalance) : (outstandingBalance || 0);

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center">
          <Landmark className="h-4 w-4 mr-2 text-green-600" />
          Party & Accounting Info
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Party Code</p>
            <p className="text-sm font-medium">{party.partyCode}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Party Name</p>
            <p className="text-sm font-medium">{party.name}</p>
          </div>
          {ledgerAccount && (
            <div>
              <p className="text-xs text-muted-foreground">Ledger Account</p>
              <p className="text-sm font-medium">{ledgerAccount.accountNumber} — {ledgerAccount.name}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Outstanding Balance</p>
            <p className={`text-sm font-bold ${balance >= 0 ? "text-green-700" : "text-red-600"}`}>
              BDT {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          {party.creditLimit && (
            <div>
              <p className="text-xs text-muted-foreground">Credit Limit</p>
              <p className="text-sm font-medium">BDT {parseFloat(party.creditLimit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          )}
          {party.creditPeriodDays > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Credit Period</p>
              <p className="text-sm font-medium">{party.creditPeriodDays} days</p>
            </div>
          )}
          {party.defaultPaymentTerms && (
            <div>
              <p className="text-xs text-muted-foreground">Payment Terms</p>
              <p className="text-sm font-medium">{party.defaultPaymentTerms}</p>
            </div>
          )}
        </div>
        <Link href={`/parties/${party.id}`}>
          <Button variant="outline" size="sm" className="w-full mt-2 border-green-300 text-green-700 hover:bg-green-100">
            <Landmark className="mr-2 h-3 w-3" />
            View Party
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};

const CustomerForm = ({ 
  customer,
  onSubmit,
  onCancel,
  isSubmitting
}: { 
  customer?: Customer;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) => {
  // Customer form validation schema
  const formSchema = z.object({
    customerName: z.string().min(2, "Name must be at least 2 characters"),
    address: z.string().optional(), // New address field
    website: z.string().url("Invalid website URL").optional(), // New website field
    country: z.string().min(1, "Country is required"),
    hasAgent: z.boolean().default(false),
    contactPerson: z.string().min(2, "Contact person is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(5, "Phone number is required"),
    // Garment industry specific fields
    industrySegment: z.string().optional(),
    paymentTerms: z.string().optional(),
    leadTime: z.coerce.number().min(0).optional(),
    complianceLevel: z.string().optional(),
    sustainabilityRating: z.coerce.number().min(0).max(5).optional(),
    agent: z.object({
      agentName: z.string().optional(),
      agentEmail: z.string().email("Invalid email address").optional(),
      agentPhone: z.string().optional(),
      agentAddress: z.string().optional() // New agent address field
    }).optional()
  });

  // Initialize form with default values
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: customer ? {
      customerName: customer.customerName,
      address: customer.address || "",
      website: customer.website || "",
      country: customer.country,
      hasAgent: customer.hasAgent,
      contactPerson: customer.contactPerson,
      email: customer.email,
      phone: customer.phone,
      industrySegment: customer.industrySegment || "",
      paymentTerms: customer.paymentTerms || "",
      leadTime: customer.leadTime || 0,
      complianceLevel: customer.complianceLevel || "",
      sustainabilityRating: customer.sustainabilityRating || 0,
      agent: customer.agent ? {
        agentName: customer.agent.agentName,
        agentEmail: customer.agent.agentEmail,
        agentPhone: customer.agent.agentPhone,
        agentAddress: customer.agent.agentAddress || ""
      } : undefined
    } : {
      customerName: "",
      address: "",
      website: "",
      country: "",
      hasAgent: false,
      contactPerson: "",
      email: "",
      phone: "",
      industrySegment: "",
      paymentTerms: "",
      leadTime: 0,
      complianceLevel: "",
      sustainabilityRating: 0,
      agent: undefined
    }
  });

  // Watch hasAgent field to conditionally show agent fields
  const hasAgent = form.watch("hasAgent");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="customerName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Customer Name *</FormLabel>
              <FormControl>
                <Input placeholder="Enter customer name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Enter customer address" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website</FormLabel>
              <FormControl>
                <Input placeholder="https://www.example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country *</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value || ""}
                defaultValue=""
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  {countries.map((country) => (
                    <SelectItem key={country} value={country}>{country}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contactPerson"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact Person *</FormLabel>
              <FormControl>
                <Input placeholder="Enter contact person name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter email address" type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter phone number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Garment Industry specific section */}
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-medium">Garment Industry Information</h3>
          
          <FormField
            control={form.control}
            name="industrySegment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Industry Segment</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry segment" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {industrySegments.map((segment) => (
                      <SelectItem key={segment} value={segment}>{segment}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Segment that best describes this customer's primary business
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="paymentTerms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Terms</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment terms" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paymentTerms.map((term) => (
                        <SelectItem key={term} value={term}>{term}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="leadTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avg. Lead Time (Days)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter lead time" 
                      type="number" 
                      min="0"
                      {...field} 
                      value={field.value || ''} 
                      onChange={e => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="complianceLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Compliance Level</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select compliance level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {complianceLevels.map((level) => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Level of compliance with industry standards
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sustainabilityRating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sustainability Rating (0-5)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter rating" 
                      type="number" 
                      min="0" 
                      max="5" 
                      step="0.5"
                      {...field} 
                      value={field.value || ''} 
                      onChange={e => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Customer's commitment to sustainable practices
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="hasAgent"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Agent</FormLabel>
                <FormDescription>
                  Does this customer have an agent?
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {hasAgent && (
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-medium">Agent Details</h3>

            <FormField
              control={form.control}
              name="agent.agentName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter agent name" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="agent.agentEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent Email *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter agent email" type="email" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agent.agentPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent Phone *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter agent phone" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="agent.agentAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent Address</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Enter agent address" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {customer ? 'Update Customer' : 'Create Customer'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};

export default function CustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAIInsightDialogOpen, setIsAIInsightDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerInsights, setCustomerInsights] = useState<AIInsight[] | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [businessIntelligence, setBusinessIntelligence] = useState<AIInsight[]>([]);
  const [isLoadingBusinessIntelligence, setIsLoadingBusinessIntelligence] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch customers
  const { data: customersData = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    retry: false,
  });
  
  // Ensure we have a properly typed array of customers
  const customers = Array.isArray(customersData) ? customersData : [];

  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: (newCustomer: any) => 
      apiRequest("/api/customers", "POST", newCustomer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Customer created",
        description: "The customer has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer",
        variant: "destructive",
      });
    }
  });

  // Update customer mutation
  const updateCustomerMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: any }) => 
      apiRequest(`/api/customers/${id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setIsEditDialogOpen(false);
      setSelectedCustomer(null);
      toast({
        title: "Customer updated",
        description: "The customer has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
    }
  });

  // Toggle customer status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number, isActive: boolean }) => 
      apiRequest(`/api/customers/${id}/status`, "PATCH", { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({
        title: "Status updated",
        description: "The customer status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer status",
        variant: "destructive",
      });
    }
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: (id: number) => 
      apiRequest(`/api/customers/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setIsDeleteDialogOpen(false);
      setSelectedCustomer(null);
      toast({
        title: "Customer deleted",
        description: "The customer has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      });
    }
  });

  // Handle create customer
  const handleCreateCustomer = (data: any) => {
    // Ensure agent data is properly formatted
    let formattedData = { ...data };
    
    // Fix the data structure to match the API requirements
    if (formattedData.hasAgent && formattedData.agent) {
      // Keep only the agent fields we actually collect in the form
      formattedData.agent = {
        agentName: formattedData.agent.agentName,
        agentEmail: formattedData.agent.agentEmail,
        agentPhone: formattedData.agent.agentPhone,
        agentAddress: formattedData.agent.agentAddress,
      };
    } else {
      // Remove agent data if hasAgent is false
      delete formattedData.agent;
    }
    
    createCustomerMutation.mutate(formattedData);
  };

  // Handle edit customer
  const handleEditCustomer = (data: any) => {
    if (selectedCustomer) {
      updateCustomerMutation.mutate({ id: selectedCustomer.id, data });
    }
  };

  // Handle toggle customer status
  const handleToggleStatus = (customer: Customer) => {
    toggleStatusMutation.mutate({ id: customer.id, isActive: !customer.isActive });
  };

  // Handle delete customer
  const handleDeleteCustomer = () => {
    if (selectedCustomer) {
      deleteCustomerMutation.mutate(selectedCustomer.id);
    }
  };
  
  // Generate mock AI insights for the garment industry
  const generateMockGarmentInsights = (customer: Customer): AIInsight[] => {
    return [
      {
        id: 'insight-1',
        title: 'Seasonal Order Patterns',
        description: 'This customer typically increases orders by 35% during Q2 for fall collections. Consider proactive capacity planning.',
        type: 'info',
        confidence: 0.85,
        recommendations: [
          'Prepare for increased capacity in Q2',
          'Pre-stock common materials',
          'Schedule additional staff for peak periods'
        ]
      },
      {
        id: 'insight-2',
        title: 'Sustainability Leader',
        description: 'This customer has shown 15% higher interest in sustainable fabrics compared to other customers.',
        type: 'success',
        confidence: 0.92,
        recommendations: [
          'Showcase your eco-friendly fabric options',
          'Highlight your sustainability certifications',
          'Propose collaboration on green initiatives'
        ]
      },
      {
        id: 'insight-3',
        title: 'Production Optimization Opportunity',
        description: 'Based on past orders, consolidating similar styles could reduce setup time by 22%.',
        type: 'warning',
        confidence: 0.78,
        recommendations: [
          'Suggest order batching for similar products',
          'Propose scheduling adjustments to minimize changeover time',
          'Share production efficiency benefits with the customer'
        ]
      }
    ];
  };
  
  // Open AI insight dialog and generate insights for a specific customer
  const openAIInsightDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsLoadingInsights(true);
    setIsAIInsightDialogOpen(true);
    
    // Simulate API call with delay
    setTimeout(() => {
      setCustomerInsights(generateMockGarmentInsights(customer));
      setIsLoadingInsights(false);
    }, 1500);
  };
  
  // Toggle AI insights panel
  const toggleAIInsights = () => {
    const newState = !showAIInsights;
    setShowAIInsights(newState);
    
    if (newState && businessIntelligence.length === 0) {
      setIsLoadingBusinessIntelligence(true);
      
      // Simulate API call with delay
      setTimeout(() => {
        setBusinessIntelligence([
          {
            id: 'bi-1',
            title: 'Emerging Market Opportunity: Sustainable Activewear',
            description: 'Based on order data and market trends, there is growing demand for eco-friendly activewear. Customers in this segment increased orders by 28% in the last quarter.',
            type: 'success',
            confidence: 0.89,
            recommendations: [
              'Develop dedicated sustainable activewear capabilities',
              'Highlight recycled polyester and organic cotton options',
              'Showcase water reduction production processes'
            ]
          },
          {
            id: 'bi-2',
            title: 'Risk Alert: Supply Chain Disruption',
            description: 'Recent shipping data indicates potential delays from Southeast Asian suppliers. This may impact 15% of your current production schedule.',
            type: 'warning',
            confidence: 0.75,
            recommendations: [
              'Diversify supplier base for critical materials',
              'Increase safety stock for high-demand items',
              'Communicate potential delays to affected customers'
            ]
          },
          {
            id: 'bi-3',
            title: 'Compliance Enhancement Opportunity',
            description: 'New eco-regulations in EU markets will impact 32% of your customer base. Early adaptation will provide competitive advantage.',
            type: 'info',
            confidence: 0.82,
            recommendations: [
              'Update compliance documentation for EU customers',
              'Implement enhanced chemical management system',
              'Prepare for increased traceability requirements'
            ]
          }
        ]);
        setIsLoadingBusinessIntelligence(false);
      }, 2000);
    }
  };

  // Filter customers based on search term and inactive status
  const filteredCustomers = customers.filter(customer => {
    const searchMatch = 
      customer.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.customerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.toLowerCase().includes(searchTerm.toLowerCase());
    
    const statusMatch = showInactive ? true : customer.isActive;
    
    return searchMatch && statusMatch;
  });

  // Action buttons for the page header
  const pageActions = (
    <>
      <Button 
        variant="outline" 
        onClick={toggleAIInsights}
        className={cn(showAIInsights && "bg-primary/10")}
      >
        <LineChart className="mr-2 h-4 w-4" />
        {showAIInsights ? "Hide AI Insights" : "Show AI Insights"}
      </Button>
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogTrigger asChild>
          <Button className="bg-primary hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> Add Customer
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Add a new customer to the system. Fill in all the required fields.
            </DialogDescription>
          </DialogHeader>
          <CustomerForm 
            onSubmit={handleCreateCustomer} 
            onCancel={() => setIsCreateDialogOpen(false)}
            isSubmitting={createCustomerMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <DashboardContainer
      title="Customers"
      subtitle="Manage your garment industry customers and their information"
      actions={pageActions}
    >
      {/* AI Insights Section */}
      {showAIInsights && (
        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center text-primary">
                <Lightbulb className="mr-2 h-5 w-5" />
                Garment Industry Intelligence
              </CardTitle>
              <CardDescription className="text-primary/80">
                AI-powered insights for your garment manufacturing business
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingBusinessIntelligence ? (
                <div className="flex items-center justify-center h-24">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : businessIntelligence.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {businessIntelligence.map((insight) => (
                    <Card 
                      key={insight.id} 
                      className={cn(
                        "border-l-4",
                        insight.type === "success" && "border-l-green-500",
                        insight.type === "warning" && "border-l-amber-500",
                        insight.type === "info" && "border-l-blue-500",
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start">
                          <div className={cn(
                            "mr-2 h-5 w-5 mt-0.5",
                            insight.type === "success" && "text-green-500",
                            insight.type === "warning" && "text-amber-500",
                            insight.type === "info" && "text-blue-500",
                          )}>
                            {insight.type === "success" && <Check className="h-5 w-5" />}
                            {insight.type === "warning" && <AlertCircle className="h-5 w-5" />}
                            {insight.type === "info" && <Lightbulb className="h-5 w-5" />}
                          </div>
                          <div>
                            <CardTitle className="text-base font-medium">{insight.title}</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              {insight.description}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-3">
                        {insight.recommendations.length > 0 && (
                          <div className="mt-2">
                            <h4 className="text-sm font-medium mb-1">Recommendations:</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {insight.recommendations.map((rec, idx) => (
                                <li key={idx} className="flex items-start">
                                  <div className="mr-2 text-primary">•</div>
                                  <div>{rec}</div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="pt-0 text-xs text-muted-foreground">
                        Confidence: {Math.round(insight.confidence * 100)}%
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="mx-auto h-10 w-10 mb-4 opacity-20" />
                  <p>No business intelligence available. Try adding more customer data.</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Garment Industry Trends Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <BarChart3 className="h-4 w-4 mr-1 text-blue-600" />
                  Order Forecasting
                </CardTitle>
                <CardDescription className="text-xs">
                  Predicted order volumes for next quarter
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>Q3 Forecast</span>
                    <span className="font-medium text-green-600">+15% YoY</span>
                  </div>
                  <div className="h-24 flex items-end">
                    <div className="flex-1 bg-blue-100 rounded-t-md h-[40%] mx-0.5"></div>
                    <div className="flex-1 bg-blue-200 rounded-t-md h-[60%] mx-0.5"></div>
                    <div className="flex-1 bg-blue-300 rounded-t-md h-[80%] mx-0.5"></div>
                  </div>
                  <div className="flex justify-between text-xs pt-1">
                    <span>Jun</span>
                    <span>Jul</span>
                    <span>Aug</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <Leaf className="h-4 w-4 mr-1 text-emerald-600" />
                  Sustainability Metrics
                </CardTitle>
                <CardDescription className="text-xs">
                  Customer environmental and ethical compliance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>Overall Rating</span>
                    <span className="font-medium">4.2/5</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span>Recycled Materials</span>
                      <span>78%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: "78%" }}></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span>Water Reduction</span>
                      <span>65%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: "65%" }}></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <GitBranch className="h-4 w-4 mr-1 text-purple-600" />
                  Supply Chain Intelligence
                </CardTitle>
                <CardDescription className="text-xs">
                  Insights from your supply chain network
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert className="border-l-4 border-amber-500 bg-amber-50/50 py-2">
                    <div className="flex items-start">
                      <AlertCircle className="h-4 w-4 mr-2 text-amber-500 mt-0.5" />
                      <AlertDescription className="text-xs">
                        Potential 2-week delay from Southeast Asian suppliers
                      </AlertDescription>
                    </div>
                  </Alert>
                  <Alert className="border-l-4 border-green-500 bg-green-50/50 py-2">
                    <div className="flex items-start">
                      <Check className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
                      <AlertDescription className="text-xs">
                        New eco-friendly fabric supplier available in Bangladesh
                      </AlertDescription>
                    </div>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportToExcel(
                filteredCustomers,
                [
                  { key: "customerId", header: "Customer ID" },
                  { key: "customerName", header: "Name" },
                  { key: "country", header: "Country" },
                  { key: "contactPerson", header: "Contact Person" },
                  { key: "email", header: "Email" },
                  { key: "phone", header: "Phone" },
                  { key: "isActive", header: "Active" },
                ],
                "customers",
                "xlsx"
              )}>
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToExcel(
                filteredCustomers,
                [
                  { key: "customerId", header: "Customer ID" },
                  { key: "customerName", header: "Name" },
                  { key: "country", header: "Country" },
                  { key: "contactPerson", header: "Contact Person" },
                  { key: "email", header: "Email" },
                  { key: "phone", header: "Phone" },
                  { key: "isActive", header: "Active" },
                ],
                "customers",
                "csv"
              )}>
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Switch 
            id="show-inactive" 
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <label htmlFor="show-inactive" className="text-sm cursor-pointer">
            Show inactive customers
          </label>
        </div>
      </div>

      {/* Customer Table */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  <div className="flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className={!customer.isActive ? "bg-gray-50 opacity-70" : ""}>
                  <TableCell className="font-medium">{customer.customerId}</TableCell>
                  <TableCell>{customer.customerName}</TableCell>
                  <TableCell>{customer.country}</TableCell>
                  <TableCell>{customer.contactPerson}</TableCell>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>
                    {customer.hasAgent ? 
                      <Badge variant="outline" className="bg-blue-50 text-blue-800 hover:bg-blue-50">Yes</Badge> : 
                      <span className="text-muted-foreground">No</span>}
                  </TableCell>
                  <TableCell>
                    {customer.isActive ? 
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge> : 
                      <Badge variant="outline" className="bg-gray-100 text-gray-800 hover:bg-gray-100">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem 
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setIsViewDialogOpen(true);
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleToggleStatus(customer)}
                        >
                          {customer.isActive ? 
                            <><X className="mr-2 h-4 w-4" />Deactivate</> : 
                            <><Check className="mr-2 h-4 w-4" />Activate</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAIInsightDialog(customer)}>
                          <Lightbulb className="mr-2 h-4 w-4" />
                          AI Insights
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setIsDeleteDialogOpen(true);
                          }}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* View Customer Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <User className="mr-2 h-5 w-5" />
              Customer Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedCustomer && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="info" className="flex-1">Basic Information</TabsTrigger>
                <TabsTrigger value="garment" className="flex-1">Garment Industry Data</TabsTrigger>
                <TabsTrigger value="analytics" className="flex-1">Analytics</TabsTrigger>
              </TabsList>
              
              <TabsContent value="info" className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">{selectedCustomer.customerName}</h3>
                  <Badge className={selectedCustomer.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                    {selectedCustomer.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Customer ID</h4>
                    <p>{selectedCustomer.customerId}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Country</h4>
                    <p>{selectedCustomer.country}</p>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Contact Person</h4>
                  <p>{selectedCustomer.contactPerson}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Address</h4>
                  <p>{selectedCustomer.address || 'Not provided'}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Website</h4>
                  <p>
                    {selectedCustomer.website ? (
                      <a 
                        href={selectedCustomer.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {selectedCustomer.website}
                      </a>
                    ) : 'Not provided'}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Email</h4>
                    <p>{selectedCustomer.email}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Phone</h4>
                    <p>{selectedCustomer.phone}</p>
                  </div>
                </div>
                
                {selectedCustomer.hasAgent && selectedCustomer.agent && (
                  <>
                    <div className="h-px bg-border my-2"></div>
                    <div>
                      <h4 className="text-sm font-medium">Agent Information</h4>
                      
                      <div className="mt-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Name</h4>
                        <p>{selectedCustomer.agent.agentName}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground">Email</h4>
                          <p>{selectedCustomer.agent.agentEmail}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground">Phone</h4>
                          <p>{selectedCustomer.agent.agentPhone}</p>
                        </div>
                      </div>
                      
                      <div className="mt-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Address</h4>
                        <p>{selectedCustomer.agent.agentAddress || 'Not provided'}</p>
                      </div>
                    </div>
                  </>
                )}
                
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Created</h4>
                    <p>{new Date(selectedCustomer.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Last Updated</h4>
                    <p>{new Date(selectedCustomer.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <PartyInfoCard customerId={selectedCustomer.id} />
                </div>
              </TabsContent>
              
              <TabsContent value="garment" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Industry Segment</h4>
                    <p>{selectedCustomer.industrySegment || 'Not specified'}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Payment Terms</h4>
                    <p>{selectedCustomer.paymentTerms || 'Not specified'}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Lead Time</h4>
                    <p>{selectedCustomer.leadTime ? `${selectedCustomer.leadTime} days` : 'Not specified'}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Compliance Level</h4>
                    <p>{selectedCustomer.complianceLevel || 'Not specified'}</p>
                  </div>
                  
                  <div className="col-span-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Sustainability Rating</h4>
                    <div className="flex items-center mt-1">
                      {[...Array(5)].map((_, i) => (
                        <svg 
                          key={i}
                          xmlns="http://www.w3.org/2000/svg" 
                          className={`h-5 w-5 ${i < (selectedCustomer.sustainabilityRating || 0) ? 'text-emerald-500' : 'text-gray-200'}`}
                          viewBox="0 0 20 20" 
                          fill="currentColor"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                      <span className="ml-2 text-sm">{selectedCustomer.sustainabilityRating || 0}/5</span>
                    </div>
                  </div>
                </div>
                
                {/* AI-Powered Garment Industry Insights */}
                <div className="mt-6">
                  <GarmentIndustryInsights customerId={selectedCustomer.id} />
                </div>
              </TabsContent>
              
              <TabsContent value="analytics" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Order Statistics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Total Orders</span>
                          <span className="font-medium">{selectedCustomer.orderCount || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Average Order Value</span>
                          <span className="font-medium">${selectedCustomer.avgOrderValue?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Total Spend</span>
                          <span className="font-medium">${selectedCustomer.totalSpend?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Last Order Date</span>
                          <span className="font-medium">{selectedCustomer.lastOrderDate || 'N/A'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Production Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">On-Time Delivery</span>
                          <span className="font-medium text-green-600">93%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Quality Approval Rate</span>
                          <span className="font-medium text-green-600">97%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Average Defect Rate</span>
                          <span className="font-medium">2.4%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Sample Approval Time</span>
                          <span className="font-medium">8 days</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center">
                      <Lightbulb className="h-4 w-4 mr-2 text-amber-500" />
                      AI-Generated Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start">
                      <div className="min-w-4 mr-2">1.</div>
                      <p className="text-sm">Consider offering a sustainability consultation to improve their rating from {selectedCustomer.sustainabilityRating || 0}/5 to a higher score.</p>
                    </div>
                    <div className="flex items-start">
                      <div className="min-w-4 mr-2">2.</div>
                      <p className="text-sm">Based on historical data, suggest inventory pre-planning for their typical Q3 order increase.</p>
                    </div>
                    <div className="flex items-start">
                      <div className="min-w-4 mr-2">3.</div>
                      <p className="text-sm">Introduce your new eco-friendly fabric options that match their recent purchasing patterns.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Edit customer information. All fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          {selectedCustomer && (
            <CustomerForm 
              customer={selectedCustomer}
              onSubmit={handleEditCustomer}
              onCancel={() => setIsEditDialogOpen(false)}
              isSubmitting={updateCustomerMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Customer Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Customer Name</h4>
                <p className="font-medium">{selectedCustomer.customerName}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Customer ID</h4>
                <p>{selectedCustomer.customerId}</p>
              </div>
            </div>
          )}
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              Deleting this customer will also remove all associated data.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteCustomer}
              disabled={deleteCustomerMutation.isPending}
            >
              {deleteCustomerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Insights Dialog */}
      <Dialog open={isAIInsightDialogOpen} onOpenChange={setIsAIInsightDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Lightbulb className="mr-2 h-5 w-5 text-primary" />
              AI Insights: {selectedCustomer?.customerName}
            </DialogTitle>
            <DialogDescription>
              AI-generated insights and recommendations for this customer
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingInsights ? (
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">Generating garment industry AI insights...</p>
              </div>
            </div>
          ) : customerInsights ? (
            <div className="space-y-6 my-4 max-h-[60vh] overflow-y-auto pr-2">
              {customerInsights.map((insight) => (
                <Card 
                  key={insight.id}
                  className={cn(
                    "border-l-4",
                    insight.type === "success" && "border-l-green-500",
                    insight.type === "warning" && "border-l-amber-500",
                    insight.type === "info" && "border-l-blue-500",
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start">
                      <div className={cn(
                        "mr-2 h-5 w-5 mt-0.5",
                        insight.type === "success" && "text-green-500",
                        insight.type === "warning" && "text-amber-500",
                        insight.type === "info" && "text-blue-500",
                      )}>
                        {insight.type === "success" && <Check className="h-5 w-5" />}
                        {insight.type === "warning" && <AlertCircle className="h-5 w-5" />}
                        {insight.type === "info" && <Lightbulb className="h-5 w-5" />}
                      </div>
                      <div>
                        <CardTitle className="text-base font-medium">{insight.title}</CardTitle>
                        <CardDescription className="text-sm mt-1">
                          {insight.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    {insight.recommendations.length > 0 && (
                      <div className="mt-2">
                        <h4 className="text-sm font-medium mb-1">Recommendations:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {insight.recommendations.map((rec, idx) => (
                            <li key={idx} className="flex items-start">
                              <div className="mr-2 text-primary">•</div>
                              <div>{rec}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-0 text-xs text-muted-foreground">
                    Confidence: {Math.round(insight.confidence * 100)}%
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 mb-4 opacity-20" />
              <p>No insights available for this customer.</p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAIInsightDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}