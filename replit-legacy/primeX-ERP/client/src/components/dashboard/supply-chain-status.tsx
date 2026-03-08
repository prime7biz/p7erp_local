import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SupplyChainStatus {
  id: string;
  title: string;
  status: "on_track" | "minor_delays" | "issues" | "excellent";
  statusText: string;
  description: string;
}

export const SupplyChainStatus = () => {
  const { data: statuses, isLoading } = useQuery<SupplyChainStatus[]>({
    queryKey: ["/api/dashboard/supply-chain-status"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Helper function to get status text color based on status
  const getStatusColor = (status: SupplyChainStatus["status"]) => {
    switch (status) {
      case "on_track":
      case "excellent":
        return "text-status-success";
      case "minor_delays":
        return "text-status-warning";
      case "issues":
        return "text-status-error";
      default:
        return "text-neutral-dark";
    }
  };

  // Helper function to get status text based on status
  const getStatusText = (status: SupplyChainStatus["status"]) => {
    switch (status) {
      case "on_track":
        return "On Track";
      case "minor_delays":
        return "Minor Delays";
      case "issues":
        return "Issues";
      case "excellent":
        return "Excellent";
      default:
        return "Unknown";
    }
  };

  return (
    <Card className="bg-neutral-lightest rounded-lg shadow-sm">
      <CardHeader className="p-4 sm:p-6 pb-0 flex flex-row items-center justify-between">
        <CardTitle className="font-heading font-medium text-base sm:text-lg text-neutral-darkest">
          Supply Chain Status
        </CardTitle>
        <button className="text-neutral-dark hover:text-neutral-darkest">
          <span className="material-icons text-sm sm:text-base">refresh</span>
        </button>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-4">
          {isLoading ? (
            // Loading skeleton
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="relative pl-4 animate-pulse">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-neutral-light rounded"></div>
                <div className="flex justify-between items-center">
                  <div className="h-5 bg-neutral-light rounded w-32 mb-2"></div>
                  <div className="h-5 bg-neutral-light rounded w-20"></div>
                </div>
                <div className="h-4 bg-neutral-light rounded w-full"></div>
              </div>
            ))
          ) : !statuses || statuses.length === 0 ? (
            <div className="text-center py-6">
              <span className="material-icons text-4xl text-neutral-dark mb-2">inventory</span>
              <h3 className="font-medium text-neutral-darkest mb-1">No supply chain data</h3>
              <p className="text-sm text-neutral-dark">Status information will appear here</p>
            </div>
          ) : (
            statuses.map((item) => (
              <div 
                key={item.id} 
                className={`relative pl-3 sm:pl-4 vertical-line before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:rounded before:bg-current ${getStatusColor(item.status)}`}
              >
                <div className="flex flex-col xs:flex-row justify-between xs:items-center">
                  <h4 className="font-medium text-xs sm:text-sm text-neutral-darkest">{item.title}</h4>
                  <span className={`${getStatusColor(item.status)} text-2xs sm:text-xs font-medium mt-0.5 xs:mt-0`}>
                    {item.statusText || getStatusText(item.status)}
                  </span>
                </div>
                <p className="text-2xs sm:text-xs text-neutral-dark mt-1">{item.description}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
