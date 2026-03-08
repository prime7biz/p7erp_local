import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { Check, X, AlertTriangle, RefreshCw, TrendingDown, TrendingUp, Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';

// Types for the recommendation data
interface InventoryRecommendation {
  itemId: number;
  itemName: string;
  recommendationType: 'increase_stock' | 'decrease_stock' | 'reorder' | 'discontinue' | 'no_action';
  recommendedAction: string;
  reasoningDetail: string;
  potentialSavings: number | null;
  confidenceScore: number;
  suggestedReorderQuantity?: number;
  dataPoints: string[];
}

export function AIRecommendationSidebar() {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.id;
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  
  // Using the public endpoint for demo purposes
  const { data: recommendations = [], isLoading, isError, refetch } = useQuery<InventoryRecommendation[]>({
    queryKey: ['/api/public/ai-recommendations', { category: selectedCategory }],
    enabled: true, // Always enabled for demo
  });

  // Available category options for filter
  const categoryOptions = [
    { value: undefined, label: 'All Categories' },
    { value: 'fabrics', label: 'Fabrics' },
    { value: 'accessories', label: 'Accessories' },
  ];

  const handleCategoryChange = (value: string) => {
    if (value === 'all') {
      setSelectedCategory(undefined);
    } else {
      setSelectedCategory(value);
    }
    
    toast({
      title: 'Updating recommendations',
      description: 'Fetching new inventory optimization recommendations...',
    });
  };

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'increase_stock':
        return <TrendingUp className="h-5 w-5 text-green-500" />;
      case 'decrease_stock':
        return <TrendingDown className="h-5 w-5 text-yellow-500" />;
      case 'reorder':
        return <RefreshCw className="h-5 w-5 text-blue-500" />;
      case 'discontinue':
        return <X className="h-5 w-5 text-red-500" />;
      case 'no_action':
        return <Check className="h-5 w-5 text-slate-500" />;
      default:
        return <Package className="h-5 w-5 text-slate-500" />;
    }
  };

  const getRecommendationBadgeColor = (type: string) => {
    switch (type) {
      case 'increase_stock':
        return 'bg-green-100 text-green-800 hover:bg-green-200';
      case 'decrease_stock':
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200';
      case 'reorder':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
      case 'discontinue':
        return 'bg-red-100 text-red-800 hover:bg-red-200';
      case 'no_action':
        return 'bg-slate-100 text-slate-800 hover:bg-slate-200';
      default:
        return 'bg-slate-100 text-slate-800 hover:bg-slate-200';
    }
  };

  if (isError) {
    return (
      <div className="h-full flex flex-col gap-4 p-6 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">AI Recommendations</h3>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
        
        <div className="flex flex-col items-center justify-center h-64 text-center p-4">
          <AlertTriangle className="h-12 w-12 text-orange-500 mb-2" />
          <h4 className="text-base font-medium text-gray-900 mb-1">Recommendations Unavailable</h4>
          <p className="text-sm text-gray-500 mb-4">
            We couldn't generate inventory recommendations at this time. This usually happens when the AI service is unavailable.
          </p>
          <Button
            variant="default"
            size="sm"
            onClick={() => refetch()}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 p-6 bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">AI Recommendations</h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      
      <div className="w-full">
        <Select
          value={selectedCategory ?? 'all'}
          onValueChange={handleCategoryChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Categories</SelectLabel>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="fabrics">Fabrics</SelectItem>
              <SelectItem value="accessories">Accessories</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex-grow overflow-y-auto space-y-3 mt-2">
        {isLoading ? (
          // Loading state
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="p-4 border rounded-lg bg-gray-50">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <div className="mt-3">
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ))
        ) : recommendations && recommendations.length > 0 ? (
          // Display recommendations
          recommendations.map((rec: InventoryRecommendation) => (
            <div key={rec.itemId} className="p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex items-start">
                <div className="p-2 rounded-full bg-white mr-3 mt-1">
                  {getRecommendationIcon(rec.recommendationType)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900">{rec.itemName}</h4>
                    <Badge className={getRecommendationBadgeColor(rec.recommendationType)}>
                      {rec.recommendationType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-gray-700 font-medium mt-1">
                    {rec.recommendedAction}
                  </p>
                  
                  <div className="mt-3 text-xs text-gray-500 space-y-2">
                    <p>{rec.reasoningDetail}</p>
                    
                    {rec.potentialSavings ? (
                      <div className="flex items-center mt-2">
                        <span className="font-medium text-green-600">
                          Potential Savings: BDT {rec.potentialSavings.toLocaleString()}
                        </span>
                      </div>
                    ) : null}
                    
                    {rec.suggestedReorderQuantity ? (
                      <div className="flex items-center mt-1">
                        <span className="font-medium text-blue-600">
                          Suggested Reorder: {rec.suggestedReorderQuantity.toLocaleString()} units
                        </span>
                      </div>
                    ) : null}
                    
                    {/* Confidence score */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span>Confidence</span>
                        <span>{Math.round(rec.confidenceScore * 100)}%</span>
                      </div>
                      <Progress 
                        value={rec.confidenceScore * 100} 
                        className="h-1.5 mt-1" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          // Empty state
          <div className="flex flex-col items-center justify-center h-64 text-center p-4">
            <Package className="h-12 w-12 text-gray-300 mb-2" />
            <h4 className="text-base font-medium text-gray-700 mb-1">No Recommendations</h4>
            <p className="text-sm text-gray-500">
              We don't have any inventory optimization recommendations for you right now. Try changing the filter or check back later.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}