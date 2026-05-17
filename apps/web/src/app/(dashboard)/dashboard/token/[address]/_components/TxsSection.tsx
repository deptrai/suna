import { getServerAuthHeader } from './getServerAuthHeader';
import { shortAddr, relativeTimeFrom } from '@/components/widgets/risk-badge-utils';
import { Badge } from '@/components/ui/badge';

interface TxsSectionProps {
  address: string;
  chain: string;
}

interface TransactionEntry {
  hash: string;
  from: string;
  to: string;
  value: string;
  // Number of decimals for the token (e.g. 18 for most ERC-20). Used to format `value`.
  value_decimal: number;
  timestamp: string;
  // Block number is returned as a string by Etherscan/Blockscout APIs.
  block_number: string;
  gas_used: string;
  type: 'transfer';
}

interface TokenTransactionsSnapshot {
  transactions: TransactionEntry[];
  chain: string;
  address: string;
  checked_at: string;
  source: string;
}

type TokenTransactionsResponse =
  | ({ success: true; stale?: boolean } & Partial<TokenTransactionsSnapshot>)
  | { success: false; error: string };

async function fetchTokenTransactionsServer(address: string, chain: string): Promise<TokenTransactionsResponse> {
  try {
    const baseUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!baseUrl) return { success: false, error: 'No BACKEND_URL configured' };

    const authHeader = await getServerAuthHeader();

    const res = await fetch(`${baseUrl}/router/token-transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ address, chain }),
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return { success: false, error: `API returned ${res.status}` };
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as TokenTransactionsResponse;
    } catch {
      return { success: false, error: 'Upstream returned non-JSON' };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

const getExplorerUrl = (chain: string, hash: string) => {
  switch (chain) {
    case 'ethereum': return `https://etherscan.io/tx/${hash}`;
    case 'arbitrum': return `https://arbiscan.io/tx/${hash}`;
    case 'base': return `https://basescan.org/tx/${hash}`;
    case 'polygon': return `https://polygonscan.com/tx/${hash}`;
    case 'bsc': return `https://bscscan.com/tx/${hash}`;
    case 'avalanche': return `https://snowtrace.io/tx/${hash}`;
    case 'optimism': return `https://optimistic.etherscan.io/tx/${hash}`;
    default: return `https://etherscan.io/tx/${hash}`;
  }
};

const getAddressExplorerUrl = (chain: string, addr: string) => {
  switch (chain) {
    case 'ethereum': return `https://etherscan.io/address/${addr}`;
    case 'arbitrum': return `https://arbiscan.io/address/${addr}`;
    case 'base': return `https://basescan.org/address/${addr}`;
    case 'polygon': return `https://polygonscan.com/address/${addr}`;
    case 'bsc': return `https://bscscan.com/address/${addr}`;
    case 'avalanche': return `https://snowtrace.io/address/${addr}`;
    case 'optimism': return `https://optimistic.etherscan.io/address/${addr}`;
    default: return `https://etherscan.io/address/${addr}`;
  }
};

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function formatTxValue(rawValue: string, decimals: number): string {
  if (!rawValue) return '0';
  try {
    const raw = BigInt(rawValue);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
    const wholeNum = Number(whole);
    if (Number.isFinite(wholeNum)) {
      return numberFormatter.format(wholeNum + Number(`0.${fracStr}`));
    }
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return rawValue;
  }
}

function renderAddrCell(chain: string, addr: string | undefined) {
  if (!addr) return <span className="text-muted-foreground">—</span>;
  const isZero = addr.toLowerCase() === ZERO_ADDRESS;
  if (isZero) {
    return <span className="font-mono text-muted-foreground" title="Zero address (mint/burn)">{shortAddr(addr)}</span>;
  }
  return (
    <a
      href={getAddressExplorerUrl(chain, addr)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono hover:text-primary transition-colors"
    >
      {shortAddr(addr)}
    </a>
  );
}

export async function TxsSection({ address, chain }: TxsSectionProps) {
  if (chain === 'solana' || chain === 'sol') {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-white/10 rounded-lg bg-white/5">
          Transactions coming soon (Solana support is post-MVP)
        </div>
      </div>
    );
  }

  const data = await fetchTokenTransactionsServer(address, chain);

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          Recent Transactions
          {data.success && data.stale && <Badge variant="secondary" className="text-[10px]">Cached</Badge>}
        </h2>
      </div>

      {!data.success ? (
        <div className="p-4 text-center text-red-400 bg-red-500/10 rounded-lg border border-red-500/20">
          {data.error || 'Failed to load token transactions'}
        </div>
      ) : data.transactions && data.transactions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-white/5">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Txn Hash</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3 text-right rounded-tr-lg">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.transactions.map((tx) => (
                <tr key={`${tx.hash}-${tx.block_number}-${tx.from}-${tx.to}`} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-mono text-primary">
                    <a
                      href={getExplorerUrl(chain, tx.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {shortAddr(tx.hash)}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {relativeTimeFrom(tx.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {tx.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{renderAddrCell(chain, tx.from)}</td>
                  <td className="px-4 py-3">{renderAddrCell(chain, tx.to)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    {formatTxValue(tx.value, Number(tx.value_decimal) || 18)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-muted-foreground border border-dashed border-white/10 rounded-lg bg-white/5">
          No recent transactions found.
        </div>
      )}
    </div>
  );
}
