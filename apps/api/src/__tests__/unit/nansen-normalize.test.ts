import { describe, expect, test } from 'bun:test';
import {
  toNum,
  normalizeTopBuyers,
  normalizeTopSellers,
  normalizeFlowBreakdown,
  summarizeNetflow,
  computeSignalFactors,
  deriveRiskLevel,
  buildSignalSummary,
} from '../../router/services/nansen-normalize';

// ─── toNum ───────────────────────────────────────────────────────────────────

describe('toNum', () => {
  test('converts numeric string', () => expect(toNum('123.45', 0)).toBe(123.45));
  test('converts number', () => expect(toNum(42, 0)).toBe(42));
  test('returns fallback for undefined', () => expect(toNum(undefined, 99)).toBe(99));
  test('returns fallback for non-numeric string', () => expect(toNum('abc', 0)).toBe(0));
  test('returns fallback for NaN', () => expect(toNum(NaN, 5)).toBe(5));
});

// ─── normalizeTopBuyers ───────────────────────────────────────────────────────
// Nansen API returns camelCase fields (boughtVolumeUsd, soldVolumeUsd, etc.)

describe('normalizeTopBuyers', () => {
  const rows = [
    { address: '0xA', boughtVolumeUsd: '500', soldVolumeUsd: '100', netVolumeUsd: '400', txCount: 10, label: 'whale' },
    { address: '0xB', boughtVolumeUsd: '2000', soldVolumeUsd: '0', netVolumeUsd: '2000', txCount: 5 },
    { address: '0xC', boughtVolumeUsd: '100', soldVolumeUsd: '50', netVolumeUsd: '50', txCount: 2 },
  ];

  test('[P0] sorted by bought_volume_usd descending', () => {
    const result = normalizeTopBuyers(rows, 10);
    expect(result[0]!.bought_volume_usd).toBe(2000);
    expect(result[1]!.bought_volume_usd).toBe(500);
    expect(result[2]!.bought_volume_usd).toBe(100);
  });

  test('[P0] limit is respected', () => {
    expect(normalizeTopBuyers(rows, 2)).toHaveLength(2);
  });

  test('[P1] result shape has required fields', () => {
    const [first] = normalizeTopBuyers(rows, 1);
    expect(first).toMatchObject({
      address: '0xB',
      bought_volume_usd: 2000,
    });
  });

  test('returns empty array for empty input', () => {
    expect(normalizeTopBuyers([], 10)).toEqual([]);
  });

  test('filters out rows with no address', () => {
    const withEmpty = [{ address: '', boughtVolumeUsd: '500' }, ...rows];
    expect(normalizeTopBuyers(withEmpty as any, 10)).toHaveLength(rows.length);
  });
});

// ─── normalizeTopSellers ──────────────────────────────────────────────────────

describe('normalizeTopSellers', () => {
  const rows = [
    { address: '0xA', soldVolumeUsd: '300', boughtVolumeUsd: '50', netVolumeUsd: '-250', txCount: 3 },
    { address: '0xB', soldVolumeUsd: '1500', boughtVolumeUsd: '0', netVolumeUsd: '-1500', txCount: 8, label: 'fund' },
  ];

  test('[P0] sorted by sold_volume_usd descending', () => {
    const result = normalizeTopSellers(rows, 10);
    expect(result[0]!.sold_volume_usd).toBe(1500);
    expect(result[1]!.sold_volume_usd).toBe(300);
  });

  test('[P0] limit is respected', () => {
    expect(normalizeTopSellers(rows, 1)).toHaveLength(1);
  });
});

// ─── normalizeFlowBreakdown ───────────────────────────────────────────────────
// Nansen returns camelCase: inflowUsd, outflowUsd, netflowUsd

