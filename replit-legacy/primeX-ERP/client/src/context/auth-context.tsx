import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, Tenant } from "@shared/types";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    companyName: string,
    username: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const { toast } = useToast();

  // Get current authentication state
  const { data: userData, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    staleTime: 300000, // 5 minutes
    refetchInterval: 300000,
    retry: false, // Don't retry auth failures to avoid blocking login page
    retryDelay: 1000, // Short retry delay
    refetchOnWindowFocus: false,
    // Return null on auth failure instead of throwing error
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (!response.ok) {
          if (response.status === 401) {
            return null; // Not authenticated, but not an error
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        console.log("Auth check failed:", error);
        return null; // Return null instead of throwing for auth failures
      }
    },
  });
  
  // Update user state when userData changes
  useEffect(() => {
    if (userData) {
      setUser(userData);
      if (userData.tenant) {
        setTenant(userData.tenant as unknown as Tenant);
      }
    } else {
      setUser(null);
      setTenant(null);
    }
  }, [userData]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const res = await apiRequest("/api/auth/login", "POST", credentials);
      return res.json();
    },
    onSuccess: (data) => {
      setUser(data.user);
      setTenant(data.user.tenant);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Login successful",
        description: `Welcome back, ${data.user.username}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: {
      companyName: string;
      username: string;
      email: string;
      password: string;
    }) => {
      const res = await apiRequest("/api/auth/register", "POST", data);
      return res.json();
    },
    onSuccess: (data) => {
      setUser(data.user);
      setTenant(data.user.tenant);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Registration successful",
        description: `Welcome to Prime7 ERP, ${data.user.username}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message || "Could not create account",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/auth/logout", "POST", {});
      return res.json();
    },
    onSuccess: () => {
      setUser(null);
      setTenant(null);
      queryClient.invalidateQueries();
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  async function login(username: string, password: string) {
    await loginMutation.mutateAsync({ username, password });
  }

  async function register(
    companyName: string,
    username: string,
    email: string,
    password: string
  ) {
    await registerMutation.mutateAsync({
      companyName,
      username,
      email,
      password,
    });
  }

  async function logout() {
    await logoutMutation.mutateAsync();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        isAuthenticated: !!user,
        isLoading,
        loading: isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
