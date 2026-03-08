import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TabsContent, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, AreaChart, LineChart, Card as TremorCard } from "@tremor/react";
import { Badge } from "@/components/ui/badge";

// Icons
import { Activity, AlertTriangle, Zap, ArrowUpRight, ArrowDownRight, Users, ClipboardCheck } from "lucide-react";

interface DepartmentQualityViewProps {
  stationId: string;
  stationName: string;
  timeInterval: string;
  dateRange: string;
  selectedStyle: string;
  onTimeIntervalChange: (value: string) => void;
}

interface DefectData {
  id: number;
  type: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  count: number;
  status: 'open' | 'investigating' | 'resolved';
  timestamp: string;
}

interface InspectorData {
  id: number;
  name: string;
  shift: string;
  position: string;
  inspections: number;
  findingsRate: number;
  status: 'active' | 'break' | 'training';
}

const DepartmentQualityView: React.FC<DepartmentQualityViewProps> = ({
  stationId,
  stationName,
  timeInterval,
  dateRange,
  selectedStyle,
  onTimeIntervalChange
}) => {
  const [activeTab, setActiveTab] = useState('overview');

  // Animation variants for quality view elements
  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut"
      }
    },
    exit: { opacity: 0, y: -20 }
  };

  // Mock data for inspection point quality metrics
  // In a real application, this would come from an API call
  const stationData = {
    inspections: {
      total: 240,
      passed: 218,
      failed: 22,
      passRate: 90.8,
      previousPeriodRate: 88.5,
      hourlyTarget: 30,
      hourlyActual: 28,
    },
    defects: {
      total: 34,
      critical: 3,
      major: 12,
      minor: 19,
      defectRate: 9.2,
      topDefect: "Color Shading",
      topDefectCount: 8
    },
    workforce: {
      totalInspectors: 5,
      presentToday: 5,
      efficiency: 92,
      trainees: 1
    },
    trends: {
      improvingAreas: ["Thread Tension", "Fabric Finish"],
      problemAreas: ["Color Uniformity", "Print Alignment"]
    }
  };

  // Hourly inspection data 
  const hourlyData = [
    { hour: "8 AM", inspections: 28, passRate: 92.9, defects: 2 },
    { hour: "9 AM", inspections: 31, passRate: 90.3, defects: 3 },
    { hour: "10 AM", inspections: 29, passRate: 93.1, defects: 2 },
    { hour: "11 AM", inspections: 30, passRate: 90.0, defects: 3 },
    { hour: "12 PM", inspections: 22, passRate: 86.4, defects: 3 },
    { hour: "1 PM", inspections: 25, passRate: 88.0, defects: 3 },
    { hour: "2 PM", inspections: 27, passRate: 92.6, defects: 2 },
    { hour: "3 PM", inspections: 32, passRate: 93.8, defects: 2 },
    { hour: "4 PM", inspections: 29, passRate: 89.7, defects: 3 },
    { hour: "5 PM", inspections: 26, passRate: 92.3, defects: 2 },
  ];

  // Defect data
  const defectsData: DefectData[] = [
    { id: 1, type: "Color Shading", description: "Inconsistent color shade across the fabric", severity: 'major', count: 8, status: 'investigating', timestamp: "2023-05-18T08:45:00Z" },
    { id: 2, type: "Thread Breakage", description: "Thread broken in seam", severity: 'minor', count: 5, status: 'resolved', timestamp: "2023-05-18T09:15:00Z" },
    { id: 3, type: "Print Misalignment", description: "Print pattern not aligned with fabric grain", severity: 'major', count: 4, status: 'open', timestamp: "2023-05-18T10:30:00Z" },
    { id: 4, type: "Fabric Tear", description: "Small tear near collar assembly", severity: 'critical', count: 2, status: 'investigating', timestamp: "2023-05-18T11:45:00Z" },
    { id: 5, type: "Oil Stain", description: "Machine oil stain on fabric", severity: 'major', count: 3, status: 'open', timestamp: "2023-05-18T13:30:00Z" },
  ];

  // Inspectors data
  const inspectorsData: InspectorData[] = [
    { id: 1, name: "Arjun Singh", shift: "Morning", position: "Senior QC", inspections: 68, findingsRate: 8.8, status: 'active' },
    { id: 2, name: "Priya Patel", shift: "Morning", position: "QC Inspector", inspections: 62, findingsRate: 9.7, status: 'active' },
    { id: 3, name: "Rahul Kumar", shift: "Evening", position: "QC Inspector", inspections: 58, findingsRate: 10.3, status: 'break' },
    { id: 4, name: "Deepa Sharma", shift: "Evening", position: "Senior QC", inspections: 65, findingsRate: 7.7, status: 'active' },
    { id: 5, name: "Amit Verma", shift: "Morning", position: "QC Trainee", inspections: 42, findingsRate: 11.9, status: 'training' },
  ];

  // Defect trend data
  const defectTrendData = [
    { week: "Week 16", colorShading: 12, threadBreakage: 8, printMisalignment: 7, fabricTear: 3, oilStain: 5 },
    { week: "Week 17", colorShading: 10, threadBreakage: 6, printMisalignment: 8, fabricTear: 2, oilStain: 4 },
    { week: "Week 18", colorShading: 9, threadBreakage: 5, printMisalignment: 6, fabricTear: 3, oilStain: 4 },
    { week: "Week 19", colorShading: 8, threadBreakage: 5, printMisalignment: 4, fabricTear: 2, oilStain: 3 },
    { week: "Week 20", colorShading: 8, threadBreakage: 5, printMisalignment: 4, fabricTear: 2, oilStain: 3 },
  ];

  // Get severity badge
  const getSeverityBadge = (severity: string) => {
    switch(severity) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'major':
        return <Badge variant="default" className="bg-amber-500">Major</Badge>;
      case 'minor':
        return <Badge variant="outline" className="border-blue-500 text-blue-500">Minor</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Get status color class
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'active':
        return 'bg-green-500';
      case 'break':
        return 'bg-blue-500';
      case 'training':
        return 'bg-amber-500';
      case 'open':
        return 'bg-red-500';
      case 'investigating':
        return 'bg-amber-500';
      case 'resolved':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
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
          <ArrowUpRight className="h-4 w-4 mr-1" />
          <span className="text-xs">+{changePercent}%</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-rose-600">
          <ArrowDownRight className="h-4 w-4 mr-1" />
          <span className="text-xs">{changePercent}%</span>
        </div>
      );
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeIn}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
        <div>
          <h2 className="text-xl font-bold">{stationName} Inspection</h2>
          <p className="text-sm text-muted-foreground">
            Quality metrics and defect analysis
          </p>
        </div>
        <div className="mt-3 sm:mt-0 flex items-center gap-2">
          {selectedStyle !== 'all' && (
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
              Style: {selectedStyle}
            </Badge>
          )}
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
      </div>
      
      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="defects">Defects</TabsTrigger>
          <TabsTrigger value="inspectors">Inspectors</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          {/* Station KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-bold">{stationData.inspections.passRate}%</span>
                  {getTrendIndicator(stationData.inspections.passRate, stationData.inspections.previousPeriodRate)}
                </div>
                <Progress 
                  value={stationData.inspections.passRate} 
                  className="h-2" 
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {stationData.inspections.passed}/{stationData.inspections.total} inspections passed
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Defect Rate</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-bold">{stationData.defects.defectRate}%</span>
                  <div className="flex items-center text-emerald-600">
                    <ArrowDownRight className="h-4 w-4 mr-1" />
                    <span className="text-xs">-0.8%</span>
                  </div>
                </div>
                <Progress 
                  value={stationData.defects.defectRate * 5} 
                  className="h-2 bg-red-50" 
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {stationData.defects.total} defects identified
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Inspection Rate</CardTitle>
                  <Activity className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-bold">{stationData.inspections.hourlyActual}/{stationData.inspections.hourlyTarget}</span>
                  <div className="flex items-center text-rose-600">
                    <ArrowDownRight className="h-4 w-4 mr-1" />
                    <span className="text-xs">-2</span>
                  </div>
                </div>
                <Progress 
                  value={(stationData.inspections.hourlyActual / stationData.inspections.hourlyTarget) * 100} 
                  className="h-2" 
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Hourly inspection rate
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
                  <Zap className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-bold">{stationData.defects.critical}</span>
                  <div className="flex items-center text-emerald-600">
                    <ArrowDownRight className="h-4 w-4 mr-1" />
                    <span className="text-xs">-1</span>
                  </div>
                </div>
                <Progress 
                  value={(stationData.defects.critical / stationData.defects.total) * 100} 
                  className="h-2 bg-red-50" 
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Critical defects identified
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Hourly Quality Tracking */}
          <Card>
            <CardHeader>
              <CardTitle>Hourly Quality Tracking</CardTitle>
              <CardDescription>Quality metrics for {stationName} inspection point today</CardDescription>
            </CardHeader>
            <CardContent>
              <TremorCard>
                <AreaChart
                  className="h-72"
                  data={hourlyData}
                  index="hour"
                  categories={["passRate", "defects"]}
                  colors={["emerald", "rose"]}
                  valueFormatter={(value) => `${value}`}
                  showAnimation={true}
                />
              </TremorCard>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div className="flex flex-col items-center bg-blue-50 p-3 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium">TOTAL INSPECTIONS</p>
                  <p className="text-xl font-bold">{hourlyData.reduce((acc, curr) => acc + curr.inspections, 0)}</p>
                  <p className="text-xs text-muted-foreground">today</p>
                </div>
                <div className="flex flex-col items-center bg-green-50 p-3 rounded-lg">
                  <p className="text-xs text-green-600 font-medium">AVG PASS RATE</p>
                  <p className="text-xl font-bold">{(hourlyData.reduce((acc, curr) => acc + curr.passRate, 0) / hourlyData.length).toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">hourly average</p>
                </div>
                <div className="flex flex-col items-center bg-red-50 p-3 rounded-lg">
                  <p className="text-xs text-red-600 font-medium">TOTAL DEFECTS</p>
                  <p className="text-xl font-bold">{hourlyData.reduce((acc, curr) => acc + curr.defects, 0)}</p>
                  <p className="text-xs text-muted-foreground">identified today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Top Defects */}
          <Card>
            <CardHeader>
              <CardTitle>Top Defects</CardTitle>
              <CardDescription>Most common quality issues at this inspection point</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {defectsData.slice(0, 3).map((defect, index) => (
                  <div key={defect.id} className="flex items-start">
                    <div className={`h-2 w-2 rounded-full mt-2 mr-2 ${
                      defect.severity === 'critical' ? 'bg-red-500' : 
                      defect.severity === 'major' ? 'bg-amber-500' : 'bg-blue-500'
                    }`}></div>
                    <div className="flex-1">
                      <div className="flex items-center">
                        <div className="font-medium">{defect.type}</div>
                        <span className="text-xs text-gray-600 ml-2">({defect.count} instances)</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{defect.description}</p>
                    </div>
                    <div>
                      {getSeverityBadge(defect.severity)}
                    </div>
                  </div>
                ))}
                
                <Button variant="outline" size="sm" className="w-full mt-2">View All Defects</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="defects" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Defect Analysis</CardTitle>
              <CardDescription>All identified quality issues at {stationName}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="grid grid-cols-12 gap-4 py-3 px-4 bg-muted/50 font-medium text-sm">
                  <div className="col-span-3">Defect Type</div>
                  <div className="col-span-4">Description</div>
                  <div className="col-span-1">Count</div>
                  <div className="col-span-2">Severity</div>
                  <div className="col-span-2">Status</div>
                </div>
                {defectsData.map((defect) => (
                  <div key={defect.id} className="grid grid-cols-12 gap-4 py-3 px-4 border-t items-center text-sm">
                    <div className="col-span-3 font-medium">{defect.type}</div>
                    <div className="col-span-4">{defect.description}</div>
                    <div className="col-span-1">{defect.count}</div>
                    <div className="col-span-2">
                      {getSeverityBadge(defect.severity)}
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center">
                        <span className={`h-2 w-2 rounded-full mr-1.5 ${getStatusColor(defect.status)}`}></span>
                        <span className="capitalize">{defect.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Defect Trend Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <LineChart
                    className="h-72"
                    data={defectTrendData}
                    index="week"
                    categories={["colorShading", "threadBreakage", "printMisalignment", "fabricTear", "oilStain"]}
                    colors={["indigo", "sky", "amber", "rose", "emerald"]}
                    valueFormatter={(value) => `${value}`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Defect Severity Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-72"
                    data={[
                      { severity: "Critical", count: stationData.defects.critical },
                      { severity: "Major", count: stationData.defects.major },
                      { severity: "Minor", count: stationData.defects.minor },
                    ]}
                    index="severity"
                    categories={["count"]}
                    colors={["rose"]}
                    valueFormatter={(value) => `${value}`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="inspectors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quality Inspectors Performance</CardTitle>
              <CardDescription>Current shift inspectors and productivity metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="grid grid-cols-12 gap-4 py-3 px-4 bg-muted/50 font-medium text-sm">
                  <div className="col-span-3">Inspector</div>
                  <div className="col-span-2">Position</div>
                  <div className="col-span-2">Shift</div>
                  <div className="col-span-2">Inspections</div>
                  <div className="col-span-2">Finding Rate</div>
                  <div className="col-span-1">Status</div>
                </div>
                {inspectorsData.map((inspector) => (
                  <div key={inspector.id} className="grid grid-cols-12 gap-4 py-3 px-4 border-t items-center text-sm">
                    <div className="col-span-3 font-medium">{inspector.name}</div>
                    <div className="col-span-2">{inspector.position}</div>
                    <div className="col-span-2">{inspector.shift}</div>
                    <div className="col-span-2">{inspector.inspections}</div>
                    <div className="col-span-2">
                      <div className="flex items-center">
                        <Progress 
                          value={inspector.findingsRate * 5} 
                          className="h-2 w-16 mr-2 bg-amber-100"
                        />
                        <span>{inspector.findingsRate}%</span>
                      </div>
                    </div>
                    <div className="col-span-1">
                      <div className="flex items-center">
                        <span className={`h-2 w-2 rounded-full mr-1.5 ${getStatusColor(inspector.status)}`}></span>
                        <span className="capitalize">{inspector.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Inspections Conducted</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-72"
                    data={inspectorsData}
                    index="name"
                    categories={["inspections"]}
                    colors={["blue"]}
                    valueFormatter={(value) => `${value}`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Finding Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-72"
                    data={inspectorsData}
                    index="name"
                    categories={["findingsRate"]}
                    colors={["amber"]}
                    valueFormatter={(value) => `${value}%`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="analysis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quality Trend Analysis</CardTitle>
              <CardDescription>Historical quality metrics for the {stationName} inspection point</CardDescription>
            </CardHeader>
            <CardContent>
              <TremorCard>
                <LineChart
                  className="h-80"
                  data={[
                    { date: "Jan", passRate: 91.2, defectRate: 8.8 },
                    { date: "Feb", passRate: 90.5, defectRate: 9.5 },
                    { date: "Mar", passRate: 89.8, defectRate: 10.2 },
                    { date: "Apr", passRate: 91.3, defectRate: 8.7 },
                    { date: "May", passRate: 90.8, defectRate: 9.2 },
                  ]}
                  index="date"
                  categories={["passRate", "defectRate"]}
                  colors={["green", "red"]}
                  valueFormatter={(value) => `${value}%`}
                  showAnimation={true}
                  curveType="monotone"
                />
              </TremorCard>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Key Improvement Areas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-green-900">Improving Quality Areas</p>
                    <div className="mt-2 space-y-2">
                      {stationData.trends.improvingAreas.map((area, index) => (
                        <div key={index} className="flex items-center">
                          <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                          <span className="text-sm text-green-800">{area}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                    <path d="M7 20h10"></path>
                    <path d="M10 20c5.5-2.5.8-10.5 4-15.5"></path>
                    <path d="M15.898 4.471c.992-1.472 2.543-1.91 3.242-1.38.7.53.643 1.425-.992 2.426-1.635 1-2.373 1.234-2.776 1.06-.404-.173-1.04-.5.526-2.106z"></path>
                  </svg>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-red-900">Problem Quality Areas</p>
                    <div className="mt-2 space-y-2">
                      {stationData.trends.problemAreas.map((area, index) => (
                        <div key={index} className="flex items-center">
                          <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                          <span className="text-sm text-red-800">{area}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                    <path d="M7 20v-5h10v5"></path>
                    <path d="M10 15v-4a3 3 0 0 1 5.9-1"></path>
                    <path d="M18 15v3"></path>
                    <path d="M4 5v.5"></path>
                    <path d="M4 15v3.5a2 2 0 1 0 4 0V15"></path>
                  </svg>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>AI Quality Forecast</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <LineChart
                    className="h-72"
                    data={[
                      { date: "May 18", actual: 90.8, predicted: 91.2 },
                      { date: "May 19", actual: null, predicted: 91.5 },
                      { date: "May 20", actual: null, predicted: 91.8 },
                      { date: "May 21", actual: null, predicted: 92.2 },
                      { date: "May 22", actual: null, predicted: 92.5 },
                    ]}
                    index="date"
                    categories={["actual", "predicted"]}
                    colors={["blue", "indigo"]}
                    valueFormatter={(value) => value ? `${value}%` : "No data"}
                    showAnimation={true}
                    connectNulls={true}
                  />
                </TremorCard>
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-700">AI Quality Insight</h4>
                  <p className="text-sm text-blue-600 mt-1">
                    Based on current trends and historical data for this inspection point, quality is predicted to 
                    improve by 1.7% over the next 4 days. Top recommendation: maintain current inspection protocols 
                    and investigate Color Uniformity issues which remain the primary defect source.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default DepartmentQualityView;