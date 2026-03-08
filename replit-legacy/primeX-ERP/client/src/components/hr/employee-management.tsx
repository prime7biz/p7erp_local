import React, { useState } from 'react';
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from 'date-fns';
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";

import { 
  UserPlus,
  Search, 
  Filter,
  Download, 
  Upload, 
  Printer,
  Eye, 
  Edit, 
  Trash2,
  CalendarDays, 
  FileText, 
  MoreHorizontal, 
  User,
  Users,
  Mail,
  Phone,
  Briefcase,
  Building,
  GraduationCap,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  BarChart4,
  CheckCircle2,
  X,
  AlertCircle,
  FileUp,
  PlusCircle,
  ChevronRight,
  FileCheck,
  Loader2,
  Pencil,
  Contact,
  School,
  Building2,
  UserCheck
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const employeeFormSchema = z.object({
  employeeId: z.string().optional(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  gender: z.string().min(1, "Gender is required"),
  dateOfBirth: z.date({
    required_error: "Date of birth is required",
  }),
  joiningDate: z.date({
    required_error: "Joining date is required",
  }),
  departmentId: z.string().min(1, "Department is required"),
  designationId: z.string().min(1, "Designation is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal('')),
  phone: z.string().min(1, "Phone number is required"),
  address: z.string().optional(),
  nidNumber: z.string().min(1, "NID number is required"),
  emergencyContact: z.string().optional(),
  bloodGroup: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  basicSalary: z.string().min(1, "Basic salary is required"),
  isActive: z.boolean().default(true),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

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

export default function EmployeeManagement() {
  const [activeTab, setActiveTab] = useState("employees");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterDesignation, setFilterDesignation] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [isViewEmployeeOpen, setIsViewEmployeeOpen] = useState(false);
  const [isEditEmployeeOpen, setIsEditEmployeeOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [isAddDesigOpen, setIsAddDesigOpen] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [deptDescription, setDeptDescription] = useState("");
  const [desigName, setDesigName] = useState("");
  const [desigLevel, setDesigLevel] = useState("");

  const { toast } = useToast();

  const { data: departmentsData = [], isLoading: loadingDepts } = useQuery({
    queryKey: ["/api/hr/departments"],
  });

  const { data: designationsData = [], isLoading: loadingDesigs } = useQuery({
    queryKey: ["/api/hr/designations"],
  });

  const { data: employeesData = [], isLoading: loadingEmps } = useQuery({
    queryKey: ["/api/hr/employees"],
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/hr/employees", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/employees"] });
      setIsAddEmployeeOpen(false);
      employeeForm.reset();
      toast({ title: "Employee created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create employee", description: error.message, variant: "destructive" });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest(`/api/hr/employees/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/employees"] });
      setIsEditEmployeeOpen(false);
      toast({ title: "Employee updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update employee", description: error.message, variant: "destructive" });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/hr/employees/${id}`, "DELETE");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/employees"] });
      toast({ title: "Employee deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete employee", description: error.message, variant: "destructive" });
    },
  });

  const createDepartmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/hr/departments", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/departments"] });
      setIsAddDeptOpen(false);
      setDeptName("");
      setDeptCode("");
      setDeptDescription("");
      toast({ title: "Department created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create department", description: error.message, variant: "destructive" });
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest(`/api/hr/departments/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/departments"] });
      toast({ title: "Department updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update department", description: error.message, variant: "destructive" });
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/hr/departments/${id}`, "DELETE");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/departments"] });
      toast({ title: "Department deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete department", description: error.message, variant: "destructive" });
    },
  });

  const createDesignationMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/hr/designations", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/designations"] });
      setIsAddDesigOpen(false);
      setDesigName("");
      setDesigLevel("");
      toast({ title: "Designation created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create designation", description: error.message, variant: "destructive" });
    },
  });

  const updateDesignationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest(`/api/hr/designations/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/designations"] });
      toast({ title: "Designation updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update designation", description: error.message, variant: "destructive" });
    },
  });

  const deleteDesignationMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/hr/designations/${id}`, "DELETE");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/designations"] });
      toast({ title: "Designation deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete designation", description: error.message, variant: "destructive" });
    },
  });

  const employeeForm = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      employeeId: "",
      firstName: "",
      lastName: "",
      gender: "",
      dateOfBirth: undefined,
      joiningDate: undefined,
      departmentId: "",
      designationId: "",
      email: "",
      phone: "",
      address: "",
      nidNumber: "",
      emergencyContact: "",
      bloodGroup: "",
      bankAccount: "",
      bankName: "",
      basicSalary: "",
      isActive: true,
    }
  });
  
  const employees = employeesData as any[];
  const departments = departmentsData as any[];
  const designations = designationsData as any[];

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = searchQuery === "" || 
      employee.employeeId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.phone?.includes(searchQuery);
    
    const matchesDepartment = filterDepartment === "all" || 
      employee.departmentId?.toString() === filterDepartment;
    
    const matchesDesignation = filterDesignation === "all" || 
      employee.designationId?.toString() === filterDesignation;
    
    const matchesStatus = filterStatus === "all" || 
      (filterStatus === "active" && employee.isActive) || 
      (filterStatus === "inactive" && !employee.isActive);
    
    return matchesSearch && matchesDepartment && matchesDesignation && matchesStatus;
  });
  
  const departmentStats = departments.map((dept: any) => {
    const count = employees.filter((emp: any) => emp.departmentId === dept.id).length;
    const total = employees.length || 1;
    return {
      id: dept.id,
      name: dept.name,
      count,
      percentage: Math.round((count / total) * 100)
    };
  }).sort((a: any, b: any) => b.count - a.count);
  
  const onAddEmployeeSubmit = (data: EmployeeFormValues) => {
    createEmployeeMutation.mutate({
      firstName: data.firstName,
      lastName: data.lastName,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth ? format(data.dateOfBirth, "yyyy-MM-dd") : undefined,
      joinDate: format(data.joiningDate, "yyyy-MM-dd"),
      departmentId: data.departmentId ? parseInt(data.departmentId) : undefined,
      designationId: data.designationId ? parseInt(data.designationId) : undefined,
      email: data.email || undefined,
      phone: data.phone,
      address: data.address || undefined,
      nationalId: data.nidNumber,
      emergencyContactPhone: data.emergencyContact || undefined,
      salary: data.basicSalary || undefined,
      bankAccount: data.bankAccount || undefined,
      isActive: data.isActive,
    });
  };
  
  const onEditEmployeeSubmit = (data: EmployeeFormValues) => {
    if (!selectedEmployee) return;
    updateEmployeeMutation.mutate({
      id: selectedEmployee.id,
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? format(data.dateOfBirth, "yyyy-MM-dd") : undefined,
        joinDate: format(data.joiningDate, "yyyy-MM-dd"),
        departmentId: data.departmentId ? parseInt(data.departmentId) : undefined,
        designationId: data.designationId ? parseInt(data.designationId) : undefined,
        email: data.email || undefined,
        phone: data.phone,
        address: data.address || undefined,
        nationalId: data.nidNumber,
        emergencyContactPhone: data.emergencyContact || undefined,
        salary: data.basicSalary || undefined,
        bankAccount: data.bankAccount || undefined,
        isActive: data.isActive,
      },
    });
  };
  
  const handleViewEmployee = (employee: any) => {
    setSelectedEmployee(employee);
    setIsViewEmployeeOpen(true);
  };
  
  const handleEditEmployee = (employee: any) => {
    setSelectedEmployee(employee);
    
    employeeForm.reset({
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      gender: employee.gender?.toLowerCase() || "",
      dateOfBirth: employee.dateOfBirth ? new Date(employee.dateOfBirth) : undefined,
      joiningDate: employee.joinDate ? new Date(employee.joinDate) : undefined,
      departmentId: employee.departmentId?.toString() || "",
      designationId: employee.designationId?.toString() || "",
      email: employee.email || "",
      phone: employee.phone || "",
      address: employee.address || "",
      nidNumber: employee.nationalId || "",
      emergencyContact: employee.emergencyContactPhone || "",
      bloodGroup: "",
      bankAccount: employee.bankAccount || "",
      bankName: "",
      basicSalary: employee.salary?.toString() || "",
      isActive: employee.isActive ?? true,
    });
    
    setIsEditEmployeeOpen(true);
  };
  
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "dd MMM yyyy");
    } catch {
      return "N/A";
    }
  };
  
  const getDepartmentName = (departmentId: number | string) => {
    const dept = departments.find((d: any) => d.id === departmentId || d.id?.toString() === departmentId?.toString());
    return dept ? dept.name : "";
  };
  
  const getDesignationName = (designationId: number | string) => {
    const desig = designations.find((d: any) => d.id === designationId || d.id?.toString() === designationId?.toString());
    return desig ? desig.name : "";
  };

  if (loadingEmps || loadingDepts || loadingDesigs) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading employee data...</span>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="employees" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Employees</span>
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span>Departments</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart4 className="h-4 w-4" />
            <span>Analytics</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="employees">
          <motion.div 
            variants={containerAnimation}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <motion.div variants={itemAnimation} className="flex flex-col sm:flex-row justify-between gap-4">
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employees..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept: any) => (
                      <SelectItem key={dept.id} value={dept.id.toString()}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterDesignation} onValueChange={setFilterDesignation}>
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue placeholder="Designation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Designations</SelectItem>
                    {designations.map((desig: any) => (
                      <SelectItem key={desig.id} value={desig.id.toString()}>
                        {desig.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { employeeForm.reset(); setIsAddEmployeeOpen(true); }}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Employee
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <FileText className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsExportDialogOpen(true)}>
                      <Download className="mr-2 h-4 w-4" />
                      Export to Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Printer className="mr-2 h-4 w-4" />
                      Print Employee List
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </div>
            </motion.div>
            
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Employee List</CardTitle>
                  <CardDescription>
                    Manage your employees and their information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Joining Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((employee: any) => (
                        <TableRow key={employee.id}>
                          <TableCell>{employee.employeeId}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar>
                                <AvatarFallback>
                                  {employee.firstName?.charAt(0)}{employee.lastName?.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{employee.firstName} {employee.lastName}</div>
                                <div className="text-xs text-muted-foreground">{employee.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{employee.departmentName || getDepartmentName(employee.departmentId)}</TableCell>
                          <TableCell>{employee.designationName || getDesignationName(employee.designationId)}</TableCell>
                          <TableCell>{employee.phone}</TableCell>
                          <TableCell>{formatDate(employee.joinDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={employee.isActive 
                              ? "bg-green-100 text-green-800 hover:bg-green-100" 
                              : "bg-red-100 text-red-800 hover:bg-red-100"}>
                              {employee.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleViewEmployee(employee)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditEmployee(employee)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit Employee
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <FileText className="mr-2 h-4 w-4" />
                                  Generate ID Card
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Printer className="mr-2 h-4 w-4" />
                                  Print Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-red-600"
                                  onClick={() => deleteEmployeeMutation.mutate(employee.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                      
                      {filteredEmployees.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                            No employees found matching your filters
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
            
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Department Summary</CardTitle>
                  <CardDescription>
                    Employee distribution across departments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      {departmentStats.slice(0, 5).map((dept: any) => (
                        <div key={dept.id}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{dept.name}</span>
                            <span>{dept.count} ({dept.percentage}%)</span>
                          </div>
                          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full" 
                              style={{ width: `${dept.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-4">
                      <div className="p-4 border rounded-md">
                        <div className="text-sm text-muted-foreground">Total Employees</div>
                        <div className="text-2xl font-bold mt-1">{employees.length}</div>
                        
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground">Active</div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-sm font-medium">{employees.filter((e: any) => e.isActive).length}</span>
                              <span className="text-xs">{employees.length > 0 ? Math.round(employees.filter((e: any) => e.isActive).length / employees.length * 100) : 0}%</span>
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground">Inactive</div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-sm font-medium">{employees.filter((e: any) => !e.isActive).length}</span>
                              <span className="text-xs">{employees.length > 0 ? Math.round(employees.filter((e: any) => !e.isActive).length / employees.length * 100) : 0}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 border rounded-md">
                        <div className="text-sm text-muted-foreground">Gender Distribution</div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            <span className="text-sm">Male</span>
                          </div>
                          <span className="text-sm font-medium">
                            {employees.length > 0 ? Math.round(employees.filter((e: any) => e.gender?.toLowerCase() === "male").length / employees.length * 100) : 0}%
                          </span>
                        </div>
                        
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                            <span className="text-sm">Female</span>
                          </div>
                          <span className="text-sm font-medium">
                            {employees.length > 0 ? Math.round(employees.filter((e: any) => e.gender?.toLowerCase() === "female").length / employees.length * 100) : 0}%
                          </span>
                        </div>
                        
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mt-2">
                          <div 
                            className="h-full bg-blue-500 rounded-full" 
                            style={{ width: `${employees.length > 0 ? Math.round(employees.filter((e: any) => e.gender?.toLowerCase() === "male").length / employees.length * 100) : 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="departments">
          <motion.div 
            variants={containerAnimation}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <motion.div variants={itemAnimation} className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Department Structure</h2>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsAddDeptOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Department
                </Button>
                
                <Button variant="outline" onClick={() => setIsAddDesigOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Designation
                </Button>
              </div>
            </motion.div>
            
            <motion.div variants={itemAnimation} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {departments.slice(0, 6).map((dept: any) => {
                const deptEmployees = employees.filter((emp: any) => emp.departmentId === dept.id);
                
                return (
                  <Card key={dept.id}>
                    <CardHeader className="pb-2">
                      <CardTitle>{dept.name}</CardTitle>
                      <CardDescription>
                        {deptEmployees.length} employees
                        {dept.code && ` · ${dept.code}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {dept.description && (
                          <p className="text-sm text-muted-foreground">{dept.description}</p>
                        )}
                        
                        <div className="flex items-center justify-between p-2 border rounded-md">
                          <span className="text-sm">Employees</span>
                          <Badge>{deptEmployees.length}</Badge>
                        </div>
                        
                        <Button variant="ghost" size="sm" className="w-full mt-2">
                          <ChevronRight className="h-4 w-4" />
                          <span>View All</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </motion.div>
            
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Organizational Chart</CardTitle>
                  <CardDescription>
                    Company hierarchy and reporting structure
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Building className="h-16 w-16 mx-auto opacity-20 mb-4" />
                    <p>Organizational chart visualization will appear here</p>
                    <p className="text-sm mt-2">This feature is under development</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="analytics">
          <motion.div 
            variants={containerAnimation}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <motion.div variants={itemAnimation} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Workforce Overview</CardTitle>
                  <CardDescription>
                    Summary of employee metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-3 border rounded-md">
                      <div className="flex justify-between">
                        <div className="text-sm text-muted-foreground">Headcount</div>
                        <Badge variant="outline" className="bg-blue-50 text-blue-800">Current Month</Badge>
                      </div>
                      <div className="text-2xl font-bold mt-1">{employees.length}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-green-600">Active: {employees.filter((e: any) => e.isActive).length}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Employee Retention Rate</span>
                        <span className="font-medium">{employees.length > 0 ? Math.round(employees.filter((e: any) => e.isActive).length / employees.length * 100) : 0}%</span>
                      </div>
                      <Progress value={employees.length > 0 ? Math.round(employees.filter((e: any) => e.isActive).length / employees.length * 100) : 0} className="h-2" />
                      
                      <div className="flex justify-between text-sm mt-3">
                        <span>Departments</span>
                        <span className="font-medium">{departments.length}</span>
                      </div>
                      <Progress value={Math.min(departments.length * 10, 100)} className="h-2" />
                    </div>
                    
                    <div className="pt-2 mt-2 border-t">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-muted-foreground">Departments</div>
                          <div className="text-lg font-medium mt-1">{departments.length}</div>
                        </div>
                        
                        <div>
                          <div className="text-xs text-muted-foreground">Designations</div>
                          <div className="text-lg font-medium mt-1">{designations.length}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Demographic Analysis</CardTitle>
                  <CardDescription>
                    Employee demographic breakdown
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium mb-2">Age Distribution</h3>
                      <div className="grid grid-cols-4 gap-1 mb-2">
                        <div className="h-16 bg-blue-100 rounded-md flex items-end">
                          <div className="w-full bg-blue-500 h-5 rounded-b-md"></div>
                        </div>
                        <div className="h-16 bg-blue-100 rounded-md flex items-end">
                          <div className="w-full bg-blue-500 h-10 rounded-b-md"></div>
                        </div>
                        <div className="h-16 bg-blue-100 rounded-md flex items-end">
                          <div className="w-full bg-blue-500 h-14 rounded-b-md"></div>
                        </div>
                        <div className="h-16 bg-blue-100 rounded-md flex items-end">
                          <div className="w-full bg-blue-500 h-7 rounded-b-md"></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-xs text-center text-muted-foreground">
                        <div>18-25</div>
                        <div>26-35</div>
                        <div>36-45</div>
                        <div>46+</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2 pt-2 mt-2 border-t">
                      <h3 className="text-sm font-medium mb-2">Education Level</h3>
                      <div className="flex items-center justify-between p-2 border rounded-md">
                        <div className="flex items-center gap-2">
                          <School className="h-4 w-4 text-blue-500" />
                          <span className="text-sm">High School</span>
                        </div>
                        <span className="text-sm font-medium">54%</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-2 border rounded-md">
                        <div className="flex items-center gap-2">
                          <School className="h-4 w-4 text-green-500" />
                          <span className="text-sm">Diploma</span>
                        </div>
                        <span className="text-sm font-medium">32%</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-2 border rounded-md">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-purple-500" />
                          <span className="text-sm">Bachelor's</span>
                        </div>
                        <span className="text-sm font-medium">12%</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-2 border rounded-md">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-orange-500" />
                          <span className="text-sm">Master's</span>
                        </div>
                        <span className="text-sm font-medium">2%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Performance Metrics</CardTitle>
                  <CardDescription>
                    Employee performance overview
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium mb-2">Performance Rating Distribution</h3>
                      <div className="h-32 p-4 border rounded-md relative">
                        <div className="flex justify-between items-end h-full">
                          <div className="w-12 flex flex-col items-center">
                            <div className="bg-red-400 w-full" style={{ height: '10%' }}></div>
                            <span className="text-xs mt-2">Poor</span>
                            <span className="text-xs font-medium">2%</span>
                          </div>
                          
                          <div className="w-12 flex flex-col items-center">
                            <div className="bg-orange-400 w-full" style={{ height: '25%' }}></div>
                            <span className="text-xs mt-2">Fair</span>
                            <span className="text-xs font-medium">10%</span>
                          </div>
                          
                          <div className="w-12 flex flex-col items-center">
                            <div className="bg-yellow-400 w-full" style={{ height: '50%' }}></div>
                            <span className="text-xs mt-2">Good</span>
                            <span className="text-xs font-medium">43%</span>
                          </div>
                          
                          <div className="w-12 flex flex-col items-center">
                            <div className="bg-green-400 w-full" style={{ height: '75%' }}></div>
                            <span className="text-xs mt-2">Great</span>
                            <span className="text-xs font-medium">30%</span>
                          </div>
                          
                          <div className="w-12 flex flex-col items-center">
                            <div className="bg-emerald-400 w-full" style={{ height: '40%' }}></div>
                            <span className="text-xs mt-2">Excellent</span>
                            <span className="text-xs font-medium">15%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2 pt-2 mt-2 border-t">
                      <h3 className="text-sm font-medium mb-2">Key Performance Indicators</h3>
                      
                      <div className="flex justify-between text-sm">
                        <span>Productivity</span>
                        <span className="font-medium">87%</span>
                      </div>
                      <Progress value={87} className="h-2" />
                      
                      <div className="flex justify-between text-sm mt-3">
                        <span>Quality</span>
                        <span className="font-medium">92%</span>
                      </div>
                      <Progress value={92} className="h-2" />
                      
                      <div className="flex justify-between text-sm mt-3">
                        <span>Attendance</span>
                        <span className="font-medium">96%</span>
                      </div>
                      <Progress value={96} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            
            <motion.div variants={itemAnimation}>
              <Card>
                <CardHeader>
                  <CardTitle>Workforce Planning Insights</CardTitle>
                  <CardDescription>
                    Strategic workforce insights and recommendations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="p-4 border border-blue-200 bg-blue-50 rounded-md">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                          <div>
                            <h3 className="font-medium text-blue-800">Skill Gap Analysis</h3>
                            <p className="text-sm mt-1">
                              Current skill gap in quality control department. Consider training 5 employees in advanced 
                              quality inspection techniques to meet upcoming export order requirements.
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 border border-amber-200 bg-amber-50 rounded-md">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                          <div>
                            <h3 className="font-medium text-amber-800">Succession Planning</h3>
                            <p className="text-sm mt-1">
                              3 department heads approaching retirement age within next 18 months. 
                              Begin identifying and grooming potential replacements from existing staff.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="p-4 border border-green-200 bg-green-50 rounded-md">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-5 w-5 text-green-600 mt-0.5" />
                          <div>
                            <h3 className="font-medium text-green-800">Retention Strategy</h3>
                            <p className="text-sm mt-1">
                              Cutting department has 8% higher turnover than other departments. 
                              Review compensation and working conditions to address retention issues.
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 border border-purple-200 bg-purple-50 rounded-md">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-5 w-5 text-purple-600 mt-0.5" />
                          <div>
                            <h3 className="font-medium text-purple-800">Workforce Expansion</h3>
                            <p className="text-sm mt-1">
                              Based on current order trends, plan to hire 15 additional operators in Sewing 
                              department over next quarter to meet production demands.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </TabsContent>
      </Tabs>
      
      {/* Add Employee Dialog */}
      <Dialog open={isAddEmployeeOpen} onOpenChange={setIsAddEmployeeOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>
              Add a new employee to the system
            </DialogDescription>
          </DialogHeader>
          
          <Form {...employeeForm}>
            <form onSubmit={employeeForm.handleSubmit(onAddEmployeeSubmit)} className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Basic Information</h3>
                <Separator />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={employeeForm.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee ID <span className="text-xs text-muted-foreground">(Auto-generated)</span></FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} placeholder="Auto-generated" disabled className="bg-muted" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. John" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={employeeForm.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender*</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date of Birth*</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="w-full pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            captionLayout="dropdown-buttons"
                            fromYear={1950}
                            toYear={2010}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="joiningDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Joining Date*</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="w-full pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Department & Designation</h3>
                <Separator />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={employeeForm.control}
                  name="departmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department*</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          employeeForm.setValue("designationId", "");
                        }} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.map((dept: any) => (
                            <SelectItem key={dept.id} value={dept.id.toString()}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="designationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation*</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select designation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {designations.map((desig: any) => (
                            <SelectItem key={desig.id} value={desig.id.toString()}>
                              {desig.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Contact Information</h3>
                <Separator />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={employeeForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. name@example.com" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormDescription>
                        Optional but recommended
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. +8801712345678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={employeeForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Full address" 
                        {...field} 
                        value={field.value || ""}
                        className="min-h-[80px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={employeeForm.control}
                  name="nidNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NID Number*</FormLabel>
                      <FormControl>
                        <Input placeholder="National ID Number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="emergencyContact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Contact</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. +8801612345678" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="bloodGroup"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Blood Group</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select blood group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="A+">A+</SelectItem>
                          <SelectItem value="A-">A-</SelectItem>
                          <SelectItem value="B+">B+</SelectItem>
                          <SelectItem value="B-">B-</SelectItem>
                          <SelectItem value="AB+">AB+</SelectItem>
                          <SelectItem value="AB-">AB-</SelectItem>
                          <SelectItem value="O+">O+</SelectItem>
                          <SelectItem value="O-">O-</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Payment Information</h3>
                <Separator />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={employeeForm.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. BRAC Bank" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="bankAccount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Account</FormLabel>
                      <FormControl>
                        <Input placeholder="Account Number" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={employeeForm.control}
                  name="basicSalary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Basic Salary*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 20000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={employeeForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active Employee</FormLabel>
                      <FormDescription>
                        Employee is currently active and working
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsAddEmployeeOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createEmployeeMutation.isPending}>
                  {createEmployeeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Employee
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* View Employee Dialog */}
      {selectedEmployee && (
        <Dialog open={isViewEmployeeOpen} onOpenChange={setIsViewEmployeeOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Employee Details</DialogTitle>
              <DialogDescription>
                Detailed information about {selectedEmployee.firstName} {selectedEmployee.lastName}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-full md:w-1/3 flex flex-col items-center text-center">
                  <Avatar className="h-24 w-24 mb-4">
                    <AvatarFallback className="text-2xl">
                      {selectedEmployee.firstName?.charAt(0)}{selectedEmployee.lastName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <h2 className="text-xl font-bold">{selectedEmployee.firstName} {selectedEmployee.lastName}</h2>
                  <p className="text-muted-foreground">{selectedEmployee.designationName || getDesignationName(selectedEmployee.designationId)}</p>
                  <p className="text-sm mt-1">{selectedEmployee.departmentName || getDepartmentName(selectedEmployee.departmentId)} Department</p>
                  
                  <Badge 
                    variant="outline" 
                    className={selectedEmployee.isActive 
                      ? "mt-3 bg-green-100 text-green-800" 
                      : "mt-3 bg-red-100 text-red-800"}
                  >
                    {selectedEmployee.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                
                <div className="w-full md:w-2/3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Employee ID</h3>
                      <p>{selectedEmployee.employeeId}</p>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Joining Date</h3>
                      <p>{formatDate(selectedEmployee.joinDate)}</p>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
                      <p>{selectedEmployee.email || "Not provided"}</p>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Phone</h3>
                      <p>{selectedEmployee.phone || "Not provided"}</p>
                    </div>
                    
                    <div className="col-span-2">
                      <h3 className="text-sm font-medium text-muted-foreground">Address</h3>
                      <p>{selectedEmployee.address || "Not provided"}</p>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">National ID</h3>
                      <p>{selectedEmployee.nationalId || "Not provided"}</p>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Emergency Contact</h3>
                      <p>{selectedEmployee.emergencyContactPhone || "Not provided"}</p>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <h3 className="font-medium mb-3">Payment Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Salary</h3>
                        <p>{selectedEmployee.salary ? `BDT ${Number(selectedEmployee.salary).toLocaleString()}` : "Not provided"}</p>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Bank Account</h3>
                        <p>{selectedEmployee.bankAccount || "Not provided"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="outline" className="w-full">
                  <FileText className="mr-2 h-4 w-4" />
                  Generate ID Card
                </Button>
                
                <Button variant="outline" className="w-full">
                  <FileCheck className="mr-2 h-4 w-4" />
                  Appointment Letter
                </Button>
                
                <Button variant="outline" className="w-full">
                  <Printer className="mr-2 h-4 w-4" />
                  Print Details
                </Button>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewEmployeeOpen(false)}>
                Close
              </Button>
              <Button variant="default" onClick={() => {
                setIsViewEmployeeOpen(false);
                handleEditEmployee(selectedEmployee);
              }}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Employee
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Edit Employee Dialog */}
      {selectedEmployee && (
        <Dialog open={isEditEmployeeOpen} onOpenChange={setIsEditEmployeeOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Employee</DialogTitle>
              <DialogDescription>
                Edit employee information
              </DialogDescription>
            </DialogHeader>
            
            <Form {...employeeForm}>
              <form onSubmit={employeeForm.handleSubmit(onEditEmployeeSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium">Basic Information</h3>
                  <Separator />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={employeeForm.control}
                    name="employeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee ID <span className="text-xs text-muted-foreground">(Auto-generated)</span></FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="Auto-generated" disabled readOnly className="bg-muted" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={employeeForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={employeeForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={employeeForm.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={employeeForm.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Date of Birth*</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className="w-full pl-3 text-left font-normal">
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus captionLayout="dropdown-buttons" fromYear={1950} toYear={2010} />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={employeeForm.control}
                    name="joiningDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Joining Date*</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className="w-full pl-3 text-left font-normal">
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-medium">Department & Designation</h3>
                  <Separator />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={employeeForm.control}
                    name="departmentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {departments.map((dept: any) => (
                              <SelectItem key={dept.id} value={dept.id.toString()}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={employeeForm.control}
                    name="designationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Designation*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select designation" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {designations.map((desig: any) => (
                              <SelectItem key={desig.id} value={desig.id.toString()}>
                                {desig.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-medium">Contact Information</h3>
                  <Separator />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={employeeForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. name@example.com" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={employeeForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. +8801712345678" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={employeeForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Full address" {...field} value={field.value || ""} className="min-h-[80px]" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={employeeForm.control}
                    name="nidNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NID Number*</FormLabel>
                        <FormControl>
                          <Input placeholder="National ID Number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={employeeForm.control}
                    name="emergencyContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emergency Contact</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. +8801612345678" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={employeeForm.control}
                    name="bloodGroup"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Blood Group</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select blood group" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="A+">A+</SelectItem>
                            <SelectItem value="A-">A-</SelectItem>
                            <SelectItem value="B+">B+</SelectItem>
                            <SelectItem value="B-">B-</SelectItem>
                            <SelectItem value="AB+">AB+</SelectItem>
                            <SelectItem value="AB-">AB-</SelectItem>
                            <SelectItem value="O+">O+</SelectItem>
                            <SelectItem value="O-">O-</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-medium">Payment Information</h3>
                  <Separator />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={employeeForm.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. BRAC Bank" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={employeeForm.control}
                    name="bankAccount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Account</FormLabel>
                        <FormControl>
                          <Input placeholder="Account Number" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={employeeForm.control}
                    name="basicSalary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Basic Salary*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 20000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={employeeForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Active Employee</FormLabel>
                        <FormDescription>Employee is currently active and working</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
                
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setIsEditEmployeeOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateEmployeeMutation.isPending}>
                    {updateEmployeeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Department Dialog */}
      <Dialog open={isAddDeptOpen} onOpenChange={setIsAddDeptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Department</DialogTitle>
            <DialogDescription>Create a new department</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Department Name*</Label>
              <Input placeholder="e.g. Sewing" value={deptName} onChange={(e) => setDeptName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Department Code*</Label>
              <Input placeholder="e.g. SEW" value={deptCode} onChange={(e) => setDeptCode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Department description" value={deptDescription} onChange={(e) => setDeptDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDeptOpen(false)}>Cancel</Button>
            <Button 
              disabled={!deptName || !deptCode || createDepartmentMutation.isPending}
              onClick={() => createDepartmentMutation.mutate({ name: deptName, code: deptCode, description: deptDescription || undefined })}
            >
              {createDepartmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Department
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Designation Dialog */}
      <Dialog open={isAddDesigOpen} onOpenChange={setIsAddDesigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Designation</DialogTitle>
            <DialogDescription>Create a new designation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Designation Name*</Label>
              <Input placeholder="e.g. Operator" value={desigName} onChange={(e) => setDesigName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Level</Label>
              <Input placeholder="e.g. 1" value={desigLevel} onChange={(e) => setDesigLevel(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDesigOpen(false)}>Cancel</Button>
            <Button 
              disabled={!desigName || createDesignationMutation.isPending}
              onClick={() => createDesignationMutation.mutate({ name: desigName, level: desigLevel ? parseInt(desigLevel) : undefined })}
            >
              {createDesignationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Designation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Employees</DialogTitle>
            <DialogDescription>
              Import employees from Excel or CSV file
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drag & drop file here</p>
              <p className="text-xs text-muted-foreground mt-1">or</p>
              <Button variant="outline" size="sm" className="mt-2">
                Browse Files
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Supports Excel (.xlsx) or CSV files
              </p>
            </div>
            
            <div className="p-3 border rounded-md">
              <h3 className="text-sm font-medium">Import Instructions</h3>
              <ul className="mt-2 text-xs space-y-1 text-muted-foreground">
                <li>• Download the template file first</li>
                <li>• Fill in employee data according to the template</li>
                <li>• Required fields are marked with *</li>
                <li>• Upload the file to import employees</li>
              </ul>
              
              <Button variant="link" size="sm" className="p-0 h-auto mt-2">
                <Download className="h-3 w-3 mr-1" />
                <span className="text-xs">Download template</span>
              </Button>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button>
              Import Employees
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Export Dialog */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Export Employees</DialogTitle>
            <DialogDescription>
              Export employee data to Excel or CSV
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Export Format</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <input type="radio" id="excel" name="format" defaultChecked />
                  <Label htmlFor="excel">Excel (.xlsx)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="radio" id="csv" name="format" />
                  <Label htmlFor="csv">CSV (.csv)</Label>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Data to Export</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox id="all" defaultChecked />
                  <Label htmlFor="all">All Data</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="filtered" />
                  <Label htmlFor="filtered">Filtered Data</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="active" />
                  <Label htmlFor="active">Active Employees Only</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="selected" />
                  <Label htmlFor="selected">Selected Department</Label>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Exporting employee data may contain sensitive information. 
                  Ensure you comply with data privacy regulations.
                </p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}