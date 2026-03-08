import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrainCircuitIcon, ArrowUpIcon, AlertCircleIcon, CheckCircleIcon, InfoIcon, ThumbsUpIcon, BellIcon, RefreshCw } from 'lucide-react';
import { SkeletonCard } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

interface TaskAIInsightProps {
  insights: any[];
  task?: any;
  isLoading: boolean;
  onRefresh: () => void;
}

const InsightTypeIcon = ({ type }: { type: string }) => {
  switch (type?.toLowerCase()) {
    case 'suggestion':
      return <ThumbsUpIcon className="h-5 w-5 text-blue-500" />;
    case 'warning':
      return <AlertCircleIcon className="h-5 w-5 text-amber-500" />;
    case 'alert':
      return <BellIcon className="h-5 w-5 text-red-500" />;
    case 'info':
      return <InfoIcon className="h-5 w-5 text-slate-500" />;
    case 'success':
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    default:
      return <BrainCircuitIcon className="h-5 w-5 text-purple-500" />;
  }
};

const getInsightColor = (type: string): string => {
  switch (type?.toLowerCase()) {
    case 'suggestion': return 'bg-blue-50 border-blue-200 text-blue-800';
    case 'warning': return 'bg-amber-50 border-amber-200 text-amber-800';
    case 'alert': return 'bg-red-50 border-red-200 text-red-800';
    case 'info': return 'bg-slate-50 border-slate-200 text-slate-800';
    case 'success': return 'bg-green-50 border-green-200 text-green-800';
    default: return 'bg-purple-50 border-purple-200 text-purple-800';
  }
};

const TaskAIInsights: React.FC<TaskAIInsightProps> = ({ insights, task, isLoading, onRefresh }) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <BrainCircuitIcon className="mr-2 h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-medium">AI Insights</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={true}>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Refreshing...
          </Button>
        </div>
        
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <BrainCircuitIcon className="mr-2 h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-medium">AI Insights</h3>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Generate Insights
          </Button>
        </div>
        
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center">
            <BrainCircuitIcon className="mx-auto h-8 w-8 text-gray-400 mb-3" />
            <h3 className="text-lg font-medium mb-2">No insights available</h3>
            <p className="text-gray-500 mb-4">
              Generate AI insights to get recommendations and analysis for this task.
            </p>
            <Button onClick={onRefresh} className="bg-orange-600 hover:bg-orange-700">
              <BrainCircuitIcon className="h-4 w-4 mr-2" />
              Generate Insights
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <BrainCircuitIcon className="mr-2 h-5 w-5 text-purple-600" />
          <h3 className="text-lg font-medium">AI Insights</h3>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      <div className="grid gap-4">
        {insights.map((insight, index) => (
          <Card key={index} className={`border-l-4 overflow-hidden ${getInsightColor(insight.type)}`}>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-start">
                  <InsightTypeIcon type={insight.type} />
                  <div className="ml-2">
                    <CardTitle className="text-base">{insight.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {insight.description}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className={getInsightColor(insight.type)}>
                  {insight.type}
                </Badge>
              </div>
            </CardHeader>
            
            {insight.recommendations && insight.recommendations.length > 0 && (
              <CardContent className="p-4 pt-2">
                <p className="text-sm font-medium mb-2">Recommendations:</p>
                <ul className="text-sm space-y-1 ml-5 list-disc">
                  {insight.recommendations.map((rec: string, i: number) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </CardContent>
            )}
            
            <CardFooter className="p-4 pt-2 text-xs text-gray-500 flex justify-between">
              <div>
                Confidence: {typeof insight.confidence === 'string' 
                  ? insight.confidence 
                  : `${Math.round((insight.confidence || 0) * 100)}%`
                }
              </div>
              <div>{new Date(insight.createdAt).toLocaleString()}</div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default TaskAIInsights;