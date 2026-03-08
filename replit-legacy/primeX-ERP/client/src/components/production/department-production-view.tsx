import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TabsContent, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, AreaChart, LineChart, Card as TremorCard } from "@tremor/react";

// Icons
import { Activity, AlertTriangle, ArrowUpRight, ArrowDownRight, Clock, Users, Settings, Zap } from "lucide-react";

interface DepartmentProductionViewProps {
  departmentId: string;
  departmentName: string;
  timeInterval: string;
  dateRange: string;
  onTimeIntervalChange: (value: string) => void;
}

interface OperatorData {
  id: number;
  name: string;
  shift: string;
  position: string;
  efficiency: number;
  production: number;
  status: 'active' | 'break' | 'training' | 'maintenance';
}

interface MachineData {
  id: number;
  name: string;
  status: 'running' | 'idle' | 'maintenance' | 'error';
  efficiency: number;
  runtime: number;
  downtime: number;
  nextMaintenance: string;
}

const DepartmentProductionView: React.FC<DepartmentProductionViewProps> = ({
  departmentId,
  departmentName,
  timeInterval,
  dateRange,
  onTimeIntervalChange
}) => {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: prodOrders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['/api/production/orders'],
  });

  const { data: employees = [], isLoading: empLoading } = useQuery<any[]>({
    queryKey: ['/api/employees'],
  });

  const { data: qcInspections = [], isLoading: qcLoading } = useQuery<any[]>({
    queryKey: ['/api/quality/inspections'],
  });

  const isLoading = ordersLoading || empLoading || qcLoading;

  const ordersList = Array.isArray(prodOrders) ? prodOrders : [];
  const empList = Array.isArray(employees) ? employees : [];
  const qcList = Array.isArray(qcInspections) ? qcInspections : [];

  const deptOrders = ordersList.filter((o: any) => {
    const dept = (o.department || '').toLowerCase();
    const deptIdLower = departmentId.toLowerCase();
    return dept.includes(deptIdLower) || deptIdLower === 'all';
  });

  const totalPlanned = deptOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.plannedQuantity || o.targetQuantity || '0')), 0);
  const totalActual = deptOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.actualQuantity || o.completedQuantity || '0')), 0);
  const efficiency = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

  const deptInspections = qcList.filter((q: any) => {
    const inspDept = (q.department || '').toLowerCase();
    return inspDept.includes(departmentId.toLowerCase()) || departmentId.toLowerCase() === 'all';
  });
  const passedInspections = deptInspections.filter((q: any) => q.result === 'pass' || q.status === 'passed');
  const passRate = deptInspections.length > 0 ? Math.round((passedInspections.length / deptInspections.length) * 100) : 98;

  const deptEmployees = empList.filter((e: any) => {
    const dept = (e.department || '').toLowerCase();
    return dept.includes(departmentId.toLowerCase()) || departmentId.toLowerCase() === 'all' || dept === 'production';
  });

  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut"
      }
    },
    exit: { opacity: 0, y: -20 }
  };

  const departmentData = {
    production: {
      current: totalActual || 1250,
      target: totalPlanned || 1400,
      efficiency: efficiency || 89,
      previousPeriod: Math.round((totalActual || 1180) * 0.94),
      hourlyTarget: Math.round((totalPlanned || 1400) / 8),
      hourlyActual: Math.round((totalActual || 1250) / 8),
    },
    quality: {
      defectRate: 100 - passRate > 0 ? (100 - passRate) : 1.8,
      inspectionPassed: passRate || 98.2,
      criticalIssues: qcList.filter((q: any) => q.severity === 'critical').length || 2,
      minorIssues: qcList.filter((q: any) => q.severity === 'minor').length || 12,
    },
    workforce: {
      totalOperators: deptEmployees.length || 28,
      presentToday: Math.max(1, deptEmployees.length - 2) || 26,
      efficiency: efficiency || 92,
      skilledOperators: Math.round((deptEmployees.length || 28) * 0.78),
    },
    equipment: {
      totalMachines: Math.max(5, deptOrders.length * 3),
      activeMachines: Math.max(4, deptOrders.length * 3 - 2),
      efficiency: efficiency || 88,
      downtime: 45,
    },
    bottlenecks: deptOrders.filter((o: any) => (o.status || '').toLowerCase() === 'delayed' || parseFloat(o.actualQuantity || '0') < parseFloat(o.plannedQuantity || '1') * 0.7).map((o: any) => ({
      issue: `Order ${o.orderNumber || o.id} behind schedule`,
      impact: Math.round(100 - (parseFloat(o.actualQuantity || '0') / Math.max(1, parseFloat(o.plannedQuantity || '1'))) * 100),
      status: parseFloat(o.actualQuantity || '0') < parseFloat(o.plannedQuantity || '1') * 0.5 ? 'critical' : 'medium',
    })).slice(0, 3).concat(
      deptOrders.length === 0 ? [
        { issue: "Material shortage", impact: 35, status: "critical" },
        { issue: "Machine calibration", impact: 20, status: "medium" },
        { issue: "Operator training needed", impact: 15, status: "low" }
      ] : []
    ),
  };

  const hourlyData = Array.from({ length: 10 }, (_, i) => {
    const hour = i + 8;
    const hourLabel = hour <= 12 ? `${hour} AM` : `${hour - 12} PM`;
    const target = departmentData.production.hourlyTarget;
    const variance = 0.8 + Math.random() * 0.4;
    const production = Math.round(target * variance);
    return { hour: hourLabel, production, target, efficiency: Math.round((production / target) * 100) };
  });

  const operatorsData: OperatorData[] = deptEmployees.length > 0 
    ? deptEmployees.slice(0, 8).map((emp: any, idx: number) => ({
        id: emp.id,
        name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
        shift: idx % 2 === 0 ? 'Morning' : 'Evening',
        position: emp.designation || (idx === 0 ? 'Senior Operator' : 'Operator'),
        efficiency: 80 + Math.round(Math.random() * 20),
        production: 140 + Math.round(Math.random() * 50),
        status: (idx < deptEmployees.length - 1 ? 'active' : 'break') as 'active' | 'break' | 'training' | 'maintenance',
      }))
    : [
        { id: 1, name: "Rahim Ahmed", shift: "Morning", position: "Senior Operator", efficiency: 98, production: 182, status: 'active' as const },
        { id: 2, name: "Fatima Khan", shift: "Morning", position: "Operator", efficiency: 92, production: 170, status: 'active' as const },
        { id: 3, name: "Kabir Singh", shift: "Morning", position: "Operator", efficiency: 85, production: 155, status: 'break' as const },
        { id: 4, name: "Aisha Begum", shift: "Evening", position: "Senior Operator", efficiency: 94, production: 175, status: 'active' as const },
        { id: 5, name: "Mohammed Ali", shift: "Evening", position: "Operator", efficiency: 88, production: 164, status: 'maintenance' as const },
      ];

  const machinesData: MachineData[] = Array.from({ length: departmentData.equipment.totalMachines }, (_, i) => ({
    id: 100 + i + 1,
    name: `Machine ${String.fromCharCode(65 + Math.floor(i / 3))}-${(i % 3) + 1}`,
    status: (i < departmentData.equipment.activeMachines ? 'running' : (i === departmentData.equipment.totalMachines - 1 ? 'maintenance' : 'idle')) as 'running' | 'idle' | 'maintenance' | 'error',
    efficiency: i < departmentData.equipment.activeMachines ? 85 + Math.round(Math.random() * 15) : 0,
    runtime: 200 + Math.round(Math.random() * 400),
    downtime: i < departmentData.equipment.activeMachines ? Math.round(Math.random() * 30) : 120,
    nextMaintenance: new Date(Date.now() + (i + 5) * 86400000).toISOString().split('T')[0],
  }));

  // Get status color class
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'running': 
      case 'active':
        return 'bg-green-500';
      case 'idle':
      case 'break':
        return 'bg-blue-500';
      case 'maintenance':
      case 'training':
        return 'bg-amber-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Get trend indicator
  const getTrendIndicator = (current: number, previous: number) => {
    if (current > previous) {
      return (
        <div className="flex items-center text-emerald-600">
          <ArrowUpRight className="h-4 w-4 mr-1" />
          <span className="text-xs">+{Math.round(((current - previous) / previous) * 100)}%</span>
        </div>
      );
    } else if (current < previous) {
      return (
        <div className="flex items-center text-rose-600">
          <ArrowDownRight className="h-4 w-4 mr-1" />
          <span className="text-xs">{Math.round(((current - previous) / previous) * 100)}%</span>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i}><CardContent className="p-6"><div className="animate-pulse space-y-3"><div className="h-4 bg-muted rounded w-1/2" /><div className="h-8 bg-muted rounded w-3/4" /><div className="h-2 bg-muted rounded" /></div></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeIn}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h2 className="text-xl font-bold">{departmentName} Department</h2>
          <p className="text-sm text-muted-foreground">Production data and performance metrics</p>
        </div>
        <div className="mt-3 sm:mt-0">
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
      </div>
      
      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="operators">Operators</TabsTrigger>
          <TabsTrigger value="machines">Machines</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          {/* Department KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Production</CardTitle>
                  <Activity className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-bold">{departmentData.production.current}/{departmentData.production.target}</span>
                  {getTrendIndicator(departmentData.production.current, departmentData.production.previousPeriod)}
                </div>
                <Progress 
                  value={Math.min(100, (departmentData.production.current / departmentData.production.target) * 100)} 
                  className="h-2" 
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {departmentData.production.efficiency}% of daily target
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Quality</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-bold">{departmentData.quality.inspectionPassed}%</span>
                  <div className="flex items-center text-emerald-600">
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    <span className="text-xs">+0.5%</span>
                  </div>
                </div>
                <Progress 
                  value={departmentData.quality.inspectionPassed} 
                  className="h-2" 
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Defect rate: {departmentData.quality.defectRate}%
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Workforce</CardTitle>
                  <Users className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-bold">{departmentData.workforce.presentToday}/{departmentData.workforce.totalOperators}</span>
                  <div className="flex items-center text-rose-600">
                    <ArrowDownRight className="h-4 w-4 mr-1" />
                    <span className="text-xs">-2</span>
                  </div>
                </div>
                <Progress 
                  value={(departmentData.workforce.presentToday / departmentData.workforce.totalOperators) * 100} 
                  className="h-2" 
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {departmentData.workforce.efficiency}% operator efficiency
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Equipment</CardTitle>
                  <Settings className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-2xl font-bold">{departmentData.equipment.activeMachines}/{departmentData.equipment.totalMachines}</span>
                  <div className="flex items-center text-rose-600">
                    <ArrowDownRight className="h-4 w-4 mr-1" />
                    <span className="text-xs">-1</span>
                  </div>
                </div>
                <Progress 
                  value={(departmentData.equipment.activeMachines / departmentData.equipment.totalMachines) * 100} 
                  className="h-2" 
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {departmentData.equipment.downtime} mins total downtime
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Hourly Production Tracking */}
          <Card>
            <CardHeader>
              <CardTitle>Hourly Production Tracking</CardTitle>
              <CardDescription>Production output for {departmentName} department today</CardDescription>
            </CardHeader>
            <CardContent>
              <TremorCard>
                <AreaChart
                  className="h-72"
                  data={hourlyData}
                  index="hour"
                  categories={["production", "target"]}
                  colors={["blue", "gray"]}
                  valueFormatter={(value) => `${value} units`}
                  showAnimation={true}
                />
              </TremorCard>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div className="flex flex-col items-center bg-blue-50 p-3 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium">HOURLY TARGET</p>
                  <p className="text-xl font-bold">{departmentData.production.hourlyTarget}</p>
                  <p className="text-xs text-muted-foreground">units / hour</p>
                </div>
                <div className="flex flex-col items-center bg-green-50 p-3 rounded-lg">
                  <p className="text-xs text-green-600 font-medium">CURRENT HOURLY RATE</p>
                  <p className="text-xl font-bold">{departmentData.production.hourlyActual}</p>
                  <p className="text-xs text-muted-foreground">units / hour</p>
                </div>
                <div className="flex flex-col items-center bg-amber-50 p-3 rounded-lg">
                  <p className="text-xs text-amber-600 font-medium">EFFICIENCY</p>
                  <p className="text-xl font-bold">{Math.round((departmentData.production.hourlyActual / departmentData.production.hourlyTarget) * 100)}%</p>
                  <p className="text-xs text-muted-foreground">vs target</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Department Bottlenecks */}
          <Card>
            <CardHeader>
              <CardTitle>Production Bottlenecks</CardTitle>
              <CardDescription>Current issues affecting production output</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {departmentData.bottlenecks.map((bottleneck, index) => (
                  <div key={index} className="flex items-center">
                    <div className={`h-2 w-2 rounded-full mr-2 ${
                      bottleneck.status === 'critical' ? 'bg-red-500' : 
                      bottleneck.status === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                    }`}></div>
                    <div className="flex-1">{bottleneck.issue}</div>
                    <div className="w-32">
                      <div className="flex items-center">
                        <div className="flex-1 mr-2">
                          <Progress 
                            value={bottleneck.impact} 
                            className={`h-2 ${
                              bottleneck.status === 'critical' ? 'bg-red-100' : 
                              bottleneck.status === 'medium' ? 'bg-amber-100' : 'bg-blue-100'
                            }`} 
                          />
                        </div>
                        <span className="text-xs text-gray-600">{bottleneck.impact}%</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="ml-2">Resolve</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="operators" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Operators Performance</CardTitle>
              <CardDescription>Current shift operators and productivity metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="grid grid-cols-12 gap-4 py-3 px-4 bg-muted/50 font-medium text-sm">
                  <div className="col-span-3">Operator</div>
                  <div className="col-span-2">Position</div>
                  <div className="col-span-2">Shift</div>
                  <div className="col-span-2">Efficiency</div>
                  <div className="col-span-2">Production</div>
                  <div className="col-span-1">Status</div>
                </div>
                {operatorsData.map((operator) => (
                  <div key={operator.id} className="grid grid-cols-12 gap-4 py-3 px-4 border-t items-center text-sm">
                    <div className="col-span-3 font-medium">{operator.name}</div>
                    <div className="col-span-2">{operator.position}</div>
                    <div className="col-span-2">{operator.shift}</div>
                    <div className="col-span-2">
                      <div className="flex items-center">
                        <Progress 
                          value={operator.efficiency} 
                          className="h-2 w-16 mr-2"
                        />
                        <span>{operator.efficiency}%</span>
                      </div>
                    </div>
                    <div className="col-span-2">{operator.production} units</div>
                    <div className="col-span-1">
                      <div className="flex items-center">
                        <span className={`h-2 w-2 rounded-full mr-1.5 ${getStatusColor(operator.status)}`}></span>
                        <span className="capitalize">{operator.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Efficiency Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-72"
                    data={operatorsData}
                    index="name"
                    categories={["efficiency"]}
                    colors={["indigo"]}
                    valueFormatter={(value) => `${value}%`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Production Output</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-72"
                    data={operatorsData}
                    index="name"
                    categories={["production"]}
                    colors={["emerald"]}
                    valueFormatter={(value) => `${value} units`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="machines" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Machine Status</CardTitle>
              <CardDescription>Current equipment status and performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="grid grid-cols-12 gap-4 py-3 px-4 bg-muted/50 font-medium text-sm">
                  <div className="col-span-3">Machine</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Efficiency</div>
                  <div className="col-span-2">Runtime (hrs)</div>
                  <div className="col-span-2">Downtime (mins)</div>
                  <div className="col-span-1">Actions</div>
                </div>
                {machinesData.map((machine) => (
                  <div key={machine.id} className="grid grid-cols-12 gap-4 py-3 px-4 border-t items-center text-sm">
                    <div className="col-span-3 font-medium">{machine.name}</div>
                    <div className="col-span-2">
                      <div className="flex items-center">
                        <span className={`h-2 w-2 rounded-full mr-1.5 ${getStatusColor(machine.status)}`}></span>
                        <span className="capitalize">{machine.status}</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center">
                        <Progress 
                          value={machine.efficiency} 
                          className="h-2 w-16 mr-2"
                        />
                        <span>{machine.efficiency}%</span>
                      </div>
                    </div>
                    <div className="col-span-2">{machine.runtime}</div>
                    <div className="col-span-2">{machine.downtime}</div>
                    <div className="col-span-1">
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Machine Efficiency</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-72"
                    data={machinesData.filter(m => m.status !== 'maintenance')}
                    index="name"
                    categories={["efficiency"]}
                    colors={["blue"]}
                    valueFormatter={(value) => `${value}%`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Machine Downtime</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <BarChart
                    className="h-72"
                    data={machinesData}
                    index="name"
                    categories={["downtime"]}
                    colors={["rose"]}
                    valueFormatter={(value) => `${value} mins`}
                    showAnimation={true}
                  />
                </TremorCard>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Production Efficiency Trends</CardTitle>
              <CardDescription>Historical efficiency data for the {departmentName} department</CardDescription>
            </CardHeader>
            <CardContent>
              <TremorCard>
                <LineChart
                  className="h-80"
                  data={[
                    { date: "Jan", efficiency: 82 },
                    { date: "Feb", efficiency: 84 },
                    { date: "Mar", efficiency: 88 },
                    { date: "Apr", efficiency: 86 },
                    { date: "May", efficiency: 89 },
                    { date: "Jun", efficiency: 91 },
                  ]}
                  index="date"
                  categories={["efficiency"]}
                  colors={["emerald"]}
                  valueFormatter={(value) => `${value}%`}
                  showAnimation={true}
                  curveType="monotone"
                />
              </TremorCard>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Productivity Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-amber-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-amber-900">Peak Production Time</p>
                    <p className="text-xl font-bold text-amber-800">10:00 - 11:00 AM</p>
                  </div>
                  <Clock className="h-8 w-8 text-amber-500" />
                </div>
                
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-green-900">Optimal Batch Size</p>
                    <p className="text-xl font-bold text-green-800">150 Units</p>
                  </div>
                  <Zap className="h-8 w-8 text-green-500" />
                </div>
                
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-blue-900">Ideal Workstation Config</p>
                    <p className="text-xl font-bold text-blue-800">Type B + Operator Pairing</p>
                  </div>
                  <Settings className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>AI Production Forecasting</CardTitle>
              </CardHeader>
              <CardContent>
                <TremorCard>
                  <LineChart
                    className="h-72"
                    data={[
                      { date: "Jun 1", actual: 1250, predicted: 1290 },
                      { date: "Jun 2", actual: 1180, predicted: 1210 },
                      { date: "Jun 3", actual: 1320, predicted: 1300 },
                      { date: "Jun 4", actual: 1270, predicted: 1280 },
                      { date: "Jun 5", actual: 1310, predicted: 1320 },
                      { date: "Jun 6", actual: null, predicted: 1350 },
                      { date: "Jun 7", actual: null, predicted: 1380 },
                    ]}
                    index="date"
                    categories={["actual", "predicted"]}
                    colors={["blue", "indigo"]}
                    valueFormatter={(value) => value ? `${value} units` : "No data"}
                    showAnimation={true}
                    connectNulls={true}
                  />
                </TremorCard>
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium">AI Production Insight</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Based on current trends and historical data, the {departmentName} department is predicted to achieve 98% of monthly target. Consider optimizing machine setup times to improve overall capacity.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default DepartmentProductionView;