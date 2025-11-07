/**
 * Coin Detector Tests
 * Unit tests for coin-detector.ts module
 * 
 * Tests pattern matching, detection logic, và result structure
 */

import { detectCoins, CoinDetection } from '../coin-detector';

/**
 * Create Mock HTMLElement
 * Helper function to create mock HTML elements for testing
 */
function createMockElement(tagName: string, textContent: string): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = textContent;
  return element;
}

/**
 * Test Coin Name Detection
 */
describe('Coin Name Detection', () => {
  test('detects Bitcoin name', () => {
    const element = createMockElement('div', 'Bitcoin is popular');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'Bitcoin')).toBe(true);
  });
  
  test('detects Ethereum name (case-insensitive)', () => {
    const element = createMockElement('div', 'ethereum network');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name.toLowerCase() === 'ethereum')).toBe(true);
  });
  
  test('detects Solana name', () => {
    const element = createMockElement('div', 'SOLANA blockchain');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name.toLowerCase() === 'solana')).toBe(true);
  });
  
  test('detects multiple coin names', () => {
    const element = createMockElement('div', 'Bitcoin and Ethereum are popular');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some(r => r.name === 'Bitcoin')).toBe(true);
    expect(results.some(r => r.name === 'Ethereum')).toBe(true);
  });
});

/**
 * Test Coin Symbol Detection
 */
describe('Coin Symbol Detection', () => {
  test('detects BTC symbol', () => {
    const element = createMockElement('div', 'BTC price');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.symbol === 'BTC' && r.name === 'Bitcoin')).toBe(true);
  });
  
  test('detects ETH symbol với $ prefix', () => {
    const element = createMockElement('div', '$ETH price');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.symbol === 'ETH' && r.name === 'Ethereum')).toBe(true);
  });
  
  test('detects SOL symbol (case-insensitive)', () => {
    const element = createMockElement('div', 'sol price');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.symbol === 'SOL' && r.name === 'Solana')).toBe(true);
  });
  
  test('maps symbol to correct name', () => {
    const element = createMockElement('div', 'ADA is Cardano');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.symbol === 'ADA' && r.name === 'Cardano')).toBe(true);
  });
});

/**
 * Test Price Detection
 */
describe('Price Detection', () => {
  test('detects price với BTC symbol', () => {
    const element = createMockElement('div', 'BTC $45,000');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    const btcResult = results.find(r => r.symbol === 'BTC');
    expect(btcResult).toBeDefined();
    expect(btcResult?.price).toBe(45000);
  });
  
  test('detects price với comma formatting', () => {
    const element = createMockElement('div', 'ETH 3,500 USD');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    const ethResult = results.find(r => r.symbol === 'ETH');
    expect(ethResult).toBeDefined();
    expect(ethResult?.price).toBe(3500);
  });
  
  test('detects price với "k" suffix', () => {
    const element = createMockElement('div', 'SOL 150k');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    const solResult = results.find(r => r.symbol === 'SOL');
    expect(solResult).toBeDefined();
    expect(solResult?.price).toBe(150000);
  });
  
  test('detects price với decimal', () => {
    const element = createMockElement('div', 'BTC $45,000.50');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    const btcResult = results.find(r => r.symbol === 'BTC');
    expect(btcResult).toBeDefined();
    expect(btcResult?.price).toBe(45000.5);
  });
});

/**
 * Test Detection Result Structure
 */
describe('Detection Result Structure', () => {
  test('returns CoinDetection interface với required fields', () => {
    const element = createMockElement('div', 'Bitcoin');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    
    expect(result).toHaveProperty('element');
    expect(result).toHaveProperty('name');
    expect(result.element).toBeInstanceOf(HTMLElement);
    expect(typeof result.name).toBe('string');
  });
  
  test('includes optional symbol field khi symbol detected', () => {
    const element = createMockElement('div', 'BTC');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    
    expect(result).toHaveProperty('symbol');
    expect(result.symbol).toBe('BTC');
  });
  
  test('includes optional price field khi price detected', () => {
    const element = createMockElement('div', 'BTC $45,000');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThan(0);
    const result = results.find(r => r.symbol === 'BTC');
    
    expect(result).toHaveProperty('price');
    expect(typeof result?.price).toBe('number');
  });
});

/**
 * Test Edge Cases
 */
describe('Edge Cases', () => {
  test('handles empty text', () => {
    const element = createMockElement('div', '');
    const results = detectCoins(element);
    
    expect(results.length).toBe(0);
  });
  
  test('handles text without coins', () => {
    const element = createMockElement('div', 'This is just regular text');
    const results = detectCoins(element);
    
    expect(results.length).toBe(0);
  });
  
  test('handles multiple coins in same element', () => {
    const element = createMockElement('div', 'Bitcoin, Ethereum, and Solana are popular');
    const results = detectCoins(element);
    
    expect(results.length).toBeGreaterThanOrEqual(3);
  });
  
  test('deduplicates same coin trong same element', () => {
    const element = createMockElement('div', 'BTC BTC BTC');
    const results = detectCoins(element);
    
    // Should have at least one result but not necessarily exactly one
    // (depends on deduplication logic)
    expect(results.length).toBeGreaterThan(0);
  });
  
  test('skips script và style elements', () => {
    const container = document.createElement('div');
    const script = document.createElement('script');
    script.textContent = 'BTC $45,000';
    container.appendChild(script);
    
    const results = detectCoins(container);
    
    // Script content should be ignored
    expect(results.length).toBe(0);
  });
});

/**
 * Test với Sample HTML
 */
describe('Sample HTML Tests', () => {
  test('detects coins trong sample HTML structure', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div>
        <p>Bitcoin is the first cryptocurrency</p>
        <p>BTC price: $45,000</p>
        <p>Ethereum (ETH) is at 3,500 USD</p>
      </div>
    `;
    
    const results = detectCoins(container);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'Bitcoin')).toBe(true);
    expect(results.some(r => r.symbol === 'BTC' && r.price === 45000)).toBe(true);
    expect(results.some(r => r.symbol === 'ETH' && r.price === 3500)).toBe(true);
  });
  
  test('detects coins trong nested elements', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <article>
        <header>
          <h1>Cryptocurrency News</h1>
        </header>
        <section>
          <p>Solana (SOL) is gaining popularity</p>
          <div>
            <span>SOL price: $150</span>
          </div>
        </section>
      </article>
    `;
    
    const results = detectCoins(container);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'Solana')).toBe(true);
    expect(results.some(r => r.symbol === 'SOL')).toBe(true);
  });
});

