import Link from 'next/link';
import { getServerAuthHeader } from './getServerAuthHeader';
import { TradingViewChart } from '@/components/chart/trading-view-chart';
import type { OhlcvBar } from '@/components/chart/chart-indicators';
import { Badge } from '@/components/ui/badge';

interface ChartSectionProps {
  address: string;
  chain: string;
}

type TokenOhlcvResponse =
  | ({ success: true; stale?: boolean } & { items: OhlcvBar[]; days: number; source: string; last_updated: string })
  | { success: false; error: string };

const SOLANA_CHAINS = new Set(['solana', 'sol']);

// Narrow check on parsed JSON to avoid lying typecast — Hono HTTPException returns
// `{ message: '...' }` (no `success` field), which would silently slip past `as`-cast
// and render an empty error.
function isTokenOhlcvResponse(value: unknown): value is TokenOhlcvResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.success === true) return Array.isArray((v as { items?: unknown }).items);
  if (v.success === false) return typeof v.error === 'string';
  return false;
}

export async function fetchOhlcvServer(address: string, chain: string): Promise<TokenOhlcvResponse> {
  try {
    const baseUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!baseUrl) return { success: false, error: 'No BACKEND_URL configured' };

    const authHeader = await getServerAuthHeader();

    const res = await fetch(`${baseUrl}/router/token-ohlcv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ address, chain, days: 30 }),
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 300 },
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { success: false, error: 'Upstream returned non-JSON' };
    }
    if (!isTokenOhlcvResponse(parsed)) {
      const errMsg = typeof (parsed as { message?: unknown })?.message === 'string'
        ? (parsed as { message: string }).message
        : `Unexpected response shape (HTTP ${res.status})`;
      return { success: false, error: errMsg };
    }
    return parsed;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function ChartSection({ address, chain }: ChartSectionProps) {
  if (SOLANA_CHAINS.has(chain.toLowerCase())) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-12 flex flex-col items-center justify-center text-center space-y-2">
        <h2 className="text-xl font-semibold">
          Chart coming soon (Solana)
        </h2>
        <p className="text-muted-foreground max-w-md text-sm">
          Solana support requires GeckoTerminal — post-MVP
        </p>
      </div>
    );
  }

  const data = await fetchOhlcvServer(address, chain);

  if (!data.success) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
        <h2 className="text-xl font-semibold">Chart unavailable</h2>
        <p className="text-muted-foreground max-w-md text-sm">{data.error}</p>
        <Link
          href={`/dashboard/token/${address}?chain=${encodeURIComponent(chain)}`}
          className="mt-2 inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          Try again →
        </Link>
      </div>
    );
  }

  if (!data.items || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-64 p-6 rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl text-center">
        <h2 className="text-xl font-semibold">No chart data</h2>
        <p className="text-muted-foreground max-w-md text-sm">No OHLCV history available for this token yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl overflow-hidden relative">
      {data.stale && (
        <div className="absolute top-3 right-3 z-10">
          <Badge variant="secondary" className="text-[10px]">Cached</Badge>
        </div>
      )}
      <TradingViewChart token={shortAddr(address)} data={data.items} />
    </div>
  );
}
