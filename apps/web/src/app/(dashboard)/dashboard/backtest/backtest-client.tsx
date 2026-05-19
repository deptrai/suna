'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const BacktestStrategyEditorClient = dynamic(
  () =>
    import('@/components/backtest/strategy-editor').then((m) => ({
      default: m.BacktestStrategyEditorClient,
    })),
  { ssr: false },
);
const MultiBacktestStrategyEditorClient = dynamic(
  () =>
    import('@/components/backtest/multi-strategy-editor').then((m) => ({
      default: m.MultiBacktestStrategyEditorClient,
    })),
  { ssr: false },
);

export function BacktestClient() {
  const [isMulti, setIsMulti] = useState(false);
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
        <div>
          <Button variant="outline" size="sm" onClick={() => setIsMulti((v) => !v)}>
            {isMulti ? 'Single Strategy' : 'Multi Strategy'}
          </Button>
        </div>
      </div>

      {isMulti ? <MultiBacktestStrategyEditorClient /> : <BacktestStrategyEditorClient />}
    </div>
  );
}
