import { Badge } from '@/components/ui/badge';
import { getServerAuthHeader } from './getServerAuthHeader';
import { shortAddr } from '@/components/widgets/risk-badge-utils';
import type { TokenInfoSnapshot } from '@epsilon/shared';

interface HeaderSectionProps {
  address: string;
  chain: string;
}

interface TokenInfoResponse extends Partial<TokenInfoSnapshot> {
  success: boolean;
  error?: string;
  stale?: boolean;
}

async function fetchTokenInfoServer(address: string, chain: string): Promise<TokenInfoResponse> {
  try {
    const baseUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!baseUrl) return { success: false, error: 'No BACKEND_URL configured' };

    const authHeader = await getServerAuthHeader();

    const res = await fetch(`${baseUrl}/router/token-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ address, chain }),
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return { success: false, error: `API returned ${res.status}` };
    }

    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as TokenInfoResponse;
      // Guard partial responses where success=true but core fields missing — treat as soft failure
      // so HeaderSection renders "Listing pending" fallback rather than blank `name`/`symbol`.
      if (parsed.success && (!parsed.name || !parsed.symbol)) {
        return { success: false, error: 'Upstream returned partial token-info response' };
      }
      return parsed;
    } catch {
      return { success: false, error: 'Upstream returned non-JSON' };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  compactDisplay: 'short',
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
});

export async function HeaderSection({ address, chain }: HeaderSectionProps) {
  const data = await fetchTokenInfoServer(address, chain);

  if (!data.success) {
    // Render fallback UI for unindexed tokens (AC1)
    return (
      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 p-6 rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white/50 font-bold text-xl">
            ?
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight font-mono">{shortAddr(address)}</h1>
              <Badge variant="outline" className="capitalize text-xs">
                {chain}
              </Badge>
            </div>
            <p className="text-muted-foreground">Listing pending / Unindexed token</p>
          </div>
        </div>
      </div>
    );
  }

  const { symbol, name, price_usd, market_cap_usd, change_24h_pct } = data;
  const hasChange = Number.isFinite(change_24h_pct);
  const isPositive = hasChange && (change_24h_pct as number) >= 0;

  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 p-6 rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
          {symbol?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
            <Badge variant="secondary" className="uppercase">{symbol}</Badge>
            <Badge variant="outline" className="capitalize text-xs">{chain}</Badge>
            {data.stale && (
              <Badge variant="destructive" className="text-[10px]">⚠️ Cached</Badge>
            )}
          </div>
          <div className="font-mono text-sm text-muted-foreground flex items-center gap-2">
            {address}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end space-y-1 text-right">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold font-mono">
            {price_usd != null ? currencyFormatter.format(price_usd) : 'N/A'}
          </span>
          {hasChange && (
            <span className={`text-lg font-medium font-mono ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {percentFormatter.format((change_24h_pct as number) / 100)}
            </span>
          )}
        </div>
        
        {market_cap_usd !== null && market_cap_usd !== undefined && (
          <div className="text-sm text-muted-foreground">
            MCap: {compactCurrencyFormatter.format(market_cap_usd)}
          </div>
        )}
      </div>
    </div>
  );
}
