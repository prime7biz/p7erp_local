import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ArrowLeft, FileText, Calendar, Play, Database, Plus, ArrowRight } from 'lucide-react';
import { DashboardContainer } from '@/components/layout/dashboard-container';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Type definitions
type ReportTemplate = {
  id: number;
  name: string;
  description: string;
  reportType: string;
  category: string;
  module: string;
  queryText: string;
  parameters: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
};

// Validation schema
const reportFormSchema = z.object({
  name: z.string().min(3, { message: "Report name must be at least 3 characters" }),
  description: z.string().optional(),
  templateId: z.string().optional(),
  outputFormat: z.enum(["json", "csv", "excel"], {
    required_error: "Please select an output format",
  }),
  parameters: z.record(z.any()).optional(),
});

type ReportFormValues = z.infer<typeof reportFormSchema>;

const NewReportPage: React.FC = () => {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('');
  
  // Get templateId from URL if provided
  const searchParams = new URLSearchParams(search);
  const templateIdFromUrl = searchParams.get('templateId');
  
  // Fetch all templates
  const { 
    data: templates, 
    isLoading: isLoadingTemplates 
  } = useQuery({
    queryKey: ['/api/reports/templates'],
  });
  
  // Fetch specific template if templateId is provided
  const { 
    data: templateDetails, 
    isLoading: isLoadingTemplateDetails,
    isSuccess: isTemplateDetailsSuccess,
  } = useQuery({
    queryKey: [`/api/reports/templates/${templateIdFromUrl}`],
    enabled: !!templateIdFromUrl,
  });
  
  // Update selectedTemplate when templateDetails loads
  useEffect(() => {
    if (templateDetails && isTemplateDetailsSuccess) {
      setSelectedTemplate(templateDetails);
      
      // Set category and module filters to match the template
      setSelectedCategory(templateDetails.category);
      setSelectedModule(templateDetails.module);
      
      // Initialize form with template values
      form.setValue('name', `${templateDetails.name} - ${new Date().toLocaleDateString()}`);
      form.setValue('description', templateDetails.description);
      form.setValue('templateId', templateDetails.id.toString());
    }
  }, [templateDetails, isTemplateDetailsSuccess]);
  
  // Get unique categories and modules
  const categories = templates ? [...new Set(templates.map((t: ReportTemplate) => t.category))].sort() : [];
  const modules = templates ? [...new Set(templates.map((t: ReportTemplate) => t.module))].sort() : [];
  
  // Filter templates based on selected category and module
  const filteredTemplates = templates ? templates.filter((template: ReportTemplate) => {
    const categoryMatch = selectedCategory ? template.category === selectedCategory : true;
    const moduleMatch = selectedModule ? template.module === selectedModule : true;
    return categoryMatch && moduleMatch;
  }) : [];
  
  // Setup form with default values
  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: {
      name: '',
      description: '',
      templateId: templateIdFromUrl || undefined,
      outputFormat: 'json',
      parameters: {},
    },
  });
  
  // Create report mutation
  const createReportMutation = useMutation({
    mutationFn: async (values: ReportFormValues) => {
      return apiRequest('/api/reports/generate', 'POST', {
        ...values,
        templateId: values.templateId ? parseInt(values.templateId) : undefined,
        reportType: selectedTemplate?.reportType,
        category: selectedTemplate?.category,
        module: selectedTemplate?.module,
      });
    },
    onSuccess: async (data) => {
      const jsonData = await data.json();
      
      toast({
        title: "Report Generation Started",
        description: "Your report is being generated and will be available soon.",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/reports/generated'] });
      
      // Navigate to the report details page
      setLocation(`/reports/${jsonData.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error Creating Report",
        description: "There was a problem creating your report. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Form submit handler
  const onSubmit = (values: ReportFormValues) => {
    if (!values.templateId && !selectedTemplate) {
      toast({
        title: "Template Required",
        description: "Please select a report template to continue.",
        variant: "destructive",
      });
      return;
    }
    
    createReportMutation.mutate(values);
  };
  
  const handleTemplateSelect = (template: ReportTemplate) => {
    setSelectedTemplate(template);
    form.setValue('templateId', template.id.toString());
    form.setValue('name', `${template.name} - ${new Date().toLocaleDateString()}`);
    form.setValue('description', template.description);
  };
  
  const handleGoBack = () => {
    setLocation('/reports');
  };
  
  const getReportTypeIcon = (reportType: string) => {
    switch (reportType) {
      case 'financial':
        return '💰';
      case 'sales':
        return '📈';
      case 'inventory':
        return '📦';
      case 'production':
        return '🏭';
      case 'costs':
        return '💸';
      case 'quality':
        return '✅';
      case 'logistics':
        return '🚚';
      default:
        return '📊';
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

  return (
    <DashboardContainer title="Generate New Report">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Reports
          </Button>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Report Details</CardTitle>
                    <CardDescription>Define your new report</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Report Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter report name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe what this report will show"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="outputFormat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Output Format</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select output format" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="json">JSON</SelectItem>
                              <SelectItem value="csv">CSV</SelectItem>
                              <SelectItem value="excel">Excel</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Choose how the report data will be structured
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
                
                {selectedTemplate && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Selected Template</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">{getReportTypeIcon(selectedTemplate.reportType)}</div>
                        <div className="flex-1">
                          <h3 className="font-semibold">{selectedTemplate.name}</h3>
                          <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">{selectedTemplate.category}</Badge>
                            <Badge variant="secondary">{selectedTemplate.module}</Badge>
                          </div>
                        </div>
                      </div>
                      
                      {selectedTemplate.parameters && Object.keys(selectedTemplate.parameters).length > 0 && (
                        <div className="mt-4">
                          <Accordion type="single" collapsible className="w-full" defaultValue="parameters">
                            <AccordionItem value="parameters">
                              <AccordionTrigger className="text-sm font-medium">
                                Template Parameters
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="text-sm">
                                  <div className="space-y-2">
                                    {Object.entries(selectedTemplate.parameters).map(([key, value]) => (
                                      <div key={key} className="flex justify-between items-center py-1 border-b">
                                        <span className="font-mono text-xs">{key}</span>
                                        <span className="text-xs text-muted-foreground">{String(value)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button variant="outline" size="sm" onClick={() => setSelectedTemplate(null)}>
                        Change Template
                      </Button>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => setLocation(`/reports/templates/${selectedTemplate.id}`)}>
                              View Details
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View template details</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </CardFooter>
                  </Card>
                )}
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={createReportMutation.isPending || !selectedTemplate}
                >
                  {createReportMutation.isPending ? (
                    <>
                      <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                      Generating Report...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Generate Report
                    </>
                  )}
                </Button>
              </div>
              
              {!selectedTemplate && (
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Select a Template</CardTitle>
                      <CardDescription>Choose a template to generate your report</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-4 mb-6">
                        <div className="w-full sm:w-auto">
                          <Select value={selectedCategory || "all"} onValueChange={(value) => setSelectedCategory(value === "all" ? "" : value)}>
                            <SelectTrigger className="w-full sm:w-[180px]">
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
                        
                        <div className="w-full sm:w-auto">
                          <Select value={selectedModule || "all"} onValueChange={(value) => setSelectedModule(value === "all" ? "" : value)}>
                            <SelectTrigger className="w-full sm:w-[180px]">
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
                      </div>
                      
                      {isLoadingTemplates ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <Card key={i} className="flex flex-col h-full">
                              <CardHeader className="pb-2">
                                <Skeleton className="h-6 w-3/4 mb-2" />
                                <Skeleton className="h-4 w-1/2" />
                              </CardHeader>
                              <CardContent className="flex-1">
                                <Skeleton className="h-4 w-full mb-2" />
                                <Skeleton className="h-4 w-2/3" />
                              </CardContent>
                              <CardFooter>
                                <Skeleton className="h-9 w-full" />
                              </CardFooter>
                            </Card>
                          ))}
                        </div>
                      ) : filteredTemplates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="text-lg font-semibold mb-1">No templates found</h3>
                          <p className="text-muted-foreground max-w-md mb-6">
                            {selectedCategory || selectedModule 
                              ? "No templates match your current filter criteria. Try adjusting your filters."
                              : "There are no report templates available. Create a template to get started."}
                          </p>
                          {!selectedCategory && !selectedModule && (
                            <Button onClick={() => setLocation('/reports/templates/new')}>
                              <Plus className="h-4 w-4 mr-2" />
                              Create Template
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredTemplates.map((template: ReportTemplate) => (
                            <Card 
                              key={template.id} 
                              className={`flex flex-col h-full border-l-4 cursor-pointer transition-shadow hover:shadow-md ${
                                form.getValues('templateId') === template.id.toString()
                                  ? 'bg-primary/5 border-primary/50'
                                  : ''
                              }`}
                              style={{ borderLeftColor: getTemplateColor(template.category) }}
                              onClick={() => handleTemplateSelect(template)}
                            >
                              <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-2xl">{getReportTypeIcon(template.reportType)}</span>
                                    <CardTitle className="text-lg">{template.name}</CardTitle>
                                  </div>
                                </div>
                                <CardDescription>
                                  {template.category} • {template.module}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="flex-1">
                                <p className="text-sm text-muted-foreground">
                                  {template.description || "No description provided."}
                                </p>
                              </CardContent>
                              <CardFooter className="border-t bg-muted/10 pt-3">
                                <Button variant="secondary" className="w-full" onClick={(e) => {
                                  e.stopPropagation();
                                  handleTemplateSelect(template);
                                }}>
                                  <ArrowRight className="h-4 w-4 mr-2" />
                                  Use This Template
                                </Button>
                              </CardFooter>
                            </Card>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </form>
        </Form>
      </div>
    </DashboardContainer>
  );
};

export default NewReportPage;