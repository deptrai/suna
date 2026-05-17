export type MetricMap = Record<string, number | null>;

export interface SnapshotInput {
  projectId: string;
  projectName?: string | null;
  symbol?: string | null;
  sector?: string | null;
  values: MetricMap;
}

export function asNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

export function annualize(v: number | null, days = 30): number | null {
  if (v === null) return null;
  if (days <= 0) return null;
  return v * (365 / days);
}

export function safeRatio(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den <= 0) return null;
  return num / den;
}

export function percentile(peers: number[], value: number | null): number | null {
  if (value === null || peers.length === 0) return null;
  const sorted = [...peers].sort((a, b) => a - b);
  const lower = sorted.filter((x) => x <= value).length;
  return Number(((lower / sorted.length) * 100).toFixed(2));
}

export function classifyValuation(ps: number | null, pf: number | null, pe: number | null): 'undervalued' | 'fair' | 'overvalued' | 'insufficient_data' {
  const vals = [ps, pf, pe].filter((v): v is number => typeof v === 'number');
  if (vals.length === 0) return 'insufficient_data';
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (avg < 5) return 'undervalued';
  if (avg > 15) return 'overvalued';
  return 'fair';
}

export function buildSnapshot(input: SnapshotInput) {
  const fees = input.values.fees ?? null;
  const revenue = input.values.revenue ?? null;
  const earnings = input.values.earnings ?? null;
  const mcapFd = input.values.market_cap_fully_diluted ?? null;
  const mcapCirc = input.values.market_cap_circulating ?? null;

  const feesA = annualize(fees);
  const revenueA = annualize(revenue);
  const earningsA = annualize(earnings);

  const psFd = asNum(input.values.ps_ratio_fully_diluted) ?? safeRatio(mcapFd, revenueA);
  const psCirc = asNum(input.values.ps_ratio_circulating) ?? safeRatio(mcapCirc, revenueA);
  const pfFd = asNum(input.values.pf_ratio_fully_diluted) ?? safeRatio(mcapFd, feesA);
  const pfCirc = asNum(input.values.pf_ratio_circulating) ?? safeRatio(mcapCirc, feesA);
  const pe = safeRatio(mcapCirc ?? mcapFd, earningsA);

  const signal = classifyValuation(psFd, pfFd, pe);
  const riskFactors: string[] = [];
  if (pe === null || psFd === null || pfFd === null) riskFactors.push('insufficient_data');

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
    valuationSignal: signal,
    riskFactors,
  };
}
