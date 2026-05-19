import { formatNumber, formatPercent } from './result-visualizer.utils';

export interface EquityValuePoint {
  value?: unknown;
}

export function returnsFromEquityCurve(curve: EquityValuePoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < curve.length; i += 1) {
    const prev = Number(curve[i - 1]?.value);
    const curr = Number(curve[i]?.value);
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0 || curr <= 0) continue;
    out.push(Math.log(curr / prev));
  }
  return out;
}

export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const aa = a.slice(0, n);
  const bb = b.slice(0, n);
  const meanA = aa.reduce((s, v) => s + v, 0) / n;
  const meanB = bb.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const xa = aa[i] - meanA;
    const xb = bb[i] - meanB;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  if (den === 0) return 0;
  return num / den;
}

export function computeCorrelationMatrix(curves: EquityValuePoint[][]): number[][] {
  const returns = curves.map(returnsFromEquityCurve);
  const n = returns.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : pearsonCorrelation(returns[i], returns[j]))),
  );
}

export function heatmapColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped >= 0) {
    const t = Math.round(255 - clamped * 120);
    return `rgb(${t}, ${t}, 255)`;
  }
  const t = Math.round(255 - Math.abs(clamped) * 120);
  return `rgb(255, ${t}, ${t})`;
}

export function formatKpi(metric: string, value: unknown): string {
  if (metric === 'max_drawdown' || metric === 'cagr' || metric === 'win_rate' || metric === 'max_loss') {
    return formatPercent(value);
  }
  return formatNumber(value, 2);
}
