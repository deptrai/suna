/**
 * API Client for Extension
 * 
 * Wraps frontend API client functions với extension-specific configuration.
 * Story 13.2: API Client Adaptation
 * 
 * Note: unifiedAgentStart uses createClient() from @/lib/supabase/client (frontend).
 * The frontend's createClient uses localStorage, but in extension context it should
 * use chrome.storage. For now, we import unifiedAgentStart directly. In Story 13.4,
 * we may need to ensure the extension's Supabase client is used, or create a custom
 * version of unifiedAgentStart that uses the extension's Supabase client.
 */

import { 
  unifiedAgentStart,
  BillingError,
  AgentRunLimitError,
  NoAccessTokenAvailableError,
  ProjectLimitError,
} from '@/lib/api';
import type { UnifiedAgentStartResponse } from '@/lib/api';
import { createSupabaseClient } from './supabase-extension';

/**
 * Get API URL from chrome.storage hoặc use default
 */
async function getApiUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiUrl'], (result) => {
      if (result.apiUrl) {
        resolve(result.apiUrl);
      } else {
        // Default to production API URL
        // In Story 13.4, background worker will set this value
        resolve('https://api.chainlens.so');
      }
    });
  });
}

/**
 * Create agent chat với coin analysis
 * 
 * This function wraps unifiedAgentStart và formats the prompt với coin info.
 * 
 * Note: unifiedAgentStart internally uses createClient() from @/lib/supabase/client.
 * In the extension context, this will use the frontend's createClient which uses
 * localStorage. This may not work correctly in extension context. In Story 13.4,
 * we'll address this by ensuring the extension's Supabase client is used.
 * 
 * @param options - Agent start options với coin info
 * @returns Promise với thread_id, agent_run_id, và status
 * @throws BillingError if billing issue
 * @throws AgentRunLimitError if agent run limit exceeded
 * @throws NoAccessTokenAvailableError if not authenticated
 */
export async function createAgentChat(options: {
  prompt: string;
  coinInfo?: { name: string; symbol?: string; price?: number };
  model_name?: string;
  agent_id?: string;
  threadId?: string;
  files?: File[];
}): Promise<UnifiedAgentStartResponse> {
  // Format prompt với coin info
  let fullPrompt = options.prompt;
  if (options.coinInfo) {
    const priceText = options.coinInfo.price 
      ? ` - Current price: $${options.coinInfo.price.toLocaleString()}`
      : '';
    fullPrompt = `Analyze ${options.coinInfo.name} (${options.coinInfo.symbol})${priceText}\n\n${options.prompt}`;
  }

  // Call unifiedAgentStart
  // Note: This uses the frontend's createClient which uses localStorage
  // In Story 13.4, we'll ensure it uses the extension's Supabase client
  return await unifiedAgentStart({
    prompt: fullPrompt,
    model_name: options.model_name,
    agent_id: options.agent_id,
    threadId: options.threadId,
    files: options.files,
  });
}

// Re-export error classes for convenience
export { BillingError, AgentRunLimitError, NoAccessTokenAvailableError, ProjectLimitError };

/**
 * Get auth token từ Supabase session
 * 
 * Uses extension's Supabase client to get the current session token.
 * 
 * @returns Promise với access token hoặc null if not authenticated
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const supabase = await createSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      return null; // User not logged in
    }
    
    return session.access_token;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 * 
 * @returns Promise với true if authenticated, false otherwise
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken();
  return token !== null;
}

