import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  tenantId: number;
  roleId: number;
  isSuperUser: boolean;
  tenant: {
    id: number;
    name: string;
    domain: string;
    businessType: 'buying_house' | 'manufacturer' | 'both';
  };
  subscription?: {
    status: string;
    endDate: string;
    planName: string;
    maxUsers: number;
    currentUsers: number;
  };
}

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    user: user as User | undefined,
    isLoading,
    isAuthenticated: !!user && !error,
    error,
  };
}