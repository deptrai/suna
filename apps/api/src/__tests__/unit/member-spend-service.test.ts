import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ─── Mutable DB state ────────────────────────────────────────────────────────

type MemberRow = {
  capCents: number | null;
  currentCents: number;
  storedPeriodStart: number | null;
  ownerPeriodStart: number | null;
} | null;

let _memberRow: MemberRow = {
  capCents: 1000,
  currentCents: 200,
  storedPeriodStart: 100,
  ownerPeriodStart: 100,
};

let _ownerRow: { ownerPeriodStart: number | null } | undefined = {
  ownerPeriodStart: 100,
};

let _updateCalls: Array<{ where: unknown; set: unknown }> = [];

// ─── Module mocks (hoisted) ──────────────────────────────────────────────────

mock.module('../../shared/db', () => ({
  db: {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: async () => (_memberRow ? [_memberRow] : []),
            }),
          }),
        }),
        leftJoin: () => ({
          where: () => ({
            limit: async () => (_ownerRow ? [_ownerRow] : []),
          }),
        }),
      }),
    }),
    update: (_table: unknown) => ({
      set: (s: unknown) => ({
        where: (w: unknown) => {
          _updateCalls.push({ where: w, set: s });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

mock.module('@epsilon/db', () => ({
  creditAccounts: {
    accountId: 'creditAccounts.accountId',
    lastRenewalPeriodStart: 'creditAccounts.lastRenewalPeriodStart',
  },
  sandboxMembers: {
    sandboxId: 'sandboxMembers.sandboxId',
    userId: 'sandboxMembers.userId',
    monthlySpendCapCents: 'sandboxMembers.monthlySpendCapCents',
    currentPeriodCents: 'sandboxMembers.currentPeriodCents',
    currentPeriodStart: 'sandboxMembers.currentPeriodStart',
  },
  sandboxes: {
    sandboxId: 'sandboxes.sandboxId',
    accountId: 'sandboxes.accountId',
  },
}));

mock.module('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  }),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

const {
  getSandboxMemberCapStatus,
  isMemberOverCap,
  applyActorSpend,
  dollarsToCents,
} = await import('../../router/services/member-spend');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('dollarsToCents', () => {
  test('[P0] converts positive dollars rounding up', () => {
    expect(dollarsToCents(0.05)).toBe(5);
    expect(dollarsToCents(1)).toBe(100);
    expect(dollarsToCents(0.001)).toBe(1);
  });

  test('[P0] returns 0 for zero or negative input (no charging)', () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(-5)).toBe(0);
  });

  test('[P1] uses Math.ceil to avoid undercharging tiny fractions', () => {
    expect(dollarsToCents(0.999)).toBe(100);
    expect(dollarsToCents(0.0001)).toBe(1);
  });
});

describe('getSandboxMemberCapStatus', () => {
  beforeEach(() => {
    _memberRow = {
      capCents: 1000,
      currentCents: 200,
      storedPeriodStart: 100,
      ownerPeriodStart: 100,
    };
  });

  test('[P0] returns null when sandbox member row not found', async () => {
    _memberRow = null;
    const status = await getSandboxMemberCapStatus('sb-1', 'user-1');
    expect(status).toBeNull();
  });

  test('[P0] returns capCents+currentCents+ownerPeriodStart when periods aligned', async () => {
    const status = await getSandboxMemberCapStatus('sb-1', 'user-1');
    expect(status).toEqual({
      capCents: 1000,
      currentCents: 200,
      ownerPeriodStart: 100,
    });
  });

  test('[P0] resets currentCents to 0 when storedPeriodStart != ownerPeriodStart (period rolled)', async () => {
    _memberRow = {
      capCents: 1000,
      currentCents: 999,
      storedPeriodStart: 50,
      ownerPeriodStart: 100,
    };
    const status = await getSandboxMemberCapStatus('sb-1', 'user-1');
    expect(status?.currentCents).toBe(0);
    expect(status?.ownerPeriodStart).toBe(100);
  });

  test('[P1] returns capCents:null when no cap configured', async () => {
    _memberRow = {
      capCents: null,
      currentCents: 100,
      storedPeriodStart: 100,
      ownerPeriodStart: 100,
    };
    const status = await getSandboxMemberCapStatus('sb-1', 'user-1');
    expect(status?.capCents).toBeNull();
  });

  test('[P1] coerces non-numeric ownerPeriodStart to null', async () => {
    _memberRow = {
      capCents: 1000,
      currentCents: 100,
      storedPeriodStart: 100,
      ownerPeriodStart: null,
    };
    const status = await getSandboxMemberCapStatus('sb-1', 'user-1');
    expect(status?.ownerPeriodStart).toBeNull();
    expect(status?.currentCents).toBe(100);
  });
});

describe('isMemberOverCap', () => {
  beforeEach(() => {
    _memberRow = {
      capCents: 1000,
      currentCents: 200,
      storedPeriodStart: 100,
      ownerPeriodStart: 100,
    };
  });

  test('[P0] returns over:false when below cap', async () => {
    const result = await isMemberOverCap('sb-1', 'user-1');
    expect(result.over).toBe(false);
    expect(result.status?.capCents).toBe(1000);
  });

  test('[P0] returns over:true when at or above cap', async () => {
    _memberRow = {
      capCents: 1000,
      currentCents: 1000,
      storedPeriodStart: 100,
      ownerPeriodStart: 100,
    };
    const result = await isMemberOverCap('sb-1', 'user-1');
    expect(result.over).toBe(true);
  });

  test('[P0] returns over:false when capCents is null (no cap configured)', async () => {
    _memberRow = {
      capCents: null,
      currentCents: 99999,
      storedPeriodStart: 100,
      ownerPeriodStart: 100,
    };
    const result = await isMemberOverCap('sb-1', 'user-1');
    expect(result.over).toBe(false);
  });

  test('[P0] returns over:false when status is null (member not found)', async () => {
    _memberRow = null;
    const result = await isMemberOverCap('sb-1', 'user-1');
    expect(result.over).toBe(false);
    expect(result.status).toBeNull();
  });
});

describe('applyActorSpend', () => {
  beforeEach(() => {
    _ownerRow = { ownerPeriodStart: 100 };
    _updateCalls = [];
  });

  test('[P0] no-op when cents <= 0 (no DB write, prevents negative spend)', async () => {
    await applyActorSpend('sb-1', 'user-1', 0);
    await applyActorSpend('sb-1', 'user-1', -5);
    expect(_updateCalls.length).toBe(0);
  });

  test('[P0] writes update when cents > 0', async () => {
    await applyActorSpend('sb-1', 'user-1', 50);
    expect(_updateCalls.length).toBe(1);
  });

  test('[P1] handles missing owner row (ownerPeriodStart becomes null)', async () => {
    _ownerRow = undefined;
    await applyActorSpend('sb-1', 'user-1', 50);
    expect(_updateCalls.length).toBe(1);
  });

  test('[P1] handles non-numeric ownerPeriodStart gracefully', async () => {
    _ownerRow = { ownerPeriodStart: null };
    await applyActorSpend('sb-1', 'user-1', 50);
    expect(_updateCalls.length).toBe(1);
  });
});
