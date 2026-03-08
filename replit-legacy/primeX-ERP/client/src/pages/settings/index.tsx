import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Users, Building2, Shield, Globe, Bell, Database, Clock, DollarSign, Factory } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import UserManagement from "./user-management";
import TenantSettings from "./tenant-settings";
import RolePermissions from "./role-permissions";
import DepartmentManagement from "./department-management";
import CurrencyManagement from "./currency-management";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-500">Manage your tenant configuration and user permissions</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:grid-cols-10">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Roles</span>
            </TabsTrigger>
            <TabsTrigger value="departments" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Departments</span>
            </TabsTrigger>
            <TabsTrigger value="tenant" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Company</span>
            </TabsTrigger>
            <TabsTrigger value="currency" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              <span className="hidden sm:inline">Currency</span>
            </TabsTrigger>
            <TabsTrigger value="business-type" className="flex items-center gap-2">
              <Factory className="w-4 h-4" />
              <span className="hidden sm:inline">Business Type</span>
            </TabsTrigger>
          </TabsList>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    User Management
                  </CardTitle>
                  <CardDescription>
                    Create, edit, and manage user accounts with role-based permissions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UserManagement />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="roles">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Role & Permissions
                  </CardTitle>
                  <CardDescription>
                    Configure user roles and assign module permissions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RolePermissions />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="departments">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Department Management
                  </CardTitle>
                  <CardDescription>
                    Organize your company structure with departments and hierarchies
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DepartmentManagement />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tenant">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Company Settings
                  </CardTitle>
                  <CardDescription>
                    Configure company information, financial settings, and system preferences
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TenantSettings />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="currency">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Multi-Currency Management
                  </CardTitle>
                  <CardDescription>
                    Manage exchange rates and currency settings for international trade
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CurrencyManagement />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="business-type">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Factory className="w-5 h-5" />
                    Business Type Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure your company type to customize which modules and features are visible
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BusinessTypeSelector />
                </CardContent>
              </Card>
            </TabsContent>
          </motion.div>
        </Tabs>

        {/* Settings Overview Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8"
        >
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Users</p>
                  <p className="text-2xl font-bold text-gray-900">24</p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Departments</p>
                  <p className="text-2xl font-bold text-gray-900">8</p>
                </div>
                <Building2 className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Roles Defined</p>
                  <p className="text-2xl font-bold text-gray-900">6</p>
                </div>
                <Shield className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">System Health</p>
                  <p className="text-2xl font-bold text-green-600">98%</p>
                </div>
                <Database className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}

const businessTypes = [
  {
    value: 'buying_house',
    label: 'Buying House',
    icon: Building2,
    description: 'Sourcing, factory coordination, buyer management, and commission tracking',
    modules: ['Sales & CRM', 'Merchandising', 'Samples', 'TNA', 'Commercial', 'Quality', 'Finance'],
  },
  {
    value: 'manufacturer',
    label: 'Manufacturer',
    icon: Factory,
    description: 'Production floor operations, cutting, sewing, finishing, IE, and quality control',
    modules: ['Production', 'Cutting', 'Sewing', 'Finishing', 'IE & Efficiency', 'Quality', 'Inventory', 'Finance'],
  },
  {
    value: 'both',
    label: 'Both (Buying House + Manufacturer)',
    icon: Globe,
    description: 'Full access to all modules — for companies that handle both sourcing and manufacturing',
    modules: ['All modules enabled'],
  },
] as const;

function BusinessTypeSelector() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentType = user?.tenant?.businessType || 'both';
  const [selected, setSelected] = useState(currentType);

  const mutation = useMutation({
    mutationFn: async (businessType: string) => {
      const res = await apiRequest("/api/settings/tenant/business-type", "PUT", { businessType });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Business type updated", description: "Sidebar and modules have been updated. Refresh to see changes." });
    },
    onError: () => {
      toast({ title: "Failed to update", description: "Could not update business type", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {businessTypes.map((bt) => {
          const Icon = bt.icon;
          const isSelected = selected === bt.value;
          return (
            <div
              key={bt.value}
              onClick={() => setSelected(bt.value)}
              className={`relative cursor-pointer rounded-xl border-2 p-5 transition-all hover:shadow-md ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {isSelected && (
                <Badge className="absolute top-2 right-2 bg-blue-500">Selected</Badge>
              )}
              <div className="flex flex-col items-center text-center space-y-3">
                <div className={`p-3 rounded-lg ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  <Icon className="w-8 h-8" />
                </div>
                <h3 className="font-semibold text-lg">{bt.label}</h3>
                <p className="text-sm text-gray-500">{bt.description}</p>
                <div className="flex flex-wrap gap-1 justify-center">
                  {bt.modules.map((mod) => (
                    <Badge key={mod} variant="outline" className="text-xs">{mod}</Badge>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {selected !== currentType && (
        <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div>
            <p className="font-medium text-amber-800">You have unsaved changes</p>
            <p className="text-sm text-amber-600">Changing business type will update which modules are visible in the sidebar</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelected(currentType)}>Cancel</Button>
            <Button onClick={() => mutation.mutate(selected)} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}