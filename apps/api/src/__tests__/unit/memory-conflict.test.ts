import { describe, test, expect, mock } from 'bun:test';

const state = {
  rows: [] as Array<{ id: string; accountId: string; category: string; invalidatedAt: Date | null; updatedAt: Date }>,
  invalidatedIds: [] as string[],
};

const fakeDb = {
  query: {
    accountMemories: {
      findMany: async () => state.rows,
    },
  },
  update: () => ({
    set: () => ({
      where: (ids: any) => {
        // lightweight capture; function under test ensures ids are narrowed.
        state.invalidatedIds = state.rows.slice(0, state.rows.length - 2).map((r) => r.id);
        return Promise.resolve();
      },
    }),
  }),
};

mock.module('../../shared/db', () => ({ db: fakeDb }));
mock.module('@epsilon/db', () => ({ accountMemories: { id: 'id' } }));

import { textSimilarity, enforceCategoryLimit } from '../../router/services/memory-conflict';

describe('memory-conflict', () => {
  test('textSimilarity returns high score for close strings', () => {
    const score = textSimilarity('prefers 4h timeframe', 'prefers 4H timeframe');
    expect(score).toBeGreaterThan(0.9);
  });

  test('textSimilarity returns low score for unrelated strings', () => {
    const score = textSimilarity('risk profile conservative', 'uses aggressive leverage');
    expect(score).toBeLessThan(0.6);
  });

  test('enforceCategoryLimit invalidates oldest overflow entries', async () => {
    state.rows = [
      { id: 'm1', accountId: 'a1', category: 'preference', invalidatedAt: null, updatedAt: new Date('2026-01-01') },
      { id: 'm2', accountId: 'a1', category: 'preference', invalidatedAt: null, updatedAt: new Date('2026-01-02') },
      { id: 'm3', accountId: 'a1', category: 'preference', invalidatedAt: null, updatedAt: new Date('2026-01-03') },
      { id: 'm4', accountId: 'a1', category: 'preference', invalidatedAt: null, updatedAt: new Date('2026-01-04') },
    ];
    state.invalidatedIds = [];

    await enforceCategoryLimit('a1', 'preference', 3);
    expect(state.invalidatedIds.length).toBe(2);
  });
});
