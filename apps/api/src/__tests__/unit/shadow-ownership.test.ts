import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Track DB calls for assertions
let inserted: Array<{ shadowId: string; accountId: string }> = [];
let conflict = false;
let existingOwner: string | null = null;

const fakeDb = {
  insert: () => ({
    values: (v: { shadowId: string; accountId: string }) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          if (conflict) return [];
          inserted.push(v);
          return [{ shadowId: v.shadowId }];
        },
      }),
    }),
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => (existingOwner ? [{ accountId: existingOwner }] : []),
      }),
    }),
  }),
};

mock.module('../../shared/db', () => ({ db: fakeDb }));

mock.module('../../config', () => ({
  config: { DATABASE_URL: 'postgres://x', isLocal: () => false },
}));

mock.module('@epsilon/db', () => ({
  shadowAccountOwnership: {
    shadowId: 'shadowId',
    accountId: 'accountId',
  },
}));

import {
  claimOrAssertShadowOwnership,
  ShadowOwnershipError,
} from '../../router/services/shadow-ownership';

describe('claimOrAssertShadowOwnership (TOFU)', () => {
  beforeEach(() => {
    inserted = [];
    conflict = false;
    existingOwner = null;
  });

  test('first caller claims successfully', async () => {
    await claimOrAssertShadowOwnership('acct-A', 'shadow_deadbeef');
    expect(inserted).toEqual([{ shadowId: 'shadow_deadbeef', accountId: 'acct-A' }]);
  });

  test('same caller after conflict — owner matches → no throw', async () => {
    conflict = true;
    existingOwner = 'acct-A';
    await claimOrAssertShadowOwnership('acct-A', 'shadow_deadbeef');
  });

  test('different caller after conflict — throws ShadowOwnershipError', async () => {
    conflict = true;
    existingOwner = 'acct-B';
    await expect(claimOrAssertShadowOwnership('acct-A', 'shadow_deadbeef'))
      .rejects.toBeInstanceOf(ShadowOwnershipError);
  });

  test('row missing after conflict — throws ShadowOwnershipError', async () => {
    conflict = true;
    existingOwner = null;
    await expect(claimOrAssertShadowOwnership('acct-A', 'shadow_deadbeef'))
      .rejects.toBeInstanceOf(ShadowOwnershipError);
  });
});
