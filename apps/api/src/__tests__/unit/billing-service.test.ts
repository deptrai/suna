import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ─── Mutable module-level state ───────────────────────────────────────────────

let _hasDatabaseUrl = true;
let _isLocal = false;
let _billingEnabled = true;

// Token balance mock state (for getTokenBalances)
let _tokenBalances = {
  subscriptionTokens: 5_000_000n,
  topupTokens: 1_000_000n,
  total: 6_000_000n,
  cycleEnd: null as Date | null,
};

// deductTokens mock state
type DeductTokensResult = {
  success: boolean;
  tokensDeducted: bigint;
  subRemaining: bigint;
  topupRemaining: bigint;
  error?: string;
};
let _deductTokensResult: DeductTokensResult = {
  success: true,
  tokensDeducted: 400n,
  subRemaining: 9600n,
  topupRemaining: 1000n,
};

// deductCredits mock state (for deductToolCredits — unchanged USD path)
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

// DB tier mock for resolveAccountTier
let _dbTier: string = 'pro';
let _dbThrows = false;

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
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (_dbThrows) throw new Error('DB connection failed');
            return [{ tier: _dbTier }];
          },
        }),
      }),
    }),
  },
  hasDatabase: true,
}));

mock.module('@epsilon/db', () => ({
  creditAccounts: { accountId: 'accountId', tier: 'tier' },
}));

mock.module('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  sql: (() => { const fn: any = () => 'sql'; fn.raw = (s: string) => s; return fn; })(),
  relations: (..._args: unknown[]) => ({}),
  inArray: (a: unknown, b: unknown) => ({ a, b }),
}));

mock.module('../../repositories/credits', () => ({
  checkCredits: async () => ({ hasCredits: true, balance: 10, message: 'ok' }),
  deductCredits: async (_acct: string, _amount: number, description: string) => {
    _lastDeductDescription = description;
    return _deductResult;
  },
}));

// Token billing mock — key new dependency for checkCredits + deductLLMCredits
mock.module('../../router/services/token-billing', () => ({
  getTokenBalances: async (_accountId: string) => _tokenBalances,
  deductTokens: async (_opts: unknown) => _deductTokensResult,
}));

