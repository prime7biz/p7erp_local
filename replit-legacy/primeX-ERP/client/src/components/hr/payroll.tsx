import { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

import { 
  Wallet,
  CalendarDays, 
  Calculator,
  FileCheck,
  BarChart4,
  Info,
  Users,
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

export default function Payroll() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const { data: employeesData, isLoading } = useQuery<any[]>({
    queryKey: ['/api/hr/employees'],
  });

  const employees = employeesData || [];
  const activeEmployees = employees.filter((e: any) => e.isActive !== false);

  const employeesWithSalary = activeEmployees.filter((e: any) => e.salary && parseFloat(e.salary) > 0);
  const totalSalary = employeesWithSalary.reduce((sum: number, e: any) => sum + parseFloat(e.salary || '0'), 0);
  const avgSalary = employeesWithSalary.length > 0 ? totalSalary / employeesWithSalary.length : 0;
  
  return (
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-4">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart4 className="h-4 w-4" />
            <span>Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span>Payroll History</span>
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            <span>Salary Adjustments</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            <span>Reports</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard">
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
                      <Skeleton className="h-8 w-20" />
                    </CardContent>
                  </Card>
                ))
              ) : (
                <>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-muted-foreground">Active Employees</div>
                          <div className="text-2xl font-bold mt-1">{activeEmployees.length}</div>
                        </div>
                        <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-700" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-muted-foreground">With Salary Data</div>
                          <div className="text-2xl font-bold mt-1">{employeesWithSalary.length}</div>
                        </div>
                        <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                          <Wallet className="h-5 w-5 text-green-700" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-muted-foreground">Avg. Salary</div>
                          <div className="text-2xl font-bold mt-1">
                            {avgSalary > 0 ? `BDT ${Math.round(avgSalary).toLocaleString()}` : '—'}
                          </div>
                        </div>
                        <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <Calculator className="h-5 w-5 text-purple-700" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-muted-foreground">Payroll Runs</div>
                          <div className="text-2xl font-bold mt-1">—</div>
                        </div>
                        <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center">
                          <CalendarDays className="h-5 w-5 text-amber-700" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </motion.div>

            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Payroll Processing</CardTitle>
                  <CardDescription>
                    Monthly payroll processing and management
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Wallet className="h-8 w-8 opacity-50" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">Payroll processing not configured</h3>
                    <p className="text-sm text-center max-w-md">
                      Payroll processing requires salary structures, deduction rules, and payment method setup.
                      Contact your system administrator to configure payroll.
                    </p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-lg">
                      <div className="p-3 border rounded-md text-center">
                        <div className="text-xs text-muted-foreground">Salary Structures</div>
                        <div className="text-sm font-medium mt-1">Not configured</div>
                      </div>
                      <div className="p-3 border rounded-md text-center">
                        <div className="text-xs text-muted-foreground">Tax Rules</div>
                        <div className="text-sm font-medium mt-1">Not set up</div>
                      </div>
                      <div className="p-3 border rounded-md text-center">
                        <div className="text-xs text-muted-foreground">Payment Methods</div>
                        <div className="text-sm font-medium mt-1">Not configured</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="history">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Payroll History</CardTitle>
                <CardDescription>
                  Past payroll runs and disbursement records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No payroll history available</p>
                  <p className="text-xs mt-1">Process your first payroll to see history</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="adjustments">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Salary Adjustments</CardTitle>
                <CardDescription>
                  Manage salary increments, deductions, and bonuses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No salary adjustments recorded</p>
                  <p className="text-xs mt-1">Configure payroll to manage salary adjustments</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="reports">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Payroll Reports</CardTitle>
                <CardDescription>
                  Generate and view payroll reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No payroll reports available</p>
                  <p className="text-xs mt-1">Process payroll to generate reports</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
