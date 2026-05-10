import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: 'Backtest Strategy - Chainlens',
};

// CodeMirror requires DOM APIs — disable SSR on the editor component
const BacktestStrategyEditorClient = dynamic(
  () =>
    import('@/components/backtest/strategy-editor').then((m) => ({
      default: m.BacktestStrategyEditorClient,
    })),
  { ssr: false },
);

export default function BacktestPage() {
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