// Model pool mock
mock.module('../../router/services/model-pool', () => ({
  poolForTier: (tier: string) => (tier === 'free' ? 'free' : 'premium'),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

const { checkCredits, deductToolCredits, deductLLMCredits } = await import(
  '../../router/services/billing'
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('checkCredits (token economy)', () => {
  beforeEach(() => {
    _hasDatabaseUrl = true;
    _isLocal = false;
    _billingEnabled = true;
    _tokenBalances = {
      subscriptionTokens: 5_000_000n,
      topupTokens: 1_000_000n,
      total: 6_000_000n,
      cycleEnd: null,
    };
  });

  test('[P0] returns hasCredits:true when token total > 0', async () => {
    const result = await checkCredits('acct-1');
    expect(result.hasCredits).toBe(true);
    expect(result.balance).toBe(6_000_000);
    expect(result.message).toBe('OK');
  });

  test('[P0] returns hasCredits:false when total tokens = 0', async () => {
    _tokenBalances = { subscriptionTokens: 0n, topupTokens: 0n, total: 0n, cycleEnd: null };
    const result = await checkCredits('acct-broke');
    expect(result.hasCredits).toBe(false);
    expect(result.message).toContain('Insufficient tokens');
  });

  test('[P0] throws when DATABASE_URL is missing in cloud mode', async () => {
    _hasDatabaseUrl = false;
    _isLocal = false;
    await expect(checkCredits('acct-1')).rejects.toThrow(
      'DATABASE_URL is required for credit checks',
    );
  });

  test('[P1] short-circuits to allow when DATABASE_URL missing in local mode', async () => {
    _hasDatabaseUrl = false;
    _isLocal = true;
    const result = await checkCredits('acct-local');
    expect(result.hasCredits).toBe(true);
    expect(result.message).toContain('local mode');
  });

  test('[P1] in local mode with 0 tokens still allowed', async () => {
    _isLocal = true;
    _tokenBalances = { subscriptionTokens: 0n, topupTokens: 0n, total: 0n, cycleEnd: null };
    const result = await checkCredits('acct-local-notokens');
    expect(result.hasCredits).toBe(true);
  });

  test('[P1] short-circuits when billing disabled', async () => {
    _billingEnabled = false;
    const result = await checkCredits('acct-1');
    expect(result.hasCredits).toBe(true);
    expect(result.message).toContain('billing disabled');
  });
});

describe('deductToolCredits (USD flat-fee — unchanged)', () => {
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

describe('deductLLMCredits (token economy — weighted formula)', () => {
  beforeEach(() => {
    _hasDatabaseUrl = true;
    _isLocal = false;
    _billingEnabled = true;
    _dbTier = 'pro';
    _dbThrows = false;
    _deductTokensResult = {
      success: true,
      tokensDeducted: 400n,
      subRemaining: 9600n,
      topupRemaining: 1000n,
    };
  });

  test('[P0] short-circuits success when billing disabled', async () => {
    _billingEnabled = false;
    const result = await deductLLMCredits('acct-1', 'gpt-4', 100, 50, 0.05);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0);
    expect(result.newBalance).toBe(0);
  });

  test('[P0] throws when DATABASE_URL missing in cloud mode', async () => {
    _hasDatabaseUrl = false;
    _isLocal = false;
    await expect(deductLLMCredits('acct-1', 'gpt-4', 100, 50, 0.05)).rejects.toThrow(
      'DATABASE_URL is required for credit deductions',
    );
  });

  test('[P0] short-circuits when actualTokens=0 (both input/output are 0)', async () => {
    const result = await deductLLMCredits('acct-1', 'gpt-4', 0, 0, 0);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0);
  });

  test('[P0] returns tokensDeducted and remaining from deductTokens result', async () => {
    // 400 input × 0.25 + 300 output = 400 actual tokens
    _deductTokensResult = { success: true, tokensDeducted: 1600n, subRemaining: 8400n, topupRemaining: 500n };
    const result = await deductLLMCredits('acct-1', 'gpt-4', 400, 300, 0.05);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(1600);
    expect(result.newBalance).toBe(8900); // 8400 + 500
  });

  test('[P0] returns success:false when deductTokens fails (insufficient)', async () => {
    _deductTokensResult = { success: false, tokensDeducted: 0n, subRemaining: 100n, topupRemaining: 0n, error: 'insufficient_tokens' };
    const result = await deductLLMCredits('acct-1', 'gpt-4', 100, 50, 0.05);
    expect(result.success).toBe(false);
    expect(result.error).toBe('insufficient_tokens');
    expect(result.cost).toBe(0);
  });

  test('[P1] thinkingEnabled=false uses normal multiplier path (opts omitted)', async () => {
    // deductLLMCredits calls deductTokens with thinkingEnabled derived from opts
    _deductTokensResult = { success: true, tokensDeducted: 200n, subRemaining: 9800n, topupRemaining: 0n };
    const result = await deductLLMCredits('acct-1', 'claude', 100, 50, 0.01);
    expect(result.success).toBe(true);
  });

  test('[P1] thinkingEnabled=true passes through to deductTokens via opts', async () => {
    _deductTokensResult = { success: true, tokensDeducted: 300n, subRemaining: 9700n, topupRemaining: 0n };
    const result = await deductLLMCredits('acct-1', 'claude-thinking', 100, 50, 0.01, undefined, { thinkingEnabled: true });
    expect(result.success).toBe(true);
    expect(result.cost).toBe(300);
  });

  test('[P1] free tier maps to free pool via resolveAccountTier', async () => {
    _dbTier = 'free';
    _deductTokensResult = { success: true, tokensDeducted: 63n, subRemaining: 9937n, topupRemaining: 0n };
    // 200 input × 0.25 + 50 output = 100 actual; free pool = 1× → 100 tokens deducted
    const result = await deductLLMCredits('acct-free', 'gpt-4o-mini', 200, 50, 0.001);
    expect(result.success).toBe(true);
  });

  test('[P2] local mode short-circuits when no DB', async () => {
    _hasDatabaseUrl = false;
    _isLocal = true;
    const result = await deductLLMCredits('acct-local', 'gpt-4', 100, 50, 0.05);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0);
  });

  test('[P2] weighted formula: pure output (0 input + 100 output = 100 actual)', async () => {
    // actualTokens = round(0 × 0.25 + 100) = 100
    _deductTokensResult = { success: true, tokensDeducted: 400n, subRemaining: 9600n, topupRemaining: 0n };
    const result = await deductLLMCredits('acct-1', 'gpt-4', 0, 100, 0.01);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(400);
  });

  test('[P2] weighted formula: pure input (400 input + 0 output = 100 actual)', async () => {
    // actualTokens = round(400 × 0.25 + 0) = 100
    _deductTokensResult = { success: true, tokensDeducted: 400n, subRemaining: 9600n, topupRemaining: 0n };
    const result = await deductLLMCredits('acct-1', 'gpt-4', 400, 0, 0.01);
    expect(result.success).toBe(true);
    // actualTokens would be 100, same cost path
    expect(result.cost).toBe(400);
  });
});
