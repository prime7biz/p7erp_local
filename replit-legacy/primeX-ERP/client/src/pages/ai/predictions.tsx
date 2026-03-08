import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Brain, TrendingUp, DollarSign, Package, AlertTriangle, RefreshCcw, Clock, Loader2 } from "lucide-react";

function PredictionCard({ title, icon: Icon, description, data, onGenerate, isPending }: any) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon className="h-5 w-5 text-purple-500" />
            {title}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
            {isPending ? "Analyzing..." : "Generate"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      {data && (
        <CardContent>
          <div className="space-y-3">
            {data.summary && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <p className="text-sm">{data.summary}</p>
              </div>
            )}
            {data.predictions && data.predictions.length > 0 && (
              <div className="space-y-2">
                {data.predictions.map((pred: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-2 border rounded">
                    <Badge variant="outline" className={`mt-0.5 ${pred.confidence === 'high' ? 'text-green-600' : pred.confidence === 'medium' ? 'text-yellow-600' : 'text-gray-500'}`}>
                      {pred.confidence}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{pred.title}</p>
                      <p className="text-xs text-muted-foreground">{pred.detail}</p>
                    </div>
                    {pred.value && <span className="text-sm font-bold">{pred.value}</span>}
                  </div>
                ))}
              </div>
            )}
            {data.recommendations && data.recommendations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Recommendations</h4>
                <ul className="space-y-1">
                  {data.recommendations.map((rec: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-purple-500 mt-1">•</span> {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.generatedAt && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Generated: {new Date(data.generatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function AIPredictionsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("all");

  const { data: cashFlowPred } = useQuery({ queryKey: ["/api/ai/predictions/cash-flow"] });
  const { data: demandPred } = useQuery({ queryKey: ["/api/ai/predictions/demand"] });
  const { data: costPred } = useQuery({ queryKey: ["/api/ai/predictions/cost-optimization"] });

  const cashFlowMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ai/predictions/cash-flow"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ai/predictions/cash-flow"] }); toast({ title: "Cash flow prediction generated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const demandMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ai/predictions/demand"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ai/predictions/demand"] }); toast({ title: "Demand prediction generated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const costMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ai/predictions/cost-optimization"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ai/predictions/cost-optimization"] }); toast({ title: "Cost optimization analysis generated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const predictions = [
    { key: "cashflow", title: "Cash Flow Prediction", icon: DollarSign, description: "AI-powered cash flow forecasting based on FX receipts, BTB maturities, and order pipeline", data: cashFlowPred, onGenerate: () => cashFlowMutation.mutate(), isPending: cashFlowMutation.isPending },
    { key: "demand", title: "Demand Forecasting", icon: TrendingUp, description: "Predict future order volumes and buyer demand patterns", data: demandPred, onGenerate: () => demandMutation.mutate(), isPending: demandMutation.isPending },
    { key: "cost", title: "Cost Optimization", icon: Package, description: "Identify cost-saving opportunities across materials, production, and logistics", data: costPred, onGenerate: () => costMutation.mutate(), isPending: costMutation.isPending },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-500" />
            AI Predictions
          </h1>
          <p className="text-sm text-muted-foreground">AI-powered insights for cash flow, demand, and cost optimization</p>
        </div>
      </div>

      <div className="space-y-4">
        {predictions.map(pred => (
          <PredictionCard key={pred.key} {...pred} />
        ))}
      </div>
    </div>
  );
}
