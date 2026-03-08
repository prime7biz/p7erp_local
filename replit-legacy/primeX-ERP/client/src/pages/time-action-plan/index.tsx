import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Plus, Calendar, CheckCircle, Clock, AlertTriangle, Trash2, Edit, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import Spinner from "@/components/ui/spinner";
import { format, parseISO, differenceInDays, addDays, isAfter, formatDistance } from "date-fns";

// Interfaces for our data models
interface TimeActionPlan {
  id: number;
  orderId: number;
  tenantId: number;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

interface TimeActionMilestone {
  id: number;
  planId: number;
  tenantId: number;
  milestoneName: string;
  description: string | null;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  status: string;
  responsiblePerson: string | null;
  department: string | null;
  comments: string | null;
  dependencies: string[] | null;
  priority: string;
  isCritical: boolean;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Order {
  id: number;
  orderId: string;
  styleName: string;
  quantity: number;
  customer: {
    id: number;
    name: string;
  };
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-200 text-gray-800",
  in_progress: "bg-blue-200 text-blue-800",
  completed: "bg-green-200 text-green-800",
  delayed: "bg-yellow-200 text-yellow-800",
  at_risk: "bg-red-200 text-red-800",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-200 text-red-800",
  medium: "bg-yellow-200 text-yellow-800",
  low: "bg-green-200 text-green-800",
};

export default function TimeActionPlanPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ orderId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMilestone, setSelectedMilestone] = useState<TimeActionMilestone | null>(null);
  const [isCreateMilestoneOpen, setIsCreateMilestoneOpen] = useState(false);
  const [isCreatePlanOpen, setIsCreatePlanOpen] = useState(false);
  const [isEditMilestoneOpen, setIsEditMilestoneOpen] = useState(false);
  const [isGenerateWithAIOpen, setIsGenerateWithAIOpen] = useState(false);
  const [tab, setTab] = useState("timeline");
  const orderId = params?.orderId ? parseInt(params.orderId) : undefined;

  // Fetch order details
  const { data: order, isLoading: isLoadingOrder } = useQuery<Order>({
    queryKey: ['/api/orders', orderId],
    enabled: !!orderId,
  });

  // Fetch time action plan
  const { 
    data: plan, 
    isLoading: isLoadingPlan,
    isError: isPlanError,
    error: planError 
  } = useQuery<TimeActionPlan>({
    queryKey: [`/api/orders/${orderId}/time-action-plan`],
    enabled: !!orderId,
  });

  // Fetch milestones for the time action plan
  const { 
    data: milestones = [], 
    isLoading: isLoadingMilestones 
  } = useQuery<TimeActionMilestone[]>({
    queryKey: ['/api/time-action-plans', plan?.id, 'milestones'],
    enabled: !!plan?.id,
  });

