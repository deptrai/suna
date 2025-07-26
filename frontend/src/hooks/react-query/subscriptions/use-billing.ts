'use client';

import { createMutationHook, createQueryHook } from '@/hooks/use-query';
import {
  createCheckoutSession,
  checkBillingStatus,
  getAvailableModels,
  CreateCheckoutSessionRequest
} from '@/lib/api';
import { modelKeys } from './keys';
import { useAuth } from '@/components/AuthProvider';

export const useAvailableModels = () => {
  const { user, isLoading } = useAuth();

  // Only enable the query if user is authenticated and not loading
  const shouldEnable = !isLoading && !!user;

  return createQueryHook(
    modelKeys.available,
    getAvailableModels,
    {
      enabled: shouldEnable,
      staleTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )();
};

export const useBillingStatus = () => {
  const { user, isLoading } = useAuth();

  // Only enable the query if user is authenticated and not loading
  const shouldEnable = !isLoading && !!user;

  return createQueryHook(
    ['billing', 'status'],
    checkBillingStatus,
    {
      enabled: shouldEnable,
      staleTime: 2 * 60 * 1000,
      refetchOnWindowFocus: true,
    }
  )();
};

export const useCreateCheckoutSession = createMutationHook(
  (request: CreateCheckoutSessionRequest) => createCheckoutSession(request),
  {
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    errorContext: {
      operation: 'create checkout session',
      resource: 'billing'
    }
  }
); 