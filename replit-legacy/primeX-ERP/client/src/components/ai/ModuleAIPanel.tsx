import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import {
  Sparkles, RefreshCw, ChevronDown, ChevronUp, Loader2,
  Info, AlertTriangle, Lightbulb, Target, CheckCircle2, XCircle
} from "lucide-react";

interface AIInsight {
  type: "recommendation" | "warning" | "optimization" | "info";
  title: string;
  description: string;
  impact?: "high" | "medium" | "low";
  actionItems?: string[];
}

interface ModuleAIPanelProps {
  title: string;
  endpoint: string;
  requestData?: object;
  triggerKey?: string;
}

const typeConfig = {
  info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  warning: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200" },
  optimization: { icon: Lightbulb, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
  recommendation: { icon: Target, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
};

const impactConfig = {
  high: { color: "bg-red-100 text-red-700 border-red-200" },
  medium: { color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  low: { color: "bg-green-100 text-green-700 border-green-200" },
};

export function ModuleAIPanel({ title, endpoint, requestData, triggerKey }: ModuleAIPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(endpoint, "POST", requestData || {});
      return res.json();
    },
    onSuccess: (data: any) => {
      setInsights(data.insights || []);
      setHasLoaded(true);
    },
    onError: () => {
      setInsights([]);
      setHasLoaded(true);
    },
  });

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (newState && !hasLoaded && !mutation.isPending) {
      mutation.mutate();
    }
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    mutation.mutate();
  };

  return (
    <Card className="border-dashed border-purple-200">
      <CardHeader
        className="cursor-pointer hover:bg-purple-50/50 transition-colors pb-3"
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-purple-500" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasLoaded && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={handleRefresh}
                disabled={mutation.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${mutation.isPending ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-0">
          {mutation.isPending && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-purple-500 mr-2" />
              <span className="text-sm text-muted-foreground">Analyzing data with AI...</span>
            </div>
          )}

          {mutation.isError && (
            <div className="flex items-center gap-2 py-4 px-3 rounded-lg bg-red-50 text-red-600">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">AI analysis unavailable. Try again later.</span>
            </div>
          )}

          {hasLoaded && !mutation.isPending && !mutation.isError && insights.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No insights available at this time.
            </div>
          )}

          {!mutation.isPending && insights.length > 0 && (
            <div className="space-y-3">
              {insights.map((insight, idx) => {
                const config = typeConfig[insight.type] || typeConfig.info;
                const IconComponent = config.icon;
                const impact = insight.impact ? impactConfig[insight.impact] : null;

                return (
                  <div
                    key={idx}
                    className={`rounded-lg border p-3 ${config.bg} ${config.border}`}
                  >
                    <div className="flex items-start gap-2">
                      <IconComponent className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${config.color}`}>
                            {insight.title}
                          </span>
                          {impact && (
                            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${impact.color}`}>
                              {insight.impact?.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                          {insight.description}
                        </p>
                        {insight.actionItems && insight.actionItems.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {insight.actionItems.map((item, ai) => (
                              <div key={ai} className="flex items-start gap-1.5">
                                <CheckCircle2 className="h-3 w-3 mt-0.5 text-gray-400 shrink-0" />
                                <span className="text-xs text-gray-500">{item}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
