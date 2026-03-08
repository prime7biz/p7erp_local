import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, TrendingUp, TrendingDown, AlertTriangle, Clock, Search, BookOpen } from "lucide-react";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";

interface BillItem {
  id: number;
  billNumber: string;
  billDate: string;
  dueDate: string | null;
  billType: string;
  originalAmount: string;
  pendingAmount: string;
  status: string;
  isOverdue: boolean;
  sourceDocType: string | null;
  sourceDocNumber: string | null;
  partyId: number;
  partyName: string;
  partyCode: string;
  createdAt: string;
}

interface OutstandingSummary {
  receivable: { totalOriginal: string; totalPending: string; totalOverdue: string; billCount: number };
  payable: { totalOriginal: string; totalPending: string; totalOverdue: string; billCount: number };
  ledgerReceivable?: string;
  ledgerPayable?: string;
}

interface AgingRow {
  partyId: number;
  partyName: string;
  partyCode: string;
  billType: string;
  bucket0_30: string;
  bucket31_60: string;
  bucket61_90: string;
  bucket91_120: string;
  bucket120plus: string;
  total: string;
}

interface OverdueBill {
  id: number;
  billNumber: string;
  billDate: string;
  dueDate: string;
  billType: string;
  originalAmount: string;
  pendingAmount: string;
  status: string;
  partyId: number;
  partyName: string;
  partyCode: string;
  daysOverdue: number;
}

