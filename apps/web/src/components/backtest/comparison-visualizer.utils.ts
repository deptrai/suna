import { formatNumber, formatPercent } from './result-visualizer.utils';
import type { RunResponse } from '@/lib/backtest-api';

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
  // Sentinel for incomparable series. Callers (ComparisonVisualizer heatmap) render NaN as '—'
  // and heatmapColor coerces non-finite values to neutral. Prior behavior silently truncated to
  // min(a.length, b.length), which produced misleading correlations when strategies ran with
  // different `historical_range` values.
  if (a.length !== b.length) return Number.NaN;
  const n = a.length;
  if (n < 2) return 0;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const xa = a[i] - meanA;
    const xb = b[i] - meanB;
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
  if (!Number.isFinite(value)) return 'rgb(229, 231, 235)'; // neutral gray for incomparable
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

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deriveCagr(run: RunResponse | null): number | null {
  if (!run) return null;
  const m = (run.metrics as Record<string, unknown> | undefined) ?? {};
  for (const key of ['cagr', 'annualized_return', 'annual_return']) {
    const n = toNum(m[key]);
    if (n != null) return Math.abs(n) > 1 ? n / 100 : n;
  }
  const curve = (run.equity_curve as Array<Record<string, unknown>> | undefined) ?? [];
  if (curve.length < 2) return null;
  const first = curve.find((p) => {
    const v = toNum(p?.value);
    return v != null && v > 0;
  });
  const last = [...curve].reverse().find((p) => {
    const v = toNum(p?.value);
    return v != null && v > 0;
  });
  const start = toNum(first?.value);
  const end = toNum(last?.value);
  if (!start || !end || start <= 0 || end <= 0) return null;
  // Assume strategy span ~ historical_range days inferred from points; annualize geometrically.
  const days = Math.max(1, curve.length);
  const years = days / 365;
  if (years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

function deriveMaxLoss(run: RunResponse | null): number | null {
  if (!run) return null;
  const tradeLog = (run.trade_log as Array<Record<string, unknown>> | undefined) ?? [];
  let worst: number | null = null;
  for (const t of tradeLog) {
    const candidates = [t.pnl_pct, t.pnl_percent, t.return_pct, t.profit_pct];
    for (const c of candidates) {
      const n = toNum(c);
      if (n == null) continue;
      const normalized = Math.abs(n) > 1 ? n / 100 : n;
      if (worst == null || normalized < worst) worst = normalized;
      break;
    }
  }
  if (worst != null) return worst;

  // Fallback from equity-curve step returns.
  const curve = (run.equity_curve as Array<Record<string, unknown>> | undefined) ?? [];
  if (curve.length < 2) return null;
  let minStep = 0;
  for (let i = 1; i < curve.length; i += 1) {
    const prev = toNum(curve[i - 1]?.value);
    const curr = toNum(curve[i]?.value);
    if (!prev || !curr || prev <= 0) continue;
    const step = curr / prev - 1;
    if (step < minStep) minStep = step;
  }
  return minStep;
}

export function metricWithFallback(run: RunResponse | null, metric: string): unknown {
  const m = (run?.metrics as Record<string, unknown> | undefined) ?? {};
  const direct = m[metric];
  if (direct != null && `${direct}` !== '') return direct;
  if (metric === 'cagr') return deriveCagr(run);
  if (metric === 'max_loss') return deriveMaxLoss(run);
  return direct;
}
