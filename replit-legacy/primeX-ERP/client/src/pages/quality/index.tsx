import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import QualityDashboard from "../../components/quality/quality-dashboard";
import DepartmentQualityView from "../../components/quality/department-quality-view";
import AIQualityInsights from "../../components/quality/ai-quality-insights";

// Quality inspection departments/stations
const INSPECTION_POINTS = [
  { id: 'knitted-raw-fabric', name: 'Knitted Raw Fabric' },
  { id: 'finished-fabric', name: 'Finished Fabric' },
  { id: 'cutting-part', name: 'Cutting Part' },
  { id: 'print', name: 'Print' },
  { id: 'embroidery', name: 'Embroidery' },
  { id: 'sewing', name: 'Sewing' },
  { id: 'finishing', name: 'Finishing' },
  { id: 'inline-inspection', name: 'In-line Inspection' },
  { id: 'pre-final-inspection', name: 'Pre-final Inspection' },
  { id: 'final-inspection', name: 'Final Inspection' },
];

// Time intervals for data display
const TIME_INTERVALS = [
  { id: 'hourly', name: 'Hourly' },
  { id: 'daily', name: 'Daily' },
  { id: 'weekly', name: 'Weekly' },
  { id: 'monthly', name: 'Monthly' },
];

const Quality = () => {
  const [selectedTab, setSelectedTab] = useState('dashboard');
  const [selectedStation, setSelectedStation] = useState(INSPECTION_POINTS[0].id);
  const [timeInterval, setTimeInterval] = useState('hourly');
  const [dateRange, setDateRange] = useState('today');
  const [selectedStyle, setSelectedStyle] = useState('all');
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

  // Handle station change
  const handleStationChange = (value: string) => {
    setSelectedStation(value);
  };

  // Handle time interval change  
  const handleTimeIntervalChange = (value: string) => {
    setTimeInterval(value);
  };

  // Handle date range change
  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
  };

  // Handle style change
  const handleStyleChange = (value: string) => {
    setSelectedStyle(value);
  };

  // Refresh quality data
  const handleRefreshData = () => {
    toast({
      title: "Refreshing quality data",
      description: "Latest quality metrics are being loaded."
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
          <h1 className="text-2xl font-bold mb-1">Quality Management</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and track quality metrics across all production stages
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

      {/* Style Filter */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Style Reference:</span>
          <Select value={selectedStyle} onValueChange={handleStyleChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Styles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Styles</SelectItem>
              <SelectItem value="ST-1001">T-Shirt Basic (ST-1001)</SelectItem>
              <SelectItem value="ST-1002">Polo Premium (ST-1002)</SelectItem>
              <SelectItem value="ST-1003">Oxford Shirt (ST-1003)</SelectItem>
              <SelectItem value="ST-1004">Denim Jeans (ST-1004)</SelectItem>
              <SelectItem value="ST-1005">Chino Pants (ST-1005)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Time Interval:</span>
          <Select value={timeInterval} onValueChange={handleTimeIntervalChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Hourly" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
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
              value="inspection-points" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              Inspection Points
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
            <TabsTrigger 
              value="visual-detection" 
              className="pb-2 pt-1 px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
            >
              Visual Detection
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="m-0">
          <QualityDashboard 
            timeInterval={timeInterval}
            dateRange={dateRange}
            selectedStyle={selectedStyle}
            onTimeIntervalChange={handleTimeIntervalChange}
          />
        </TabsContent>

        <TabsContent value="inspection-points" className="m-0">
          <div className="flex flex-col sm:flex-row gap-4 items-start mb-6">
            <div className="w-full sm:w-64">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-md">Inspection Points</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {INSPECTION_POINTS.map((station) => (
                      <Button
                        key={station.id}
                        variant={selectedStation === station.id ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => handleStationChange(station.id)}
                      >
                        {station.name}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="flex-1">
              <DepartmentQualityView 
                stationId={selectedStation} 
                stationName={INSPECTION_POINTS.find(station => station.id === selectedStation)?.name || ''}
                timeInterval={timeInterval}
                dateRange={dateRange}
                selectedStyle={selectedStyle}
                onTimeIntervalChange={handleTimeIntervalChange}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ai-insights" className="m-0">
          <AIQualityInsights 
            selectedStyle={selectedStyle}
          />
        </TabsContent>

        <TabsContent value="visual-detection" className="m-0">
          <Card>
            <CardHeader>
              <CardTitle>AI-Powered Visual Defect Detection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="22"></line>
                  </svg>
                </div>
                <h3 className="text-xl font-medium">Coming Soon</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Our advanced AI-powered visual defect detection system is currently in development.
                  Soon you'll be able to automatically detect fabric defects, stitching issues, 
                  color variations, and other quality concerns using computer vision technology.
                </p>
                <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 justify-center mt-4">
                  <Button variant="outline">Request Early Access</Button>
                  <Button variant="outline">Learn More</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="m-0">
          <Card>
            <CardHeader>
              <CardTitle>Quality Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Quality Audit Report</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Comprehensive quality metrics across all inspection points</p>
                    <Button className="w-full mt-3" size="sm">
                      Generate Report
                    </Button>
                  </CardContent>
                </Card>
                
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Defect Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Detailed breakdown of defect types and frequencies</p>
                    <Button className="w-full mt-3" size="sm">
                      Generate Report
                    </Button>
                  </CardContent>
                </Card>
                
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Quality Trend Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Historical quality trend analysis by style and department</p>
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

export default Quality;