interface LedgerOutstanding {
  partyId: number;
  partyName: string;
  partyCode: string;
  partyType: string;
  ledgerAccountId: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

const formatCurrency = (amount: string | number) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'BDT 0.00';
  return `BDT ${Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'OPEN': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Open</Badge>;
    case 'PARTIALLY_SETTLED': return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Partial</Badge>;
    case 'SETTLED': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Settled</Badge>;
    case 'CANCELLED': return <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">Cancelled</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

export default function OutstandingBillsPage() {
  const [activeTab, setActiveTab] = useState("receivable");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agingType, setAgingType] = useState("all");
  const [ledgerFilter, setLedgerFilter] = useState("all");

  const { data: summary, isLoading: summaryLoading } = useQuery<OutstandingSummary>({
    queryKey: ['/api/bills/report/outstanding'],
  });

  const { data: billsData, isLoading: billsLoading } = useQuery<{ bills: BillItem[]; pagination: any }>({
    queryKey: ['/api/bills', activeTab === 'receivable' ? 'RECEIVABLE' : 'PAYABLE', statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeTab !== 'aging') params.set('billType', activeTab === 'receivable' ? 'RECEIVABLE' : 'PAYABLE');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      params.set('limit', '100');
      const res = await fetch(`/api/bills?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch bills');
      return res.json();
    },
    enabled: activeTab !== 'aging' && activeTab !== 'ledger',
  });

  const { data: agingData, isLoading: agingLoading } = useQuery<AgingRow[]>({
    queryKey: ['/api/bills/report/aging', agingType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (agingType !== 'all') params.set('billType', agingType);
      const res = await fetch(`/api/bills/report/aging?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch aging');
      return res.json();
    },
    enabled: activeTab === 'aging',
  });

  const { data: overdueBills } = useQuery<OverdueBill[]>({
    queryKey: ['/api/bills/report/overdue'],
  });

  const { data: ledgerOutstanding, isLoading: ledgerLoading } = useQuery<LedgerOutstanding[]>({
    queryKey: ['/api/bills/report/ledger-outstanding'],
  });

  const ledgerReceivable = parseFloat((summary as any)?.ledgerReceivable || '0');
  const ledgerPayable = parseFloat((summary as any)?.ledgerPayable || '0');
  const totalReceivable = parseFloat(summary?.receivable?.totalPending || '0') + ledgerReceivable;
  const totalPayable = parseFloat(summary?.payable?.totalPending || '0') + ledgerPayable;
  const totalOverdue = parseFloat(summary?.receivable?.totalOverdue || '0') + parseFloat(summary?.payable?.totalOverdue || '0');
  const overdueBillCount = overdueBills?.length || 0;

  const receivableLedgerCount = ledgerOutstanding?.filter(l => l.partyType === 'customer' && l.closingBalance > 0).length || 0;
  const payableLedgerCount = ledgerOutstanding?.filter(l => l.partyType === 'vendor' && l.closingBalance < 0).length || 0;

  const filteredLedger = ledgerOutstanding?.filter(l => {
    if (ledgerFilter === 'customer') return l.partyType === 'customer';
    if (ledgerFilter === 'vendor') return l.partyType === 'vendor';
    return true;
  }) || [];

  return (
    <DashboardContainer
      title="Outstanding Bills"
      subtitle="Bill-wise tracking of receivables and payables"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Receivable</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalReceivable)}</div>
            <p className="text-xs text-muted-foreground">{summary?.receivable?.billCount || 0} bills + {receivableLedgerCount} ledger accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalPayable)}</div>
            <p className="text-xs text-muted-foreground">{summary?.payable?.billCount || 0} bills + {payableLedgerCount} ledger accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalOverdue)}</div>
            <p className="text-xs text-muted-foreground">{overdueBillCount} overdue bills</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Position</CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalReceivable - totalPayable >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalReceivable - totalPayable)}
            </div>
            <p className="text-xs text-muted-foreground">{totalReceivable - totalPayable >= 0 ? 'Net receivable' : 'Net payable'}</p>
          </CardContent>
        </Card>
      </div>

      <ModuleAIPanel
        title="AI Bill-Wise Analysis"
        endpoint="/api/module-ai/bill-wise"
        requestData={{}}
        triggerKey="bill-wise"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="receivable">Bills Receivable</TabsTrigger>
          <TabsTrigger value="payable">Bills Payable</TabsTrigger>
          <TabsTrigger value="aging">Aging Analysis</TabsTrigger>
          <TabsTrigger value="ledger">Ledger Balances</TabsTrigger>
        </TabsList>

        <div className="flex flex-col md:flex-row gap-3 mt-4">
          {activeTab === 'ledger' ? (
            <Select value={ledgerFilter} onValueChange={setLedgerFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Party Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Parties</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="vendor">Vendors</SelectItem>
              </SelectContent>
            </Select>
          ) : activeTab !== 'aging' ? (
            <>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by bill number or party name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="PARTIALLY_SETTLED">Partially Settled</SelectItem>
                  <SelectItem value="SETTLED">Settled</SelectItem>
                </SelectContent>
              </Select>
            </>
          ) : (
            <Select value={agingType} onValueChange={setAgingType}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Bill Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="RECEIVABLE">Receivable</SelectItem>
                <SelectItem value="PAYABLE">Payable</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <TabsContent value="receivable" className="mt-4">
          <BillsTable bills={billsData?.bills || []} isLoading={billsLoading} />
          {(ledgerOutstanding?.filter(l => l.partyType === 'customer' && l.closingBalance > 0).length || 0) > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Ledger-Based Receivables
                </CardTitle>
                <p className="text-xs text-muted-foreground">Party balances from accounting ledger (opening balance + transactions)</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Party Name</TableHead>
                        <TableHead>Party Code</TableHead>
                        <TableHead className="text-right">Closing Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerOutstanding?.filter(l => l.partyType === 'customer' && l.closingBalance > 0).map((l) => (
                        <TableRow key={l.partyId}>
                          <TableCell className="font-medium">{l.partyName}</TableCell>
                          <TableCell className="text-muted-foreground">{l.partyCode}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">{formatCurrency(l.closingBalance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payable" className="mt-4">
          <BillsTable bills={billsData?.bills || []} isLoading={billsLoading} />
          {(ledgerOutstanding?.filter(l => l.partyType === 'vendor' && l.closingBalance < 0).length || 0) > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Ledger-Based Payables
                </CardTitle>
                <p className="text-xs text-muted-foreground">Vendor balances from accounting ledger (opening balance + transactions)</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Party Name</TableHead>
                        <TableHead>Party Code</TableHead>
                        <TableHead className="text-right">Outstanding Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerOutstanding?.filter(l => l.partyType === 'vendor' && l.closingBalance < 0).map((l) => (
                        <TableRow key={l.partyId}>
                          <TableCell className="font-medium">{l.partyName}</TableCell>
                          <TableCell className="text-muted-foreground">{l.partyCode}</TableCell>
                          <TableCell className="text-right font-medium text-red-600">{formatCurrency(Math.abs(l.closingBalance))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="aging" className="mt-4">
          <AgingTable data={agingData || []} isLoading={agingLoading} />
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          <LedgerBalancesTable data={filteredLedger} isLoading={ledgerLoading} />
        </TabsContent>
      </Tabs>
    </DashboardContainer>
  );
}

function BillsTable({ bills, isLoading }: { bills: BillItem[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading bills...</p>
        </CardContent>
      </Card>
    );
  }

  if (bills.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No bills found</p>
        </CardContent>
      </Card>
    );
  }

  const grouped = bills.reduce<Record<string, BillItem[]>>((acc, bill) => {
    const key = `${bill.partyId}-${bill.partyName}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(bill);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([key, partyBills]) => {
        const totalPending = partyBills.reduce((sum, b) => sum + parseFloat(b.pendingAmount), 0);
        return (
          <Card key={key}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{partyBills[0].partyName}</CardTitle>
                  <p className="text-xs text-muted-foreground">{partyBills[0].partyCode}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatCurrency(totalPending)}</p>
                  <p className="text-xs text-muted-foreground">{partyBills.length} bill{partyBills.length > 1 ? 's' : ''}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Original</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partyBills.map((bill) => {
                    const isOverdue = bill.dueDate && new Date(bill.dueDate) < new Date() && parseFloat(bill.pendingAmount) > 0;
                    return (
                      <TableRow key={bill.id} className={isOverdue ? 'bg-red-50/50' : ''}>
                        <TableCell className="font-medium">{bill.billNumber}</TableCell>
                        <TableCell>{new Date(bill.billDate).toLocaleDateString('en-GB')}</TableCell>
                        <TableCell>
                          {bill.dueDate ? (
                            <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                              {new Date(bill.dueDate).toLocaleDateString('en-GB')}
                              {isOverdue && <Clock className="inline h-3 w-3 ml-1" />}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{bill.sourceDocType || '-'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(bill.originalAmount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(bill.pendingAmount)}</TableCell>
                        <TableCell>{getStatusBadge(bill.status)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AgingTable({ data, isLoading }: { data: AgingRow[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading aging analysis...</p>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No outstanding bills for aging analysis</p>
        </CardContent>
      </Card>
    );
  }

  const totals = data.reduce(
    (acc, row) => ({
      bucket0_30: acc.bucket0_30 + parseFloat(row.bucket0_30),
      bucket31_60: acc.bucket31_60 + parseFloat(row.bucket31_60),
      bucket61_90: acc.bucket61_90 + parseFloat(row.bucket61_90),
      bucket91_120: acc.bucket91_120 + parseFloat(row.bucket91_120),
      bucket120plus: acc.bucket120plus + parseFloat(row.bucket120plus),
      total: acc.total + parseFloat(row.total),
    }),
    { bucket0_30: 0, bucket31_60: 0, bucket61_90: 0, bucket91_120: 0, bucket120plus: 0, total: 0 }
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">0-30 Days</TableHead>
                <TableHead className="text-right">31-60 Days</TableHead>
                <TableHead className="text-right">61-90 Days</TableHead>
                <TableHead className="text-right">91-120 Days</TableHead>
                <TableHead className="text-right">120+ Days</TableHead>
                <TableHead className="text-right font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{row.partyName}</p>
                      <p className="text-xs text-muted-foreground">{row.partyCode}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={row.billType === 'RECEIVABLE' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}>
                      {row.billType === 'RECEIVABLE' ? 'Recv' : 'Pay'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{parseFloat(row.bucket0_30) > 0 ? formatCurrency(row.bucket0_30) : '-'}</TableCell>
                  <TableCell className="text-right">{parseFloat(row.bucket31_60) > 0 ? formatCurrency(row.bucket31_60) : '-'}</TableCell>
                  <TableCell className="text-right text-yellow-600">{parseFloat(row.bucket61_90) > 0 ? formatCurrency(row.bucket61_90) : '-'}</TableCell>
                  <TableCell className="text-right text-orange-600">{parseFloat(row.bucket91_120) > 0 ? formatCurrency(row.bucket91_120) : '-'}</TableCell>
                  <TableCell className="text-right text-red-600 font-medium">{parseFloat(row.bucket120plus) > 0 ? formatCurrency(row.bucket120plus) : '-'}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(row.total)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.bucket0_30)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.bucket31_60)}</TableCell>
                <TableCell className="text-right text-yellow-600">{formatCurrency(totals.bucket61_90)}</TableCell>
                <TableCell className="text-right text-orange-600">{formatCurrency(totals.bucket91_120)}</TableCell>
                <TableCell className="text-right text-red-600">{formatCurrency(totals.bucket120plus)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function LedgerBalancesTable({ data, isLoading }: { data: LedgerOutstanding[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading ledger balances...</p>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No ledger balances found</p>
        </CardContent>
      </Card>
    );
  }

  const parseNum = (v: any) => {
    const n = typeof v === 'string' ? parseFloat(v) : (v || 0);
    return isNaN(n) ? 0 : n;
  };

  const totalReceivable = data
    .filter(r => parseNum(r.closingBalance) > 0)
    .reduce((s, r) => s + parseNum(r.closingBalance), 0);
  const totalPayable = data
    .filter(r => parseNum(r.closingBalance) < 0)
    .reduce((s, r) => s + Math.abs(parseNum(r.closingBalance)), 0);
  const totalDebit = data.reduce((s, r) => s + parseNum(r.totalDebit), 0);
  const totalCredit = data.reduce((s, r) => s + parseNum(r.totalCredit), 0);
  const totalOpDr = data
    .filter(r => parseNum(r.openingBalance) > 0)
    .reduce((s, r) => s + parseNum(r.openingBalance), 0);
  const totalOpCr = data
    .filter(r => parseNum(r.openingBalance) < 0)
    .reduce((s, r) => s + Math.abs(parseNum(r.openingBalance)), 0);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex gap-4 mb-4">
          <div className="px-4 py-2 bg-green-50 rounded-lg border border-green-200">
            <p className="text-xs text-green-700">Total Receivable (Dr)</p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(totalReceivable)}</p>
            <p className="text-xs text-muted-foreground">{data.filter(r => parseNum(r.closingBalance) > 0).length} parties</p>
          </div>
          <div className="px-4 py-2 bg-red-50 rounded-lg border border-red-200">
            <p className="text-xs text-red-700">Total Payable (Cr)</p>
            <p className="text-lg font-bold text-red-700">{formatCurrency(totalPayable)}</p>
            <p className="text-xs text-muted-foreground">{data.filter(r => parseNum(r.closingBalance) < 0).length} parties</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party Name</TableHead>
                <TableHead>Party Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Opening Balance</TableHead>
                <TableHead className="text-right">Total Debit</TableHead>
                <TableHead className="text-right">Total Credit</TableHead>
                <TableHead className="text-right font-bold">Closing Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const ob = parseNum(row.openingBalance);
                const cb = parseNum(row.closingBalance);
                const dr = parseNum(row.totalDebit);
                const cr = parseNum(row.totalCredit);
                return (
                  <TableRow key={row.partyId}>
                    <TableCell>
                      <p className="font-medium text-sm">{row.partyName}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.partyCode}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={row.partyType === 'customer' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}>
                        {row.partyType === 'customer' ? 'Customer' : 'Vendor'}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right ${ob >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(Math.abs(ob))}
                      <span className="text-xs ml-1">{ob >= 0 ? 'Dr' : 'Cr'}</span>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(dr)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(cr)}</TableCell>
                    <TableCell className={`text-right font-bold ${cb > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Math.abs(cb))}
                      <span className="text-xs ml-1">{cb > 0 ? 'Dr' : 'Cr'}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/50 font-bold border-t-2">
                <TableCell colSpan={3}>Totals</TableCell>
                <TableCell className="text-right">
                  <div className="text-green-700">{formatCurrency(totalOpDr)} Dr</div>
                  <div className="text-red-700">{formatCurrency(totalOpCr)} Cr</div>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(totalDebit)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totalCredit)}</TableCell>
                <TableCell className="text-right">
                  <div className="text-green-600">{formatCurrency(totalReceivable)} Dr</div>
                  <div className="text-red-600">{formatCurrency(totalPayable)} Cr</div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
