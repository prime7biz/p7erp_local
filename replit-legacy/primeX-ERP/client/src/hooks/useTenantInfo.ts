import { useQuery } from "@tanstack/react-query";

interface TenantInfo {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyLogo: string;
}

export function useTenantInfo() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/settings/tenant-settings"],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const tenantInfo: TenantInfo = {
    companyName: data?.companyName || "",
    companyAddress: data?.companyAddress || "",
    companyPhone: data?.companyPhone || "",
    companyEmail: data?.companyEmail || "",
    companyLogo: data?.companyLogo || "",
  };

  return { tenantInfo, isLoading };
}
