import { createQueryHook } from "@/hooks/use-query";
import { threadKeys } from "./keys";
import { checkBillingStatus, BillingStatusResponse } from "@/lib/api";
import { Query } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";

export const useBillingStatusQuery = (enabled = true) => {
  const { user, isLoading } = useAuth();

  // Only enable the query if user is authenticated and not loading
  const shouldEnable = enabled && !isLoading && !!user;

  return createQueryHook(
    threadKeys.billingStatus,
    () => checkBillingStatus(),
    {
      enabled: shouldEnable,
      retry: 1,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchInterval: (query: Query<BillingStatusResponse, Error>) => {
        if (query.state.data && !query.state.data.can_run) {
          return 1000 * 60;
        }
        return false;
      },
    }
  )();
};
