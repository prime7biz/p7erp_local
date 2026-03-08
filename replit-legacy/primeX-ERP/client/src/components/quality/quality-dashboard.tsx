import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { BarChart, DonutChart, AreaChart, LineChart, Card as TremorCard } from "@tremor/react";
import { Activity, AlertTriangle, Zap, TrendingDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

interface QualityDashboardProps {
  timeInterval: string;
  dateRange: string;
  selectedStyle: string;
  onTimeIntervalChange: (value: string) => void;
}

const QualityDashboard: React.FC<QualityDashboardProps> = ({
  timeInterval,
  dateRange,
  selectedStyle,
  onTimeIntervalChange
}) => {
  // Sample data for dashboard
  const qualityOverview = {
    totalInspections: 2876,
    passRate: 94.8,
    defectRate: 5.2,
    reworkRate: 2.1,
    rejectionRate: 0.7,
    criticalDefects: 12,
    majorDefects: 87,
    minorDefects: 214,
  };

  // Chart data for defects by inspection point
  const defectsByDepartment = [
    { department: "Knitted Raw Fabric", defects: 32, inspections: 240, rate: 13.3 },
    { department: "Finished Fabric", defects: 22, inspections: 240, rate: 9.2 },
    { department: "Cutting Part", defects: 15, inspections: 450, rate: 3.3 },
    { department: "Print", defects: 9, inspections: 180, rate: 5.0 },
    { department: "Embroidery", defects: 12, inspections: 150, rate: 8.0 },
    { department: "Sewing", defects: 45, inspections: 522, rate: 8.6 },
    { department: "Finishing", defects: 14, inspections: 320, rate: 4.4 },
    { department: "In-line Inspection", defects: 36, inspections: 360, rate: 10.0 },
    { department: "Pre-final Inspection", defects: 28, inspections: 310, rate: 9.0 },
    { department: "Final Inspection", defects: 12, inspections: 320, rate: 3.8 },
  ];

  // Chart data for hourly quality metrics
  const hourlyQualityData = [
    { hour: "8-9 AM", passRate: 96.2, defectRate: 3.8, criticalDefects: 1 },
    { hour: "9-10 AM", passRate: 95.8, defectRate: 4.2, criticalDefects: 0 },
    { hour: "10-11 AM", passRate: 97.3, defectRate: 2.7, criticalDefects: 0 },
    { hour: "11-12 PM", passRate: 94.5, defectRate: 5.5, criticalDefects: 2 },
    { hour: "12-1 PM", passRate: 92.8, defectRate: 7.2, criticalDefects: 3 },
    { hour: "1-2 PM", passRate: 93.5, defectRate: 6.5, criticalDefects: 1 },
    { hour: "2-3 PM", passRate: 95.4, defectRate: 4.6, criticalDefects: 0 },
    { hour: "3-4 PM", passRate: 96.7, defectRate: 3.3, criticalDefects: 0 },
    { hour: "4-5 PM", passRate: 97.2, defectRate: 2.8, criticalDefects: 0 },
    { hour: "5-6 PM", passRate: 96.1, defectRate: 3.9, criticalDefects: 1 },
  ];

  // Chart data for defect types
  const defectTypesData = [
    { type: "Stains", count: 68, percentage: 22.4 },
    { type: "Holes/Tears", count: 42, percentage: 13.8 },
    { type: "Color Shading", count: 37, percentage: 12.2 },
    { type: "Stitching", count: 56, percentage: 18.4 },
    { type: "Print Misalignment", count: 32, percentage: 10.5 },
    { type: "Size Variation", count: 25, percentage: 8.2 },
    { type: "Other Defects", count: 44, percentage: 14.5 },
  ];

  // Chart data for defect trends
  const defectTrendsData = [
    { date: "May 12", defectRate: 5.8, reworkRate: 2.3, rejectionRate: 0.8 },
    { date: "May 13", defectRate: 6.2, reworkRate: 2.5, rejectionRate: 0.9 },
    { date: "May 14", defectRate: 5.5, reworkRate: 2.2, rejectionRate: 0.7 },
    { date: "May 15", defectRate: 4.9, reworkRate: 2.0, rejectionRate: 0.6 },
    { date: "May 16", defectRate: 5.3, reworkRate: 2.1, rejectionRate: 0.7 },
    { date: "May 17", defectRate: 5.6, reworkRate: 2.2, rejectionRate: 0.8 },
    { date: "May 18", defectRate: 5.2, reworkRate: 2.1, rejectionRate: 0.7 },
  ];

  // Animation variants for dashboard elements
  const itemAnimation = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
        ease: "easeOut"
      }
    })
  };

  // Get trend indicator
  const getTrendIndicator = (current: number, previous: number, reverseColor: boolean = false) => {
    // For defect rates, lower is better (reverseColor = true)
    // For pass rates, higher is better (reverseColor = false)
    const isPositive = reverseColor ? current < previous : current > previous;
    const changePercent = Math.abs(((current - previous) / previous) * 100).toFixed(1);
    
    if (isPositive) {
      return (
        <div className="flex items-center text-emerald-600">
          <ChevronUp className="h-4 w-4 mr-1" />
          <span className="text-xs">{changePercent}%</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-rose-600">
          <ChevronDown className="h-4 w-4 mr-1" />
          <span className="text-xs">{changePercent}%</span>
        </div>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Quality Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          custom={0}
          initial="hidden"
          animate="visible"
          variants={itemAnimation}
        >
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                <Activity className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{qualityOverview.passRate}%</span>
                {getTrendIndicator(qualityOverview.passRate, 94.2)}
              </div>
              <Progress value={qualityOverview.passRate} className="h-2 bg-gray-100" />
              <p className="text-xs text-muted-foreground mt-2">
                Overall quality pass rate
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div 
          custom={1}
          initial="hidden"
          animate="visible"
          variants={itemAnimation}
        >
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Defect Rate</CardTitle>
                <AlertTriangle className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{qualityOverview.defectRate}%</span>
                {getTrendIndicator(qualityOverview.defectRate, 5.8, true)}
              </div>
              <Progress value={qualityOverview.defectRate * 5} className="h-2 bg-red-50" />
              <p className="text-xs text-muted-foreground mt-2">
                Overall defect percentage
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div 
          custom={2}
          initial="hidden"
          animate="visible"
          variants={itemAnimation}
        >
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Rework Rate</CardTitle>
                <Zap className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{qualityOverview.reworkRate}%</span>
                {getTrendIndicator(qualityOverview.reworkRate, 2.3, true)}
              </div>
              <Progress value={qualityOverview.reworkRate * 10} className="h-2 bg-amber-50" />
              <p className="text-xs text-muted-foreground mt-2">
                Items needing rework
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div 
          custom={3}
          initial="hidden"
          animate="visible"
          variants={itemAnimation}
        >
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Rejection Rate</CardTitle>
                <TrendingDown className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{qualityOverview.rejectionRate}%</span>
                {getTrendIndicator(qualityOverview.rejectionRate, 0.8, true)}
              </div>
              <Progress value={qualityOverview.rejectionRate * 20} className="h-2 bg-red-50" />
              <p className="text-xs text-muted-foreground mt-2">
                Complete rejections
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Time Interval Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Quality Metrics</h2>
        <Select value={timeInterval} onValueChange={onTimeIntervalChange}>
          <SelectTrigger className="w-[140px]">
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

      {/* Hourly Quality Chart */}
      <motion.div 
        custom={4} 
        initial="hidden" 
        animate="visible" 
        variants={itemAnimation}
      >
        <Card>
          <CardHeader>
            <CardTitle>
              Hourly Quality Metrics
              {selectedStyle !== 'all' && (
                <Badge className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-100">
                  Style: {selectedStyle}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TremorCard>
              <AreaChart
                className="h-72"
                data={hourlyQualityData}
                index="hour"
                categories={["passRate", "defectRate"]}
                colors={["emerald", "rose"]}
                valueFormatter={(value) => `${value.toFixed(1)}%`}
                showLegend={true}
                showAnimation={true}
                yAxisWidth={40}
              />
            </TremorCard>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="flex flex-col items-center bg-green-50 p-3 rounded-lg">
                <p className="text-xs text-green-600 font-medium">AVG PASS RATE</p>
                <p className="text-xl font-bold">{hourlyQualityData.reduce((acc, curr) => acc + curr.passRate, 0) / hourlyQualityData.length}%</p>
                <p className="text-xs text-muted-foreground">hourly average</p>
              </div>
              <div className="flex flex-col items-center bg-red-50 p-3 rounded-lg">
                <p className="text-xs text-red-600 font-medium">AVG DEFECT RATE</p>
                <p className="text-xl font-bold">{hourlyQualityData.reduce((acc, curr) => acc + curr.defectRate, 0) / hourlyQualityData.length}%</p>
                <p className="text-xs text-muted-foreground">hourly average</p>
              </div>
              <div className="flex flex-col items-center bg-amber-50 p-3 rounded-lg">
                <p className="text-xs text-amber-600 font-medium">CRITICAL DEFECTS</p>
                <p className="text-xl font-bold">{hourlyQualityData.reduce((acc, curr) => acc + curr.criticalDefects, 0)}</p>
                <p className="text-xs text-muted-foreground">past 10 hours</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Department Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div 
          custom={5} 
          initial="hidden" 
          animate="visible" 
          variants={itemAnimation}
        >
          <Card>
            <CardHeader>
              <CardTitle>Quality by Inspection Point</CardTitle>
            </CardHeader>
            <CardContent>
              <TremorCard>
                <BarChart
                  className="h-80"
                  data={defectsByDepartment}
                  index="department"
                  categories={["rate"]}
                  colors={["rose"]}
                  valueFormatter={(value) => `${value}%`}
                  stack={false}
                  showAnimation={true}
                  yAxisWidth={40}
                />
              </TremorCard>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          custom={6} 
          initial="hidden" 
          animate="visible" 
          variants={itemAnimation}
        >
          <Card>
            <CardHeader>
              <CardTitle>Defect Types Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <TremorCard>
                <DonutChart
                  className="h-80"
                  data={defectTypesData}
                  index="type"
                  category="percentage"
                  colors={["slate", "violet", "indigo", "rose", "cyan", "amber", "emerald"]}
                  valueFormatter={(value) => `${value}%`}
                  showAnimation={true}
                />
              </TremorCard>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quality Trends */}
      <motion.div 
        custom={7} 
        initial="hidden" 
        animate="visible" 
        variants={itemAnimation}
        className="lg:col-span-3"
      >
        <Card>
          <CardHeader>
            <CardTitle>Quality Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <TremorCard>
              <LineChart
                className="h-72"
                data={defectTrendsData}
                index="date"
                categories={["defectRate", "reworkRate", "rejectionRate"]}
                colors={["rose", "amber", "red"]}
                valueFormatter={(value) => `${value}%`}
                showAnimation={true}
                yAxisWidth={40}
              />
            </TremorCard>
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Quality Recommendations */}
      <motion.div 
        custom={8} 
        initial="hidden" 
        animate="visible" 
        variants={itemAnimation}
      >
        <Card>
          <CardHeader>
            <CardTitle>AI-Powered Quality Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 border border-amber-200 bg-amber-50 rounded-md">
                <div className="flex-shrink-0 mt-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-amber-800">Stitching Quality Alert</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    Stitching defects have increased by 15% in the past 2 hours at Sewing Station #3. AI identifies improper thread tension as the likely cause. Recommend immediate machine adjustment.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 border border-blue-200 bg-blue-50 rounded-md">
                <div className="flex-shrink-0 mt-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <circle cx="12" cy="15" r="2"></circle>
                    <path d="M12 12v1"></path>
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-blue-800">Pattern Optimization</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Analysis of cutting defects shows 30% are related to pattern placement. AI recommends adjusting the pattern layout for Style ST-1002 to increase material utilization and reduce defects by an estimated 22%.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 border border-green-200 bg-green-50 rounded-md">
                <div className="flex-shrink-0 mt-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="22"></line>
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-green-800">Quality Improvement Opportunity</h3>
                  <p className="text-sm text-green-700 mt-1">
                    Fabric stain defects are 68% higher during the 12-1 PM period. AI identifies lunch break returning operators as the probable cause. Recommend implementing hand-washing protocol and providing fabric-safe hand sanitizer at workstations.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default QualityDashboard;