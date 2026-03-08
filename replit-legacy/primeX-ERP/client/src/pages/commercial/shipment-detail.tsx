import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Ship,
  Truck,
  Plane,
  FileText,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Upload,
  ExternalLink,
  Clock,
  MapPin,
  Package,
} from "lucide-react";

interface ShipmentData {
  id: number;
  shipment_number: string;
  sales_order_id: number | null;
  mode: string;
  forwarder: string | null;
  vessel_or_flight: string | null;
  container_number: string | null;
  etd: string | null;
  eta: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  status: string;
  remarks: string | null;
  created_at: string;
}

interface ChecklistItem {
  id: number;
  tenantId: number;
  shipmentId: number;
  documentType: string;
  documentLabel: string;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: number | null;
  documentUrl: string | null;
  notes: string | null;
}

export default function ShipmentDetail() {
  const [, params] = useRoute("/commercial/shipments/:id");
  const shipmentId = params?.id ? parseInt(params.id) : 0;
  const { toast } = useToast();
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [editingUrl, setEditingUrl] = useState<number | null>(null);
  const [urlText, setUrlText] = useState("");

  const { data: shipment, isLoading: shipmentLoading } = useQuery<ShipmentData>({
    queryKey: ['/api/commercial/shipments', shipmentId],
    enabled: shipmentId > 0,
  });

  const { data: checklist, isLoading: checklistLoading } = useQuery<ChecklistItem[]>({
    queryKey: ['/api/commercial/shipments', shipmentId, 'checklist'],
    enabled: shipmentId > 0,
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/commercial/shipments/checklist/${itemId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/commercial/shipments', shipmentId, 'checklist'] });
      toast({ title: "Checklist updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await apiRequest("POST", `/api/commercial/shipments/${shipmentId}/update-status`, { status: newStatus });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/commercial/shipments', shipmentId] });
      toast({ title: "Status updated" });
    },
    onError: (err: any) => {
      toast({ title: "Cannot update status", description: err.message, variant: "destructive" });
    },
  });

  const toggleCompleted = (item: ChecklistItem) => {
    updateItemMutation.mutate({ itemId: item.id, data: { isCompleted: !item.isCompleted } });
  };

  const saveNotes = (itemId: number) => {
    updateItemMutation.mutate({ itemId, data: { notes: noteText } });
    setEditingNotes(null);
  };

  const saveUrl = (itemId: number) => {
    updateItemMutation.mutate({ itemId, data: { documentUrl: urlText } });
    setEditingUrl(null);
  };

  const completedCount = checklist?.filter(i => i.isCompleted).length || 0;
  const totalCount = checklist?.length || 0;
  const requiredCount = checklist?.filter(i => i.isRequired).length || 0;
  const requiredCompleted = checklist?.filter(i => i.isRequired && i.isCompleted).length || 0;
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const requiredPercent = requiredCount > 0 ? Math.round((requiredCompleted / requiredCount) * 100) : 0;

  const getModeIcon = (mode: string) => {
    switch (mode?.toLowerCase()) {
      case 'sea': return <Ship className="h-5 w-5" />;
      case 'air': return <Plane className="h-5 w-5" />;
      default: return <Truck className="h-5 w-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PLANNED': return "bg-gray-100 text-gray-800";
      case 'BOOKED': return "bg-blue-100 text-blue-800";
      case 'SHIPPED': return "bg-emerald-100 text-emerald-800";
      case 'DELIVERED': return "bg-green-100 text-green-800";
      case 'CLOSED': return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const nextStatusMap: Record<string, string> = {
    PLANNED: 'BOOKED',
    BOOKED: 'SHIPPED',
    SHIPPED: 'DELIVERED',
    DELIVERED: 'CLOSED',
  };

  if (shipmentLoading) {
    return (
      <DashboardContainer title="Shipment Detail" subtitle="Loading...">
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </DashboardContainer>
    );
  }

  if (!shipment) {
    return (
      <DashboardContainer title="Shipment Not Found" subtitle="">
        <Card><CardContent className="py-8 text-center text-muted-foreground">Shipment not found.</CardContent></Card>
      </DashboardContainer>
    );
  }

  const nextStatus = nextStatusMap[shipment.status];
  const canAdvance = !!nextStatus;
  const isShippingBlocked = shipment.status === 'BOOKED' && requiredCompleted < requiredCount;

  return (
    <DashboardContainer
      title={`Shipment ${shipment.shipment_number}`}
      subtitle="Shipment details and document checklist"
      actions={
        <Link href="/commercial">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {getModeIcon(shipment.mode)}
                Shipment Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge className={getStatusColor(shipment.status)}>{shipment.status}</Badge>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium capitalize">{shipment.mode}</span>
              </div>
              {shipment.forwarder && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Forwarder</span>
                  <span className="font-medium">{shipment.forwarder}</span>
                </div>
              )}
              {shipment.vessel_or_flight && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vessel/Flight</span>
                  <span className="font-medium">{shipment.vessel_or_flight}</span>
                </div>
              )}
              {shipment.container_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Container</span>
                  <span className="font-medium">{shipment.container_number}</span>
                </div>
              )}
              <Separator />
              {shipment.port_of_loading && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Loading:</span>
                  <span className="font-medium">{shipment.port_of_loading}</span>
                </div>
              )}
              {shipment.port_of_discharge && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Discharge:</span>
                  <span className="font-medium">{shipment.port_of_discharge}</span>
                </div>
              )}
              {shipment.etd && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">ETD:</span>
                  <span className="font-medium">{new Date(shipment.etd).toLocaleDateString()}</span>
                </div>
              )}
              {shipment.eta && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">ETA:</span>
                  <span className="font-medium">{new Date(shipment.eta).toLocaleDateString()}</span>
                </div>
              )}
              {shipment.remarks && (
                <>
                  <Separator />
                  <p className="text-muted-foreground text-xs">{shipment.remarks}</p>
                </>
              )}
            </CardContent>
          </Card>

          {canAdvance && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent>
                {isShippingBlocked && (
                  <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Complete all required documents before advancing to SHIPPED status.</span>
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={statusMutation.isPending || (isShippingBlocked && nextStatus === 'SHIPPED')}
                  onClick={() => statusMutation.mutate(nextStatus)}
                >
                  {statusMutation.isPending ? "Updating..." : `Advance to ${nextStatus}`}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Document Checklist
                  </CardTitle>
                  <CardDescription>
                    {completedCount} of {totalCount} documents completed
                    {requiredCount > 0 && ` · ${requiredCompleted}/${requiredCount} required`}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold">{completionPercent}%</span>
                  <p className="text-xs text-muted-foreground">Complete</p>
                </div>
              </div>
              <div className="pt-2 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Overall</span>
                  <Progress value={completionPercent} className="flex-1 h-2" />
                </div>
                {requiredCount > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Required</span>
                    <Progress value={requiredPercent} className={`flex-1 h-2 ${requiredPercent === 100 ? '[&>div]:bg-green-500' : '[&>div]:bg-amber-500'}`} />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {checklistLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : checklist && checklist.length > 0 ? (
                <div className="divide-y">
                  {checklist.map(item => (
                    <div key={item.id} className={`px-6 py-4 ${item.isCompleted ? 'bg-green-50/30' : ''}`}>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={item.isCompleted}
                          onCheckedChange={() => toggleCompleted(item)}
                          className="mt-0.5"
                          disabled={updateItemMutation.isPending}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${item.isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                              {item.documentLabel}
                            </span>
                            {item.isRequired && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200">Required</Badge>
                            )}
                            {item.isCompleted && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                          </div>

                          <div className="flex items-center gap-4 mt-2">
                            {editingUrl === item.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <Input
                                  placeholder="Document URL"
                                  value={urlText}
                                  onChange={e => setUrlText(e.target.value)}
                                  className="h-7 text-xs flex-1"
                                />
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveUrl(item.id)}>Save</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingUrl(null)}>Cancel</Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => { setEditingUrl(item.id); setUrlText(item.documentUrl || ""); }}
                              >
                                <Upload className="h-3 w-3 mr-1" />
                                {item.documentUrl ? "Update URL" : "Add URL"}
                              </Button>
                            )}

                            {item.documentUrl && editingUrl !== item.id && (
                              <a href={item.documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                                <ExternalLink className="h-3 w-3" /> View
                              </a>
                            )}

                            {editingNotes === item.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <Input
                                  placeholder="Notes..."
                                  value={noteText}
                                  onChange={e => setNoteText(e.target.value)}
                                  className="h-7 text-xs flex-1"
                                />
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveNotes(item.id)}>Save</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNotes(null)}>Cancel</Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => { setEditingNotes(item.id); setNoteText(item.notes || ""); }}
                              >
                                {item.notes ? "Edit Notes" : "Add Notes"}
                              </Button>
                            )}
                          </div>

                          {item.notes && editingNotes !== item.id && (
                            <p className="text-xs text-muted-foreground mt-1 italic">{item.notes}</p>
                          )}

                          {item.completedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Completed: {new Date(item.completedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  No checklist items found
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardContainer>
  );
}
