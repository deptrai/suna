import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ─── Mutable module-level state ───────────────────────────────────────────────

let _hasDatabaseUrl = true;
let _isLocal = false;
let _billingEnabled = true;

let _checkResult: { hasCredits: boolean; balance: number; message: string } = {
  hasCredits: true,
  balance: 10,
  message: 'ok',
};

type DeductResult = {
  success: boolean;
  amountDeducted?: number;
  newBalance?: number;
  transactionId?: string;
  error?: string;
};
let _deductResult: DeductResult = {
  success: true,
  amountDeducted: 0.05,
  newBalance: 9.95,
  transactionId: 'tx-1',
};

let _lastDeductDescription = '';

// ─── Module mocks (hoisted) ──────────────────────────────────────────────────

mock.module('../../config', () => ({
  config: {
    get DATABASE_URL() { return _hasDatabaseUrl ? 'postgres://test' : undefined; },
    get EPSILON_BILLING_INTERNAL_ENABLED() { return _billingEnabled; },
    isLocal: () => _isLocal,
  },
  getToolCost: (name: string, _resultCount?: number) => {
    if (name === 'free_tool') return 0;
    if (name === 'web_search') return 0.05;
    return 0.01;
  },
}));

mock.module('../../shared/db', () => ({
  db: {} as any,
}));

mock.module('@epsilon/db', () => ({
  creditAccounts: { accountId: 'accountId', tier: 'tier' },
}));

mock.module('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
}));

mock.module('../../repositories/credits', () => ({
  checkCredits: async () => _checkResult,
  deductCredits: async (_acct: string, _amount: number, description: string) => {
    _lastDeductDescription = description;
    return _deductResult;
  },
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

const { checkCredits, deductToolCredits, deductLLMCredits } = await import(
  '../../router/services/billing'
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('checkCredits', () => {
  beforeEach(() => {
    _hasDatabaseUrl = true;
    _isLocal = false;
    _billingEnabled = true;
    _checkResult = { hasCredits: true, balance: 10, message: 'ok' };
  });

  test('[P0] returns hasCredits:true when DB reports sufficient balance', async () => {
    const result = await checkCredits('acct-1', 0.01);
    expect(result.hasCredits).toBe(true);
    expect(result.balance).toBe(10);
  });

  test('[P0] returns hasCredits:false when DB reports insufficient balance', async () => {
    _checkResult = { hasCredits: false, balance: 0, message: 'Insufficient' };
    const result = await checkCredits('acct-broke', 0.01);
    expect(result.hasCredits).toBe(false);
    expect(result.message).toBe('Insufficient');
  });

  test('[P0] throws when DATABASE_URL is missing in cloud mode', async () => {
    _hasDatabaseUrl = false;
    _isLocal = false;
    await expect(checkCredits('acct-1', 0.01)).rejects.toThrow(
      'DATABASE_URL is required for credit checks',
    );
  });

  test('[P1] short-circuits to allow when DATABASE_URL missing in local mode', async () => {
    _hasDatabaseUrl = false;
    _isLocal = true;
    const result = await checkCredits('acct-local', 0.01);
    expect(result.hasCredits).toBe(true);
    expect(result.message).toContain('local mode');
  });

  test('[P1] in local mode, missing credit account is treated as allowed', async () => {
    _isLocal = true;
    _checkResult = { hasCredits: false, balance: 0, message: 'No credit account' };
    const result = await checkCredits('acct-local-nocreds', 0.01);
    expect(result.hasCredits).toBe(true);
  });
});

describe('deductToolCredits', () => {
  beforeEach(() => {
    _hasDatabaseUrl = true;
    _isLocal = false;
    _billingEnabled = true;
    _deductResult = {
      success: true,
      amountDeducted: 0.05,
      newBalance: 9.95,
      transactionId: 'tx-1',
    };
  });

  test('[P0] returns success with cost when deduction succeeds', async () => {
    const result = await deductToolCredits('acct-1', 'web_search', 0, 'desc');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0.05);
    expect(result.newBalance).toBe(9.95);
    expect(result.transactionId).toBe('tx-1');
  });

  test('[P0] returns success with cost=0 when tool cost is 0 (no DB call)', async () => {
    const result = await deductToolCredits('acct-1', 'free_tool', 0);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0);
  });

  test('[P0] returns failure with error when DB deduct returns success:false', async () => {
    _deductResult = { success: false, error: 'Insufficient credits' };
    const result = await deductToolCredits('acct-broke', 'web_search', 0);
    expect(result.success).toBe(false);
    expect(result.cost).toBe(0);
    expect(result.error).toBe('Insufficient credits');
  });

  test('[P0] throws when DATABASE_URL missing in cloud mode', async () => {
    _hasDatabaseUrl = false;
    _isLocal = false;
    await expect(deductToolCredits('acct-1', 'web_search', 0)).rejects.toThrow(
      'DATABASE_URL is required for credit deductions',
    );
  });

  test('[P1] short-circuits success when DATABASE_URL missing in local mode', async () => {
    _hasDatabaseUrl = false;
    _isLocal = true;
    const result = await deductToolCredits('acct-1', 'web_search', 0);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0);
  });

  test('[P1] short-circuits success when EPSILON_BILLING_INTERNAL_ENABLED is false', async () => {
    _billingEnabled = false;
    const result = await deductToolCredits('acct-1', 'web_search', 0);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0);
    expect(result.newBalance).toBe(0);
  });

  test('[P1] forwards sessionId into description for audit trail', async () => {
    _lastDeductDescription = '';
    await deductToolCredits('acct-1', 'web_search', 0, undefined, 'sess-abc');
    expect(_lastDeductDescription).toContain('[session:sess-abc]');
  });

  test('[P1] uses provided description override when given', async () => {
    _lastDeductDescription = '';
    await deductToolCredits('acct-1', 'web_search', 0, 'Custom Tool Action');
    expect(_lastDeductDescription).toContain('Custom Tool Action');
  });
});

describe('deductLLMCredits', () => {
  beforeEach(() => {
    _hasDatabaseUrl = true;
    _isLocal = false;
    _billingEnabled = true;
    _deductResult = {
      success: true,
      amountDeducted: 0.000123,
      newBalance: 9.999877,
      transactionId: 'tx-llm-1',
    };
  });

  test('[P0] returns success:true cost:0 when calculatedCost is 0 (no DB call)', async () => {
    const result = await deductLLMCredits('acct-1', 'gpt-4', 100, 50, 0);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0);
  });

  test('[P0] returns success with calculated cost when deduction succeeds', async () => {
    const result = await deductLLMCredits('acct-1', 'gpt-4', 100, 50, 0.000123);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0.000123);
    expect(result.transactionId).toBe('tx-llm-1');
  });

  test('[P0] returns failure when DB deduct returns success:false', async () => {
    _deductResult = { success: false, error: 'Insufficient credits' };
    const result = await deductLLMCredits('acct-broke', 'gpt-4', 100, 50, 0.05);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Insufficient credits');
  });

  test('[P0] throws when DATABASE_URL missing in cloud mode', async () => {
    _hasDatabaseUrl = false;
    _isLocal = false;
    await expect(deductLLMCredits('acct-1', 'gpt-4', 100, 50, 0.05)).rejects.toThrow(
      'DATABASE_URL is required for credit deductions',
    );
  });

  test('[P1] short-circuits when EPSILON_BILLING_INTERNAL_ENABLED is false', async () => {
    _billingEnabled = false;
    const result = await deductLLMCredits('acct-1', 'gpt-4', 100, 50, 0.05);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0);
  });
});
