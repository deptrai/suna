import type { Metadata } from 'next';
import { BacktestClient } from './backtest-client';

export const metadata: Metadata = {
  title: 'Backtest Strategy - Chainlens',
};

export default function BacktestPage() {
  return <BacktestClient />;
}
