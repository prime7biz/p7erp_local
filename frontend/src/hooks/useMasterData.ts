import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { masterDataKeys } from "@/lib/masterData";
import { STALE_MASTER_DATA } from "@/lib/queryStaleTimes";

/**
 * React hooks for cached master lists (customers, vendors, items, warehouses).
 * Same cache as the `get…Cached()` helpers in `lib/masterData.ts` (5-minute staleTime, per company).
 * For very large lists prefer `RemoteSearchSelect`, which searches the server as you type.
 */

export function useCustomersList(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: masterDataKeys.customers(),
    queryFn: () => api.listCustomers(),
    staleTime: STALE_MASTER_DATA,
    enabled: options.enabled ?? true,
  });
}

export function useVendorsList(params?: Parameters<typeof api.listVendors>[0], options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: masterDataKeys.vendors(params),
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
    queryKey: masterDataKeys.inventoryItems(params),
    queryFn: () => api.listInventoryItems(params),
    staleTime: STALE_MASTER_DATA,
    enabled: options.enabled ?? true,
  });
}

export function useWarehousesList(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: masterDataKeys.warehouses(),
    queryFn: () => api.listWarehouses(),
    staleTime: STALE_MASTER_DATA,
    enabled: options.enabled ?? true,
  });
}
