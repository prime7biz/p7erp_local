import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { tenantKey } from "@/lib/queryKeys";
import { STALE_MASTER_DATA } from "@/lib/queryStaleTimes";

/**
 * Cached master lists for dropdowns (customers, vendors, items, warehouses).
 *
 * Several pages used to download the full list again on every visit. These hooks share one
 * cached copy per company for 5 minutes. For very large lists prefer `RemoteSearchSelect`
 * (searches the server as you type) instead of loading everything.
 *
 * After creating/editing a record, refresh with
 * `queryClient.invalidateQueries({ queryKey: ["master", "customers"] })`.
 */

export function useCustomersList(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: tenantKey("master", "customers"),
    queryFn: () => api.listCustomers(),
    staleTime: STALE_MASTER_DATA,
    enabled: options.enabled ?? true,
  });
}

export function useVendorsList(params?: Parameters<typeof api.listVendors>[0], options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: tenantKey("master", "vendors", params ?? {}),
    queryFn: () => api.listVendors(params),
    staleTime: STALE_MASTER_DATA,
    enabled: options.enabled ?? true,
  });
}

export function useInventoryItemsList(
  params?: Parameters<typeof api.listInventoryItems>[0],
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: tenantKey("master", "inventory-items", params ?? {}),
    queryFn: () => api.listInventoryItems(params),
    staleTime: STALE_MASTER_DATA,
    enabled: options.enabled ?? true,
  });
}

export function useWarehousesList(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: tenantKey("master", "warehouses"),
    queryFn: () => api.listWarehouses(),
    staleTime: STALE_MASTER_DATA,
    enabled: options.enabled ?? true,
  });
}
