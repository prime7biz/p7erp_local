import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api, ApiError, type ListWithTotal, type VoucherResponse } from "@/api/client";
import { STALE_ORDER_LISTS } from "@/lib/queryStaleTimes";

export type VoucherListFilters = {
  status_filter?: string;
  status?: string;
  from_date?: string;
  to_date?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  voucher_id?: number;
  limit?: number;
  offset?: number;
};

/** Typed React Query hook for vouchers (list + total). */
export function useVouchers(
  filters: VoucherListFilters = {},
): UseQueryResult<ListWithTotal<VoucherResponse>, ApiError> {
  const status_filter = filters.status_filter ?? filters.status;

  return useQuery({
    queryKey: ["vouchers", "list", filters],
    queryFn: async () =>
      api.listVouchersWithTotal({
        status_filter,
        from_date: filters.from_date ?? filters.date_from,
        to_date: filters.to_date ?? filters.date_to,
        search: filters.search,
        voucher_id: filters.voucher_id,
        limit: filters.limit,
        offset: filters.offset,
      }),
    staleTime: STALE_ORDER_LISTS,
  });
}
