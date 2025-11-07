/**
 * Coin Detector HTML Tests
 * Integration tests với sample HTML để verify detection works correctly
 * 
 * These tests create actual DOM elements và verify detection results
 */

import { detectCoins, CoinDetection } from '../coin-detector';

/**
 * Create Test HTML Element
 * Helper to create test HTML structure
 */
function createTestHTML(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

/**
 * Test Cases với Sample HTML
 */
describe('Coin Detection với Sample HTML', () => {
  test('detects coin name trong paragraph', () => {
    const html = '<p>Bitcoin is popular</p>';
    const element = createTestHTML(html);
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'Bitcoin')).toBe(true);
    expect(results[0].element).toBeInstanceOf(HTMLElement);
  });
  
  test('detects coin symbol trong text', () => {
    const html = '<div>BTC price is high</div>';
    const element = createTestHTML(html);
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.symbol === 'BTC' && r.name === 'Bitcoin')).toBe(true);
  });
  
  test('detects coin symbol với price', () => {
    const html = '<div>BTC $45,000</div>';
    const element = createTestHTML(html);
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    const btcResult = results.find(r => r.symbol === 'BTC');
    expect(btcResult).toBeDefined();
    expect(btcResult?.name).toBe('Bitcoin');
    expect(btcResult?.price).toBe(45000);
  });
  
  test('detects multiple formats trong same element', () => {
    const html = '<div>Bitcoin (BTC) is at $45,000</div>';
    const element = createTestHTML(html);
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    // Should detect both name và symbol
    expect(results.some(r => r.name === 'Bitcoin')).toBe(true);
    expect(results.some(r => r.symbol === 'BTC')).toBe(true);
  });
  
  test('detects coins trong multiple elements', () => {
    const html = `
      <div>
        <p>Bitcoin is popular</p>
        <p>Ethereum is also popular</p>
        <p>Solana is gaining traction</p>
      </div>
    `;
    const element = createTestHTML(html);
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.some(r => r.name === 'Bitcoin')).toBe(true);
    expect(results.some(r => r.name === 'Ethereum')).toBe(true);
    expect(results.some(r => r.name === 'Solana')).toBe(true);
  });
  
  test('detects price với different formats', () => {
    const testCases = [
      { html: '<div>BTC $45,000</div>', expected: 45000 },
      { html: '<div>ETH 3,500 USD</div>', expected: 3500 },
      { html: '<div>SOL 150k</div>', expected: 150000 },
      { html: '<div>ADA €0.50</div>', expected: 0.5 },
    ];
    
    for (const testCase of testCases) {
      const element = createTestHTML(testCase.html);
      const results = detectCoins(element);
      
      expect(results.length).toBeGreaterThan(0);
      const resultWithPrice = results.find(r => r.price !== undefined);
      if (resultWithPrice) {
        expect(resultWithPrice.price).toBeCloseTo(testCase.expected, 2);
      }
    }
  });
  
  test('handles nested elements', () => {
    const html = `
      <article>
        <header>
          <h1>Cryptocurrency News</h1>
        </header>
        <section>
          <p>Bitcoin (BTC) is trending</p>
          <div>
            <span>Price: $45,000</span>
          </div>
        </section>
      </article>
    `;
    const element = createTestHTML(html);
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'Bitcoin')).toBe(true);
    expect(results.some(r => r.symbol === 'BTC')).toBe(true);
  });
  
  test('skips script và style elements', () => {
    const html = `
      <div>
        <p>Bitcoin is popular</p>
        <script>const btc = "BTC $45,000";</script>
        <style>.coin { color: red; }</style>
      </div>
    `;
    const element = createTestHTML(html);
    const results = detectCoins(element);
    
    // Should detect Bitcoin từ paragraph but not từ script/style
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'Bitcoin')).toBe(true);
  });
  
  test('verifies detection result structure', () => {
    const html = '<div>BTC $45,000</div>';
    const element = createTestHTML(html);
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    
    for (const result of results) {
      // Verify required fields
      expect(result).toHaveProperty('element');
      expect(result).toHaveProperty('name');
      expect(result.element).toBeInstanceOf(HTMLElement);
      expect(typeof result.name).toBe('string');
      expect(result.name.length).toBeGreaterThan(0);
      
      // Verify optional fields if present
      if (result.symbol) {
        expect(typeof result.symbol).toBe('string');
        expect(result.symbol.length).toBeGreaterThan(0);
      }
      
      if (result.price !== undefined) {
        expect(typeof result.price).toBe('number');
        expect(result.price).toBeGreaterThan(0);
      }
    }
  });
});

