import { describe, expect, test } from 'bun:test';
import {
  computeRiskForWallets,
  extractReliableTokenAddress,
  isPromotionalArticle,
  type WalletTransferMetrics,
} from '../../router/services/onchain-fact-check';

function metric(partial: Partial<WalletTransferMetrics>): WalletTransferMetrics {
  return {
    walletAddress: '0xabc',
    walletRole: 'dev',
    label: null,
    outgoingRaw: 0n,
    incomingRaw: 0n,
    netOutflowRaw: 0n,
    currentBalanceRaw: 0n,
    previousBalanceRaw: 0n,
    walletOutflowPct: 0,
    transferCount: 0,
    basis: 'full',
    ...partial,
  };
}

describe('computeRiskForWallets', () => {
  test('[P0] positive article and >5% outflow => flagged', () => {
    const result = computeRiskForWallets('positive', [
      metric({
        walletAddress: '0x1',
        netOutflowRaw: 60n,
        previousBalanceRaw: 1000n,
        walletOutflowPct: 6,
        transferCount: 2,
      }),
    ]);
    expect(result.status).toBe('flagged');
    expect(result.riskLevel).toBe('high');
    expect(result.netOutflowPct).toBeGreaterThan(5);
  });

  test('[P0] outflow <=5% => passed', () => {
    const result = computeRiskForWallets('positive', [
      metric({
        netOutflowRaw: 40n,
        previousBalanceRaw: 1000n,
        walletOutflowPct: 4,
      }),
    ]);
    expect(result.status).toBe('passed');
    expect(result.riskLevel).toBe('none');
  });

  test('[P0] missing current balance -> transfer_only confidence downgrade', () => {
    const result = computeRiskForWallets('positive', [
      metric({
        netOutflowRaw: 60n,
        previousBalanceRaw: null,
        currentBalanceRaw: null,
        walletOutflowPct: null,
        basis: 'transfer_only',
      }),
    ]);
    expect(result.status).toBe('passed');
    expect(result.riskLevel).toBe('low');
    expect(result.riskFactors.some((r) => r.code === 'transfer_only_confidence')).toBe(true);
  });

  test('[P1] neutral sentiment + >5% outflow => NOT flagged', () => {
    const result = computeRiskForWallets('neutral', [
      metric({ netOutflowRaw: 60n, previousBalanceRaw: 1000n, walletOutflowPct: 6 }),
    ]);
    expect(result.status).toBe('passed');
    expect(result.riskLevel).toBe('none');
  });

  test('[P1] negative sentiment + >5% outflow => NOT flagged', () => {
    const result = computeRiskForWallets('negative', [
      metric({ netOutflowRaw: 60n, previousBalanceRaw: 1000n, walletOutflowPct: 6 }),
    ]);
    expect(result.status).toBe('passed');
  });

  test('[P1] empty wallet array => passed, 0 wallets, 0 transfers', () => {
    const result = computeRiskForWallets('positive', []);
    expect(result.status).toBe('passed');
    expect(result.riskLevel).toBe('none');
    expect(result.walletsChecked).toBe(0);
    expect(result.transferCount).toBe(0);
    expect(result.netOutflowPct).toBeNull();
  });

  test('[P1] only market_maker/exchange roles => outflow not aggregated, stays passed', () => {
    const result = computeRiskForWallets('positive', [
      metric({ walletRole: 'market_maker', netOutflowRaw: 500n, previousBalanceRaw: 1000n, walletOutflowPct: 50 }),
      metric({ walletRole: 'exchange', netOutflowRaw: 300n, previousBalanceRaw: 1000n, walletOutflowPct: 30 }),
    ]);
    expect(result.status).toBe('passed');
    expect(result.netOutflowPct).toBeNull();
    expect(result.walletsChecked).toBe(2);
  });

  test('[P1] exactly at threshold (5.0%) => passed (threshold is strictly >5)', () => {
    const result = computeRiskForWallets('positive', [
      metric({ netOutflowRaw: 50n, previousBalanceRaw: 1000n, walletOutflowPct: 5 }),
    ]);
    expect(result.status).toBe('passed');
  });

  test('[P2] transfer_only wallet alongside flagged full-basis wallet => flagged but downgraded to medium', () => {
    const result = computeRiskForWallets('positive', [
      metric({ walletRole: 'dev', netOutflowRaw: 60n, previousBalanceRaw: 1000n, walletOutflowPct: 6, basis: 'full' }),
      metric({ walletRole: 'treasury', netOutflowRaw: 0n, previousBalanceRaw: null, currentBalanceRaw: null, walletOutflowPct: null, basis: 'transfer_only' }),
    ]);
    expect(result.status).toBe('flagged');
    expect(result.riskLevel).toBe('medium');
    expect(result.riskFactors.some((r) => r.code === 'transfer_only_confidence')).toBe(true);
  });

  test('[P2] net inflow (incoming > outgoing) => 0 net outflow, passed', () => {
    const result = computeRiskForWallets('positive', [
      metric({ netOutflowRaw: -50n, previousBalanceRaw: 1000n, walletOutflowPct: -5 }),
    ]);
    expect(result.status).toBe('passed');
    expect(result.netOutflowPct).toBe(0);
  });
});

describe('extractReliableTokenAddress', () => {
  test('[P0] extracts valid EVM address from text', () => {
    const addr = extractReliableTokenAddress('Token at 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 launched');
    expect(addr).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  });

  test('[P0] returns null when no address in text', () => {
    expect(extractReliableTokenAddress('No address here')).toBeNull();
  });

  test('[P0] returns null for undefined input', () => {
    expect(extractReliableTokenAddress(undefined)).toBeNull();
  });

  test('[P1] lowercases the extracted address', () => {
    const addr = extractReliableTokenAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');
    expect(addr).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
  });

  test('[P1] returns first address when multiple addresses present', () => {
    const addr = extractReliableTokenAddress(
      'From 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa to 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );
    expect(addr).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  test('[P2] short hex string (not 40 chars) not matched', () => {
    expect(extractReliableTokenAddress('0x1234')).toBeNull();
  });
});

describe('isPromotionalArticle', () => {
  test('[P0] true for "partnership" keyword', () => {
    expect(isPromotionalArticle('New partnership announced with major exchange')).toBe(true);
  });

  test('[P0] true for "listing" keyword (case-insensitive)', () => {
    expect(isPromotionalArticle('TOKEN LISTING on Binance confirmed')).toBe(true);
  });

  test('[P0] true for "launch" keyword', () => {
    expect(isPromotionalArticle('Mainnet launch successful')).toBe(true);
  });

  test('[P0] false for non-promotional text', () => {
    expect(isPromotionalArticle('Market prices declined today')).toBe(false);
  });

  test('[P0] false for undefined input', () => {
    expect(isPromotionalArticle(undefined)).toBe(false);
  });

  test('[P1] true for "exchange listing" two-word keyword', () => {
    expect(isPromotionalArticle('exchange listing expected next week')).toBe(true);
  });

  test('[P1] true for "funding" keyword', () => {
    expect(isPromotionalArticle('$50M funding round closed')).toBe(true);
  });
});
