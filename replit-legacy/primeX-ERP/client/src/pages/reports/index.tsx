import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Search, FileText, ListFilter, Download, Printer, BarChart2, PieChart, LineChart, Table as TableIcon, Plus, Clock, Star, Filter, RefreshCw, Eye, Play } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardContainer } from '@/components/layout/dashboard-container';

// Type definitions
type ReportTemplate = {
  id: number;
  name: string;
  description: string;
  reportType: string;
  category: string;
  module: string;
  createdAt: string;
};

type GeneratedReport = {
  id: number;
  name: string;
  description: string;
  reportType: string;
  category: string;
  module: string;
  status: string;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
  outputFormat: string;
  viewCount: number;
  isFavorite: boolean;
};

const ReportsPage: React.FC = () => {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('my-reports');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('');

  // Fetch generated reports
  const { 
    data: reports, 
    isLoading: isLoadingReports 
  } = useQuery({
    queryKey: ['/api/reports/generated'],
  });

  // Fetch report templates
  const { 
    data: templates, 
    isLoading: isLoadingTemplates 
  } = useQuery({
    queryKey: ['/api/reports/templates'],
  });

  // Favorite/Unfavorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: number, isFavorite: boolean }) => {
      return apiRequest(`/api/reports/generated/${id}/favorite`, 'PATCH', { isFavorite });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reports/generated'] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update favorite status',
        variant: 'destructive',
      });
    },
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/reports/generated/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reports/generated'] });
      toast({
        title: 'Success',
        description: 'Report deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete report',
        variant: 'destructive',
      });
    },
  });

  // Filter reports based on search and filters
  const filteredReports = reports ? reports.filter((report: GeneratedReport) => {
    const matchesSearch = searchQuery === '' || 
      report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === '' || report.category === selectedCategory;
    const matchesModule = selectedModule === '' || report.module === selectedModule;
    
    return matchesSearch && matchesCategory && matchesModule;
  }) : [];

  // Get unique categories and modules for filters
  const categories = reports ? [...new Set(reports.map((report: GeneratedReport) => report.category))].sort() : [];
  const modules = reports ? [...new Set(reports.map((report: GeneratedReport) => report.module))].sort() : [];

  const handleCreateReport = () => {
    setLocation('/reports/new');
  };
  
  const handleViewReport = (id: number) => {
    setLocation(`/reports/${id}`);
  };
  
  const handleToggleFavorite = (id: number, isFavorite: boolean) => {
    toggleFavoriteMutation.mutate({ id, isFavorite: !isFavorite });
  };
  
  const handleDeleteReport = (id: number) => {
    if (confirm('Are you sure you want to delete this report? This action cannot be undone.')) {
      deleteReportMutation.mutate(id);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'processing':
        return <Badge variant="warning">Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  const getReportTypeIcon = (reportType: string) => {
    switch (reportType) {
      case 'financial':
        return <BarChart2 className="h-4 w-4" />;
      case 'sales':
        return <LineChart className="h-4 w-4" />;
      case 'inventory':
        return <TableIcon className="h-4 w-4" />;
      case 'production':
        return <PieChart className="h-4 w-4" />;
      case 'costs':
        return <BarChart2 className="h-4 w-4" />;
      case 'quality':
        return <TableIcon className="h-4 w-4" />;
      case 'logistics':
        return <TableIcon className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };
  
  const getTemplateColor = (category: string) => {
    switch (category) {
      case 'Sales':
        return '#22c55e'; // green
      case 'Finance':
        return '#3b82f6'; // blue
      case 'Production':
        return '#f59e0b'; // amber
      case 'Logistics':
        return '#6366f1'; // indigo
      case 'Quality':
        return '#ec4899'; // pink
      default:
        return '#a855f7'; // purple
    }
  };
  
  const handleCreateReportFromTemplate = (templateId: number) => {
    // Navigate to report creation page with template ID
    setLocation(`/reports/new?templateId=${templateId}`);
  };

  return (
    <DashboardContainer title="Reports & Analytics">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Business Intelligence Reports</h1>
            <p className="text-muted-foreground">Generate and analyze reports with AI-powered insights</p>
          </div>
          <Button onClick={handleCreateReport}>
            <Plus className="mr-2 h-4 w-4" />
            Create New Report
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="w-full md:w-1/3 lg:w-1/4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Filters</CardTitle>
                <CardDescription>Refine your report list</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search Reports</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or description"
                      className="pl-8"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={selectedCategory || "all"} onValueChange={(value) => setSelectedCategory(value === "all" ? "" : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Module</label>
                  <Select value={selectedModule || "all"} onValueChange={(value) => setSelectedModule(value === "all" ? "" : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Modules" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modules</SelectItem>
                      {modules.map((module) => (
                        <SelectItem key={module} value={module}>{module}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <Button variant="outline" className="w-full" onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('');
                  setSelectedModule('');
                }}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset Filters
                </Button>
              </CardContent>
            </Card>
            
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" onClick={() => setLocation('/reports/templates')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Manage Report Templates
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => setLocation('/reports/dashboard')}>
                    <BarChart2 className="mr-2 h-4 w-4" />
                    Analytics Dashboard
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => setLocation('/reports/schedules')}>
                    <Clock className="mr-2 h-4 w-4" />
                    Scheduled Reports
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="w-full md:w-2/3 lg:w-3/4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="my-reports" className="flex-1">My Reports</TabsTrigger>
                <TabsTrigger value="favorites" className="flex-1">Favorites</TabsTrigger>
                <TabsTrigger value="templates" className="flex-1">Templates</TabsTrigger>
              </TabsList>
              
              <TabsContent value="my-reports" className="mt-4">
                {isLoadingReports ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Card key={i}>
                        <CardHeader className="pb-2">
                          <Skeleton className="h-6 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </CardHeader>
                        <CardContent>
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-4 w-2/3" />
                        </CardContent>
                        <CardFooter>
                          <div className="flex justify-between w-full">
                            <Skeleton className="h-9 w-24" />
                            <Skeleton className="h-9 w-24" />
                          </div>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : filteredReports.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <FileText className="h-16 w-16 text-gray-300 mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No reports found</h3>
                      <p className="text-muted-foreground text-center max-w-md mb-6">
                        {searchQuery || selectedCategory || selectedModule 
                          ? "No reports match your search criteria. Try adjusting your filters."
                          : "You haven't created any reports yet. Create your first report to get started."}
                      </p>
                      <Button onClick={handleCreateReport}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create New Report
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {filteredReports.map((report: GeneratedReport) => (
                      <motion.div
                        key={report.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Card>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <CardTitle className="flex items-center gap-2">
                                  {getReportTypeIcon(report.reportType)}
                                  {report.name}
                                </CardTitle>
                                <CardDescription>
                                  {report.category} • {report.module} • Created {formatDate(report.createdAt)}
                                </CardDescription>
                              </div>
                              <div>{getStatusBadge(report.status)}</div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">
                              {report.description || "No description provided."}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {report.outputFormat.toUpperCase()}
                              </Badge>
                              {report.viewCount > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  Viewed {report.viewCount} times
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                          <CardFooter>
                            <div className="flex flex-wrap justify-between w-full gap-2">
                              <div className="flex items-center gap-2">
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  onClick={() => handleViewReport(report.id)}
                                  disabled={report.status !== 'completed'}
                                >
                                  View Report
                                </Button>
                                
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline">
                                      <Filter className="h-4 w-4" />
                                      <span className="sr-only">Actions</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleToggleFavorite(report.id, report.isFavorite)}>
                                      {report.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled={report.status !== 'completed'} onClick={() => window.open(`/api/reports/generated/${report.id}/export/pdf`, '_blank')}>
                                      Export as PDF
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled={report.status !== 'completed'} onClick={() => window.open(`/api/reports/generated/${report.id}/export/excel`, '_blank')}>
                                      Export as Excel
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled={report.status !== 'completed'}>
                                      Schedule Report
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteReport(report.id)}>
                                      Delete Report
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button 
                                        size="sm" 
                                        variant="ghost"
                                        onClick={() => handleToggleFavorite(report.id, report.isFavorite)}
                                      >
                                        <Star className={`h-4 w-4 ${report.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {report.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                
                                {report.status === 'completed' && (
                                  <>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button 
                                            size="sm" 
                                            variant="ghost"
                                            onClick={() => window.open(`/api/reports/generated/${report.id}/export/pdf`, '_blank')}
                                          >
                                            <Download className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Export as PDF
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button 
                                            size="sm" 
                                            variant="ghost"
                                            onClick={() => window.open(`/api/reports/generated/${report.id}/print`, '_blank')}
                                          >
                                            <Printer className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Print Report
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </>
                                )}
                              </div>
                            </div>
                          </CardFooter>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="favorites" className="mt-4">
                {isLoadingReports ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Card key={i}>
                        <CardHeader className="pb-2">
                          <Skeleton className="h-6 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </CardHeader>
                        <CardContent>
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-4 w-2/3" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reports?.filter((r: GeneratedReport) => r.isFavorite).length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <Star className="h-16 w-16 text-gray-300 mb-4" />
                          <h3 className="text-xl font-semibold mb-2">No favorite reports</h3>
                          <p className="text-muted-foreground text-center max-w-md mb-6">
                            You haven't added any reports to your favorites yet. Mark reports as favorites to find them quickly.
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      reports?.filter((r: GeneratedReport) => r.isFavorite).map((report: GeneratedReport) => (
                        <motion.div
                          key={report.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Card>
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <CardTitle className="flex items-center gap-2">
                                    {getReportTypeIcon(report.reportType)}
                                    {report.name}
                                  </CardTitle>
                                  <CardDescription>
                                    {report.category} • {report.module} • Created {formatDate(report.createdAt)}
                                  </CardDescription>
                                </div>
                                <div>{getStatusBadge(report.status)}</div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground">
                                {report.description || "No description provided."}
                              </p>
                            </CardContent>
                            <CardFooter>
                              <div className="flex justify-between w-full">
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  onClick={() => handleViewReport(report.id)}
                                  disabled={report.status !== 'completed'}
                                >
                                  View Report
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleToggleFavorite(report.id, report.isFavorite)}
                                >
                                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-2" />
                                  Remove from Favorites
                                </Button>
                              </div>
                            </CardFooter>
                          </Card>
                        </motion.div>
                      ))
                    )}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="templates" className="mt-4">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold">Industry-Specific Report Templates</h3>
                  <Button size="sm" onClick={() => setLocation('/reports/templates/new')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Custom Template
                  </Button>
                </div>
                
                {isLoadingTemplates ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Card key={i} className="flex flex-col h-full">
                        <CardHeader className="pb-2">
                          <Skeleton className="h-6 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </CardHeader>
                        <CardContent className="flex-1">
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-4 w-2/3 mb-4" />
                          <Skeleton className="h-3 w-1/2" />
                        </CardContent>
                        <CardFooter>
                          <div className="flex justify-between w-full gap-2">
                            <Skeleton className="h-9 w-24" />
                            <Skeleton className="h-9 w-32" />
                          </div>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : templates?.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <FileText className="h-16 w-16 text-gray-300 mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No templates found</h3>
                      <p className="text-muted-foreground text-center max-w-md mb-6">
                        You haven't created any report templates yet. Create a template to generate reports more easily.
                      </p>
                      <Button onClick={() => setLocation('/reports/templates/new')}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Template
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates?.map((template: ReportTemplate) => (
                      <motion.div
                        key={template.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Card className="flex flex-col h-full border-l-4 shadow-sm hover:shadow-md transition-shadow" 
                             style={{ borderLeftColor: getTemplateColor(template.category) }}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-lg flex items-center gap-2">
                                {getReportTypeIcon(template.reportType)}
                                {template.name}
                              </CardTitle>
                              <Badge variant="outline" className="font-normal">
                                {template.category}
                              </Badge>
                            </div>
                            <CardDescription className="flex items-center gap-1 mt-1">
                              <span className="text-xs bg-muted px-2 py-0.5 rounded-sm text-muted-foreground">
                                {template.module}
                              </span>
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="flex-1 pb-6">
                            <p className="text-sm text-muted-foreground">
                              {template.description || "No description provided."}
                            </p>
                          </CardContent>
                          <CardFooter className="border-t bg-muted/10 pt-3">
                            <div className="flex justify-between w-full gap-2">
                              <Button variant="outline" size="sm" onClick={() => setLocation(`/reports/templates/${template.id}/edit`)}>
                                <Eye className="h-4 w-4 mr-1" />
                                View Details
                              </Button>
                              <Button variant="default" className="ml-auto" onClick={() => setLocation(`/reports/new?templateId=${template.id}`)}>
                                <Play className="h-4 w-4 mr-1" />
                                Generate Report
                              </Button>
                            </div>
                          </CardFooter>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </DashboardContainer>
  );
};

export default ReportsPage;