import { useQuery } from "@tanstack/react-query";

export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export function useAdminAuth() {
  const { data: admin, isLoading, error } = useQuery<AdminUser>({
    queryKey: ["/api/admin/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    admin: admin as AdminUser | undefined,
    isLoading,
    isAuthenticated: !!admin && !error,
    error,
  };
}
