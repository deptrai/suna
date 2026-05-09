import { config } from '../../config';
import type { ProtocolSnapshot } from '../../types';

const JIT_SYNC_TIMEOUT_MS = 1200;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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

function findChainTvl(
  chainTvls: Record<string, DeFiLlamaChainTvl> | undefined,
  chain: string,
): { key: string; tvl: DeFiLlamaTvlEntry[] } | null {
  if (!chainTvls) return null;
  const target = chain.toLowerCase();
  for (const [k, v] of Object.entries(chainTvls)) {
    if (k.toLowerCase() === target) return { key: k, tvl: v.tvl };
  }
  return null;
}

function compute24hChange(tvlArr: DeFiLlamaTvlEntry[]): number | null {
  if (!tvlArr || tvlArr.length < 2) return null;
  const last = tvlArr[tvlArr.length - 1];
  if (!last || !Number.isFinite(last.totalLiquidityUSD)) return null;

  const targetTs = last.date - 86400;
  let prev = tvlArr[tvlArr.length - 2];
  let bestGap = Math.abs((prev?.date ?? 0) - targetTs);
  for (let i = tvlArr.length - 3; i >= 0 && i >= tvlArr.length - 8; i--) {
    const cand = tvlArr[i];
    if (!cand) continue;
    const gap = Math.abs(cand.date - targetTs);
    if (gap < bestGap) {
      prev = cand;
      bestGap = gap;
    }
  }
  if (!prev || !Number.isFinite(prev.totalLiquidityUSD) || prev.totalLiquidityUSD <= 0) return null;
  return ((last.totalLiquidityUSD - prev.totalLiquidityUSD) / prev.totalLiquidityUSD) * 100;
}

export async function fetchProtocolSnapshot(
  slug: string,
  options: { chain?: string } = {},
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

  let data: DeFiLlamaProtocolResponse;
  try {
    data = (await response.json()) as DeFiLlamaProtocolResponse;
  } catch (e) {
    throw new Error(`DeFiLlama returned non-JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const { chain } = options;

  let tvlArr: DeFiLlamaTvlEntry[] | undefined;
  let resolvedChains: string[];
  if (chain) {
    const matched = findChainTvl(data.chainTvls, chain);
    if (!matched) {
      throw new Error(`DeFiLlama: chain '${chain}' not available for protocol '${slug}'`);
    }
    tvlArr = matched.tvl;
    resolvedChains = [matched.key];
  } else {
    tvlArr = data.tvl;
    resolvedChains = data.chains ?? [];
  }

  if (!tvlArr || tvlArr.length === 0) {
    throw new Error(`DeFiLlama returned no TVL data for '${slug}'`);
  }

  const lastEntry = tvlArr[tvlArr.length - 1];
  const last = lastEntry?.totalLiquidityUSD;
  if (!Number.isFinite(last)) {
    throw new Error(`DeFiLlama returned invalid TVL for '${slug}'`);
  }

  const tvl_change_24h_pct = compute24hChange(tvlArr);

  const elapsed = Date.now() - startTime;
  console.log(`[EPSILON] JIT sync for '${slug}' fetched in ${elapsed}ms`);

  return {
    slug,
    name: data.name,
    tvl_usd: last as number,
    tvl_change_24h_pct,
    apy_avg: null,
    chains: resolvedChains,
  };
}

export const _defillamaInternals = { TWENTY_FOUR_HOURS_MS };
