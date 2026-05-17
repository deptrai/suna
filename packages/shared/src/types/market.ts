export interface ProtocolMetrics {
  id: string;
  name: string;
  symbol: string;
  tvl: number;
  apy7d: number;
  apy30d: number;
  chain: string;
  change24h: number;
  sparkline7d: number[];
}

export interface SmartMoneyMovement {
  id: string;
  walletAddress: string;
  tokenAddress?: string | null;
  tokenSymbol: string;
  amount: number;
  amountUsd: number;
  direction: 'inflow' | 'outflow';
  timestamp: string;
}

export interface TokenInfoSnapshot {
  name: string;
  symbol: string;
  price_usd: number | null;
  market_cap_usd: number | null;
  change_24h_pct: number | null;
  logo_url?: string | null;
  stale?: boolean;
}

export interface HolderEntry {
  address: string;
  /** Raw on-chain balance as a base-10 string (no decimal applied). */
  balance: string;
  /** Human-readable balance with token decimals applied (Moralis `balance_formatted`). */
  balance_formatted?: string;
  percentage: number;
  rank: number;
}

export interface TokenHoldersSnapshot {
  holders: HolderEntry[];
  total_holders: number | null;
  chain?: string;
  address?: string;
  checked_at?: string;
  source?: string;
  // Set to true when MORALIS_API_KEY is missing — UI can show actionable message instead of "no data".
  unconfigured?: boolean;
}
