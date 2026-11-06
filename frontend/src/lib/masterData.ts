import { api } from "@/api/client";
import { queryClient } from "@/lib/queryClient";
import { tenantKey } from "@/lib/queryKeys";
import { STALE_MASTER_DATA } from "@/lib/queryStaleTimes";

/**
 * Cached "all records" lists for dropdowns: customers, vendors, inventory items, warehouses.
 *
 * Drop-in replacements for `api.listCustomers()` etc. inside existing async loaders:
 *   `const customers = await getCustomersCached();`
 * The first call downloads the list; calls within the next 5 minutes (any page) reuse it.
 * React components can use the matching hooks in `hooks/useMasterData.ts` (same cache).
 *
 * Saving a customer / vendor / item / warehouse through the API clears the matching list automatically
 * (see `forgetMasterListsAfterWrite` in api/core.ts); `invalidateMasterData` is for anything else.
 */

type VendorParams = Parameters<typeof api.listVendors>[0];
type ItemParams = Parameters<typeof api.listInventoryItems>[0];

export const masterDataKeys = {
  customers: () => tenantKey("master", "customers"),
  vendors: (params?: VendorParams) => tenantKey("master", "vendors", params ?? {}),
  inventoryItems: (params?: ItemParams) => tenantKey("master", "inventory-items", params ?? {}),
  warehouses: () => tenantKey("master", "warehouses"),
};

export function getCustomersCached() {
  return queryClient.fetchQuery({
    queryKey: masterDataKeys.customers(),
    queryFn: () => api.listCustomers(),
    staleTime: STALE_MASTER_DATA,
  });
}

export function getVendorsCached(params?: VendorParams) {
  return queryClient.fetchQuery({
    queryKey: masterDataKeys.vendors(params),
    queryFn: () => api.listVendors(params),
    staleTime: STALE_MASTER_DATA,
  });
}

export function getInventoryItemsCached(params?: ItemParams) {
  return queryClient.fetchQuery({
    queryKey: masterDataKeys.inventoryItems(params),
    queryFn: () => api.listInventoryItems(params),
    staleTime: STALE_MASTER_DATA,
  });
}

export function getWarehousesCached() {
  return queryClient.fetchQuery({
    queryKey: masterDataKeys.warehouses(),
    queryFn: () => api.listWarehouses(),
    staleTime: STALE_MASTER_DATA,
  });
}

/** Forget a cached list so the next read downloads it again. */
export function invalidateMasterData(kind: "customers" | "vendors" | "inventory-items" | "warehouses") {
  return queryClient.invalidateQueries({ queryKey: ["master", kind] });
}
