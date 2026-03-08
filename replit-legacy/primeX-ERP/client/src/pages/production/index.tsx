import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { BarChart, LineChart } from "@tremor/react";
import ProductionDashboard from "../../components/production/production-dashboard";
import DepartmentProductionView from "../../components/production/department-production-view";
import AIProductionInsights from "../../components/production/ai-production-insights";

// Production departments
const DEPARTMENTS = [
  { id: 'knitting', name: 'Knitting' },
  { id: 'dyeing', name: 'Dyeing' },
  { id: 'aop', name: 'AOP' },
  { id: 'cutting', name: 'Cutting' },
  { id: 'print', name: 'Print' },
  { id: 'embroidery', name: 'Embroidery' },
  { id: 'sewing', name: 'Sewing' },
  { id: 'wash', name: 'Wash' },
  { id: 'iron', name: 'Iron' },
  { id: 'folding', name: 'Folding' },
  { id: 'packing', name: 'Packing' },
];

// Time intervals for data display
const TIME_INTERVALS = [
  { id: 'hourly', name: 'Hourly' },
  { id: 'daily', name: 'Daily' },
  { id: 'weekly', name: 'Weekly' },
  { id: 'monthly', name: 'Monthly' },
];

const Production = () => {
  const [selectedTab, setSelectedTab] = useState('dashboard');
  const [selectedDepartment, setSelectedDepartment] = useState(DEPARTMENTS[0].id);
  const [timeInterval, setTimeInterval] = useState('hourly');
  const [dateRange, setDateRange] = useState('today');
  const { toast } = useToast();

  // Animation variants
  const pageTransition = {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.4,
        when: "beforeChildren",
        staggerChildren: 0.1
      }
    },
    exit: { opacity: 0, y: -20 }
  };

  // Handle department change
  const handleDepartmentChange = (value: string) => {
    setSelectedDepartment(value);
  };

  // Handle time interval change  
  const handleTimeIntervalChange = (value: string) => {
    setTimeInterval(value);
  };

  // Handle date range change
  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
  };

  // Refresh production data
  const handleRefreshData = () => {
    toast({
      title: "Refreshing production data",
      description: "Latest production data is being loaded."
    });
  };

  return (
    <motion.div 
      className="container mx-auto p-4"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageTransition}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Production Management</h1>
          <p className="text-sm text-muted-foreground">
            Track and manage production across all manufacturing stages
          </p>
        </div>
        <div className="mt-3 sm:mt-0 flex flex-wrap gap-2">
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Today" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last7days">Last 7 Days</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            className="flex items-center gap-1"
            onClick={handleRefreshData}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
            Refresh
          </Button>
        </div>
      </div>

      {/* Main tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <div className="border-b mb-6">
          <TabsList className="bg-transparent p-0">
            <TabsTrigger 
              value="dashboard" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              Dashboard
            </TabsTrigger>
            <TabsTrigger 
              value="departments" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              Department View
            </TabsTrigger>
            <TabsTrigger 
              value="ai-insights" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              AI Insights
            </TabsTrigger>
            <TabsTrigger 
              value="reports" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              Reports
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="m-0">
          <ProductionDashboard 
            timeInterval={timeInterval} 
            dateRange={dateRange}
            onTimeIntervalChange={handleTimeIntervalChange}
          />
        </TabsContent>

        <TabsContent value="departments" className="m-0">
          <div className="flex flex-col sm:flex-row gap-4 items-start mb-6">
            <div className="w-full sm:w-64">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-md">Production Departments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {DEPARTMENTS.map((department) => (
                      <Button
                        key={department.id}
                        variant={selectedDepartment === department.id ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => handleDepartmentChange(department.id)}
                      >
                        {department.name}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="flex-1">
              <DepartmentProductionView 
                departmentId={selectedDepartment} 
                departmentName={DEPARTMENTS.find(dept => dept.id === selectedDepartment)?.name || ''}
                timeInterval={timeInterval}
                dateRange={dateRange}
                onTimeIntervalChange={handleTimeIntervalChange}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ai-insights" className="m-0">
          <AIProductionInsights />
        </TabsContent>

        <TabsContent value="reports" className="m-0">
          <Card>
            <CardHeader>
              <CardTitle>Production Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Hourly Production Report</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Detailed hourly production metrics across all departments</p>
                    <Button className="w-full mt-3" size="sm">
                      Generate Report
                    </Button>
                  </CardContent>
                </Card>
                
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Efficiency Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Comparative efficiency metrics for all departments</p>
                    <Button className="w-full mt-3" size="sm">
                      Generate Report
                    </Button>
                  </CardContent>
                </Card>
                
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Production Bottlenecks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Identify bottlenecks and production constraints</p>
                    <Button className="w-full mt-3" size="sm">
                      Generate Report
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default Production;