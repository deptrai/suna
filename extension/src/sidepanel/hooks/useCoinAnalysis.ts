/**
 * React Query Hook for Coin Analysis
 * 
 * Fetches coin analysis data using React Query.
 * Story 12.4: React Query Integration
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CoinAnalysisData } from '../components/CoinAnalysis';

/**
 * Query keys for coin analysis
 */
export const coinAnalysisKeys = {
  all: ['coinAnalysis'] as const,
  detail: (coinName: string, symbol?: string) => 
    ['coinAnalysis', coinName, symbol] as const,
};

/**
 * Fetch coin analysis data
 * 
 * For now, uses message passing to background worker.
 * In Story 13.4, this will be enhanced với direct API calls.
 */
async function fetchCoinAnalysis(
  coinName: string,
  symbol?: string,
  price?: number
): Promise<CoinAnalysisData> {
  return new Promise((resolve, reject) => {
    // Send message to background worker to fetch analysis
    chrome.runtime.sendMessage(
      {
        type: 'FETCH_COIN_ANALYSIS',
        coinInfo: {
          name: coinName,
          symbol,
          price,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response?.error) {
          reject(new Error(response.error));
          return;
        }

        if (response?.data) {
          resolve(response.data);
          return;
        }

        // If no response, reject
        reject(new Error('No analysis data received'));
      }
    );
  });
}

/**
 * Hook for fetching coin analysis data
 */
export function useCoinAnalysis(
  coinName?: string,
  symbol?: string,
  price?: number,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    gcTime?: number;
  }
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: coinAnalysisKeys.detail(coinName || '', symbol),
    queryFn: () => {
      if (!coinName) {
        throw new Error('Coin name is required');
      }
      return fetchCoinAnalysis(coinName, symbol, price);
    },
    enabled: Boolean(coinName && (options?.enabled !== false)),
    staleTime: options?.staleTime,
    gcTime: options?.gcTime,
    retry: (failureCount, error: any) => {
      // Don't retry on client errors
      if (error?.message?.includes('400') || error?.message?.includes('401') || error?.message?.includes('403')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  /**
   * Invalidate analysis cache
   */
  const invalidateAnalysis = () => {
    queryClient.invalidateQueries({ queryKey: coinAnalysisKeys.all });
  };

  /**
   * Refetch analysis
   */
  const refetchAnalysis = () => {
    return query.refetch();
  };

  return {
    ...query,
    invalidateAnalysis,
    refetchAnalysis,
  };
}

