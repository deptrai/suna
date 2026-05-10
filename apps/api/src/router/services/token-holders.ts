import { config } from '../../config';
import type { EvmChain } from '@epsilon/shared';

const TOKEN_HOLDERS_TIMEOUT_MS = 2500;

const MORALIS_CHAIN_MAP: Record<EvmChain, string> = {
  ethereum: 'eth',
  arbitrum: 'arbitrum',
  base: 'base',
  polygon: 'polygon',
  bsc: 'bsc',
  avalanche: 'avalanche',
  optimism: 'optimism',
};

export interface HolderEntry {
  address: string;
  balance: string;
  percentage: number;
  rank: number;
}

export interface TokenHoldersSnapshot {
  holders: HolderEntry[];
  total_holders: number | null;
  chain: string;
  address: string;
  checked_at: string;
  source: 'moralis';
  unconfigured?: boolean;
}

export async function fetchTokenHolders(
  address: string,
  chain: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<TokenHoldersSnapshot> {
  if (chain === 'solana' || chain === 'sol') {
    throw new Error('Solana token holders require paid tier (planned post-MVP)');
  }
  const moralisChain = MORALIS_CHAIN_MAP[chain as EvmChain];
  if (!moralisChain) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  if (!config.MORALIS_API_KEY) {
    // Return explicit `unconfigured: true` so UI can distinguish "no data" from "misconfigured".
    return {
      holders: [],
      total_holders: null,
      chain,
      address,
      checked_at: new Date().toISOString(),
      source: 'moralis',
      unconfigured: true,
    };
  }
  const limit = Math.min(options.limit ?? 20, 100);
  const safeAddr = encodeURIComponent(address);
  const url = `https://deep-index.moralis.io/api/v2.2/erc20/${safeAddr}/owners?chain=${moralisChain}&limit=${limit}`;

  const signal = options.signal ?? AbortSignal.timeout(TOKEN_HOLDERS_TIMEOUT_MS);
  const resp = await fetch(url, {
    headers: { 'X-API-Key': config.MORALIS_API_KEY, Accept: 'application/json' },
    signal,
  });
  if (!resp.ok) {
    let snippet = '';
    try {
      snippet = (await resp.text()).slice(0, 200);
    } catch { /* ignore */ }
    throw new Error(`Moralis API error: ${resp.status}${snippet ? ` - ${snippet}` : ''}`);
  }
  let body: { result?: any[] };
  try {
    body = await resp.json() as { result?: any[] };
  } catch {
    throw new Error('Moralis API returned non-JSON response');
  }
  const holders: HolderEntry[] = (body.result ?? [])
    .filter((entry) => entry && typeof entry.owner_address === 'string')
    .map((entry, idx) => ({
      address: entry.owner_address,
      balance: String(entry.balance ?? '0'),
      percentage: Number(entry.percentage_relative_to_total_supply ?? 0) || 0,
      rank: idx + 1,
    }));
  return {
    holders,
    // Moralis /owners doesn't return total holders count; null signals "unknown" to UI.
    total_holders: null,
    chain,
    address,
    checked_at: new Date().toISOString(),
    source: 'moralis',
  };
}
