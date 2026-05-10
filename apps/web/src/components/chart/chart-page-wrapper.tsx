'use client';

import { useEffect, useState } from 'react';
import { TradingViewChart } from './trading-view-chart';
import type { OhlcvBar } from './chart-indicators';
import { getEnv } from '@/lib/env-config';
import { getAuthToken } from '@/lib/auth-token';

interface Props {
  params?: Promise<{ token: string }>;
}

// Tab-system entry point. The Server Component at /chart/[token]/page.tsx
// remains the canonical SSR/direct-load path; this wrapper exists because
// the project's pre-mounted tab system can only render client components.
// Data ownership lives here (not inside <TradingViewChart>) so the chart
// stays purely presentational.
export function ChartPageWrapper({ params }: Props) {
  const [token, setToken] = useState<string>('');
  const [bars, setBars] = useState<OhlcvBar[]>([]);

  useEffect(() => {
    let cancelled = false;
    params?.then(({ token: t }) => {
      if (cancelled) return;
      const sanitized = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      setToken(sanitized);
    }).catch(() => { /* params promise rejection is non-fatal */ });
    return () => { cancelled = true; };
  }, [params]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const baseUrl = getEnv().BACKEND_URL;
      if (!baseUrl) return;
      let authToken: string | null = null;
      try { authToken = await getAuthToken(); } catch { /* anonymous OK */ }
      if (cancelled) return;
      const hdrs: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      try {
        const res = await fetch(`${baseUrl}/market/ohlcv/${encodeURIComponent(token)}?days=90`, {
          cache: 'no-store',
          headers: hdrs,
        });
        if (cancelled || !res.ok) return;
        const body = await res.json().catch(() => ({})) as { items?: OhlcvBar[] };
        if (!cancelled) setBars(Array.isArray(body.items) ? body.items : []);
      } catch {
        // network errors surface as empty bars + chart's loading skeleton
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (!token) {
    return (
      <div className="container max-w-6xl py-8 space-y-6">
        <div className="space-y-1">
          <div className="h-9 w-40 rounded bg-white/5 animate-pulse" />
          <div className="h-4 w-72 rounded bg-white/5 animate-pulse" />
        </div>
        <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-4">
          <div className="h-[420px] w-full rounded-lg bg-white/5 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 space-y-6 animate-in fade-in zoom-in duration-500 ease-out">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm uppercase">
          {token} / USD
        </h1>
        <p className="text-muted-foreground text-sm">
          Candlestick · MA20 · MA50 · RSI — powered by TradingView Lightweight Charts
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-4">
        <TradingViewChart token={token} data={bars} />
      </div>
    </div>
  );
}
