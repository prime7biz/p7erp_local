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
type ActiveParams = { active_only?: boolean };

export const masterDataKeys = {
  customers: () => tenantKey("master", "customers"),
  vendors: (params?: VendorParams) => tenantKey("master", "vendors", params ?? {}),
  inventoryItems: (params?: ItemParams) => tenantKey("master", "inventory-items", params ?? {}),
  warehouses: () => tenantKey("master", "warehouses"),
  chartOfAccounts: (params?: ActiveParams) => tenantKey("master", "chart-of-accounts", params ?? {}),
  accountGroups: () => tenantKey("master", "account-groups"),
  costCenters: (params?: ActiveParams) => tenantKey("master", "cost-centers", params ?? {}),
  bankAccounts: (params?: ActiveParams) => tenantKey("master", "bank-accounts", params ?? {}),
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

/*
 * Finance pick-lists (accounts, groups, cost centres, bank accounts) for dropdowns only.
 * Account rows carry live balances: screens that SHOW balances (trial balance, ledger, chart of
 * accounts, bank accounts) must keep calling the API directly.
 */
export function getChartOfAccountsCached(params?: ActiveParams) {
  return queryClient.fetchQuery({
    queryKey: masterDataKeys.chartOfAccounts(params),
    queryFn: () => api.listChartOfAccounts(params),
    staleTime: STALE_MASTER_DATA,
  });
}

export function getAccountGroupsCached() {
  return queryClient.fetchQuery({
    queryKey: masterDataKeys.accountGroups(),
    queryFn: () => api.listAccountGroups(),
    staleTime: STALE_MASTER_DATA,
  });
}

export function getCostCentersCached(params?: ActiveParams) {
  return queryClient.fetchQuery({
    queryKey: masterDataKeys.costCenters(params),
    queryFn: () => api.listCostCenters(params),
    staleTime: STALE_MASTER_DATA,
  });
}

export function getBankAccountsCached(params?: ActiveParams) {
  return queryClient.fetchQuery({
    queryKey: masterDataKeys.bankAccounts(params),
    queryFn: () => api.listBankAccounts(params),
    staleTime: STALE_MASTER_DATA,
  });
}

export type MasterDataKind =
  | "customers"
  | "vendors"
  | "inventory-items"
  | "warehouses"
  | "chart-of-accounts"
  | "account-groups"
  | "cost-centers"
  | "bank-accounts";

/** Forget a cached list so the next read downloads it again. */
export function invalidateMasterData(kind: MasterDataKind) {
  return queryClient.invalidateQueries({ queryKey: ["master", kind] });
}
