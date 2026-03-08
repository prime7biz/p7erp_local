import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Plus, Edit, Users, Search, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const departmentSchema = z.object({
  name: z.string().min(1, "Department name is required"),
  description: z.string().optional(),
  headUserId: z.number().optional(),
  parentDepartmentId: z.number().optional(),
});

type DepartmentFormData = z.infer<typeof departmentSchema>;

export default function DepartmentManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<DepartmentFormData>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      name: "",
      description: "",
      headUserId: 0,
      parentDepartmentId: 0,
    },
  });

  // Fetch departments
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["/api/settings/departments"],
  });

  // Fetch users for department head selection
  const { data: users = [] } = useQuery({
    queryKey: ["/api/settings/users"],
  });

  // Create department mutation
  const createDepartmentMutation = useMutation({
    mutationFn: (departmentData: DepartmentFormData) => 
      apiRequest("/api/settings/departments", "POST", departmentData),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Department created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/departments"] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create department",
        variant: "destructive",
      });
    },
  });

  // Update department mutation
  const updateDepartmentMutation = useMutation({
    mutationFn: ({ id, ...departmentData }: { id: number } & DepartmentFormData) =>
      apiRequest(`/api/settings/departments/${id}`, "PUT", departmentData),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Department updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/departments"] });
      setEditingDepartment(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update department",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: DepartmentFormData) => {
    const submitData = {
      ...data,
      headUserId: data.headUserId || undefined,
      parentDepartmentId: data.parentDepartmentId || undefined,
    };

    if (editingDepartment) {
      updateDepartmentMutation.mutate({ id: editingDepartment.id, ...submitData });
    } else {
      createDepartmentMutation.mutate(submitData);
    }
  };

  const handleEdit = (department: any) => {
    setEditingDepartment(department);
    form.reset({
      name: department.name,
      description: department.description || "",
      headUserId: department.headUserId || 0,
      parentDepartmentId: department.parentDepartmentId || 0,
    });
  };

  const filteredDepartments = departments.filter((dept: any) =>
    dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (dept.description && dept.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getParentDepartmentName = (parentId: number) => {
    const parent = departments.find((d: any) => d.id === parentId);
    return parent?.name || "None";
  };

  const getDepartmentHeadName = (headUserId: number) => {
    const user = users.find((u: any) => u.id === headUserId);
    return user ? `${user.firstName} ${user.lastName}` : "Not Assigned";
  };

  const getChildDepartments = (parentId: number) => {
    return departments.filter((d: any) => d.parentDepartmentId === parentId);
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
      {/* Header with Search and Create Button */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search departments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Dialog open={isCreateDialogOpen || !!editingDepartment} onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingDepartment(null);
            form.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Department
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {editingDepartment ? "Edit Department" : "Create New Department"}
              </DialogTitle>
              <DialogDescription>
                {editingDepartment 
                  ? "Update department information and hierarchy"
                  : "Add a new department to your organizational structure"
                }
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Production, Quality Control" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Brief description of department's role" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="parentDepartmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent Department</FormLabel>
                      <Select 
                        value={field.value?.toString() || "none"} 
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : parseInt(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select parent department" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Parent (Top Level)</SelectItem>
                          {departments
                            .filter((dept: any) => dept.id !== editingDepartment?.id)
                            .map((dept: any) => (
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
                  control={form.control}
                  name="headUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department Head</FormLabel>
                      <Select 
                        value={field.value?.toString() || "none"} 
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : parseInt(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department head" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Head Assigned</SelectItem>
                          {users.map((user: any) => (
                            <SelectItem key={user.id} value={user.id.toString()}>
                              {user.firstName} {user.lastName} ({user.username})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setEditingDepartment(null);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createDepartmentMutation.isPending || updateDepartmentMutation.isPending}
                  >
                    {createDepartmentMutation.isPending || updateDepartmentMutation.isPending ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      editingDepartment ? "Update Department" : "Create Department"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Departments Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredDepartments.map((department: any, index: number) => (
          <motion.div
            key={department.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{department.name}</CardTitle>
                      {department.description && (
                        <p className="text-sm text-gray-600">{department.description}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={department.isActive ? "default" : "secondary"}>
                    {department.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Parent Department:</span>
                    <span className="font-medium">
                      {getParentDepartmentName(department.parentDepartmentId)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Department Head:</span>
                    <span className="font-medium">
                      {getDepartmentHeadName(department.headUserId)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Sub-departments:</span>
                    <span className="font-medium">
                      {getChildDepartments(department.id).length}
                    </span>
                  </div>
                </div>

                {getChildDepartments(department.id).length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-gray-600 mb-1">Sub-departments:</p>
                    <div className="flex flex-wrap gap-1">
                      {getChildDepartments(department.id).map((child: any) => (
                        <Badge key={child.id} variant="outline" className="text-xs">
                          {child.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(department)}
                    className="flex-1"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Users className="w-4 h-4 mr-1" />
                    View Users
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {filteredDepartments.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Departments Found</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm 
              ? "No departments match your search criteria." 
              : "Get started by creating your first department."
            }
          </p>
          {!searchTerm && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Department
            </Button>
          )}
        </div>
      )}
    </div>
  );
}