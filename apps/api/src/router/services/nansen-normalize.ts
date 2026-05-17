/**
 * Pure normalization helpers and signal scoring for Nansen Smart Money data.
 * All functions are side-effect free and exported for direct unit testing.
 */

import type {
  NansenWhoBoughtSoldRow,
  NansenFlowRow,
  NansenNetflowRow,
} from './nansen';

// ─── Output types ─────────────────────────────────────────────────────────────

export interface NormalizedWallet {
  address: string;
  label?: string;
  bought_volume_usd: number;
  sold_volume_usd?: number;
}

export interface NormalizedFlowBreakdown {
  label: string;
  inflow_usd: number;
  outflow_usd: number;
  netflow_usd: number;
  wallet_count: number;
  trader_count: number;
}

export interface RiskFactor {
  code: string;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

// ─── Safe numeric conversion ──────────────────────────────────────────────────

export function toNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

// ─── Top buyers normalization ─────────────────────────────────────────────────

export function normalizeTopBuyers(
  rows: NansenWhoBoughtSoldRow[],
  limit: number = 20,
): NormalizedWallet[] {
  return rows
    .map((r) => ({
      address: String(r.address ?? ''),
      label: r.label ? String(r.label) : undefined,
      bought_volume_usd: toNum(r.boughtVolumeUsd),
      sold_volume_usd: r.soldVolumeUsd !== undefined ? toNum(r.soldVolumeUsd) : undefined,
    }))
    .filter((r) => r.address !== '')
    .sort((a, b) => b.bought_volume_usd - a.bought_volume_usd)
    .slice(0, limit);
}

// ─── Top sellers normalization ────────────────────────────────────────────────

export function normalizeTopSellers(
  rows: NansenWhoBoughtSoldRow[],
  limit: number = 20,
): Array<{ address: string; label?: string; sold_volume_usd: number; bought_volume_usd?: number }> {
  return rows
    .map((r) => ({
      address: String(r.address ?? ''),
      label: r.label ? String(r.label) : undefined,
      sold_volume_usd: toNum(r.soldVolumeUsd),
      bought_volume_usd: r.boughtVolumeUsd !== undefined ? toNum(r.boughtVolumeUsd) : undefined,
    }))
    .filter((r) => r.address !== '')
    .sort((a, b) => b.sold_volume_usd - a.sold_volume_usd)
    .slice(0, limit);
}

// ─── Flow breakdown normalization ─────────────────────────────────────────────

export function normalizeFlowBreakdown(rows: NansenFlowRow[]): NormalizedFlowBreakdown[] {
  return rows.map((r) => ({
    label: String(r.label ?? 'unknown'),
    inflow_usd: toNum(r.inflowUsd),
    outflow_usd: toNum(r.outflowUsd),
    netflow_usd: toNum(r.netflowUsd),
    wallet_count: toNum(r.walletCount),
    trader_count: toNum(r.traderCount),
  }));
}

// ─── Summary from netflow rows ────────────────────────────────────────────────

export function summarizeNetflow(rows: NansenNetflowRow[]): {
  smart_money_net_flow_usd: number;
  exchange_net_flow_usd: number | null;
  wallet_count: number;
} {
  let smartMoneyNet = 0;
  let walletCount = 0;
  for (const r of rows) {
    smartMoneyNet += toNum(r.netflowUsd);
    walletCount += toNum(r.walletCount);
  }
  return { smart_money_net_flow_usd: smartMoneyNet, exchange_net_flow_usd: null, wallet_count: walletCount };
}

// ─── Signal scoring ───────────────────────────────────────────────────────────

interface ScoreInput {
  smartMoneyNetFlowUsd?: number | null;
  exchangeNetFlowUsd?: number | null;
  topBuyerCount?: number;
  topSellerCount?: number;
  flowBreakdown?: NormalizedFlowBreakdown[];
  isPartialData?: boolean;
}

export function computeSignalFactors(input: ScoreInput): RiskFactor[] {
  const factors: RiskFactor[] = [];

  const smNet = input.smartMoneyNetFlowUsd ?? 0;
  const exNet = input.exchangeNetFlowUsd ?? 0;
  const buyCount = input.topBuyerCount ?? 0;
  const sellCount = input.topSellerCount ?? 0;

  // Smart money accumulation: net inflow significant positive
  if (smNet > 0) {
    factors.push({
      code: 'smart_money_accumulation',
      label: 'Smart money net buying detected',
      severity: smNet > 1_000_000 ? 'high' : 'medium',
    });
  }

  // Smart money distribution: net outflow
  if (smNet < 0) {
    factors.push({
      code: 'smart_money_distribution',
      label: 'Smart money net selling detected',
      severity: Math.abs(smNet) > 1_000_000 ? 'high' : 'medium',
    });
  }

  // Exchange inflow → sell pressure risk
  if (exNet > 0) {
    factors.push({
      code: 'exchange_inflow_sell_pressure',
      label: 'Exchange inflow detected — potential sell pressure',
      severity: exNet > 500_000 ? 'high' : 'low',
    });
  }

  // Exchange outflow + smart money inflow → accumulation signal
  if (exNet < 0 && smNet > 0) {
    factors.push({
      code: 'exchange_outflow_accumulation',
      label: 'Exchange outflow with smart money buying — accumulation signal',
      severity: 'medium',
    });
  }

  // High buyer concentration: top buyer count very small relative to seller count
  if (buyCount > 0 && sellCount > 0 && buyCount / (buyCount + sellCount) > 0.8) {
    factors.push({
      code: 'high_buyer_concentration',
      label: 'High buyer concentration among smart money wallets',
      severity: 'medium',
    });
  }

  if (input.isPartialData) {
    factors.push({
      code: 'provider_partial_data',
      label: 'Provider returned partial data — results may be incomplete',
      severity: 'low',
    });
  }

  return factors;
}

export function deriveRiskLevel(factors: RiskFactor[]): RiskLevel {
  if (factors.some((f) => f.severity === 'critical')) return 'critical';
  if (factors.some((f) => f.severity === 'high')) return 'high';
  if (factors.some((f) => f.severity === 'medium')) return 'medium';
  if (factors.some((f) => f.severity === 'low')) return 'low';
  return 'none';
}

export function buildSignalSummary(input: ScoreInput & {
  topBuyers: NormalizedWallet[];
  topSellers: Array<{ address: string; label?: string; sold_volume_usd: number }>;
}): {
  signal: string;
  smart_money_net_flow_usd?: number | null;
  exchange_net_flow_usd?: number | null;
  top_buyer_count?: number;
  top_seller_count?: number;
} {
  const smNet = input.smartMoneyNetFlowUsd ?? 0;
  let signal = 'neutral';
  if (smNet > 500_000) signal = 'bullish';
  else if (smNet > 0) signal = 'mildly_bullish';
  else if (smNet < -500_000) signal = 'bearish';
  else if (smNet < 0) signal = 'mildly_bearish';

  return {
    signal,
    smart_money_net_flow_usd: input.smartMoneyNetFlowUsd ?? null,
    exchange_net_flow_usd: input.exchangeNetFlowUsd ?? null,
    top_buyer_count: input.topBuyers.length,
    top_seller_count: input.topSellers.length,
  };
}
