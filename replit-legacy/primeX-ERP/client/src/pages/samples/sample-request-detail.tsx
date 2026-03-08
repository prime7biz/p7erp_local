import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Loader2, Send, CheckCircle, Play, Package, Lock,
  MessageCircle, Clock, FileText, X, RotateCcw, ThumbsUp, Plus, ShoppingCart,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import Spinner from '@/components/ui/spinner';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  SENT_TO_BUYER: 'bg-purple-100 text-purple-800',
  REVISION_REQUIRED: 'bg-red-100 text-red-800',
  APPROVED_BY_BUYER: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-gray-200 text-gray-600',
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return '-';
  return format(new Date(d), 'MMM dd, yyyy HH:mm');
}

export default function SampleRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('timeline');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({ result: 'APPROVED_BY_BUYER', comments: '' });
  const [materialLines, setMaterialLines] = useState([{ itemId: '', qty: '', uom: 'PCS', warehouseId: '' }]);

  const { data: request, isLoading } = useQuery<any>({
    queryKey: ['/api/sample-program/requests', id],
    enabled: !!id,
  });

  const { data: traceData } = useQuery<any>({
    queryKey: ['/api/sample-program/requests', id, 'trace'],
    enabled: !!id,
  });

  const { data: itemsData } = useQuery<any>({
    queryKey: ['/api/items'],
  });

  const { data: warehousesData } = useQuery<any>({
    queryKey: ['/api/warehouses'],
  });

  const items = Array.isArray(itemsData) ? itemsData : itemsData?.items || [];
  const warehouses = Array.isArray(warehousesData) ? warehousesData : [];
  const trace = traceData?.trace || traceData?.events || traceData || [];
  const versions = request?.versions || [];
  const materialRequests = request?.materialRequests || [];
  const bomSnapshot = request?.bomSnapshot;
  const status = request?.status;

  function createAction(endpoint: string, successMsg: string, data?: any) {
    return apiRequest(`/api/sample-program/requests/${id}/${endpoint}`, 'POST', data)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/sample-program/requests', id] });
        queryClient.invalidateQueries({ queryKey: ['/api/sample-program/requests', id, 'trace'] });
        queryClient.invalidateQueries({ queryKey: ['/api/sample-program/requests'] });
        toast({ title: 'Success', description: successMsg });
      })
      .catch((err: any) => {
        toast({ title: 'Error', description: err.message || 'Action failed.', variant: 'destructive' });
      });
  }

  const submitMutation = useMutation({ mutationFn: () => createAction('submit', 'Request submitted.') });
  const approveMutation = useMutation({ mutationFn: () => createAction('approve', 'Request approved.') });
  const startMutation = useMutation({ mutationFn: () => createAction('start', 'Work started.') });
  const sendMutation = useMutation({ mutationFn: () => createAction('send', 'Sample sent to buyer.') });
  const closeMutation = useMutation({ mutationFn: () => createAction('close', 'Request closed.') });

  const feedbackMutation = useMutation({
    mutationFn: () => createAction('feedback', 'Feedback recorded.', feedbackForm),
    onSuccess: () => setFeedbackOpen(false),
  });

  const lockBomMutation = useMutation({
    mutationFn: () => createAction('lock-bom', 'BOM locked for this sample.'),
  });

  const materialMutation = useMutation({
    mutationFn: () => {
      const lines = materialLines
        .filter((l) => l.itemId && l.qty)
        .map((l) => ({
          itemId: parseInt(l.itemId),
          qty: parseFloat(l.qty),
          uom: l.uom,
          warehouseId: l.warehouseId ? parseInt(l.warehouseId) : undefined,
        }));
      return createAction('material-request', 'Material request created.', { lines });
    },
    onSuccess: () => {
      setMaterialOpen(false);
      setMaterialLines([{ itemId: '', qty: '', uom: 'PCS', warehouseId: '' }]);
    },
  });

  function approveMaterialRequest(mrId: number) {
    apiRequest(`/api/sample-program/material-requests/${mrId}/approve`, 'POST')
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/sample-program/requests', id] });
        toast({ title: 'Approved', description: 'Material request approved.' });
      })
      .catch((err: any) => {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      });
  }

  function issueMaterialRequest(mrId: number) {
    apiRequest(`/api/sample-program/material-requests/${mrId}/issue`, 'POST')
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/sample-program/requests', id] });
        toast({ title: 'Issued', description: 'Material request issued.' });
      })
      .catch((err: any) => {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      });
  }

  function addMaterialLine() {
    setMaterialLines([...materialLines, { itemId: '', qty: '', uom: 'PCS', warehouseId: '' }]);
  }

  function updateMaterialLine(idx: number, field: string, value: string) {
    const updated = [...materialLines];
    (updated[idx] as any)[field] = value;
    setMaterialLines(updated);
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  if (!request) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-muted-foreground mb-4">Sample request not found.</p>
          <Button onClick={() => setLocation('/samples/requests')}>Back to Requests</Button>
        </div>
      </DashboardLayout>
    );
  }

  const anyPending = submitMutation.isPending || approveMutation.isPending || startMutation.isPending ||
    sendMutation.isPending || closeMutation.isPending || feedbackMutation.isPending;

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation('/samples/requests')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{request.requestNumber || request.sampleNo || `Request #${id}`}</h1>
                <Badge className={statusColors[status] || 'bg-gray-100 text-gray-800'}>
                  {status?.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {request.buyerName && `Buyer: ${request.buyerName}`}
                {request.styleName && ` • Style: ${request.styleName}`}
                {request.requiredDate && ` • Due: ${formatDate(request.requiredDate)}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {status === 'DRAFT' && (
              <>
                <Button size="sm" onClick={() => submitMutation.mutate()} disabled={anyPending}>
                  <Send className="h-4 w-4 mr-1" /> Submit
                </Button>
                <Button size="sm" variant="outline" onClick={() => closeMutation.mutate()} disabled={anyPending}>
                  <X className="h-4 w-4 mr-1" /> Close
                </Button>
              </>
            )}
            {status === 'SUBMITTED' && (
              <>
                <Button size="sm" onClick={() => approveMutation.mutate()} disabled={anyPending}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => closeMutation.mutate()} disabled={anyPending}>
                  <X className="h-4 w-4 mr-1" /> Close
                </Button>
              </>
            )}
            {status === 'APPROVED' && (
              <>
                <Button size="sm" onClick={() => startMutation.mutate()} disabled={anyPending}>
                  <Play className="h-4 w-4 mr-1" /> Start Work
                </Button>
                <Button size="sm" variant="outline" onClick={() => closeMutation.mutate()} disabled={anyPending}>
                  <X className="h-4 w-4 mr-1" /> Close
                </Button>
              </>
            )}
            {status === 'IN_PROGRESS' && (
              <>
                <Button size="sm" onClick={() => sendMutation.mutate()} disabled={anyPending}>
                  <Send className="h-4 w-4 mr-1" /> Send to Buyer
                </Button>
                <Button size="sm" variant="outline" onClick={() => closeMutation.mutate()} disabled={anyPending}>
                  <X className="h-4 w-4 mr-1" /> Close
                </Button>
              </>
            )}
            {status === 'SENT_TO_BUYER' && (
              <Button size="sm" onClick={() => setFeedbackOpen(true)} disabled={anyPending}>
                <MessageCircle className="h-4 w-4 mr-1" /> Record Feedback
              </Button>
            )}
            {status === 'REVISION_REQUIRED' && (
              <Button size="sm" onClick={() => startMutation.mutate()} disabled={anyPending}>
                <RotateCcw className="h-4 w-4 mr-1" /> Re-start Work
              </Button>
            )}
            {status === 'APPROVED_BY_BUYER' && (
              <>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                  const params = new URLSearchParams();
                  if (request.inquiryId || request.enquiryId) params.set('inquiryId', String(request.inquiryId || request.enquiryId));
                  if (request.customerId || request.buyerId) params.set('customerId', String(request.customerId || request.buyerId));
                  if (request.styleName || request.styleCode) params.set('styleName', request.styleName || request.styleCode || '');
                  params.set('sampleApproved', 'true');
                  params.set('sampleRequestId', String(request.id));
                  setLocation(`/quotations/new?${params.toString()}`);
                }}>
                  <ShoppingCart className="h-4 w-4 mr-1" /> Proceed to Order Confirmation
                </Button>
                <Button size="sm" variant="outline" onClick={() => closeMutation.mutate()} disabled={anyPending}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Close
                </Button>
              </>
            )}
            {anyPending && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="timeline"><Clock className="h-4 w-4 mr-1" /> Timeline</TabsTrigger>
            <TabsTrigger value="versions"><FileText className="h-4 w-4 mr-1" /> Versions</TabsTrigger>
            <TabsTrigger value="material"><Package className="h-4 w-4 mr-1" /> Material</TabsTrigger>
            <TabsTrigger value="bom"><Lock className="h-4 w-4 mr-1" /> BOM</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {Array.isArray(trace) && trace.length > 0 ? (
                  <div className="relative border-l-2 border-gray-200 pl-6 space-y-6">
                    {trace.map((event: any, idx: number) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-orange-600 ring-4 ring-white">
                          <Clock className="h-3 w-3" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm">{event.action || event.event || event.type}</h4>
                            {event.status && (
                              <Badge variant="outline" className="text-xs">{event.status}</Badge>
                            )}
                          </div>
                          {event.comment && <p className="text-sm text-muted-foreground mt-1">{event.comment}</p>}
                          {event.user && <p className="text-xs text-muted-foreground">by {event.user}</p>}
                          <p className="text-xs text-muted-foreground">{formatDate(event.timestamp || event.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No activity recorded yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="versions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sample Versions</CardTitle>
              </CardHeader>
              <CardContent>
                {versions.length > 0 ? (
                  <div className="space-y-4">
                    {versions.map((ver: any, idx: number) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">Version {ver.version || idx + 1}</h4>
                          <span className="text-xs text-muted-foreground">{formatDate(ver.createdAt)}</span>
                        </div>
                        {ver.comments && <p className="text-sm text-muted-foreground">{ver.comments}</p>}
                        {ver.attachments && ver.attachments.length > 0 && (
                          <div className="mt-2 flex gap-2 flex-wrap">
                            {ver.attachments.map((a: any, ai: number) => (
                              <Badge key={ai} variant="outline" className="text-xs">
                                <FileText className="h-3 w-3 mr-1" /> {a.name || a.filename || `Attachment ${ai + 1}`}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No versions recorded yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="material" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Material Requests</CardTitle>
                <Button size="sm" onClick={() => setMaterialOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Create Material Request
                </Button>
              </CardHeader>
              <CardContent>
                {materialRequests.length > 0 ? (
                  <div className="space-y-4">
                    {materialRequests.map((mr: any) => (
                      <div key={mr.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">MR #{mr.id}</h4>
                            <Badge variant="outline">{mr.status}</Badge>
                          </div>
                          <div className="flex gap-2">
                            {mr.status === 'PENDING' && (
                              <Button size="sm" variant="outline" onClick={() => approveMaterialRequest(mr.id)}>
                                <CheckCircle className="h-3 w-3 mr-1" /> Approve
                              </Button>
                            )}
                            {mr.status === 'APPROVED' && (
                              <Button size="sm" variant="outline" onClick={() => issueMaterialRequest(mr.id)}>
                                <Package className="h-3 w-3 mr-1" /> Issue
                              </Button>
                            )}
                          </div>
                        </div>
                        {mr.lines && (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>UOM</TableHead>
                                <TableHead>Warehouse</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {mr.lines.map((line: any, li: number) => (
                                <TableRow key={li}>
                                  <TableCell>{line.itemName || line.itemDescription || `Item #${line.itemId}`}</TableCell>
                                  <TableCell>{line.qty}</TableCell>
                                  <TableCell>{line.uom}</TableCell>
                                  <TableCell>{line.warehouseName || line.warehouseId || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No material requests created yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bom" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">BOM Snapshot</CardTitle>
                {!bomSnapshot && (
                  <Button size="sm" onClick={() => lockBomMutation.mutate()} disabled={lockBomMutation.isPending}>
                    {lockBomMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                    Lock BOM
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {bomSnapshot ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead>Consumption</TableHead>
                        <TableHead>Wastage %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(bomSnapshot.lines || bomSnapshot).map((line: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell><Badge variant="outline">{line.category}</Badge></TableCell>
                          <TableCell>{line.itemDescription}</TableCell>
                          <TableCell>{line.uom}</TableCell>
                          <TableCell>{line.baseConsumption}</TableCell>
                          <TableCell>{line.wastagePct}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No BOM snapshot locked yet. Lock the BOM to create a snapshot.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Buyer Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Result</Label>
              <Select value={feedbackForm.result} onValueChange={(v) => setFeedbackForm({ ...feedbackForm, result: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPROVED_BY_BUYER">Approved by Buyer</SelectItem>
                  <SelectItem value="REVISION_REQUIRED">Revision Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comments</Label>
              <Textarea
                value={feedbackForm.comments}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, comments: e.target.value })}
                placeholder="Buyer feedback comments..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackOpen(false)}>Cancel</Button>
            <Button onClick={() => feedbackMutation.mutate()} disabled={feedbackMutation.isPending}>
              {feedbackMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={materialOpen} onOpenChange={setMaterialOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Material Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {materialLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-3 items-end">
                <div>
                  <Label className="text-xs">Item</Label>
                  <Select value={line.itemId} onValueChange={(v) => updateMaterialLine(idx, 'itemId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {items.map((item: any) => (
                        <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" value={line.qty} onChange={(e) => updateMaterialLine(idx, 'qty', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">UOM</Label>
                  <Input value={line.uom} onChange={(e) => updateMaterialLine(idx, 'uom', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Warehouse</Label>
                  <Select value={line.warehouseId} onValueChange={(v) => updateMaterialLine(idx, 'warehouseId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {warehouses.map((w: any) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addMaterialLine}>
              <Plus className="h-3 w-3 mr-1" /> Add Line
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaterialOpen(false)}>Cancel</Button>
            <Button onClick={() => materialMutation.mutate()} disabled={materialMutation.isPending}>
              {materialMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
