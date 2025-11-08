/**
 * SIMPLE CONTENT SCRIPT - No imports, just basic logging
 * This is a fallback để test if content script injection works at all
 */

// Immediate log - không đợi gì cả
console.log('🔴🔴🔴 SIMPLE TEST: Content script file loaded 🔴🔴🔴');
console.log('URL:', window.location.href);
console.log('Ready state:', document.readyState);

// Set global flag
(window as any).chainlensTest = true;

// Try to log multiple times
setTimeout(() => {
  console.log('🔴 TEST: 1 second later');
}, 1000);

setTimeout(() => {
  console.log('🔴 TEST: 2 seconds later');
}, 2000);

console.log('🔴 SIMPLE TEST: Script execution complete');

