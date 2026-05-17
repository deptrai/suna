export type MetricMap = Record<string, number | null>;

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export interface RiskFactor { code: string; label: string; severity: RiskSeverity }

export interface SnapshotInput {
  projectId: string;
  projectName?: string | null;
  symbol?: string | null;
  sector?: string | null;
  values: MetricMap;
  /** Days covered by the source aggregation. Detected per metric upstream; pass-in here for annualization. */
  periodDays?: number;
}

export function asNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

export function annualize(v: number | null, days = 30): number | null {
  if (v === null) return null;
  if (!Number.isFinite(v)) return null;
  if (days <= 0) return null;
  return v * (365 / days);
}

export function safeRatio(num: number | null, den: number | null): number | null {
  if (num === null || den === null) return null;
  if (!Number.isFinite(num) || !Number.isFinite(den)) return null;
  if (den === 0) return null;
  return num / den;
}

export function percentile(peers: number[], value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const sortedPeers = peers.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (sortedPeers.length === 0) return null;
  const lower = sortedPeers.filter((x) => x <= value).length;
  return Number(((lower / sortedPeers.length) * 100).toFixed(2));
}

const PERCENTILE_LOW = 33;
const PERCENTILE_HIGH = 67;

/**
 * Sector-percentile classification per spec AC5.
 * Lower percentile on P/S, P/F, P/E = cheaper relative to peers = undervalued.
 * Returns insufficient_data when all three percentiles are null.
 */
export function classifyValuationByPercentiles(
  psPct: number | null,
  pfPct: number | null,
  pePct: number | null,
): 'undervalued' | 'fair' | 'overvalued' | 'insufficient_data' {
  const vals = [psPct, pfPct, pePct].filter((v): v is number => typeof v === 'number');
  if (vals.length === 0) return 'insufficient_data';
  const avgPct = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (avgPct < PERCENTILE_LOW) return 'undervalued';
  if (avgPct > PERCENTILE_HIGH) return 'overvalued';
  return 'fair';
}

export function buildSnapshot(input: SnapshotInput) {
  const days = input.periodDays && input.periodDays > 0 ? input.periodDays : 30;
  const fees = asNum(input.values.fees);
  const revenue = asNum(input.values.revenue);
  const earnings = asNum(input.values.earnings);
  const mcapFd = asNum(input.values.market_cap_fully_diluted);
  const mcapCirc = asNum(input.values.market_cap_circulating);

  const feesA = annualize(fees, days);
  const revenueA = annualize(revenue, days);
  const earningsA = annualize(earnings, days);

  const psFd = asNum(input.values.ps_ratio_fully_diluted) ?? safeRatio(mcapFd, revenueA);
  const psCirc = asNum(input.values.ps_ratio_circulating) ?? safeRatio(mcapCirc, revenueA);
  const pfFd = asNum(input.values.pf_ratio_fully_diluted) ?? safeRatio(mcapFd, feesA);
  const pfCirc = asNum(input.values.pf_ratio_circulating) ?? safeRatio(mcapCirc, feesA);
  const pe = safeRatio(mcapCirc ?? mcapFd, earningsA);

  const riskFactors: RiskFactor[] = [];
  if (psFd === null && pfFd === null && pe === null) {
    riskFactors.push({ code: 'insufficient_data', label: 'No valuation ratios available', severity: 'high' });
  } else if (psFd === null || pfFd === null || pe === null) {
    riskFactors.push({ code: 'partial_data', label: 'Some valuation ratios unavailable', severity: 'medium' });
  }
  if (earningsA !== null && earningsA < 0) {
    riskFactors.push({ code: 'negative_earnings', label: 'Protocol is loss-making (negative annualized earnings)', severity: 'medium' });
  }

  return {
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    symbol: input.symbol ?? null,
    sector: input.sector ?? null,
    feesAnnualizedUsd: feesA,
    revenueAnnualizedUsd: revenueA,
    earningsAnnualizedUsd: earningsA,
    marketCapFullyDilutedUsd: mcapFd,
    marketCapCirculatingUsd: mcapCirc,
    psRatioFullyDiluted: psFd,
    psRatioCirculating: psCirc,
    pfRatioFullyDiluted: pfFd,
    pfRatioCirculating: pfCirc,
    peRatio: pe,
    userDau: asNum(input.values.user_dau),
    activeDevelopers: asNum(input.values.active_developers),
    codeCommits: asNum(input.values.code_commits),
    riskFactors,
  };
}

export interface SectorPeer {
  projectId: string;
  psRatioFullyDiluted: number | null;
  pfRatioFullyDiluted: number | null;
  peRatio: number | null;
}

/**
 * Compute sector percentiles + valuation signal for a single project against a peer set.
 * Lower ratio percentile = cheaper = undervalued. Returns null percentiles when peers lack data.
 */
export function classifyAgainstPeers(
  target: { psRatioFullyDiluted: number | null; pfRatioFullyDiluted: number | null; peRatio: number | null },
  peers: SectorPeer[],
) {
  const psPeers = peers.map((p) => p.psRatioFullyDiluted).filter((x): x is number => typeof x === 'number');
  const pfPeers = peers.map((p) => p.pfRatioFullyDiluted).filter((x): x is number => typeof x === 'number');
  const pePeers = peers.map((p) => p.peRatio).filter((x): x is number => typeof x === 'number');

  const psPct = percentile(psPeers, target.psRatioFullyDiluted);
  const pfPct = percentile(pfPeers, target.pfRatioFullyDiluted);
  const pePct = percentile(pePeers, target.peRatio);

  const valuationSignal = classifyValuationByPercentiles(psPct, pfPct, pePct);
  const peerPercentiles: Record<string, number> = {};
  if (psPct !== null) peerPercentiles.ps_ratio_fully_diluted = psPct;
  if (pfPct !== null) peerPercentiles.pf_ratio_fully_diluted = pfPct;
  if (pePct !== null) peerPercentiles.pe_ratio = pePct;

  return { valuationSignal, peerPercentiles };
}
