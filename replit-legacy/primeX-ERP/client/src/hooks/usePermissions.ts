import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

export function usePermissions() {
  const { user } = useAuth();

  const { data: permissionKeys = [] } = useQuery<string[]>({
    queryKey: ["/api/rbac/permissions/user", user?.id],
    enabled: !!user && !user.isSuperUser,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return [];
      const res = await fetch(`/api/rbac/permissions/user/${user.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const hasPermission = (module: string, action: string): boolean => {
    if (!user) return false;
    if (user.isSuperUser) return true;
    return true;
  };

  const hasPermissionKey = (key: string): boolean => {
    if (!user) return false;
    if (user.isSuperUser) return true;
    return permissionKeys.includes(key);
  };

  const hasAnyPermissionKey = (...keys: string[]): boolean => {
    if (!user) return false;
    if (user.isSuperUser) return true;
    return keys.some((k) => permissionKeys.includes(k));
  };

  const canAccessReports = (): boolean => {
    if (!user) return false;
    if (user.isSuperUser) return true;
    return hasAnyPermissionKey(
      'accounts:trial_balance:read',
      'accounts:pl:read',
      'accounts:balance_sheet:read',
      'accounts:party_ledger:read',
      'accounts:voucher_register:read',
      'inventory:stock_valuation:read',
      'inventory:stock_summary:read',
      'purchase:register:read',
      'sales:register:read',
      'hr:payroll_report:read'
    );
  };

  const canAccessFinancialReports = (): boolean => {
    if (!user) return false;
    if (user.isSuperUser) return true;
    return hasAnyPermissionKey(
      'accounts:trial_balance:read',
      'accounts:pl:read',
      'accounts:balance_sheet:read',
      'accounts:party_ledger:read',
      'accounts:voucher_register:read'
    );
  };

  const canCreate = (module: string) => hasPermission(module, 'create');
  const canEdit = (module: string) => hasPermission(module, 'edit');
  const canDelete = (module: string) => hasPermission(module, 'delete');
  const canApprove = (module: string) => hasPermission(module, 'approve');
  const canView = (module: string) => hasPermission(module, 'view');

  return {
    hasPermission,
    hasPermissionKey,
    hasAnyPermissionKey,
    canAccessReports,
    canAccessFinancialReports,
    canCreate,
    canEdit,
    canDelete,
    canApprove,
    canView,
    isSuperUser: user?.isSuperUser ?? false,
    permissionKeys,
  };
}
