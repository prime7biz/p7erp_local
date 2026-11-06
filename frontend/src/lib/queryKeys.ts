import { getTenantId } from "@/api/core";

/**
 * React Query cache key that also names the current company (tenant).
 *
 * `tenantKey("orders", "list", filters)` -> `["orders", "list", filters, { tenantId: "12" }]`.
 * The tenant goes LAST so `invalidateQueries({ queryKey: ["orders"] })` still matches every
 * orders query. Login/logout already clear the cache; this keeps two companies' data apart even
 * if a cached entry survived (e.g. switching company in another tab).
 */
export function tenantKey<const T extends readonly unknown[]>(...parts: T): [...T, { tenantId: string | null }] {
  return [...parts, { tenantId: getTenantId() }];
}
