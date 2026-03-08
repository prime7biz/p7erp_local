import { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { BarChart, DonutChart, AreaChart, Card as TremorCard } from "@tremor/react";
import { Factory, Scissors, Package, CheckCircle2, AlertTriangle } from "lucide-react";

interface ProductionDashboardProps {
  timeInterval: string;
  dateRange: string;
  onTimeIntervalChange: (value: string) => void;
}

const ProductionDashboard: React.FC<ProductionDashboardProps> = ({
  timeInterval,
  dateRange,
  onTimeIntervalChange
}) => {
  const { data: productionOrders, isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/production/orders"],
  });

  const { data: cuttingDash, isLoading: cuttingLoading } = useQuery<any>({
    queryKey: ["/api/production/cutting/dashboard"],
    select: (res: any) => res?.data ?? {},
  });

  const { data: sewingDash, isLoading: sewingLoading } = useQuery<any>({
    queryKey: ["/api/sewing/dashboard"],
    select: (res: any) => res?.data ?? {},
  });

  const { data: fpDash, isLoading: fpLoading } = useQuery<any>({
    queryKey: ["/api/production/finishing-packing/dashboard"],
    select: (res: any) => res?.data ?? {},
  });

  const { data: factoryDash, isLoading: factoryLoading } = useQuery<any>({
    queryKey: ["/api/production/factory/dashboard"],
    select: (res: any) => res?.data ?? {},
  });

  const isLoading = ordersLoading || cuttingLoading || sewingLoading || fpLoading || factoryLoading;

  const orders = Array.isArray(productionOrders) ? productionOrders : [];
  const totalOrders = orders.length;
  const completedOrders = orders.filter((o: any) => o.status === 'COMPLETED' || o.status === 'completed').length;
  const inProgressOrders = orders.filter((o: any) => 
    o.status === 'IN_PROGRESS' || o.status === 'in_progress' || o.status === 'STARTED' || o.status === 'ACTIVE'
  ).length;

  const totalPlannedQty = orders.reduce((sum: number, o: any) => sum + (Number(o.orderQuantity || o.order_quantity || o.planned_qty || 0)), 0);
  const totalActualQty = orders.reduce((sum: number, o: any) => sum + (Number(o.completedQuantity || o.completed_quantity || o.actual_qty || 0)), 0);

  const productionRate = totalPlannedQty > 0 ? Math.round((totalActualQty / totalPlannedQty) * 1000) / 10 : 0;
  const targetAchievement = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 1000) / 10 : 0;

  const sewingOutput = sewingDash?.sewingOutput ?? {};
  const totalGood = Number(sewingOutput.total_good ?? 0);
  const totalReject = Number(sewingOutput.total_reject ?? 0);
  const totalRework = Number(sewingOutput.total_rework ?? 0);
  const totalInspected = totalGood + totalReject + totalRework;
  const efficiencyRate = totalInspected > 0 ? Math.round((totalGood / totalInspected) * 1000) / 10 : 0;
  const defectRate = totalInspected > 0 ? Math.round(((totalReject + totalRework) / totalInspected) * 1000) / 10 : 0;

  const productionByDepartment = [
    {
      department: "Cutting",
      completed: Number(cuttingDash?.bundlesCutToday ?? 0),
      target: Number(cuttingDash?.totalMarkers ?? 0) * 100 || Number(cuttingDash?.bundlesCutToday ?? 0) + 50,
      efficiency: cuttingDash?.totalMarkers > 0 ? Math.round((Number(cuttingDash?.bundlesCutToday ?? 0) / (Number(cuttingDash?.totalMarkers ?? 1) * 100)) * 100) : 0,
    },
    {
      department: "Sewing",
      completed: totalGood,
      target: totalGood + totalReject + totalRework || 1,
      efficiency: efficiencyRate || 0,
    },
    {
      department: "Finishing",
      completed: typeof fpDash?.finishingOutputToday === "object" ? Number(fpDash?.finishingOutputToday?.good ?? 0) : Number(fpDash?.finishingOutputToday ?? 0),
      target: (typeof fpDash?.finishingOutputToday === "object" ? Number(fpDash?.finishingOutputToday?.good ?? 0) + Number(fpDash?.finishingOutputToday?.rework ?? 0) + Number(fpDash?.finishingOutputToday?.reject ?? 0) : Number(fpDash?.finishingOutputToday ?? 0)) || 1,
      efficiency: typeof fpDash?.finishingOutputToday === "object" && (Number(fpDash?.finishingOutputToday?.good ?? 0) + Number(fpDash?.finishingOutputToday?.rework ?? 0) + Number(fpDash?.finishingOutputToday?.reject ?? 0)) > 0
        ? Math.round(Number(fpDash?.finishingOutputToday?.good ?? 0) / (Number(fpDash?.finishingOutputToday?.good ?? 0) + Number(fpDash?.finishingOutputToday?.rework ?? 0) + Number(fpDash?.finishingOutputToday?.reject ?? 0)) * 100) : 0,
    },
    {
      department: "Packing",
      completed: typeof fpDash?.packingOutputToday === "object" ? Number(fpDash?.packingOutputToday?.packed ?? 0) : Number(fpDash?.packingOutputToday ?? 0),
      target: (typeof fpDash?.packingOutputToday === "object" ? Number(fpDash?.packingOutputToday?.packed ?? 0) + Number(fpDash?.packingOutputToday?.rework ?? 0) + Number(fpDash?.packingOutputToday?.rejected ?? 0) : Number(fpDash?.packingOutputToday ?? 0)) || 1,
      efficiency: typeof fpDash?.packingOutputToday === "object" && (Number(fpDash?.packingOutputToday?.packed ?? 0) + Number(fpDash?.packingOutputToday?.rework ?? 0) + Number(fpDash?.packingOutputToday?.rejected ?? 0)) > 0
        ? Math.round(Number(fpDash?.packingOutputToday?.packed ?? 0) / (Number(fpDash?.packingOutputToday?.packed ?? 0) + Number(fpDash?.packingOutputToday?.rework ?? 0) + Number(fpDash?.packingOutputToday?.rejected ?? 0)) * 100) : 0,
    },
  ];

  const targetVsActualData = productionByDepartment.map(d => ({
    department: d.department,
    target: d.target,
    actual: d.completed,
  }));

  const ordersByStatus = [
    { status: "Completed", count: completedOrders },
    { status: "In Progress", count: inProgressOrders },
    { status: "Pending", count: totalOrders - completedOrders - inProgressOrders },
  ].filter(s => s.count > 0);

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-2 w-full" /></CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div custom={0} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Production Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{totalOrders}</span>
                <span className="text-sm text-muted-foreground">{completedOrders} completed</span>
              </div>
              <Progress value={targetAchievement} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {inProgressOrders} in progress, {totalOrders - completedOrders - inProgressOrders} pending
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div custom={1} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Production Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{productionRate}%</span>
                <Factory className="h-5 w-5 text-muted-foreground" />
              </div>
              <Progress value={productionRate} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {totalActualQty.toLocaleString()} / {totalPlannedQty.toLocaleString()} units
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div custom={2} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Sewing Efficiency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{efficiencyRate}%</span>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <Progress value={efficiencyRate} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                Good: {totalGood} | DHU: {Number(sewingDash?.avgDHU ?? 0).toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div custom={3} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Defect Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold">{defectRate}%</span>
                <AlertTriangle className={`h-5 w-5 ${defectRate > 5 ? 'text-red-500' : 'text-amber-500'}`} />
              </div>
              <Progress value={Math.min(defectRate * 10, 100)} className="h-2 bg-red-100" />
              <p className="text-xs text-muted-foreground mt-2">
                Reject: {totalReject} | Rework: {totalRework}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Production Metrics</h2>
        <Select value={timeInterval} onValueChange={onTimeIntervalChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Hourly" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hourly">Hourly</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div custom={5} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card>
            <CardHeader>
              <CardTitle>Department-wise Production</CardTitle>
            </CardHeader>
            <CardContent>
              {targetVsActualData.some(d => d.actual > 0 || d.target > 0) ? (
                <TremorCard>
                  <BarChart
                    className="h-80"
                    data={targetVsActualData}
                    index="department"
                    categories={["target", "actual"]}
                    colors={["blue", "teal"]}
                    valueFormatter={(value) => `${value} units`}
                    stack={false}
                    showAnimation={true}
                  />
                </TremorCard>
              ) : (
                <div className="flex items-center justify-center h-80 text-muted-foreground">
                  <div className="text-center">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No production output data yet</p>
                    <p className="text-sm">Data will appear as production batches are processed</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={6} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card>
            <CardHeader>
              <CardTitle>Efficiency by Department</CardTitle>
            </CardHeader>
            <CardContent>
              {productionByDepartment.some(d => d.efficiency > 0) ? (
                <TremorCard>
                  <BarChart
                    className="h-80"
                    data={productionByDepartment}
                    index="department"
                    categories={["efficiency"]}
                    colors={["emerald"]}
                    valueFormatter={(value) => `${value}%`}
                    showAnimation={true}
                  />
                </TremorCard>
              ) : (
                <div className="flex items-center justify-center h-80 text-muted-foreground">
                  <div className="text-center">
                    <Factory className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No efficiency data yet</p>
                    <p className="text-sm">Efficiency metrics will appear with production activity</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div custom={7} initial="hidden" animate="visible" variants={itemAnimation} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Production Order Status</CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 rounded-lg bg-green-50 border border-green-200">
                      <p className="text-3xl font-bold text-green-600">{completedOrders}</p>
                      <p className="text-sm text-green-700">Completed</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-3xl font-bold text-blue-600">{inProgressOrders}</p>
                      <p className="text-sm text-blue-700">In Progress</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-gray-50 border border-gray-200">
                      <p className="text-3xl font-bold text-gray-600">{totalOrders - completedOrders - inProgressOrders}</p>
                      <p className="text-sm text-gray-700">Pending</p>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 font-medium">Order</th>
                          <th className="text-left p-2 font-medium">Style</th>
                          <th className="text-right p-2 font-medium">Qty</th>
                          <th className="text-left p-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.slice(0, 10).map((order: any, idx: number) => (
                          <tr key={order.id || idx} className="border-t">
                            <td className="p-2 font-medium">{order.orderNumber || order.order_number || `PO-${order.id}`}</td>
                            <td className="p-2">{order.styleName || order.style_name || order.styleId || order.style_id || '-'}</td>
                            <td className="p-2 text-right">{Number(order.orderQuantity || order.order_quantity || 0).toLocaleString()}</td>
                            <td className="p-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                (order.status === 'COMPLETED' || order.status === 'completed') ? 'bg-green-100 text-green-800' :
                                (order.status === 'IN_PROGRESS' || order.status === 'STARTED' || order.status === 'ACTIVE') ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {order.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {orders.length > 10 && (
                      <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                        Showing 10 of {orders.length} orders
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-60 text-muted-foreground">
                  <div className="text-center">
                    <Factory className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No production orders found</p>
                    <p className="text-sm">Create production orders to see data here</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={8} initial="hidden" animate="visible" variants={itemAnimation}>
          <Card>
            <CardHeader>
              <CardTitle>Order Distribution</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {ordersByStatus.length > 0 ? (
                <TremorCard>
                  <DonutChart
                    className="h-60"
                    data={ordersByStatus}
                    index="status"
                    category="count"
                    valueFormatter={(value) => `${value} orders`}
                    colors={["emerald", "blue", "slate"]}
                    showAnimation={true}
                  />
                </TremorCard>
              ) : (
                <div className="flex items-center justify-center h-60 text-muted-foreground">
                  <div className="text-center">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No orders to display</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div custom={9} initial="hidden" animate="visible" variants={itemAnimation}>
        <Card>
          <CardHeader>
            <CardTitle>Department Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <Scissors className="h-5 w-5 text-blue-500" />
                  <h3 className="font-medium text-blue-800">Cutting</h3>
                </div>
                <p className="text-2xl font-bold">{cuttingDash?.totalMarkers ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total markers</p>
                <p className="text-sm mt-1">{cuttingDash?.bundlesCutToday ?? 0} bundles cut today</p>
                <p className="text-sm">{cuttingDash?.bundlesIssuedToday ?? 0} bundles issued</p>
              </div>

              <div className="p-4 rounded-lg border border-green-200 bg-green-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <Factory className="h-5 w-5 text-green-500" />
                  <h3 className="font-medium text-green-800">Sewing</h3>
                </div>
                <p className="text-2xl font-bold">{sewingDash?.activeLineLoads ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active line loads</p>
                <p className="text-sm mt-1">Good: {totalGood} | Reject: {totalReject}</p>
                <p className="text-sm">DHU: {Number(sewingDash?.avgDHU ?? 0).toFixed(1)}%</p>
              </div>

              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-5 w-5 text-amber-500" />
                  <h3 className="font-medium text-amber-800">Finishing</h3>
                </div>
                <p className="text-2xl font-bold">
                  {typeof fpDash?.finishingOutputToday === "object" ? fpDash?.finishingOutputToday?.good ?? 0 : fpDash?.finishingOutputToday ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Finished today</p>
                {typeof fpDash?.finishingOutputToday === "object" && (
                  <>
                    <p className="text-sm mt-1">Rework: {fpDash?.finishingOutputToday?.rework ?? 0}</p>
                    <p className="text-sm">Reject: {fpDash?.finishingOutputToday?.reject ?? 0}</p>
                  </>
                )}
              </div>

              <div className="p-4 rounded-lg border border-purple-200 bg-purple-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-5 w-5 text-purple-500" />
                  <h3 className="font-medium text-purple-800">Packing</h3>
                </div>
                <p className="text-2xl font-bold">{fpDash?.cartonsSealedToday ?? 0}</p>
                <p className="text-xs text-muted-foreground">Cartons sealed today</p>
                <p className="text-sm mt-1">{fpDash?.packingListsIssuedToday ?? 0} packing lists issued</p>
                <p className="text-sm">
                  Packed: {typeof fpDash?.packingOutputToday === "object" ? fpDash?.packingOutputToday?.packed ?? 0 : fpDash?.packingOutputToday ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ProductionDashboard;
