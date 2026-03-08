import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Sparkles, Info, AlertTriangle, Lightbulb, Zap, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIInsight {
  type: 'recommendation' | 'warning' | 'optimization' | 'info';
  title: string;
  description: string;
  impact?: 'high' | 'medium' | 'low';
  actionItems?: string[];
}

interface AIInsightsPanelProps {
  context: 'supplier-ledger' | 'purchase-order' | 'grn' | 'item' | 'warehouse' | 'inventory-dashboard' | 'accounting';
  data?: any;
  className?: string;
  defaultOpen?: boolean;
}

const insightConfig = {
  recommendation: { icon: Lightbulb, border: 'border-l-green-500', bg: 'bg-green-50', iconColor: 'text-green-600' },
  warning: { icon: AlertTriangle, border: 'border-l-yellow-500', bg: 'bg-yellow-50', iconColor: 'text-yellow-600' },
  optimization: { icon: Zap, border: 'border-l-purple-500', bg: 'bg-purple-50', iconColor: 'text-purple-600' },
  info: { icon: Info, border: 'border-l-blue-500', bg: 'bg-blue-50', iconColor: 'text-blue-600' },
};

const impactConfig = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

export function AIInsightsPanel({ context, data, className, defaultOpen = false }: AIInsightsPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [insights, setInsights] = useState<AIInsight[]>([]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/ai-insights/erp/${context}`, 'POST', data || {});
      return res.json();
    },
    onSuccess: (result: { insights: AIInsight[] }) => {
      setInsights(result.insights || []);
      setIsOpen(true);
    },
  });

  const handleGetInsights = () => {
    mutation.mutate();
  };

  return (
    <Card className={cn('border border-dashed border-primary/30', className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Insights
            </CardTitle>
            <div className="flex items-center gap-2">
              {insights.length === 0 && !mutation.isPending && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGetInsights}
                  disabled={mutation.isPending}
                  className="text-xs"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Get AI Insights
                </Button>
              )}
              {insights.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGetInsights}
                    disabled={mutation.isPending}
                    className="h-7 w-7 p-0"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', mutation.isPending && 'animate-spin')} />
                  </Button>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </CollapsibleTrigger>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {mutation.isPending && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border p-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded bg-muted" />
                      <div className="h-4 w-48 rounded bg-muted" />
                      <div className="ml-auto h-5 w-16 rounded-full bg-muted" />
                    </div>
                    <div className="mt-2 h-3 w-full rounded bg-muted" />
                    <div className="mt-1 h-3 w-3/4 rounded bg-muted" />
                  </div>
                ))}
              </div>
            )}

            {mutation.isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Failed to load insights. Please try again.
                <Button variant="link" size="sm" onClick={handleGetInsights} className="ml-2 h-auto p-0 text-red-700 underline">
                  Retry
                </Button>
              </div>
            )}

            {!mutation.isPending && insights.length > 0 && (
              <div className="space-y-3">
                {insights.map((insight, index) => {
                  const config = insightConfig[insight.type] || insightConfig.info;
                  const IconComponent = config.icon;

                  return (
                    <div
                      key={index}
                      className={cn(
                        'rounded-lg border-l-4 border bg-card p-4 transition-all hover:shadow-sm',
                        config.border
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn('mt-0.5 shrink-0', config.iconColor)}>
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{insight.title}</span>
                            {insight.impact && (
                              <Badge
                                variant="outline"
                                className={cn('text-[10px] px-1.5 py-0', impactConfig[insight.impact])}
                              >
                                {insight.impact}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {insight.description}
                          </p>
                          {insight.actionItems && insight.actionItems.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {insight.actionItems.map((action, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <span className="text-primary mt-1 shrink-0">•</span>
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-center pt-1">
                  <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />
                    Powered by AI
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
