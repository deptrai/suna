import { config } from '../../config';
import type { ProtocolSnapshot } from '../../types';

const JIT_SYNC_TIMEOUT_MS = 900;

interface DeFiLlamaTvlEntry {
  date: number;
  totalLiquidityUSD: number;
}

interface DeFiLlamaChainTvl {
  tvl: DeFiLlamaTvlEntry[];
}

interface DeFiLlamaProtocolResponse {
  id: string;
  name: string;
  chains: string[];
  tvl: DeFiLlamaTvlEntry[];
  chainTvls?: Record<string, DeFiLlamaChainTvl>;
}

export async function fetchProtocolSnapshot(
  slug: string,
  options: { chain?: string; metrics?: string[] } = {},
): Promise<ProtocolSnapshot> {
  const baseUrl = config.DEFILLAMA_API_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/protocol/${encodeURIComponent(slug)}`;

  const startTime = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(JIT_SYNC_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`DeFiLlama request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (response.status === 429) {
    throw new Error('DeFiLlama rate-limited');
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`DeFiLlama API error: ${response.status} - ${errorBody || response.statusText}`);
  }

  const data: DeFiLlamaProtocolResponse = await response.json();

  const { chain } = options;

  const tvlArr = chain
    ? data.chainTvls?.[chain]?.tvl ?? data.tvl
    : data.tvl;

  const last = tvlArr?.[tvlArr.length - 1]?.totalLiquidityUSD ?? 0;
  const prev = tvlArr?.[tvlArr.length - 2]?.totalLiquidityUSD ?? last;
  const tvl_change_24h_pct = prev > 0 ? ((last - prev) / prev) * 100 : 0;

  const elapsed = Date.now() - startTime;
  console.log(`[EPSILON] JIT sync for '${slug}' fetched in ${elapsed}ms`);

  return {
    slug,
    name: data.name,
    tvl_usd: last,
    tvl_change_24h_pct,
    apy_avg: null,
    chains: chain ? [chain] : (data.chains ?? []),
  };
}
