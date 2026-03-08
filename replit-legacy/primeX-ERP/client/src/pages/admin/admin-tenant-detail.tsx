import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import AdminLayout from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Building2, Users, CreditCard, Shield, Database,
  Mail, Phone, Calendar, CheckCircle, XCircle, Key, Trash2,
  Download, RefreshCw, Settings, AlertTriangle, User, Edit
} from "lucide-react";
import { format } from "date-fns";

export default function AdminTenantDetail() {
  const [, params] = useRoute("/admin/tenants/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const [editSettingsOpen, setEditSettingsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("changeme123");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [editSubOpen, setEditSubOpen] = useState(false);
  const [subPlan, setSubPlan] = useState("");
  const [subStatus, setSubStatus] = useState("");
  const [subEndDate, setSubEndDate] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deletingBackupId, setDeletingBackupId] = useState<number | null>(null);

  const { data: tenant, isLoading: tenantLoading } = useQuery<any>({
    queryKey: [`/api/admin/tenants/${id}`],
    enabled: !!id,
  });

  const { data: users, isLoading: usersLoading } = useQuery<any[]>({
    queryKey: [`/api/admin/tenants/${id}/users`],
    enabled: !!id,
  });

  const { data: subscription } = useQuery<any>({
    queryKey: [`/api/admin/tenants/${id}/subscription`],
    enabled: !!id,
  });

  const { data: dataStats } = useQuery<Record<string, number>>({
    queryKey: [`/api/admin/tenants/${id}/data-stats`],
    enabled: !!id,
  });

  const { data: contacts } = useQuery<any[]>({
    queryKey: [`/api/admin/tenants/${id}/contacts`],
    enabled: !!id,
  });

  const { data: backups, isLoading: backupsLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/tenants', id, 'backup', 'list'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${id}/backup/list`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch backups');
      return res.json();
    },
    enabled: !!id,
  });

  const generateBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/admin/tenants/${id}/backup/generate`, "POST");
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants', id, 'backup', 'list'] });
      toast({ title: "Backup Created", description: "Backup has been generated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate backup", variant: "destructive" });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: number) => {
      await apiRequest(`/api/admin/tenants/${id}/backup/${backupId}`, "DELETE");
    },
    onSuccess: () => {
      setDeletingBackupId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants', id, 'backup', 'list'] });
      toast({ title: "Backup Deleted", description: "Backup has been deleted successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete backup", variant: "destructive" });
    },
  });

  const handleToggleStatus = async () => {
    if (!tenant) return;
    try {
      await apiRequest(`/api/admin/tenants/${id}/status`, "PATCH", { isActive: !tenant.isActive });
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${id}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Status Updated", description: `Tenant ${!tenant.isActive ? "activated" : "suspended"} successfully.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleUserStatus = async (userId: number, currentActive: boolean) => {
    try {
      await apiRequest(`/api/admin/tenants/${id}/users/${userId}`, "PATCH", { isActive: !currentActive });
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${id}/users`] });
      toast({ title: "User Updated", description: `User ${!currentActive ? "activated" : "deactivated"} successfully.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleResetPassword = async () => {
    if (!resetUserId) return;
    try {
      await apiRequest(`/api/admin/tenants/${id}/users/${resetUserId}/reset-password`, "POST", { password: resetPassword });
      setResetPasswordOpen(false);
      setResetUserId(null);
      setResetPassword("changeme123");
      toast({ title: "Password Reset", description: "User password has been reset successfully." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdateSettings = async () => {
    setSettingsSaving(true);
    try {
      await apiRequest(`/api/admin/tenants/${id}`, "PATCH", { name: editName, domain: editDomain });
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${id}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      setEditSettingsOpen(false);
      toast({ title: "Settings Updated", description: "Tenant settings saved successfully." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleUpdateSubscription = async () => {
    try {
      const data: any = {};
      if (subPlan) data.plan = subPlan;
      if (subStatus) data.status = subStatus;
      if (subEndDate) data.endDate = subEndDate;
      await apiRequest(`/api/admin/tenants/${id}/subscription`, "PATCH", data);
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${id}/subscription`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${id}`] });
      setEditSubOpen(false);
      toast({ title: "Subscription Updated", description: "Subscription details saved." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDownloadBackup = (backupId: number) => {
    window.open(`/api/admin/tenants/${id}/backup/${backupId}/download`, '_blank');
  };

  const formatBytes = (bytes: number | null | undefined) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDeleteTenant = async () => {
    if (deleteConfirmText !== tenant?.name) return;
    try {
      await apiRequest(`/api/admin/tenants/${id}`, "DELETE");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant Deleted", description: "Tenant and all associated data have been permanently removed." });
      setLocation("/admin/tenants");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const openEditSettings = () => {
    setEditName(tenant?.name || "");
    setEditDomain(tenant?.domain || "");
    setEditSettingsOpen(true);
  };

  const openEditSubscription = () => {
    setSubPlan(subscription?.plan || tenant?.subscriptionPlan || "");
    setSubStatus(subscription?.status || tenant?.subscriptionStatus || "");
    setSubEndDate(subscription?.endDate ? new Date(subscription.endDate).toISOString().split('T')[0] : "");
    setEditSubOpen(true);
  };

  const totalRecords = dataStats ? Object.values(dataStats).reduce((a, b) => a + b, 0) : 0;

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return format(new Date(d), "MMM dd, yyyy"); } catch { return "—"; }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <Button variant="ghost" onClick={() => setLocation("/admin/tenants")} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Tenants
        </Button>

        {tenantLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : tenant ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-blue-600" />
                  {tenant.name}
                </h1>
                <p className="text-gray-500">{tenant.domain} &bull; Created {formatDate(tenant.createdAt)}</p>
              </div>
              <Badge className={tenant.isActive ? "bg-green-100 text-green-700 hover:bg-green-100 text-sm px-3 py-1" : "bg-red-100 text-red-700 hover:bg-red-100 text-sm px-3 py-1"}>
                {tenant.isActive ? "Active" : "Suspended"}
              </Badge>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="subscription">Subscription</TabsTrigger>
                <TabsTrigger value="data">Data & Backup</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="danger">Danger Zone</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                        <Shield className="h-4 w-4" /> Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        {tenant.isActive ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                        <span className="font-semibold">{tenant.isActive ? "Active" : "Suspended"}</span>
                      </div>
                      <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={handleToggleStatus}>
                        {tenant.isActive ? "Suspend" : "Activate"}
                      </Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                        <CreditCard className="h-4 w-4" /> Subscription
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold capitalize">{tenant.subscriptionPlan || "No Plan"}</p>
                      <Badge variant="outline" className="mt-1">{tenant.subscriptionStatus || "none"}</Badge>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                        <Users className="h-4 w-4" /> Users
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{tenant.usersCount ?? users?.length ?? 0}</p>
                      <p className="text-xs text-gray-400">registered users</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                        <Database className="h-4 w-4" /> Data Records
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{totalRecords.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">across all modules</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {contacts && contacts.length > 0 ? (
                      <div className="space-y-3">
                        {contacts.map((c: any) => (
                          <div key={c.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{c.firstName} {c.lastName}</p>
                              <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>
                                {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
                              </div>
                            </div>
                            {c.isSuperUser && <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Owner</Badge>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">No contact information available</p>
                    )}
                  </CardContent>
                </Card>

                {dataStats && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Database className="h-4 w-4" /> Module Data Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {Object.entries(dataStats).map(([table, cnt]) => (
                          <div key={table} className="p-3 bg-gray-50 rounded-lg text-center">
                            <p className="text-lg font-bold">{cnt}</p>
                            <p className="text-xs text-gray-500 capitalize">{table.replace(/_/g, ' ')}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="users">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" /> Tenant Users ({users?.length ?? 0})
                    </CardTitle>
                    <CardDescription>Manage users - activate, deactivate, or reset passwords</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {usersLoading ? (
                      <div className="p-6 space-y-3">
                        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Last Login</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(users ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-8 text-gray-500">No users found</TableCell>
                            </TableRow>
                          ) : (
                            (users ?? []).map((u: any) => (
                              <TableRow key={u.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {u.firstName} {u.lastName}
                                    {u.isSuperUser && <Badge variant="outline" className="text-xs">Owner</Badge>}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">{u.email}</TableCell>
                                <TableCell className="text-sm text-gray-600">{u.username}</TableCell>
                                <TableCell className="text-sm text-gray-600">{u.phone || "—"}</TableCell>
                                <TableCell>
                                  <Badge className={u.isActive ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-600 hover:bg-gray-100"}>
                                    {u.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-gray-500">{u.lastLogin ? formatDate(u.lastLogin) : "Never"}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant={u.isActive ? "destructive" : "default"}
                                      className="text-xs h-7 px-2"
                                      onClick={() => handleToggleUserStatus(u.id, u.isActive)}
                                    >
                                      {u.isActive ? "Deactivate" : "Activate"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7 px-2"
                                      title="Reset Password"
                                      onClick={() => { setResetUserId(u.id); setResetPasswordOpen(true); }}
                                    >
                                      <Key className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="subscription">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <CreditCard className="h-5 w-5" /> Subscription Details
                        </CardTitle>
                        <CardDescription>Manage subscription plan, status, and validity period</CardDescription>
                      </div>
                      <Button onClick={openEditSubscription} className="gap-2">
                        <Edit className="h-4 w-4" /> Edit Subscription
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <Label className="text-gray-500 text-xs">Current Plan</Label>
                          <p className="text-lg font-semibold capitalize">{subscription?.plan || tenant?.subscriptionPlan || "No Plan"}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500 text-xs">Status</Label>
                          <div>
                            <Badge className={
                              (subscription?.status || tenant?.subscriptionStatus) === "active" ? "bg-green-100 text-green-700 hover:bg-green-100" :
                              (subscription?.status || tenant?.subscriptionStatus) === "trial" ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" :
                              "bg-gray-100 text-gray-600 hover:bg-gray-100"
                            }>
                              {subscription?.status || tenant?.subscriptionStatus || "none"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <Label className="text-gray-500 text-xs">Start Date</Label>
                          <p className="font-medium flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {formatDate(subscription?.startDate || tenant?.subscriptionStartDate)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-gray-500 text-xs">End Date</Label>
                          <p className="font-medium flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {formatDate(subscription?.endDate || tenant?.subscriptionEndDate)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="data">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" /> Data Overview
                      </CardTitle>
                      <CardDescription>All data records stored for this tenant across modules</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {dataStats ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                            <div>
                              <p className="text-2xl font-bold text-blue-700">{totalRecords.toLocaleString()}</p>
                              <p className="text-sm text-blue-600">Total Records</p>
                            </div>
                            <Database className="h-8 w-8 text-blue-300" />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Object.entries(dataStats).map(([table, cnt]) => (
                              <div key={table} className="flex items-center justify-between p-3 border rounded-lg">
                                <span className="text-sm capitalize text-gray-700">{table.replace(/_/g, ' ')}</span>
                                <Badge variant="outline" className="font-mono">{cnt}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Skeleton className="h-32 w-full" />
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5" /> Backup Management
                          </CardTitle>
                          <CardDescription>Create, download, and manage tenant data backups</CardDescription>
                        </div>
                        <Button
                          onClick={() => generateBackupMutation.mutate()}
                          disabled={generateBackupMutation.isPending}
                          className="gap-2"
                        >
                          {generateBackupMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          {generateBackupMutation.isPending ? "Creating..." : "Create Backup"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {backupsLoading ? (
                        <div className="p-6 space-y-3">
                          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                        </div>
                      ) : (backups ?? []).length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <Database className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          <p>No backups found</p>
                          <p className="text-sm">Create your first backup using the button above</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Size</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(backups ?? []).map((b: any) => (
                              <TableRow key={b.id}>
                                <TableCell className="font-medium">{b.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={b.isAutoBackup ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}>
                                    {b.isAutoBackup ? "Auto" : "Manual"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-gray-600">
                                  {formatDate(b.createdAt)}
                                </TableCell>
                                <TableCell className="text-sm font-mono">{formatBytes(b.sizeBytes)}</TableCell>
                                <TableCell>
                                  <Badge className={
                                    b.status === "completed" ? "bg-green-100 text-green-700 hover:bg-green-100" :
                                    b.status === "failed" ? "bg-red-100 text-red-700 hover:bg-red-100" :
                                    "bg-yellow-100 text-yellow-700 hover:bg-yellow-100"
                                  }>
                                    {b.status || "unknown"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7 px-2 gap-1"
                                      onClick={() => handleDownloadBackup(b.id)}
                                    >
                                      <Download className="h-3 w-3" /> Download
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="text-xs h-7 px-2 gap-1"
                                      disabled={deleteBackupMutation.isPending && deletingBackupId === b.id}
                                      onClick={() => {
                                        setDeletingBackupId(b.id);
                                        deleteBackupMutation.mutate(b.id);
                                      }}
                                    >
                                      {deleteBackupMutation.isPending && deletingBackupId === b.id ? (
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3 w-3" />
                                      )}
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="settings">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Settings className="h-5 w-5" /> Tenant Settings
                        </CardTitle>
                        <CardDescription>Update company name, domain, and other configurations</CardDescription>
                      </div>
                      <Button onClick={openEditSettings} className="gap-2">
                        <Edit className="h-4 w-4" /> Edit Settings
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <Label className="text-gray-500 text-xs">Company Name</Label>
                          <p className="text-lg font-semibold">{tenant.name}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500 text-xs">Domain</Label>
                          <p className="font-medium">{tenant.domain}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500 text-xs">Status</Label>
                          <div className="flex items-center gap-2">
                            <Badge className={tenant.isActive ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
                              {tenant.isActive ? "Active" : "Suspended"}
                            </Badge>
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleToggleStatus}>
                              {tenant.isActive ? "Suspend" : "Activate"}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <Label className="text-gray-500 text-xs">Created</Label>
                          <p className="font-medium flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {formatDate(tenant.createdAt)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-gray-500 text-xs">Last Updated</Label>
                          <p className="font-medium flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {formatDate(tenant.updatedAt)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-gray-500 text-xs">Tenant ID</Label>
                          <p className="font-mono text-sm text-gray-600">{tenant.id}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="danger">
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-5 w-5" /> Danger Zone
                    </CardTitle>
                    <CardDescription>Irreversible actions that permanently affect this tenant</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-yellow-200 rounded-lg bg-yellow-50">
                      <div>
                        <p className="font-medium text-yellow-800">Suspend Tenant</p>
                        <p className="text-sm text-yellow-700">Temporarily disable access for all users of this tenant</p>
                      </div>
                      <Button
                        variant={tenant.isActive ? "destructive" : "default"}
                        onClick={handleToggleStatus}
                      >
                        {tenant.isActive ? "Suspend Tenant" : "Activate Tenant"}
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
                      <div>
                        <p className="font-medium text-red-800">Delete Tenant</p>
                        <p className="text-sm text-red-700">Permanently remove this tenant and all associated data. This cannot be undone.</p>
                      </div>
                      <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)} className="gap-2">
                        <Trash2 className="h-4 w-4" /> Delete Tenant
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">Tenant not found</div>
        )}
      </div>

      <Dialog open={editSettingsOpen} onOpenChange={setEditSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant Settings</DialogTitle>
            <DialogDescription>Update the company name and domain</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Company Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Domain</Label>
              <Input value={editDomain} onChange={(e) => setEditDomain(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSettingsOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateSettings} disabled={settingsSaving}>
              {settingsSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editSubOpen} onOpenChange={setEditSubOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>Change plan, status, or validity period</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Plan</Label>
              <Select value={subPlan} onValueChange={setSubPlan}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={subStatus} onValueChange={setSubStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={subEndDate} onChange={(e) => setSubEndDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSubOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateSubscription}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>Set a new temporary password for this user</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New Password</Label>
              <Input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">The user should change this after their next login</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
            <Button onClick={handleResetPassword}>Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Delete Tenant Permanently
            </DialogTitle>
            <DialogDescription>
              This action is irreversible. All users, subscriptions, and data will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              To confirm, type the tenant name: <strong>{tenant?.name}</strong>
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type tenant name to confirm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setDeleteConfirmText(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteTenant} disabled={deleteConfirmText !== tenant?.name}>
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
