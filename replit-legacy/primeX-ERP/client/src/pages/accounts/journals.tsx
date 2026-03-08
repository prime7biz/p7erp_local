import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DonutChart } from "../../components/charts";

interface Account {
  id: number;
  accountNumber: string;
  name: string;
  normalBalance: "debit" | "credit";
  balance: string;
  description: string | null;
  isActive: boolean;
}

interface JournalEntry {
  id: number;
  journalId: string;
  reference: string;
  transactionDate: string;
  postingDate: string;
  description: string;
  status: "draft" | "posted" | "voided";
  type: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
  createdBy: number;
  fiscalYearId: number;
  fiscalPeriodId: number;
  details: JournalDetail[];
}

interface JournalDetail {
  id: number;
  journalEntryId: number;
  accountId: number;
  account?: Account;
  description: string;
  debitAmount: string;
  creditAmount: string;
  memo: string | null;
  lineNumber: number;
}

interface FiscalYear {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isActive: boolean;
  isClosed: boolean;
}

interface FiscalPeriod {
  id: number;
  fiscalYearId: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isActive: boolean;
  isClosed: boolean;
}

// Define Zod schemas for the form validation
const journalDetailSchema = z.object({
  accountId: z.number({
    required_error: "Account is required",
  }),
  description: z.string().optional(),
  debitAmount: z.string().optional(),
  creditAmount: z.string().optional(),
}).refine(data => {
  // Either debitAmount or creditAmount must be provided, but not both
  const hasDebit = !!data.debitAmount && parseFloat(data.debitAmount) > 0;
  const hasCredit = !!data.creditAmount && parseFloat(data.creditAmount) > 0;
  return (hasDebit && !hasCredit) || (hasCredit && !hasDebit);
}, {
  message: "Provide either a debit or credit amount, not both",
  path: ["debitAmount"],
});

const journalEntrySchema = z.object({
  reference: z.string().optional(),
  transactionDate: z.string({
    required_error: "Transaction date is required",
  }),
  description: z.string().min(2, "Description must be at least 2 characters"),
  type: z.string({
    required_error: "Journal type is required",
  }),
  fiscalYearId: z.number({
    required_error: "Fiscal year is required",
  }),
  fiscalPeriodId: z.number({
    required_error: "Fiscal period is required",
  }),
  details: z.array(journalDetailSchema).min(2, "At least two line items are required"),
}).refine(data => {
  // Function to parse amount strings to numbers safely
  const parseAmount = (amountStr: string | undefined) => {
    if (!amountStr) return 0;
    const parsed = parseFloat(amountStr);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Calculate total debits and credits
  const debits = data.details.reduce((sum, item) => sum + parseAmount(item.debitAmount), 0);
  const credits = data.details.reduce((sum, item) => sum + parseAmount(item.creditAmount), 0);

  // Check if debits equal credits (with a small tolerance for floating point errors)
  return Math.abs(debits - credits) < 0.01;
}, {
  message: "Debits must equal credits",
  path: ["details"],
});

// Form types
type JournalDetailValues = z.infer<typeof journalDetailSchema>;
type JournalEntryValues = z.infer<typeof journalEntrySchema>;

// Journal type options
const journalTypes = [
  { value: "general", label: "General Journal" },
  { value: "adjustment", label: "Adjustment Journal" },
  { value: "opening", label: "Opening Balance" },
  { value: "closing", label: "Closing Entry" },
  { value: "recurring", label: "Recurring Journal" },
];

// Status badge styles
const statusStyles = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-300",
  posted: "bg-green-100 text-green-800 border-green-300",
  voided: "bg-red-100 text-red-800 border-red-300",
};

