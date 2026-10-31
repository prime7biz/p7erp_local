import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api, ApiError, type OrderListPageResponse } from "@/api/client";
import { STALE_ORDER_LISTS } from "@/lib/queryStaleTimes";

/** Filters for paginated orders list (matches API query params). */
export type OrderListFilters = {
  status?: string;
  search?: string;
  created_from?: string;
  created_to?: string;
  customer_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
  ai_indicators?: number;
};

/**
 * Typed React Query hook for paginated orders.
 * Maps date_from/date_to aliases onto created_from/created_to for callers.
 */
export function useOrders(
  filters: OrderListFilters = {},
): UseQueryResult<OrderListPageResponse, ApiError> {
  const {
    status,
    search,
    created_from,
    created_to,
    date_from,
    date_to,
    page,
    page_size,
    ai_indicators,
  } = filters;

  return useQuery({
    queryKey: ["orders", "list", filters],
    queryFn: async () =>
      api.listOrdersPaginated({
        status,
        search,
        created_from: created_from ?? date_from,
        created_to: created_to ?? date_to,
        page,
        page_size,
        ai_indicators,
      }),
    staleTime: STALE_ORDER_LISTS,
  });
}
