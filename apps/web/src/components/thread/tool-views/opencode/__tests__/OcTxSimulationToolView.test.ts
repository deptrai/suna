import { describe, test, expect } from 'bun:test';

function formatSlippage(bps: number | null | undefined): string {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(2)}%`;
}

function formatGasUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toFixed(4)}`;
}

function deriveSimId(url: string | null | undefined): string | null {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1] ?? null;
}

type AgentTier = 'tier1' | 'tier2' | 'tier3' | 'unknown';

function isSandboxEnabled(tier: AgentTier): boolean {
  return tier === 'tier2' || tier === 'tier3';
}

describe('OcTxSimulationToolView — formatSlippage', () => {
  test('converts bps to percent', () => {
    expect(formatSlippage(50)).toBe('0.50%');
    expect(formatSlippage(100)).toBe('1.00%');
    expect(formatSlippage(300)).toBe('3.00%');
  });
  test('returns em-dash for null', () => {
    expect(formatSlippage(null)).toBe('—');
  });
});

describe('OcTxSimulationToolView — formatGasUsd', () => {
  test('formats USD value', () => {
    expect(formatGasUsd(12.5)).toBe('$12.5000');
    expect(formatGasUsd(0.001)).toBe('$0.0010');
  });
  test('returns em-dash for null', () => {
    expect(formatGasUsd(null)).toBe('—');
  });
});

describe('OcTxSimulationToolView — deriveSimId', () => {
  test('extracts simulation ID from Tenderly URL', () => {
    const url = 'https://dashboard.tenderly.co/me/project/simulator/abc123';
    expect(deriveSimId(url)).toBe('abc123');
  });
  test('returns null for null URL', () => {
    expect(deriveSimId(null)).toBeNull();
  });
});

describe('OcTxSimulationToolView — sandbox button gate', () => {
  test('Tier 1 cannot use sandbox', () => {
    expect(isSandboxEnabled('tier1')).toBe(false);
  });
  test('Tier 2 can use sandbox', () => {
    expect(isSandboxEnabled('tier2')).toBe(true);
  });
  test('Tier 3 can use sandbox', () => {
    expect(isSandboxEnabled('tier3')).toBe(true);
  });
  test('unknown cannot use sandbox', () => {
    expect(isSandboxEnabled('unknown')).toBe(false);
  });
});
