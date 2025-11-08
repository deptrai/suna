// Simple test script to verify content script injection
// This will be injected directly để test

console.log('%c🧪 SIMPLE TEST: Content script injection test', 'color: red; font-size: 20px; font-weight: bold; background: yellow; padding: 10px; border: 3px solid red;');
console.log('Current URL:', window.location.href);
console.log('Document ready:', document.readyState);
console.log('Body exists:', !!document.body);

// Test coin detection với simple approach
const testText = document.body ? document.body.textContent : '';
console.log('Page has Bitcoin?', testText.includes('Bitcoin'));
console.log('Page has BTC?', testText.includes('BTC'));
console.log('Page has Ethereum?', testText.includes('Ethereum'));

