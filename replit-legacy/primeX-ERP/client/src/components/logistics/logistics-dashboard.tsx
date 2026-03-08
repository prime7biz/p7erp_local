import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { BarChart, DonutChart, AreaChart, LineChart, Card as TremorCard } from "@tremor/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Ship, 
  Clipboard, 
  FileText, 
  DollarSign, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  CheckCircle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

interface LogisticsDashboardProps {
  timeInterval: string;
  dateRange: string;
  selectedReference: string;
  onTimeIntervalChange: (value: string) => void;
}

const LogisticsDashboard: React.FC<LogisticsDashboardProps> = ({
  timeInterval,
  dateRange,
  selectedReference,
  onTimeIntervalChange
}) => {
  const { data: shipments = [], isLoading: shipmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/shipments'],
  });

  const { data: exportDocuments = [], isLoading: docsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/export-documents'],
  });

  const { data: lcs = [], isLoading: lcsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/lcs'],
  });

  const { data: btbLcs = [], isLoading: btbLoading } = useQuery<any[]>({
    queryKey: ['/api/btb-lcs'],
  });

  const { data: purchaseOrders = [], isLoading: posLoading } = useQuery<any[]>({
    queryKey: ['/api/purchase-orders'],
  });

  const isLoading = shipmentsLoading || docsLoading || lcsLoading;

  const shipmentsList = Array.isArray(shipments) ? shipments : [];
  const docsList = Array.isArray(exportDocuments) ? exportDocuments : [];
  const lcsList = Array.isArray(lcs) ? lcs : [];
  const btbList = Array.isArray(btbLcs) ? btbLcs : [];
  const poList = Array.isArray(purchaseOrders) ? purchaseOrders : [];

  const activeShipments = shipmentsList.filter((s: any) => !['delivered','completed'].includes((s.status||'').toLowerCase()));
  const pendingDocs = docsList.filter((d: any) => ['pending','draft'].includes((d.status||'').toLowerCase()));
  const completedDocs = docsList.filter((d: any) => ['completed','approved'].includes((d.status||'').toLowerCase()));
  const deliveredShipments = shipmentsList.filter((s: any) => ['delivered','completed'].includes((s.status||'').toLowerCase()));

  const totalTradeValue = shipmentsList.reduce((sum: number, s: any) => sum + (parseFloat(s.totalValue || s.shippingCost || '0')), 0);
  const onTimeRate = shipmentsList.length > 0 
    ? ((deliveredShipments.length / Math.max(shipmentsList.length, 1)) * 100)
    : 0;

  const logisticsOverview = {
    activeShipments: activeShipments.length,
    pendingDocuments: pendingDocs.length,
    upcomingDeadlines: lcsList.filter((lc: any) => lc.status === 'active' || lc.status === 'pending').length,
    totalValue: `$${totalTradeValue.toLocaleString()}`,
    onTimeDelivery: onTimeRate > 0 ? onTimeRate : 0,
    documentCompliance: docsList.length > 0 ? ((completedDocs.length / docsList.length) * 100) : 0,
  };

  const tradeVolumeData = (() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result: { month: string; imports: number; exports: number }[] = [];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = months[d.getMonth()];
      
      const monthShipments = shipmentsList.filter((s: any) => {
        const sd = new Date(s.shipmentDate || s.etd || s.createdAt);
        return sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear();
      });

      const exportVal = monthShipments.reduce((sum: number, s: any) => sum + parseFloat(s.totalValue || s.shippingCost || '0'), 0);
      
      const monthPOs = poList.filter((po: any) => {
        const pd = new Date(po.orderDate || po.createdAt);
        return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
      });
      const importVal = monthPOs.reduce((sum: number, po: any) => sum + parseFloat(po.totalAmount || '0'), 0);

      result.push({ month: monthKey, imports: importVal, exports: exportVal });
    }
    return result;
  })();

  const documentStatusData = (() => {
    const total = docsList.length || 1;
    const completed = docsList.filter((d: any) => d.status === 'completed' || d.status === 'approved').length;
    const pending = docsList.filter((d: any) => d.status === 'pending').length;
    const inProgress = docsList.filter((d: any) => d.status === 'draft' || d.status === 'in_progress').length;
    return [
      { status: "Completed", percentage: Math.round((completed / total) * 100) },
      { status: "In Progress", percentage: Math.round((inProgress / total) * 100) },
      { status: "Pending", percentage: Math.round((pending / total) * 100) },
    ];
  })();

  const shippingModeData = (() => {
    const total = shipmentsList.length || 1;
    const modeOf = (s: any) => (s.shipmentMode || s.mode || '').toLowerCase();
    const sea = shipmentsList.filter((s: any) => modeOf(s).includes('sea')).length;
    const air = shipmentsList.filter((s: any) => modeOf(s).includes('air')).length;
    const land = shipmentsList.filter((s: any) => modeOf(s).includes('road') || modeOf(s).includes('land')).length;
    return [
      { mode: "Sea", volume: Math.round((sea / total) * 100) || (shipmentsList.length === 0 ? 0 : 100) },
      { mode: "Air", volume: Math.round((air / total) * 100) },
      { mode: "Land", volume: Math.round((land / total) * 100) },
    ].filter(m => m.volume > 0);
  })();

  const costBreakdownData = [
    { category: "Freight", percentage: 42 },
    { category: "Customs", percentage: 18 },
    { category: "Insurance", percentage: 8 },
    { category: "Handling", percentage: 12 },
    { category: "Documentation", percentage: 6 },
    { category: "Other", percentage: 14 },
  ];

  const ongoingShipmentsData = activeShipments.map((s: any) => ({
    id: s.shipmentNumber || `SHP-${s.id}`,
    origin: s.portOfLoading || 'Origin',
    destination: s.portOfDischarge || 'Destination',
    status: s.status || 'In Transit',
    progress: s.status === 'delivered' || s.status === 'completed' ? 100 :
              s.status === 'customs' ? 80 :
              s.status === 'in_transit' || s.status === 'in-transit' ? 55 :
              s.status === 'loading' ? 30 : 20,
    value: parseFloat(s.totalValue || s.shippingCost || '0'),
    eta: s.eta || s.etd || new Date().toISOString(),
  }));

  const itemAnimation = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
        ease: "easeOut"
      }
    })
  };

  const getTrendIndicator = (current: number, previous: number, reverseColor: boolean = false) => {
    if (previous === 0) return null;
    const isPositive = reverseColor ? current < previous : current > previous;
    const changePercent = Math.abs(((current - previous) / previous) * 100).toFixed(1);
    
    if (isPositive) {
      return (
        <div className="flex items-center text-emerald-600">
          <ChevronUp className="h-4 w-4 mr-1" />
          <span className="text-xs">{changePercent}%</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-rose-600">
          <ChevronDown className="h-4 w-4 mr-1" />
          <span className="text-xs">{changePercent}%</span>
        </div>
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div custom={0} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Active Shipments</CardTitle>
                <Ship className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{logisticsOverview.activeShipments}</span>
              </div>
              <Progress value={Math.min(logisticsOverview.activeShipments * 10, 100)} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {shipmentsList.length} total shipments tracked
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div custom={1} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Pending Documents</CardTitle>
                <FileText className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{logisticsOverview.pendingDocuments}</span>
              </div>
              <Progress value={docsList.length > 0 ? (pendingDocs.length / docsList.length) * 100 : 0} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {docsList.length} total documents
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div custom={2} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">On-Time Delivery</CardTitle>
                <CheckCircle className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{logisticsOverview.onTimeDelivery.toFixed(1)}%</span>
              </div>
              <Progress value={logisticsOverview.onTimeDelivery} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {deliveredShipments.length} delivered of {shipmentsList.length}
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div custom={3} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Trade Value</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{logisticsOverview.totalValue}</span>
              </div>
              <Progress value={85} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                Total active shipment value
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Logistics Analytics</h2>
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

      <motion.div custom={4} initial="hidden" animate="visible" variants={itemAnimation}>
        <Card>
          <CardHeader>
            <CardTitle>
              Import/Export Volume
              {selectedReference !== 'all' && (
                <Badge className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-100">
                  Ref: {selectedReference}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TremorCard>
              <BarChart
                className="h-72"
                data={tradeVolumeData}
                index="month"
                categories={["imports", "exports"]}
                colors={["blue", "green"]}
                valueFormatter={(value) => `$${(value/1000).toFixed(0)}k`}
                stack={false}
                showAnimation={true}
              />
            </TremorCard>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="flex flex-col items-center bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-blue-600 font-medium">TOTAL IMPORTS</p>
                <p className="text-xl font-bold">${(tradeVolumeData.reduce((s, d) => s + d.imports, 0) / 1000).toFixed(0)}K</p>
                <p className="text-xs text-muted-foreground">ytd value</p>
              </div>
              <div className="flex flex-col items-center bg-green-50 p-3 rounded-lg">
                <p className="text-xs text-green-600 font-medium">TOTAL EXPORTS</p>
                <p className="text-xl font-bold">${(tradeVolumeData.reduce((s, d) => s + d.exports, 0) / 1000).toFixed(0)}K</p>
                <p className="text-xs text-muted-foreground">ytd value</p>
              </div>
              <div className="flex flex-col items-center bg-purple-50 p-3 rounded-lg">
                <p className="text-xs text-purple-600 font-medium">ACTIVE LCs</p>
                <p className="text-xl font-bold">{lcsList.length + btbList.length}</p>
                <p className="text-xs text-muted-foreground">letters of credit</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div custom={5} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card>
            <CardHeader>
              <CardTitle>Document Status</CardTitle>
            </CardHeader>
            <CardContent>
              {documentStatusData.some(d => d.percentage > 0) ? (
                <TremorCard>
                  <DonutChart
                    className="h-60"
                    data={documentStatusData.filter(d => d.percentage > 0)}
                    index="status"
                    category="percentage"
                    colors={["emerald", "amber", "rose"]}
                    valueFormatter={(value) => `${value}%`}
                    showAnimation={true}
                  />
                </TremorCard>
              ) : (
                <div className="h-60 flex items-center justify-center text-muted-foreground">
                  No documents found
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={6} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card>
            <CardHeader>
              <CardTitle>Shipping Modes</CardTitle>
            </CardHeader>
            <CardContent>
              {shippingModeData.length > 0 ? (
                <TremorCard>
                  <DonutChart
                    className="h-60"
                    data={shippingModeData}
                    index="mode"
                    category="volume"
                    colors={["sky", "violet", "amber", "emerald"]}
                    valueFormatter={(value) => `${value}%`}
                    showAnimation={true}
                  />
                </TremorCard>
              ) : (
                <div className="h-60 flex items-center justify-center text-muted-foreground">
                  No shipment data
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={7} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card>
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <TremorCard>
                <DonutChart
                  className="h-60"
                  data={costBreakdownData}
                  index="category"
                  category="percentage"
                  colors={["indigo", "cyan", "amber", "emerald", "rose", "slate"]}
                  valueFormatter={(value) => `${value}%`}
                  showAnimation={true}
                />
              </TremorCard>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div custom={8} initial="hidden" animate="visible" variants={itemAnimation}>
        <Card>
          <CardHeader>
            <CardTitle>Active Shipments</CardTitle>
          </CardHeader>
          <CardContent>
            {ongoingShipmentsData.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full min-w-[640px] table-auto">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Shipment ID</th>
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Route</th>
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Value</th>
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Status</th>
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Progress</th>
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ongoingShipmentsData.map((shipment: any) => (
                      <tr key={shipment.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm font-medium">{shipment.id}</td>
                        <td className="py-3 px-4 text-sm">{shipment.origin} → {shipment.destination}</td>
                        <td className="py-3 px-4 text-sm">${(shipment.value).toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                            ${shipment.status === 'in_transit' || shipment.status === 'in-transit' ? 'bg-blue-100 text-blue-800' : 
                             shipment.status === 'customs' ? 'bg-amber-100 text-amber-800' :
                             shipment.status === 'loading' ? 'bg-emerald-100 text-emerald-800' : 
                             'bg-purple-100 text-purple-800'}`}
                          >
                            {shipment.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 w-36">
                          <div className="flex items-center">
                            <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  shipment.progress >= 80 ? 'bg-emerald-500' : 
                                  shipment.progress >= 50 ? 'bg-blue-500' : 
                                  shipment.progress >= 30 ? 'bg-amber-500' : 'bg-rose-500'
                                }`} 
                                style={{ width: `${shipment.progress}%` }}
                              ></div>
                            </div>
                            <span className="text-xs">{shipment.progress}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm">{new Date(shipment.eta).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center text-muted-foreground">
                No active shipments found. Create shipments in the Commercial module.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div custom={9} initial="hidden" animate="visible" variants={itemAnimation}>
        <Card>
          <CardHeader>
            <CardTitle>AI-Powered Logistics Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeShipments.length > 0 ? (
                <>
                  <div className="flex items-start gap-3 p-3 border border-blue-200 bg-blue-50 rounded-md">
                    <div className="flex-shrink-0 mt-1">
                      <TrendingUp className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="font-medium text-blue-800">Shipment Monitoring</h3>
                      <p className="text-sm text-blue-700 mt-1">
                        {activeShipments.length} active shipment{activeShipments.length !== 1 ? 's' : ''} being tracked. 
                        Total trade value: {logisticsOverview.totalValue}. 
                        Monitor delivery timelines and documentation status regularly.
                      </p>
                    </div>
                  </div>
                  {pendingDocs.length > 0 && (
                    <div className="flex items-start gap-3 p-3 border border-amber-200 bg-amber-50 rounded-md">
                      <div className="flex-shrink-0 mt-1">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <h3 className="font-medium text-amber-800">Documentation Attention Required</h3>
                        <p className="text-sm text-amber-700 mt-1">
                          {pendingDocs.length} document{pendingDocs.length !== 1 ? 's' : ''} pending review or completion. 
                          Complete all required documents before shipping deadlines to avoid delays.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-start gap-3 p-3 border border-green-200 bg-green-50 rounded-md">
                  <div className="flex-shrink-0 mt-1">
                    <Clock className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-medium text-green-800">No Active Shipments</h3>
                    <p className="text-sm text-green-700 mt-1">
                      No shipments are currently active. Create new shipments from the Commercial module to start tracking logistics operations.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default LogisticsDashboard;