import { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import EmployeeManagement from "@/components/hr/employee-management";
import Attendance from "@/components/hr/attendance";
import Payroll from "@/components/hr/payroll";
import Leave from "@/components/hr/leave";
import Allowances from "@/components/hr/allowances";
import Documents from "@/components/hr/documents";
import Analytics from "@/components/hr/analytics";

import { 
  Users, 
  Wallet, 
  UserCheck, 
  CalendarDays, 
  Calculator, 
  FileText, 
  BarChart4,
  ArrowRight,
  Building2,
  UserCog,
  Info
} from "lucide-react";

const containerAnimation = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemAnimation = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.5
    }
  }
};

export default function HRDashboard() {
  const [activeModule, setActiveModule] = useState("overview");
  
  const { data: employeesData, isLoading: employeesLoading } = useQuery<any[]>({
    queryKey: ['/api/hr/employees'],
  });

  const { data: departmentsData, isLoading: departmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/hr/departments'],
  });

  const { data: designationsData, isLoading: designationsLoading } = useQuery<any[]>({
    queryKey: ['/api/hr/designations'],
  });

  const isLoading = employeesLoading || departmentsLoading || designationsLoading;

  const employees = employeesData || [];
  const departments = departmentsData || [];
  const designations = designationsData || [];

  const activeEmployees = employees.filter((e: any) => e.isActive !== false);
  const activeDepartments = departments.filter((d: any) => d.isActive !== false);

  const hrModules = [
    { id: "employees", name: "Employee Management", icon: <Users className="h-5 w-5" />, component: <EmployeeManagement /> },
    { id: "attendance", name: "Attendance", icon: <UserCheck className="h-5 w-5" />, component: <Attendance /> },
    { id: "payroll", name: "Payroll", icon: <Wallet className="h-5 w-5" />, component: <Payroll /> },
    { id: "leave", name: "Leave Management", icon: <CalendarDays className="h-5 w-5" />, component: <Leave /> },
    { id: "allowances", name: "Allowances", icon: <Calculator className="h-5 w-5" />, component: <Allowances /> },
    { id: "documents", name: "Documents", icon: <FileText className="h-5 w-5" />, component: <Documents /> },
    { id: "analytics", name: "HR Analytics", icon: <BarChart4 className="h-5 w-5" />, component: <Analytics /> }
  ];
  
  const hrKPIs = [
    { id: "headcount", name: "Total Employees", value: activeEmployees.length.toLocaleString(), change: "", changeType: "neutral" },
    { id: "departments", name: "Departments", value: activeDepartments.length.toLocaleString(), change: "", changeType: "neutral" },
    { id: "designations", name: "Designations", value: designations.length.toLocaleString(), change: "", changeType: "neutral" },
    { id: "inactive", name: "Inactive Employees", value: employees.filter((e: any) => e.isActive === false).length.toLocaleString(), change: "", changeType: "neutral" },
  ];
  
  const hrStats = [
    { id: "departments", name: "Departments", value: activeDepartments.length.toLocaleString(), icon: <Building2 className="h-5 w-5 text-blue-500" /> },
    { id: "positions", name: "Designations", value: designations.length.toLocaleString(), icon: <UserCog className="h-5 w-5 text-green-500" /> },
    { id: "active", name: "Active Employees", value: activeEmployees.length.toLocaleString(), icon: <Users className="h-5 w-5 text-purple-500" /> },
    { id: "total", name: "Total Records", value: employees.length.toLocaleString(), icon: <Info className="h-5 w-5 text-amber-500" /> },
  ];
  
  const renderContent = () => {
    if (activeModule === "overview") {
      return (
        <motion.div
          variants={containerAnimation}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          <motion.div variants={itemAnimation} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))
            ) : (
              hrKPIs.map((kpi) => (
                <Card key={kpi.id}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col">
                      <span className="text-sm text-muted-foreground">{kpi.name}</span>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-bold">{kpi.value}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </motion.div>
          
          <motion.div variants={itemAnimation} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="col-span-1 md:col-span-2">
              <CardHeader>
                <CardTitle>HR Modules</CardTitle>
                <CardDescription>
                  Access and manage HR modules for employee, attendance, payroll, and more
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {hrModules.map((module) => (
                    <div 
                      key={module.id}
                      className="p-4 border rounded-md hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors"
                      onClick={() => setActiveModule(module.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 border rounded-full bg-muted">
                            {module.icon}
                          </div>
                          <div>
                            <h3 className="font-medium">{module.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              Manage {module.name.toLowerCase()}
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Recent Activities</CardTitle>
                <CardDescription>
                  Latest HR activities and updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No recent activity</p>
                  <p className="text-xs text-muted-foreground mt-1">Activity tracking not configured</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div variants={itemAnimation} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))
            ) : (
              hrStats.map((stat) => (
                <Card key={stat.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{stat.name}</span>
                      {stat.icon}
                    </div>
                    <div className="mt-2">
                      <span className="text-2xl font-bold">{stat.value}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </motion.div>
        </motion.div>
      );
    }
    
    const selectedModule = hrModules.find(m => m.id === activeModule);
    return selectedModule ? selectedModule.component : null;
  };
  
  return (
    <DashboardContainer 
      title={activeModule === "overview" ? "HR & Payroll" : hrModules.find(m => m.id === activeModule)?.name || "HR & Payroll"}
      subtitle={activeModule === "overview" 
        ? "Manage human resources, attendance, payroll, and employee benefits" 
        : `Manage ${hrModules.find(m => m.id === activeModule)?.name.toLowerCase() || "human resources"}`
      }
      actions={
        activeModule !== "overview" ? (
          <Button variant="outline" onClick={() => setActiveModule("overview")}>
            Back to Overview
          </Button>
        ) : undefined
      }
    >
      {renderContent()}
    </DashboardContainer>
  );
}