function JournalsPage() {
  const [activeTab, setActiveTab] = useState<"recent" | "search" | "create">("recent");
  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<JournalEntry | null>(null);
  const [searchParams, setSearchParams] = useState({
    startDate: "",
    endDate: "",
    reference: "",
    status: "",
    type: "",
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch accounts for dropdown
  const { data: accounts, isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['/api/accounting/chart-of-accounts', { showInactive: false }],
  });

  // Fetch fiscal years for dropdown
  const { data: fiscalYears, isLoading: fiscalYearsLoading } = useQuery<FiscalYear[]>({
    queryKey: ['/api/accounting/fiscal-years'],
  });

  // Get current fiscal year and period
  const { data: currentFiscalYear, isLoading: currentFYLoading } = useQuery<FiscalYear>({
    queryKey: ['/api/accounting/fiscal-years/current'],
  });

  // Fetch fiscal periods based on selected fiscal year
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState<number | null>(null);
  
  useEffect(() => {
    if (currentFiscalYear && !selectedFiscalYearId) {
      setSelectedFiscalYearId(currentFiscalYear.id);
    }
  }, [currentFiscalYear, selectedFiscalYearId]);

  const { data: fiscalPeriods, isLoading: periodsLoading } = useQuery<FiscalPeriod[]>({
    queryKey: ['/api/accounting/fiscal-years', selectedFiscalYearId, 'periods'],
    enabled: !!selectedFiscalYearId,
  });

  // Fetch recent journal entries
  const { data: journalEntries, isLoading: journalsLoading } = useQuery<JournalEntry[]>({
    queryKey: ['/api/accounting/journals/recent'],
  });

  // Journal entry mutation
  const createJournalMutation = useMutation({
    mutationFn: (newJournal: JournalEntryValues) => {
      return apiRequest("/api/accounting/journals", "POST", newJournal);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting/journals/recent'] });
      toast({
        title: "Journal Entry Created",
        description: "Your journal entry has been created successfully",
      });
      form.reset({
        reference: "",
        transactionDate: new Date().toISOString().substring(0, 10),
        description: "",
        type: "general",
        fiscalYearId: currentFiscalYear?.id || 0,
        fiscalPeriodId: 0,
        details: [
          { accountId: 0, description: "", debitAmount: "", creditAmount: "" },
          { accountId: 0, description: "", debitAmount: "", creditAmount: "" },
        ],
      });
      setActiveTab("recent");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create journal entry",
        variant: "destructive",
      });
    },
  });

  // Search journals mutation
  const searchJournalsMutation = useMutation({
    mutationFn: (searchParams: any) => {
      return apiRequest("/api/accounting/journals/search", "POST", searchParams);
    },
    onSuccess: (data) => {
      // Handle search results
      // For now, just show a toast
      toast({
        title: "Search Complete",
        description: `Found ${data.length} journal entries`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Search Error",
        description: error.message || "Failed to search journals",
        variant: "destructive",
      });
    },
  });

  // Create journal form
  const form = useForm<JournalEntryValues>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      reference: "",
      transactionDate: new Date().toISOString().substring(0, 10),
      description: "",
      type: "general",
      fiscalYearId: currentFiscalYear?.id || 0,
      fiscalPeriodId: 0,
      details: [
        { accountId: 0, description: "", debitAmount: "", creditAmount: "" },
        { accountId: 0, description: "", debitAmount: "", creditAmount: "" },
      ],
    },
  });

  // Update fiscal year and period when current fiscal year loads
  useEffect(() => {
    if (currentFiscalYear) {
      form.setValue("fiscalYearId", currentFiscalYear.id);
      // Set first period as default if available
      if (fiscalPeriods && fiscalPeriods.length > 0) {
        // Find current period if possible
        const currentPeriod = fiscalPeriods.find(p => p.isCurrent);
        if (currentPeriod) {
          form.setValue("fiscalPeriodId", currentPeriod.id);
        } else {
          form.setValue("fiscalPeriodId", fiscalPeriods[0].id);
        }
      }
    }
  }, [currentFiscalYear, fiscalPeriods, form]);

  // Set up field array for journal detail lines
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "details",
  });

  // Add a new journal detail line
  const addJournalLine = () => {
    append({ accountId: 0, description: "", debitAmount: "", creditAmount: "" });
  };

  // Handle view journal
  const handleViewJournal = (journal: JournalEntry) => {
    setSelectedJournal(journal);
    setIsViewDialogOpen(true);
  };

  // Handle form submission
  const onSubmit = (values: JournalEntryValues) => {
    createJournalMutation.mutate(values);
  };

  // Calculate total debits and credits for form validation
  const calculateTotals = () => {
    const values = form.getValues();
    const parseAmount = (str: string | undefined) => {
      if (!str) return 0;
      const num = parseFloat(str);
      return isNaN(num) ? 0 : num;
    };

    const debits = values.details.reduce((sum, detail) => sum + parseAmount(detail.debitAmount), 0);
    const credits = values.details.reduce((sum, detail) => sum + parseAmount(detail.creditAmount), 0);
    
    return { debits, credits, difference: Math.abs(debits - credits) };
  };

  const totals = calculateTotals();

  // Mock data for journals distribution
  const journalDistribution = [
    { name: "General", value: 12 },
    { name: "Adjustment", value: 5 },
    { name: "Opening", value: 1 },
    { name: "Closing", value: 0 },
    { name: "Recurring", value: 3 },
  ];

  return (
    <DashboardContainer title="Journal Entries" subtitle="Create and manage journal entries">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Journal Entries</h2>
        <Button onClick={() => setIsEntryDialogOpen(true)}>
          <span className="material-icons mr-2">add</span>
          New Journal Entry
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(tab) => setActiveTab(tab as any)}>
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="recent">Recent Entries</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="create">Create New</TabsTrigger>
        </TabsList>
        
        {/* Recent Tab */}
        <TabsContent value="recent" className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Total Entries</CardTitle>
                <CardDescription>Journal entries this period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <span className="text-4xl font-bold">21</span>
                  <Badge className="ml-2 bg-green-100 text-green-800 border border-green-300">
                    +5 this week
                  </Badge>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Entry Status</CardTitle>
                <CardDescription>Current journal status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex space-x-4 text-center">
                  <div className="flex-1">
                    <span className="block text-2xl font-bold">15</span>
                    <span className="text-sm text-neutral-dark">Posted</span>
                  </div>
                  <div className="flex-1">
                    <span className="block text-2xl font-bold">4</span>
                    <span className="text-sm text-neutral-dark">Draft</span>
                  </div>
                  <div className="flex-1">
                    <span className="block text-2xl font-bold">2</span>
                    <span className="text-sm text-neutral-dark">Voided</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Journal Types</CardTitle>
                <CardDescription>Distribution by type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center">
                  <DonutChart
                    data={journalDistribution}
                    category="value"
                    index="name"
                    showAnimation={true}
                    height="h-28"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Recent Journal Entries</CardTitle>
              <CardDescription>Recently created and modified journal entries</CardDescription>
            </CardHeader>
            <CardContent>
              {journalsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : !journalEntries || journalEntries.length === 0 ? (
                <div className="text-center py-8 text-neutral-dark">
                  No journal entries found. Create your first journal entry to get started.
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* For now using mock data since backend might not be fully implemented */}
                      {([
                        {
                          id: 1,
                          journalId: "JRN-2023-001",
                          reference: "INV-2023-0042",
                          transactionDate: "2023-05-15",
                          postingDate: "2023-05-15",
                          description: "Payment for office supplies",
                          status: "posted",
                          type: "general",
                          amount: "1,250.00",
                          createdAt: "2023-05-15T10:30:00Z",
                          updatedAt: "2023-05-15T10:35:00Z",
                          createdBy: 1,
                          fiscalYearId: 1,
                          fiscalPeriodId: 5,
                          details: []
                        },
                        {
                          id: 2,
                          journalId: "JRN-2023-002",
                          reference: "ADJ-2023-0012",
                          transactionDate: "2023-05-16",
                          postingDate: "",
                          description: "Adjustment for inventory valuation",
                          status: "draft",
                          type: "adjustment",
                          amount: "3,750.00",
                          createdAt: "2023-05-16T14:22:00Z",
                          updatedAt: "2023-05-16T14:22:00Z",
                          createdBy: 1,
                          fiscalYearId: 1,
                          fiscalPeriodId: 5,
                          details: []
                        },
                        {
                          id: 3,
                          journalId: "JRN-2023-003",
                          reference: "VOID-2023-0001",
                          transactionDate: "2023-05-10",
                          postingDate: "2023-05-10",
                          description: "Voided transaction for incorrect entry",
                          status: "voided",
                          type: "general",
                          amount: "500.00",
                          createdAt: "2023-05-10T09:15:00Z",
                          updatedAt: "2023-05-17T11:05:00Z",
                          createdBy: 1,
                          fiscalYearId: 1,
                          fiscalPeriodId: 5,
                          details: []
                        }
                      ]).map((journal: JournalEntry) => (
                        <TableRow key={journal.id}>
                          <TableCell className="font-medium">{journal.journalId}</TableCell>
                          <TableCell>{new Date(journal.transactionDate).toLocaleDateString()}</TableCell>
                          <TableCell>{journal.description}</TableCell>
                          <TableCell className="capitalize">{journal.type.replace('_', ' ')}</TableCell>
                          <TableCell>${journal.amount}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusStyles[journal.status as keyof typeof statusStyles]}>
                              {journal.status.charAt(0).toUpperCase() + journal.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <span className="material-icons">more_vert</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewJournal(journal)}>
                                  <span className="material-icons mr-2 text-sm">visibility</span>
                                  View
                                </DropdownMenuItem>
                                {journal.status === "draft" && (
                                  <>
                                    <DropdownMenuItem>
                                      <span className="material-icons mr-2 text-sm">edit</span>
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <span className="material-icons mr-2 text-sm">check_circle</span>
                                      Post
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {journal.status === "posted" && (
                                  <DropdownMenuItem>
                                    <span className="material-icons mr-2 text-sm">block</span>
                                    Void
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem>
                                  <span className="material-icons mr-2 text-sm">print</span>
                                  Print
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline">
                <span className="material-icons mr-2 text-sm">refresh</span>
                Refresh
              </Button>
              <Button variant="outline">
                View All Journal Entries
                <span className="material-icons ml-2 text-sm">arrow_forward</span>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Search Tab */}
        <TabsContent value="search" className="space-y-4 py-4">
          <Card>
            <CardHeader>
              <CardTitle>Search Journal Entries</CardTitle>
              <CardDescription>Filter journal entries by various criteria</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={searchParams.startDate}
                    onChange={(e) => setSearchParams({ ...searchParams, startDate: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={searchParams.endDate}
                    onChange={(e) => setSearchParams({ ...searchParams, endDate: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference</Label>
                  <Input
                    id="reference"
                    value={searchParams.reference}
                    onChange={(e) => setSearchParams({ ...searchParams, reference: e.target.value })}
                    placeholder="Journal ID or reference"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select 
                    value={searchParams.status || "all"}
                    onValueChange={(value) => setSearchParams({ ...searchParams, status: value === "all" ? "" : value })}
                  >
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="posted">Posted</SelectItem>
                      <SelectItem value="voided">Voided</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select 
                    value={searchParams.type || "all"}
                    onValueChange={(value) => setSearchParams({ ...searchParams, type: value === "all" ? "" : value })}
                  >
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {journalTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  className="mr-2"
                  onClick={() => setSearchParams({
                    startDate: "",
                    endDate: "",
                    reference: "",
                    status: "",
                    type: "",
                  })}
                >
                  Reset
                </Button>
                <Button onClick={() => searchJournalsMutation.mutate(searchParams)}>
                  Search
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Search Results</CardTitle>
              <CardDescription>Showing results based on your search criteria</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center p-8 text-neutral-dark">
                Use the search form above to find specific journal entries.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Create Tab */}
        <TabsContent value="create" className="space-y-4 py-4">
          <Card>
            <CardHeader>
              <CardTitle>Create New Journal Entry</CardTitle>
              <CardDescription>Enter the details for a new journal entry</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* Header Information */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <FormField
                      control={form.control}
                      name="reference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reference</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Invoice or document reference"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Optional external reference
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="transactionDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Transaction Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Journal Type</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select journal type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {journalTypes.map(type => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
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
                      name="fiscalYearId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fiscal Year</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            value={field.value?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select fiscal year" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {fiscalYears?.map(year => (
                                <SelectItem key={year.id} value={year.id.toString()}>
                                  {year.name} {year.isCurrent && "(Current)"}
                                </SelectItem>
                              )) || (
                                <SelectItem value="0">Loading...</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="fiscalPeriodId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fiscal Period</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            value={field.value?.toString()}
                            disabled={!selectedFiscalYearId || periodsLoading}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select fiscal period" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {fiscalPeriods?.map(period => (
                                <SelectItem key={period.id} value={period.id.toString()}>
                                  {period.name} {period.isCurrent && "(Current)"}
                                </SelectItem>
                              )) || (
                                <SelectItem value="0">
                                  {periodsLoading ? "Loading..." : "Select a fiscal year first"}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter a detailed description of this journal entry"
                            className="min-h-[80px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Journal Lines</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addJournalLine}
                      >
                        <span className="material-icons mr-2 text-sm">add</span>
                        Add Line
                      </Button>
                    </div>
                    
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Debit</TableHead>
                            <TableHead className="text-right">Credit</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fields.map((field, index) => (
                            <TableRow key={field.id}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>
                                <FormField
                                  control={form.control}
                                  name={`details.${index}.accountId`}
                                  render={({ field }) => (
                                    <FormItem className="mb-0">
                                      <FormControl>
                                        <Select
                                          onValueChange={(value) => field.onChange(parseInt(value))}
                                          value={field.value ? field.value.toString() : ""}
                                        >
                                          <SelectTrigger className="truncate w-full" id={`account-${index}`}>
                                            <SelectValue placeholder="Select account" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {accounts?.map(account => (
                                              <SelectItem key={account.id} value={account.id.toString()}>
                                                {account.accountNumber} - {account.name}
                                              </SelectItem>
                                            )) || (
                                              <SelectItem value="loading" disabled>Loading accounts...</SelectItem>
                                            )}
                                          </SelectContent>
                                        </Select>
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </TableCell>
                              <TableCell>
                                <FormField
                                  control={form.control}
                                  name={`details.${index}.description`}
                                  render={({ field }) => (
                                    <FormItem className="mb-0">
                                      <FormControl>
                                        <Input
                                          placeholder="Line description"
                                          {...field}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </TableCell>
                              <TableCell>
                                <FormField
                                  control={form.control}
                                  name={`details.${index}.debitAmount`}
                                  render={({ field }) => (
                                    <FormItem className="mb-0">
                                      <FormControl>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          placeholder="0.00"
                                          className="text-right"
                                          {...field}
                                          onChange={(e) => {
                                            field.onChange(e.target.value);
                                            // Clear credit if debit has value
                                            if (e.target.value && parseFloat(e.target.value) > 0) {
                                              form.setValue(`details.${index}.creditAmount`, "");
                                            }
                                          }}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </TableCell>
                              <TableCell>
                                <FormField
                                  control={form.control}
                                  name={`details.${index}.creditAmount`}
                                  render={({ field }) => (
                                    <FormItem className="mb-0">
                                      <FormControl>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          placeholder="0.00"
                                          className="text-right"
                                          {...field}
                                          onChange={(e) => {
                                            field.onChange(e.target.value);
                                            // Clear debit if credit has value
                                            if (e.target.value && parseFloat(e.target.value) > 0) {
                                              form.setValue(`details.${index}.debitAmount`, "");
                                            }
                                          }}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (fields.length > 2) {
                                      remove(index);
                                    } else {
                                      toast({
                                        title: "Cannot remove line",
                                        description: "At least two journal lines are required",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  <span className="material-icons text-sm">delete</span>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {/* Totals Row */}
                    <div className="flex justify-end space-x-4 pt-2">
                      <div className="text-right">
                        <span className="block text-sm text-neutral-dark">Total Debits</span>
                        <span className="block font-medium">${totals.debits.toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-sm text-neutral-dark">Total Credits</span>
                        <span className="block font-medium">${totals.credits.toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-sm text-neutral-dark">Difference</span>
                        <span className={`block font-medium ${totals.difference > 0 ? "text-red-500" : ""}`}>
                          ${totals.difference.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        form.reset();
                        setActiveTab("recent");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createJournalMutation.isPending}>
                      {createJournalMutation.isPending ? (
                        <>
                          <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                          Saving...
                        </>
                      ) : "Save Journal Entry"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* View Journal Entry Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Journal Entry Details</DialogTitle>
            <DialogDescription>
              {selectedJournal?.journalId || ""}
            </DialogDescription>
          </DialogHeader>
          
          {selectedJournal && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-neutral-dark">Reference</p>
                  <p className="font-medium">{selectedJournal.reference}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-neutral-dark">Status</p>
                  <Badge variant="outline" className={statusStyles[selectedJournal.status as keyof typeof statusStyles]}>
                    {selectedJournal.status.charAt(0).toUpperCase() + selectedJournal.status.slice(1)}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-neutral-dark">Transaction Date</p>
                  <p className="font-medium">{new Date(selectedJournal.transactionDate).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-neutral-dark">Posting Date</p>
                  <p className="font-medium">
                    {selectedJournal.postingDate 
                      ? new Date(selectedJournal.postingDate).toLocaleDateString()
                      : "Not Posted"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-neutral-dark">Type</p>
                  <p className="font-medium capitalize">{selectedJournal.type.replace('_', ' ')}</p>
                </div>
                <div className="space-y-1 md:col-span-3">
                  <p className="text-sm text-neutral-dark">Description</p>
                  <p>{selectedJournal.description}</p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h3 className="font-medium mb-2">Journal Details</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Show mock detail lines since real details might not be available */}
                      {(selectedJournal.details.length > 0 ? selectedJournal.details : [
                        {
                          id: 1,
                          journalEntryId: selectedJournal.id,
                          accountId: 1001,
                          account: {
                            id: 1001,
                            accountNumber: "1001",
                            name: "Office Supplies",
                            normalBalance: "debit",
                            balance: "5000.00",
                            description: null,
                            isActive: true
                          },
                          description: "Monthly office supplies",
                          debitAmount: "1250.00",
                          creditAmount: "",
                          memo: null,
                          lineNumber: 1
                        },
                        {
                          id: 2,
                          journalEntryId: selectedJournal.id,
                          accountId: 2001,
                          account: {
                            id: 2001,
                            accountNumber: "2001",
                            name: "Accounts Payable",
                            normalBalance: "credit",
                            balance: "12500.00",
                            description: null,
                            isActive: true
                          },
                          description: "Credit to vendor",
                          debitAmount: "",
                          creditAmount: "1250.00",
                          memo: null,
                          lineNumber: 2
                        }
                      ]).map((detail, index) => (
                        <TableRow key={index}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{detail.account?.accountNumber} - {detail.account?.name}</TableCell>
                          <TableCell>{detail.description}</TableCell>
                          <TableCell className="text-right">{detail.debitAmount ? `$${detail.debitAmount}` : ""}</TableCell>
                          <TableCell className="text-right">{detail.creditAmount ? `$${detail.creditAmount}` : ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              <div className="flex justify-between items-center border-t pt-4">
                <div>
                  <p className="text-sm text-neutral-dark">Created By</p>
                  <p className="font-medium">Admin User</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-neutral-dark">Created On</p>
                  <p className="font-medium">{new Date(selectedJournal.createdAt).toLocaleString()}</p>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button>
                  <span className="material-icons mr-2 text-sm">print</span>
                  Print Journal
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Create Journal Entry Dialog */}
      <Dialog open={isEntryDialogOpen} onOpenChange={setIsEntryDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create New Journal Entry</DialogTitle>
            <DialogDescription>
              Record a new financial transaction in the system
            </DialogDescription>
          </DialogHeader>
          
          <div className="text-center py-12">
            <div className="inline-flex rounded-full bg-orange-100 p-6 mb-4">
              <span className="material-icons text-orange-500 text-3xl">arrow_forward</span>
            </div>
            <h3 className="text-lg font-medium mb-2">Continue to the Create Tab</h3>
            <p className="text-neutral-dark mb-4">
              Please use the Create tab to enter journal details with multiple line items.
            </p>
            <Button onClick={() => {
              setIsEntryDialogOpen(false);
              setActiveTab("create");
            }}>
              Go to Create Tab
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}

export default JournalsPage;