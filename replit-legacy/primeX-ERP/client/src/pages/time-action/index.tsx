import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { motion } from "framer-motion";

// UI components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TimeActionCalendar from "./calendar-view";
import BatchUpdateMilestones from "./batch-update";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, ChevronDown, Calendar as CalendarIcon, Check, AlertTriangle, Clock, ClipboardCheck, Sparkles, CalendarRange, AlertCircle, ChevronRight, Eye, Edit, Trash2, CheckCircle2, CheckCheck, RotateCcw, BadgeAlert, Activity, PlusCircle, RefreshCw, X, Filter, Search, ArrowUpDown, MessageSquare, Download, Pencil } from "lucide-react";

// Define the schema for Time & Action Plans
const timeActionFormSchema = z.object({
  orderId: z.coerce.number(),
  name: z.string().min(3, { message: "Plan name must be at least 3 characters" }),
  description: z.string().optional(),
  startDate: z.date(),
  endDate: z.date(),
  fabricType: z.string(),
});

// Define the schema for milestones
const milestoneFormSchema = z.object({
  planId: z.coerce.number(),
  milestoneName: z.string().min(3, { message: "Milestone name must be at least 3 characters" }),
  description: z.string().optional(),
  plannedStartDate: z.date(),
  plannedEndDate: z.date(),
  status: z.string().default("pending"),
  responsiblePerson: z.string().optional(),
  department: z.string().optional(),
  priority: z.string().default("medium"),
  isCritical: z.boolean().default(false),
});

const statusColors = {
  pending: "bg-slate-100 text-slate-700",
  "in_progress": "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  delayed: "bg-amber-100 text-amber-700",
  "at_risk": "bg-red-100 text-red-700",
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24
    }
  }
};

// Industry standard milestones for garment manufacturing
const standardMilestones = {
  local: [
    { name: "Order Confirmation", days: 0, department: "Commercial", isCritical: true },
    { name: "Technical Specifications Review", days: 2, department: "Technical", isCritical: true },
    { name: "Sample Development", days: 5, department: "Design", isCritical: true },
    { name: "Sample Approval", days: 10, department: "Quality", isCritical: true },
    { name: "Lab Dip Submission", days: 15, department: "Dyeing", isCritical: true },
    { name: "Lab Dip Approval", days: 20, department: "Quality", isCritical: true },
    { name: "Accessories Sourcing", days: 15, department: "Procurement", isCritical: false },
    { name: "Accessories Approval", days: 25, department: "Quality", isCritical: false },
    { name: "Pre-Production Sample", days: 30, department: "Production", isCritical: true },
    { name: "Pre-Production Sample Approval", days: 35, department: "Quality", isCritical: true },
    { name: "Fabric Sourcing", days: 20, department: "Procurement", isCritical: true },
    { name: "Fabric Testing", days: 30, department: "Quality", isCritical: true },
    { name: "Fabric Approval", days: 35, department: "Quality", isCritical: true },
    { name: "Cutting Start", days: 40, department: "Production", isCritical: true },
    { name: "Printing/Embroidery (if any)", days: 45, department: "Production", isCritical: false },
    { name: "Sewing Start", days: 50, department: "Production", isCritical: true },
    { name: "Finishing Start", days: 60, department: "Production", isCritical: true },
    { name: "Final Inspection", days: 65, department: "Quality", isCritical: true },
    { name: "Packing Complete", days: 70, department: "Logistics", isCritical: true },
    { name: "Shipment Booking", days: 65, department: "Logistics", isCritical: true },
    { name: "Export Documentation", days: 70, department: "Logistics", isCritical: false },
    { name: "Cargo Handover", days: 72, department: "Logistics", isCritical: true },
    { name: "Vessel Departure", days: 75, department: "Logistics", isCritical: true },
  ],
  imported: [
    { name: "Order Confirmation", days: 0, department: "Commercial", isCritical: true },
    { name: "Technical Specifications Review", days: 2, department: "Technical", isCritical: true },
    { name: "Sample Development", days: 5, department: "Design", isCritical: true },
    { name: "Sample Approval", days: 10, department: "Quality", isCritical: true },
    { name: "Lab Dip Submission", days: 15, department: "Dyeing", isCritical: true },
    { name: "Lab Dip Approval", days: 20, department: "Quality", isCritical: true },
    { name: "Fabric Order Placement", days: 25, department: "Procurement", isCritical: true },
    { name: "Back-to-Back LC Opening", days: 30, department: "Finance", isCritical: true },
    { name: "Accessories Sourcing", days: 30, department: "Procurement", isCritical: false },
    { name: "Accessories Approval", days: 40, department: "Quality", isCritical: false },
    { name: "Yarn Receipt", days: 40, department: "Warehouse", isCritical: true },
    { name: "Knitting Start", days: 45, department: "Production", isCritical: true },
    { name: "Dyeing Start", days: 55, department: "Production", isCritical: true },
    { name: "Fabric Testing", days: 65, department: "Quality", isCritical: true },
    { name: "Fabric Approval", days: 70, department: "Quality", isCritical: true },
    { name: "Pre-Production Sample", days: 75, department: "Production", isCritical: true },
    { name: "Pre-Production Sample Approval", days: 80, department: "Quality", isCritical: true },
    { name: "Cutting Start", days: 85, department: "Production", isCritical: true },
    { name: "Printing/Embroidery (if any)", days: 90, department: "Production", isCritical: false },
    { name: "Sewing Start", days: 95, department: "Production", isCritical: true },
    { name: "Finishing Start", days: 105, department: "Production", isCritical: true },
    { name: "Final Inspection", days: 110, department: "Quality", isCritical: true },
    { name: "Packing Complete", days: 115, department: "Logistics", isCritical: true },
    { name: "Shipment Booking", days: 110, department: "Logistics", isCritical: true },
    { name: "Export Documentation", days: 115, department: "Logistics", isCritical: false },
    { name: "Cargo Handover", days: 117, department: "Logistics", isCritical: true },
    { name: "Vessel Departure", days: 120, department: "Logistics", isCritical: true },
  ]
};

