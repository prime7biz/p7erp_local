import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Lightbulb,
  Package,
  BarChart3,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StyleRecommendation {
  id: string;
  type: 'reorder' | 'overstock' | 'trending' | 'seasonal' | 'optimization';
  title: string;
  description: string;
  confidence: number;
  impact: 'high' | 'medium' | 'low';
  category: string;
  suggestedAction: string;
  metrics?: {
    currentStock?: number;
    suggestedLevel?: number;
    demandForecast?: number;
    turnoverRate?: number;
  };
}

interface InventoryInsight {
  totalItems: number;
  lowStockItems: number;
  overStockItems: number;
  fastMovingItems: number;
  deadStockItems: number;
  averageTurnover: number;
}

export default function StyleRecommendationSidebar() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Simulated insights data for demonstration
  const insights: InventoryInsight = {
    totalItems: 156,
    lowStockItems: 12,
    overStockItems: 8,
    fastMovingItems: 23,
    deadStockItems: 5,
    averageTurnover: 2.4
  };

  // Simulated recommendations data for demonstration
  const recommendations: StyleRecommendation[] = [
    {
      id: "1",
      type: "reorder",
      title: "Cotton Fabric Reorder",
      description: "Cotton fabric stock is below minimum threshold. High demand expected for upcoming season.",
      confidence: 89,
      impact: "high",
      category: "Fabrics",
      suggestedAction: "Order 500 yards",
      metrics: {
        currentStock: 45,
        suggestedLevel: 500,
        demandForecast: 350
      }
    },
    {
      id: "2",
      type: "trending",
      title: "Denim Demand Surge",
      description: "Denim products showing 25% increase in consumption. Consider increasing stock levels.",
      confidence: 76,
      impact: "medium",
      category: "Fabrics",
      suggestedAction: "Increase stock by 30%",
      metrics: {
        currentStock: 200,
        suggestedLevel: 260,
        demandForecast: 275
      }
    },
    {
      id: "3",
      type: "overstock",
      title: "Polyester Overstock",
      description: "Polyester inventory exceeds optimal levels. Consider promotional pricing or alternative uses.",
      confidence: 82,
      impact: "medium",
      category: "Synthetic",
      suggestedAction: "Reduce by 150 units",
      metrics: {
        currentStock: 850,
        suggestedLevel: 700,
        turnoverRate: 0.8
      }
    },
    {
      id: "4",
      type: "seasonal",
      title: "Summer Collection Prep",
      description: "Summer collection materials should be prioritized. Historical data shows 40% demand increase.",
      confidence: 71,
      impact: "high",
      category: "Seasonal",
      suggestedAction: "Prepare summer inventory",
      metrics: {
        demandForecast: 420
      }
    }
  ];

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'reorder': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'overstock': return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'trending': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'seasonal': return <Package className="h-4 w-4 text-blue-500" />;
      case 'optimization': return <Sparkles className="h-4 w-4 text-purple-500" />;
      default: return <Lightbulb className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Style Insights
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Inventory Overview */}
      {insights && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Inventory Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Items:</span>
                <span className="font-medium">{insights.totalItems}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Low Stock:</span>
                <span className="font-medium text-orange-600">{insights.lowStockItems}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overstock:</span>
                <span className="font-medium text-red-600">{insights.overStockItems}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fast Moving:</span>
                <span className="font-medium text-green-600">{insights.fastMovingItems}</span>
              </div>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avg. Turnover:</span>
              <span className="font-medium">{insights.averageTurnover.toFixed(1)}x</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Recommendations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Smart Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          {false ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-full mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : recommendations && recommendations.length > 0 ? (
            <div className="space-y-4">
              {recommendations.slice(0, 5).map((rec: StyleRecommendation) => (
                <div key={rec.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {getRecommendationIcon(rec.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm truncate">{rec.title}</h4>
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs px-1.5 py-0.5", getImpactColor(rec.impact))}
                        >
                          {rec.impact}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {rec.description}
                      </p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Confidence: <span className={getConfidenceColor(rec.confidence)}>
                            {rec.confidence}%
                          </span>
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {rec.category}
                        </Badge>
                      </div>
                      {rec.metrics && (
                        <div className="mt-2 pt-2 border-t text-xs space-y-1">
                          {rec.metrics.currentStock && (
                            <div className="flex justify-between">
                              <span>Current:</span>
                              <span>{rec.metrics.currentStock}</span>
                            </div>
                          )}
                          {rec.metrics.suggestedLevel && (
                            <div className="flex justify-between">
                              <span>Suggested:</span>
                              <span className="text-blue-600">{rec.metrics.suggestedLevel}</span>
                            </div>
                          )}
                          {rec.metrics.demandForecast && (
                            <div className="flex justify-between">
                              <span>Forecast:</span>
                              <span>{rec.metrics.demandForecast}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground">
              <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No recommendations available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <Package className="h-3 w-3 mr-2" />
            Generate Reorder Report
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <TrendingUp className="h-3 w-3 mr-2" />
            View Demand Forecast
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <AlertTriangle className="h-3 w-3 mr-2" />
            Check Dead Stock
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}