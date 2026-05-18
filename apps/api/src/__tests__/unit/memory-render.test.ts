import { describe, test, expect, mock } from 'bun:test';

let resolvedAccountId: string | null = 'acc-1';
let rows: Array<{ category: string; content: string }> = [];

mock.module('../../router/services/memory-account-resolver', () => ({
  resolveAccountIdFromUserId: async () => resolvedAccountId,
}));

mock.module('../../shared/db', () => ({
  db: {
    query: {
      accountMemories: {
        findMany: async () => rows,
      },
    },
  },
}));

mock.module('@epsilon/db', () => ({ accountMemories: {} }));

import { renderMemoriesForUser } from '../../router/services/memory-render';

describe('memory-render', () => {
  test('returns empty when account not found', async () => {
    resolvedAccountId = null;
    rows = [];
    const result = await renderMemoriesForUser('u1');
    expect(result.memoryCount).toBe(0);
    expect(result.rendered).toBe('');
  });

  test('renders markdown with memory lines', async () => {
    resolvedAccountId = 'acc-1';
    rows = [
      { category: 'preference', content: 'Prefers 4H timeframe' },
      { category: 'risk_profile', content: 'Conservative leverage usage' },
    ];
    const result = await renderMemoriesForUser('u1', 500);
    expect(result.memoryCount).toBe(2);
    expect(result.rendered).toContain('## Persistent Memory');
    expect(result.rendered).toContain('[preference] Prefers 4H timeframe');
  });

  test('truncates by token budget', async () => {
    resolvedAccountId = 'acc-1';
    rows = [{ category: 'fact', content: 'A'.repeat(2000) }];
    const result = await renderMemoriesForUser('u1', 50);
    expect(result.rendered.length).toBeLessThanOrEqual(200);
  });
});
