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
import { Brain, AlertTriangle, Lightbulb, Search, BarChart2, Clock, Settings, Zap, TrendingUp, ArrowRight, Eye, Camera, Microscope, LayoutDashboard, Workflow } from "lucide-react";

interface AIQualityInsightsProps {
  selectedStyle: string;
}

const AIQualityInsights: React.FC<AIQualityInsightsProps> = ({ selectedStyle }) => {
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
      title: "Frequent Color Shading in Finished Fabric",
      type: "pattern",
      severity: "high",
      department: "Finished Fabric",
      description: "AI has detected a recurring pattern of color shading defects in blue fabrics, particularly in batches processed between 1-3 PM. Analysis suggests inconsistent dyeing temperature is the root cause.",
      impact: 12.4,
      confidence: 94,
      generatedAt: "2023-05-18T09:45:00Z"
    },
    {
      id: "insight-2",
      title: "Stitching Quality Decline",
      type: "degradation",
      severity: "medium",
      department: "Sewing",
      description: "There's a 15% decline in stitching quality on Sewing Line #3 for the past 3 days. Machine vibration analysis indicates potential needle timing issues on machines 3, 7, and 9.",
      impact: 8.3,
      confidence: 91,
      generatedAt: "2023-05-18T08:30:00Z"
    },
    {
      id: "insight-3",
      title: "Print Misalignment Prediction",
      type: "prediction",
      severity: "medium",
      department: "Print",
      description: "Based on current trends, AI predicts a 35% increase in print misalignment defects over the next 48 hours if preventive action isn't taken. Substrate tension appears unstable.",
      impact: 7.5,
      confidence: 87,
      generatedAt: "2023-05-18T10:15:00Z"
    },
    {
      id: "insight-4",
      title: "Cutting Quality Improvement Opportunity",
      type: "improvement",
      severity: "low",
      department: "Cutting",
      description: "Analysis shows cutting defects are 28% higher on patterns with curved elements. AI recommends adjusting blade speed by 15% and implementing a 2-stage cutting approach for these patterns.",
      impact: 6.2,
      confidence: 89,
      generatedAt: "2023-05-18T11:30:00Z"
    },
    {
      id: "insight-5",
      title: "Critical Thread Tension Anomaly",
      type: "anomaly",
      severity: "critical",
      department: "Sewing",
      description: "Unusual thread tension variations detected in production lines during the last 4 hours. Pattern analysis shows correlation with environmental humidity changes. Immediate adjustment of machine tension settings recommended.",
      impact: 18.7,
      confidence: 96,
      generatedAt: "2023-05-18T07:40:00Z"
    }
  ];

  // Quality anomalies
  const qualityAnomalies = [
    {
      id: "anomaly-1",
      timestamp: "2023-05-18T08:45:00Z",
      department: "Final Inspection",
      metric: "Stitch Density",
      expected: 12,
      actual: 9.8,
      deviation: -18.3,
      status: "investigating"
    },
    {
      id: "anomaly-2",
      timestamp: "2023-05-18T10:15:00Z",
      department: "Pre-final Inspection",
      metric: "Color Consistency",
      expected: 98.5,
      actual: 92.8,
      deviation: -5.8,
      status: "open"
    },
    {
      id: "anomaly-3",
      timestamp: "2023-05-18T11:30:00Z",
      department: "Cutting Part",
      metric: "Dimensional Accuracy",
      expected: 99.2,
      actual: 97.5,
      deviation: -1.7,
      status: "resolved"
    }
  ];

  // Root cause analysis data
  const rootCauseData = [
    { cause: "Machine Settings", probability: 68 },
    { cause: "Material Variation", probability: 42 },
    { cause: "Operator Error", probability: 26 },
    { cause: "Environmental Factor", probability: 38 },
    { cause: "Process Design", probability: 15 }
  ];

  // Quality correlation data
  const qualityCorrelationData = [
    { factor: "Temperature", correlation: 0.83 },
    { factor: "Humidity", correlation: 0.72 },
    { factor: "Machine Speed", correlation: 0.65 },
    { factor: "Material Batch", correlation: 0.91 },
    { factor: "Operator Experience", correlation: 0.77 }
  ];

  // Visual defect detection data
  const visualDefectData = [
    { category: "Fabric Defects", count: 78, ai_detection_rate: 92 },
    { category: "Stitching Errors", count: 65, ai_detection_rate: 88 },
    { category: "Color Issues", count: 42, ai_detection_rate: 94 },
    { category: "Sizing Problems", count: 38, ai_detection_rate: 82 },
    { category: "Print Defects", count: 55, ai_detection_rate: 90 }
  ];

  // Department quality score
  const departmentScores = [
    { department: "Knitted Raw Fabric", score: 82, potential: 90 },
    { department: "Finished Fabric", score: 78, potential: 91 },
    { department: "Cutting Part", score: 85, potential: 92 },
    { department: "Print", score: 83, potential: 90 },
    { department: "Embroidery", score: 87, potential: 94 },
    { department: "Sewing", score: 76, potential: 89 },
    { department: "Finishing", score: 84, potential: 91 },
    { department: "In-line Inspection", score: 88, potential: 94 },
    { department: "Pre-final Inspection", score: 86, potential: 93 },
    { department: "Final Inspection", score: 90, potential: 96 },
  ];

  // Get severity badge
  const getSeverityBadge = (severity: string) => {
    switch(severity.toLowerCase()) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
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
      case 'pattern':
        return <Workflow className="h-4 w-4 text-blue-500" />;
      case 'degradation':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'prediction':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'improvement':
        return <Lightbulb className="h-4 w-4 text-amber-500" />;
      case 'anomaly':
        return <Zap className="h-4 w-4 text-purple-500" />;
      default:
        return <Brain className="h-4 w-4 text-blue-500" />;
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
            Quality Insights
          </TabsTrigger>
          <TabsTrigger value="anomalies">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Anomalies
          </TabsTrigger>
          <TabsTrigger value="visual-detection">
            <Eye className="h-4 w-4 mr-2" />
            Visual Detection
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
                  Across all inspection points
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Potential Quality Gain</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <TrendingUp className="h-8 w-8 text-green-500 mr-3" />
                  <div className="text-4xl font-bold">8.6%</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  By implementing AI recommendations
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">AI Detection Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Eye className="h-8 w-8 text-blue-500 mr-3" />
                  <div className="text-4xl font-bold">93.4%</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  For visual defect detection
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
                  <div className="text-4xl font-bold">3</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Quality issues needing attention
                </p>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>
                  Department Quality AI Score
                  {selectedStyle !== 'all' && (
                    <Badge className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-100">
                      Style: {selectedStyle}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Current AI-assessed quality scores and potential improvements
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
                    valueFormatter={(value) => `${value}/100`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div variants={itemAnimation} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Quality Insights</CardTitle>
                <CardDescription>
                  Most impactful AI-generated quality recommendations
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
                <CardTitle>Root Cause Analysis</CardTitle>
                <CardDescription>
                  AI-identified root causes of quality issues
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-60"
                    data={rootCauseData}
                    index="cause"
                    categories={["probability"]}
                    colors={["amber"]}
                    valueFormatter={(value) => `${value}%`}
                    showAnimation={true}
                  />
                </TremorCard>
                <div className="mt-3 text-sm">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-800">AI Insight</h4>
                    <p className="text-sm text-blue-600 mt-1">
                      Machine settings appear to be the dominant factor in current quality issues, with a 68% probability. The AI recommends a comprehensive calibration check of all machines in the Print and Dyeing departments.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="insights" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold mb-1">AI-Generated Quality Insights</h2>
              <p className="text-sm text-muted-foreground">Recommendations and quality improvement opportunities</p>
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="pattern">Patterns</SelectItem>
                <SelectItem value="degradation">Degradations</SelectItem>
                <SelectItem value="prediction">Predictions</SelectItem>
                <SelectItem value="improvement">Improvements</SelectItem>
                <SelectItem value="anomaly">Anomalies</SelectItem>
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
                    <h4 className="font-medium mb-2">Recommended Actions</h4>
                    <ol className="list-decimal pl-5 space-y-2 text-sm">
                      <li>Conduct detailed analysis of {insight.department} quality data to validate AI findings</li>
                      <li>Develop implementation plan with department QC manager</li>
                      <li>Run A/B test on a small batch to validate impact</li>
                      <li>Implement recommended changes</li>
                      <li>Monitor key quality metrics for 72 hours to verify improvement</li>
                    </ol>
                    <div className="flex gap-2 mt-4">
                      <Button size="sm">Implement</Button>
                      <Button size="sm" variant="outline">Schedule Review</Button>
                      <Button size="sm" variant="outline">Request Analysis</Button>
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
              <h2 className="text-xl font-bold mb-1">Quality Anomalies</h2>
              <p className="text-sm text-muted-foreground">AI-detected deviations from expected quality patterns</p>
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
              <div className="col-span-2">Time Detected</div>
              <div className="col-span-2">Department</div>
              <div className="col-span-2">Metric</div>
              <div className="col-span-2">Expected</div>
              <div className="col-span-2">Actual</div>
              <div className="col-span-1">Deviation</div>
              <div className="col-span-1">Status</div>
            </div>
            
            {qualityAnomalies.map((anomaly, index) => (
              <motion.div 
                key={anomaly.id}
                variants={itemAnimation}
                className="grid grid-cols-12 gap-4 py-3 px-4 items-center border-t"
              >
                <div className="col-span-2 text-sm">
                  {formatTimestamp(anomaly.timestamp)}
                </div>
                <div className="col-span-2 text-sm">{anomaly.department}</div>
                <div className="col-span-2 text-sm font-medium">{anomaly.metric}</div>
                <div className="col-span-2 text-sm">{anomaly.expected}</div>
                <div className="col-span-2 text-sm">{anomaly.actual}</div>
                <div className="col-span-1 text-sm">
                  <span className={`font-medium ${anomaly.deviation < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {anomaly.deviation > 0 ? '+' : ''}{anomaly.deviation.toFixed(1)}%
                  </span>
                </div>
                <div className="col-span-1">
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
                <CardTitle>Correlation Analysis</CardTitle>
                <CardDescription>AI-identified factors correlated with quality anomalies</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col md:flex-row items-center md:justify-evenly gap-6">
                <TremorCard className="max-w-xs">
                  <BarChart
                    className="h-72"
                    data={qualityCorrelationData}
                    index="factor"
                    categories={["correlation"]}
                    colors={["blue"]}
                    valueFormatter={(value) => value.toFixed(2)}
                    showAnimation={true}
                  />
                </TremorCard>
                
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <h3 className="font-medium text-blue-700">AI Correlation Analysis</h3>
                    <p className="text-sm text-blue-600 mt-1">
                      Material batch variation shows the strongest correlation (0.91) with quality anomalies. 
                      This suggests inconsistent material properties between batches is a significant factor.
                    </p>
                  </div>
                  
                  <div className="bg-amber-50 p-3 rounded-lg">
                    <h3 className="font-medium text-amber-700">Recommended Action</h3>
                    <p className="text-sm text-amber-600 mt-1">
                      Implement enhanced material batch testing before production to identify potential 
                      quality issues. Focus on color consistency and tensile properties which show the 
                      highest variation between batches.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="visual-detection" className="space-y-6">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>AI Visual Defect Detection</CardTitle>
                <CardDescription>
                  Performance metrics for computer vision-based quality inspection
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <TremorCard>
                      <DonutChart
                        className="h-60"
                        data={visualDefectData}
                        index="category"
                        category="count"
                        colors={["slate", "violet", "indigo", "rose", "cyan"]}
                        valueFormatter={(value) => `${value} defects`}
                        showAnimation={true}
                      />
                    </TremorCard>
                    <div className="mt-2 text-center text-sm text-muted-foreground">
                      Distribution of detected defect types
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="font-medium text-lg">AI Detection Accuracy</h3>
                    {visualDefectData.map((item, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">{item.category}</span>
                          <span className="text-sm">{item.ai_detection_rate}%</span>
                        </div>
                        <Progress value={item.ai_detection_rate} className="h-2" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Camera className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium text-blue-800">AI Vision System Updates</h3>
                      <p className="text-sm text-blue-700 mt-1">
                        Our AI vision system has been trained on over 50,000 fabric defect images and can detect 28 distinct defect types. The system is continuously improving through machine learning from quality inspector feedback. Recent system updates have improved detection accuracy by 7.2% for subtle color variations.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Visual Defect Examples</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="relative aspect-square bg-gray-100 rounded-md flex items-center justify-center">
                        <Microscope className="h-12 w-12 text-gray-400" />
                        <div className="absolute bottom-0 left-0 right-0 bg-red-500/20 p-2">
                          <div className="text-xs text-center font-medium">Fabric Hole (Detected)</div>
                        </div>
                      </div>
                      <div className="text-xs text-center text-muted-foreground">Confidence: 98.2%</div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="relative aspect-square bg-gray-100 rounded-md flex items-center justify-center">
                        <Microscope className="h-12 w-12 text-gray-400" />
                        <div className="absolute bottom-0 left-0 right-0 bg-red-500/20 p-2">
                          <div className="text-xs text-center font-medium">Color Variation (Detected)</div>
                        </div>
                      </div>
                      <div className="text-xs text-center text-muted-foreground">Confidence: 94.5%</div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="relative aspect-square bg-gray-100 rounded-md flex items-center justify-center">
                        <Microscope className="h-12 w-12 text-gray-400" />
                        <div className="absolute bottom-0 left-0 right-0 bg-red-500/20 p-2">
                          <div className="text-xs text-center font-medium">Stitch Skip (Detected)</div>
                        </div>
                      </div>
                      <div className="text-xs text-center text-muted-foreground">Confidence: 91.8%</div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="relative aspect-square bg-gray-100 rounded-md flex items-center justify-center">
                        <Microscope className="h-12 w-12 text-gray-400" />
                        <div className="absolute bottom-0 left-0 right-0 bg-red-500/20 p-2">
                          <div className="text-xs text-center font-medium">Print Misalignment (Detected)</div>
                        </div>
                      </div>
                      <div className="text-xs text-center text-muted-foreground">Confidence: 89.7%</div>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <Button variant="outline" size="sm" className="w-full">
                      <Eye className="h-4 w-4 mr-2" />
                      View Defect Library
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Future AI Vision Capabilities</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <LayoutDashboard className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Real-time Integration</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Soon our AI system will integrate with production machinery to provide real-time feedback and enable automatic defect correction in some processes.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <Workflow className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Predictive Quality Control</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Our AI will predict potential defects before they occur by analyzing early-stage production parameters and material characteristics.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <Brain className="h-5 w-5 text-purple-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Advanced Anomaly Detection</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Future AI updates will identify novel defect types without prior training, enabling detection of previously unknown quality issues.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <Settings className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">IoT Sensor Integration</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        We'll combine visual data with IoT sensor readings to create a comprehensive quality monitoring system across the entire production process.
                      </p>
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
                <CardTitle>Ask Quality AI</CardTitle>
                <CardDescription>
                  Query the AI system for quality optimization insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Textarea 
                    placeholder="Ask a question about quality patterns, defect prevention, or improvement opportunities... (e.g., 'What are the main factors affecting stitching quality?')"
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
                      onClick={() => setAiPrompt("What factors are causing the color shading issues in finished fabric?")}
                    >
                      <Search className="h-4 w-4 text-blue-500 mb-1" />
                      <p className="text-sm">What factors are causing the color shading issues in finished fabric?</p>
                    </div>
                    
                    <div 
                      className="border rounded-lg p-3 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setAiPrompt("How can we improve stitch quality consistency across all production lines?")}
                    >
                      <Search className="h-4 w-4 text-blue-500 mb-1" />
                      <p className="text-sm">How can we improve stitch quality consistency across all production lines?</p>
                    </div>
                    
                    <div 
                      className="border rounded-lg p-3 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setAiPrompt("Predict the impact of increasing quality checks at the cutting stage")}
                    >
                      <Search className="h-4 w-4 text-blue-500 mb-1" />
                      <p className="text-sm">Predict the impact of increasing quality checks at the cutting stage</p>
                    </div>
                    
                    <div 
                      className="border rounded-lg p-3 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setAiPrompt("Compare quality metrics between different styles of garments")}
                    >
                      <Search className="h-4 w-4 text-blue-500 mb-1" />
                      <p className="text-sm">Compare quality metrics between different styles of garments</p>
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
                          <h4 className="font-medium">Stitching Quality Analysis</h4>
                          <p className="text-sm text-muted-foreground">Query: What are the main factors affecting stitching quality?</p>
                        </div>
                      </div>
                      <div className="bg-muted/20 p-3 rounded-lg">
                        <p className="text-sm">
                          Analysis of our quality data reveals five primary factors affecting stitching quality:
                        </p>
                        <ol className="text-sm mt-2 space-y-1 list-decimal pl-4">
                          <li>Machine thread tension (42% of defects) - Improper tension settings lead to loose or tight stitches</li>
                          <li>Needle quality and condition (23% of defects) - Blunt or damaged needles cause fabric damage</li>
                          <li>Operator technique (18% of defects) - Handling speed and fabric control affect stitch consistency</li>
                          <li>Material properties (12% of defects) - Fabric thickness and texture variations require adjustments</li>
                          <li>Environmental factors (5% of defects) - Humidity affects thread tension and fabric handling</li>
                        </ol>
                        <p className="text-sm mt-2">
                          Recommendation: Implement daily machine calibration checks focusing on thread tension, and establish a needle replacement schedule based on usage hours rather than visible damage.
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

export default AIQualityInsights;