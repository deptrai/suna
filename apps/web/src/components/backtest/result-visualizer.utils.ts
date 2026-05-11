// Pure helpers extracted from result-visualizer.tsx for unit testing.
// All functions are deterministic, side-effect-free, and zero-dependency.

import type { RunResponse } from '@/lib/backtest-api';

export type Sentiment = 'positive' | 'negative' | 'neutral';

/** Display a unitless numeric value as a percentage with 2 decimals. Returns '—' for unparseable input. */
export function formatPercent(v: unknown): string {
  if (v === undefined || v === null) return '—';
  const num = typeof v === 'string' ? parseFloat(v) : Number(v);
  if (isNaN(num)) return '—';
  return `${(num * 100).toFixed(2)}%`;
}

/** Format a numeric value to N decimal places. Returns '—' for unparseable input. */
export function formatNumber(v: unknown, decimals = 2): string {
  if (v === undefined || v === null) return '—';
  const num = typeof v === 'string' ? parseFloat(v) : Number(v);
  if (isNaN(num)) return '—';
  return num.toFixed(decimals);
}

/**
 * Sentiment classification for KPI coloring.
 *  - Default: positive number → 'positive', negative → 'negative', zero/unparseable → 'neutral'
 *  - When `invert=true` (e.g. max_drawdown — bigger is worse): positive → 'negative', negative → 'positive'
 */
export function sentiment(v: unknown, invert = false): Sentiment {
  if (v === undefined || v === null) return 'neutral';
  const num = typeof v === 'string' ? parseFloat(v) : Number(v);
  if (isNaN(num)) return 'neutral';
  if (num === 0) return 'neutral';
  const positive = invert ? num < 0 : num > 0;
  return positive ? 'positive' : 'negative';
}

export interface EquityPoint {
  date: string;
  strategy: number;
  benchmark: number;
}

function toIsoDate(ts: unknown): string {
  if (typeof ts === 'string') return ts.slice(0, 10);
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    // Detect epoch seconds vs milliseconds (10-digit = seconds, 13-digit = ms)
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return '';
}

/**
 * Normalize VT's equity_curve into the shape Recharts expects.
 * Accepts legacy field aliases: timestamp|date|time and value|strategy|equity.
 * Missing/invalid numerics default to 0.
 */
export function buildEquityCurve(raw: RunResponse['equity_curve']): EquityPoint[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];

  return raw.map((pt) => {
    if (!pt || typeof pt !== 'object') return { date: '', strategy: 0, benchmark: 0 };
    const ts = (pt as Record<string, unknown>).timestamp
      ?? (pt as Record<string, unknown>).date
      ?? (pt as Record<string, unknown>).time
      ?? '';
    const dateStr = toIsoDate(ts);

    const rec = pt as Record<string, unknown>;
    const rawVal = rec.value !== undefined
      ? rec.value
      : rec.strategy !== undefined
        ? rec.strategy
        : rec.equity;
    const strategyVal = typeof rawVal === 'string' ? parseFloat(rawVal) : Number(rawVal);

    const rawBench = rec.benchmark;
    const benchmarkVal = typeof rawBench === 'string' ? parseFloat(rawBench) : Number(rawBench);

    return {
      date: dateStr,
      strategy: isNaN(strategyVal) ? 0 : strategyVal,
      benchmark: isNaN(benchmarkVal) ? 0 : benchmarkVal,
    };
  });
}

export interface MetricsLike {
  sharpe?: number;
  max_drawdown?: number;
  total_return?: number;
  win_rate?: number;
  [key: string]: unknown;
}

/** True iff metrics is a non-empty object. */
export function hasMetrics(metrics: MetricsLike | null | undefined): metrics is MetricsLike {
  return !!metrics && typeof metrics === 'object' && Object.keys(metrics).length > 0;
}

/** True iff at least one equity point carries a non-zero benchmark value. */
export function hasBenchmark(equityData: EquityPoint[]): boolean {
  return equityData.some((pt) => pt.benchmark > 0);
}

export type ResultBranch = 'failed' | 'phase-b' | 'phase-a' | 'empty';

/**
 * Decide which UI branch to render for a given RunResponse.
 *  - 'failed'   — backend reported status=failed
 *  - 'phase-b'  — metrics or equity_curve present (full result)
 *  - 'phase-a'  — no metrics, no equity_curve, but data_summary present (Phase A only)
 *  - 'empty'    — none of the above (nothing useful to render yet)
 */
export function classifyResultBranch(result: RunResponse): ResultBranch {
  if (result.status === 'failed') return 'failed';
  const metrics = (result.metrics as MetricsLike | null | undefined) ?? null;
  const equity = buildEquityCurve(result.equity_curve);
  if (hasMetrics(metrics) || equity.length > 0) return 'phase-b';
  // VT status='unknown' means Phase A (run dir exists, simulation pending). data_summary is
  // never populated by VT, so treat status='unknown' directly as phase-a.
  if (result.status === 'unknown') return 'phase-a';
  const summary = (result as { data_summary?: Record<string, unknown> }).data_summary;
  if (summary && typeof summary === 'object' && Object.keys(summary).length > 0) return 'phase-a';
  return 'empty';
}
