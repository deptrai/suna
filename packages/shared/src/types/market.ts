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