export default function TimeActionPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("plans");
  const [viewTab, setViewTab] = useState("active");
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [showAddPlanDialog, setShowAddPlanDialog] = useState(false);
  const [showAddMilestoneDialog, setShowAddMilestoneDialog] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Form setup for creating a new Time and Action plan
  const planForm = useForm<z.infer<typeof timeActionFormSchema>>({
    resolver: zodResolver(timeActionFormSchema),
    defaultValues: {
      name: "",
      description: "",
      fabricType: "local",
    },
  });

  // Form setup for creating a new milestone
  const milestoneForm = useForm<z.infer<typeof milestoneFormSchema>>({
    resolver: zodResolver(milestoneFormSchema),
    defaultValues: {
      milestoneName: "",
      description: "",
      status: "pending",
      priority: "medium",
      isCritical: false,
    },
  });

  // Fetch all Time and Action plans
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["/api/time-action-plans"],
  });
  
  // Fetch milestones for the selected plan
  const { data: milestones, isLoading: milestonesLoading } = useQuery({
    queryKey: [`/api/time-action-milestones/${selectedPlan}`],
    enabled: !!selectedPlan,
  });

  // Fetch orders for the dropdown
  const { data: orders } = useQuery({
    queryKey: ["/api/orders"],
  })

  // Create a new Time and Action plan
  const createPlanMutation = useMutation({
    mutationFn: (data: z.infer<typeof timeActionFormSchema>) => {
      return apiRequest("/api/time-action-plans", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-action-plans"] });
      toast({
        title: "Success!",
        description: "Time & Action plan created successfully.",
      });
      setShowAddPlanDialog(false);
      planForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create Time & Action plan. Please try again.",
        variant: "destructive",
      });
      console.error("Error creating plan:", error);
    },
  });

  // Create a new milestone
  const createMilestoneMutation = useMutation({
    mutationFn: (data: z.infer<typeof milestoneFormSchema>) => {
      return apiRequest("/api/time-action-milestones", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/time-action-milestones/${selectedPlan}`] });
      toast({
        title: "Success!",
        description: "Milestone added successfully.",
      });
      setShowAddMilestoneDialog(false);
      milestoneForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add milestone. Please try again.",
        variant: "destructive",
      });
      console.error("Error adding milestone:", error);
    },
  });

  // Update milestone status
  const updateMilestoneMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => {
      return apiRequest(`/api/time-action-milestones/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/time-action-milestones/${selectedPlan}`] });
      toast({
        title: "Success!",
        description: "Milestone status updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update milestone status. Please try again.",
        variant: "destructive",
      });
      console.error("Error updating milestone:", error);
    },
  });

  // Generate standard milestones based on fabric type and dates
  const generateStandardMilestones = async (planId: number, fabricType: string, startDate: Date, endDate: Date) => {
    try {
      // First, fetch existing milestones to avoid duplicates
      const existingMilestones = await apiRequest(`/api/time-action-milestones/${planId}`, "GET");
      const existingNames = existingMilestones ? existingMilestones.map((m: any) => m.milestoneName) : [];
      
      const milestoneList = fabricType === 'local' ? standardMilestones.local : standardMilestones.imported;
      const totalDays = fabricType === 'local' ? 75 : 120;
      
      // Filter out milestones that already exist
      const newMilestones = milestoneList.filter(milestone => 
        !existingNames.includes(milestone.name)
      );
      
      if (newMilestones.length === 0) {
        toast({
          title: "No Action Needed",
          description: "All standard milestones already exist for this plan.",
        });
        return;
      }
      
      const createMilestoneTasks = newMilestones.map(milestone => {
        // Calculate dates based on the percentage of progress
        const daysDiff = Math.floor((milestone.days / totalDays) * (endDate.getTime() - startDate.getTime()));
        const plannedStartDate = new Date(startDate.getTime() + daysDiff);
        
        // End date is 1-5 days after start based on complexity
        const endOffset = milestone.isCritical ? 2 : 1;
        const plannedEndDate = new Date(plannedStartDate.getTime() + (endOffset * 24 * 60 * 60 * 1000));
        
        return apiRequest("/api/time-action-milestones", "POST", {
          planId,
          milestoneName: milestone.name,
          description: `Standard milestone: ${milestone.name}`,
          plannedStartDate,
          plannedEndDate,
          status: "pending",
          responsiblePerson: "",
          department: milestone.department,
          priority: milestone.isCritical ? "high" : "medium",
          isCritical: milestone.isCritical,
        });
      });
      
      if (createMilestoneTasks.length > 0) {
        await Promise.all(createMilestoneTasks);
        
        queryClient.invalidateQueries({ queryKey: [`/api/time-action-milestones/${planId}`] });
        toast({
          title: "Success!",
          description: `Generated ${createMilestoneTasks.length} new standard milestones for the plan.`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate standard milestones. Please try again.",
        variant: "destructive",
      });
      console.error("Error generating milestones:", error);
    }
  };

  // Handle plan form submission
  const onPlanSubmit = async (data: z.infer<typeof timeActionFormSchema>) => {
    // Calculate total days between start and end date
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Add totalDays to the data
    const planData = {
      ...data,
      totalDays,
    };
    
    try {
      const response = await createPlanMutation.mutateAsync(planData);
      const createdPlan = await response.json();
      
      // After creating the plan, generate standard milestones if the checkbox is checked
      if ((document.getElementById("generateMilestones") as HTMLInputElement)?.checked) {
        await generateStandardMilestones(createdPlan.id, data.fabricType, startDate, endDate);
      }
      
      setSelectedPlan(createdPlan.id);
    } catch (error) {
      console.error("Error in plan submission:", error);
    }
  };

  // Handle milestone form submission
  const onMilestoneSubmit = (data: z.infer<typeof milestoneFormSchema>) => {
    createMilestoneMutation.mutate(data);
  };

  // Update milestone form defaults when selected plan changes
  useEffect(() => {
    if (selectedPlan) {
      milestoneForm.setValue("planId", selectedPlan);
    }
  }, [selectedPlan, milestoneForm]);

  // Calculate the progress for a given plan
  const calculateProgress = (planId: number) => {
    if (!milestones) return 0;
    
    const planMilestones = milestones.filter((m: any) => m.planId === planId);
    if (planMilestones.length === 0) return 0;
    
    const completedCount = planMilestones.filter((m: any) => m.status === "completed").length;
    return Math.round((completedCount / planMilestones.length) * 100);
  };

  // Helper function to format dates
  const formatDate = (date: string) => {
    try {
      return format(new Date(date), "MMM dd, yyyy");
    } catch (e) {
      return "Invalid date";
    }
  };

  // Function to get the status badge color
  const getStatusColor = (status: string) => {
    return statusColors[status as keyof typeof statusColors] || "bg-slate-100 text-slate-700";
  };

  // Filter milestones based on status and search term
  const filteredMilestones = milestones ? milestones.filter((milestone: any) => {
    const matchesStatus = filterStatus === "all" || milestone.status === filterStatus;
    const matchesSearch = 
      searchTerm === "" || 
      milestone.milestoneName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (milestone.description && milestone.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesSearch;
  }) : [];

  return (
    <div className="container mx-auto p-6">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Time & Action Plan</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track the production timeline from order to delivery
          </p>
        </div>
        <Button onClick={() => setShowAddPlanDialog(true)} className="flex items-center gap-2">
          <PlusCircle size={16} />
          Create New Plan
        </Button>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="active">Active Plans</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="all">All Plans</TabsTrigger>
        </TabsList>

        {plansLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <TabsContent value={activeTab} className="space-y-4">
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            >
              {plans && plans
                .filter((plan: any) => {
                  if (activeTab === "active") return plan.status === "active";
                  if (activeTab === "completed") return plan.status === "completed";
                  return true; // "all" tab
                })
                .map((plan: any) => (
                  <motion.div key={plan.id} variants={itemVariants}>
                    <Card 
                      className={`overflow-hidden transition-all duration-300 hover:shadow-md ${selectedPlan === plan.id ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setSelectedPlan(plan.id)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-xl">{plan.name}</CardTitle>
                          <Badge variant={plan.status === "active" ? "default" : "secondary"}>
                            {plan.status === "active" ? "Active" : "Completed"}
                          </Badge>
                        </div>
                        <CardDescription>
                          Order #{plan.orderId} • {plan.totalDays} days lead time
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pb-3">
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <CalendarIcon size={14} />
                              Start:
                            </span>
                            <span className="font-medium">{formatDate(plan.startDate)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <CalendarRange size={14} />
                              Delivery:
                            </span>
                            <span className="font-medium">{formatDate(plan.endDate)}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium">{calculateProgress(plan.id)}%</span>
                            </div>
                            <Progress value={calculateProgress(plan.id)} className="h-2" />
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <Button variant="secondary" size="sm" className="w-full" onClick={() => setSelectedPlan(plan.id)}>
                          <Eye size={14} className="mr-1" /> View Details
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
            </motion.div>

            {plans && plans.length === 0 && (
              <Card className="w-full bg-muted/50">
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <CalendarRange size={48} className="text-muted-foreground mb-3" />
                  <h3 className="text-xl font-semibold">No plans found</h3>
                  <p className="text-muted-foreground text-center mt-1">
                    Start by creating a new Time & Action plan to track your production timeline.
                  </p>
                  <Button onClick={() => setShowAddPlanDialog(true)} className="mt-4">
                    Create First Plan
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      {selectedPlan && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedPlan(null)}>
                <ChevronRight size={16} className="rotate-180 mr-1" /> Back to Plans
              </Button>
              <h2 className="text-2xl font-bold">
                {plans?.find((p: any) => p.id === selectedPlan)?.name}
              </h2>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddMilestoneDialog(true)}
              >
                <PlusCircle size={14} className="mr-1" /> Add Milestone
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter size={14} className="mr-1" /> Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFilterStatus("all")}>
                    All
                    {filterStatus === "all" && <Check size={14} className="ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("pending")}>
                    Pending
                    {filterStatus === "pending" && <Check size={14} className="ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("in_progress")}>
                    In Progress
                    {filterStatus === "in_progress" && <Check size={14} className="ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("completed")}>
                    Completed
                    {filterStatus === "completed" && <Check size={14} className="ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("delayed")}>
                    Delayed
                    {filterStatus === "delayed" && <Check size={14} className="ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("at_risk")}>
                    At Risk
                    {filterStatus === "at_risk" && <Check size={14} className="ml-auto" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="relative">
                <Search size={14} className="absolute left-2 top-2.5 text-muted-foreground" />
                <Input 
                  placeholder="Search milestones..." 
                  className="max-w-[200px] pl-7"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {milestonesLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {filteredMilestones.length > 0 ? (
                <Card>
                  <CardContent className="p-0 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[300px]">Milestone</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>
                            <div className="flex items-center">
                              Planned Dates <ArrowUpDown size={14} className="ml-1" />
                            </div>
                          </TableHead>
                          <TableHead>Actual Dates</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMilestones.map((milestone: any, index: number) => (
                          <motion.tr 
                            key={milestone.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                            className={`border-b ${milestone.isCritical ? 'bg-red-50/50' : ''}`}
                          >
                            <TableCell className="font-medium">
                              <div className="flex flex-col">
                                <span className="flex items-center">
                                  {milestone.isCritical && (
                                    <BadgeAlert size={14} className="text-red-500 mr-1" />
                                  )}
                                  {milestone.milestoneName}
                                </span>
                                {milestone.description && (
                                  <span className="text-xs text-muted-foreground mt-1">
                                    {milestone.description}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{milestone.department || "—"}</TableCell>
                            <TableCell>
                              <div className="flex flex-col text-sm">
                                <span className="text-muted-foreground">Start: {formatDate(milestone.plannedStartDate)}</span>
                                <span className="text-muted-foreground">End: {formatDate(milestone.plannedEndDate)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col text-sm">
                                <span>{milestone.actualStartDate ? formatDate(milestone.actualStartDate) : "—"}</span>
                                <span>{milestone.actualEndDate ? formatDate(milestone.actualEndDate) : "—"}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(milestone.status)}>
                                {milestone.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`
                                  ${milestone.priority === "high" ? "border-red-200 text-red-700" : ""}
                                  ${milestone.priority === "medium" ? "border-amber-200 text-amber-700" : ""}
                                  ${milestone.priority === "low" ? "border-green-200 text-green-700" : ""}
                                `}
                              >
                                {milestone.priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-1">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <Activity size={14} />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Update Status</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => 
                                      updateMilestoneMutation.mutate({ 
                                        id: milestone.id, 
                                        data: { 
                                          status: "pending",
                                          actualStartDate: null,
                                          actualEndDate: null
                                        } 
                                      })
                                    }>
                                      <Clock size={14} className="mr-2" /> Mark as Pending
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => 
                                      updateMilestoneMutation.mutate({ 
                                        id: milestone.id, 
                                        data: { 
                                          status: "in_progress",
                                          actualStartDate: new Date()
                                        } 
                                      })
                                    }>
                                      <RefreshCw size={14} className="mr-2" /> Start Progress
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => 
                                      updateMilestoneMutation.mutate({ 
                                        id: milestone.id, 
                                        data: { 
                                          status: "completed",
                                          actualEndDate: new Date()
                                        } 
                                      })
                                    }>
                                      <CheckCheck size={14} className="mr-2" /> Mark Complete
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => 
                                      updateMilestoneMutation.mutate({ 
                                        id: milestone.id, 
                                        data: { status: "delayed" } 
                                      })
                                    }>
                                      <AlertTriangle size={14} className="mr-2" /> Mark Delayed
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => 
                                      updateMilestoneMutation.mutate({ 
                                        id: milestone.id, 
                                        data: { status: "at_risk" } 
                                      })
                                    }>
                                      <AlertCircle size={14} className="mr-2" /> Mark At Risk
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button variant="ghost" size="sm">
                                  <MessageSquare size={14} />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Pencil size={14} />
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                  <CardFooter className="flex justify-between py-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {filteredMilestones.length} of {milestones?.length || 0} milestones
                    </div>
                    <Button variant="outline" size="sm">
                      <Download size={14} className="mr-1" /> Export Plan
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Card className="w-full bg-muted/50">
                  <CardContent className="flex flex-col items-center justify-center p-6">
                    <Clock size={48} className="text-muted-foreground mb-3" />
                    <h3 className="text-xl font-semibold">No milestones found</h3>
                    <p className="text-muted-foreground text-center mt-1">
                      {searchTerm || filterStatus !== "all" 
                        ? "No milestones match your filter criteria." 
                        : "This plan doesn't have any milestones yet."}
                    </p>
                    <div className="flex gap-2 mt-4">
                      {searchTerm || filterStatus !== "all" ? (
                        <Button variant="outline" onClick={() => {
                          setSearchTerm("");
                          setFilterStatus("all");
                        }}>
                          <X size={14} className="mr-1" /> Clear Filters
                        </Button>
                      ) : (
                        <>
                          <Button onClick={() => setShowAddMilestoneDialog(true)}>
                            Add Milestone
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              const plan = plans?.find((p: any) => p.id === selectedPlan);
                              if (plan) {
                                generateStandardMilestones(
                                  plan.id, 
                                  plan.fabricType || 'local', 
                                  new Date(plan.startDate), 
                                  new Date(plan.endDate)
                                );
                              }
                            }}
                          >
                            <Sparkles size={14} className="mr-1" /> Generate Standard Milestones
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Milestone Insights Card */}
              {filteredMilestones.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center">
                        <Activity size={18} className="mr-2 text-primary" />
                        Status Overview
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {["completed", "in_progress", "pending", "delayed", "at_risk"].map((status) => {
                          const count = milestones?.filter((m: any) => m.status === status).length || 0;
                          const total = milestones?.length || 1;
                          const percentage = Math.round((count / total) * 100);
                          
                          return (
                            <div key={status} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="capitalize">{status.replace("_", " ")}</span>
                                <span>{count} ({percentage}%)</span>
                              </div>
                              <Progress value={percentage} className={`h-2 ${
                                status === "completed" ? "bg-green-100" : 
                                status === "in_progress" ? "bg-blue-100" : 
                                status === "pending" ? "bg-slate-100" :
                                status === "delayed" ? "bg-amber-100" : "bg-red-100"
                              }`} />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center">
                        <AlertCircle size={18} className="mr-2 text-amber-500" />
                        At-Risk Milestones
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[180px]">
                        {milestones?.filter((m: any) => m.status === "at_risk" || m.status === "delayed").length ? (
                          <div className="space-y-3">
                            {milestones
                              .filter((m: any) => m.status === "at_risk" || m.status === "delayed")
                              .map((milestone: any) => (
                                <div key={milestone.id} className="flex items-start gap-2 pb-2 border-b">
                                  <div className={milestone.status === "at_risk" ? "text-red-500" : "text-amber-500"}>
                                    {milestone.status === "at_risk" ? <AlertCircle size={16} /> : <AlertTriangle size={16} />}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">{milestone.milestoneName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Due: {formatDate(milestone.plannedEndDate)}
                                    </p>
                                  </div>
                                </div>
                              ))
                            }
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-center">
                            <CheckCircle2 size={24} className="text-green-500 mb-2" />
                            <p className="text-sm font-medium">No at-risk milestones</p>
                            <p className="text-xs text-muted-foreground">All milestones are on track</p>
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center">
                        <Sparkles size={18} className="mr-2 text-primary" />
                        AI Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[180px]">
                        <div className="space-y-3">
                          <Alert className="bg-blue-50 border-blue-200">
                            <AlertCircle className="h-4 w-4 text-blue-600" />
                            <AlertTitle className="text-blue-600 text-sm font-medium">Bottleneck Detected</AlertTitle>
                            <AlertDescription className="text-xs text-blue-600">
                              Fabric approval is taking longer than usual. Consider following up with the quality department.
                            </AlertDescription>
                          </Alert>
                          
                          <Alert className="bg-green-50 border-green-200">
                            <Check className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-600 text-sm font-medium">Ahead of Schedule</AlertTitle>
                            <AlertDescription className="text-xs text-green-600">
                              Production is 2 days ahead of schedule. Consider adjusting subsequent milestones.
                            </AlertDescription>
                          </Alert>
                          
                          <Alert className="bg-amber-50 border-amber-200">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <AlertTitle className="text-amber-600 text-sm font-medium">Risk Prediction</AlertTitle>
                            <AlertDescription className="text-xs text-amber-600">
                              Based on current progress, final inspection may be delayed. Consider allocating additional resources.
                            </AlertDescription>
                          </Alert>
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}

      {/* Dialog for creating a new Time and Action plan */}
      <Dialog open={showAddPlanDialog} onOpenChange={setShowAddPlanDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Time & Action Plan</DialogTitle>
            <DialogDescription>
              Set up a new production timeline to track the manufacturing process from order to delivery.
            </DialogDescription>
          </DialogHeader>
          <Form {...planForm}>
            <form onSubmit={planForm.handleSubmit(onPlanSubmit)} className="space-y-4">
              <FormField
                control={planForm.control}
                name="orderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an order" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(orders) && orders.map((order: any) => (
                          <SelectItem key={order.id} value={order.id.toString()}>
                            {order.orderId} - {order.customerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={planForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Summer Collection Production" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={planForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Brief description of the production plan"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={planForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
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
                <FormField
                  control={planForm.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Delivery Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
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
              </div>
              <FormField
                control={planForm.control}
                name="fabricType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fabric Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select fabric type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="local">Local Fabric (75 days lead time)</SelectItem>
                        <SelectItem value="imported">Imported Fabric (120 days lead time)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center space-x-2">
                <Checkbox id="generateMilestones" />
                <label
                  htmlFor="generateMilestones"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Auto-generate standard milestones based on fabric type
                </label>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddPlanDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createPlanMutation.isPending}>
                  {createPlanMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Plan
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog for adding a new milestone */}
      <Dialog open={showAddMilestoneDialog} onOpenChange={setShowAddMilestoneDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Milestone</DialogTitle>
            <DialogDescription>
              Add a new milestone to track a specific step in the production process.
            </DialogDescription>
          </DialogHeader>
          <Form {...milestoneForm}>
            <form onSubmit={milestoneForm.handleSubmit(onMilestoneSubmit)} className="space-y-4">
              <FormField
                control={milestoneForm.control}
                name="milestoneName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Milestone Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Fabric Approval" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={milestoneForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Brief description of this milestone"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={milestoneForm.control}
                  name="plannedStartDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Planned Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
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
                <FormField
                  control={milestoneForm.control}
                  name="plannedEndDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Planned End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={milestoneForm.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Commercial">Commercial</SelectItem>
                          <SelectItem value="Design">Design</SelectItem>
                          <SelectItem value="Technical">Technical</SelectItem>
                          <SelectItem value="Procurement">Procurement</SelectItem>
                          <SelectItem value="Finance">Finance</SelectItem>
                          <SelectItem value="Production">Production</SelectItem>
                          <SelectItem value="Quality">Quality</SelectItem>
                          <SelectItem value="Logistics">Logistics</SelectItem>
                          <SelectItem value="Warehouse">Warehouse</SelectItem>
                          <SelectItem value="Dyeing">Dyeing</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={milestoneForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={milestoneForm.control}
                name="isCritical"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Critical Milestone</FormLabel>
                      <FormDescription>
                        Mark as critical if this milestone affects the entire production timeline
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddMilestoneDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMilestoneMutation.isPending}>
                  {createMilestoneMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add Milestone
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}