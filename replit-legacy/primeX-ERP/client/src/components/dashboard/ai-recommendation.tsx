import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const AIRecommendation = () => {
  const [selectedTab, setSelectedTab] = useState('production');
  
  // Sample recommendation data
  const recommendations = {
    production: [
      {
        id: 1,
        title: "Line Balancing Optimization",
        description: "AI analysis suggests redistributing workload on Production Line 2 to reduce bottlenecks. Estimated efficiency improvement: 12.8%",
        impact: 87,
        impactLabel: "High Impact",
        impactType: "positive",
        icon: "settings_suggest"
      },
      {
        id: 2,
        title: "Machine Maintenance Alert",
        description: "Predictive maintenance model indicates Cutting Machine 3 shows early signs of failure. Schedule maintenance within 7 days to avoid downtime.",
        impact: 92,
        impactLabel: "Urgent",
        impactType: "warning",
        icon: "build"
      },
      {
        id: 3,
        title: "Resource Allocation",
        description: "Current staffing patterns show underutilization in afternoon shifts. AI recommends adjusted shift schedule for optimal resource usage.",
        impact: 76,
        impactLabel: "Medium Impact",
        impactType: "neutral",
        icon: "people"
      }
    ],
    materials: [
      {
        id: 4,
        title: "Inventory Optimization",
        description: "Excess cotton fabric inventory detected. Consider reducing next order by 15% to optimize storage and cash flow.",
        impact: 83,
        impactLabel: "High Impact",
        impactType: "positive",
        icon: "inventory_2"
      },
      {
        id: 5,
        title: "Alternative Supplier",
        description: "ML algorithm identified potential supply chain risk with current button supplier. Consider dual-sourcing strategy.",
        impact: 65,
        impactLabel: "Medium Impact",
        impactType: "warning",
        icon: "swap_horiz"
      }
    ],
    quality: [
      {
        id: 6,
        title: "Defect Pattern Detected",
        description: "AI vision system identified recurring stitching pattern defect on collar attachments. Adjust machine settings to prevent rejection.",
        impact: 88,
        impactLabel: "High Impact",
        impactType: "warning",
        icon: "search"
      },
      {
        id: 7,
        title: "Quality Checkpoint Recommendation",
        description: "Based on historical defect data, adding quality check after dyeing process could reduce final defect rate by 23%.",
        impact: 78,
        impactLabel: "Medium Impact",
        impactType: "positive",
        icon: "checklist"
      }
    ]
  };
  
  // Get the appropriate styles based on impact type
  const getImpactStyles = (type: string) => {
    switch(type) {
      case 'positive':
        return {
          icon: 'text-emerald-600',
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          progress: 'bg-emerald-500'
        };
      case 'warning':
        return {
          icon: 'text-amber-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          badge: 'bg-amber-50 text-amber-700 border-amber-200',
          progress: 'bg-amber-500'
        };
      case 'negative':
        return {
          icon: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          badge: 'bg-red-50 text-red-700 border-red-200',
          progress: 'bg-red-500'
        };
      case 'neutral':
        return {
          icon: 'text-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          badge: 'bg-blue-50 text-blue-700 border-blue-200',
          progress: 'bg-blue-500'
        };
      default:
        return {
          icon: 'text-primary',
          bg: 'bg-primary-50',
          border: 'border-primary-200',
          badge: 'bg-primary-50 text-primary border-primary-200',
          progress: 'bg-primary'
        };
    }
  };
  
  return (
    <Card className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden border border-gray-200">
      <CardHeader className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center text-gray-900">
            <div className="bg-primary-50 rounded-full p-2 mr-3">
              <span className="material-icons text-primary">recommend</span>
            </div>
            AI-Powered Recommendations
          </CardTitle>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            Real-time
          </Badge>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex mt-4 border-b border-gray-200">
          <button 
            onClick={() => setSelectedTab('production')}
            className={`px-4 py-2 text-sm font-medium -mb-px ${
              selectedTab === 'production' 
                ? 'border-b-2 border-primary text-primary' 
                : 'text-gray-600 hover:text-primary'
            }`}
          >
            Production
          </button>
          <button 
            onClick={() => setSelectedTab('materials')}
            className={`px-4 py-2 text-sm font-medium -mb-px ${
              selectedTab === 'materials' 
                ? 'border-b-2 border-primary text-primary' 
                : 'text-gray-600 hover:text-primary'
            }`}
          >
            Materials
          </button>
          <button 
            onClick={() => setSelectedTab('quality')}
            className={`px-4 py-2 text-sm font-medium -mb-px ${
              selectedTab === 'quality' 
                ? 'border-b-2 border-primary text-primary' 
                : 'text-gray-600 hover:text-primary'
            }`}
          >
            Quality
          </button>
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        <div className="space-y-4">
          {recommendations[selectedTab as keyof typeof recommendations].map(rec => {
            const styles = getImpactStyles(rec.impactType);
            
            return (
              <div key={rec.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
                <div className="flex items-start">
                  <div className={`flex items-center justify-center ${styles.bg} rounded-full p-3 mr-4`}>
                    <span className={`material-icons ${styles.icon}`}>{rec.icon}</span>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">{rec.title}</h3>
                      <Badge variant="outline" className={`${styles.badge} ml-2`}>
                        {rec.impactLabel}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{rec.description}</p>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-700">Implementation Impact</span>
                      <span className="text-xs font-medium text-gray-700">{rec.impact}%</span>
                    </div>
                    
                    <div className="bg-gray-100 rounded-full h-2 mb-4">
                      <div 
                        className={`${styles.progress} h-2 rounded-full`} 
                        style={{ width: `${rec.impact}%` }}
                      ></div>
                    </div>
                    
                    <div className="flex justify-end gap-3">
                      <button className="text-sm text-primary hover:text-primary-dark font-medium flex items-center">
                        <span className="material-icons text-sm mr-1">visibility</span>
                        Details
                      </button>
                      <button className="text-sm bg-primary hover:bg-primary-dark text-white font-medium px-3 py-1 rounded flex items-center">
                        <span className="material-icons text-sm mr-1">check_circle</span>
                        Implement
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};