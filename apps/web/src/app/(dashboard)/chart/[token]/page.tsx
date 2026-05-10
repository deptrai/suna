import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { TradingViewChart } from '@/components/chart/trading-view-chart';
import type { OhlcvBar } from '@/components/chart/chart-indicators';
import ChartLoading from './loading';

const VALID_TOKEN = /^[a-z0-9]{1,20}$/;
const SSR_FETCH_TIMEOUT_MS = 5000;

async function fetchOhlcv(token: string): Promise<OhlcvBar[]> {
  const baseUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!baseUrl) {
    console.warn('[chart/ssr] BACKEND_URL not set; rendering empty chart');
    return [];
  }

  // Forward Authorization header from incoming request so the backend sees
  // the user's Supabase session (the OHLCV endpoint is auth-gated by the
  // marketApp middleware chain — see apps/api/src/market/routes.ts).
  const hdrs = await headers();
  const auth = hdrs.get('Authorization') ?? hdrs.get('authorization');
  const reqHeaders: HeadersInit = auth ? { Authorization: auth } : {};

  try {
    const res = await fetch(`${baseUrl}/v1/market/ohlcv/${encodeURIComponent(token)}?days=90`, {
      cache: 'no-store',
      headers: reqHeaders,
      signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[chart/ssr] OHLCV fetch failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const body = (await res.json()) as { items?: unknown };
    return Array.isArray(body.items) ? (body.items as OhlcvBar[]) : [];
  } catch (err) {
    console.warn('[chart/ssr] OHLCV fetch error', err);
    return [];
  }
}

export default async function ChartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sanitized = token.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!VALID_TOKEN.test(sanitized)) notFound();

  const ohlcv = await fetchOhlcv(sanitized);

  return (
    <div className="container max-w-6xl py-8 space-y-6 animate-in fade-in zoom-in duration-500 ease-out">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm uppercase">
          {sanitized} / USD
        </h1>
        <p className="text-muted-foreground text-sm">
          Candlestick · MA20 · MA50 · RSI — powered by TradingView Lightweight Charts
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-4">
        <Suspense fallback={<ChartLoading />}>
          <TradingViewChart token={sanitized} data={ohlcv} />
        </Suspense>
      </div>
    </div>
  );
}
