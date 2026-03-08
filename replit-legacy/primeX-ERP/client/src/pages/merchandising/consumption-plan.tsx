import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Loader2, Package, AlertTriangle, CheckCircle, ClipboardList,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import Spinner from '@/components/ui/spinner';

const planStatusColors: Record<string, string> = {
  PLANNED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  APPROVAL_REQUIRED: 'bg-amber-100 text-amber-800',
};

export default function ConsumptionPlanPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { toast } = useToast();

  const { data: orderData } = useQuery<any>({
    queryKey: ['/api/orders', orderId],
    enabled: !!orderId,
  });

  const { data: planData, isLoading, isError } = useQuery<any>({
    queryKey: ['/api/bom/orders', orderId, 'consumption-plan'],
    enabled: !!orderId,
  });

  const finalizeMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/bom/orders/${orderId}/finalize-consumption`, 'POST', {
        requestId: crypto.randomUUID(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom/orders', orderId, 'consumption-plan'] });
      toast({ title: 'Consumption Finalized', description: 'Consumption plan has been created.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to finalize consumption.', variant: 'destructive' });
    },
  });

  const overrideApproveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/bom/orders/${orderId}/consumption-plan/approve`, 'POST', {
        override: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom/orders', orderId, 'consumption-plan'] });
      toast({ title: 'Approved', description: 'Consumption plan has been override approved.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to approve.', variant: 'destructive' });
    },
  });

  const plan = planData;
  const planItems = plan?.items || plan?.lines || [];
  const planStatus = plan?.status;
  const missingItems = plan?.missingItems || [];
  const order = orderData;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Consumption Plan</h1>
            <p className="text-muted-foreground">
              Order #{order?.orderNo || order?.id || orderId}
              {order?.buyerName && ` • ${order.buyerName}`}
              {order?.styleName && ` • ${order.styleName}`}
            </p>
          </div>
          {planStatus && (
            <Badge className={`text-sm ${planStatusColors[planStatus] || 'bg-gray-100 text-gray-800'}`}>
              {planStatus.replace(/_/g, ' ')}
            </Badge>
          )}
        </div>

        {order && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Order No</span>
                  <p className="font-medium">{order.orderNo || order.id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Buyer</span>
                  <p className="font-medium">{order.buyerName || order.customerName || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity</span>
                  <p className="font-medium">{order.totalQty || order.quantity || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Value</span>
                  <p className="font-medium">
                    {order.totalAmount ? `BDT ${Number(order.totalAmount).toLocaleString()}` : '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {planStatus === 'APPROVAL_REQUIRED' && missingItems.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Approval Required</AlertTitle>
            <AlertDescription>
              <p className="mb-2">The following items have insufficient stock or missing reservations:</p>
              <ul className="list-disc list-inside mb-3">
                {missingItems.map((item: any, i: number) => (
                  <li key={i}>{item.itemDescription || item.name} — Short: {item.shortQty || item.deficit}</li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                onClick={() => overrideApproveMutation.mutate()}
                disabled={overrideApproveMutation.isPending}
              >
                {overrideApproveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Override Approve
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!plan && !isError && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No consumption plan exists for this order yet.</p>
              <Button onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending}>
                {finalizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Finalize Consumption
              </Button>
            </CardContent>
          </Card>
        )}

        {planItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" /> Consumption Items
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Required Qty</TableHead>
                    <TableHead>Reserved Qty</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Source Warehouse</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planItems.map((item: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.itemDescription || item.itemName || item.name}</TableCell>
                      <TableCell>{item.requiredQty}</TableCell>
                      <TableCell>{item.reservedQty}</TableCell>
                      <TableCell>{item.uom}</TableCell>
                      <TableCell>{item.sourceWarehouse || item.warehouseName || '-'}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            item.reservedQty >= item.requiredQty
                              ? 'text-green-700 border-green-300'
                              : 'text-amber-700 border-amber-300'
                          }
                        >
                          {item.reservedQty >= item.requiredQty ? 'Covered' : 'Short'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
