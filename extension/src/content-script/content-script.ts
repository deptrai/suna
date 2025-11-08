/**
 * Content Script
 * Detects coin names trên crypto websites và will inject analysis buttons
 * 
 * This file will be built to content-script.js by webpack
 */

// Import CSS for content script
import './content-script.css';

// Import coin detection module
import { detectCoins, CoinDetection } from '../shared/coin-detector';

/**
 * Configuration
 * Configurable settings for content script behavior
 */
const CONFIG = {
  /** Enable debug logging (set to false in production) */
  DEBUG: process.env.NODE_ENV !== 'production',
  /** Debounce delay for detection calls (ms) */
  DETECTION_DEBOUNCE_DELAY: 500,
  /** Maximum consecutive errors before disabling detection */
  MAX_CONSECUTIVE_ERRORS: 3,
} as const;

/**
 * Debug Logger
 * Logs messages only if DEBUG is enabled
 */
function debugLog(...args: unknown[]): void {
  if (CONFIG.DEBUG) {
    console.log('[Suna Extension]', ...args);
  }
}

/**
 * Error Logger
 * Always logs errors (even in production)
 */
function errorLog(...args: unknown[]): void {
  console.error('[Suna Extension]', ...args);
}

debugLog('Content script loaded');

/**
 * Detected Coins Storage
 * Store detected coins for use by UI injection (Story 11.3)
 */
let detectedCoins: CoinDetection[] = [];

/**
 * Detection Debounce Timer
 * Used to debounce detection calls to avoid performance issues
 */
let detectionTimer: number | null = null;

/**
 * Error Recovery State
 * Track consecutive errors to implement recovery mechanism
 */
let consecutiveErrors = 0;
let detectionDisabled = false;

/**
 * Run Coin Detection
 * Runs coin detection on the page và stores results
 * Uses requestIdleCallback for performance optimization
 * 
 * @param rootElement Root element to scan (default: document.body)
 */
function runCoinDetection(rootElement: HTMLElement = document.body): void {
  // Skip if detection is disabled due to too many errors
  if (detectionDisabled) {
    debugLog('Coin detection disabled due to consecutive errors');
    return;
  }

  // Skip detection on hidden elements
  if (rootElement.offsetParent === null && rootElement !== document.body) {
    return;
  }

  // Use requestIdleCallback for non-critical detection
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(
      () => {
        try {
          const coins = detectCoins(rootElement);
          detectedCoins = coins;
          // Reset error counter on success
          consecutiveErrors = 0;
          debugLog('Detected coins:', coins.length, coins);
        } catch (error) {
          consecutiveErrors++;
          errorLog('Coin detection error:', error);
          
          // Disable detection if too many consecutive errors
          if (consecutiveErrors >= CONFIG.MAX_CONSECUTIVE_ERRORS) {
            detectionDisabled = true;
            errorLog(
              `Detection disabled after ${consecutiveErrors} consecutive errors. ` +
              'Please refresh the page to re-enable.'
            );
          } else {
            debugLog(
              `Detection error ${consecutiveErrors}/${CONFIG.MAX_CONSECUTIVE_ERRORS}. ` +
              'Will retry on next detection cycle.'
            );
          }
        }
      },
      { timeout: 2000 } // Fallback timeout
    );
  } else {
    // Fallback to setTimeout if requestIdleCallback not available
    setTimeout(() => {
      try {
        const coins = detectCoins(rootElement);
        detectedCoins = coins;
        // Reset error counter on success
        consecutiveErrors = 0;
        debugLog('Detected coins:', coins.length, coins);
      } catch (error) {
        consecutiveErrors++;
        errorLog('Coin detection error:', error);
        
        // Disable detection if too many consecutive errors
        if (consecutiveErrors >= CONFIG.MAX_CONSECUTIVE_ERRORS) {
          detectionDisabled = true;
          errorLog(
            `Detection disabled after ${consecutiveErrors} consecutive errors. ` +
            'Please refresh the page to re-enable.'
          );
        } else {
          debugLog(
            `Detection error ${consecutiveErrors}/${CONFIG.MAX_CONSECUTIVE_ERRORS}. ` +
            'Will retry on next detection cycle.'
          );
        }
      }
    }, 0);
  }
}

