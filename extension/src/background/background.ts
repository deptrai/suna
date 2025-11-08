/**
 * Background Service Worker
 * Handles extension lifecycle, message passing, và API coordination
 * 
 * This file will be built to background.js in Story 10.3
 */

// Configuration
const CONFIG = {
  /** API base URL (can be configured via environment) */
  API_URL: 'https://api.suna.so',
  /** Maximum retry attempts for API calls */
  MAX_RETRIES: 3,
  /** Retry delay in milliseconds */
  RETRY_DELAY: 1000,
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT: 30000,
} as const;

// Service worker registration
console.log('Suna Extension: Background service worker loaded');

/**
 * Get Authentication Token
 * Retrieves JWT token from chrome.storage (set by Story 13.1 Chrome Storage Adapter)
 * 
 * @returns Promise<string | null> JWT token or null if not available
 */
async function getAuthToken(): Promise<string | null> {
  try {
    // Get session from chrome.storage
    // Session is stored by Story 13.1 Chrome Storage Adapter for Supabase
    const result = await chrome.storage.local.get(['supabase.auth.session']);
    
    if (!result['supabase.auth.session']) {
      console.warn('[Suna Extension] No session found in chrome.storage');
      return null;
    }

    const session = result['supabase.auth.session'];
    
    // Check if session has access_token
    if (!session.access_token) {
      console.warn('[Suna Extension] Session found but no access_token');
      return null;
    }

    // Check if token is expired (optional - can be enhanced with refresh logic)
    if (session.expires_at && session.expires_at * 1000 < Date.now()) {
      console.warn('[Suna Extension] Session token expired');
      // TODO: Implement token refresh in Story 13.4
      return null;
    }

    return session.access_token;
  } catch (error) {
    console.error('[Suna Extension] Error getting auth token:', error);
    return null;
  }
}

/**
 * Analyze Coin
 * Calls the coin analysis API với authentication
 * 
 * @param coinName Coin name to analyze
 * @param symbol Optional coin symbol
 * @param price Optional coin price
 * @returns Promise<any> Analysis result
 */
async function analyzeCoin(
  coinName: string,
  symbol?: string,
  price?: number
): Promise<any> {
  // Get authentication token
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('Authentication required. Please log in to use coin analysis.');
  }

  // Prepare API request
  // API endpoint: POST /analyze
  // Request format: { projectId: string, analysisType?: string, tokenAddress?: string, chainId?: number }
  const apiUrl = `${CONFIG.API_URL}/analyze`;
  const requestBody: {
    projectId: string;
    analysisType?: string;
    tokenAddress?: string;
    chainId?: number;
  } = {
    projectId: coinName.toLowerCase().trim(), // API expects projectId (coin name/symbol)
    analysisType: 'full', // Default to full analysis
  };

  // Optionally include token address if provided (for on-chain analysis)
  // Note: For now, we use coin name as projectId. Token address can be added later.
  // if (tokenAddress) {
  //   requestBody.tokenAddress = tokenAddress;
  // }

  // Make API call với retry logic
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle response
      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
          throw new Error('Authentication failed. Please log in again.');
        }

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : CONFIG.RETRY_DELAY * attempt;
          
          if (attempt < CONFIG.MAX_RETRIES) {
            console.log(`[Suna Extension] Rate limited, retrying after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          throw new Error('Rate limit exceeded. Please try again later.');
        }

        // Handle other errors
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // Ignore JSON parsing errors
        }
        
        throw new Error(errorMessage);
      }

      // Parse response
      const data = await response.json();
      return data;
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on authentication errors
      if (error instanceof Error && error.message.includes('Authentication')) {
        throw error;
      }

      // Don't retry on AbortError (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout. Please try again.');
      }

      // Retry on network errors
      if (attempt < CONFIG.MAX_RETRIES) {
        const delay = CONFIG.RETRY_DELAY * attempt;
        console.log(`[Suna Extension] API call failed (attempt ${attempt}/${CONFIG.MAX_RETRIES}), retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  // All retries failed
  throw lastError || new Error('API request failed after retries');
}

/**
 * Handle Coin Analysis
 * Processes ANALYZE_COIN message và calls API
 * 
 * @param coinData Coin data from message (coin, symbol, price)
 * @returns Promise<any> Analysis result
 */
async function handleCoinAnalysis(coinData: {
  coin: string;
  symbol?: string;
  price?: number;
}): Promise<any> {
  console.log('[Suna Extension] Handling coin analysis for:', coinData);

  // Validate coin data
  if (!coinData.coin || typeof coinData.coin !== 'string') {
    throw new Error('Invalid coin data: coin name is required');
  }

  // Call API
  const result = await analyzeCoin(
    coinData.coin,
    coinData.symbol,
    coinData.price
  );

  console.log('[Suna Extension] Coin analysis completed:', result);
  return result;
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Suna Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // First time installation
    console.log('First time installation - initializing extension');
  } else if (details.reason === 'update') {
    // Extension updated
    console.log('Extension updated to version:', chrome.runtime.getManifest().version);
  }
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Suna Extension] Background received message:', message);
  
  // Validate message structure
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    sendResponse({ success: false, error: 'Invalid message structure' });
    return false;
  }

  // Handle different message types
  switch (message.type) {
    case 'ANALYZE_COIN':
      // Handle coin analysis request
      // Message format: { type: 'ANALYZE_COIN', coin: string, symbol?: string, price?: number }
      handleCoinAnalysis({
        coin: message.coin,
        symbol: message.symbol,
        price: message.price,
      })
        .then(result => {
          sendResponse({ success: true, data: result });
        })
        .catch(error => {
          console.error('[Suna Extension] Coin analysis error:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        });
      return true; // Async response
      
    case 'GET_STORAGE':
      // Get storage data
      chrome.storage.local.get(message.keys, (data) => {
        sendResponse({ success: true, data });
      });
      return true;
      
    case 'SET_STORAGE':
      // Set storage data
      chrome.storage.local.set(message.data, () => {
        sendResponse({ success: true });
      });
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
  }
});

// Storage change listener
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('[Suna Extension] Storage changed:', areaName, changes);
});
