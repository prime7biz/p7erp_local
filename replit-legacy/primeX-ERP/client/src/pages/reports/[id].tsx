import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { FileText, Download, Printer, BarChart2, PieChart, LineChart, Table as TableIcon, ArrowLeft, Eye, RefreshCw, Calendar, Clock, User, Tag, FileJson, FileDown, FileSpreadsheet } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  results: any[] | null;
  error_message?: string;
  templateId?: number;
};

const ReportDetail: React.FC = () => {
  const params = useParams();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { id } = params;
  const [activeTab, setActiveTab] = useState('data');

  // Fetch report details
  const { 
    data: report, 
    isLoading, 
    isError,
    error
  } = useQuery({
    queryKey: [`/api/reports/generated/${id}`],
    retry: false,
  });

  const handleGoBack = () => {
    setLocation('/reports');
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleExportReport = (format: string) => {
    if (!report || !report.results) {
      toast({
        title: "Can't export report",
        description: "No report data available to export",
        variant: "destructive",
      });
      return;
    }

    // Simple CSV export functionality
    if (format === 'csv') {
      try {
        // Get the data
        const data = report.results;
        if (!data || data.length === 0) {
          toast({
            title: "Export failed",
            description: "No data available to export",
            variant: "destructive",
          });
          return;
        }

        // Get the headers
        const headers = Object.keys(data[0]);
        
        // Create CSV content
        const csvContent = [
          headers.join(','), // Header row
          ...data.map(row => 
            headers.map(header => {
              const value = row[header];
              // Handle quotes and commas in values
              if (value === null || value === undefined) {
                return '';
              } else if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
              } else {
                return String(value);
              }
            }).join(',')
          )
        ].join('\n');
        
        // Create a blob and download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${report.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: "Export successful",
          description: "Report data exported to CSV",
        });
      } catch (err) {
        console.error("Error exporting to CSV:", err);
        toast({
          title: "Export failed",
          description: "There was an error exporting the report data",
          variant: "destructive",
        });
      }
    } else if (format === 'json') {
      try {
        const data = report.results;
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${report.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: "Export successful",
          description: "Report data exported to JSON",
        });
      } catch (err) {
        console.error("Error exporting to JSON:", err);
        toast({
          title: "Export failed",
          description: "There was an error exporting the report data",
          variant: "destructive",
        });
      }
    } else if (format === 'excel') {
      toast({
        title: "Not available",
        description: "Excel export is not available in this release. Use CSV export instead.",
      });
    }
  };

  const getReportTypeIcon = (reportType?: string) => {
    switch (reportType) {
      case 'financial':
        return <BarChart2 className="h-5 w-5" />;
      case 'sales':
        return <LineChart className="h-5 w-5" />;
      case 'inventory':
        return <TableIcon className="h-5 w-5" />;
      case 'production':
        return <PieChart className="h-5 w-5" />;
      case 'costs':
        return <BarChart2 className="h-5 w-5" />;
      case 'quality':
        return <TableIcon className="h-5 w-5" />;
      case 'logistics':
        return <TableIcon className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Processing</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">Failed</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const renderTableData = (data?: any[]) => {
    if (!data || data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <TableIcon className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No data available</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            This report doesn't have any data to display.
          </p>
        </div>
      );
    }

    // Get column headers from first row
    const columns = Object.keys(data[0]);

    return (
      <div className="border rounded-md overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead key={index} className="whitespace-nowrap font-semibold">
                  {column.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column, colIndex) => (
                  <TableCell key={colIndex} className="whitespace-nowrap">
                    {row[column] !== null && row[column] !== undefined ? 
                      String(row[column]) : 
                      <span className="text-muted-foreground italic">null</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  // Render a loading state
  if (isLoading) {
    return (
      <DashboardContainer title="Report Details">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </DashboardContainer>
    );
  }

  // Render an error state
  if (isError || !report) {
    return (
      <DashboardContainer title="Report Details">
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
              <h3 className="text-xl font-semibold mb-2">Report not found</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                The report you're looking for doesn't exist or you don't have permission to view it.
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
    <DashboardContainer title="Report Details">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Button variant="outline" size="sm" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Reports
          </Button>
          
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExportReport('csv')}>
                  <FileDown className="h-4 w-4 mr-2" />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportReport('json')}>
                  <FileJson className="h-4 w-4 mr-2" />
                  JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportReport('excel')}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button variant="outline" size="sm" onClick={handlePrintReport}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="default" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Data
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Update report with latest data</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {getReportTypeIcon(report.reportType)}
                  <CardTitle className="text-2xl">{report.name}</CardTitle>
                  {getStatusBadge(report.status)}
                </div>
                <CardDescription className="mt-1">
                  {report.description || "No description provided."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <Card className="bg-muted/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="font-medium">{formatDate(report.createdAt)}</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-muted/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="font-medium">{report.completedAt ? formatDate(report.completedAt) : 'Not completed'}</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-muted/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created By</p>
                    <p className="font-medium">{report.createdByName || 'Unknown'}</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-muted/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Tag className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Category & Module</p>
                    <p className="font-medium">{report.category} • {report.module}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {report.status === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                <h3 className="text-red-800 font-medium mb-1">Report Generation Failed</h3>
                <p className="text-red-600 text-sm">{report.error_message || 'An unknown error occurred while generating this report.'}</p>
              </div>
            )}
            
            {report.status === 'processing' || report.status === 'pending' ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                <h3 className="text-xl font-semibold mb-2">Generating Report</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Your report is currently being generated. This may take a few moments.
                </p>
              </div>
            ) : (
              <Tabs defaultValue="data" className="w-full" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="data">Data</TabsTrigger>
                  <TabsTrigger value="insights">AI Insights</TabsTrigger>
                  <TabsTrigger value="settings">Report Settings</TabsTrigger>
                </TabsList>
                
                <TabsContent value="data" className="mt-0">
                  {renderTableData(report.results)}
                </TabsContent>
                
                <TabsContent value="insights" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Report Insights</CardTitle>
                      <CardDescription>
                        Analysis based on your report data
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {report.results && report.results.length > 0 ? (
                          <div className="p-4 bg-muted/30 rounded-md">
                            <p className="text-sm text-muted-foreground">
                              This report contains <span className="font-semibold">{report.results.length}</span> records
                              across <span className="font-semibold">{Object.keys(report.results[0]).length}</span> columns.
                            </p>
                          </div>
                        ) : (
                          <div className="p-4 bg-muted/30 rounded-md">
                            <p className="text-muted-foreground italic text-center">
                              No data available for insights.
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="settings" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Report Settings</CardTitle>
                      <CardDescription>
                        View and modify report configuration
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h3 className="font-medium mb-2">Report Configuration</h3>
                            <div className="space-y-2">
                              <div className="flex justify-between p-2 bg-muted/30 rounded-md">
                                <span className="text-muted-foreground">Report Type</span>
                                <span className="font-medium">{report.reportType || 'Custom'}</span>
                              </div>
                              <div className="flex justify-between p-2 bg-muted/30 rounded-md">
                                <span className="text-muted-foreground">Output Format</span>
                                <span className="font-medium">{report.outputFormat?.toUpperCase() || 'JSON'}</span>
                              </div>
                              <div className="flex justify-between p-2 bg-muted/30 rounded-md">
                                <span className="text-muted-foreground">Based on Template</span>
                                <span className="font-medium">
                                  {report.templateId ? (
                                    <Button variant="link" className="p-0 h-auto" onClick={() => setLocation(`/reports/templates/${report.templateId}`)}>
                                      View Template
                                    </Button>
                                  ) : 'Custom Query'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            <h3 className="font-medium mb-2">Report Stats</h3>
                            <div className="space-y-2">
                              <div className="flex justify-between p-2 bg-muted/30 rounded-md">
                                <span className="text-muted-foreground">View Count</span>
                                <span className="font-medium">{report.viewCount || 0}</span>
                              </div>
                              <div className="flex justify-between p-2 bg-muted/30 rounded-md">
                                <span className="text-muted-foreground">Record Count</span>
                                <span className="font-medium">{report.results?.length || 0} rows</span>
                              </div>
                              <div className="flex justify-between p-2 bg-muted/30 rounded-md">
                                <span className="text-muted-foreground">Favorite</span>
                                <span className="font-medium">{report.isFavorite ? 'Yes' : 'No'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardContainer>
  );
};

export default ReportDetail;