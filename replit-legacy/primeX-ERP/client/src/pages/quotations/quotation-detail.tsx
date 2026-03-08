import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation, Link } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, CheckCircle, RotateCcw, FileText, Loader2,
  DollarSign, TrendingUp, Calculator, Edit, Clock, CircleDot,
  ShoppingCart,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-blue-100 text-blue-800',
  SUBMITTED: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  REVISED: 'bg-purple-100 text-purple-800',
  SUPERSEDED: 'bg-gray-100 text-gray-800',
};

const costingFields = [
  { key: 'fabricCost', label: 'Fabric' },
  { key: 'trimsCost', label: 'Trims' },
  { key: 'packingCost', label: 'Packing' },
  { key: 'washingCost', label: 'Washing' },
  { key: 'printingCost', label: 'Printing' },
  { key: 'testingCost', label: 'Testing' },
  { key: 'commercialCost', label: 'Commercial' },
  { key: 'financeCost', label: 'Finance' },
];

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [costingDialogOpen, setCostingDialogOpen] = useState(false);
  const [costingForm, setCostingForm] = useState<Record<string, string>>({});

  const { data: quotationResponse, isLoading, isError } = useQuery<any>({
    queryKey: ['/api/merch/quotations', params.id],
    queryFn: async () => {
      const res = await fetch(`/api/merch/quotations/${params.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch quotation');
      return res.json();
    },
  });

  const { data: costingResponse } = useQuery<any>({
    queryKey: ['/api/merch/quotations', params.id, 'costing'],
    queryFn: async () => {
      const res = await fetch(`/api/merch/quotations/${params.id}/costing`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch costing');
      return res.json();
    },
  });

  const { data: customers } = useQuery<any>({
    queryKey: ['/api/customers'],
  });

  const quotationData = quotationResponse?.data;
  const quotation = quotationData?.quotation || quotationData;
  const versions = quotationData?.versions || [];
  const costing = costingResponse?.data;

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/merch/quotations/${params.id}/approve`, 'POST');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Quotation Approved', description: 'The quotation has been approved successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/quotations', params.id] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const reviseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/merch/quotations/${params.id}/revise`, 'POST');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Revision Created', description: 'A new revision has been created.' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/quotations', params.id] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const costingMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const numericData: Record<string, number> = {};
      Object.entries(data).forEach(([key, val]) => {
        numericData[key] = parseFloat(val) || 0;
      });
      const res = await apiRequest(`/api/merch/quotations/${params.id}/costing`, 'POST', numericData);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Costing Updated', description: 'Costing data has been saved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/quotations', params.id, 'costing'] });
      setCostingDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openCostingDialog = () => {
    const initial: Record<string, string> = {};
    costingFields.forEach(f => {
      initial[f.key] = costing?.[f.key]?.toString() || '0';
    });
    initial.smv = costing?.smv?.toString() || '0';
    initial.efficiency = costing?.efficiency?.toString() || '0';
    initial.cm = costing?.cm?.toString() || '0';
    initial.overhead = costing?.overhead?.toString() || '0';
    initial.marginPercent = costing?.marginPercent?.toString() || '0';
    initial.targetPrice = costing?.targetPrice?.toString() || '0';
    initial.proposedPrice = costing?.proposedPrice?.toString() || '0';
    setCostingForm(initial);
    setCostingDialogOpen(true);
  };

  const getCustomerName = (customerId: number) => {
    const customer = (Array.isArray(customers) ? customers : []).find((c: any) => c.id === customerId);
    return customer?.customerName || customer?.name || 'Unknown';
  };

  const formatBDT = (amount: any) => {
    if (!amount && amount !== 0) return 'BDT 0';
    return `BDT ${Number(amount).toLocaleString()}`;
  };

  const totalCostBreakdown = costingFields.reduce((sum, f) => sum + (parseFloat(costing?.[f.key]) || 0), 0);
  const totalCostPerPc = totalCostBreakdown + (parseFloat(costing?.cm) || 0) + (parseFloat(costing?.overhead) || 0);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading quotation details...</span>
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !quotation) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <Button variant="ghost" onClick={() => setLocation('/quotations')} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Quotations
          </Button>
          <Card>
            <CardContent className="py-8 text-center text-red-500">
              Quotation not found or an error occurred.
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const status = quotation.status || 'DRAFT';

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" onClick={() => setLocation('/quotations')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Quotations
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <FileText className="h-6 w-6" />
                  {quotation.quotationNo || `QTN-${quotation.id}`}
                </CardTitle>
                <CardDescription className="mt-1">
                  {getCustomerName(quotation.customerId || quotation.buyerId)} •{' '}
                  {quotation.createdAt ? new Date(quotation.createdAt).toLocaleDateString() : '-'}
                  {quotation.version && ` • Version ${quotation.version}`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={`text-sm py-1.5 px-3 ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
                  {status}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {status === 'DRAFT' && (
                <Button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {approveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  Approve
                </Button>
              )}
              {status === 'APPROVED' && (
                <Button
                  onClick={() => reviseMutation.mutate()}
                  disabled={reviseMutation.isPending}
                  variant="outline"
                >
                  {reviseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  Revise
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setLocation(`/quotations/${quotation.id || params.id}/convert-to-order`)}
              >
                <ShoppingCart className="mr-2 h-4 w-4" /> Convert to Order
              </Button>
            </div>
          </CardContent>
        </Card>

        {versions.length > 1 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" /> Version Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {versions.map((v: any, idx: number) => {
                  const isActive = v.id === quotation.id || v.id?.toString() === params.id;
                  const vStatus = v.status || 'DRAFT';
                  return (
                    <div key={v.id || idx} className="flex items-center gap-2 shrink-0">
                      {idx > 0 && <div className="w-8 h-0.5 bg-gray-300" />}
                      <button
                        onClick={() => {
                          if (!isActive && v.id) setLocation(`/merchandising/quotation/${v.id}`);
                        }}
                        className={`flex flex-col items-center p-3 rounded-lg border-2 transition-colors min-w-[100px] ${
                          isActive
                            ? 'border-primary bg-primary/5'
                            : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                        }`}
                      >
                        <CircleDot className={`h-5 w-5 mb-1 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium">v{v.version || idx + 1}</span>
                        <Badge className={`text-xs mt-1 ${statusColors[vStatus] || 'bg-gray-100 text-gray-800'}`}>
                          {vStatus}
                        </Badge>
                      </button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Quotation Details</CardTitle>
                <CardDescription>Items, quantities, and pricing information</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-xs text-gray-500">Style</p>
                      <p className="text-sm font-medium">{quotation.styleName || quotation.styleNo || '-'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-xs text-gray-500">Quantity</p>
                      <p className="text-sm font-medium">{quotation.quantity?.toLocaleString() || quotation.projectedQuantity?.toLocaleString() || '-'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-xs text-gray-500">Department</p>
                      <p className="text-sm font-medium">{quotation.department || '-'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-xs text-gray-500">Target Price</p>
                      <p className="text-sm font-medium">{formatBDT(quotation.targetPrice)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-xs text-gray-500">Quoted Price</p>
                      <p className="text-sm font-medium text-primary">{formatBDT(quotation.quotedPrice || quotation.proposedPrice)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-xs text-gray-500">Delivery Date</p>
                      <p className="text-sm font-medium">
                        {quotation.deliveryDate || quotation.projectedDeliveryDate
                          ? new Date(quotation.deliveryDate || quotation.projectedDeliveryDate).toLocaleDateString()
                          : '-'}
                      </p>
                    </div>
                  </div>

                  {quotation.notes && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Notes</h4>
                        <p className="text-sm text-gray-700 whitespace-pre-line">{quotation.notes}</p>
                      </div>
                    </>
                  )}

                  {quotation.items && quotation.items.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Line Items</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Unit Price</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {quotation.items.map((item: any, idx: number) => (
                              <TableRow key={idx}>
                                <TableCell>{item.description || item.name}</TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right">{formatBDT(item.unitPrice)}</TableCell>
                                <TableCell className="text-right font-medium">{formatBDT(item.totalPrice || (item.quantity * item.unitPrice))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calculator className="h-5 w-5" /> Costing Panel
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={openCostingDialog}>
                    <Edit className="h-4 w-4 mr-1" /> Edit Costing
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {costing ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                        <p className="text-xs text-blue-600">SMV</p>
                        <p className="text-lg font-bold text-blue-800">{costing.smv || 0}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                        <p className="text-xs text-blue-600">Efficiency</p>
                        <p className="text-lg font-bold text-blue-800">{costing.efficiency || 0}%</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                        <p className="text-xs text-green-600">CM</p>
                        <p className="text-lg font-bold text-green-800">{formatBDT(costing.cm)}</p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                        <p className="text-xs text-orange-600">Overhead</p>
                        <p className="text-lg font-bold text-orange-800">{formatBDT(costing.overhead)}</p>
                      </div>
                    </div>

                    <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                      <p className="text-xs text-purple-600">Margin %</p>
                      <p className="text-lg font-bold text-purple-800">{costing.marginPercent || 0}%</p>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="text-sm font-semibold text-gray-600 mb-3">Cost Breakdown</h4>
                      <div className="space-y-2">
                        {costingFields.map(f => (
                          <div key={f.key} className="flex justify-between text-sm">
                            <span className="text-gray-500">{f.label}</span>
                            <span className="font-medium">{formatBDT(costing[f.key])}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 font-medium">Total Cost/pc</span>
                        <span className="font-bold">{formatBDT(totalCostPerPc)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 font-medium">Target Price</span>
                        <span className="font-bold text-blue-600">{formatBDT(costing.targetPrice)}</span>
                      </div>
                      <div className="flex justify-between text-sm bg-primary/5 rounded-lg p-2">
                        <span className="text-gray-800 font-semibold">Proposed Price</span>
                        <span className="font-bold text-primary text-lg">{formatBDT(costing.proposedPrice)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <DollarSign className="h-12 w-12 mb-3" />
                    <p className="text-sm font-medium">No costing data available</p>
                    <p className="text-xs mt-1">Click "Edit Costing" to add cost breakdown</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={costingDialogOpen} onOpenChange={setCostingDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Costing</DialogTitle>
              <DialogDescription>Update the cost breakdown for this quotation.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SMV</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={costingForm.smv || ''}
                    onChange={(e) => setCostingForm({ ...costingForm, smv: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Efficiency (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={costingForm.efficiency || ''}
                    onChange={(e) => setCostingForm({ ...costingForm, efficiency: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CM (Cost of Making)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={costingForm.cm || ''}
                    onChange={(e) => setCostingForm({ ...costingForm, cm: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Overhead</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={costingForm.overhead || ''}
                    onChange={(e) => setCostingForm({ ...costingForm, overhead: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Margin %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={costingForm.marginPercent || ''}
                    onChange={(e) => setCostingForm({ ...costingForm, marginPercent: e.target.value })}
                  />
                </div>
              </div>

              <Separator />
              <h4 className="text-sm font-semibold">Cost Breakdown</h4>

              <div className="grid grid-cols-2 gap-4">
                {costingFields.map(f => (
                  <div key={f.key} className="space-y-2">
                    <Label>{f.label}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={costingForm[f.key] || ''}
                      onChange={(e) => setCostingForm({ ...costingForm, [f.key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Target Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={costingForm.targetPrice || ''}
                    onChange={(e) => setCostingForm({ ...costingForm, targetPrice: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Proposed Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={costingForm.proposedPrice || ''}
                    onChange={(e) => setCostingForm({ ...costingForm, proposedPrice: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCostingDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => costingMutation.mutate(costingForm)} disabled={costingMutation.isPending}>
                {costingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Costing
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
