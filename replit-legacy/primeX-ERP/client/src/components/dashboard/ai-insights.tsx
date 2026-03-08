import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

interface AIInsight {
  id: number;
  type: 'warning' | 'info' | 'success';
  title: string;
  description: string;
  actionText: string;
  actionLink: string;
  icon: string;
}

export const AIInsights = () => {
  const { data: insights, isLoading } = useQuery<AIInsight[]>({
    queryKey: ['/api/dashboard/ai-insights'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Function to determine card styles based on insight type
  const getInsightStyles = (type: string) => {
    switch (type) {
      case 'warning':
        return {
          icon: 'text-amber-500',
          bg: 'bg-amber-50',
          border: 'border-l-amber-500'
        };
      case 'info':
        return {
          icon: 'text-blue-500',
          bg: 'bg-blue-50',
          border: 'border-l-blue-500'
        };
      case 'success':
        return {
          icon: 'text-emerald-500',
          bg: 'bg-emerald-50',
          border: 'border-l-emerald-500'
        };
      default:
        return {
          icon: 'text-primary',
          bg: 'bg-primary-50',
          border: 'border-l-primary'
        };
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden border border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center">
          <div className="bg-primary-50 rounded-full p-2 mr-3">
            <span className="material-icons text-primary">psychology</span>
          </div>
          <div>
            <h2 className="font-heading font-semibold text-gray-900">AI Insights</h2>
            <p className="text-gray-500 text-xs">Powered by advanced analytics</p>
          </div>
        </div>
        <button className="text-gray-400 hover:text-gray-600">
          <span className="material-icons">more_vert</span>
        </button>
      </div>
      
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {isLoading ? (
            // Loading state - Show 3 skeleton cards
            Array(3).fill(0).map((_, i) => (
              <Card key={i} className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center mb-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 mr-2 animate-pulse"></div>
                    <div className="h-5 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-full mb-2 animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6 mb-4 animate-pulse"></div>
                  <div className="flex justify-end">
                    <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : !insights || insights.length === 0 ? (
            // Empty state
            <div className="col-span-full flex flex-col items-center justify-center py-8">
              <span className="material-icons text-4xl text-gray-400 mb-2">psychology_alt</span>
              <h3 className="font-medium text-gray-700 mb-1">No insights available</h3>
              <p className="text-sm text-gray-500">Check back soon for AI-powered insights.</p>
            </div>
          ) : (
            // Insights display with professional styling
            insights.map((insight) => {
              const styles = getInsightStyles(insight.type);
              return (
                <Card 
                  key={insight.id} 
                  className={`border-l-4 ${styles.border} bg-white shadow-sm hover:shadow transition-shadow overflow-hidden`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center mb-3">
                      <div className={`flex items-center justify-center rounded-full ${styles.bg} w-8 h-8 mr-3`}>
                        <span className={`material-icons ${styles.icon}`}>{insight.icon}</span>
                      </div>
                      <h3 className="font-medium text-gray-900 line-clamp-1">{insight.title}</h3>
                    </div>
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{insight.description}</p>
                    <div className="flex justify-end">
                      <a 
                        href={insight.actionLink} 
                        className="text-primary text-sm font-medium hover:text-primary-dark flex items-center"
                      >
                        {insight.actionText}
                        <span className="material-icons text-sm ml-1">arrow_forward</span>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
