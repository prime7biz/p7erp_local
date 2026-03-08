import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Order {
  id: string;
  orderId: string;
  customer: string;
  items: string;
  value: string;
  status: "in_production" | "material_sourcing" | "quality_check" | "completed";
  deadline: string;
  isAtRisk: boolean;
}

export const OrderStatus = () => {
  const { toast } = useToast();
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/dashboard/recent-orders"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleRowClick = (order: Order) => {
    toast({
      title: `Order ${order.orderId}`,
      description: `Viewing details for ${order.customer}'s order`,
    });
  };

  // Helper function to get status badge styling
  const getStatusBadge = (status: Order["status"]) => {
    switch (status) {
      case "in_production":
        return "bg-status-warning bg-opacity-10 text-status-warning";
      case "material_sourcing":
        return "bg-status-info bg-opacity-10 text-status-info";
      case "quality_check":
        return "bg-status-success bg-opacity-10 text-status-success";
      case "completed":
        return "bg-neutral-dark bg-opacity-10 text-neutral-dark";
      default:
        return "bg-neutral-medium text-neutral-dark";
    }
  };

  // Helper function to format status label
  const getStatusLabel = (status: Order["status"]) => {
    switch (status) {
      case "in_production":
        return "In Production";
      case "material_sourcing":
        return "Material Sourcing";
      case "quality_check":
        return "Quality Check";
      case "completed":
        return "Completed";
      default:
        return "Unknown";
    }
  };

  // Helper function to determine deadline text class
  const getDeadlineClass = (deadline: string, isAtRisk: boolean) => {
    if (isAtRisk) return "text-status-error";
    
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const diffDays = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "text-status-error";
    if (diffDays < 3) return "text-status-warning";
    return "text-neutral-dark";
  };

  return (
    <Card className="bg-neutral-lightest rounded-lg shadow-sm">
      <CardHeader className="p-6 pb-0 flex flex-row items-center justify-between">
        <CardTitle className="font-heading font-medium text-lg text-neutral-darkest">
          Recent Orders
        </CardTitle>
        <button className="text-primary text-sm font-medium hover:text-primary-dark">
          View All
        </button>
      </CardHeader>
      <CardContent className="p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-medium">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-dark uppercase tracking-wider">Order ID</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-dark uppercase tracking-wider">Customer</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-dark uppercase tracking-wider">Items</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-dark uppercase tracking-wider">Value</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-dark uppercase tracking-wider">Status</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-dark uppercase tracking-wider">Deadline</th>
              </tr>
            </thead>
            <tbody className="bg-neutral-lightest divide-y divide-neutral-medium">
              {isLoading ? (
                // Loading skeleton
                Array(4).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="h-5 bg-neutral-light rounded w-24"></div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="h-5 bg-neutral-light rounded w-32"></div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="h-5 bg-neutral-light rounded w-28"></div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="h-5 bg-neutral-light rounded w-20"></div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="h-5 bg-neutral-light rounded w-24"></div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="h-5 bg-neutral-light rounded w-24"></div>
                    </td>
                  </tr>
                ))
              ) : !orders || orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center">
                    <span className="material-icons text-3xl text-neutral-dark mb-2">shopping_cart</span>
                    <p className="text-sm font-medium text-neutral-darkest">No orders found</p>
                    <p className="text-xs text-neutral-dark mt-1">New orders will appear here</p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr 
                    key={order.id}
                    className="hover:bg-neutral-light cursor-pointer"
                    onClick={() => handleRowClick(order)}
                  >
                    <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-primary">
                      {order.orderId}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-neutral-darkest">
                      {order.customer}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-neutral-dark">
                      {order.items}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-neutral-darkest">
                      {order.value}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <Badge variant="outline" className={`px-2 text-xs leading-5 font-semibold rounded-full ${getStatusBadge(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </Badge>
                    </td>
                    <td className={`px-3 py-4 whitespace-nowrap text-sm ${getDeadlineClass(order.deadline, order.isAtRisk)}`}>
                      {order.deadline}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
