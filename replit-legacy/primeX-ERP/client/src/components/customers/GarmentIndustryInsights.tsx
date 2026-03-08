import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertCircle, Check, Lightbulb, BarChart3, LineChart, TrendingUp, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

// Interfaces for the garment industry analytics
interface AIInsight {
  id: string;
  title: string;
  description: string;
  type: 'info' | 'warning' | 'success';
  confidence: number;
  recommendations: string[];
}

interface GarmentOrderForecast {
  seasonId: string;
  seasonName: string;
  predictedVolume: number;
  predictedValue: number;
  confidenceLevel: number;
  changeFromLastYear: number;
  factors: string[];
}

interface SustainabilityCategory {
  name: string;
  score: number;
  industryAverage: number;
  recommendations: string[];
}

interface SustainabilityMetrics {
  overallRating: number;
  categories: SustainabilityCategory[];
}

interface ProductionInsight {
  metricName: string;
  currentValue: number;
  industryBenchmark: number;
  trend: 'improving' | 'declining' | 'stable';
  recommendations: string[];
}

interface GarmentIndustryInsightsProps {
  customerId: number;
}

export function GarmentIndustryInsights({ customerId }: GarmentIndustryInsightsProps) {
  const [activeTab, setActiveTab] = useState("insights");

  // Fetch garment-specific AI insights for the customer
  const { 
    data: insights, 
    isLoading: isLoadingInsights
  } = useQuery<AIInsight[]>({
    queryKey: [`/api/garment-analytics/customers/${customerId}/insights`],
    enabled: !!customerId && activeTab === "insights",
  });

  // Fetch order forecasts
  const { 
    data: forecasts, 
    isLoading: isLoadingForecasts
  } = useQuery<GarmentOrderForecast[]>({
    queryKey: [`/api/garment-analytics/customers/${customerId}/forecasts`],
    enabled: !!customerId && activeTab === "forecasts",
  });

  // Fetch sustainability metrics
  const { 
    data: sustainabilityMetrics, 
    isLoading: isLoadingSustainability
  } = useQuery<SustainabilityMetrics>({
    queryKey: [`/api/garment-analytics/customers/${customerId}/sustainability`],
    enabled: !!customerId && activeTab === "sustainability",
  });

  // Fetch production metrics
  const { 
    data: productionMetrics, 
    isLoading: isLoadingProduction
  } = useQuery<ProductionInsight[]>({
    queryKey: [`/api/garment-analytics/customers/${customerId}/production-metrics`],
    enabled: !!customerId && activeTab === "production",
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="bg-primary/5 border-b">
        <div className="flex items-center">
          <Lightbulb className="mr-2 h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Garment Industry Intelligence</CardTitle>
        </div>
        <CardDescription>
          AI-powered analytics and insights specific to the garment manufacturing industry
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none p-0 h-auto border-b">
            <TabsTrigger 
              value="insights" 
              className="flex-1 rounded-none border-r py-3 data-[state=active]:bg-primary/5"
            >
              <Lightbulb className="mr-2 h-4 w-4" />
              AI Insights
            </TabsTrigger>
            <TabsTrigger 
              value="forecasts" 
              className="flex-1 rounded-none border-r py-3 data-[state=active]:bg-primary/5"
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Order Forecasts
            </TabsTrigger>
            <TabsTrigger 
              value="sustainability" 
              className="flex-1 rounded-none border-r py-3 data-[state=active]:bg-primary/5"
            >
              <Leaf className="mr-2 h-4 w-4" />
              Sustainability
            </TabsTrigger>
            <TabsTrigger 
              value="production" 
              className="flex-1 rounded-none py-3 data-[state=active]:bg-primary/5"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Production
            </TabsTrigger>
          </TabsList>

          {/* AI Insights Tab */}
          <TabsContent value="insights" className="m-0 p-4">
            {isLoadingInsights ? (
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Generating garment industry AI insights...</p>
                </div>
              </div>
            ) : insights && insights.length > 0 ? (
              <div className="space-y-4">
                {insights.map((insight) => (
                  <Card 
                    key={insight.id}
                    className={cn(
                      "border-l-4",
                      insight.type === "success" && "border-l-green-500",
                      insight.type === "warning" && "border-l-amber-500",
                      insight.type === "info" && "border-l-blue-500",
                    )}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start">
                        <div className={cn(
                          "mr-2 h-5 w-5 mt-0.5",
                          insight.type === "success" && "text-green-500",
                          insight.type === "warning" && "text-amber-500",
                          insight.type === "info" && "text-blue-500",
                        )}>
                          {insight.type === "success" && <Check className="h-5 w-5" />}
                          {insight.type === "warning" && <AlertCircle className="h-5 w-5" />}
                          {insight.type === "info" && <Lightbulb className="h-5 w-5" />}
                        </div>
                        <div>
                          <CardTitle className="text-base font-medium">{insight.title}</CardTitle>
                          <CardDescription className="text-sm mt-1">
                            {insight.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                      {insight.recommendations.length > 0 && (
                        <div className="mt-2">
                          <h4 className="text-sm font-medium mb-1">Recommendations:</h4>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {insight.recommendations.map((rec, idx) => (
                              <li key={idx} className="flex items-start">
                                <div className="mr-2 text-primary">•</div>
                                <div>{rec}</div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="pt-0 text-xs text-muted-foreground">
                      Confidence: {Math.round(insight.confidence * 100)}%
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="mx-auto h-10 w-10 mb-4 opacity-20" />
                <p>No garment industry insights available for this customer.</p>
              </div>
            )}
          </TabsContent>

          {/* Order Forecasts Tab */}
          <TabsContent value="forecasts" className="m-0 p-4">
            {isLoadingForecasts ? (
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Generating order forecasts...</p>
                </div>
              </div>
            ) : forecasts && forecasts.length > 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {forecasts.map((forecast) => (
                    <Card key={forecast.seasonId} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center">
                          <LineChart className="h-4 w-4 mr-2 text-primary" />
                          {forecast.seasonName}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Order Forecast
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Volume</p>
                            <p className="font-medium">{forecast.predictedVolume.toLocaleString()} units</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Value</p>
                            <p className="font-medium">${forecast.predictedValue.toLocaleString()}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <span 
                            className={cn(
                              "text-xs font-medium rounded-full px-2 py-0.5",
                              forecast.changeFromLastYear > 0 
                                ? "bg-green-100 text-green-800" 
                                : "bg-red-100 text-red-800"
                            )}
                          >
                            {forecast.changeFromLastYear > 0 ? "+" : ""}{forecast.changeFromLastYear}% YoY
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Confidence: {Math.round(forecast.confidenceLevel * 100)}%
                          </span>
                        </div>
                        
                        <Separator />
                        
                        <div>
                          <p className="text-xs font-medium">Key Factors:</p>
                          <ul className="text-xs text-muted-foreground mt-1">
                            {forecast.factors.slice(0, 3).map((factor, idx) => (
                              <li key={idx} className="flex items-start">
                                <span className="mr-1">•</span>
                                <span>{factor}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                <Alert className="bg-primary/5 border-primary/10">
                  <Lightbulb className="h-4 w-4" />
                  <AlertTitle>Forecast Insights</AlertTitle>
                  <AlertDescription>
                    <p className="text-sm mt-1">
                      Based on these forecasts, consider adjusting production capacity planning and raw material procurement.
                    </p>
                    <Button variant="outline" size="sm" className="mt-2">
                      View Detailed Analysis
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="mx-auto h-10 w-10 mb-4 opacity-20" />
                <p>No order forecasts available for this customer.</p>
              </div>
            )}
          </TabsContent>

          {/* Sustainability Tab */}
          <TabsContent value="sustainability" className="m-0 p-4">
            {isLoadingSustainability ? (
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Analyzing sustainability metrics...</p>
                </div>
              </div>
            ) : sustainabilityMetrics ? (
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-muted-foreground">Overall Sustainability Rating</h3>
                    <div className="flex items-center mt-1">
                      {[...Array(5)].map((_, i) => (
                        <Leaf 
                          key={i}
                          className={cn(
                            "h-5 w-5 mr-1",
                            i < Math.floor(sustainabilityMetrics.overallRating) 
                              ? "text-emerald-500" 
                              : i < sustainabilityMetrics.overallRating 
                                ? "text-emerald-300" 
                                : "text-gray-200"
                          )}
                          fill={i < Math.floor(sustainabilityMetrics.overallRating) ? "currentColor" : "none"}
                        />
                      ))}
                      <span className="ml-2 font-medium">{typeof sustainabilityMetrics.overallRating === 'number' ? sustainabilityMetrics.overallRating.toFixed(1) : Number(sustainabilityMetrics.overallRating || 0).toFixed(1)}/5</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      This customer is performing better than 65% of your customer base in sustainability metrics.
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="font-medium">Sustainability Categories</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sustainabilityMetrics.categories.map((category, idx) => (
                      <Card key={idx} className="border-l-4 border-l-emerald-500">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{category.name}</CardTitle>
                          <CardDescription>
                            Score: {category.score}% <span className="text-xs">(Industry Avg: {category.industryAverage}%)</span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-2 rounded-full" 
                              style={{ width: `${category.score}%` }}
                            ></div>
                          </div>
                          
                          <div className="mt-3">
                            <h4 className="text-xs font-medium mb-1">Recommendations:</h4>
                            <ul className="text-xs text-muted-foreground space-y-1">
                              {category.recommendations && Array.isArray(category.recommendations) && category.recommendations.length > 0 ? (
                                category.recommendations.map((rec, recIdx) => (
                                  <li key={recIdx} className="flex items-start">
                                    <div className="mr-2 text-emerald-500">•</div>
                                    <div>{rec}</div>
                                  </li>
                                ))
                              ) : (
                                <li className="flex items-start">
                                  <div className="mr-2 text-emerald-500">•</div>
                                  <span>No specific recommendations available</span>
                                </li>
                              )}
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="mx-auto h-10 w-10 mb-4 opacity-20" />
                <p>No sustainability data available for this customer.</p>
              </div>
            )}
          </TabsContent>

          {/* Production Tab */}
          <TabsContent value="production" className="m-0 p-4">
            {isLoadingProduction ? (
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Analyzing production metrics...</p>
                </div>
              </div>
            ) : productionMetrics && productionMetrics.length > 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {productionMetrics.map((metric, idx) => (
                    <Card key={idx}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{metric.metricName}</CardTitle>
                        <CardDescription>
                          Current: <span className="font-medium">{metric.currentValue}%</span> 
                          <span className="text-xs ml-2">(Industry: {metric.industryBenchmark}%)</span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex justify-between items-center mb-2">
                          <span 
                            className={cn(
                              "inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5",
                              metric.trend === "improving" 
                                ? "bg-green-100 text-green-800" 
                                : metric.trend === "declining"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-blue-100 text-blue-800"
                            )}
                          >
                            {metric.trend === "improving" && <TrendingUp className="mr-1 h-3 w-3" />}
                            {metric.trend === "declining" && <TrendingUp className="mr-1 h-3 w-3 rotate-180" />}
                            {metric.trend === "stable" && <LineChart className="mr-1 h-3 w-3" />}
                            {metric.trend.charAt(0).toUpperCase() + metric.trend.slice(1)}
                          </span>
                          
                          <span className={cn(
                            "text-xs font-medium",
                            metric.currentValue > metric.industryBenchmark 
                              ? "text-green-600" 
                              : "text-red-600"
                          )}>
                            {metric.currentValue > metric.industryBenchmark 
                              ? `+${(metric.currentValue - metric.industryBenchmark).toFixed(1)}%` 
                              : `-${(metric.industryBenchmark - metric.currentValue).toFixed(1)}%`} vs. Industry
                          </span>
                        </div>
                        
                        <div className="mt-3">
                          <h4 className="text-xs font-medium mb-1">Action Items:</h4>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {metric.recommendations.slice(0, 2).map((rec, recIdx) => (
                              <li key={recIdx} className="flex items-start">
                                <div className="mr-1 text-primary">•</div>
                                <div>{rec}</div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                <Alert className="bg-blue-50/50 border-blue-200">
                  <Lightbulb className="h-4 w-4 text-blue-500" />
                  <AlertTitle>Production Optimization</AlertTitle>
                  <AlertDescription>
                    <p className="text-sm mt-1">
                      The data shows strong performance in quality metrics, with opportunities to further improve lead times.
                    </p>
                    <Button variant="outline" size="sm" className="mt-2">
                      View Production Report
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="mx-auto h-10 w-10 mb-4 opacity-20" />
                <p>No production metrics available for this customer.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}