  // Form state for creating a time action plan
  const [planFormData, setPlanFormData] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
  });

  // Form state for creating/editing a milestone
  const [milestoneFormData, setMilestoneFormData] = useState({
    milestoneName: "",
    description: "",
    plannedStartDate: "",
    plannedEndDate: "",
    responsiblePerson: "",
    department: "",
    priority: "medium",
    isCritical: false,
  });

  // Reset milestone form when modal opens
  useEffect(() => {
    if (isCreateMilestoneOpen) {
      setMilestoneFormData({
        milestoneName: "",
        description: "",
        plannedStartDate: plan?.startDate || "",
        plannedEndDate: "",
        responsiblePerson: "",
        department: "",
        priority: "medium",
        isCritical: false,
      });
    }
  }, [isCreateMilestoneOpen, plan]);

  // Set milestone form data when editing
  useEffect(() => {
    if (selectedMilestone && isEditMilestoneOpen) {
      setMilestoneFormData({
        milestoneName: selectedMilestone.milestoneName,
        description: selectedMilestone.description || "",
        plannedStartDate: selectedMilestone.plannedStartDate,
        plannedEndDate: selectedMilestone.plannedEndDate,
        responsiblePerson: selectedMilestone.responsiblePerson || "",
        department: selectedMilestone.department || "",
        priority: selectedMilestone.priority,
        isCritical: selectedMilestone.isCritical,
      });
    }
  }, [selectedMilestone, isEditMilestoneOpen]);

  // Mutation to create a time action plan
  const createPlanMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest(`/api/orders/${orderId}/time-action-plan`, { method: "POST", data }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Time & Action Plan created successfully.",
      });
      setIsCreatePlanOpen(false);
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/time-action-plan`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to create Time & Action Plan: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to create a milestone
  const createMilestoneMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest(`/api/time-action-plans/${plan?.id}/milestones`, { method: "POST", data }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Milestone created successfully.",
      });
      setIsCreateMilestoneOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/time-action-plans', plan?.id, 'milestones'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to create milestone: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to update a milestone
  const updateMilestoneMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      apiRequest(`/api/time-action-milestones/${id}`, { method: "PATCH", data }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Milestone updated successfully.",
      });
      setIsEditMilestoneOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/time-action-plans', plan?.id, 'milestones'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to update milestone: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to update a milestone status
  const updateMilestoneStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => 
      apiRequest(`/api/time-action-milestones/${id}`, { 
        method: "PATCH", 
        data: { 
          status,
          ...(status === 'in_progress' && { actualStartDate: new Date().toISOString().split('T')[0] }),
          ...(status === 'completed' && { actualEndDate: new Date().toISOString().split('T')[0] })
        } 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-action-plans', plan?.id, 'milestones'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to update milestone status: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a milestone
  const deleteMilestoneMutation = useMutation({
    mutationFn: (id: number) => 
      apiRequest(`/api/time-action-milestones/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Milestone deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/time-action-plans', plan?.id, 'milestones'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to delete milestone: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to generate AI-recommended milestones
  const generateAIRecommendationsMutation = useMutation({
    mutationFn: () => 
      apiRequest(`/api/time-action-plans/${orderId}/ai-recommend`, { method: "POST" }),
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "AI recommendations generated successfully.",
      });
      setIsGenerateWithAIOpen(false);
      
      // If we don't have a plan yet, let's create one first with AI suggestions
      if (!plan) {
        const deliveryDate = data.recommendations.length > 0 
          ? data.recommendations[data.recommendations.length - 1].plannedEndDate
          : addDays(new Date(), data.metadata.leadTimeEstimate).toISOString().split('T')[0];
          
        const startDate = data.recommendations.length > 0
          ? data.recommendations[0].plannedStartDate
          : new Date().toISOString().split('T')[0];
          
        createPlanMutation.mutate({
          name: `Production Plan for ${order?.styleName}`,
          description: `AI-generated plan with complexity: ${data.metadata.productAnalysis.complexity}, estimated lead time: ${data.metadata.leadTimeEstimate} days`,
          startDate,
          endDate: deliveryDate,
          totalDays: data.metadata.leadTimeEstimate,
        });
      } else {
        // Create the milestones from AI recommendations
        data.recommendations.forEach((milestone: any) => {
          createMilestoneMutation.mutate({
            milestoneName: milestone.milestoneName,
            description: milestone.description,
            plannedStartDate: milestone.plannedStartDate,
            plannedEndDate: milestone.plannedEndDate,
            responsiblePerson: "",
            department: milestone.department,
            priority: milestone.priority,
            isCritical: milestone.isCritical,
            status: "pending",
          });
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to generate AI recommendations: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    const startDateObj = new Date(planFormData.startDate);
    const endDateObj = new Date(planFormData.endDate);
    const totalDays = differenceInDays(endDateObj, startDateObj) + 1;
    
    createPlanMutation.mutate({
      ...planFormData,
      totalDays,
    });
  };

  const handleCreateMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    createMilestoneMutation.mutate({
      ...milestoneFormData,
      status: "pending",
    });
  };

  const handleUpdateMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMilestone) {
      updateMilestoneMutation.mutate({
        id: selectedMilestone.id,
        data: milestoneFormData,
      });
    }
  };

  const handleDeleteMilestone = (id: number) => {
    if (confirm("Are you sure you want to delete this milestone?")) {
      deleteMilestoneMutation.mutate(id);
    }
  };

  const calculateProgress = () => {
    if (!milestones || milestones.length === 0) return 0;
    const completedCount = milestones.filter(m => m.status === "completed").length;
    return Math.round((completedCount / milestones.length) * 100);
  };

  const getDelayedMilestones = () => {
    const today = new Date();
    return milestones.filter(m => 
      (m.status !== "completed" && isAfter(today, parseISO(m.plannedEndDate)))
    );
  };

  const getUpcomingMilestones = () => {
    const today = new Date();
    const in7Days = addDays(today, 7);
    return milestones.filter(m => 
      (m.status !== "completed" && 
       !isAfter(today, parseISO(m.plannedEndDate)) && 
       isAfter(in7Days, parseISO(m.plannedStartDate)))
    ).sort((a, b) => 
      parseISO(a.plannedStartDate).getTime() - parseISO(b.plannedStartDate).getTime()
    );
  };

  if (isLoadingOrder || isLoadingPlan) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-[500px]">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Time & Action Plan</h1>
            {order && (
              <p className="text-gray-500">
                Order: {order.orderId} | Style: {order.styleName} | Quantity: {order.quantity}
              </p>
            )}
          </div>
          
          <div className="flex gap-2">
            {!plan && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsGenerateWithAIOpen(true)}
                  className="gap-1"
                >
                  <Zap className="h-4 w-4" />
                  Generate with AI
                </Button>
                <Button onClick={() => setIsCreatePlanOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Create Plan
                </Button>
              </>
            )}
            {plan && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsGenerateWithAIOpen(true)}
                  className="gap-1"
                >
                  <Zap className="h-4 w-4" />
                  AI Recommendations
                </Button>
                <Button onClick={() => setIsCreateMilestoneOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Milestone
                </Button>
              </>
            )}
          </div>
        </div>

        {!plan && !isPlanError && (
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">No Time & Action Plan Found</h2>
            <p className="text-gray-500 mb-4">
              Create a new Time & Action Plan for this order to track production milestones and deadlines.
            </p>
            <div className="flex justify-center gap-4">
              <Button
                variant="outline"
                onClick={() => setIsGenerateWithAIOpen(true)}
                className="gap-1"
              >
                <Zap className="h-4 w-4" />
                Generate with AI
              </Button>
              <Button onClick={() => setIsCreatePlanOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create Plan Manually
              </Button>
            </div>
          </Card>
        )}

        {isPlanError && (
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2 text-red-600">Error Loading Time & Action Plan</h2>
            <p className="text-gray-500 mb-4">
              {(planError as any)?.message || "There was an error loading the Time & Action Plan."}
            </p>
            <Button onClick={() => setIsCreatePlanOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create New Plan
            </Button>
          </Card>
        )}

        {plan && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card className="p-5">
                <h3 className="font-medium mb-2 text-gray-500">Plan Progress</h3>
                <div className="flex flex-col">
                  <div className="mb-2">
                    <Progress value={calculateProgress()} className="h-2" />
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="font-semibold">{calculateProgress()}% Complete</span>
                    <span>{milestones?.filter(m => m.status === "completed").length} / {milestones?.length} Milestones</span>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-medium mb-2 text-gray-500">Timeline</h3>
                <div className="flex flex-col">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm">
                      Start: <span className="font-semibold">{format(parseISO(plan.startDate), "MMM d, yyyy")}</span>
                    </span>
                  </div>
                  <div className="flex items-center mt-2">
                    <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm">
                      End: <span className="font-semibold">{format(parseISO(plan.endDate), "MMM d, yyyy")}</span>
                    </span>
                  </div>
                  <div className="flex items-center mt-2">
                    <Clock className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm">
                      Duration: <span className="font-semibold">{plan.totalDays} days</span>
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-medium mb-2 text-gray-500">Status</h3>
                <div className="flex flex-col">
                  <div className="flex items-center">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mr-2" />
                    <span className="text-sm">
                      Delayed: <span className="font-semibold">{getDelayedMilestones().length} Milestones</span>
                    </span>
                  </div>
                  <div className="flex items-center mt-2">
                    <Clock className="h-4 w-4 text-blue-500 mr-2" />
                    <span className="text-sm">
                      Upcoming: <span className="font-semibold">{getUpcomingMilestones().length} in 7 days</span>
                    </span>
                  </div>
                  <div className="flex items-center mt-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm">
                      Plan Status: <span className="font-semibold capitalize">{plan.status}</span>
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            <Tabs defaultValue="timeline" className="mb-6" onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="list">List View</TabsTrigger>
                <TabsTrigger value="delayed">Delayed Milestones</TabsTrigger>
                <TabsTrigger value="upcoming">Upcoming Milestones</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="mt-4">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Timeline View</h3>
                  {isLoadingMilestones ? (
                    <div className="flex justify-center p-8">
                      <Spinner />
                    </div>
                  ) : milestones.length === 0 ? (
                    <div className="text-center p-8">
                      <p className="text-gray-500 mb-4">No milestones found. Add milestones to track progress.</p>
                      <Button onClick={() => setIsCreateMilestoneOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Add First Milestone
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {milestones
                        .sort((a, b) => new Date(a.plannedStartDate).getTime() - new Date(b.plannedStartDate).getTime())
                        .map((milestone) => {
                          const startDate = parseISO(milestone.plannedStartDate);
                          const endDate = parseISO(milestone.plannedEndDate);
                          const duration = differenceInDays(endDate, startDate) + 1;
                          const now = new Date();
                          const isDelayed = milestone.status !== "completed" && isAfter(now, endDate);
                          
                          return (
                            <div 
                              key={milestone.id} 
                              className={`border rounded-md p-4 ${milestone.isCritical ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h4 className="font-semibold flex items-center">
                                    {milestone.milestoneName}
                                    {milestone.isCritical && (
                                      <Badge variant="outline" className="ml-2 text-red-600 border-red-300">
                                        Critical Path
                                      </Badge>
                                    )}
                                  </h4>
                                  <p className="text-sm text-gray-500">{milestone.description}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Badge className={priorityColors[milestone.priority]}>
                                    {milestone.priority.charAt(0).toUpperCase() + milestone.priority.slice(1)}
                                  </Badge>
                                  <Badge className={statusColors[milestone.status]}>
                                    {milestone.status.replace('_', ' ').split(' ').map(word => 
                                      word.charAt(0).toUpperCase() + word.slice(1)
                                    ).join(' ')}
                                  </Badge>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-sm">
                                <div>
                                  <span className="text-gray-500 block">Planned Start</span>
                                  <span>{format(startDate, "MMM d, yyyy")}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block">Planned End</span>
                                  <span>{format(endDate, "MMM d, yyyy")}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block">Duration</span>
                                  <span>{duration} days</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block">Department</span>
                                  <span>{milestone.department || "Not assigned"}</span>
                                </div>
                              </div>
                              
                              {isDelayed && (
                                <div className="text-red-600 text-sm mb-3 flex items-center">
                                  <AlertTriangle className="h-4 w-4 mr-1" />
                                  Delayed by {differenceInDays(now, endDate)} days
                                </div>
                              )}
                              
                              <div className="flex justify-between items-center">
                                <div className="flex gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => {
                                      setSelectedMilestone(milestone);
                                      setIsEditMilestoneOpen(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4 mr-1" /> Edit
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => handleDeleteMilestone(milestone.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                                  </Button>
                                </div>
                                
                                <div className="flex gap-2">
                                  {milestone.status === "pending" && (
                                    <Button 
                                      size="sm"
                                      onClick={() => updateMilestoneStatusMutation.mutate({
                                        id: milestone.id,
                                        status: "in_progress"
                                      })}
                                    >
                                      Start
                                    </Button>
                                  )}
                                  
                                  {milestone.status === "in_progress" && (
                                    <Button 
                                      size="sm"
                                      variant="default"
                                      onClick={() => updateMilestoneStatusMutation.mutate({
                                        id: milestone.id,
                                        status: "completed"
                                      })}
                                    >
                                      Complete
                                    </Button>
                                  )}
                                  
                                  {milestone.status === "delayed" && (
                                    <Button 
                                      size="sm"
                                      variant="default"
                                      onClick={() => updateMilestoneStatusMutation.mutate({
                                        id: milestone.id,
                                        status: "in_progress"
                                      })}
                                    >
                                      Resume
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="list" className="mt-4">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Milestones</h3>
                  {isLoadingMilestones ? (
                    <div className="flex justify-center p-8">
                      <Spinner />
                    </div>
                  ) : milestones.length === 0 ? (
                    <div className="text-center p-8">
                      <p className="text-gray-500 mb-4">No milestones found. Add milestones to track progress.</p>
                      <Button onClick={() => setIsCreateMilestoneOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Add First Milestone
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Milestone</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Planned Start</TableHead>
                          <TableHead>Planned End</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {milestones
                          .sort((a, b) => new Date(a.plannedStartDate).getTime() - new Date(b.plannedStartDate).getTime())
                          .map((milestone) => (
                            <TableRow key={milestone.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center">
                                  {milestone.milestoneName}
                                  {milestone.isCritical && (
                                    <Badge variant="outline" className="ml-2 text-red-600 border-red-300">
                                      Critical
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{milestone.department || "-"}</TableCell>
                              <TableCell>{format(parseISO(milestone.plannedStartDate), "MMM d, yyyy")}</TableCell>
                              <TableCell>{format(parseISO(milestone.plannedEndDate), "MMM d, yyyy")}</TableCell>
                              <TableCell>
                                <Badge className={statusColors[milestone.status]}>
                                  {milestone.status.replace('_', ' ').split(' ').map(word => 
                                    word.charAt(0).toUpperCase() + word.slice(1)
                                  ).join(' ')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={priorityColors[milestone.priority]}>
                                  {milestone.priority.charAt(0).toUpperCase() + milestone.priority.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                      setSelectedMilestone(milestone);
                                      setIsEditMilestoneOpen(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => handleDeleteMilestone(milestone.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="delayed" className="mt-4">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Delayed Milestones</h3>
                  {isLoadingMilestones ? (
                    <div className="flex justify-center p-8">
                      <Spinner />
                    </div>
                  ) : getDelayedMilestones().length === 0 ? (
                    <div className="text-center p-8">
                      <p className="text-gray-500">No delayed milestones found. Great job!</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Milestone</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Planned End</TableHead>
                          <TableHead>Delay</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getDelayedMilestones().map((milestone) => {
                          const endDate = parseISO(milestone.plannedEndDate);
                          const now = new Date();
                          const delayDays = differenceInDays(now, endDate);
                          
                          return (
                            <TableRow key={milestone.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center">
                                  {milestone.milestoneName}
                                  {milestone.isCritical && (
                                    <Badge variant="outline" className="ml-2 text-red-600 border-red-300">
                                      Critical
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{milestone.department || "-"}</TableCell>
                              <TableCell>{format(endDate, "MMM d, yyyy")}</TableCell>
                              <TableCell className="text-red-600">
                                {delayDays} {delayDays === 1 ? "day" : "days"}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  {milestone.status !== "in_progress" && (
                                    <Button 
                                      size="sm"
                                      onClick={() => updateMilestoneStatusMutation.mutate({
                                        id: milestone.id,
                                        status: "in_progress"
                                      })}
                                    >
                                      Start
                                    </Button>
                                  )}
                                  
                                  {milestone.status === "in_progress" && (
                                    <Button 
                                      size="sm"
                                      onClick={() => updateMilestoneStatusMutation.mutate({
                                        id: milestone.id,
                                        status: "completed"
                                      })}
                                    >
                                      Complete
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="upcoming" className="mt-4">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Upcoming Milestones (Next 7 Days)</h3>
                  {isLoadingMilestones ? (
                    <div className="flex justify-center p-8">
                      <Spinner />
                    </div>
                  ) : getUpcomingMilestones().length === 0 ? (
                    <div className="text-center p-8">
                      <p className="text-gray-500">No upcoming milestones in the next 7 days.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Milestone</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getUpcomingMilestones().map((milestone) => (
                          <TableRow key={milestone.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center">
                                {milestone.milestoneName}
                                {milestone.isCritical && (
                                  <Badge variant="outline" className="ml-2 text-red-600 border-red-300">
                                    Critical
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{milestone.department || "-"}</TableCell>
                            <TableCell>
                              {format(parseISO(milestone.plannedStartDate), "MMM d, yyyy")}
                              <div className="text-xs text-gray-500">
                                {formatDistance(parseISO(milestone.plannedStartDate), new Date(), { addSuffix: true })}
                              </div>
                            </TableCell>
                            <TableCell>{format(parseISO(milestone.plannedEndDate), "MMM d, yyyy")}</TableCell>
                            <TableCell>
                              <Badge className={priorityColors[milestone.priority]}>
                                {milestone.priority.charAt(0).toUpperCase() + milestone.priority.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {milestone.status === "pending" && (
                                <Button 
                                  size="sm"
                                  onClick={() => updateMilestoneStatusMutation.mutate({
                                    id: milestone.id,
                                    status: "in_progress"
                                  })}
                                >
                                  Start
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Create Time & Action Plan Dialog */}
      <Dialog open={isCreatePlanOpen} onOpenChange={setIsCreatePlanOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Time & Action Plan</DialogTitle>
            <DialogDescription>
              Define the timeline for production milestones and deadlines.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleCreatePlan}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Plan Name</Label>
                <Input
                  id="name"
                  value={planFormData.name}
                  onChange={(e) => setPlanFormData({ ...planFormData, name: e.target.value })}
                  placeholder="e.g. Summer Collection Production Plan"
                  required
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={planFormData.description}
                  onChange={(e) => setPlanFormData({ ...planFormData, description: e.target.value })}
                  placeholder="Brief description of the production plan"
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={planFormData.startDate}
                    onChange={(e) => setPlanFormData({ ...planFormData, startDate: e.target.value })}
                    required
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={planFormData.endDate}
                    onChange={(e) => setPlanFormData({ ...planFormData, endDate: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreatePlanOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createPlanMutation.isPending}
              >
                {createPlanMutation.isPending && <Spinner className="mr-2" size="sm" />}
                Create Plan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Milestone Dialog */}
      <Dialog open={isCreateMilestoneOpen} onOpenChange={setIsCreateMilestoneOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Milestone</DialogTitle>
            <DialogDescription>
              Create a new milestone for the Time & Action Plan.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleCreateMilestone}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="milestoneName">Milestone Name</Label>
                <Input
                  id="milestoneName"
                  value={milestoneFormData.milestoneName}
                  onChange={(e) => setMilestoneFormData({ ...milestoneFormData, milestoneName: e.target.value })}
                  placeholder="e.g. Fabric Sourcing"
                  required
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={milestoneFormData.description}
                  onChange={(e) => setMilestoneFormData({ ...milestoneFormData, description: e.target.value })}
                  placeholder="Brief description of the milestone"
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="plannedStartDate">Planned Start Date</Label>
                  <Input
                    id="plannedStartDate"
                    type="date"
                    value={milestoneFormData.plannedStartDate}
                    onChange={(e) => setMilestoneFormData({ ...milestoneFormData, plannedStartDate: e.target.value })}
                    required
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="plannedEndDate">Planned End Date</Label>
                  <Input
                    id="plannedEndDate"
                    type="date"
                    value={milestoneFormData.plannedEndDate}
                    onChange={(e) => setMilestoneFormData({ ...milestoneFormData, plannedEndDate: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="responsiblePerson">Responsible Person</Label>
                  <Input
                    id="responsiblePerson"
                    value={milestoneFormData.responsiblePerson}
                    onChange={(e) => setMilestoneFormData({ ...milestoneFormData, responsiblePerson: e.target.value })}
                    placeholder="e.g. John Smith"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={milestoneFormData.department}
                    onChange={(e) => setMilestoneFormData({ ...milestoneFormData, department: e.target.value })}
                    placeholder="e.g. Production"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={milestoneFormData.priority}
                    onValueChange={(value) => setMilestoneFormData({ ...milestoneFormData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="isCritical" className="flex items-center h-10 mt-2">
                    <Switch
                      id="isCritical"
                      checked={milestoneFormData.isCritical}
                      onCheckedChange={(checked) => setMilestoneFormData({ ...milestoneFormData, isCritical: checked })}
                      className="mr-2"
                    />
                    Critical Path
                  </Label>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateMilestoneOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createMilestoneMutation.isPending}
              >
                {createMilestoneMutation.isPending && <Spinner className="mr-2" size="sm" />}
                Add Milestone
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Milestone Dialog */}
      <Dialog open={isEditMilestoneOpen} onOpenChange={setIsEditMilestoneOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Milestone</DialogTitle>
            <DialogDescription>
              Update the milestone details.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleUpdateMilestone}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="milestoneName">Milestone Name</Label>
                <Input
                  id="milestoneName"
                  value={milestoneFormData.milestoneName}
                  onChange={(e) => setMilestoneFormData({ ...milestoneFormData, milestoneName: e.target.value })}
                  placeholder="e.g. Fabric Sourcing"
                  required
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={milestoneFormData.description}
                  onChange={(e) => setMilestoneFormData({ ...milestoneFormData, description: e.target.value })}
                  placeholder="Brief description of the milestone"
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="plannedStartDate">Planned Start Date</Label>
                  <Input
                    id="plannedStartDate"
                    type="date"
                    value={milestoneFormData.plannedStartDate}
                    onChange={(e) => setMilestoneFormData({ ...milestoneFormData, plannedStartDate: e.target.value })}
                    required
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="plannedEndDate">Planned End Date</Label>
                  <Input
                    id="plannedEndDate"
                    type="date"
                    value={milestoneFormData.plannedEndDate}
                    onChange={(e) => setMilestoneFormData({ ...milestoneFormData, plannedEndDate: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="responsiblePerson">Responsible Person</Label>
                  <Input
                    id="responsiblePerson"
                    value={milestoneFormData.responsiblePerson}
                    onChange={(e) => setMilestoneFormData({ ...milestoneFormData, responsiblePerson: e.target.value })}
                    placeholder="e.g. John Smith"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={milestoneFormData.department}
                    onChange={(e) => setMilestoneFormData({ ...milestoneFormData, department: e.target.value })}
                    placeholder="e.g. Production"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={milestoneFormData.priority}
                    onValueChange={(value) => setMilestoneFormData({ ...milestoneFormData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="isCritical" className="flex items-center h-10 mt-2">
                    <Switch
                      id="isCritical"
                      checked={milestoneFormData.isCritical}
                      onCheckedChange={(checked) => setMilestoneFormData({ ...milestoneFormData, isCritical: checked })}
                      className="mr-2"
                    />
                    Critical Path
                  </Label>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditMilestoneOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={updateMilestoneMutation.isPending}
              >
                {updateMilestoneMutation.isPending && <Spinner className="mr-2" size="sm" />}
                Update Milestone
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate with AI Dialog */}
      <Dialog open={isGenerateWithAIOpen} onOpenChange={setIsGenerateWithAIOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Generate Plan with AI</DialogTitle>
            <DialogDescription>
              Use AI to generate recommended milestones based on the order details.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="mb-6">
              <h4 className="font-semibold mb-2">Order Details</h4>
              <div className="text-sm space-y-2">
                <div><span className="text-gray-500">Order ID:</span> {order?.orderId}</div>
                <div><span className="text-gray-500">Style:</span> {order?.styleName}</div>
                <div><span className="text-gray-500">Quantity:</span> {order?.quantity}</div>
                <div><span className="text-gray-500">Customer:</span> {order?.customer?.name}</div>
              </div>
            </div>
            
            <div className="mb-4">
              <h4 className="font-semibold mb-2">AI Features</h4>
              <ul className="text-sm space-y-1 list-disc pl-4">
                <li>Generate a complete timeline with industry-standard milestones</li>
                <li>Auto-calculate realistic durations based on product complexity</li>
                <li>Identify critical path activities for efficient monitoring</li>
                <li>Highlight potential risk factors specific to this order</li>
                <li>Assign appropriate departments for each activity</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 border border-orange-200 rounded-md p-3 mb-4">
              <p className="text-sm text-orange-800">
                <strong>Note:</strong> Generated milestones are recommendations and may need adjustments based on your specific production capabilities and constraints.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsGenerateWithAIOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => generateAIRecommendationsMutation.mutate()}
              disabled={generateAIRecommendationsMutation.isPending}
              className="gap-1"
            >
              {generateAIRecommendationsMutation.isPending ? <Spinner size="sm" /> : <Zap className="h-4 w-4" />}
              Generate with AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}