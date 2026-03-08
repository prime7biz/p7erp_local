import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Eye, Filter } from 'lucide-react';
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

const statusFlow = [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'IN_PROGRESS', 'SENT_TO_BUYER', 'APPROVED_BY_BUYER', 'CLOSED',
];

function formatDate(d: string | Date | null | undefined) {
  if (!d) return '-';
  return format(new Date(d), 'MMM dd, yyyy');
}

function StatusFlowBadge({ currentStatus }: { currentStatus: string }) {
  const currentIdx = statusFlow.indexOf(currentStatus);
  return (
    <div className="flex items-center gap-1">
      {statusFlow.slice(0, 5).map((s, i) => {
        const isActive = i <= currentIdx;
        const isCurrent = s === currentStatus;
        return (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full ${
                isCurrent ? 'bg-orange-500 ring-2 ring-orange-200' :
                isActive ? 'bg-green-500' : 'bg-gray-300'
              }`}
              title={s.replace(/_/g, ' ')}
            />
            {i < 4 && <div className={`w-3 h-0.5 ${isActive ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function SampleRequestsPage() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [buyerFilter, setBuyerFilter] = useState<string>('');

  const { data: requestsData, isLoading } = useQuery<any>({
    queryKey: ['/api/sample-program/requests'],
  });

  const { data: customersData } = useQuery<any>({
    queryKey: ['/api/customers'],
  });

  const requests = Array.isArray(requestsData) ? requestsData : requestsData?.requests || [];
  const customers = Array.isArray(customersData) ? customersData : [];

  const filtered = requests.filter((r: any) => {
    if (statusFilter && statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter && typeFilter !== 'all' && String(r.sampleTypeId || r.sampleType) !== typeFilter) return false;
    if (buyerFilter && buyerFilter !== 'all' && String(r.customerId || r.buyerId) !== buyerFilter) return false;
    return true;
  });

  const sampleTypes = [...new Set(requests.map((r: any) => r.sampleType).filter(Boolean))];

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Sample Development</h1>
            <p className="text-muted-foreground">Manage sample requests and approvals</p>
          </div>
          <Button onClick={() => setLocation('/samples/requests/new')}>
            <Plus className="h-4 w-4 mr-2" /> New Request
          </Button>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-1 block text-xs">Sample Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="PROTO">Proto</SelectItem>
                    <SelectItem value="FIT">Fit</SelectItem>
                    <SelectItem value="PP">PP (Pre-Production)</SelectItem>
                    <SelectItem value="SEALING">Sealing</SelectItem>
                    <SelectItem value="TOP">Top of Production</SelectItem>
                    {sampleTypes.filter((t: any) => !['PROTO','FIT','PP','SEALING','TOP'].includes(t)).map((t: any) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Object.keys(statusColors).map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Buyer</Label>
                <Select value={buyerFilter} onValueChange={setBuyerFilter}>
                  <SelectTrigger><SelectValue placeholder="All Buyers" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Buyers</SelectItem>
                    {customers.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.customerName || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No sample requests found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sample No</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Required Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((req: any) => {
                    const buyer = customers.find((c: any) => c.id === (req.customerId || req.buyerId));
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.requestNumber || req.sampleNo || req.id}</TableCell>
                        <TableCell>{buyer?.customerName || buyer?.name || req.buyerName || '-'}</TableCell>
                        <TableCell>{req.styleName || req.styleCode || req.styleNo || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{req.priority || '-'}</Badge>
                        </TableCell>
                        <TableCell>{req.quantity || req.qty || '-'}</TableCell>
                        <TableCell>{formatDate(req.requiredDate)}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[req.status] || 'bg-gray-100 text-gray-800'}>
                            {req.status?.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusFlowBadge currentStatus={req.status} />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLocation(`/samples/requests/${req.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
