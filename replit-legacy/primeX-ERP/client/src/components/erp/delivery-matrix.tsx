import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Save,
  Trash2,
  Loader2,
  Package,
  AlertTriangle,
  Calendar,
  Ship,
} from 'lucide-react';
import { format } from 'date-fns';

interface DeliveryMatrixProps {
  orderId: number;
  styleId?: number | null;
  totalQuantity: number;
}

interface Delivery {
  id: number;
  order_id: number;
  delivery_no: number;
  ex_factory_date: string | null;
  ship_date: string | null;
  destination: string | null;
  incoterm: string | null;
  remarks: string | null;
  status: string;
  line_count: number;
  total_qty: number;
}

interface DeliveryLine {
  id: number;
  order_delivery_id: number;
  style_id: number;
  component_id: number | null;
  colorway_id: number | null;
  size: string;
  qty: number;
  pack_type: string;
  pcs_per_pack: number;
  net_qty: number;
  component_name: string | null;
  colorway_name: string | null;
}

interface Component {
  id: number;
  name: string;
  componentType: string;
}

interface Colorway {
  id: number;
  colorName: string;
  colorCode: string | null;
}

interface SizeScale {
  id: number;
  scaleName: string;
  sizes: string[];
}

type MatrixKey = string;
type MatrixData = Record<MatrixKey, number>;

function makeKey(componentId: number | null, colorwayId: number | null, size: string): MatrixKey {
  return `${componentId || 0}_${colorwayId || 0}_${size}`;
}

function parseKey(key: MatrixKey): { componentId: number | null; colorwayId: number | null; size: string } {
  const parts = key.split('_');
  const size = parts.slice(2).join('_');
  return {
    componentId: parseInt(parts[0]) || null,
    colorwayId: parseInt(parts[1]) || null,
    size,
  };
}

const statusColors: Record<string, string> = {
  PLANNED: 'bg-blue-500',
  CONFIRMED: 'bg-green-500',
  IN_PRODUCTION: 'bg-amber-500',
  SHIPPED: 'bg-emerald-500',
  DELIVERED: 'bg-teal-500',
  CANCELLED: 'bg-red-500',
};

