'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  UTCTimestamp,
} from 'lightweight-charts';
import { calcMA, calcRSI, type OhlcvBar } from './chart-indicators';

interface Props {
  token: string;
  data: OhlcvBar[];
}

const THEME = {
  layout: { background: { color: 'transparent' }, textColor: '#94a3b8' },
  grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
  crosshair: { mode: 0 },
  rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
  timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true },
};

export function TradingViewChart({ data }: Props) {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ma20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ma50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const fitDoneRef = useRef(false);

  const [showRsi, setShowRsi] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const loading = data.length === 0;

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      if (!mainRef.current || !rsiRef.current) return;

      // Wait for the container to become visible (tab system mounts hidden).
      // Observe only the nearest tab parent's class/style — not document.body.
      if (mainRef.current.clientWidth === 0) {
        await new Promise<void>((resolve) => {
          if (cancelled) return resolve();
          const target = mainRef.current!.parentElement ?? document.body;
          const mo = new MutationObserver(() => {
            if (cancelled || !mainRef.current || mainRef.current.clientWidth > 0) {
              mo.disconnect();
              resolve();
            }
          });
          mo.observe(target, { attributes: true, attributeFilter: ['class', 'style'] });
          cleanups.push(() => mo.disconnect());
        });
      }
      if (cancelled || !mainRef.current || !rsiRef.current) return;

      const { createChart, CandlestickSeries, LineSeries } = await import('lightweight-charts');
      if (cancelled || !mainRef.current || !rsiRef.current) return;

      let mainChart: IChartApi;
      let rsiChart: IChartApi;
      try {
        mainChart = createChart(mainRef.current, { ...THEME, height: 420, width: mainRef.current.clientWidth });
        rsiChart = createChart(rsiRef.current, { ...THEME, height: 150, width: rsiRef.current.clientWidth });
      } catch {
        return;
      }
      cleanups.push(() => mainChart.remove(), () => rsiChart.remove());

      const candle = mainChart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderUpColor: '#10b981',
        borderDownColor: '#f43f5e',
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
      });
      const ma20 = mainChart.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false });
      const ma50 = mainChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false });
      const rsiLine = rsiChart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1, priceLineVisible: false });

      // Horizontal threshold lines that span the full visible range and follow pan/zoom.
      rsiLine.createPriceLine({ price: 70, color: 'rgba(244,63,94,0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      rsiLine.createPriceLine({ price: 30, color: 'rgba(16,185,129,0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });

      // Re-entrancy guard for two-way time-scale sync.
      let syncing = false;
      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        try { rsiChart.timeScale().setVisibleLogicalRange(range); } finally { syncing = false; }
      });
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        try { mainChart.timeScale().setVisibleLogicalRange(range); } finally { syncing = false; }
      });

      const ro = new ResizeObserver(() => {
        if (mainRef.current && mainChartRef.current) mainChart.resize(mainRef.current.clientWidth, 420);
        if (rsiRef.current && rsiChartRef.current) rsiChart.resize(rsiRef.current.clientWidth, 150);
      });
      if (mainRef.current.parentElement) ro.observe(mainRef.current.parentElement);
      cleanups.push(() => ro.disconnect());

      mainChartRef.current = mainChart;
      rsiChartRef.current = rsiChart;
      candleSeriesRef.current = candle;
      ma20Ref.current = ma20;
      ma50Ref.current = ma50;
      rsiSeriesRef.current = rsiLine;
      if (!cancelled) setChartsReady(true);
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => { try { fn(); } catch { /* noop */ } });
      mainChartRef.current = null;
      rsiChartRef.current = null;
      candleSeriesRef.current = null;
      ma20Ref.current = null;
      ma50Ref.current = null;
      rsiSeriesRef.current = null;
      fitDoneRef.current = false;
      setChartsReady(false);
    };
  }, []);

  // Resize the RSI chart when its panel becomes visible — the chart was created
  // while the container was display:none (clientWidth=0), so we need to re-measure.
  useEffect(() => {
    if (!chartsReady || !showRsi) return;
    if (rsiRef.current && rsiChartRef.current) {
      rsiChartRef.current.resize(rsiRef.current.clientWidth, 150);
    }
  }, [chartsReady, showRsi]);

  useEffect(() => {
    if (!chartsReady || !data.length || !candleSeriesRef.current) return;

    const candleData: CandlestickData[] = data.map((b) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    candleSeriesRef.current.setData(candleData);
    ma20Ref.current?.setData(calcMA(data, 20));
    ma50Ref.current?.setData(calcMA(data, 50));
    rsiSeriesRef.current?.setData(calcRSI(data));

    // Fit only on first data load — preserve user pan/zoom on subsequent updates.
    if (!fitDoneRef.current && mainChartRef.current) {
      mainChartRef.current.timeScale().fitContent();
      fitDoneRef.current = true;
    }
  }, [data, chartsReady]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 px-1 pb-2 border-b border-white/10">
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-[#60a5fa] inline-block"></span>
            MA20
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-[#f59e0b] inline-block"></span>
            MA50
          </span>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowRsi((v) => !v)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${
              showRsi
                ? 'border-violet-400 text-violet-300 bg-violet-500/10'
                : 'border-white/20 text-white/50 hover:border-white/40 hover:text-white/70'
            }`}
          >
            RSI {showRsi ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="relative w-full" style={{ minHeight: 420 }}>
        <div ref={mainRef} className="w-full" />
        {loading && (
          <div className="absolute inset-0 rounded-lg bg-white/5 animate-pulse pointer-events-none" />
        )}
      </div>

      <div
        ref={rsiRef}
        className={`w-full transition-all duration-300 ${showRsi ? 'block' : 'hidden'}`}
      />
    </div>
  );
}
