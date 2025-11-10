/**
 * Background Service Worker
 * 
 * Handles:
 * - Message passing between content script và side panel
 * - Side panel opening/closing với coin info
 * - Storage management
 * - Authentication token management
 * - API coordination
 * 
 * Story 13.4: Background Worker API Coordination
 */

import { logger } from '../shared/logger';
import type { ExtensionMessage, MessageResponse } from '../shared/message-types';
import { createSupabaseClient } from '../shared/supabase-extension';
import { createAgentChat, getAuthToken } from '../shared/api-extension';
import { generateReportViaApi, openReportInNewTab } from '../shared/report-extension';
import { handleApiError, isAuthenticationError } from '../shared/error-handler-extension';
import { logBrowserInfo } from '../shared/browser-compat';

logger.info('ChainLens Extension: Background service worker loaded');
// Log browser compatibility info (Story 14.4)
logBrowserInfo();

// Configure side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  logger.error('Failed to set side panel behavior', error);
});

/**
 * Store coin info trong chrome.storage
 */
async function storeCoinInfo(coinInfo: { name: string; symbol?: string; price?: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ coinInfo }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      logger.debug('Coin info stored:', coinInfo);
      resolve();
    });
  });
}

/**
 * Open side panel với coin info
 */
async function openSidePanelWithCoin(coinInfo: { name: string; symbol?: string; price?: number }): Promise<void> {
  try {
    // Store coin info trong chrome.storage
    await storeCoinInfo(coinInfo);

    // Open side panel
    // Note: chrome.sidePanel.open() requires a tab ID
    // We'll get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await chrome.sidePanel.open({ tabId: tabs[0].id });
      logger.info('Side panel opened với coin info:', coinInfo);
    } else {
      throw new Error('No active tab found');
    }
  } catch (error) {
    logger.error('Error opening side panel:', error);
    throw error;
  }
}

/**
 * Fetch coin analysis data via API
 */
async function fetchCoinAnalysis(
  coinInfo: { name: string; symbol?: string; price?: number }
): Promise<any> {
  try {
    // Check authentication
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Not authenticated. Please sign in to analyze coins.');
    }

    // Call API với coin info
    // For now, we'll use createAgentChat to create an analysis
    // In the future, this could be a dedicated coin analysis endpoint
    const result = await createAgentChat({
      prompt: `Provide a comprehensive analysis of ${coinInfo.name}${coinInfo.symbol ? ` (${coinInfo.symbol})` : ''}. Include price analysis, market trends, technical indicators, và risk assessment.`,
      coinInfo,
      model_name: 'claude-sonnet-4',
    });

    // Format response for side panel
    return {
      name: coinInfo.name,
      symbol: coinInfo.symbol,
      price: coinInfo.price,
      threadId: result.thread_id,
      agentRunId: result.agent_run_id,
      status: result.status,
      // Note: Full analysis data would come from a separate endpoint
      // For now, we return the thread ID so side panel can fetch full data
    };
  } catch (error) {
    logger.error('Error fetching coin analysis:', error);
    throw error;
  }
}

/**
 * Handle OPEN_SIDE_PANEL_WITH_COIN message
 */
async function handleOpenSidePanelWithCoin(
  message: Extract<ExtensionMessage, { type: 'OPEN_SIDE_PANEL_WITH_COIN' }>
): Promise<MessageResponse> {
  try {
    if (!message.coinInfo || !message.coinInfo.name) {
      return {
        success: false,
        error: 'Coin info is required',
      };
    }

    await openSidePanelWithCoin(message.coinInfo);

    return {
      success: true,
      data: { coinInfo: message.coinInfo },
    };
  } catch (error) {
    logger.error('Error handling OPEN_SIDE_PANEL_WITH_COIN:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open side panel',
    };
  }
}

/**
 * Handle ANALYZE_COIN message (legacy support)
 */
async function handleAnalyzeCoin(
  message: Extract<ExtensionMessage, { type: 'ANALYZE_COIN' }>
): Promise<MessageResponse> {
  try {
    // Convert legacy format to new format
    const coinInfo = {
      name: message.coin,
      symbol: undefined,
      price: undefined,
    };

    await openSidePanelWithCoin(coinInfo);

    return {
      success: true,
      data: { coinInfo },
    };
  } catch (error) {
    logger.error('Error handling ANALYZE_COIN:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze coin',
    };
  }
}

/**
 * Handle FETCH_COIN_ANALYSIS message
 */
async function handleFetchCoinAnalysis(
  message: Extract<ExtensionMessage, { type: 'FETCH_COIN_ANALYSIS' }>
): Promise<MessageResponse> {
  try {
    if (!message.coinInfo || !message.coinInfo.name) {
      return {
        success: false,
        error: 'Coin info is required',
      };
    }

    const analysisData = await fetchCoinAnalysis(message.coinInfo);

    return {
      success: true,
      data: analysisData,
    };
  } catch (error) {
    logger.error('Error handling FETCH_COIN_ANALYSIS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch coin analysis',
    };
  }
}

/**
 * Handle GENERATE_REPORT message
 */
async function handleGenerateReport(
  message: Extract<ExtensionMessage, { type: 'GENERATE_REPORT' }>
): Promise<MessageResponse> {
  try {
    if (!message.coinInfo || !message.coinInfo.name) {
      return {
        success: false,
        error: 'Coin info is required',
      };
    }

    // Generate report URL via API (or local generation)
    const reportUrl = await generateReportViaApi(message.coinInfo);

    // Open new tab với report URL
    await openReportInNewTab(reportUrl);

    return {
      success: true,
      data: { reportUrl },
    };
  } catch (error) {
    logger.error('Error handling GENERATE_REPORT:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
    };
  }
}

/**
 * Message handler với retry logic
 */
async function handleMessageWithRetry(
  message: ExtensionMessage,
  maxRetries: number = 3
): Promise<MessageResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      switch (message.type) {
        case 'OPEN_SIDE_PANEL_WITH_COIN':
          return await handleOpenSidePanelWithCoin(message);

        case 'ANALYZE_COIN':
          return await handleAnalyzeCoin(message);

        case 'FETCH_COIN_ANALYSIS':
          return await handleFetchCoinAnalysis(message);

        case 'GENERATE_REPORT':
          return await handleGenerateReport(message);

        default:
          return {
            success: false,
            error: `Unknown message type: ${(message as any).type}`,
          };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on authentication errors hoặc client errors
      if (isAuthenticationError(error) || (error instanceof Error && error.message.includes('400'))) {
        logger.warn(`Non-retryable error on attempt ${attempt}:`, error);
        break;
      }

      if (attempt < maxRetries) {
        logger.debug(`Retrying message handling (attempt ${attempt + 1}/${maxRetries})`);
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      } else {
        logger.error(`Failed after ${maxRetries} attempts:`, error);
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Failed to handle message after retries',
  };
}

// Message handling
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    logger.debug('Background received message:', message);

    // Handle message asynchronously
    handleMessageWithRetry(message)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        logger.error('Unhandled error in message handler:', error);
        const errorInfo = handleApiError(error, { operation: 'handle message', silent: true });
        sendResponse({
          success: false,
          error: errorInfo.userMessage,
        });
      });

    // Return true to indicate we'll send response asynchronously
    return true;
  }
);

// Service worker lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  logger.info('Extension installed:', details.reason, details.previousVersion || 'N/A');
});

chrome.runtime.onStartup.addListener(() => {
  logger.info('Extension started');
});

export {};
