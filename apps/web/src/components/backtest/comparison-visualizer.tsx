'use client';

import { Button } from '@/components/ui/button';
import type { MultiSubmitItem, RunResponse } from '@/lib/backtest-api';
import { computeCorrelationMatrix, formatKpi, heatmapColor } from './comparison-visualizer.utils';
import { Line, LineChart, ResponsiveContainer, Tooltip, type TooltipProps, XAxis, YAxis } from 'recharts';

type TabRunState = {
  run: RunResponse | null;
  timeout?: boolean;
  job_id?: string;
};

const KPI_KEYS = ['sharpe', 'max_drawdown', 'cagr', 'win_rate', 'max_loss'] as const;
const LINE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];

type KpiKey = (typeof KPI_KEYS)[number];

function pickBest(rows: Array<{ tab_id: string; run: RunResponse | null }>, key: KpiKey): string | null {
  let bestTab: string | null = null;
  let best: number | null = null;
  for (const row of rows) {
    const metric = (row.run?.metrics as Record<string, unknown> | undefined)?.[key];
    const value = Number(metric);
    if (!Number.isFinite(value)) continue;
    const score = key === 'max_drawdown' || key === 'max_loss' ? -Math.abs(value) : value;
    if (best === null || score > best) {
      best = score;
      bestTab = row.tab_id;
    }
  }
  return bestTab;
}

type MultiTooltipPayload = ReadonlyArray<{
  name?: string;
  value?: number | string | null;
  color?: string;
  dataKey?: string;
}>;

function MultiStrategyTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const items = payload as MultiTooltipPayload;
  return (
    <div className="rounded border border-border bg-background/95 px-3 py-2 text-xs shadow-sm">
      <div className="font-medium mb-1">Step {label}</div>
      <ul className="space-y-0.5">
        {items.map((entry, idx) => {
          const value = entry.value;
          const display =
            typeof value === 'number' && Number.isFinite(value)
              ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : '—';
          return (
            <li key={`${entry.dataKey ?? idx}`} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color ?? LINE_COLORS[idx % LINE_COLORS.length] }}
              />
              <span className="text-muted-foreground">{entry.name ?? entry.dataKey}</span>
              <span className="ml-auto tabular-nums">{display}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ComparisonVisualizer({
  submissions,
  runStates,
  onRetry,
  onPromote,
  onCancelAll,
  tabLabels,
}: {
  submissions: MultiSubmitItem[];
  runStates: Record<string, TabRunState>;
  onRetry: (tabId: string) => void;
  onPromote: (tabId: string) => void;
  onCancelAll: () => void;
  tabLabels?: Record<string, string>;
}) {
  const labelOf = (tabId: string) => tabLabels?.[tabId] ?? tabId;
  const rows = submissions.map((s) => ({ tab_id: s.tab_id, run: runStates[s.tab_id]?.run ?? null }));
  const completedCount = rows.filter((r) => {
    const state = runStates[r.tab_id];
    return r.run?.status === 'success' || r.run?.status === 'failed' || !!state?.timeout;
  }).length;
  const timeoutCount = rows.filter((r) => !!runStates[r.tab_id]?.timeout).length;
  const curves = rows.map((r) =>
    (r.run?.equity_curve as Array<{ value?: unknown }> | undefined) ?? [],
  );
  const corr = computeCorrelationMatrix(curves);

  const bestByKey = Object.fromEntries(KPI_KEYS.map((k) => [k, pickBest(rows, k)])) as Record<KpiKey, string | null>;
  const chartData = (() => {
    const longest = Math.max(
      0,
      ...rows.map((r) => ((r.run?.equity_curve as Array<Record<string, unknown>> | undefined) ?? []).length),
    );
    return Array.from({ length: longest }, (_, i) => {
      const point: Record<string, unknown> = { index: i + 1 };
      rows.forEach((row) => {
        const curve = (row.run?.equity_curve as Array<Record<string, unknown>> | undefined) ?? [];
        const value = curve[i]?.value;
        point[row.tab_id] = Number.isFinite(Number(value)) ? Number(value) : null;
      });
      return point;
    });
  })();

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Comparison Visualizer</h3>
        <Button variant="outline" size="sm" onClick={onCancelAll}>Cancel All</Button>
      </div>

      <div className="overflow-x-auto">
        {timeoutCount > 0 && (
          <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {completedCount} of {rows.length} completed in time. Charged: full credits per atomic billing policy.
          </div>
        )}
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-3">Strategy</th>
              <th className="py-2 pr-3">Sharpe</th>
              <th className="py-2 pr-3">Max DD</th>
              <th className="py-2 pr-3">CAGR</th>
              <th className="py-2 pr-3">Win Rate</th>
              <th className="py-2 pr-3">Max Loss</th>
              <th className="py-2 pr-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = runStates[row.tab_id];
              const m = row.run?.metrics as Record<string, unknown> | undefined;
              const isTimeout = !!state?.timeout;
              const isFailed = row.run?.status === 'failed';
              const jobId = state?.job_id;
              return (
                <tr key={row.tab_id} className="border-b border-border/50" data-testid={`kpi-row-${row.tab_id}`}>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col">
                      <span>{labelOf(row.tab_id)}</span>
                      {isTimeout && (
                        <span className="text-xs text-amber-700" data-testid={`timeout-msg-${row.tab_id}`}>
                          Timeout — backtest still running on backend
                          {jobId && (
                            <>
                              {' · '}
                              <code className="rounded bg-amber-100 px-1 py-0.5 text-[10px]" title="Use this job_id to manually reconnect via SSE">
                                {jobId}
                              </code>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  {KPI_KEYS.map((k) => {
                    const best = bestByKey[k] === row.tab_id;
                    return (
                      <td key={k} className={`py-2 pr-3 ${best ? 'font-semibold text-green-600' : ''}`}>
                        {m ? (
                          formatKpi(k, m[k])
                        ) : (
                          <span
                            className="inline-block h-4 w-12 animate-pulse rounded bg-muted"
                            aria-label="Loading"
                            data-testid={`kpi-skeleton-${row.tab_id}-${k}`}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2 pr-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPromote(row.tab_id)}
                      data-testid={`promote-${row.tab_id}`}
                    >
                      Promote
                    </Button>
                    {(isTimeout || isFailed) && (
                      <Button variant="outline" size="sm" onClick={() => onRetry(row.tab_id)}>Retry</Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h4 className="font-medium">Equity Curve Overlay</h4>
        <div className="h-64 w-full rounded border border-border p-2">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Waiting for phase_b results...</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="index" />
                <YAxis />
                <Tooltip content={<MultiStrategyTooltip />} />
                {rows.map((row, idx) => (
                  <Line
                    key={row.tab_id}
                    type="monotone"
                    dataKey={row.tab_id}
                    name={labelOf(row.tab_id)}
                    stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-medium">Correlation Heatmap</h4>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))` }}>
          {corr.flatMap((r, i) =>
            r.map((v, j) => (
              <div
                key={`${i}-${j}`}
                className="rounded p-2 text-xs text-center border border-border"
                style={{ backgroundColor: heatmapColor(v) }}
                title={`Corr ${labelOf(rows[i]?.tab_id ?? '')} vs ${labelOf(rows[j]?.tab_id ?? '')}`}
              >
                {Number.isFinite(v) ? v.toFixed(2) : '—'}
              </div>
            )),
          )}
        </div>
      </div>
    </div>
  );
}