describe('normalizeFlowBreakdown', () => {
  test('[P0] maps inflowUsd/outflowUsd/netflowUsd correctly', () => {
    const rows = [{ label: 'smart_money', inflowUsd: '1000', outflowUsd: '400', netflowUsd: '600', walletCount: 5, traderCount: 3 }];
    const [r] = normalizeFlowBreakdown(rows);
    expect(r!.inflow_usd).toBe(1000);
    expect(r!.outflow_usd).toBe(400);
    expect(r!.netflow_usd).toBe(600);
    expect(r!.wallet_count).toBe(5);
    expect(r!.trader_count).toBe(3);
  });

  test('returns empty array for empty input', () => {
    expect(normalizeFlowBreakdown([])).toEqual([]);
  });

  test('defaults missing label to unknown', () => {
    const [r] = normalizeFlowBreakdown([{ inflowUsd: '0' }]);
    expect(r!.label).toBe('unknown');
  });
});

// ─── summarizeNetflow ─────────────────────────────────────────────────────────

describe('summarizeNetflow', () => {
  test('[P0] returns smart_money_net_flow_usd', () => {
    const rows = [{ netflowUsd: '500' }, { netflowUsd: '-200' }] as any[];
    const result = summarizeNetflow(rows);
    expect(result.smart_money_net_flow_usd).toBe(300);
  });

  test('counts wallets with walletCount field', () => {
    const rows = [{ netflowUsd: '100', walletCount: 10 }, { netflowUsd: '50', walletCount: 5 }] as any[];
    expect(summarizeNetflow(rows).wallet_count).toBe(15);
  });

  test('returns zero for empty rows', () => {
    const result = summarizeNetflow([]);
    expect(result.smart_money_net_flow_usd).toBe(0);
    expect(result.wallet_count).toBe(0);
  });

  test('returns null for exchange_net_flow_usd', () => {
    const result = summarizeNetflow([]);
    expect(result.exchange_net_flow_usd).toBeNull();
  });
});

// ─── computeSignalFactors ─────────────────────────────────────────────────────

describe('computeSignalFactors', () => {
  test('[P0] smart_money_accumulation when smNet > 0', () => {
    const factors = computeSignalFactors({ smartMoneyNetFlowUsd: 100_000 });
    expect(factors.map((f) => f.code)).toContain('smart_money_accumulation');
    expect(factors.map((f) => f.code)).not.toContain('smart_money_distribution');
  });

  test('[P0] smart_money_distribution when smNet < 0', () => {
    const factors = computeSignalFactors({ smartMoneyNetFlowUsd: -150_000 });
    expect(factors.map((f) => f.code)).toContain('smart_money_distribution');
  });

  test('[P0] exchange_inflow_sell_pressure when exNet > 0', () => {
    const factors = computeSignalFactors({ exchangeNetFlowUsd: 100 });
    expect(factors.map((f) => f.code)).toContain('exchange_inflow_sell_pressure');
  });

  test('[P0] exchange_outflow_accumulation requires BOTH exNet < 0 AND smNet > 0', () => {
    // exNet < 0 alone — no signal
    const noSignal = computeSignalFactors({ exchangeNetFlowUsd: -200_000 });
    expect(noSignal.map((f) => f.code)).not.toContain('exchange_outflow_accumulation');
    // Both conditions met
    const withSignal = computeSignalFactors({ smartMoneyNetFlowUsd: 100_000, exchangeNetFlowUsd: -200_000 });
    expect(withSignal.map((f) => f.code)).toContain('exchange_outflow_accumulation');
  });

  test('[P0] high_buyer_concentration requires buyCount/(buy+sell) > 0.8', () => {
    // 90% buyers → flag
    const factors = computeSignalFactors({ topBuyerCount: 9, topSellerCount: 1 });
    expect(factors.map((f) => f.code)).toContain('high_buyer_concentration');
    // 50% buyers → no flag
    const noFlag = computeSignalFactors({ topBuyerCount: 5, topSellerCount: 5 });
    expect(noFlag.map((f) => f.code)).not.toContain('high_buyer_concentration');
  });

  test('[P0] provider_partial_data flag when isPartialData=true', () => {
    const factors = computeSignalFactors({ isPartialData: true });
    expect(factors.map((f) => f.code)).toContain('provider_partial_data');
  });

  test('no factors for neutral input', () => {
    expect(computeSignalFactors({})).toHaveLength(0);
  });

  test('[P1] severity high when smNet > 1M', () => {
    const factors = computeSignalFactors({ smartMoneyNetFlowUsd: 2_000_000 });
    const acc = factors.find((f) => f.code === 'smart_money_accumulation');
    expect(acc?.severity).toBe('high');
  });

  test('[P1] severity medium when smNet between 0 and 1M', () => {
    const factors = computeSignalFactors({ smartMoneyNetFlowUsd: 100_000 });
    const acc = factors.find((f) => f.code === 'smart_money_accumulation');
    expect(acc?.severity).toBe('medium');
  });
});

