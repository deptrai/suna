'use client';

import dynamic from 'next/dynamic';

const BacktestStrategyEditorClient = dynamic(
  () =>
    import('@/components/backtest/strategy-editor').then((m) => ({
      default: m.BacktestStrategyEditorClient,
    })),
  { ssr: false },
);

export function BacktestClient() {
  // TODO(Epic 7): add Tier 2 gate once subscription_tier infrastructure ships
  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-in fade-in zoom-in duration-500 ease-out">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">
          Backtest Strategy
        </h1>
        <p className="text-muted-foreground text-lg">
          Design and run trading strategy backtests with historical data.
        </p>
      </div>

      <BacktestStrategyEditorClient />
    </div>
  );
}
