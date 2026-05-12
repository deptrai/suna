'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Activity, Target, type LucideIcon } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { RunResponse } from '@/lib/backtest-api';
import {
  formatPercent,
  formatNumber,
  sentiment,
  buildEquityCurve,
  hasMetrics as hasMetricsHelper,
  hasBenchmark as hasBenchmarkHelper,
  classifyResultBranch,
  type Sentiment,
} from './result-visualizer.utils';

// ---------- Types ----------

interface KpiItem {
  label: string;
  value: string;
  subtext?: string;
  sentiment: Sentiment;
  icon: LucideIcon;
}

// ---------- KPI Card ----------

function KpiCard({ label, value, subtext, sentiment: s, icon: Icon }: KpiItem) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="text-xs font-medium truncate">{label}</span>
      </div>
      <p
        className={cn(
          'text-xl font-bold tabular-nums tracking-tight',
          s === 'positive' && 'text-emerald-500',
          s === 'negative' && 'text-red-500',
          s === 'neutral' && 'text-foreground',
        )}
      >
        {value}
      </p>
      {subtext && (
        <span className="text-[11px] text-muted-foreground leading-tight">{subtext}</span>
      )}
    </div>
  );
}

// ---------- Chart Config ----------

const equityChartConfig: ChartConfig = {
  strategy: {
    label: 'Strategy',
    color: 'hsl(160, 84%, 39%)',
  },
  benchmark: {
    label: 'BTC Buy & Hold',
    color: 'hsl(220, 14%, 50%)',
  },
};

// ---------- Main Component ----------

interface BacktestResultVisualizerProps {
  result: RunResponse;
  /** Story 5.3: invoked when user clicks Retry on failed-state banner. */
  onRetry?: () => void;
}

export function BacktestResultVisualizer({ result, onRetry }: BacktestResultVisualizerProps) {
  const [open, setOpen] = useState(true);

  const metrics = result.metrics as {
    sharpe?: number;
    max_drawdown?: number;
    total_return?: number;
    win_rate?: number;
    [key: string]: unknown;
  } | null | undefined;

  const branch = classifyResultBranch(result);
  const hasMetrics = hasMetricsHelper(metrics);

  const kpis = useMemo<KpiItem[]>(() => {
    if (!hasMetrics) return [];
    return [
      {
        label: 'Sharpe Ratio',
        value: formatNumber(metrics.sharpe),
        subtext: 'Risk-adjusted return',
        sentiment: sentiment(metrics.sharpe),
        icon: Activity,
      },
      {
        label: 'Max Drawdown',
        value: formatPercent(metrics.max_drawdown),
        subtext: 'Largest peak-to-trough decline',
        sentiment: sentiment(metrics.max_drawdown, true),
        icon: TrendingDown,
      },
      {
        label: 'Total Return',
        value: formatPercent(metrics.total_return),
        subtext: 'Net profit over period',
        sentiment: sentiment(metrics.total_return),
        icon: TrendingUp,
      },
      {
        label: 'Win Rate',
        value: formatPercent(metrics.win_rate),
        subtext: 'Profitable trades ratio',
        sentiment: sentiment(metrics.win_rate != null && !isNaN(Number(metrics.win_rate)) ? Number(metrics.win_rate) - 0.5 : null),
        icon: Target,
      },
    ];
  }, [hasMetrics, metrics]);

  const equityData = useMemo(
    () => buildEquityCurve(result.equity_curve),
    [result.equity_curve],
  );

  const hasBenchmark = hasBenchmarkHelper(equityData);

  // Failed backtest: show actionable error
  if (branch === 'failed') {
    const reason =
      (result as { reason?: string }).reason ??
      (metrics as Record<string, unknown> | null)?.error_message as string | undefined ??
      'Backtest failed — check strategy parameters and retry.';

    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50/50 dark:bg-red-900/10 p-5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">
            ⚠ Backtest Failed
          </p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="flex-shrink-0">
              Retry
            </Button>
          )}
        </div>
        <p className="text-sm text-red-600 dark:text-red-400/80">{reason}</p>
        <p className="text-xs text-muted-foreground">
          Tip: giảm <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">historical_range</code>,
          tắt Monte Carlo, hoặc kiểm tra logic trong <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">executable_code</code>.
        </p>
      </div>
    );
  }

  // Phase A only — data loaded, simulation not complete (or empty result)
  if (branch === 'phase-a' || branch === 'empty') {
    const summary = (result as { data_summary?: Record<string, unknown> }).data_summary;
    const assetKeys = summary ? Object.keys(summary) : [];
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-900/10 p-5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Historical data loaded — simulation pending
          </p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="flex-shrink-0">
              Retry
            </Button>
          )}
        </div>
        {assetKeys.length > 0 ? (
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {assetKeys.map((k) => {
              const s = summary![k] as Record<string, unknown>;
              return (
                <li key={k}>
                  <span className="font-medium">{k}</span>: {String(s.rows_fetched ?? '?')} rows
                  {s.first_date && s.last_date ? ` (${String(s.first_date).slice(0, 10)} → ${String(s.last_date).slice(0, 10)})` : ''}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Metrics and equity curve will appear once the backtest worker completes Phase B.
          </p>
        )}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground/90 hover:text-foreground transition-colors mb-3">
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Backtest Results
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4">
        {/* KPI Cards */}
        {kpis.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))}
          </div>
        )}

        {/* Equity Curve Chart */}
        {equityData.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold">Equity Curve</h3>
              <p className="text-xs text-muted-foreground">
                Strategy performance{hasBenchmark ? ' vs. BTC buy & hold' : ''}
              </p>
            </div>
            <ChartContainer config={equityChartConfig} className="w-full" style={{ height: 320 }}>
              <AreaChart
                accessibilityLayer
                data={equityData}
                margin={{ left: -10, right: 12, top: 12, bottom: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  tickFormatter={(v: string) => {
                    if (!v) return '';
                    const parts = v.split('-');
                    return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : v;
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                  }
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value: unknown) => {
                        const n = Number(value);
                        return isNaN(n) ? String(value) : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
                      }}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent payload={[]} />} />
                <defs>
                  <linearGradient id="fill-strategy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fill-benchmark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(220, 14%, 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(220, 14%, 50%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                {hasBenchmark && (
                  <Area
                    dataKey="benchmark"
                    type="monotone"
                    fill="url(#fill-benchmark)"
                    fillOpacity={0.3}
                    stroke="hsl(220, 14%, 50%)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                )}
                <Area
                  dataKey="strategy"
                  type="monotone"
                  fill="url(#fill-strategy)"
                  fillOpacity={0.4}
                  stroke="hsl(160, 84%, 39%)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(160, 84%, 39%)' }}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        )}

        {/* Extra metrics (collapsed raw data for power users) */}
        {metrics && Object.keys(metrics).length > 4 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              All metrics (raw)
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-muted/50 overflow-x-auto text-[11px] font-mono leading-relaxed">
              {JSON.stringify(metrics, null, 2)}
            </pre>
          </details>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
