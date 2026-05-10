'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDownIcon, ArrowUpIcon, WalletIcon } from 'lucide-react';
import { getEnv } from '@/lib/env-config';
import { getAuthToken } from '@/lib/auth-token';
import type { SmartMoneyMovement } from '@epsilon/shared';

const POLL_INTERVAL_MS = 60_000;

function formatAddress(addr: string): string {
  if (typeof addr !== 'string') return '';
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatCurrency(val: number): string {
  if (!Number.isFinite(val)) return '—';
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  return `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function fetchSmartMoney(): Promise<SmartMoneyMovement[]> {
  const baseUrl = getEnv().BACKEND_URL;
  if (!baseUrl) return [];
  const token = await getAuthToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${baseUrl}/market/smart-money`, { cache: 'no-store', headers });
  if (!res.ok) return [];
  const body = (await res.json()) as { items?: SmartMoneyMovement[] };
  return body.items ?? [];
}

export function SmartMoneyVisualizer({ initialData }: { initialData: SmartMoneyMovement[] }) {
  const { data = initialData, isFetching } = useQuery({
    queryKey: ['markets-smart-money'],
    queryFn: fetchSmartMoney,
    initialData,
    initialDataUpdatedAt: 0, // treat initialData as stale → fetch immediately
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    staleTime: POLL_INTERVAL_MS / 2,
  });

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <WalletIcon className="h-4 w-4" />
            Smart Money Flow
          </CardTitle>
          <p className="text-xs text-muted-foreground">Top wallet movements (Inflows / Outflows)</p>
        </div>
        {isFetching && (
          <span className="flex h-2 w-2" aria-label="Refreshing">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No smart money movements yet.
          </p>
        ) : (
          <div className="space-y-4">
            {data.map((movement) => {
              const isInflow = movement.direction === 'inflow';
              const directionLabel = isInflow ? 'Deposited' : 'Withdrew';
              return (
                <div key={movement.id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 ${isInflow ? 'text-emerald-500' : 'text-rose-500'}`}
                      aria-label={isInflow ? 'Inflow' : 'Outflow'}
                    >
                      {isInflow ? <ArrowDownIcon className="h-4 w-4" aria-hidden /> : <ArrowUpIcon className="h-4 w-4" aria-hidden />}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none flex items-center gap-1.5">
                        {formatAddress(movement.walletAddress)}
                        <span className="text-muted-foreground text-xs font-normal">
                          {formatTime(movement.timestamp)}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {directionLabel} {movement.amount.toFixed(2)} {movement.tokenSymbol}
                      </p>
                    </div>
                  </div>
                  <div className={`text-sm font-mono font-medium ${isInflow ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isInflow ? '+' : '-'}{formatCurrency(movement.amountUsd)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
