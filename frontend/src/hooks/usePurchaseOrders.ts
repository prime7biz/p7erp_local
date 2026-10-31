import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api, ApiError, type PaginatedRows, type PurchaseOrderResponse } from "@/api/client";
import { STALE_ORDER_LISTS } from "@/lib/queryStaleTimes";

export type PurchaseOrderListFilters = {
  status_filter?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  vendor_id?: number;
  order_id?: number;
  source_bom_id?: number;
  page?: number;
  page_size?: number;
};

/** Typed React Query hook for paginated purchase orders. */
export function usePurchaseOrders(
  filters: PurchaseOrderListFilters = {},
): UseQueryResult<PaginatedRows<PurchaseOrderResponse>, ApiError> {
  const status_filter = filters.status_filter ?? filters.status;

  return useQuery({
    queryKey: ["purchase-orders", "list", filters],
    queryFn: async () =>
      api.listPurchaseOrdersPaginated({
        status_filter,
        date_from: filters.date_from,
        date_to: filters.date_to,
        vendor_id: filters.vendor_id,
        order_id: filters.order_id,
        source_bom_id: filters.source_bom_id,
        page: filters.page,
        page_size: filters.page_size,
      }),
    staleTime: STALE_ORDER_LISTS,
  });
}
