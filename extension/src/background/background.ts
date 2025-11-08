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

console.log('Suna Extension: Background service worker loaded');

// Configure side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  console.error('Failed to set side panel behavior:', error);
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  // Placeholder: Will be implemented in Story 13.4
  // - Handle OPEN_SIDE_PANEL_WITH_COIN messages
  // - Store coin info in chrome.storage
  // - Open side panel
  // - Handle authentication token requests
  
  return true; // Keep message channel open for async response
});

// Service worker lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details);
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
});

export {};
