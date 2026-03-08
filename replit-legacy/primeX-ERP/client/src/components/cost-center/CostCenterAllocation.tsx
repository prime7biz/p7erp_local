import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface CostCenterAllocationProps {
  costCenterId?: number | null;
  costCategoryId?: number | null;
  onCostCenterChange: (id: number | null) => void;
  onCostCategoryChange: (id: number | null) => void;
  compact?: boolean;
}

interface OrderItem {
  orderId: number;
  orderNumber: string;
  styleName: string;
  customerName: string | null;
}

interface CategoryItem {
  id: number;
  name: string;
  code: string;
}

export function CostCenterAllocation({
  costCenterId, costCategoryId, onCostCenterChange, onCostCategoryChange, compact = false,
}: CostCenterAllocationProps) {
  const { data: summaryData } = useQuery<{ costCenters: OrderItem[] }>({
    queryKey: ["/api/cost-centers/summary"],
  });

  const { data: categories } = useQuery<CategoryItem[]>({
    queryKey: ["/api/cost-centers/categories"],
  });

  const orders = summaryData?.costCenters || [];

  if (compact) {
    return (
      <div className="flex gap-2">
        <Select
          value={costCenterId ? String(costCenterId) : "none"}
          onValueChange={(v) => onCostCenterChange(v === "none" ? null : parseInt(v))}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Cost Center" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {orders.map((o) => (
              <SelectItem key={o.orderId} value={String(o.orderId)}>
                {o.orderNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={costCategoryId ? String(costCategoryId) : "none"}
          onValueChange={(v) => onCostCategoryChange(v === "none" ? null : parseInt(v))}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.code} - {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Cost Center (Order)</Label>
        <Select
          value={costCenterId ? String(costCenterId) : "none"}
          onValueChange={(v) => onCostCenterChange(v === "none" ? null : parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select cost center..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {orders.map((o) => (
              <SelectItem key={o.orderId} value={String(o.orderId)}>
                {o.orderNumber} — {o.styleName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Cost Category</Label>
        <Select
          value={costCategoryId ? String(costCategoryId) : "none"}
          onValueChange={(v) => onCostCategoryChange(v === "none" ? null : parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select category..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}