import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Lightbulb, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';

interface AIInsight {
  id: string;
  title: string;
  description: string;
  type: 'info' | 'warning' | 'success';
  confidence: number;
  recommendations: string[];
}

const QuotationAIInsights: React.FC<{ quotationId: number }> = ({ quotationId }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Fetch AI insights for the quotation
  const { 
    data: insights,
    isLoading,
    isError,
    refetch
  } = useQuery<AIInsight[]>({
    queryKey: [`/api/ai-insights/quotations/${quotationId}`],
    queryFn: async () => {
      const response = await fetch(`/api/ai-insights/quotations/${quotationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch AI insights');
      }
      return response.json();
    },
    enabled: !!quotationId, // Only run query if quotationId is provided
  });
  
  // Generate new insights
  const handleGenerateInsights = async () => {
    setIsGenerating(true);
    try {
      await apiRequest(`/api/ai-insights/quotations/${quotationId}/generate`, 'POST', {});
      await refetch();
    } catch (error) {
      console.error('Error generating insights:', error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Icon mapping based on insight type
  const getInsightIcon = (type: string) => {
    switch(type) {
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'info':
      default:
        return <Lightbulb className="h-5 w-5 text-blue-500" />;
    }
  };
  
  // Badge color based on insight type
  const getInsightBadgeClass = (type: string) => {
    switch(type) {
      case 'warning':
        return 'bg-primary/10 text-primary hover:bg-primary/20';
      case 'success':
        return 'bg-green-100 text-green-800 hover:bg-green-200';
      case 'info':
      default:
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    }
  };
  
  // Confidence level text
  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.8) return 'High confidence';
    if (confidence >= 0.5) return 'Medium confidence';
    return 'Low confidence';
  };
  
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>AI Insights</CardTitle>
          <CardDescription>
            Loading AI analysis for this quotation...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          <p className="text-sm text-neutral-dark">Loading insights...</p>
        </CardContent>
      </Card>
    );
  }
  
  if (isError) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>AI Insights</CardTitle>
          <CardDescription>
            Enhanced analysis for this quotation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <AlertTriangle className="h-8 w-8 text-primary mb-2" />
            <p className="text-sm text-neutral-dark mb-4">Failed to load insights</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>AI Insights</CardTitle>
            <CardDescription>
              Enhanced analysis for this quotation
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleGenerateInsights}
            disabled={isGenerating}
          >
            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Regenerate
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!insights || insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Lightbulb className="h-8 w-8 text-primary mb-2" />
            <p className="text-sm text-neutral-dark mb-4">No insights available yet</p>
            <Button 
              onClick={handleGenerateInsights}
              disabled={isGenerating}
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Insights
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {insights.map((insight) => (
              <div key={insight.id} className="border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  {getInsightIcon(insight.type)}
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-medium">{insight.title}</h3>
                      <Badge className={getInsightBadgeClass(insight.type)}>
                        {getConfidenceText(insight.confidence)}
                      </Badge>
                    </div>
                    <p className="text-sm text-neutral-dark mb-3">{insight.description}</p>
                    
                    {insight.recommendations.length > 0 && (
                      <div className="mt-2">
                        <h4 className="text-sm font-medium mb-1">Recommendations:</h4>
                        <ul className="list-disc pl-5 text-sm text-neutral-dark">
                          {insight.recommendations.map((rec, idx) => (
                            <li key={idx}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default QuotationAIInsights;