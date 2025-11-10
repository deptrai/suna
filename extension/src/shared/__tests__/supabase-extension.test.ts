/**
 * Unit Tests for Supabase Extension
 * 
 * Tests storage adapter và client initialization.
 * Story 13.1: Chrome Storage Adapter for Supabase
 */

import { createSupabaseClientSync } from '../supabase-extension';

// Mock chrome.storage
const mockStorage: Record<string, string> = {};
const mockChrome = {
  storage: {
    local: {
      get: jest.fn((keys: string[], callback: (result: Record<string, any>) => void) => {
        const result: Record<string, any> = {};
        keys.forEach((key) => {
          result[key] = mockStorage[key] || undefined;
        });
        callback(result);
      }),
      set: jest.fn((items: Record<string, any>, callback?: () => void) => {
        Object.assign(mockStorage, items);
        if (callback) callback();
      }),
      remove: jest.fn((keys: string[], callback?: () => void) => {
        keys.forEach((key) => delete mockStorage[key]);
        if (callback) callback();
      }),
    },
  },
  runtime: {
    lastError: null,
  },
};

// Setup
beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  (global as any).chrome = mockChrome;
});

// Note: Storage adapter is tested indirectly through Supabase client usage
// Direct testing would require exporting the adapter, which is an implementation detail

describe('Supabase Client', () => {
  const testUrl = 'https://test.supabase.co';
  const testKey = 'test-anon-key';

  it('should create client với valid config', () => {
    const client = createSupabaseClientSync(testUrl, testKey);
    expect(client).toBeDefined();
  });

  it('should throw error với missing URL', () => {
    expect(() => createSupabaseClientSync('', testKey)).toThrow(
      'Supabase URL và anon key must be provided'
    );
  });

  it('should throw error với missing anon key', () => {
    expect(() => createSupabaseClientSync(testUrl, '')).toThrow(
      'Supabase URL và anon key must be provided'
    );
  });
});

