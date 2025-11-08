/**
 * Background Service Worker
 * 
 * Handles:
 * - Message passing between content script và side panel
 * - Side panel opening/closing
 * - Storage management
 * - Authentication token management
 * 
 * Note: Full implementation will be in Story 13.4
 */

import { logger } from '../shared/logger';

logger.info('ChainLens Extension: Background service worker loaded');

// Configure side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  logger.error('Failed to set side panel behavior', error);
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.debug('Background received message:', message);
  
  // Placeholder: Will be implemented in Story 13.4
  // - Handle OPEN_SIDE_PANEL_WITH_COIN messages
  // - Store coin info in chrome.storage
  // - Open side panel
  // - Handle authentication token requests
  
  return true; // Keep message channel open for async response
});

// Service worker lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  logger.info('Extension installed:', details.reason, details.previousVersion || 'N/A');
});

chrome.runtime.onStartup.addListener(() => {
  logger.info('Extension started');
});

export {};