function DeliveryCard({
  delivery,
  orderId,
  styleId,
  onDelete,
}: {
  delivery: Delivery;
  orderId: number;
  styleId?: number | null;
  onDelete: (id: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: deliveryDetail, isLoading: isLoadingDetail } = useQuery<{
    lines: DeliveryLine[];
  }>({
    queryKey: ['/api/orders', orderId, 'deliveries', delivery.id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/deliveries/${delivery.id}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch delivery detail');
      return res.json();
    },
    enabled: isOpen,
  });

  const { data: componentsRes } = useQuery<{ success: boolean; data: Component[] }>({
    queryKey: ['/api/merch/styles', styleId, 'components'],
    queryFn: async () => {
      const res = await fetch(`/api/merch/styles/${styleId}/components`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch components');
      return res.json();
    },
    enabled: isOpen && !!styleId,
  });

  const { data: colorwaysRes } = useQuery<{ success: boolean; data: Colorway[] }>({
    queryKey: ['/api/merch/styles', styleId, 'colorways'],
    queryFn: async () => {
      const res = await fetch(`/api/merch/styles/${styleId}/colorways`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch colorways');
      return res.json();
    },
    enabled: isOpen && !!styleId,
  });

  const { data: sizeScalesRes } = useQuery<{ success: boolean; data: SizeScale[] }>({
    queryKey: ['/api/merch/styles', styleId, 'size-scales'],
    queryFn: async () => {
      const res = await fetch(`/api/merch/styles/${styleId}/size-scales`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch size scales');
      return res.json();
    },
    enabled: isOpen && !!styleId,
  });

  const components = componentsRes?.data || [];
  const colorways = colorwaysRes?.data || [];
  const sizeScales = sizeScalesRes?.data || [];

  const sizes = useMemo(() => {
    if (sizeScales.length > 0 && sizeScales[0].sizes) {
      const rawSizes = sizeScales[0].sizes;
      if (Array.isArray(rawSizes)) return rawSizes as string[];
      if (typeof rawSizes === 'string') {
        try { return JSON.parse(rawSizes) as string[]; } catch { return [rawSizes]; }
      }
    }
    return ['Qty'];
  }, [sizeScales]);

  const rows = useMemo(() => {
    const result: { componentId: number | null; componentName: string; colorwayId: number | null; colorwayName: string }[] = [];

    const comps = components.length > 0 ? components : [{ id: 0, name: '', componentType: '' }];
    const cols = colorways.length > 0 ? colorways : [{ id: 0, colorName: 'Default', colorCode: null }];

    for (const comp of comps) {
      for (const cw of cols) {
        result.push({
          componentId: comp.id || null,
          componentName: comp.name || '',
          colorwayId: cw.id || null,
          colorwayName: cw.colorName,
        });
      }
    }
    return result;
  }, [components, colorways]);

  const [matrixData, setMatrixData] = useState<MatrixData>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (deliveryDetail?.lines) {
      const data: MatrixData = {};
      for (const line of deliveryDetail.lines) {
        const key = makeKey(line.component_id, line.colorway_id, line.size);
        data[key] = line.qty;
      }
      setMatrixData(data);
      setIsDirty(false);
    }
  }, [deliveryDetail]);

  const handleCellChange = useCallback((key: MatrixKey, value: number) => {
    setMatrixData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const getRowTotal = useCallback(
    (componentId: number | null, colorwayId: number | null) => {
      return sizes.reduce((sum, size) => {
        const key = makeKey(componentId, colorwayId, size);
        return sum + (matrixData[key] || 0);
      }, 0);
    },
    [matrixData, sizes]
  );

  const getColumnTotal = useCallback(
    (size: string) => {
      return rows.reduce((sum, row) => {
        const key = makeKey(row.componentId, row.colorwayId, size);
        return sum + (matrixData[key] || 0);
      }, 0);
    },
    [matrixData, rows]
  );

  const grandTotal = useMemo(() => {
    return Object.values(matrixData).reduce((sum, val) => sum + (val || 0), 0);
  }, [matrixData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const lines: any[] = [];
      for (const [key, qty] of Object.entries(matrixData)) {
        if (qty > 0) {
          const parsed = parseKey(key);
          lines.push({
            styleId: styleId,
            componentId: parsed.componentId,
            colorwayId: parsed.colorwayId,
            size: parsed.size,
            qty: qty,
            packType: 'SINGLE',
            pcsPerPack: 1,
          });
        }
      }

      if (lines.length === 0) {
        throw new Error('No quantities to save');
      }

      return apiRequest(
        `/api/orders/${orderId}/deliveries/${delivery.id}/lines`,
        'POST',
        { lines }
      );
    },
    onSuccess: () => {
      toast({ title: 'Saved', description: `Delivery #${delivery.delivery_no} lines saved.` });
      setIsDirty(false);
      queryClient.invalidateQueries({
        queryKey: ['/api/orders', orderId, 'deliveries', delivery.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/orders', orderId, 'deliveries'],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save delivery lines',
        variant: 'destructive',
      });
    },
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <div>
                  <CardTitle className="text-base">Delivery #{delivery.delivery_no}</CardTitle>
                  <CardDescription className="flex items-center gap-3 mt-1">
                    {delivery.ex_factory_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Ex-Factory: {format(new Date(delivery.ex_factory_date), 'dd MMM yyyy')}
                      </span>
                    )}
                    {delivery.ship_date && (
                      <span className="flex items-center gap-1">
                        <Ship className="h-3 w-3" />
                        Ship: {format(new Date(delivery.ship_date), 'dd MMM yyyy')}
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={`text-white ${statusColors[delivery.status] || 'bg-gray-500'}`}>
                  {delivery.status}
                </Badge>
                <div className="text-sm text-muted-foreground">
                  {delivery.total_qty.toLocaleString()} pcs
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Delivery #{delivery.delivery_no}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this delivery and all its line items.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground"
                        onClick={() => onDelete(delivery.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent>
            {isLoadingDetail ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : !styleId ? (
              <div className="text-center py-6 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2" />
                <p>No master style linked to this order.</p>
                <p className="text-xs mt-1">Link a style to the order to use the delivery matrix.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {components.length > 0 && <TableHead className="min-w-[100px]">Component</TableHead>}
                        <TableHead className="min-w-[100px]">Colorway</TableHead>
                        {sizes.map((size) => (
                          <TableHead key={size} className="text-center min-w-[70px]">
                            {size}
                          </TableHead>
                        ))}
                        <TableHead className="text-center min-w-[80px] font-bold">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, rowIdx) => (
                        <TableRow key={`${row.componentId}_${row.colorwayId}`}>
                          {components.length > 0 && (
                            <TableCell className="font-medium text-sm">{row.componentName}</TableCell>
                          )}
                          <TableCell className="text-sm">{row.colorwayName}</TableCell>
                          {sizes.map((size) => {
                            const key = makeKey(row.componentId, row.colorwayId, size);
                            return (
                              <TableCell key={size} className="p-1">
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-8 w-16 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={matrixData[key] || ''}
                                  onChange={(e) =>
                                    handleCellChange(key, parseInt(e.target.value) || 0)
                                  }
                                />
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center font-medium">
                            {getRowTotal(row.componentId, row.colorwayId).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        {components.length > 0 && <TableCell />}
                        <TableCell className="text-sm font-bold">Column Total</TableCell>
                        {sizes.map((size) => (
                          <TableCell key={size} className="text-center text-sm font-bold">
                            {getColumnTotal(size).toLocaleString()}
                          </TableCell>
                        ))}
                        <TableCell className="text-center text-sm font-bold">
                          {grandTotal.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={!isDirty || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Delivery Lines
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function DeliveryMatrix({ orderId, styleId, totalQuantity }: DeliveryMatrixProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: deliveries,
    isLoading,
  } = useQuery<Delivery[]>({
    queryKey: ['/api/orders', orderId, 'deliveries'],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/deliveries`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch deliveries');
      return res.json();
    },
  });

  const addDeliveryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/orders/${orderId}/deliveries`, 'POST', {
        status: 'PLANNED',
      });
    },
    onSuccess: () => {
      toast({ title: 'Delivery created', description: 'New delivery has been added.' });
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'deliveries'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create delivery',
        variant: 'destructive',
      });
    },
  });

  const deleteDeliveryMutation = useMutation({
    mutationFn: async (deliveryId: number) => {
      return apiRequest(`/api/orders/${orderId}/deliveries/${deliveryId}`, 'DELETE');
    },
    onSuccess: () => {
      toast({ title: 'Deleted', description: 'Delivery has been removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'deliveries'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete delivery',
        variant: 'destructive',
      });
    },
  });

  const totalDeliveryQty = useMemo(() => {
    return (deliveries || []).reduce((sum, d) => sum + (d.total_qty || 0), 0);
  }, [deliveries]);

  const qtyMismatch = totalQuantity > 0 && totalDeliveryQty !== totalQuantity;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Deliveries</h3>
          <p className="text-sm text-muted-foreground">
            Manage delivery schedule and size/color quantity breakdowns
          </p>
        </div>
        <Button
          onClick={() => addDeliveryMutation.mutate()}
          disabled={addDeliveryMutation.isPending}
        >
          {addDeliveryMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Add Delivery
        </Button>
      </div>

      {(!deliveries || deliveries.length === 0) ? (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Deliveries Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first delivery to start planning size and color breakdowns.
            </p>
            <Button
              onClick={() => addDeliveryMutation.mutate()}
              disabled={addDeliveryMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add First Delivery
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {deliveries.map((delivery) => (
            <DeliveryCard
              key={delivery.id}
              delivery={delivery}
              orderId={orderId}
              styleId={styleId}
              onDelete={(id) => deleteDeliveryMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {deliveries && deliveries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Totals Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {deliveries.map((d) => (
                <div key={d.id} className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                  <span className="text-sm font-medium">Delivery #{d.delivery_no}</span>
                  <span className="text-sm">{(d.total_qty || 0).toLocaleString()} pcs</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <div>
                <span className="text-sm font-bold">Grand Total: </span>
                <span className="text-lg font-bold">{totalDeliveryQty.toLocaleString()} pcs</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Order Qty: </span>
                <span className="font-medium">{totalQuantity.toLocaleString()} pcs</span>
              </div>
            </div>
            {qtyMismatch && (
              <div className="mt-3 flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">
                  Delivery total ({totalDeliveryQty.toLocaleString()}) does not match order
                  quantity ({totalQuantity.toLocaleString()}). Difference:{' '}
                  {Math.abs(totalQuantity - totalDeliveryQty).toLocaleString()} pcs.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
