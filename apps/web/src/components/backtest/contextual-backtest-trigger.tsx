'use client';

import * as React from 'react';
import { ContextualBacktestModal } from './contextual-backtest-modal';
import { isStrategy, extractInitialProps } from './contextual-backtest-trigger.utils';

export function ContextualBacktestTrigger({ code }: { code: string }) {
  const [open, setOpen] = React.useState(false);

  const isStrategyMemo = React.useMemo(() => isStrategy(code), [code]);
  const initialProps = React.useMemo(
    () => (isStrategyMemo ? extractInitialProps(code) : null),
    [code, isStrategyMemo],
  );

  if (!isStrategyMemo || !initialProps) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-2 right-2 text-xs px-3 py-1.5 rounded-md border border-violet-500/50 text-violet-300 bg-violet-500/10 hover:border-violet-400 hover:text-violet-200 transition-all flex items-center gap-1 shadow-sm backdrop-blur-md z-10 opacity-0 group-hover:opacity-100"
        title="Review & Run Backtest"
      >
        <span className="text-violet-400">⚡</span> Review & Run Backtest
      </button>
      <ContextualBacktestModal
        open={open}
        onOpenChange={setOpen}
        initialCode={code}
        initialAsset={initialProps.initialAsset}
        initialTimeframe={initialProps.initialTimeframe}
      />
    </>
  );
}
