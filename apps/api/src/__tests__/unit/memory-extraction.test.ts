import { describe, expect, mock, test } from 'bun:test';

// Mock proxyToAnthropic BEFORE importing extraction module
let mockedHaikuText = '[]';
let mockedHaikuOk = true;
mock.module('../../router/services/anthropic', () => ({
  proxyToAnthropic: async () => ({
    ok: mockedHaikuOk,
    json: async () => ({ content: [{ type: 'text', text: mockedHaikuText }] }),
  }),
}));

mock.module('../../shared/db', () => ({
  db: {
    query: { accountMemories: { findFirst: async () => null } },
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'memid' }] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 'memid' }] }) }) }),
    execute: async () => ({}),
  },
}));

mock.module('../../router/services/memory-account-resolver', () => ({
  resolveAccountIdFromUserId: async () => 'acc-1',
}));

mock.module('../../router/services/memory-conflict', () => ({
  textSimilarity: () => 0.0,
  enforceCategoryLimit: async () => {},
}));

mock.module('@epsilon/db', () => ({
  accountMemories: { id: 'id', accountId: 'accountId', category: 'category', content: 'content', confidence: 'confidence', sourceSessionId: 'sourceSessionId', invalidatedAt: 'invalidatedAt', updatedAt: 'updatedAt' },
}));

import {
  extractJsonArray,
  extractMemoriesForAccount,
  sanitizeFacts,
} from '../../router/services/memory-extraction';

describe('memory-extraction.sanitizeFacts', () => {
  test('keeps valid category + content', () => {
    expect(sanitizeFacts([{ category: 'preference', content: 'uses 4H' }])).toEqual([
      { category: 'preference', content: 'uses 4H' },
    ]);
  });
  test('rejects unknown category', () => {
    expect(sanitizeFacts([{ category: 'mood', content: 'happy' }])).toEqual([]);
  });
  test('rejects content over 200 chars', () => {
    const long = 'x'.repeat(201);
    expect(sanitizeFacts([{ category: 'fact', content: long }])).toEqual([]);
  });
  test('caps at 5 items', () => {
    const input = Array(10).fill({ category: 'fact', content: 'btc' });
    expect(sanitizeFacts(input)).toHaveLength(5);
  });
  test('handles non-array input', () => {
    expect(sanitizeFacts(null)).toEqual([]);
    expect(sanitizeFacts({ category: 'fact' })).toEqual([]);
  });
});

describe('memory-extraction.extractJsonArray', () => {
  test('parses bare JSON array', () => {
    expect(extractJsonArray('[{"a":1}]')).toBe('[{"a":1}]');
  });
  test('strips ```json fences', () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });
  test('strips ``` fences without lang', () => {
    expect(extractJsonArray('```\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });
  test('F15: skips prose bracket and finds real JSON', () => {
    const txt = 'Here are [the] facts: [{"category":"fact","content":"x"}]';
    const result = extractJsonArray(txt);
    expect(result).toContain('"category"');
    expect(JSON.parse(result!)).toEqual([{ category: 'fact', content: 'x' }]);
  });
  test('F16: handles escaped quotes inside string content', () => {
    const txt = '[{"content":"he said \\"hi\\""}]';
    const result = extractJsonArray(txt);
    expect(result).toBe(txt);
    expect(JSON.parse(result!)).toEqual([{ content: 'he said "hi"' }]);
  });
  test('returns null when no array found', () => {
    expect(extractJsonArray('no brackets here')).toBeNull();
  });
  test('returns null on unbalanced brackets', () => {
    expect(extractJsonArray('[{"a":1}')).toBeNull();
  });
});

describe('memory-extraction.extractMemoriesForAccount — Haiku integration', () => {
  test('happy path: 1 fact extracted from Haiku response', async () => {
    mockedHaikuOk = true;
    mockedHaikuText = '```json\n[{"category":"preference","content":"uses 4H"}]\n```';
    const result = await extractMemoriesForAccount({
      accountId: 'acc-1',
      userId: 'u-1',
      sessionId: 'ses_test_happy',
      messages: [{ role: 'user', content: 'I use 4H' }],
    });
    expect(result.extracted).toBe(1);
    expect(result.skipped).toBeFalsy();
  });

  test('empty Haiku response returns 0 extracted (not error)', async () => {
    mockedHaikuOk = true;
    mockedHaikuText = '[]';
    const result = await extractMemoriesForAccount({
      accountId: 'acc-1',
      userId: 'u-1',
      sessionId: 'ses_test_empty',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(result.extracted).toBe(0);
  });

  test('Haiku refusal (non-JSON prose) returns 0 extracted (no throw)', async () => {
    mockedHaikuOk = true;
    mockedHaikuText = 'I cannot help with that.';
    const result = await extractMemoriesForAccount({
      accountId: 'acc-1',
      userId: 'u-1',
      sessionId: 'ses_test_refusal',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(result.extracted).toBe(0);
  });

  test('Haiku HTTP failure returns 0 extracted (no throw)', async () => {
    mockedHaikuOk = false;
    const result = await extractMemoriesForAccount({
      accountId: 'acc-1',
      userId: 'u-1',
      sessionId: 'ses_test_http_fail',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(result.extracted).toBe(0);
  });
});
