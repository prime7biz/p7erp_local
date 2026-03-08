import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LineChart, BarChart, ScatterChart, DonutChart, Card as TremorCard } from "@tremor/react";

// Icons
import { Brain, AlertTriangle, Lightbulb, Search, BarChart2, Clock, Settings, Zap, TrendingUp, ArrowRight, Users } from "lucide-react";

const AIProductionInsights = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');

  // Animation variants
  const containerAnimation = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemAnimation = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.5
      }
    }
  };

  // Sample AI insights data
  const aiInsights = [
    {
      id: "insight-1",
      title: "Production Efficiency Optimization",
      type: "recommendation",
      severity: "medium",
      department: "Sewing",
      description: "AI analysis reveals a 12% drop in production efficiency during shift transitions. Implementing a 15-minute overlap between shifts could increase daily output by 8%.",
      impact: 8.2,
      confidence: 92,
      generatedAt: "2023-06-01T10:45:00Z"
    },
    {
      id: "insight-2",
      title: "Dyeing Department Bottleneck",
      type: "bottleneck",
      severity: "high",
      department: "Dyeing",
      description: "Current dyeing department setup is creating a significant bottleneck. Machine utilization is at 73% while downstream departments are operating at only 60% capacity due to material wait times.",
      impact: 15.3,
      confidence: 89,
      generatedAt: "2023-06-01T09:30:00Z"
    },
    {
      id: "insight-3",
      title: "Inventory Optimization",
      type: "suggestion",
      severity: "low",
      department: "Materials",
      description: "Current inventory levels for blue denim fabric exceed optimal levels by 23%. Consider reducing next order by 15% to optimize inventory carrying costs.",
      impact: 4.7,
      confidence: 87,
      generatedAt: "2023-06-01T11:20:00Z"
    },
    {
      id: "insight-4",
      title: "Maintenance Schedule Optimization",
      type: "prediction",
      severity: "medium",
      department: "Cutting",
      description: "Machine C-12 vibration patterns suggest maintenance will be required within 72 hours. Scheduling preventive maintenance now could prevent 8 hours of unplanned downtime.",
      impact: 6.8,
      confidence: 94,
      generatedAt: "2023-06-01T08:15:00Z"
    },
    {
      id: "insight-5",
      title: "Quality Control Enhancement",
      type: "recommendation",
      severity: "high",
      department: "Quality",
      description: "Pattern analysis shows 78% of quality defects occur in the final 2 hours of shifts. Implementing an additional mid-shift quality check could reduce defect rates by 35%.",
      impact: 12.1,
      confidence: 91,
      generatedAt: "2023-06-01T14:40:00Z"
    }
  ];

  // Production anomalies
  const productionAnomalies = [
    {
      id: "anomaly-1",
      timestamp: "2023-06-01T08:45:00Z",
      department: "Cutting",
      metric: "Production Rate",
      expected: 120,
      actual: 82,
      deviation: -31.7,
      status: "investigating"
    },
    {
      id: "anomaly-2",
      timestamp: "2023-06-01T10:15:00Z",
      department: "Dyeing",
      metric: "Quality Pass Rate",
      expected: 98.5,
      actual: 92.1,
      deviation: -6.5,
      status: "resolved"
    },
    {
      id: "anomaly-3",
      timestamp: "2023-06-01T11:30:00Z",
      department: "Sewing",
      metric: "Machine Downtime",
      expected: 15,
      actual: 42,
      deviation: 180.0,
      status: "open"
    }
  ];

  // Predictive forecasting data
  const forecastData = [
    { date: "Jun 1", actual: 4200, predicted: 4250 },
    { date: "Jun 2", actual: 4150, predicted: 4180 },
    { date: "Jun 3", actual: 4300, predicted: 4290 },
    { date: "Jun 4", actual: 4250, predicted: 4270 },
    { date: "Jun 5", actual: 4310, predicted: 4320 },
    { date: "Jun 6", actual: null, predicted: 4340 },
    { date: "Jun 7", actual: null, predicted: 4380 },
    { date: "Jun 8", actual: null, predicted: 4410 },
    { date: "Jun 9", actual: null, predicted: 4350 },
    { date: "Jun 10", actual: null, predicted: 4390 },
  ];

  // Department-wise AI score
  const departmentScores = [
    { department: "Knitting", score: 87, potential: 94 },
    { department: "Dyeing", score: 72, potential: 91 },
    { department: "AOP", score: 85, potential: 92 },
    { department: "Cutting", score: 89, potential: 95 },
    { department: "Print", score: 82, potential: 93 },
    { department: "Embroidery", score: 86, potential: 94 },
    { department: "Sewing", score: 79, potential: 92 },
    { department: "Wash", score: 88, potential: 94 },
    { department: "Iron", score: 90, potential: 95 },
    { department: "Folding", score: 86, potential: 92 },
    { department: "Packing", score: 91, potential: 96 },
  ];

  // Optimization heatmap (correlations between variables)
  const optimizationData = [
    { x: 8, y: 75, department: "Knitting" },
    { x: 6, y: 62, department: "Dyeing" },
    { x: 9, y: 81, department: "Cutting" },
    { x: 7, y: 76, department: "Sewing" },
    { x: 12, y: 91, department: "Folding" },
    { x: 11, y: 88, department: "Packing" },
  ];

  // Get severity badge
  const getSeverityBadge = (severity: string) => {
    switch(severity.toLowerCase()) {
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'medium':
        return <Badge variant="default" className="bg-amber-500">Medium</Badge>;
      case 'low':
        return <Badge variant="outline" className="border-blue-500 text-blue-500">Low</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Get insight type icon
  const getInsightTypeIcon = (type: string) => {
    switch(type.toLowerCase()) {
      case 'recommendation':
        return <Lightbulb className="h-4 w-4 text-amber-500" />;
      case 'bottleneck':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'suggestion':
        return <Zap className="h-4 w-4 text-blue-500" />;
      case 'prediction':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      default:
        return <Brain className="h-4 w-4 text-purple-500" />;
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Handle custom AI prompt
  const handleAiPromptSubmit = () => {
    if (!aiPrompt.trim()) return;
    
    console.log("Sending AI prompt:", aiPrompt);
    // In a real app, this would send the prompt to an API
    
    // Clear the input
    setAiPrompt('');
  };

  return (
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <Brain className="h-4 w-4 mr-2" />
            AI Overview
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Lightbulb className="h-4 w-4 mr-2" />
            Insights
          </TabsTrigger>
          <TabsTrigger value="anomalies">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Anomalies
          </TabsTrigger>
          <TabsTrigger value="forecasting">
            <TrendingUp className="h-4 w-4 mr-2" />
            Forecasting
          </TabsTrigger>
          <TabsTrigger value="ask-ai">
            <Search className="h-4 w-4 mr-2" />
            Ask AI
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <motion.div variants={itemAnimation} className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">AI Insights Generated</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Brain className="h-8 w-8 text-primary mr-3" />
                  <div className="text-4xl font-bold">{aiInsights.length}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Across all production departments
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Potential Efficiency Gain</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <TrendingUp className="h-8 w-8 text-green-500 mr-3" />
                  <div className="text-4xl font-bold">14.3%</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  By implementing all AI recommendations
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">AI Prediction Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <BarChart2 className="h-8 w-8 text-blue-500 mr-3" />
                  <div className="text-4xl font-bold">92.7%</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Based on historical predictions
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Anomalies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <AlertTriangle className="h-8 w-8 text-amber-500 mr-3" />
                  <div className="text-4xl font-bold">2</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Requiring attention
                </p>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Department AI Optimization Score</CardTitle>
                <CardDescription>
                  Current performance scores and potential improvements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-80"
                    data={departmentScores}
                    index="department"
                    categories={["score", "potential"]}
                    colors={["blue", "indigo"]}
                    valueFormatter={(value) => `${value}%`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div variants={itemAnimation} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Production Insights</CardTitle>
                <CardDescription>
                  Most impactful AI-generated insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {aiInsights.slice(0, 3).map(insight => (
                    <div key={insight.id} className="flex gap-3 p-3 border rounded-lg">
                      <div className="mt-0.5">
                        {getInsightTypeIcon(insight.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium text-sm">{insight.title}</h3>
                          {getSeverityBadge(insight.severity)}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {insight.description}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="text-xs text-muted-foreground">{insight.department} • Impact: +{insight.impact}%</div>
                          <Button variant="link" size="sm" className="h-auto p-0">
                            <span className="text-xs">Details</span>
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Production Optimization Matrix</CardTitle>
                <CardDescription>
                  Staff-to-output correlation by department
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <ScatterChart
                    className="h-80"
                    data={optimizationData}
                    category="department"
                    x="x"
                    y="y"
                    size="y"
                    colors={["blue"]}
                    valueFormatter={{
                      x: (value) => `${value} staff`,
                      y: (value) => `${value}% output`,
                    }}
                    showLegend={false}
                    showAnimation={true}
                  />
                </TremorCard>
                <div className="mt-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    X-axis: Staff count • Y-axis: Production output percentage
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="insights" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold mb-1">AI-Generated Production Insights</h2>
              <p className="text-sm text-muted-foreground">Recommendations and opportunities for optimization</p>
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="recommendation">Recommendations</SelectItem>
                <SelectItem value="bottleneck">Bottlenecks</SelectItem>
                <SelectItem value="suggestion">Suggestions</SelectItem>
                <SelectItem value="prediction">Predictions</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {aiInsights.map(insight => (
              <motion.div 
                key={insight.id}
                variants={itemAnimation}
                className={`border rounded-lg overflow-hidden ${
                  selectedInsight === insight.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedInsight(insight.id === selectedInsight ? null : insight.id)}
              >
                <div className="flex items-start p-4">
                  <div className="mt-1 mr-4">
                    {getInsightTypeIcon(insight.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                      <h3 className="font-medium">{insight.title}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-gray-100">{insight.department}</Badge>
                        {getSeverityBadge(insight.severity)}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {insight.description}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Potential Impact:</span>{' '}
                        <span className="font-medium text-green-600">+{insight.impact}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Confidence:</span>{' '}
                        <span className="font-medium">{insight.confidence}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Generated:</span>{' '}
                        <span className="font-medium">{formatTimestamp(insight.generatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {selectedInsight === insight.id && (
                  <div className="bg-muted/30 p-4 border-t">
                    <h4 className="font-medium mb-2">Implementation Steps</h4>
                    <ol className="list-decimal pl-5 space-y-2 text-sm">
                      <li>Review current {insight.department} department setup and validate AI findings</li>
                      <li>Develop implementation plan with department manager</li>
                      <li>Create A/B test to validate potential gains</li>
                      <li>Schedule implementation during low-production period</li>
                      <li>Monitor key metrics before and after implementation</li>
                    </ol>
                    <div className="flex gap-2 mt-4">
                      <Button size="sm">Implement</Button>
                      <Button size="sm" variant="outline">Dismiss</Button>
                      <Button size="sm" variant="outline">Request Details</Button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="anomalies" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold mb-1">Production Anomalies</h2>
              <p className="text-sm text-muted-foreground">Detected deviations from expected production patterns</p>
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="rounded-md border">
            <div className="grid grid-cols-12 gap-4 py-3 px-4 bg-muted/50 font-medium text-sm">
              <div className="col-span-3">Anomaly</div>
              <div className="col-span-2">Department</div>
              <div className="col-span-2">Expected</div>
              <div className="col-span-2">Actual</div>
              <div className="col-span-1">Deviation</div>
              <div className="col-span-2">Status</div>
            </div>
            
            {productionAnomalies.map((anomaly, index) => (
              <motion.div 
                key={anomaly.id}
                variants={itemAnimation}
                className="grid grid-cols-12 gap-4 py-3 px-4 items-center border-t"
              >
                <div className="col-span-3">
                  <div className="font-medium">{anomaly.metric}</div>
                  <div className="text-xs text-muted-foreground">{formatTimestamp(anomaly.timestamp)}</div>
                </div>
                <div className="col-span-2">{anomaly.department}</div>
                <div className="col-span-2">{anomaly.expected}</div>
                <div className="col-span-2">{anomaly.actual}</div>
                <div className="col-span-1">
                  <span className={`font-medium ${anomaly.deviation < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {anomaly.deviation > 0 ? '+' : ''}{anomaly.deviation.toFixed(1)}%
                  </span>
                </div>
                <div className="col-span-2">
                  <Badge
                    className={`${
                      anomaly.status === 'open' ? 'bg-red-500' :
                      anomaly.status === 'investigating' ? 'bg-amber-500' :
                      'bg-green-500'
                    }`}
                  >
                    {anomaly.status.charAt(0).toUpperCase() + anomaly.status.slice(1)}
                  </Badge>
                </div>
              </motion.div>
            ))}
          </div>
          
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Anomaly Distribution</CardTitle>
                <CardDescription>Categorization of detected production anomalies</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col md:flex-row items-center md:justify-evenly gap-6">
                <TremorCard className="max-w-xs">
                  <DonutChart
                    className="h-60"
                    data={[
                      { name: "Machine Issues", value: 42 },
                      { name: "Process Deviation", value: 28 },
                      { name: "Material Quality", value: 18 },
                      { name: "Operator Error", value: 12 },
                    ]}
                    category="value"
                    index="name"
                    colors={["blue", "amber", "emerald", "rose"]}
                    valueFormatter={(value) => `${value}%`}
                    showAnimation={true}
                  />
                </TremorCard>
                
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <h3 className="font-medium text-blue-700">AI Root Cause Analysis</h3>
                    <p className="text-sm text-blue-600 mt-1">
                      42% of anomalies stem from machine calibration issues, most prevalent in the Dyeing department.
                    </p>
                  </div>
                  
                  <div className="bg-amber-50 p-3 rounded-lg">
                    <h3 className="font-medium text-amber-700">Recommended Action</h3>
                    <p className="text-sm text-amber-600 mt-1">
                      Implement standardized calibration procedures for Dyeing machines and conduct operator refresher training to reduce anomalies by an estimated 35%.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="forecasting" className="space-y-6">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Production Forecasting</CardTitle>
                <CardDescription>AI-powered production output predictions</CardDescription>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <LineChart
                    className="h-80"
                    data={forecastData}
                    index="date"
                    categories={["actual", "predicted"]}
                    colors={["blue", "indigo"]}
                    valueFormatter={(value) => value ? `${value} units` : "No data"}
                    showAnimation={true}
                    connectNulls={true}
                    yAxisWidth={60}
                  />
                </TremorCard>
              </CardContent>
            </Card>
          </motion.div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Forecast Confidence</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Overall Confidence</span>
                        <span className="text-sm">92%</span>
                      </div>
                      <Progress value={92} className="h-2" />
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">7-Day Accuracy</span>
                        <span className="text-sm">94%</span>
                      </div>
                      <Progress value={94} className="h-2" />
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">30-Day Accuracy</span>
                        <span className="text-sm">88%</span>
                      </div>
                      <Progress value={88} className="h-2" />
                    </div>
                    
                    <div className="p-3 bg-blue-50 rounded-lg mt-5">
                      <div className="flex items-start gap-2">
                        <Brain className="h-4 w-4 text-blue-500 mt-1" />
                        <div>
                          <h4 className="font-medium text-blue-700">Forecast Insight</h4>
                          <p className="text-sm text-blue-600 mt-1">
                            Current 10-day forecast suggests a 3.2% increase in production output. Key contributing factors include recent equipment optimization and improved material flow.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Forecast Variables</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-blue-500" />
                        <div>
                          <div className="font-medium">Workforce Availability</div>
                          <div className="text-sm text-muted-foreground">Current: 96% of capacity</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                        High Impact
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Settings className="h-5 w-5 text-indigo-500" />
                        <div>
                          <div className="font-medium">Equipment Uptime</div>
                          <div className="text-sm text-muted-foreground">Current: 94.2% operational</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                        High Impact
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-amber-500" />
                        <div>
                          <div className="font-medium">Material Lead Times</div>
                          <div className="text-sm text-muted-foreground">Current: 2.3 days average</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                        Medium Impact
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Zap className="h-5 w-5 text-blue-500" />
                        <div>
                          <div className="font-medium">Process Efficiency</div>
                          <div className="text-sm text-muted-foreground">Current: 87.4% of target</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                        High Impact
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </TabsContent>
        
        <TabsContent value="ask-ai" className="space-y-6">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Ask Production AI</CardTitle>
                <CardDescription>
                  Query the AI system for production optimization insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Textarea 
                    placeholder="Ask a question about production optimization, bottlenecks, or forecasting... (e.g., 'How can we optimize the cutting department efficiency?')"
                    className="min-h-24"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button 
                      onClick={handleAiPromptSubmit}
                      disabled={!aiPrompt.trim()}
                    >
                      <Brain className="h-4 w-4 mr-2" />
                      Analyze
                    </Button>
                  </div>
                </div>
                
                <div className="mt-6 space-y-4">
                  <h3 className="font-medium">Sample Questions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div 
                      className="border rounded-lg p-3 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setAiPrompt("What are the main bottlenecks in our current production process?")}
                    >
                      <Search className="h-4 w-4 text-blue-500 mb-1" />
                      <p className="text-sm">What are the main bottlenecks in our current production process?</p>
                    </div>
                    
                    <div 
                      className="border rounded-lg p-3 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setAiPrompt("How can we improve efficiency in the dyeing department?")}
                    >
                      <Search className="h-4 w-4 text-blue-500 mb-1" />
                      <p className="text-sm">How can we improve efficiency in the dyeing department?</p>
                    </div>
                    
                    <div 
                      className="border rounded-lg p-3 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setAiPrompt("Forecast production output for the next 30 days")}
                    >
                      <Search className="h-4 w-4 text-blue-500 mb-1" />
                      <p className="text-sm">Forecast production output for the next 30 days</p>
                    </div>
                    
                    <div 
                      className="border rounded-lg p-3 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setAiPrompt("Analyze quality issues in the sewing department")}
                    >
                      <Search className="h-4 w-4 text-blue-500 mb-1" />
                      <p className="text-sm">Analyze quality issues in the sewing department</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6">
                  <h3 className="font-medium mb-3">Recent AI Responses</h3>
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <Brain className="h-5 w-5 text-primary mt-1" />
                        <div>
                          <h4 className="font-medium">Production Output Optimization</h4>
                          <p className="text-sm text-muted-foreground">Query: How can we increase daily production output?</p>
                        </div>
                      </div>
                      <div className="bg-muted/20 p-3 rounded-lg">
                        <p className="text-sm">
                          Analysis of your current production data indicates three main opportunities for increasing daily output:
                        </p>
                        <ol className="text-sm mt-2 space-y-1 list-decimal pl-4">
                          <li>Optimize shift transitions by implementing a 15-minute overlap, potentially increasing daily output by 3.8%</li>
                          <li>Adjust machine setup procedures in the cutting department, which could reduce downtime by 45 minutes daily</li>
                          <li>Implement AI-suggested workflow improvements in the sewing department to increase operator efficiency by 7.2%</li>
                        </ol>
                        <p className="text-sm mt-2">
                          Combined, these changes could potentially increase daily production output by 9-12% based on current staffing and equipment.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default AIProductionInsights;