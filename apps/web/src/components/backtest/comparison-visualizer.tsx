'use client';

import { Button } from '@/components/ui/button';
import type { MultiSubmitItem, RunResponse } from '@/lib/backtest-api';
import { computeCorrelationMatrix, formatKpi, heatmapColor } from './comparison-visualizer.utils';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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

export function ComparisonVisualizer({
  submissions,
  runStates,
  onRetry,
  onPromote,
  onCancelAll,
}: {
  submissions: MultiSubmitItem[];
  runStates: Record<string, TabRunState>;
  onRetry: (tabId: string) => void;
  onPromote: (tabId: string) => void;
  onCancelAll: () => void;
}) {
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
              return (
                <tr key={row.tab_id} className="border-b border-border/50">
                  <td className="py-2 pr-3">{row.tab_id}</td>
                  {KPI_KEYS.map((k) => {
                    const best = bestByKey[k] === row.tab_id;
                    return (
                      <td key={k} className={`py-2 pr-3 ${best ? 'font-semibold text-green-600' : ''}`}>
                        {m ? formatKpi(k, m[k]) : 'Loading...'}
                      </td>
                    );
                  })}
                  <td className="py-2 pr-3 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => onPromote(row.tab_id)}>Promote</Button>
                    {(state?.timeout || row.run?.status === 'failed') && (
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
                <Tooltip />
                {rows.map((row, idx) => (
                  <Line
                    key={row.tab_id}
                    type="monotone"
                    dataKey={row.tab_id}
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
                title={`Corr ${rows[i]?.tab_id ?? i} vs ${rows[j]?.tab_id ?? j}`}
              >
                {v.toFixed(2)}
              </div>
            )),
          )}
        </div>
      </div>
    </div>
  );
}
