/**
 * Content Script - Coin Detection và Button Injection
 * 
 * This script runs on crypto websites và detects coin names,
 * symbols, và prices using the coin-detector module.
 * 
 * Story 11.2: Coin detection implemented
 * Story 11.3: Button injection implemented
 */

import './content-script.css';
import { testSharedCodeImport } from '../shared/test-import';
import { detectCoins, detectCoinsInDocument, type CoinDetection } from '../shared/coin-detector';
import { logger } from '../shared/logger';
import { injectAnalysisButtons, removeAllInjectedButtons } from './injector';

// ============================================
// Content Script Initialization
// ============================================
logger.info('ChainLens Extension: Content script loaded');
logger.debug('URL:', window.location.href);
logger.debug('Ready state:', document.readyState);

// Set flag immediately với namespace to avoid global pollution
try {
  if (!(window as any).chainlens) {
    (window as any).chainlens = {};
  }
  (window as any).chainlens.extensionLoaded = true;
  (window as any).chainlens.startTime = Date.now();
  logger.debug('Extension flag set: window.chainlens.extensionLoaded = true');
} catch (e) {
  logger.error('Failed to set extension flag', e);
}

// Test shared code import
try {
  testSharedCodeImport();
  logger.debug('Shared code import test passed');
} catch (error) {
  logger.error('Shared code import test failed', error);
}

logger.debug('Extension ID:', chrome?.runtime?.id || 'NO RUNTIME ID');

// Detection state management
let detectionAttempts = 0;
const maxAttempts = 3;
let detectionTimeoutId: number | null = null;
let visibilityTimeoutId: number | null = null;
const activeTimeouts: number[] = [];

/**
 * Cleanup function để clear all timeouts
 */
function cleanupTimeouts(): void {
  activeTimeouts.forEach(id => {
    clearTimeout(id);
  });
  activeTimeouts.length = 0;
  
  if (detectionTimeoutId !== null) {
    clearTimeout(detectionTimeoutId);
    detectionTimeoutId = null;
  }
  
  if (visibilityTimeoutId !== null) {
    clearTimeout(visibilityTimeoutId);
    visibilityTimeoutId = null;
  }
}

/**
 * Debounced coin detection function
 */
let debounceTimeoutId: number | null = null;
function debouncedCoinDetection(): void {
  if (debounceTimeoutId !== null) {
    clearTimeout(debounceTimeoutId);
  }
  
  debounceTimeoutId = window.setTimeout(() => {
    runCoinDetection();
    debounceTimeoutId = null;
  }, 500);
  
  activeTimeouts.push(debounceTimeoutId);
}

/**
 * Run coin detection với retry logic và proper error handling
 */
function runCoinDetection(): void {
  detectionAttempts++;
  logger.debug(`Running coin detection (attempt ${detectionAttempts}/${maxAttempts})...`);
  
  try {
    // Check if document body exists
    if (!document.body) {
      logger.warn('Document body not ready yet');
      if (detectionAttempts < maxAttempts) {
        const timeoutId = window.setTimeout(runCoinDetection, 1000);
        activeTimeouts.push(timeoutId);
      }
      return;
    }

    logger.debug('Document body found, starting detection...');
    const startTime = performance.now();
    
    const detections = detectCoinsInDocument();
    const endTime = performance.now();
    
    const detectionTime = (endTime - startTime).toFixed(2);
    logger.info(`Coin Detection Completed in ${detectionTime}ms - Detected ${detections.length} coin(s)`);
    
    if (detections.length === 0) {
      logger.warn('No coins detected. This might be normal if page structure is different.');
      logger.debug('Tip: Check if page has loaded coin data yet. Try scrolling down.');
    } else {
      // Log first few detections in debug mode
      logger.debug('First 5 detections:', detections.slice(0, 5).map(d => ({
        name: d.name,
        symbol: d.symbol,
        price: d.price,
      })));
      
      // Log summary
      const uniqueCoins = new Set(detections.map(d => d.name));
      logger.info(`Unique coins: ${uniqueCoins.size}, Coins with prices: ${detections.filter(d => d.price).length}`);
      
      // Log table in debug mode (only if console.table is available và debug enabled)
      if (logger.isDebugEnabled() && typeof console !== 'undefined' && typeof console.table === 'function') {
        console.table(detections.slice(0, 20).map(d => ({
          name: d.name,
          symbol: d.symbol || '-',
          price: d.price ? `$${d.price.toLocaleString()}` : '-',
          element: d.element.tagName,
        })));
      }

      // Inject analysis buttons next to detected coins (Story 11.3)
      try {
        injectAnalysisButtons(detections);
      } catch (error) {
        logger.error('Error injecting buttons:', error);
      }
    }
    
    // Reset attempts on success
    detectionAttempts = 0;
    
  } catch (error) {
    logger.error('Coin detection error', error);
    
    if (detectionAttempts < maxAttempts) {
      logger.debug(`Retrying in 1 second... (attempt ${detectionAttempts + 1}/${maxAttempts})`);
      const timeoutId = window.setTimeout(runCoinDetection, 1000);
      activeTimeouts.push(timeoutId);
    }
  }
}

// Setup detection triggers với proper cleanup
logger.debug('Setting up detection triggers...');

const domContentLoadedHandler = () => {
  logger.debug('DOMContentLoaded fired');
  runCoinDetection();
};

const visibilityChangeHandler = () => {
  if (!document.hidden) {
    logger.debug('Page became visible, running detection...');
    if (visibilityTimeoutId !== null) {
      clearTimeout(visibilityTimeoutId);
    }
    visibilityTimeoutId = window.setTimeout(() => {
      debouncedCoinDetection();
      visibilityTimeoutId = null;
    }, 500);
    activeTimeouts.push(visibilityTimeoutId);
  }
};

if (document.readyState === 'loading') {
  logger.debug('Document still loading, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', domContentLoadedHandler);
} else {
  logger.debug('Document already loaded, running detection immediately');
  // Run immediately
  runCoinDetection();
  
  // Also run after a delay to catch dynamically loaded content (debounced)
  detectionTimeoutId = window.setTimeout(() => {
    logger.debug('Running detection again after delay (for dynamic content)...');
    debouncedCoinDetection();
    detectionTimeoutId = null;
  }, 2000);
  activeTimeouts.push(detectionTimeoutId);
}

// Listen for page visibility changes
document.addEventListener('visibilitychange', visibilityChangeHandler);

// Cleanup on page unload
const beforeUnloadHandler = () => {
  cleanupTimeouts();
  // Remove all injected buttons on page unload
  removeAllInjectedButtons();
  document.removeEventListener('DOMContentLoaded', domContentLoadedHandler);
  document.removeEventListener('visibilitychange', visibilityChangeHandler);
};

window.addEventListener('beforeunload', beforeUnloadHandler);

export {};
