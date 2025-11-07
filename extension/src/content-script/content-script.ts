/**
 * Content Script
 * Detects coin names trên crypto websites và injects analysis buttons
 * 
 * This file will be built to content-script.js in Story 10.3
 */

// Import CSS for content script
import './content-script.css';

// Test shared code import (Task 4)
import { testSharedCodeImport } from '../shared/test-import';

console.log('Suna Extension: Content script loaded');

// Test path alias import
try {
  const testResult = testSharedCodeImport();
  console.log('Suna Extension: Shared code import test successful:', testResult);
} catch (error) {
  console.error('Suna Extension: Shared code import test failed:', error);
}

// Content script will be implemented in Story 11.1-11.4
// For now, this is a placeholder

// Initialize content script
function init() {
  console.log('Suna Extension: Initializing content script');
  
  // Coin detection và UI injection will be added in Epic 11
  // This placeholder ensures the script loads without errors
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Listen for messages từ background worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  switch (message.type) {
    case 'DETECT_COINS':
      // Coin detection will be implemented in Story 11.1
      sendResponse({ success: true, coins: [] });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

