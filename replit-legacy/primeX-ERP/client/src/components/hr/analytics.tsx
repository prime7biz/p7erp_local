import { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { 
  Users, 
  UserCheck,
  Clock,
  Activity,
  ArrowUpRight,
  Download,
  Printer,
  Building2,
  Info,
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

export default function Analytics() {
  const [timePeriod, setTimePeriod] = useState("month");
  const [department, setDepartment] = useState("all");
  
  const { data: employeesData, isLoading: empLoading } = useQuery<any[]>({
    queryKey: ['/api/hr/employees'],
  });

  const { data: departmentsData, isLoading: deptLoading } = useQuery<any[]>({
    queryKey: ['/api/hr/departments'],
  });

  const isLoading = empLoading || deptLoading;
  const employees = employeesData || [];
  const departments = departmentsData || [];

  const activeEmployees = employees.filter((e: any) => e.isActive !== false);
  const activeDepartments = departments.filter((d: any) => d.isActive !== false);

  const deptCounts: Record<string, number> = {};
  activeEmployees.forEach((e: any) => {
    const dept = e.departmentName || e.department || "Unassigned";
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  const headcountByDepartment = Object.entries(deptCounts)
    .map(([deptName, count]) => ({
      department: deptName,
      employees: count,
      percentage: activeEmployees.length > 0 ? Math.round((count / activeEmployees.length) * 100 * 10) / 10 : 0,
    }))
    .sort((a, b) => b.employees - a.employees);

  const genderCounts: Record<string, number> = {};
  activeEmployees.forEach((e: any) => {
    const gender = (e.gender || "Unknown").toLowerCase();
    genderCounts[gender] = (genderCounts[gender] || 0) + 1;
  });
  const totalWithGender = Object.values(genderCounts).reduce((a, b) => a + b, 0);
  const malePercent = totalWithGender > 0 ? Math.round(((genderCounts['male'] || 0) / totalWithGender) * 100 * 10) / 10 : 0;
  const femalePercent = totalWithGender > 0 ? Math.round(((genderCounts['female'] || 0) / totalWithGender) * 100 * 10) / 10 : 0;
  
  return (
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemAnimation} className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">HR Analytics Dashboard</h2>
          <Badge variant="outline" className="bg-blue-50 text-blue-700">Live Data</Badge>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {activeDepartments.map((dept: any) => (
                <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          
          <Button variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
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
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Total Employees</span>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl font-bold">{activeEmployees.length}</span>
                    </div>
                  </div>
                  <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-700" />
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between text-xs text-muted-foreground mb-2">
                    <span>Active: {activeEmployees.length}</span>
                    <span>Inactive: {employees.length - activeEmployees.length}</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: employees.length > 0 ? `${(activeEmployees.length / employees.length) * 100}%` : '0%' }}></div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Attendance Rate</span>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl font-bold">—</span>
                    </div>
                  </div>
                  <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                    <UserCheck className="h-5 w-5 text-green-700" />
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">Not tracked</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Turnover Rate</span>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl font-bold">—</span>
                    </div>
                  </div>
                  <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <Activity className="h-5 w-5 text-amber-700" />
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">Not tracked</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Overtime Hours</span>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl font-bold">—</span>
                    </div>
                  </div>
                  <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <Clock className="h-5 w-5 text-purple-700" />
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">Not tracked</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>
      
      <motion.div variants={itemAnimation}>
        <Card>
          <CardHeader>
            <CardTitle>Workforce Analytics</CardTitle>
            <CardDescription>
              Key metrics and trends for workforce management
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : activeEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Info className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">No employee data yet</p>
                <p className="text-sm mt-1">Add employees to see workforce analytics</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Department Distribution</h3>
                  
                  <div className="rounded-md border p-4 h-64 grid content-center">
                    {headcountByDepartment.length > 0 ? (
                      <div className="space-y-3">
                        {headcountByDepartment.slice(0, 5).map((dept, i) => (
                          <div key={i}>
                            <div className="flex justify-between text-sm mb-1">
                              <span>{dept.department}</span>
                              <span>{dept.employees} ({dept.percentage}%)</span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full rounded-full" 
                                style={{ 
                                  width: `${dept.percentage}%`,
                                  backgroundColor: i === 0 ? '#3b82f6' : 
                                                 i === 1 ? '#10b981' : 
                                                 i === 2 ? '#f59e0b' : 
                                                 i === 3 ? '#8b5cf6' : '#ef4444'
                                }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center">No department assignments</p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border rounded-md">
                      <div className="text-xs text-muted-foreground">Gender Ratio</div>
                      <div className="mt-1 flex items-center justify-between">
                        {totalWithGender > 0 ? (
                          <>
                            <span className="text-sm font-medium">{malePercent}% Male</span>
                            <span className="text-xs">|</span>
                            <span className="text-sm font-medium">{femalePercent}% Female</span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="p-3 border rounded-md">
                      <div className="text-xs text-muted-foreground">Avg. Tenure</div>
                      <div className="mt-1">
                        <span className="text-sm text-muted-foreground">—</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Key Metrics</h3>
                  
                  <div className="rounded-md border p-4 h-64 grid content-center">
                    <div className="space-y-4">
                      <div className="p-3 bg-blue-50 rounded-md">
                        <div className="text-xs text-muted-foreground">Total Headcount</div>
                        <div className="text-xl font-bold mt-1">{activeEmployees.length}</div>
                      </div>
                      <div className="p-3 bg-green-50 rounded-md">
                        <div className="text-xs text-muted-foreground">Departments</div>
                        <div className="text-xl font-bold mt-1">{activeDepartments.length}</div>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-md">
                        <div className="text-xs text-muted-foreground">Employment Types</div>
                        <div className="text-xl font-bold mt-1">
                          {new Set(activeEmployees.map((e: any) => e.employmentType || "Full-time")).size}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Tracking Status</h3>
                  
                  <div className="rounded-md border p-4 h-64 grid content-center">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2 border rounded-md">
                        <span className="text-sm">Attendance Tracking</span>
                        <Badge variant="outline" className="bg-gray-100 text-gray-600">Not configured</Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 border rounded-md">
                        <span className="text-sm">Performance Reviews</span>
                        <Badge variant="outline" className="bg-gray-100 text-gray-600">Not configured</Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 border rounded-md">
                        <span className="text-sm">Turnover Tracking</span>
                        <Badge variant="outline" className="bg-gray-100 text-gray-600">Not configured</Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 border rounded-md">
                        <span className="text-sm">Training Hours</span>
                        <Badge variant="outline" className="bg-gray-100 text-gray-600">Not configured</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
