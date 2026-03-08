import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import LogisticsDashboard from "@/components/logistics/logistics-dashboard";
import ImportExportTracking from "@/components/logistics/import-export-tracking";
import DocumentManagement from "@/components/logistics/document-management";
import AILogisticsInsights from "@/components/logistics/ai-logistics-insights";
import ShipmentTracking from "@/components/logistics/shipment-tracking";
import CostManagement from "@/components/logistics/cost-management";

// Logistics tracking categories
const TRACKING_CATEGORIES = [
  { id: 'lc', name: 'Letter of Credit (LC)' },
  { id: 'back-to-lc', name: 'Back to LC' },
  { id: 'import-bill', name: 'Import Bill' },
  { id: 'export-bill', name: 'Export Bill' },
  { id: 'rex-certificate', name: 'REX Certificate' },
  { id: 'vessel', name: 'Vessel On Board' },
  { id: 'bl', name: 'Bill of Lading (BL)' },
  { id: 'export-docs', name: 'Export Documents' },
  { id: 'customs', name: 'Customs' },
  { id: 'duty', name: 'Duty' },
  { id: 'cnf', name: 'C&F' },
  { id: 'insurance', name: 'Insurance' },
  { id: 'transport', name: 'Transport' },
  { id: 'local-import', name: 'Local Import' },
  { id: 'foreign-import', name: 'Foreign Import' },
];

// Time intervals for data display
const TIME_INTERVALS = [
  { id: 'daily', name: 'Daily' },
  { id: 'weekly', name: 'Weekly' },
  { id: 'monthly', name: 'Monthly' },
  { id: 'quarterly', name: 'Quarterly' },
];

const Logistics = () => {
  const [selectedTab, setSelectedTab] = useState('dashboard');
  const [selectedCategory, setSelectedCategory] = useState(TRACKING_CATEGORIES[0].id);
  const [timeInterval, setTimeInterval] = useState('monthly');
  const [dateRange, setDateRange] = useState('lastQuarter');
  const [selectedReference, setSelectedReference] = useState('all');
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

  // Handle category change
  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
  };

  // Handle time interval change  
  const handleTimeIntervalChange = (value: string) => {
    setTimeInterval(value);
  };

  // Handle date range change
  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
  };

  // Handle reference change
  const handleReferenceChange = (value: string) => {
    setSelectedReference(value);
  };

  // Refresh logistics data
  const handleRefreshData = () => {
    toast({
      title: "Refreshing logistics data",
      description: "Latest trading information is being loaded."
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
          <h1 className="text-2xl font-bold mb-1">Logistics & Trade Management</h1>
          <p className="text-sm text-muted-foreground">
            Track and manage import-export operations, documents, and compliance
          </p>
        </div>
        <div className="mt-3 sm:mt-0 flex flex-wrap gap-2">
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Last Quarter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="lastQuarter">Last Quarter</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
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

      {/* Reference Filter */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Reference:</span>
          <Select value={selectedReference} onValueChange={handleReferenceChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All References" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All References</SelectItem>
              <SelectItem value="LC-2023-001">LC-2023-001</SelectItem>
              <SelectItem value="PO-2023-087">PO-2023-087</SelectItem>
              <SelectItem value="SC-2023-042">SC-2023-042</SelectItem>
              <SelectItem value="ST-1001">Style ST-1001</SelectItem>
              <SelectItem value="ST-1002">Style ST-1002</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Time Interval:</span>
          <Select value={timeInterval} onValueChange={handleTimeIntervalChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Monthly" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
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
              value="import-export" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              Import/Export
            </TabsTrigger>
            <TabsTrigger 
              value="documents" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              Documents
            </TabsTrigger>
            <TabsTrigger 
              value="shipments" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              Shipments
            </TabsTrigger>
            <TabsTrigger 
              value="costs" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              Costs
            </TabsTrigger>
            <TabsTrigger 
              value="ai-insights" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              AI Insights
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="m-0">
          <LogisticsDashboard 
            timeInterval={timeInterval}
            dateRange={dateRange}
            selectedReference={selectedReference}
            onTimeIntervalChange={handleTimeIntervalChange}
          />
        </TabsContent>

        <TabsContent value="import-export" className="m-0">
          <div className="flex flex-col sm:flex-row gap-4 items-start mb-6">
            <div className="w-full sm:w-64">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-md">Trading Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {TRACKING_CATEGORIES.map((category) => (
                      <Button
                        key={category.id}
                        variant={selectedCategory === category.id ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => handleCategoryChange(category.id)}
                      >
                        {category.name}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="flex-1">
              <ImportExportTracking 
                categoryId={selectedCategory} 
                categoryName={TRACKING_CATEGORIES.find(cat => cat.id === selectedCategory)?.name || ''}
                timeInterval={timeInterval}
                dateRange={dateRange}
                selectedReference={selectedReference}
                onTimeIntervalChange={handleTimeIntervalChange}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="m-0">
          <DocumentManagement
            selectedReference={selectedReference}
            timeInterval={timeInterval}
            dateRange={dateRange}
          />
        </TabsContent>

        <TabsContent value="shipments" className="m-0">
          <ShipmentTracking
            selectedReference={selectedReference}
            timeInterval={timeInterval}
            dateRange={dateRange}
          />
        </TabsContent>

        <TabsContent value="costs" className="m-0">
          <CostManagement
            selectedReference={selectedReference}
            timeInterval={timeInterval}
            dateRange={dateRange}
          />
        </TabsContent>

        <TabsContent value="ai-insights" className="m-0">
          <AILogisticsInsights 
            selectedReference={selectedReference}
          />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default Logistics;