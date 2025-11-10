/**
 * React Query Provider for Extension
 * 
 * Provides QueryClient với caching settings matching frontend.
 * Story 12.4: React Query Integration
 */

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20 * 1000, // 20 seconds - match frontend
            gcTime: 2 * 60 * 1000, // 2 minutes - match frontend
            retry: (failureCount, error: any) => {
              // Don't retry on client errors (4xx)
              if (error?.status >= 400 && error?.status < 500) return false;
              if (error?.status === 404) return false;
              return failureCount < 3;
            },
            refetchOnMount: true,
            refetchOnWindowFocus: false,
            refetchOnReconnect: 'always',
          },
          mutations: {
            retry: (failureCount, error: any) => {
              // Don't retry on client errors (4xx)
              if (error?.status >= 400 && error?.status < 500) return false;
              return failureCount < 1;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

