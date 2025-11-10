/**
 * Supabase Client for Extension
 * 
 * Creates Supabase client với custom storage adapter using chrome.storage.local.
 * Story 13.1: Chrome Storage Adapter for Supabase
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Storage adapter interface for Supabase
 * Uses chrome.storage.local instead of localStorage
 */
interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Chrome Storage Adapter
 * 
 * Implements Supabase storage interface using chrome.storage.local.
 * This allows authentication state to persist across extension restarts.
 */
const chromeStorageAdapter: StorageAdapter = {
  /**
   * Get item from chrome.storage.local
   */
  async getItem(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result[key] || null);
      });
    });
  },

  /**
   * Set item in chrome.storage.local
   */
  async setItem(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  },

  /**
   * Remove item from chrome.storage.local
   */
  async removeItem(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key], () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  },
};

/**
 * Supabase configuration
 * 
 * These values should match the frontend configuration.
 * In production, these should be set via build-time configuration hoặc
 * loaded from chrome.storage (set by background worker).
 */
const SUPABASE_CONFIG = {
  // Default values - should be overridden via chrome.storage hoặc build config
  url: 'https://your-project.supabase.co',
  anonKey: 'your-anon-key',
};

/**
 * Get Supabase URL
 * 
 * Tries to get from chrome.storage first, then falls back to default.
 * In Story 13.4, background worker will set these values.
 */
async function getSupabaseUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['supabaseUrl'], (result) => {
      if (result.supabaseUrl) {
        resolve(result.supabaseUrl);
      } else {
        resolve(SUPABASE_CONFIG.url);
      }
    });
  });
}

/**
 * Get Supabase anon key
 * 
 * Tries to get from chrome.storage first, then falls back to default.
 * In Story 13.4, background worker will set these values.
 */
async function getSupabaseAnonKey(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['supabaseAnonKey'], (result) => {
      if (result.supabaseAnonKey) {
        resolve(result.supabaseAnonKey);
      } else {
        resolve(SUPABASE_CONFIG.anonKey);
      }
    });
  });
}

/**
 * Create Supabase client với chrome.storage adapter
 * 
 * @param supabaseUrl - Supabase project URL (optional, will be fetched if not provided)
 * @param supabaseAnonKey - Supabase anonymous key (optional, will be fetched if not provided)
 * @returns Supabase client instance
 */
export async function createSupabaseClient(
  supabaseUrl?: string,
  supabaseAnonKey?: string
): Promise<SupabaseClient> {
  const url = supabaseUrl || await getSupabaseUrl();
  const anonKey = supabaseAnonKey || await getSupabaseAnonKey();

  if (!url || !anonKey || url === SUPABASE_CONFIG.url || anonKey === SUPABASE_CONFIG.anonKey) {
    throw new Error('Supabase URL và anon key must be configured. Please set supabaseUrl và supabaseAnonKey in chrome.storage.local');
  }

  return createClient(url, anonKey, {
    auth: {
      storage: chromeStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Extensions don't use URL-based auth
    },
  });
}

/**
 * Create Supabase client synchronously (for cases where config is already available)
 * 
 * @param supabaseUrl - Supabase project URL
 * @param supabaseAnonKey - Supabase anonymous key
 * @returns Supabase client instance
 */
export function createSupabaseClientSync(
  supabaseUrl: string,
  supabaseAnonKey: string
): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL và anon key must be provided');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: chromeStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Extensions don't use URL-based auth
    },
  });
}

