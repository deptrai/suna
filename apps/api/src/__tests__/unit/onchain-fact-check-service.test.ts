import { describe, expect, test } from 'bun:test';
import { computeRiskForWallets, type WalletTransferMetrics } from '../../router/services/onchain-fact-check';

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
});
