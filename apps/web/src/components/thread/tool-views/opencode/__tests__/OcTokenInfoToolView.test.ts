import { describe, test, expect } from 'bun:test';

// ── Pure helpers extracted for unit testing ───────────────────────────────────

function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(4)}`;
}

function parseOutput(output: unknown): { success: boolean; stale?: boolean; price_usd?: number } | null {
  if (!output) return null;
  const str = typeof output === 'string' ? output : JSON.stringify(output);
  try { return JSON.parse(str); } catch { return null; }
}

describe('OcTokenInfoToolView — formatUsd', () => {
  test('formats billions', () => {
    expect(formatUsd(1_500_000_000)).toBe('$1.50B');
  });
  test('formats millions', () => {
    expect(formatUsd(2_500_000)).toBe('$2.50M');
  });
  test('formats thousands', () => {
    expect(formatUsd(3_000)).toBe('$3.00K');
  });
  test('returns em-dash for null', () => {
    expect(formatUsd(null)).toBe('—');
  });
  test('returns em-dash for NaN', () => {
    expect(formatUsd(NaN)).toBe('—');
  });
  test('handles negative values', () => {
    expect(formatUsd(-1_000_000)).toBe('-$1.00M');
  });
});

describe('OcTokenInfoToolView — parseOutput', () => {
  test('parses valid JSON string', () => {
    const input = JSON.stringify({ success: true, price_usd: 100 });
    expect(parseOutput(input)).toEqual({ success: true, price_usd: 100 });
  });
  test('parses object directly', () => {
    expect(parseOutput({ success: false })).toEqual({ success: false });
  });
  test('returns null for empty string', () => {
    expect(parseOutput('')).toBeNull();
  });
  test('returns null for invalid JSON', () => {
    expect(parseOutput('not json{')).toBeNull();
  });
  test('stale flag parsed correctly', () => {
    const input = JSON.stringify({ success: true, stale: true });
    expect(parseOutput(input)?.stale).toBe(true);
  });
});
