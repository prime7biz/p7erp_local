import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { FileText, Database, ArrowLeft, Play, Edit, Copy, Code, CalendarClock, ArrowRight } from 'lucide-react';
import { DashboardContainer } from '@/components/layout/dashboard-container';
import { useToast } from '@/hooks/use-toast';

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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

const TemplateDetail: React.FC = () => {
  const params = useParams();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { id } = params;
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch template details
  const { 
    data: template, 
    isLoading, 
    isError,
    error
  } = useQuery({
    queryKey: [`/api/reports/templates/${id}`],
    retry: false,
  });

  const handleGoBack = () => {
    setLocation('/reports');
  };

  const handleCreateReport = () => {
    setLocation(`/reports/new?templateId=${id}`);
  };

  const handleEditTemplate = () => {
    setLocation(`/reports/templates/${id}/edit`);
  };

  const handleCopyTemplate = () => {
    toast({
      title: "Template Duplicated",
      description: "A copy of this template has been created",
    });
    // This would typically call an API to duplicate the template
    // For now we'll just show the toast
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

  // Render a loading state
  if (isLoading) {
    return (
      <DashboardContainer title="Template Details">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleGoBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Reports
            </Button>
          </div>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </DashboardContainer>
    );
  }

  // Render an error state
  if (isError || !template) {
    return (
      <DashboardContainer title="Template Details">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleGoBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Reports
            </Button>
          </div>
          
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Template not found</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                The template you're looking for doesn't exist or you don't have permission to view it.
              </p>
              <Button onClick={handleGoBack}>
                Go Back to Reports
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer title="Template Details">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Button variant="outline" size="sm" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Reports
          </Button>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleEditTemplate}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Template
            </Button>
            
            <Button variant="outline" size="sm" onClick={handleCopyTemplate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
            
            <Button variant="default" size="sm" onClick={handleCreateReport}>
              <Play className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </div>
        
        <Card className="border-t-4" style={{ borderTopColor: getTemplateColor(template.category) }}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getReportTypeIcon(template.reportType)}</span>
                  <CardTitle className="text-2xl">{template.name}</CardTitle>
                </div>
                <CardDescription className="mt-1">
                  {template.description || "No description provided."}
                </CardDescription>
              </div>
              <Badge className="ml-2" variant="outline">{template.category}</Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="font-normal">
                {template.module}
              </Badge>
              <Badge variant="outline" className="font-normal">
                {template.reportType}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="query">Query Definition</TabsTrigger>
                <TabsTrigger value="parameters">Parameters</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-muted/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Template Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="space-y-3">
                        <div className="grid grid-cols-3 gap-1">
                          <dt className="text-muted-foreground col-span-1">Category</dt>
                          <dd className="font-medium col-span-2">{template.category}</dd>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <dt className="text-muted-foreground col-span-1">Module</dt>
                          <dd className="font-medium col-span-2">{template.module}</dd>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <dt className="text-muted-foreground col-span-1">Report Type</dt>
                          <dd className="font-medium col-span-2">{template.reportType}</dd>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <dt className="text-muted-foreground col-span-1">Created By</dt>
                          <dd className="font-medium col-span-2">{template.createdByName || "System"}</dd>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <dt className="text-muted-foreground col-span-1">Created On</dt>
                          <dd className="font-medium col-span-2">{formatDate(template.createdAt)}</dd>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <dt className="text-muted-foreground col-span-1">Last Updated</dt>
                          <dd className="font-medium col-span-2">{formatDate(template.updatedAt)}</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-muted/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Usage Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <p className="text-muted-foreground">
                          This template can be used to generate reports that analyze {template.description?.toLowerCase() || `data related to ${template.category.toLowerCase()}`}.
                        </p>
                        
                        <div className="bg-primary/5 p-4 rounded-md space-y-2">
                          <h4 className="font-semibold flex items-center gap-2">
                            <CalendarClock className="h-4 w-4" />
                            Recommended Use
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {template.category === 'Sales' && "Generate this report weekly to track sales performance and identify trends."}
                            {template.category === 'Production' && "Run this report daily to monitor production efficiency and output quality."}
                            {template.category === 'Finance' && "Use monthly to analyze financial performance and identify cost-saving opportunities."}
                            {template.category === 'Logistics' && "Generate weekly to evaluate delivery performance and identify bottlenecks."}
                            {template.category === 'Quality' && "Run this report after each quality inspection to track defect rates and types."}
                            {!['Sales', 'Production', 'Finance', 'Logistics', 'Quality'].includes(template.category) && 
                              "Generate this report as needed to gain insights into your business data."}
                          </p>
                        </div>
                        
                        <div className="flex justify-center mt-4">
                          <Button className="w-full" onClick={handleCreateReport}>
                            <Play className="h-4 w-4 mr-2" />
                            Generate Report Now
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              
              <TabsContent value="query" className="mt-0">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg">SQL Query</CardTitle>
                      <Badge variant="outline" className="font-mono text-xs">
                        <Database className="h-3 w-3 mr-1" />
                        SQL
                      </Badge>
                    </div>
                    <CardDescription>
                      The SQL query used to generate this report
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="relative">
                      <pre className="bg-muted font-mono text-sm p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
                        {template.queryText || "-- No query defined for this template"}
                      </pre>
                      <div className="absolute top-2 right-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                  navigator.clipboard.writeText(template.queryText || "");
                                  toast({
                                    title: "Query Copied",
                                    description: "SQL query copied to clipboard",
                                  });
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Copy query</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    
                    <div className="mt-4 space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        Query Notes
                      </h4>
                      <div className="text-sm text-muted-foreground space-y-2">
                        <p>
                          This query {template.queryText?.includes('JOIN') ? 'joins' : 'queries'} data from the
                          {template.queryText?.includes('JOIN') ? ' related tables' : ' database'} to provide insights on {template.category.toLowerCase()} data.
                        </p>
                        {template.queryText?.includes(':tenantId') && (
                          <p>
                            The query uses tenant isolation to ensure data security and privacy.
                          </p>
                        )}
                        {template.queryText?.includes('ORDER BY') && (
                          <p>
                            Results are sorted by {template.queryText.match(/ORDER BY\s+([^\s]+)/i)?.[1].replace(/`/g, '') || 'a specific column'}.
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="parameters" className="mt-0">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Query Parameters</CardTitle>
                    <CardDescription>
                      Parameters that can be used to customize the report
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!template.parameters || Object.keys(template.parameters).length === 0 ? (
                      <div className="bg-muted/30 p-4 rounded-md text-center">
                        <p className="text-muted-foreground">
                          This template doesn't have any configurable parameters.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="border rounded-md overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="px-4 py-2 text-left font-medium">Parameter</th>
                                <th className="px-4 py-2 text-left font-medium">Type</th>
                                <th className="px-4 py-2 text-left font-medium">Default Value</th>
                                <th className="px-4 py-2 text-left font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {Object.entries(template.parameters).map(([key, value]) => (
                                <tr key={key}>
                                  <td className="px-4 py-2 font-mono text-xs">:{key}</td>
                                  <td className="px-4 py-2">
                                    {typeof value === 'number' ? (
                                      <Badge variant="outline" className="font-normal">Number</Badge>
                                    ) : typeof value === 'string' ? (
                                      <Badge variant="outline" className="font-normal">String</Badge>
                                    ) : typeof value === 'boolean' ? (
                                      <Badge variant="outline" className="font-normal">Boolean</Badge>
                                    ) : Array.isArray(value) ? (
                                      <Badge variant="outline" className="font-normal">Array</Badge>
                                    ) : (
                                      <Badge variant="outline" className="font-normal">Object</Badge>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 font-mono text-xs">
                                    {typeof value === 'string' ? `"${value}"` : 
                                     JSON.stringify(value)}
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground">
                                    {key === 'tenantId' ? 'Tenant ID for data isolation' : 
                                     key === 'startDate' ? 'Start date for report period' :
                                     key === 'endDate' ? 'End date for report period' :
                                     key === 'limit' ? 'Maximum number of records to return' :
                                     `Parameter for ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} filter`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        <div className="bg-primary/5 p-4 rounded-md">
                          <h4 className="font-semibold mb-2">Using Parameters</h4>
                          <p className="text-sm text-muted-foreground">
                            When generating a report from this template, you'll be able to customize these parameters to filter the results based on your specific needs.
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="bg-muted/10 flex justify-between">
                    <Button variant="outline" onClick={() => setActiveTab('query')}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      View Query
                    </Button>
                    <Button onClick={handleCreateReport}>
                      Generate Report
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardContainer>
  );
};

export default TemplateDetail;