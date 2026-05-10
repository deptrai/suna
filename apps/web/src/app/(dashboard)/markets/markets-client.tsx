'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProtocolMetrics } from '@epsilon/shared';
import { ProtocolsTable } from '@/components/markets/protocols-table';
import { SmartMoneyVisualizer } from '@/components/markets/smart-money-visualizer';
import { getEnv } from '@/lib/env-config';
import { getAuthToken } from '@/lib/auth-token';

const REVALIDATE_MS = 60_000;

async function fetchProtocols(): Promise<ProtocolMetrics[]> {
  const baseUrl = getEnv().BACKEND_URL;
  if (!baseUrl) return [];
  const token = await getAuthToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${baseUrl}/market/protocols`, { cache: 'no-store', headers });
  if (!res.ok) return [];
  const body = (await res.json()) as { items?: ProtocolMetrics[] };
  return body.items ?? [];
}

export function MarketsClient() {
  const { data: protocols = [] } = useQuery({
    queryKey: ['markets', 'protocols'],
    queryFn: fetchProtocols,
    staleTime: REVALIDATE_MS,
    refetchInterval: REVALIDATE_MS,
    refetchIntervalInBackground: false,
  });

  return (
    <div className="container max-w-6xl py-8 space-y-8 animate-in fade-in zoom-in duration-500 ease-out">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">DeFi & Market Dashboard</h1>
        <p className="text-muted-foreground text-lg">
          Live protocols metrics and smart money movement across chains.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6 transition-all duration-300 hover:border-white/20">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-white/90">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Top Protocols
            </h2>
            <ProtocolsTable data={protocols} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6 h-full transition-all duration-300 hover:border-white/20">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-white/90">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
              Smart Money Flow
            </h2>
            <SmartMoneyVisualizer initialData={[]} />
          </div>
        </div>
      </div>
    </div>
  );
}
