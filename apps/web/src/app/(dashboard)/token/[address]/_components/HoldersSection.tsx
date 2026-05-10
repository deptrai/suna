import { getServerAuthHeader } from './getServerAuthHeader';
import { shortAddr } from '@/components/widgets/risk-badge-utils';
import { Badge } from '@/components/ui/badge';
import type { TokenHoldersSnapshot } from '@epsilon/shared';

interface HoldersSectionProps {
  address: string;
  chain: string;
}

type TokenHoldersResponse =
  | ({ success: true; stale?: boolean; unconfigured?: boolean } & TokenHoldersSnapshot)
  | { success: false; error: string };

async function fetchTokenHoldersServer(address: string, chain: string): Promise<TokenHoldersResponse> {
  try {
    const baseUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!baseUrl) return { success: false, error: 'No BACKEND_URL configured' };

    const authHeader = await getServerAuthHeader();

    const res = await fetch(`${baseUrl}/router/token-holders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ address, chain, limit: 20 }),
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      return { success: false, error: `API returned ${res.status}` };
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as TokenHoldersResponse;
    } catch {
      return { success: false, error: 'Upstream returned non-JSON' };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Format raw token balance using BigInt to avoid Number precision loss for large supplies.
// `decimals` defaults to 18 — caller should pass real decimals from token-info when available.
function formatBalance(rawBalance: string, decimals: number): string {
  if (!rawBalance) return '0';
  try {
    const raw = BigInt(rawBalance);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    // Combine whole + 4 decimal places (truncate, not round)
    const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
    const wholeNum = Number(whole);
    if (Number.isFinite(wholeNum)) {
      return numberFormatter.format(wholeNum + Number(`0.${fracStr}`));
    }
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return rawBalance;
  }
}

export async function HoldersSection({ address, chain }: HoldersSectionProps) {
  if (chain === 'solana' || chain === 'sol') {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6">
        <h2 className="text-xl font-semibold mb-4">Top Holders</h2>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-white/10 rounded-lg bg-white/5">
          Top Holders coming soon (Solana support is post-MVP)
        </div>
      </div>
    );
  }

  const data = await fetchTokenHoldersServer(address, chain);
  const isUnconfigured = data.success && (data as any).unconfigured === true;

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          Top Holders
          {data.success && data.stale && <Badge variant="secondary" className="text-[10px]">Cached</Badge>}
        </h2>
        {data.success && data.total_holders !== null && data.total_holders !== undefined && (
          <span className="text-sm text-muted-foreground">Total: {data.total_holders}</span>
        )}
      </div>

      {!data.success ? (
        <div className="p-4 text-center text-red-400 bg-red-500/10 rounded-lg border border-red-500/20">
          {data.error || 'Failed to load token holders'}
        </div>
      ) : isUnconfigured ? (
        <div className="p-4 text-center text-amber-400 bg-amber-500/10 rounded-lg border border-amber-500/20">
          Top Holders requires <code className="font-mono">MORALIS_API_KEY</code> in API config (free tier 25k req/day at moralis.io).
        </div>
      ) : data.holders && data.holders.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-white/5">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Rank</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right rounded-tr-lg">% Supply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.holders.map((holder) => {
                const isZero = holder.address?.toLowerCase() === ZERO_ADDRESS;
                const short = shortAddr(holder.address);
                return (
                  <tr key={`${holder.rank}-${holder.address}`} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-mono text-muted-foreground">{holder.rank}</td>
                    <td className="px-4 py-3 font-mono text-primary">
                      {isZero ? (
                        <span title="Zero address">{short}</span>
                      ) : (
                        <a
                          href={`https://etherscan.io/address/${holder.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {short}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatBalance(holder.balance, 18)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {Number.isFinite(holder.percentage) ? holder.percentage.toFixed(2) : '—'}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-muted-foreground border border-dashed border-white/10 rounded-lg bg-white/5">
          No holders found for this token.
        </div>
      )}
    </div>
  );
}
