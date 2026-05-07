'use client';

import { useQuery } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/auth-token';
import { useAuth } from '@/components/AuthProvider';
import { useServerStore } from '@/stores/server-store';

export interface EpsilonConnector {
  id: string;
  name: string;
  description: string | null;
  source: string | null;
  pipedream_slug: string | null;
  env_keys: string[] | null;
  notes: string | null;
  auto_generated: boolean;
  created_at: string;
  updated_at: string;
}

export function useEpsilonConnectors() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery({
    queryKey: ['epsilon', 'connectors', user?.id ?? 'anonymous', serverUrl],
    queryFn: async (): Promise<EpsilonConnector[]> => {
      const url = `${serverUrl.replace(/\/+$/, '')}/epsilon/connectors`;
      const res = await authenticatedFetch(url);
      if (!res.ok) throw new Error(`Failed to fetch connectors: ${res.status}`);
      const data = await res.json();
      return data.connectors ?? [];
    },
    enabled: !isAuthLoading && !!user && !!serverUrl,
    staleTime: 30_000,
  });
}
