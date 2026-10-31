import { QueryClient } from "@tanstack/react-query";
import { STALE_DASHBOARD_KPIS } from "@/lib/queryStaleTimes";

/** Shared TanStack Query client: tuned to reduce refetch churn on list pages. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_DASHBOARD_KPIS,
      refetchOnWindowFocus: false,
    },
  },
});
