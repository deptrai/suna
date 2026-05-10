import type { LineData, UTCTimestamp } from 'lightweight-charts';

export interface OhlcvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function calcMA(bars: OhlcvBar[], period: number): LineData[] {
  if (period <= 0 || bars.length < period) return [];
  const result: LineData[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    result.push({ time: bars[i].time as UTCTimestamp, value: parseFloat((sum / period).toFixed(4)) });
  }
  return result;
}

export function calcRSI(bars: OhlcvBar[], period = 14): LineData[] {
  if (bars.length < period + 1) return [];
  const result: LineData[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < bars.length; i++) {
    if (i > period) {
      const delta = bars[i].close - bars[i - 1].close;
      avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
    }
    let rsi: number;
    if (avgGain === 0 && avgLoss === 0) rsi = 50;
    else if (avgLoss === 0) rsi = 100;
    else {
      const rs = avgGain / avgLoss;
      rsi = parseFloat((100 - 100 / (1 + rs)).toFixed(2));
    }
    result.push({ time: bars[i].time as UTCTimestamp, value: rsi });
  }
  return result;
}
