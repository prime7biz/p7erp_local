import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { TabsContent, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, LineChart, DonutChart, Card as TremorCard } from "@tremor/react";

import { 
  DollarSign, 
  Percent, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  ChevronsUp,
  ChevronsDown,
  Plus,
  FileText,
  Filter,
  Download,
  Ship,
  Truck,
  Clipboard,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface CostManagementProps {
  selectedReference: string;
  timeInterval: string;
  dateRange: string;
}

const CostManagement: React.FC<CostManagementProps> = ({
  selectedReference,
  timeInterval,
  dateRange,
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCostCategory, setSelectedCostCategory] = useState('all');

  const { data: purchaseOrders = [], isLoading: posLoading } = useQuery<any[]>({
    queryKey: ['/api/purchase-orders'],
  });

  const { data: shipments = [], isLoading: shipmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/shipments'],
  });

  const { data: lcs = [], isLoading: lcsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/lcs'],
  });

  const isLoading = posLoading || shipmentsLoading || lcsLoading;

  const shipList = Array.isArray(shipments) ? shipments : [];
  const poList = Array.isArray(purchaseOrders) ? purchaseOrders : [];
  const lcsList = Array.isArray(lcs) ? lcs : [];

  const containerAnimation = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemAnimation = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  const costItems = [
    ...shipList.map((s: any) => ({
      id: `FRT-${s.id}`,
      reference: s.shipmentNumber || `SHP-${s.id}`,
      referenceType: "Shipment",
      category: "Freight",
      subcategory: (s.shipmentMode || s.mode || 'sea').toLowerCase().includes('air') ? 'Air Freight' : 'Ocean Freight',
      amount: parseFloat(s.shippingCost || '0') || parseFloat(s.totalValue || '0') * 0.05,
      currency: s.orderCurrency || "USD",
      status: ['delivered','completed'].includes((s.status||'').toLowerCase()) ? 'paid' as const : 'invoiced' as const,
      date: s.shipmentDate || s.etd || s.createdAt || '',
      vendor: s.carrier || s.vesselName || s.forwarder || 'Carrier',
    })),
    ...poList.map((po: any) => ({
      id: `PO-COST-${po.id}`,
      reference: po.poNumber || `PO-${po.id}`,
      referenceType: "Purchase Order",
      category: "Procurement",
      subcategory: "Material Cost",
      amount: parseFloat(po.totalAmount || '0'),
      currency: po.currency || "BDT",
      status: ['completed','received'].includes((po.status||'').toLowerCase()) ? 'paid' as const : 
              po.status === 'approved' ? 'invoiced' as const : 'pending' as const,
      date: po.orderDate || po.createdAt || '',
      vendor: po.vendorName || po.supplierName || 'Vendor',
    })),
    ...lcsList.map((lc: any) => ({
      id: `LC-COST-${lc.id}`,
      reference: lc.lcNumber || `LC-${lc.id}`,
      referenceType: "Letter of Credit",
      category: "Banking",
      subcategory: "LC Fees",
      amount: parseFloat(lc.lcValue || '0') * 0.01,
      currency: lc.currency || "USD",
      status: ['closed','completed'].includes((lc.status||'').toLowerCase()) ? 'paid' as const : 'invoiced' as const,
      date: lc.issueDate || lc.createdAt || '',
      vendor: lc.bankName || 'Bank',
    })),
  ];

  const totalCost = costItems.reduce((sum, c) => sum + c.amount, 0);
  const paidCost = costItems.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0);
  const invoicedCost = costItems.filter(c => c.status === 'invoiced').reduce((sum, c) => sum + c.amount, 0);
  const pendingCost = costItems.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0);

  const costByCategory = (() => {
    const cats: Record<string, number> = {};
    costItems.forEach(c => {
      cats[c.category] = (cats[c.category] || 0) + c.amount;
    });
    return Object.entries(cats).map(([category, amount]) => ({ category, amount }));
  })();

  const filteredCosts = costItems
    .filter(cost => selectedReference === 'all' || cost.reference === selectedReference)
    .filter(cost => selectedCostCategory === 'all' || cost.category.toLowerCase() === selectedCostCategory.toLowerCase());

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'paid': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
      case 'invoiced': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Invoiced</Badge>;
      case 'pending': return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <motion.div variants={containerAnimation} initial="hidden" animate="visible" className="space-y-6">
      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Cost Overview</TabsTrigger>
          <TabsTrigger value="details">Cost Details</TabsTrigger>
          <TabsTrigger value="analysis">Cost Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <motion.div variants={itemAnimation} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Logistics Costs</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{formatCurrency(totalCost)}</span>
                <Progress value={100} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground mt-2">{costItems.length} cost entries</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{formatCurrency(paidCost)}</span>
                <Progress value={totalCost > 0 ? (paidCost / totalCost) * 100 : 0} className="h-2 mt-2 bg-green-100" />
                <p className="text-xs text-muted-foreground mt-2">{totalCost > 0 ? Math.round((paidCost / totalCost) * 100) : 0}% of total</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Invoiced</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{formatCurrency(invoicedCost)}</span>
                <Progress value={totalCost > 0 ? (invoicedCost / totalCost) * 100 : 0} className="h-2 mt-2 bg-blue-100" />
                <p className="text-xs text-muted-foreground mt-2">Awaiting payment</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{formatCurrency(pendingCost)}</span>
                <Progress value={totalCost > 0 ? (pendingCost / totalCost) * 100 : 0} className="h-2 mt-2 bg-amber-100" />
                <p className="text-xs text-muted-foreground mt-2">To be invoiced</p>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Cost Breakdown by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  {costByCategory.length > 0 ? (
                    <TremorCard>
                      <BarChart
                        className="h-72"
                        data={costByCategory}
                        index="category"
                        categories={["amount"]}
                        colors={["blue"]}
                        valueFormatter={(value) => formatCurrency(value)}
                        showAnimation={true}
                      />
                    </TremorCard>
                  ) : (
                    <div className="h-72 flex items-center justify-center text-muted-foreground">
                      No cost data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
            
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Cost Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {costByCategory.length > 0 ? (
                    <TremorCard>
                      <DonutChart
                        className="h-72"
                        data={costByCategory}
                        index="category"
                        category="amount"
                        colors={["blue", "indigo", "cyan", "sky", "violet"]}
                        valueFormatter={(value) => formatCurrency(value)}
                        showAnimation={true}
                      />
                    </TremorCard>
                  ) : (
                    <div className="h-72 flex items-center justify-center text-muted-foreground">
                      No cost data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
          
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>
                  Recent Costs
                  {selectedReference !== 'all' && (
                    <Badge className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-100">
                      Ref: {selectedReference}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCosts.length > 0 ? filteredCosts.slice(0, 10).map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell className="font-medium">{cost.id}</TableCell>
                        <TableCell>
                          <div>
                            <span>{cost.reference}</span>
                            <div className="text-xs text-muted-foreground">{cost.referenceType}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span>{cost.category}</span>
                            <div className="text-xs text-muted-foreground">{cost.subcategory}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(cost.amount, cost.currency)}</TableCell>
                        <TableCell>{cost.vendor}</TableCell>
                        <TableCell>{formatDate(cost.date)}</TableCell>
                        <TableCell>{getStatusBadge(cost.status)}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          No cost data found. Costs are derived from shipments, purchase orders, and LCs.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
              {filteredCosts.length > 10 && (
                <CardFooter className="flex justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('details')}>
                    View All Costs ({filteredCosts.length})
                  </Button>
                </CardFooter>
              )}
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="details" className="space-y-6">
          <motion.div variants={itemAnimation} className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-64">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-md">Cost Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button
                      variant={selectedCostCategory === 'all' ? "default" : "ghost"}
                      className="w-full justify-start"
                      onClick={() => setSelectedCostCategory('all')}
                    >
                      All Categories
                    </Button>
                    {costByCategory.map((cat) => (
                      <Button
                        key={cat.category}
                        variant={selectedCostCategory === cat.category.toLowerCase() ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setSelectedCostCategory(cat.category.toLowerCase())}
                      >
                        {cat.category} ({formatCurrency(cat.amount)})
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="flex-1">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {selectedCostCategory === 'all' ? 'All Costs' : `${selectedCostCategory.charAt(0).toUpperCase() + selectedCostCategory.slice(1)} Costs`}
                  </CardTitle>
                  <CardDescription>Detailed cost breakdown from real transactions</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCosts.length > 0 ? filteredCosts.map((cost) => (
                        <TableRow key={cost.id}>
                          <TableCell className="font-medium">{cost.id}</TableCell>
                          <TableCell>
                            <div>
                              <span>{cost.reference}</span>
                              <div className="text-xs text-muted-foreground">{cost.referenceType}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <span>{cost.category}</span>
                              <div className="text-xs text-muted-foreground">{cost.subcategory}</div>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{formatCurrency(cost.amount, cost.currency)}</TableCell>
                          <TableCell>{cost.vendor}</TableCell>
                          <TableCell>{formatDate(cost.date)}</TableCell>
                          <TableCell>{getStatusBadge(cost.status)}</TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            No costs found for this category
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Cost Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="flex flex-col items-center bg-blue-50 p-4 rounded-lg">
                    <p className="text-xs text-blue-600 font-medium">TOTAL COSTS</p>
                    <p className="text-xl font-bold">{formatCurrency(totalCost)}</p>
                  </div>
                  <div className="flex flex-col items-center bg-green-50 p-4 rounded-lg">
                    <p className="text-xs text-green-600 font-medium">PAID</p>
                    <p className="text-xl font-bold">{formatCurrency(paidCost)}</p>
                  </div>
                  <div className="flex flex-col items-center bg-amber-50 p-4 rounded-lg">
                    <p className="text-xs text-amber-600 font-medium">OUTSTANDING</p>
                    <p className="text-xl font-bold">{formatCurrency(invoicedCost + pendingCost)}</p>
                  </div>
                  <div className="flex flex-col items-center bg-purple-50 p-4 rounded-lg">
                    <p className="text-xs text-purple-600 font-medium">CATEGORIES</p>
                    <p className="text-xl font-bold">{costByCategory.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default CostManagement;