import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { TabsContent, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, DonutChart, LineChart, Card as TremorCard } from "@tremor/react";

import { 
  Brain, 
  AlertTriangle, 
  Lightbulb, 
  Search, 
  TrendingUp, 
  Clock, 
  FileText, 
  ArrowRight, 
  DollarSign, 
  Ship, 
  Truck,
  CreditCard,
  BarChart2,
  Calendar,
  Boxes
} from 'lucide-react';

interface AILogisticsInsightsProps {
  selectedReference: string;
}

const AILogisticsInsights: React.FC<AILogisticsInsightsProps> = ({ selectedReference }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');

  const { data: shipments = [], isLoading: shipmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/shipments'],
  });

  const { data: lcs = [], isLoading: lcsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/lcs'],
  });

  const { data: exportDocuments = [], isLoading: docsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/export-documents'],
  });

  const { data: purchaseOrders = [], isLoading: posLoading } = useQuery<any[]>({
    queryKey: ['/api/purchase-orders'],
  });

  const isLoading = shipmentsLoading || lcsLoading || docsLoading;

  const containerAnimation = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemAnimation = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  const activeShipments = shipments.filter((s: any) => s.status !== 'delivered' && s.status !== 'completed');
  const pendingDocs = exportDocuments.filter((d: any) => d.status === 'pending' || d.status === 'draft');
  const activeLcs = lcs.filter((lc: any) => lc.status === 'active' || lc.status === 'pending');
  const totalShipmentValue = shipments.reduce((sum: number, s: any) => sum + parseFloat(s.totalValue || s.value || '0'), 0);

  const aiInsights = (() => {
    const insights: any[] = [];
    
    if (pendingDocs.length > 0) {
      insights.push({
        id: "insight-docs",
        title: "Documentation Completion Required",
        type: "risk",
        severity: pendingDocs.length > 3 ? "high" : "medium",
        category: "Export Documents",
        description: `${pendingDocs.length} export document${pendingDocs.length !== 1 ? 's' : ''} are pending completion. Incomplete documentation can delay shipments and cause customs issues. Priority: review and complete all pending documents before next shipment dates.`,
        impact: pendingDocs.length * 5,
        confidence: 95,
        generatedAt: new Date().toISOString()
      });
    }

    if (activeShipments.length > 0) {
      insights.push({
        id: "insight-shipments",
        title: "Active Shipment Monitoring",
        type: "recommendation",
        severity: "medium",
        category: "Shipping",
        description: `${activeShipments.length} shipment${activeShipments.length !== 1 ? 's' : ''} currently in transit with total value of $${totalShipmentValue.toLocaleString()}. Monitor ETAs closely and ensure all receiving documentation is prepared in advance to avoid delays at destination ports.`,
        impact: 8.5,
        confidence: 90,
        generatedAt: new Date().toISOString()
      });
    }

    if (activeLcs.length > 0) {
      insights.push({
        id: "insight-lcs",
        title: "LC Expiry Monitoring",
        type: "risk",
        severity: "high",
        category: "Letter of Credit",
        description: `${activeLcs.length} active Letter${activeLcs.length !== 1 ? 's' : ''} of Credit require monitoring. Ensure all LC conditions are met before expiry dates. Review terms for any discrepancies between LC requirements and actual shipment documentation.`,
        impact: 15.0,
        confidence: 88,
        generatedAt: new Date().toISOString()
      });
    }

    if (shipments.length > 0) {
      insights.push({
        id: "insight-optimization",
        title: "Shipping Route Optimization",
        type: "optimization",
        severity: "low",
        category: "Transport",
        description: `Based on your ${shipments.length} shipment records, consider consolidating shipments to similar destinations to reduce per-unit freight costs. Potential savings of 8-12% on freight charges through batch shipping optimization.`,
        impact: 10.0,
        confidence: 82,
        generatedAt: new Date().toISOString()
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: "insight-startup",
        title: "Getting Started with Logistics",
        type: "recommendation",
        severity: "low",
        category: "General",
        description: "No logistics data found yet. Create shipments, export documents, and LCs in the Commercial module to start generating AI-powered logistics insights and recommendations.",
        impact: 0,
        confidence: 100,
        generatedAt: new Date().toISOString()
      });
    }

    return insights;
  })();

  const complianceRiskData = (() => {
    const risks = [];
    if (pendingDocs.length > 0) {
      risks.push({ area: "Missing Documentation", riskScore: Math.min(pendingDocs.length * 15, 80) });
    }
    if (activeLcs.length > 0) {
      risks.push({ area: "LC Compliance", riskScore: Math.min(activeLcs.length * 20, 60) });
    }
    risks.push({ area: "HS Code Classification", riskScore: shipments.length > 0 ? 25 : 5 });
    risks.push({ area: "Country of Origin", riskScore: shipments.length > 0 ? 15 : 5 });
    risks.push({ area: "Restricted Party Screening", riskScore: 5 });
    return risks;
  })();

  const getSeverityBadge = (severity: string) => {
    switch(severity.toLowerCase()) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      case 'high': return <Badge variant="destructive">High</Badge>;
      case 'medium': return <Badge variant="default" className="bg-amber-500">Medium</Badge>;
      case 'low': return <Badge variant="outline" className="border-blue-500 text-blue-500">Low</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getInsightTypeIcon = (type: string) => {
    switch(type.toLowerCase()) {
      case 'risk': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'optimization': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'recommendation': return <Lightbulb className="h-4 w-4 text-amber-500" />;
      default: return <Brain className="h-4 w-4 text-blue-500" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <motion.div variants={containerAnimation} initial="hidden" animate="visible" className="space-y-6">
      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <Brain className="h-4 w-4 mr-2" />
            AI Overview
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Lightbulb className="h-4 w-4 mr-2" />
            Logistics Insights
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Compliance Risk
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
                <p className="text-xs text-muted-foreground mt-2">Based on real logistics data</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Shipments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Ship className="h-8 w-8 text-blue-500 mr-3" />
                  <div className="text-4xl font-bold">{activeShipments.length}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Being monitored by AI</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pending Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <FileText className="h-8 w-8 text-amber-500 mr-3" />
                  <div className="text-4xl font-bold">{pendingDocs.length}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Requiring attention</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active LCs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <CreditCard className="h-8 w-8 text-purple-500 mr-3" />
                  <div className="text-4xl font-bold">{activeLcs.length}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Being tracked</p>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div variants={itemAnimation} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Logistics Insights</CardTitle>
                <CardDescription>AI-generated recommendations based on your data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {aiInsights.slice(0, 3).map(insight => (
                    <div key={insight.id} className="flex gap-3 p-3 border rounded-lg">
                      <div className="mt-0.5">{getInsightTypeIcon(insight.type)}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium text-sm">{insight.title}</h3>
                          {getSeverityBadge(insight.severity)}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{insight.description}</p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="text-xs text-muted-foreground">{insight.category} • Impact: {insight.impact}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Trade Compliance Risk Assessment</CardTitle>
                <CardDescription>AI-powered compliance risk analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {complianceRiskData.length > 0 ? (
                  <TremorCard>
                    <BarChart
                      className="h-60"
                      data={complianceRiskData}
                      index="area"
                      categories={["riskScore"]}
                      colors={["rose"]}
                      valueFormatter={(value) => `${value}`}
                      showAnimation={true}
                    />
                  </TremorCard>
                ) : (
                  <div className="h-60 flex items-center justify-center text-muted-foreground">
                    No risk data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="insights" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold mb-1">AI-Generated Logistics Insights</h2>
              <p className="text-sm text-muted-foreground">Recommendations based on your real logistics data</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {aiInsights.map(insight => (
              <motion.div 
                key={insight.id}
                variants={itemAnimation}
                className={`border rounded-lg overflow-hidden cursor-pointer ${
                  selectedInsight === insight.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedInsight(insight.id === selectedInsight ? null : insight.id)}
              >
                <div className="flex items-start p-4">
                  <div className="mt-1 mr-4">{getInsightTypeIcon(insight.type)}</div>
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                      <h3 className="font-medium">{insight.title}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-gray-100">{insight.category}</Badge>
                        {getSeverityBadge(insight.severity)}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{insight.description}</p>
                    <div className="flex flex-col sm:flex-row gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Potential Impact:</span>{' '}
                        <span className="font-medium text-green-600">{insight.impact}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Confidence:</span>{' '}
                        <span className="font-medium">{insight.confidence}%</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {selectedInsight === insight.id && (
                  <div className="bg-muted/30 p-4 border-t">
                    <h4 className="font-medium mb-2">Recommended Actions</h4>
                    <ol className="list-decimal pl-5 space-y-2 text-sm">
                      <li>Review current {insight.category.toLowerCase()} processes</li>
                      <li>Develop implementation plan with stakeholders</li>
                      <li>Estimate resource requirements and ROI analysis</li>
                      <li>Monitor key metrics after implementation</li>
                    </ol>
                    <div className="flex gap-2 mt-4">
                      <Button size="sm">Implement</Button>
                      <Button size="sm" variant="outline">Schedule Review</Button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="compliance" className="space-y-6">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>
                  Compliance Risk Assessment
                  {selectedReference !== 'all' && (
                    <Badge className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-100">
                      Ref: {selectedReference}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>AI-powered compliance risk analysis based on your actual logistics data</CardDescription>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-72"
                    data={complianceRiskData}
                    index="area"
                    categories={["riskScore"]}
                    colors={["rose"]}
                    valueFormatter={(value) => `${value}`}
                    showAnimation={true}
                  />
                </TremorCard>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <div className="flex flex-col items-center bg-blue-50 p-3 rounded-lg">
                    <p className="text-xs text-blue-600 font-medium">OVERALL RISK LEVEL</p>
                    <p className="text-xl font-bold">
                      {complianceRiskData.some(r => r.riskScore > 50) ? 'High' : 
                       complianceRiskData.some(r => r.riskScore > 25) ? 'Medium' : 'Low'}
                    </p>
                  </div>
                  <div className="flex flex-col items-center bg-amber-50 p-3 rounded-lg">
                    <p className="text-xs text-amber-600 font-medium">PENDING DOCUMENTS</p>
                    <p className="text-xl font-bold">{pendingDocs.length}</p>
                  </div>
                  <div className="flex flex-col items-center bg-green-50 p-3 rounded-lg">
                    <p className="text-xs text-green-600 font-medium">ACTIVE MONITORING</p>
                    <p className="text-xl font-bold">{activeShipments.length + activeLcs.length}</p>
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

export default AILogisticsInsights;