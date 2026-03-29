import { QueryClient } from "@tanstack/react-query";

/** Shared TanStack Query client: tuned to reduce refetch churn on list pages. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});
