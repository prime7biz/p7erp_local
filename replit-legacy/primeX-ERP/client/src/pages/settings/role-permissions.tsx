import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Users, Key, Settings, ChevronDown, ChevronRight, Search, Plus, Save, RefreshCw, Loader2, Trash2, X } from "lucide-react";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardContainer } from "@/components/layout/dashboard-container";

function getLevelColor(level: number) {
  const colors: Record<number, string> = {
    1: "bg-red-100 text-red-800",
    2: "bg-orange-100 text-orange-800",
    3: "bg-yellow-100 text-yellow-800",
    4: "bg-blue-100 text-blue-800",
    5: "bg-green-100 text-green-800",
    6: "bg-gray-100 text-gray-800",
    7: "bg-indigo-100 text-indigo-800",
    8: "bg-pink-100 text-pink-800",
    9: "bg-teal-100 text-teal-800",
    10: "bg-purple-100 text-purple-800",
  };
  return colors[level] || "bg-gray-100 text-gray-800";
}

function RolesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [newRole, setNewRole] = useState({ name: "", displayName: "", description: "", level: "5" });

  const { data: roles = [], isLoading: rolesLoading } = useQuery<any[]>({
    queryKey: ["/api/rbac/roles"],
  });

  const { data: allPermissions = {}, isLoading: permsLoading } = useQuery<Record<string, any[]>>({
    queryKey: ["/api/rbac/permissions"],
  });

  const { data: rolePermissionIds = [], isLoading: rolePermsLoading } = useQuery<number[]>({
    queryKey: ["/api/rbac/roles", selectedRoleId, "permissions"],
    enabled: !!selectedRoleId,
  });

  const [localPermIds, setLocalPermIds] = useState<Set<number>>(new Set());
  const [permsDirty, setPermsDirty] = useState(false);

  const selectedRole = roles.find((r: any) => r.id === selectedRoleId);

  useEffect(() => {
    if (selectedRoleId) {
      setLocalPermIds(new Set(rolePermissionIds));
      setPermsDirty(false);
    }
  }, [rolePermissionIds, selectedRoleId]);

  const filteredRoles = roles.filter((r: any) =>
    r.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const createRoleMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/rbac/roles", "POST", data),
    onSuccess: () => {
      toast({ title: "Success", description: "Role created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/roles"] });
      setCreateDialogOpen(false);
      setNewRole({ name: "", displayName: "", description: "", level: "5" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to create role", variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest(`/api/rbac/roles/${id}`, "PUT", data),
    onSuccess: () => {
      toast({ title: "Success", description: "Role updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/roles"] });
      setEditDialogOpen(false);
      setEditingRole(null);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to update role", variant: "destructive" });
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: number; permissionIds: number[] }) =>
      apiRequest(`/api/rbac/roles/${roleId}/permissions`, "POST", { permissionIds }),
    onSuccess: () => {
      toast({ title: "Success", description: "Permissions saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/roles", selectedRoleId, "permissions"] });
      setPermsDirty(false);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to save permissions", variant: "destructive" });
    },
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: () => apiRequest("/api/rbac/seed-defaults", "POST"),
    onSuccess: () => {
      toast({ title: "Success", description: "Default roles & permissions initialized" });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/permissions"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to seed defaults", variant: "destructive" });
    },
  });

  const handleSelectRole = (roleId: number) => {
    setSelectedRoleId(roleId);
    setPermsDirty(false);
  };

  const togglePermission = (permId: number) => {
    setLocalPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
    setPermsDirty(true);
  };

  const toggleModule = (modulePerms: any[], selectAll: boolean) => {
    setLocalPermIds((prev) => {
      const next = new Set(prev);
      modulePerms.forEach((p) => {
        if (selectAll) next.add(p.id);
        else next.delete(p.id);
      });
      return next;
    });
    setPermsDirty(true);
  };

  const allModuleSelected = (modulePerms: any[]) =>
    modulePerms.length > 0 && modulePerms.every((p) => localPermIds.has(p.id));

  const someModuleSelected = (modulePerms: any[]) =>
    modulePerms.some((p) => localPermIds.has(p.id)) && !allModuleSelected(modulePerms);

  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const toggleModuleExpand = (mod: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const groupByDocType = (perms: any[]) => {
    const groups: Record<string, any[]> = {};
    for (const p of perms) {
      const key = p.docType || "General";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  };

  if (rolesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input placeholder="Search roles..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { if (confirm("This will initialize default RBAC roles and permissions. Continue?")) seedDefaultsMutation.mutate(); }} disabled={seedDefaultsMutation.isPending}>
            {seedDefaultsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Seed Defaults
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Role
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-3">
          {filteredRoles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No roles found. Create one or seed defaults.</p>
              </CardContent>
            </Card>
          ) : (
            filteredRoles.map((role: any) => (
              <Card
                key={role.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedRoleId === role.id ? "ring-2 ring-orange-500 shadow-md" : ""}`}
                onClick={() => handleSelectRole(role.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shrink-0">
                        <Shield className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{role.displayName}</p>
                        <p className="text-xs text-gray-500">@{role.name}</p>
                      </div>
                    </div>
                    <Badge className={`${getLevelColor(role.level)} text-xs shrink-0`}>L{role.level}</Badge>
                  </div>
                  {role.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{role.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setEditingRole(role); setEditDialogOpen(true); }}>
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-8">
          {!selectedRole ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Key className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Select a role to manage its permissions</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{selectedRole.displayName} — Permissions</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">{selectedRole.description || "Configure which permissions this role has"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{localPermIds.size} selected</Badge>
                    <Button size="sm" disabled={!permsDirty || savePermissionsMutation.isPending} onClick={() => savePermissionsMutation.mutate({ roleId: selectedRoleId!, permissionIds: Array.from(localPermIds) })}>
                      {savePermissionsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {permsLoading || rolePermsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                  </div>
                ) : Object.keys(allPermissions).length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 text-sm">No permissions found. Click "Seed Defaults" to initialize.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[60vh]">
                    <div className="space-y-2 pr-4">
                      {Object.entries(allPermissions).map(([module, perms]) => {
                        const isExpanded = expandedModules.has(module);
                        const allSel = allModuleSelected(perms);
                        const someSel = someModuleSelected(perms);
                        const docGroups = groupByDocType(perms);

                        return (
                          <div key={module} className="border rounded-lg">
                            <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleModuleExpand(module)}>
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-sm">{module}</span>
                                <span className="text-xs text-gray-400 ml-2">({perms.filter((p: any) => localPermIds.has(p.id)).length}/{perms.length})</span>
                              </div>
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={allSel ? true : someSel ? "indeterminate" : false} onCheckedChange={(checked) => toggleModule(perms, !!checked)} />
                                <Label className="text-xs text-gray-500 cursor-pointer">All</Label>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t px-3 pb-3">
                                {Object.entries(docGroups).map(([docType, docPerms]) => (
                                  <div key={docType} className="mt-3">
                                    <p className="text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">{docType}</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                      {docPerms.map((perm: any) => (
                                        <div key={perm.id} className="flex items-center gap-2">
                                          <Checkbox id={`perm-${perm.id}`} checked={localPermIds.has(perm.id)} onCheckedChange={() => togglePermission(perm.id)} />
                                          <Label htmlFor={`perm-${perm.id}`} className="text-xs cursor-pointer truncate">{perm.displayName || `${perm.action} ${perm.docType}`}</Label>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Role</DialogTitle>
            <DialogDescription>Define a new role with an authority level</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role Name (key)</Label>
                <Input placeholder="e.g., warehouse_mgr" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input placeholder="e.g., Warehouse Manager" value={newRole.displayName} onChange={(e) => setNewRole({ ...newRole, displayName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Brief description" value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Authority Level (1 = Highest)</Label>
              <Select value={newRole.level} onValueChange={(v) => setNewRole({ ...newRole, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>Level {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button disabled={createRoleMutation.isPending || !newRole.name || !newRole.displayName} onClick={() => createRoleMutation.mutate({ ...newRole, level: parseInt(newRole.level) })}>
              {createRoleMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(o) => { if (!o) { setEditDialogOpen(false); setEditingRole(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>Update role details</DialogDescription>
          </DialogHeader>
          {editingRole && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role Name</Label>
                  <Input value={editingRole.name} onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input value={editingRole.displayName} onChange={(e) => setEditingRole({ ...editingRole, displayName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={editingRole.description || ""} onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Authority Level</Label>
                <Select value={String(editingRole.level)} onValueChange={(v) => setEditingRole({ ...editingRole, level: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>Level {i + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingRole(null); }}>Cancel</Button>
            <Button disabled={updateRoleMutation.isPending} onClick={() => updateRoleMutation.mutate({ id: editingRole.id, name: editingRole.name, displayName: editingRole.displayName, description: editingRole.description, level: editingRole.level })}>
              {updateRoleMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserRolesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [primaryRoleId, setPrimaryRoleId] = useState<number | null>(null);

  const { data: users = [], isLoading: usersLoading } = useQuery<any[]>({
    queryKey: ["/api/settings/users"],
  });

  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["/api/rbac/roles"],
  });

  const { data: editUserRoles = [], isLoading: userRolesLoading } = useQuery<any[]>({
    queryKey: ["/api/rbac/users", editingUserId, "roles"],
    enabled: !!editingUserId,
  });

  const assignRolesMutation = useMutation({
    mutationFn: ({ userId, roleIds, isPrimary }: { userId: number; roleIds: number[]; isPrimary?: number }) =>
      apiRequest(`/api/rbac/users/${userId}/roles`, "POST", { roleIds, isPrimary }),
    onSuccess: () => {
      toast({ title: "Success", description: "User roles updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/users", editingUserId, "roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] });
      setEditingUserId(null);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to assign roles", variant: "destructive" });
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) =>
      apiRequest(`/api/rbac/users/${userId}/roles/${roleId}`, "DELETE"),
    onSuccess: (_, vars) => {
      toast({ title: "Success", description: "Role removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/users", vars.userId, "roles"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to remove role", variant: "destructive" });
    },
  });

  const openEditDialog = (userId: number) => {
    setEditingUserId(userId);
    setSelectedRoleIds([]);
    setPrimaryRoleId(null);
  };

  const handleSaveRoles = () => {
    if (!editingUserId || selectedRoleIds.length === 0) return;
    assignRolesMutation.mutate({ userId: editingUserId, roleIds: selectedRoleIds, isPrimary: primaryRoleId || undefined });
  };

  const toggleRoleSelection = (roleId: number) => {
    setSelectedRoleIds((prev) => prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]);
  };

  const filteredUsers = users.filter((u: any) =>
    `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleName = (roleId: number) => roles.find((r: any) => r.id === roleId)?.displayName || `Role #${roleId}`;

  if (usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredUsers.map((user: any) => (
          <Card key={user.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{user.firstName} {user.lastName}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  {user.departmentId && <p className="text-xs text-gray-400">Dept #{user.departmentId}</p>}
                </div>
                <Badge variant={user.isActive ? "default" : "secondary"} className="text-xs shrink-0">
                  {user.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1 mb-3 min-h-[28px]">
                {user.roleId && <Badge variant="outline" className="text-xs">{getRoleName(user.roleId)}</Badge>}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => openEditDialog(user.id)}>
                <Settings className="w-3 h-3 mr-1" />
                Edit Roles
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No users found</p>
        </div>
      )}

      <Dialog open={!!editingUserId} onOpenChange={(o) => { if (!o) setEditingUserId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Roles</DialogTitle>
            <DialogDescription>Select roles for this user. Mark one as primary.</DialogDescription>
          </DialogHeader>

          {userRolesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {editUserRoles.length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Current Roles</Label>
                  <div className="flex flex-wrap gap-2">
                    {editUserRoles.map((ur: any) => (
                      <Badge key={ur.roleId || ur.id} variant="secondary" className="flex items-center gap-1">
                        {getRoleName(ur.roleId || ur.id)}
                        {ur.isPrimary && <span className="text-[10px] text-orange-600 font-bold ml-1">★</span>}
                        <button className="ml-1 hover:text-red-500" onClick={() => removeRoleMutation.mutate({ userId: editingUserId!, roleId: ur.roleId || ur.id })}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Separator className="mt-3" />
                </div>
              )}

              <div>
                <Label className="text-xs text-gray-500 mb-2 block">Add Roles</Label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {roles.map((role: any) => (
                    <div key={role.id} className="flex items-center justify-between p-2 rounded border hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={selectedRoleIds.includes(role.id)} onCheckedChange={() => toggleRoleSelection(role.id)} />
                        <div>
                          <p className="text-sm font-medium">{role.displayName}</p>
                          <p className="text-xs text-gray-400">Level {role.level}</p>
                        </div>
                      </div>
                      {selectedRoleIds.includes(role.id) && (
                        <Button
                          variant={primaryRoleId === role.id ? "default" : "ghost"}
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setPrimaryRoleId(primaryRoleId === role.id ? null : role.id)}
                        >
                          {primaryRoleId === role.id ? "★ Primary" : "Set Primary"}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUserId(null)}>Cancel</Button>
            <Button disabled={selectedRoleIds.length === 0 || assignRolesMutation.isPending} onClick={handleSaveRoles}>
              {assignRolesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Assign Roles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccessScopesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [scopes, setScopes] = useState<{ scopeType: string; scopeValueId: string }[]>([]);

  const scopeTypes = ["branch", "warehouse", "department", "cost_center", "project"];

  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/settings/users"],
  });

  const { data: userScopes = [], isLoading: scopesLoading } = useQuery<any[]>({
    queryKey: ["/api/rbac/users", editingUserId, "scopes"],
    enabled: !!editingUserId,
  });

  const saveScopesMutation = useMutation({
    mutationFn: ({ userId, scopeData }: { userId: number; scopeData: { scopeType: string; scopeValueId: number }[] }) =>
      apiRequest(`/api/rbac/users/${userId}/scopes`, "POST", { scopes: scopeData }),
    onSuccess: () => {
      toast({ title: "Success", description: "Access scopes updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/users", editingUserId, "scopes"] });
      setEditingUserId(null);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to update scopes", variant: "destructive" });
    },
  });

  const openEditScopes = (userId: number) => {
    setEditingUserId(userId);
    setScopes([]);
  };

  const handleSaveScopes = () => {
    if (!editingUserId) return;
    const validScopes = scopes
      .filter((s) => s.scopeType && s.scopeValueId)
      .map((s) => ({ scopeType: s.scopeType, scopeValueId: parseInt(s.scopeValueId) }));
    saveScopesMutation.mutate({ userId: editingUserId, scopeData: validScopes });
  };

  const addScope = () => setScopes([...scopes, { scopeType: "branch", scopeValueId: "" }]);
  const removeScope = (index: number) => setScopes(scopes.filter((_, i) => i !== index));
  const updateScope = (index: number, field: string, value: string) => {
    const updated = [...scopes];
    (updated[index] as any)[field] = value;
    setScopes(updated);
  };

  const filteredUsers = users.filter((u: any) =>
    `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredUsers.map((user: any) => (
          <Card key={user.id}>
            <CardContent className="p-4">
              <div className="mb-3">
                <p className="font-semibold text-sm">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => openEditScopes(user.id)}>
                <Key className="w-3 h-3 mr-1" />
                Manage Scopes
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <Key className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No users found</p>
        </div>
      )}

      <Dialog open={!!editingUserId} onOpenChange={(o) => { if (!o) setEditingUserId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Access Scopes</DialogTitle>
            <DialogDescription>Define what branches, warehouses, or departments this user can access.</DialogDescription>
          </DialogHeader>

          {scopesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {userScopes.length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Current Scopes</Label>
                  <div className="flex flex-wrap gap-2">
                    {userScopes.map((s: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {s.scopeType}: #{s.scopeValueId}
                      </Badge>
                    ))}
                  </div>
                  <Separator className="mt-3" />
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-gray-500">New Scopes</Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addScope}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add Scope
                  </Button>
                </div>

                {scopes.map((scope, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select value={scope.scopeType} onValueChange={(v) => updateScope(index, "scopeType", v)}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {scopeTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Value ID"
                      value={scope.scopeValueId}
                      onChange={(e) => updateScope(index, "scopeValueId", e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => removeScope(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                {scopes.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No new scopes added yet. Click "Add Scope" above.</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUserId(null)}>Cancel</Button>
            <Button disabled={saveScopesMutation.isPending} onClick={handleSaveScopes}>
              {saveScopesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save Scopes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RolePermissions() {
  return (
    <DashboardContainer title="Roles & Permissions" subtitle="Manage roles, assign permissions, and configure access scopes">
      <Tabs defaultValue="roles" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="roles" className="flex items-center gap-1.5">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Roles</span>
          </TabsTrigger>
          <TabsTrigger value="user-roles" className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">User Roles</span>
          </TabsTrigger>
          <TabsTrigger value="access-scopes" className="flex items-center gap-1.5">
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">Scopes</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>

        <TabsContent value="user-roles">
          <UserRolesTab />
        </TabsContent>

        <TabsContent value="access-scopes">
          <AccessScopesTab />
        </TabsContent>
      </Tabs>
    </DashboardContainer>
  );
}