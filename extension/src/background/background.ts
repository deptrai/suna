/**
 * Background Service Worker
 * Handles extension lifecycle, message passing, và API coordination
 * 
 * This file will be built to background.js in Story 10.3
 */

// Service worker registration
console.log('Suna Extension: Background service worker loaded');

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
  console.log('Background received message:', message);
  
  // Handle different message types
  switch (message.type) {
    case 'ANALYZE_COIN':
      // Handle coin analysis request
      handleCoinAnalysis(message.data)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
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
  }
});

// Handle coin analysis
async function handleCoinAnalysis(coinData: any) {
  // This will integrate với API client in later stories
  console.log('Handling coin analysis for:', coinData);
  return { message: 'Analysis will be implemented in later stories' };
}

// Storage change listener
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('Storage changed:', areaName, changes);
});

