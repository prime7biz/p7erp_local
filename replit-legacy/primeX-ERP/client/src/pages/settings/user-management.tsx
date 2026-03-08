import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, UserX, Search, Mail, Phone, Calendar, Building, Shield, Boxes } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const MODULE_ROLE_LABELS: Record<string, string> = {
  module_accounts: "Accounts",
  module_inventory: "Inventory",
  module_purchase: "Purchase",
  module_sales: "Sales",
  module_commercial_lc: "Commercial / LC",
  module_hr_payroll: "HR / Payroll",
};

const userFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  password: z.string().optional().refine(
    (val) => !val || val.length >= 8,
    { message: "Password must be at least 8 characters" }
  ),
  roleId: z.number().min(1, "Workflow role is required"),
  departmentId: z.number().optional(),
  employeeRefId: z.number().optional(),
  employeeId: z.string().optional(),
  phone: z.string().optional(),
  joiningDate: z.string().optional(),
  moduleRoleKeys: z.array(z.string()).default([]),
});

type UserFormData = z.infer<typeof userFormSchema>;

export default function UserManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: "",
      email: "",
      firstName: "",
      lastName: "",
      password: "",
      roleId: 0,
      departmentId: 0,
      employeeRefId: undefined,
      employeeId: "",
      phone: "",
      joiningDate: "",
      moduleRoleKeys: [],
    },
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["/api/settings/users"],
  });

  const { data: workflowRoles = [] } = useQuery({
    queryKey: ["/api/settings/workflow-roles"],
  });

  const { data: moduleRoles = [] } = useQuery({
    queryKey: ["/api/settings/module-roles"],
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["/api/settings/departments"],
  });

  const { data: employeesList = [] } = useQuery({
    queryKey: ["/api/settings/employees-picklist"],
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["/api/settings/roles"],
  });

  const createUserMutation = useMutation({
    mutationFn: (userData: any) => 
      apiRequest("/api/settings/users", "POST", userData),
    onSuccess: () => {
      toast({ title: "Success", description: "User created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create user", variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, ...userData }: { id: number } & Record<string, any>) =>
      apiRequest(`/api/settings/users/${id}`, "PUT", userData),
    onSuccess: () => {
      toast({ title: "Success", description: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] });
      setEditingUser(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" });
    },
  });

  const deactivateUserMutation = useMutation({
    mutationFn: (userId: number) =>
      apiRequest(`/api/settings/users/${userId}/deactivate`, "PATCH"),
    onSuccess: () => {
      toast({ title: "Success", description: "User deactivated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to deactivate user", variant: "destructive" });
    },
  });

  const handleEmployeeSelect = (empId: string) => {
    if (empId === "none") {
      form.setValue("employeeRefId", undefined);
      return;
    }
    const emp = employeesList.find((e: any) => e.id === parseInt(empId));
    if (emp) {
      form.setValue("employeeRefId", emp.id);
      form.setValue("firstName", emp.firstName || "");
      form.setValue("lastName", emp.lastName || "");
      form.setValue("email", emp.email || "");
      form.setValue("phone", emp.phone || "");
      form.setValue("employeeId", emp.employeeId || "");
    }
  };

  const onSubmit = (data: UserFormData) => {
    const { moduleRoleKeys, ...rest } = data;
    if (editingUser) {
      const { password, ...updateFields } = rest;
      const payload: any = { ...updateFields, moduleRoleKeys };
      if (password && password.length >= 8) {
        payload.password = password;
      }
      payload.departmentId = (data.departmentId && data.departmentId > 0) ? data.departmentId : null;
      payload.employeeId = data.employeeId || null;
      payload.joiningDate = data.joiningDate || null;
      updateUserMutation.mutate({ id: editingUser.id, ...payload });
    } else {
      if (!data.password || data.password.length < 8) {
        form.setError("password", { message: "Password is required for new users (min 8 characters)" });
        return;
      }
      createUserMutation.mutate({ ...rest, moduleRoleKeys });
    }
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    form.reset({
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: "",
      roleId: user.roleId,
      departmentId: user.departmentId || 0,
      employeeRefId: user.employeeRefId || undefined,
      employeeId: user.employeeId || "",
      phone: user.phone || "",
      joiningDate: user.joiningDate || "",
      moduleRoleKeys: [],
    });
  };

  const handleDeactivate = (userId: number) => {
    if (confirm("Are you sure you want to deactivate this user?")) {
      deactivateUserMutation.mutate(userId);
    }
  };

  const filteredUsers = (users as any[]).filter((user: any) =>
    user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleName = (roleId: number) => {
    const role = (allRoles as any[]).find((r: any) => r.id === roleId);
    return role?.displayName || "Unknown Role";
  };

  const getDepartmentName = (departmentId: number) => {
    const department = (departments as any[]).find((d: any) => d.id === departmentId);
    return department?.name || "No Department";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Dialog open={isCreateDialogOpen || !!editingUser} onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingUser(null);
            form.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingUser ? "Edit User" : "Create New User"}
              </DialogTitle>
              <DialogDescription>
                {editingUser 
                  ? "Update user information and permissions"
                  : "Select an employee and assign workflow role with module access"
                }
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {!editingUser && employeesList.length > 0 && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <FormLabel className="text-sm font-medium text-blue-900 mb-2 block">Select Employee</FormLabel>
                    <Select onValueChange={handleEmployeeSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an employee to create user from..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- None --</SelectItem>
                        {(employeesList as any[]).map((emp: any) => (
                          <SelectItem key={emp.id} value={emp.id.toString()}>
                            {emp.employeeId} - {emp.firstName} {emp.lastName} ({emp.department || "No Dept"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {editingUser ? "New Password (leave empty to keep current)" : "Password"}
                      </FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="roleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Shield className="w-4 h-4" />
                          Workflow Role
                        </FormLabel>
                        <Select 
                          value={field.value?.toString() || ""} 
                          onValueChange={(value) => field.onChange(parseInt(value))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select workflow role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(workflowRoles as any[]).length > 0 ? (
                              (workflowRoles as any[]).map((role: any) => (
                                <SelectItem key={role.id} value={role.id.toString()}>
                                  {role.displayName}
                                </SelectItem>
                              ))
                            ) : (
                              (allRoles as any[]).map((role: any) => (
                                <SelectItem key={role.id} value={role.id.toString()}>
                                  {role.displayName}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="departmentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select 
                          value={field.value?.toString() || "none"} 
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : parseInt(value))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a department" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No Department</SelectItem>
                            {(departments as any[]).map((dept: any) => (
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
                </div>

                <div className="p-3 bg-gray-50 rounded-lg border">
                  <FormLabel className="flex items-center gap-1 mb-3">
                    <Boxes className="w-4 h-4" />
                    Module Access
                  </FormLabel>
                  <FormField
                    control={form.control}
                    name="moduleRoleKeys"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {Object.entries(MODULE_ROLE_LABELS).map(([key, label]) => {
                            const moduleRoleExists = (moduleRoles as any[]).find((r: any) => r.name === key);
                            return (
                              <label
                                key={key}
                                className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-white transition-colors ${
                                  field.value?.includes(key) ? "bg-blue-50 border-blue-300" : "bg-white border-gray-200"
                                } ${!moduleRoleExists ? "opacity-50" : ""}`}
                              >
                                <Checkbox
                                  checked={field.value?.includes(key)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    if (checked) {
                                      field.onChange([...current, key]);
                                    } else {
                                      field.onChange(current.filter((k: string) => k !== key));
                                    }
                                  }}
                                />
                                <span className="text-sm">{label}</span>
                              </label>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="joiningDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Joining Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setEditingUser(null);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createUserMutation.isPending || updateUserMutation.isPending}
                  >
                    {createUserMutation.isPending || updateUserMutation.isPending ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      editingUser ? "Update User" : "Create User"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredUsers.map((user: any, index: number) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.profileImage} />
                      <AvatarFallback>
                        {user.firstName?.[0]}{user.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">
                        {user.firstName} {user.lastName}
                      </CardTitle>
                      <p className="text-sm text-gray-600">@{user.username}</p>
                    </div>
                  </div>
                  <Badge className={user.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  {user.email}
                </div>

                {user.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    {user.phone}
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Building className="w-4 h-4" />
                  {getDepartmentName(user.departmentId)}
                </div>

                <div className="flex items-center justify-between">
                  <Badge variant="secondary">
                    {user.roleName || getRoleName(user.roleId)}
                  </Badge>
                  
                  {user.isSuperUser && (
                    <Badge className="bg-purple-100 text-purple-800">
                      Super User
                    </Badge>
                  )}
                </div>

                {user.joiningDate && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    Joined: {new Date(user.joiningDate).toLocaleDateString()}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(user)}
                    className="flex-1"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  
                  {user.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeactivate(user.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <UserX className="w-4 h-4 mr-1" />
                      Deactivate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No users found matching your search.</p>
        </div>
      )}
    </div>
  );
}
