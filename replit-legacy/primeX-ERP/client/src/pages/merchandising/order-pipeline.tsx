import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Calendar, Clock, Package, Users, Filter, Search, ArrowRight } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";

interface PipelineItem {
  id: number;
  type: string;
  stage: string;
  buyerName: string;
  styleName: string;
  quantity: number;
  deliveryDate: string | null;
  daysRemaining: number | null;
  status: string;
  referenceId: string;
  assignedTo?: string;
}

interface PipelineData {
  stages: Record<string, PipelineItem[]>;
  summary: Record<string, number>;
  buyers: string[];
}

const STAGE_ORDER = [
  "Inquiry",
  "Sample Dev",
  "Quotation",
  "Confirmed",
  "In Production",
  "QC",
  "Ready to Ship",
  "Shipped",
];

const STAGE_COLORS: Record<string, string> = {
  "Inquiry": "bg-blue-50 border-blue-200",
  "Sample Dev": "bg-purple-50 border-purple-200",
  "Quotation": "bg-amber-50 border-amber-200",
  "Confirmed": "bg-emerald-50 border-emerald-200",
  "In Production": "bg-orange-50 border-orange-200",
  "QC": "bg-cyan-50 border-cyan-200",
  "Ready to Ship": "bg-teal-50 border-teal-200",
  "Shipped": "bg-green-50 border-green-200",
};

const STAGE_HEADER_COLORS: Record<string, string> = {
  "Inquiry": "bg-blue-500",
  "Sample Dev": "bg-purple-500",
  "Quotation": "bg-amber-500",
  "Confirmed": "bg-emerald-500",
  "In Production": "bg-orange-500",
  "QC": "bg-cyan-500",
  "Ready to Ship": "bg-teal-500",
  "Shipped": "bg-green-500",
};

function getStatusColor(daysRemaining: number | null): string {
  if (daysRemaining === null) return "text-gray-500";
  if (daysRemaining < 0) return "text-red-600";
  if (daysRemaining <= 7) return "text-amber-600";
  return "text-green-600";
}

function getStatusBadge(daysRemaining: number | null): { variant: "destructive" | "default" | "secondary" | "outline"; label: string } {
  if (daysRemaining === null) return { variant: "secondary", label: "No date" };
  if (daysRemaining < 0) return { variant: "destructive", label: `${Math.abs(daysRemaining)}d overdue` };
  if (daysRemaining <= 7) return { variant: "default", label: `${daysRemaining}d left` };
  return { variant: "outline", label: `${daysRemaining}d left` };
}

function PipelineCard({ item }: { item: PipelineItem }) {
  const [, navigate] = useLocation();
  const badge = getStatusBadge(item.daysRemaining);
  const statusColor = getStatusColor(item.daysRemaining);

  const handleClick = () => {
    switch (item.type) {
      case "inquiry": navigate(`/inquiries/${item.id}`); break;
      case "sample": navigate(`/samples/requests/${item.id}`); break;
      case "quotation": navigate(`/quotations/${item.id}`); break;
      case "order": navigate(`/orders/${item.id}`); break;
      case "shipment": navigate(`/logistics`); break;
    }
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow mb-2 border-l-4"
      style={{ borderLeftColor: item.daysRemaining !== null && item.daysRemaining < 0 ? '#ef4444' : item.daysRemaining !== null && item.daysRemaining <= 7 ? '#f59e0b' : '#22c55e' }}
      onClick={handleClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-mono">{item.referenceId}</p>
            <p className="font-medium text-sm truncate">{item.styleName}</p>
          </div>
          <Badge variant={badge.variant} className="text-[10px] shrink-0">
            {badge.label}
          </Badge>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span className="truncate">{item.buyerName}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Package className="h-3 w-3" />
            <span>{item.quantity?.toLocaleString() || 0} pcs</span>
          </div>
          {item.deliveryDate && (
            <div className={`flex items-center gap-1 ${statusColor}`}>
              <Calendar className="h-3 w-3" />
              <span>{new Date(item.deliveryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
            </div>
          )}
        </div>

        {item.assignedTo && (
          <p className="text-[10px] text-muted-foreground truncate">
            Assigned: {item.assignedTo}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function OrderPipelinePage() {
  const [buyerFilter, setBuyerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery<{ success: boolean; data: PipelineData }>({
    queryKey: ["/api/merch/pipeline"],
  });

  const pipelineData = data?.data;

  const filteredStages = useMemo(() => {
    if (!pipelineData?.stages) return {};
    const filtered: Record<string, PipelineItem[]> = {};
    for (const stage of STAGE_ORDER) {
      const items = pipelineData.stages[stage] || [];
      filtered[stage] = items.filter((item) => {
        const matchesBuyer = buyerFilter === "all" || item.buyerName === buyerFilter;
        const matchesSearch = !searchQuery ||
          item.styleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.buyerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.referenceId.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesBuyer && matchesSearch;
      });
    }
    return filtered;
  }, [pipelineData, buyerFilter, searchQuery]);

  const totalItems = useMemo(() => {
    return Object.values(filteredStages).reduce((sum, items) => sum + items.length, 0);
  }, [filteredStages]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Order Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track orders across {STAGE_ORDER.length} stages · {totalItems} active items
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by style, buyer, or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={buyerFilter} onValueChange={setBuyerFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by buyer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Buyers</SelectItem>
            {(pipelineData?.buyers || []).map((buyer) => (
              <SelectItem key={buyer} value={buyer}>{buyer}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-2">
        {STAGE_ORDER.map((stage) => {
          const count = (filteredStages[stage] || []).length;
          return (
            <div key={stage} className="text-center">
              <div className={`text-white text-xs font-semibold rounded-full px-2 py-1 ${STAGE_HEADER_COLORS[stage]}`}>
                {count}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 hidden sm:block">{stage}</p>
            </div>
          );
        })}
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-4" style={{ minWidth: `${STAGE_ORDER.length * 280}px` }}>
          {STAGE_ORDER.map((stage, idx) => {
            const items = filteredStages[stage] || [];
            return (
              <div key={stage} className="flex items-start gap-1">
                <div className={`w-[270px] shrink-0 rounded-lg border ${STAGE_COLORS[stage]} min-h-[400px]`}>
                  <div className="p-3 border-b">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">{stage}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {items.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-2 space-y-0">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">No items</p>
                    ) : (
                      items.map((item) => (
                        <PipelineCard key={`${item.type}-${item.id}`} item={item} />
                      ))
                    )}
                  </div>
                </div>
                {idx < STAGE_ORDER.length - 1 && (
                  <div className="flex items-center pt-20 text-muted-foreground/30">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