/**
 * Debounced Coin Detection
 * Debounces detection calls to avoid performance issues
 * 
 * @param rootElement Root element to scan (default: document.body)
 */
function debouncedCoinDetection(rootElement: HTMLElement = document.body): void {
  // Clear existing timer
  if (detectionTimer !== null) {
    clearTimeout(detectionTimer);
  }

  // Set new timer
  detectionTimer = window.setTimeout(() => {
    runCoinDetection(rootElement);
    detectionTimer = null;
  }, CONFIG.DETECTION_DEBOUNCE_DELAY);
}

/**
 * Validate Message Sender
 * Validates that message comes from extension (security best practice)
 * 
 * @param sender Chrome runtime message sender
 * @returns true if sender is valid (extension origin), false otherwise
 */
function isValidSender(sender: chrome.runtime.MessageSender): boolean {
  // Messages from extension should have chrome.runtime.id
  // Content scripts receive messages from background worker (extension origin)
  // Reject messages from page context (sender.url would be page URL, not extension)
  if (!sender) {
    return false;
  }

  // Valid senders:
  // 1. Background worker (sender.url starts with chrome-extension://)
  // 2. Extension popup (sender.url starts with chrome-extension://)
  // 3. Other extension contexts (sender.tab may be undefined for extension contexts)
  
  // Check if sender.url exists and is from extension
  if (sender.url) {
    return sender.url.startsWith('chrome-extension://');
  }

  // If no URL, check if it's from extension context
  // (background worker messages may not have sender.url in some cases)
  // In content script context, valid messages come from extension
  // Page scripts cannot send messages to content scripts via chrome.runtime
  return sender.id === chrome.runtime.id;
}

/**
 * Initialize Content Script
 * Sets up event listeners và starts coin detection
 */
function init(): void {
  debugLog('Initializing content script');

  // Run detection on page load
  runCoinDetection(document.body);

  // Set up DOM mutation observer for dynamically loaded content
  const observer = new MutationObserver((mutations) => {
    // Check if any mutations added new nodes
    const hasNewNodes = mutations.some(
      (mutation) => mutation.addedNodes.length > 0
    );

    if (hasNewNodes) {
      // Debounce detection to avoid performance issues
      debouncedCoinDetection(document.body);
    }
  });

  // Start observing document.body for childList changes
  observer.observe(document.body, {
    childList: true,
    subtree: true, // Also observe descendants
  });

  debugLog('MutationObserver started');
}

/**
 * Handle Page Load
 * Runs detection when page is fully loaded
 */
function handlePageLoad(): void {
  debugLog('Page fully loaded');
  // Run detection after page load (for dynamic pages)
  runCoinDetection(document.body);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM already loaded
  init();
}

// Also listen for window load event (for dynamic pages)
window.addEventListener('load', handlePageLoad);

// Listen for messages từ background worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog('Content script received message:', message);

  // Validate sender origin (security best practice)
  if (!isValidSender(sender)) {
    errorLog('Invalid message sender:', sender);
    sendResponse({ success: false, error: 'Invalid sender origin' });
    return false;
  }

  // Validate message structure
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    errorLog('Invalid message structure:', message);
    sendResponse({ success: false, error: 'Invalid message structure' });
    return false;
  }

  switch (message.type) {
    case 'DETECT_COINS':
      // Run detection và return results
      runCoinDetection(document.body);
      sendResponse({ success: true, coins: detectedCoins });
      return true; // Async response

    case 'GET_DETECTED_COINS':
      // Return currently detected coins
      sendResponse({ success: true, coins: detectedCoins });
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
  }
});
