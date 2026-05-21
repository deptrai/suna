import { describe, expect, it, beforeEach, mock } from 'bun:test';

// ─── shared/db mock — needed for P17 deductTokens DB path tests ──────────────
// Must be declared before imports so Bun hoists it before module evaluation.
let _dbExecuteFn: (...args: any[]) => any = async () => [];

mock.module('../../shared/db', () => ({
  hasDatabase: true,
  db: {
    execute: (...args: any[]) => _dbExecuteFn(...args),
  },
}));

import { config } from '../../config';
import { getMultiplier, deductTokens } from '../../router/services/token-billing';
import { pickModel, poolForTier, resetPoolCounters } from '../../router/services/model-pool';

describe('token billing', () => {
  beforeEach(() => {
    _dbExecuteFn = async () => [];  // reset to no-op between tests
    (config as any).TOKEN_MULTIPLIER_FREE = 1;
    (config as any).TOKEN_MULTIPLIER_FREE_THINKING = 1.5;
    (config as any).TOKEN_MULTIPLIER_PREMIUM = 4;
    (config as any).TOKEN_MULTIPLIER_PREMIUM_THINKING = 6;
    (config as any).FREE_MODEL_POOL = 'gpt-4o-mini,claude-haiku';
    (config as any).PREMIUM_MODEL_POOL = 'gpt-4o,claude-sonnet';
    (config as any).EPSILON_BILLING_INTERNAL_ENABLED = false;
    // P19: reset round-robin counters so each test starts from idx=0
    resetPoolCounters();
  });

  it('multiplier free normal', () => expect(getMultiplier('free', false)).toBe(1));
  it('multiplier free thinking', () => expect(getMultiplier('free', true)).toBe(1.5));
  it('multiplier premium normal', () => expect(getMultiplier('premium', false)).toBe(4));
  it('multiplier premium thinking', () => expect(getMultiplier('premium', true)).toBe(6));

  it('poolForTier free', () => expect(poolForTier('free')).toBe('free'));
  it('poolForTier pro', () => expect(poolForTier('pro')).toBe('premium'));
  it('poolForTier enterprise', () => expect(poolForTier('enterprise')).toBe('premium'));

  it('pickModel free round robin 1', () => expect(pickModel('free')).toBe('gpt-4o-mini'));
  it('pickModel free round robin 2', () => {
    pickModel('free');
    expect(pickModel('free')).toBe('claude-haiku');
  });
  it('pickModel free round robin loops', () => {
    pickModel('free');
    pickModel('free');
    expect(pickModel('free')).toBe('gpt-4o-mini');
  });

  it('pickModel premium round robin 1', () => expect(pickModel('premium')).toBe('gpt-4o'));
  it('pickModel premium round robin 2', () => {
    pickModel('premium');
    expect(pickModel('premium')).toBe('claude-sonnet');
  });
  it('pickModel premium round robin loops', () => {
    pickModel('premium');
    pickModel('premium');
    expect(pickModel('premium')).toBe('gpt-4o');
  });

  it('pickModel free empty throws', () => {
    (config as any).FREE_MODEL_POOL = '';
    expect(() => pickModel('free')).toThrow('Empty model pool: free');
  });

  it('pickModel premium empty throws', () => {
    (config as any).PREMIUM_MODEL_POOL = '';
    expect(() => pickModel('premium')).toThrow('Empty model pool: premium');
  });

  it('deductTokens bypass when billing disabled', async () => {
    const result = await deductTokens({ accountId: '00000000-0000-0000-0000-000000000000', actualTokens: 123, modelPool: 'free', thinkingEnabled: false });
    expect(result.success).toBe(true);
    expect(result.tokensDeducted).toBe(0n);
  });

  it('deductTokens bypass with thinking enabled', async () => {
    const result = await deductTokens({ accountId: '00000000-0000-0000-0000-000000000000', actualTokens: 123, modelPool: 'premium', thinkingEnabled: true });
    expect(result.success).toBe(true);
    expect(result.subRemaining).toBe(0n);
    expect(result.topupRemaining).toBe(0n);
  });

  it('multiplier can be changed by config', () => {
    (config as any).TOKEN_MULTIPLIER_PREMIUM_THINKING = 7;
    expect(getMultiplier('premium', true)).toBe(7);
  });

  it('free pool trims whitespace entries', () => {
    (config as any).FREE_MODEL_POOL = '  a , b  ';
    expect(['a', 'b']).toContain(pickModel('free'));
  });

  it('premium pool trims whitespace entries', () => {
    (config as any).PREMIUM_MODEL_POOL = '  x , y  ';
    expect(['x', 'y']).toContain(pickModel('premium'));
  });

  it('deductTokens bypass regardless of token amount', async () => {
    const result = await deductTokens({ accountId: '00000000-0000-0000-0000-000000000000', actualTokens: 999999, modelPool: 'premium', thinkingEnabled: false });
    expect(result.success).toBe(true);
  });

  // P17: additional tests for real deduct paths
  it('deductTokens insufficient_tokens returns tokensDeducted=0n', async () => {
    (config as any).EPSILON_BILLING_INTERNAL_ENABLED = true;
    _dbExecuteFn = async () => [{ success: false, sub_remaining: 500n, topup_remaining: 0n }];
    const result = await deductTokens({ accountId: '00000000-0000-0000-0000-000000000000', actualTokens: 100, modelPool: 'free', thinkingEnabled: false });
    expect(result.success).toBe(false);
    expect(result.error).toBe('insufficient_tokens');
    // P18: tokensDeducted must be 0n on failure — nothing was actually deducted
    expect(result.tokensDeducted).toBe(0n);
  });

  it('deductTokens db_error returns tokensDeducted=0n', async () => {
    (config as any).EPSILON_BILLING_INTERNAL_ENABLED = true;
    _dbExecuteFn = async () => { throw new Error('connection refused'); };
    const result = await deductTokens({ accountId: '00000000-0000-0000-0000-000000000000', actualTokens: 100, modelPool: 'premium', thinkingEnabled: false });
    expect(result.success).toBe(false);
    expect(result.error).toBe('db_error');
    // P18: tokensDeducted must be 0n on db_error too
    expect(result.tokensDeducted).toBe(0n);
  });

  it('deductTokens success returns correct tokensDeducted', async () => {
    (config as any).EPSILON_BILLING_INTERNAL_ENABLED = true;
    // 100 tokens × 4× premium multiplier = 400 cost
    _dbExecuteFn = async () => [{ success: true, sub_remaining: 9600n, topup_remaining: 1000n }];
    const result = await deductTokens({ accountId: '00000000-0000-0000-0000-000000000000', actualTokens: 100, modelPool: 'premium', thinkingEnabled: false });
    expect(result.success).toBe(true);
    expect(result.tokensDeducted).toBe(400n);
    expect(result.subRemaining).toBe(9600n);
    expect(result.topupRemaining).toBe(1000n);
  });
});
