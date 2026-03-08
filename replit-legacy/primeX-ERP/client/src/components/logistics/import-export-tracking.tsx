import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TabsContent, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, 
  AreaChart, 
  LineChart, 
  DonutChart,
  Card as TremorCard 
} from "@tremor/react";

import { 
  FileText, 
  TrendingUp,
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  DollarSign,
  Building,
  Ship,
  Truck,
  Plane
} from 'lucide-react';

interface ImportExportTrackingProps {
  categoryId: string;
  categoryName: string;
  timeInterval: string;
  dateRange: string;
  selectedReference: string;
  onTimeIntervalChange: (value: string) => void;
}

const ImportExportTracking: React.FC<ImportExportTrackingProps> = ({
  categoryId,
  categoryName,
  timeInterval,
  dateRange,
  selectedReference,
  onTimeIntervalChange
}) => {
  const [activeTab, setActiveTab] = useState('all');

  const { data: lcs = [], isLoading: lcsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/lcs'],
  });

  const { data: btbLcs = [], isLoading: btbLoading } = useQuery<any[]>({
    queryKey: ['/api/btb-lcs'],
  });

  const { data: exportDocuments = [], isLoading: docsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/export-documents'],
  });

  const { data: shipments = [], isLoading: shipmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/shipments'],
  });

  const isLoading = lcsLoading || btbLoading || docsLoading || shipmentsLoading;

  const lcsList = Array.isArray(lcs) ? lcs : [];
  const btbList = Array.isArray(btbLcs) ? btbLcs : [];
  const docsList = Array.isArray(exportDocuments) ? exportDocuments : [];
  const shipList = Array.isArray(shipments) ? shipments : [];

  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, ease: "easeOut" }
    },
    exit: { opacity: 0, y: -20 }
  };

  const allItems = (() => {
    if (categoryId === 'lc' || categoryId === 'back-to-lc') {
      const source = categoryId === 'back-to-lc' ? btbList : lcsList;
      return source.map((item: any) => ({
        id: item.lcNumber || item.btbLcNumber || `LC-${item.id}`,
        reference: item.orderNumber || `ORD-${item.linkedSalesOrderId || item.orderId || item.masterLcId || ''}`,
        referenceType: categoryId === 'back-to-lc' ? "BTB LC" : "Export LC",
        status: (item.status || 'active').charAt(0).toUpperCase() + (item.status || 'active').slice(1),
        date: item.issueDate || item.issuanceDate || item.createdAt || '',
        documents: {
          required: 8,
          completed: item.status === 'completed' || item.status === 'closed' ? 8 : 
                     item.status === 'active' ? 6 : 4,
        },
        compliance: item.status === 'completed' || item.status === 'closed' ? 100 : 
                    item.status === 'active' ? 75 : 50,
        value: parseFloat(item.lcValue || item.amount || '0'),
        notes: item.remarks || '',
      }));
    } else if (categoryId === 'bl' || categoryId === 'vessel') {
      return shipList.filter((s: any) => {
        if (categoryId === 'bl') return !!(s.blNumber);
        if (categoryId === 'vessel') return !!(s.vesselName);
        return true;
      }).map((s: any) => ({
        id: s.blNumber || s.shipmentNumber || `SHP-${s.id}`,
        reference: s.orderNumber || `ORD-${s.orderId || ''}`,
        referenceType: "Shipment",
        status: (s.status || 'active').charAt(0).toUpperCase() + (s.status || 'active').slice(1),
        date: s.shipmentDate || s.etd || s.createdAt || '',
        documents: {
          required: 7,
          completed: ['delivered','completed'].includes((s.status||'').toLowerCase()) ? 7 : 
                     ['in_transit','shipped'].includes((s.status||'').toLowerCase()) ? 5 : 3,
        },
        compliance: ['delivered','completed'].includes((s.status||'').toLowerCase()) ? 100 : 70,
        value: parseFloat(s.totalValue || s.shippingCost || '0'),
        notes: s.notes || s.remarks || '',
      }));
    } else if (categoryId === 'export-docs' || categoryId === 'export-bill') {
      return docsList.map((d: any) => ({
        id: d.documentNumber || `DOC-${d.id}`,
        reference: `ORD-${d.orderId || ''}`,
        referenceType: d.documentType || "Document",
        status: (d.status || 'pending').charAt(0).toUpperCase() + (d.status || 'pending').slice(1),
        date: d.documentDate || d.createdAt || '',
        documents: { required: 1, completed: ['completed','approved'].includes((d.status||'').toLowerCase()) ? 1 : 0 },
        compliance: ['completed','approved'].includes((d.status||'').toLowerCase()) ? 100 : 50,
        value: parseFloat(d.amount || '0'),
        notes: d.remarks || d.description || '',
      }));
    } else if (categoryId === 'customs' || categoryId === 'duty' || categoryId === 'cnf' || categoryId === 'insurance') {
      return shipList.map((s: any) => ({
        id: s.shipmentNumber || `SHP-${s.id}`,
        reference: s.orderNumber || `ORD-${s.orderId || ''}`,
        referenceType: categoryName,
        status: (s.customsClearanceStatus || s.status || 'pending').charAt(0).toUpperCase() + (s.customsClearanceStatus || s.status || 'pending').slice(1),
        date: s.shipmentDate || s.etd || s.createdAt || '',
        documents: { required: 5, completed: ['delivered','completed'].includes((s.status||'').toLowerCase()) ? 5 : 2 },
        compliance: ['delivered','completed'].includes((s.status||'').toLowerCase()) ? 100 : 60,
        value: parseFloat(s.shippingCost || '0'),
        notes: s.notes || '',
      }));
    } else if (categoryId === 'import-bill' || categoryId === 'transport' || categoryId === 'local-import' || categoryId === 'foreign-import') {
      return shipList.filter((s: any) => {
        if (categoryId === 'transport') return true;
        if (categoryId === 'local-import') {
          const mode = (s.shipmentMode || '').toLowerCase();
          return mode.includes('road') || mode.includes('land') || mode.includes('rail') || mode.includes('truck');
        }
        if (categoryId === 'foreign-import') {
          const mode = (s.shipmentMode || '').toLowerCase();
          return mode.includes('sea') || mode.includes('air') || mode.includes('freight') || mode.includes('ocean');
        }
        return true;
      }).map((s: any) => ({
        id: s.shipmentNumber || `SHP-${s.id}`,
        reference: s.orderNumber || `ORD-${s.orderId || ''}`,
        referenceType: categoryName,
        status: (s.status || 'active').charAt(0).toUpperCase() + (s.status || 'active').slice(1),
        date: s.shipmentDate || s.etd || s.createdAt || '',
        documents: { required: 4, completed: ['delivered','completed'].includes((s.status||'').toLowerCase()) ? 4 : 1 },
        compliance: ['delivered','completed'].includes((s.status||'').toLowerCase()) ? 100 : 55,
        value: parseFloat(s.totalValue || s.shippingCost || '0'),
        notes: s.notes || '',
      }));
    } else if (categoryId === 'rex-certificate') {
      return lcsList.map((lc: any) => ({
        id: `REX-${lc.lcNumber || lc.id}`,
        reference: lc.lcNumber || `LC-${lc.id}`,
        referenceType: "REX Certificate",
        status: lc.status === 'active' ? 'Active' : lc.status === 'closed' ? 'Completed' : 'Pending',
        date: lc.issueDate || lc.createdAt || '',
        documents: { required: 3, completed: lc.status === 'closed' ? 3 : 1 },
        compliance: lc.status === 'closed' ? 100 : 65,
        value: parseFloat(lc.lcValue || '0'),
        notes: lc.remarks || '',
      }));
    }
    return [];
  })();

  const activeStatuses = ['active', 'in_transit', 'in-transit', 'shipped', 'loading', 'customs', 'customs_clearance', 'scheduled', 'processing', 'open'];
  const pendingStatuses = ['pending', 'draft', 'submitted', 'planned'];
  const completedStatuses = ['completed', 'closed', 'delivered', 'approved'];
  const activeItems = allItems.filter((i: any) => activeStatuses.includes(i.status.toLowerCase()));
  const pendingItems = allItems.filter((i: any) => pendingStatuses.includes(i.status.toLowerCase()));
  const completedItems = allItems.filter((i: any) => completedStatuses.includes(i.status.toLowerCase()));

  const totalCount = allItems.length;
  const totalValue = allItems.reduce((sum: number, i: any) => sum + i.value, 0);
  const avgCompliance = allItems.length > 0 
    ? allItems.reduce((sum: number, i: any) => sum + i.compliance, 0) / allItems.length 
    : 0;

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (activeStatuses.includes(s)) return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{status}</Badge>;
    if (pendingStatuses.includes(s)) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{status}</Badge>;
    if (completedStatuses.includes(s)) return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{status}</Badge>;
    if (['expired', 'cancelled'].includes(s)) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{status}</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };

  const getCategoryIcon = (catId: string) => {
    switch(catId) {
      case 'lc': case 'back-to-lc':
        return <FileText className="h-8 w-8 text-blue-500" />;
      case 'import-bill': case 'export-bill':
        return <DollarSign className="h-8 w-8 text-green-500" />;
      case 'rex-certificate':
        return <CheckCircle2 className="h-8 w-8 text-emerald-500" />;
      case 'vessel': case 'bl':
        return <Ship className="h-8 w-8 text-indigo-500" />;
      case 'export-docs':
        return <FileText className="h-8 w-8 text-purple-500" />;
      case 'customs': case 'duty':
        return <Building className="h-8 w-8 text-amber-500" />;
      case 'cnf': case 'insurance':
        return <Building className="h-8 w-8 text-rose-500" />;
      case 'transport': case 'local-import': case 'foreign-import':
        return <Truck className="h-8 w-8 text-cyan-500" />;
      default:
        return <FileText className="h-8 w-8 text-gray-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const renderItemsTable = (items: any[], emptyMessage: string) => (
    <Card>
      <CardContent>
        <div className="overflow-auto">
          <table className="w-full min-w-[640px] table-auto">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">ID</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Reference</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Date</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Documents</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Value</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? items
                .filter((item: any) => selectedReference === 'all' || item.reference === selectedReference)
                .map((item: any) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium">{item.id}</td>
                  <td className="py-3 px-4 text-sm">
                    <div>{item.reference}</div>
                    <div className="text-xs text-muted-foreground">{item.referenceType}</div>
                  </td>
                  <td className="py-3 px-4 text-sm">{formatDate(item.date)}</td>
                  <td className="py-3 px-4 text-sm">
                    <div className="flex items-center">
                      <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className="h-2 rounded-full bg-blue-500" 
                          style={{ width: `${(item.documents.completed / item.documents.required) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-xs">{item.documents.completed}/{item.documents.required}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm">${item.value.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm">{getStatusBadge(item.status)}</td>
                  <td className="py-3 px-4 text-sm">{item.notes || '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <motion.div initial="hidden" animate="visible" exit="exit" variants={fadeIn} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
        <div className="flex items-center gap-3">
          {getCategoryIcon(categoryId)}
          <div>
            <h2 className="text-xl font-bold">{categoryName}</h2>
            <p className="text-sm text-muted-foreground">
              Track and manage {categoryName.toLowerCase()} documentation
            </p>
          </div>
        </div>
        <div className="mt-3 sm:mt-0 flex items-center gap-2">
          {selectedReference !== 'all' && (
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
              Ref: {selectedReference}
            </Badge>
          )}
          <Select value={timeInterval} onValueChange={onTimeIntervalChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Monthly" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({allItems.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({activeItems.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingItems.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedItems.length})</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Total</CardTitle>
                  <FileText className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{totalCount}</span>
                <p className="text-xs text-muted-foreground mt-2">Total records</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Active</CardTitle>
                  <Clock className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{activeItems.length}</span>
                <Progress value={totalCount > 0 ? (activeItems.length / totalCount) * 100 : 0} className="h-2 mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Pending</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{pendingItems.length}</span>
                <Progress value={totalCount > 0 ? (pendingItems.length / totalCount) * 100 : 0} className="h-2 mt-2 bg-amber-100" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Compliance</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{avgCompliance.toFixed(1)}%</span>
                <Progress value={avgCompliance} className="h-2 mt-2" />
              </CardContent>
            </Card>
          </div>
          
          {renderItemsTable(allItems, `No ${categoryName.toLowerCase()} items found`)}
        </TabsContent>

        <TabsContent value="active" className="space-y-6">
          {renderItemsTable(activeItems, `No active ${categoryName.toLowerCase()} items found`)}
        </TabsContent>
        
        <TabsContent value="pending" className="space-y-6">
          {renderItemsTable(pendingItems, `No pending ${categoryName.toLowerCase()} items`)}
        </TabsContent>
        
        <TabsContent value="completed" className="space-y-6">
          {renderItemsTable(completedItems, `No completed ${categoryName.toLowerCase()} items`)}
        </TabsContent>
        
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Value Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {allItems.length > 0 ? (
                  <TremorCard>
                    <BarChart
                      className="h-60"
                      data={allItems.slice(0, 10).map((i: any) => ({ id: i.id, value: i.value }))}
                      index="id"
                      categories={["value"]}
                      colors={["blue"]}
                      valueFormatter={(v) => `$${v.toLocaleString()}`}
                      showAnimation={true}
                    />
                  </TremorCard>
                ) : (
                  <div className="h-60 flex items-center justify-center text-muted-foreground">
                    No data available for analytics
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {allItems.length > 0 ? (
                  <TremorCard>
                    <DonutChart
                      className="h-60"
                      data={[
                        { status: "Active", count: activeItems.length },
                        { status: "Pending", count: pendingItems.length },
                        { status: "Completed", count: completedItems.length },
                      ].filter(d => d.count > 0)}
                      index="status"
                      category="count"
                      colors={["blue", "amber", "emerald"]}
                      showAnimation={true}
                    />
                  </TremorCard>
                ) : (
                  <div className="h-60 flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col items-center bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium">TOTAL VALUE</p>
                  <p className="text-xl font-bold">${totalValue.toLocaleString()}</p>
                </div>
                <div className="flex flex-col items-center bg-green-50 p-4 rounded-lg">
                  <p className="text-xs text-green-600 font-medium">COMPLETION RATE</p>
                  <p className="text-xl font-bold">{totalCount > 0 ? ((completedItems.length / totalCount) * 100).toFixed(1) : 0}%</p>
                </div>
                <div className="flex flex-col items-center bg-purple-50 p-4 rounded-lg">
                  <p className="text-xs text-purple-600 font-medium">AVG COMPLIANCE</p>
                  <p className="text-xl font-bold">{avgCompliance.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default ImportExportTracking;