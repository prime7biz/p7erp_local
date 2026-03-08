import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Brain, Activity, AlertTriangle, CheckCircle, Clock, Target } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ForecastData {
  date: string;
  predictedQuantity: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  accuracy: number;
  factors: {
    seasonal: number;
    trend: number;
    external: number;
  };
}

interface ModelMetrics {
  mse: number;
  mae: number;
  mape: number;
  r2Score: number;
  trainingLoss: number[];
  validationLoss: number[];
}

interface ForecastSummary {
  totalPredictedDemand: number;
  averageConfidence: number;
  peakDemandDay: {
    date: string;
    quantity: number;
  };
  forecastHorizon: number;
  region: string;
  productId: string;
}

interface Insight {
  type: string;
  title: string;
  description: string;
  confidence: number;
  impact: string;
  actionRequired: boolean;
}

interface Recommendation {
  category: string;
  action: string;
  priority: string;
  estimatedImpact: string;
  timeframe: string;
}

const DemandForecastingDashboard = () => {
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [forecastDays, setForecastDays] = useState<number>(30);
  const [modelType, setModelType] = useState<'lstm' | 'gru'>('lstm');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch inventory items for product selection
  const { data: inventoryItems } = useQuery({
    queryKey: ['/api/items'],
    select: (data: any[]) => data?.slice(0, 50) || [] // Limit to first 50 items for performance
  });

  // Fetch model metrics
  const { data: modelMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['/api/demand-forecasting/metrics'],
    retry: false
  });

  // Fetch forecast data
  const { data: forecastResult, isLoading: forecastLoading } = useQuery({
    queryKey: ['/api/demand-forecasting/forecast', selectedProduct, selectedRegion, forecastDays],
    enabled: !!selectedProduct,
    retry: false
  });

  // Fetch insights
  const { data: insights } = useQuery({
    queryKey: ['/api/demand-forecasting/insights', selectedProduct],
    enabled: !!selectedProduct,
    retry: false
  });

  // Initialize model mutation
  const initializeModelMutation = useMutation({
    mutationFn: async (params: { modelType: 'lstm' | 'gru'; forceRetrain?: boolean }) => {
      return apiRequest('/api/demand-forecasting/initialize', 'POST', params);
    },
    onSuccess: () => {
      toast({
        title: "Model Initialized",
        description: "AI forecasting model has been successfully trained and is ready for predictions.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/demand-forecasting/metrics'] });
    },
    onError: (error: any) => {
      toast({
        title: "Initialization Failed",
        description: error.message || "Failed to initialize the forecasting model.",
        variant: "destructive",
      });
    }
  });

  // Generate forecast mutation
  const generateForecastMutation = useMutation({
    mutationFn: async (params: { productId: string; region: string; forecastDays: number }) => {
      return apiRequest('/api/demand-forecasting/forecast', 'POST', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/demand-forecasting/forecast', selectedProduct, selectedRegion, forecastDays] 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Forecast Generation Failed",
        description: error.message || "Failed to generate demand forecast.",
        variant: "destructive",
      });
    }
  });

  const handleInitializeModel = () => {
    initializeModelMutation.mutate({ modelType, forceRetrain: false });
  };

  const handleGenerateForecast = () => {
    if (!selectedProduct) {
      toast({
        title: "Product Required",
        description: "Please select a product to generate forecast.",
        variant: "destructive",
      });
      return;
    }
    generateForecastMutation.mutate({ 
      productId: selectedProduct, 
      region: selectedRegion, 
      forecastDays 
    });
  };

  const formatChartData = (forecasts: ForecastData[]) => {
    return forecasts?.map((forecast, index) => ({
      day: index + 1,
      date: new Date(forecast.date).toLocaleDateString(),
      predicted: Math.round(forecast.predictedQuantity),
      lowerBound: Math.round(forecast.confidenceInterval.lower),
      upperBound: Math.round(forecast.confidenceInterval.upper),
      confidence: Math.round(forecast.accuracy * 100),
      seasonal: forecast.factors.seasonal,
      trend: forecast.factors.trend,
      external: forecast.factors.external
    }));
  };

  const getStatusColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800'
    };
    return colors[priority as keyof typeof colors] || colors.medium;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Demand Forecasting</h1>
          <p className="text-muted-foreground">
            Advanced machine learning predictions for inventory planning and demand optimization
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="bg-blue-50">
            <Brain className="w-4 h-4 mr-1" />
            TensorFlow.js Powered
          </Badge>
        </div>
      </div>

      {/* Model Status and Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            Model Status & Configuration
          </CardTitle>
          <CardDescription>
            Initialize and configure the AI forecasting model
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Model Type</label>
              <Select value={modelType} onValueChange={(value: 'lstm' | 'gru') => setModelType(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lstm">LSTM (Long Short-Term Memory)</SelectItem>
                  <SelectItem value="gru">GRU (Gated Recurrent Unit)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Product</label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItems?.map((item: any) => (
                    <SelectItem key={item.id} value={item.id.toString()}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Region</label>
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Regions</SelectItem>
                  <SelectItem value="North America">North America</SelectItem>
                  <SelectItem value="Europe">Europe</SelectItem>
                  <SelectItem value="Asia Pacific">Asia Pacific</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Forecast Days</label>
              <Select value={forecastDays.toString()} onValueChange={(value) => setForecastDays(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 Days</SelectItem>
                  <SelectItem value="14">14 Days</SelectItem>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="60">60 Days</SelectItem>
                  <SelectItem value="90">90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex space-x-2">
            <Button 
              onClick={handleInitializeModel}
              disabled={initializeModelMutation.isPending}
              className="flex items-center"
            >
              <Brain className="w-4 h-4 mr-2" />
              {initializeModelMutation.isPending ? 'Training Model...' : 'Initialize Model'}
            </Button>
            
            <Button 
              onClick={handleGenerateForecast}
              disabled={generateForecastMutation.isPending || !selectedProduct}
              variant="outline"
            >
              <Target className="w-4 h-4 mr-2" />
              {generateForecastMutation.isPending ? 'Generating...' : 'Generate Forecast'}
            </Button>
          </div>

          {/* Model Metrics Display */}
          {modelMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {Math.round((modelMetrics.metrics?.r2Score || 0) * 100)}%
                </div>
                <div className="text-sm text-muted-foreground">Model Accuracy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {(modelMetrics.metrics?.mae || 0).toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">Mean Abs Error</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {(modelMetrics.metrics?.mape || 0).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Mean Abs % Error</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {Math.round(Math.sqrt(modelMetrics.metrics?.mse || 0))}
                </div>
                <div className="text-sm text-muted-foreground">RMSE</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Forecast Results */}
      {forecastResult && (
        <Tabs defaultValue="forecast" className="space-y-4">
          <TabsList>
            <TabsTrigger value="forecast">Demand Forecast</TabsTrigger>
            <TabsTrigger value="factors">Contributing Factors</TabsTrigger>
            <TabsTrigger value="insights">AI Insights</TabsTrigger>
            <TabsTrigger value="accuracy">Model Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="forecast" className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Predicted Demand</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {forecastResult.summary?.totalPredictedDemand?.toLocaleString() || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Next {forecastDays} days
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Confidence</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {forecastResult.summary?.averageConfidence || 0}%
                  </div>
                  <Progress 
                    value={forecastResult.summary?.averageConfidence || 0} 
                    className="mt-2" 
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Peak Demand Day</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {forecastResult.summary?.peakDemandDay?.quantity || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {forecastResult.summary?.peakDemandDay?.date ? 
                      new Date(forecastResult.summary.peakDemandDay.date).toLocaleDateString() : 'N/A'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Forecast Region</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {forecastResult.summary?.region || 'All'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Product ID: {forecastResult.summary?.productId || 'N/A'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Forecast Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Demand Forecast with Confidence Intervals</CardTitle>
                <CardDescription>
                  Predicted demand over the next {forecastDays} days with upper and lower confidence bounds
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={formatChartData(forecastResult.forecasts)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(label) => `Day ${label}`}
                      formatter={(value, name) => [
                        typeof value === 'number' ? value.toLocaleString() : value, 
                        name
                      ]}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="upperBound"
                      stackId="1"
                      stroke="none"
                      fill="#e3f2fd"
                      fillOpacity={0.4}
                    />
                    <Area
                      type="monotone"
                      dataKey="lowerBound"
                      stackId="1"
                      stroke="none"
                      fill="#ffffff"
                      fillOpacity={1}
                    />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      stroke="#2196f3"
                      strokeWidth={3}
                      dot={{ fill: '#2196f3', strokeWidth: 2, r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="factors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Contributing Factors Analysis</CardTitle>
                <CardDescription>
                  Breakdown of factors influencing demand predictions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={formatChartData(forecastResult.forecasts)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="seasonal" stackId="a" fill="#8884d8" name="Seasonal" />
                    <Bar dataKey="trend" stackId="a" fill="#82ca9d" name="Trend" />
                    <Bar dataKey="external" stackId="a" fill="#ffc658" name="External" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            {insights && (
              <>
                {/* Key Insights */}
                <Card>
                  <CardHeader>
                    <CardTitle>AI-Generated Insights</CardTitle>
                    <CardDescription>
                      Intelligent analysis of demand patterns and market conditions
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {insights.insights?.keyInsights?.map((insight: Insight, index: number) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-semibold">{insight.title}</h4>
                              <Badge variant="outline" className={getPriorityBadge(insight.impact)}>
                                {insight.impact}
                              </Badge>
                              {insight.actionRequired && (
                                <Badge variant="destructive">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Action Required
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{insight.description}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold">{insight.confidence}%</div>
                            <div className="text-xs text-muted-foreground">Confidence</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Recommendations */}
                <Card>
                  <CardHeader>
                    <CardTitle>Strategic Recommendations</CardTitle>
                    <CardDescription>
                      AI-powered actionable recommendations for inventory optimization
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {insights.insights?.recommendations?.map((rec: Recommendation, index: number) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-semibold">{rec.action}</h4>
                              <Badge variant="outline" className={getPriorityBadge(rec.priority)}>
                                {rec.priority} Priority
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{rec.estimatedImpact}</p>
                            <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                              <span>Category: {rec.category}</span>
                              <span className="flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                {rec.timeframe}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="accuracy" className="space-y-4">
            {modelMetrics && (
              <Card>
                <CardHeader>
                  <CardTitle>Model Performance Metrics</CardTitle>
                  <CardDescription>
                    Training and validation performance of the AI forecasting model
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Training Progress */}
                    <div>
                      <h4 className="font-semibold mb-4">Training Progress</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={modelMetrics.metrics?.trainingLoss?.map((loss, epoch) => ({
                          epoch: epoch + 1,
                          training: loss,
                          validation: modelMetrics.metrics?.validationLoss?.[epoch] || 0
                        })) || []}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="epoch" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="training" stroke="#8884d8" name="Training Loss" />
                          <Line type="monotone" dataKey="validation" stroke="#82ca9d" name="Validation Loss" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Performance Metrics */}
                    <div>
                      <h4 className="font-semibold mb-4">Performance Summary</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span>R² Score (Accuracy)</span>
                          <div className="flex items-center space-x-2">
                            <Progress value={(modelMetrics.metrics?.r2Score || 0) * 100} className="w-20" />
                            <span className="font-medium">
                              {Math.round((modelMetrics.metrics?.r2Score || 0) * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span>Mean Absolute Error</span>
                          <span className="font-medium">{(modelMetrics.metrics?.mae || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mean Absolute % Error</span>
                          <span className="font-medium">{(modelMetrics.metrics?.mape || 0).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Root Mean Square Error</span>
                          <span className="font-medium">{Math.round(Math.sqrt(modelMetrics.metrics?.mse || 0))}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Loading States */}
      {(forecastLoading || metricsLoading) && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span>Processing AI forecasting data...</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DemandForecastingDashboard;