// ─── deriveRiskLevel ─────────────────────────────────────────────────────────

describe('deriveRiskLevel', () => {
  test('returns none for empty factors', () => {
    expect(deriveRiskLevel([])).toBe('none');
  });

  test('critical factor → critical risk level', () => {
    const factors = [{ code: 'test', label: '', severity: 'critical' as const }];
    expect(deriveRiskLevel(factors)).toBe('critical');
  });

  test('high factor → high risk level', () => {
    const factors = [{ code: 'test', label: '', severity: 'high' as const }];
    expect(deriveRiskLevel(factors)).toBe('high');
  });

  test('medium factor → medium risk level', () => {
    const factors = [{ code: 'test', label: '', severity: 'medium' as const }];
    expect(deriveRiskLevel(factors)).toBe('medium');
  });

  test('low factor → low risk level', () => {
    const factors = [{ code: 'test', label: '', severity: 'low' as const }];
    expect(deriveRiskLevel(factors)).toBe('low');
  });

  test('highest severity wins across multiple factors', () => {
    const factors = [
      { code: 'a', label: '', severity: 'low' as const },
      { code: 'b', label: '', severity: 'high' as const },
    ];
    expect(deriveRiskLevel(factors)).toBe('high');
  });
});

// ─── buildSignalSummary ───────────────────────────────────────────────────────

describe('buildSignalSummary', () => {
  test('[P0] bullish when smNet > 500k', () => {
    const s = buildSignalSummary({ smartMoneyNetFlowUsd: 600_000, topBuyers: [], topSellers: [] });
    expect(s.signal).toBe('bullish');
  });

  test('[P0] mildly_bullish when 0 < smNet <= 500k', () => {
    const s = buildSignalSummary({ smartMoneyNetFlowUsd: 100_000, topBuyers: [], topSellers: [] });
    expect(s.signal).toBe('mildly_bullish');
  });

  test('[P0] bearish when smNet < -500k', () => {
    const s = buildSignalSummary({ smartMoneyNetFlowUsd: -600_000, topBuyers: [], topSellers: [] });
    expect(s.signal).toBe('bearish');
  });

  test('[P0] mildly_bearish when -500k <= smNet < 0', () => {
    const s = buildSignalSummary({ smartMoneyNetFlowUsd: -100_000, topBuyers: [], topSellers: [] });
    expect(s.signal).toBe('mildly_bearish');
  });

  test('neutral when near zero', () => {
    const s = buildSignalSummary({ smartMoneyNetFlowUsd: 0, topBuyers: [], topSellers: [] });
    expect(s.signal).toBe('neutral');
  });

  test('includes top_buyer_count and top_seller_count', () => {
    const buyers = [{ address: '0x1', bought_volume_usd: 100 }];
    const s = buildSignalSummary({ smartMoneyNetFlowUsd: 100, topBuyers: buyers as any, topSellers: [] });
    expect(s.top_buyer_count).toBe(1);
    expect(s.top_seller_count).toBe(0);
  });
});
