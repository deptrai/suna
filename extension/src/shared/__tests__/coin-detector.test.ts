/**
 * Unit Tests for Coin Detector
 * 
 * Tests coin detection algorithms, pattern matching, và DOM traversal
 */

import { detectCoins, detectCoinsInDocument, type CoinDetection } from '../coin-detector';

describe('Coin Detector', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create a clean container for each test
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up after each test
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    document.body.innerHTML = '';
  });

  describe('detectCoins', () => {
    it('should return empty array for empty element', () => {
      const emptyDiv = document.createElement('div');
      const result = detectCoins(emptyDiv);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid root element', () => {
      const result = detectCoins(null as any);
      expect(result).toEqual([]);
    });

    it('should detect coin names in text content', () => {
      container.innerHTML = '<p>Bitcoin is a cryptocurrency</p>';
      const result = detectCoins(container);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('Bitcoin');
      expect(result[0].element).toBeDefined();
    });

    it('should detect multiple coin names', () => {
      container.innerHTML = '<p>Bitcoin, Ethereum, and Solana are popular cryptocurrencies</p>';
      const result = detectCoins(container);
      
      const coinNames = result.map(d => d.name);
      expect(coinNames).toContain('Bitcoin');
      expect(coinNames).toContain('Ethereum');
      expect(coinNames).toContain('Solana');
    });

    it('should detect coin symbols', () => {
      container.innerHTML = '<p>BTC is the symbol for Bitcoin</p>';
      const result = detectCoins(container);
      
      expect(result.length).toBeGreaterThan(0);
      const btcDetection = result.find(d => d.symbol === 'BTC');
      expect(btcDetection).toBeDefined();
      expect(btcDetection?.name).toBe('Bitcoin');
    });

    it('should detect coin symbols with dollar prefix', () => {
      container.innerHTML = '<p>$BTC is trading at $45,000</p>';
      const result = detectCoins(container);
      
      const btcDetection = result.find(d => d.symbol === 'BTC');
      expect(btcDetection).toBeDefined();
    });

    it('should extract prices near coin symbols', () => {
      container.innerHTML = '<p>BTC $45,000</p>';
      const result = detectCoins(container);
      
      const btcDetection = result.find(d => d.symbol === 'BTC');
      expect(btcDetection).toBeDefined();
      expect(btcDetection?.price).toBe(45000);
    });

    it('should extract prices with comma separators', () => {
      container.innerHTML = '<p>ETH $3,500.50</p>';
      const result = detectCoins(container);
      
      const ethDetection = result.find(d => d.symbol === 'ETH');
      expect(ethDetection).toBeDefined();
      expect(ethDetection?.price).toBe(3500.5);
    });

    it('should extract prices with "k" suffix', () => {
      container.innerHTML = '<p>BTC 45k</p>';
      const result = detectCoins(container);
      
      const btcDetection = result.find(d => d.symbol === 'BTC');
      expect(btcDetection).toBeDefined();
      expect(btcDetection?.price).toBe(45000);
    });

    it('should extract prices with USD suffix', () => {
      container.innerHTML = '<p>ETH 3500 USD</p>';
      const result = detectCoins(container);
      
      const ethDetection = result.find(d => d.symbol === 'ETH');
      expect(ethDetection).toBeDefined();
      expect(ethDetection?.price).toBe(3500);
    });

    it('should not detect coins in script tags', () => {
      container.innerHTML = `
        <p>Bitcoin is popular</p>
        <script>const coin = "Bitcoin";</script>
      `;
      const result = detectCoins(container);
      
      // Should only detect Bitcoin from the <p> tag, not from script
      expect(result.length).toBe(1);
      expect(result[0].element.tagName).toBe('P');
    });

    it('should not detect coins in style tags', () => {
      container.innerHTML = `
        <p>Ethereum is popular</p>
        <style>.coin { color: red; }</style>
      `;
      const result = detectCoins(container);
      
      expect(result.length).toBe(1);
      expect(result[0].element.tagName).toBe('P');
    });

    it('should deduplicate detections from same element', () => {
      container.innerHTML = '<p>Bitcoin Bitcoin Bitcoin</p>';
      const result = detectCoins(container);
      
      // Should only have one detection for Bitcoin in the same element
      const bitcoinDetections = result.filter(d => d.name === 'Bitcoin');
      expect(bitcoinDetections.length).toBe(1);
    });

    it('should handle case-insensitive coin names', () => {
      container.innerHTML = '<p>bitcoin ETHEREUM solana</p>';
      const result = detectCoins(container);
      
      const coinNames = result.map(d => d.name);
      expect(coinNames).toContain('Bitcoin');
      expect(coinNames).toContain('Ethereum');
      expect(coinNames).toContain('Solana');
    });

    it('should handle multi-word coin names', () => {
      container.innerHTML = '<p>NEAR Protocol is a blockchain</p>';
      const result = detectCoins(container);
      
      const nearDetection = result.find(d => d.name === 'NEAR Protocol');
      expect(nearDetection).toBeDefined();
    });

    it('should handle nested elements', () => {
      container.innerHTML = `
        <div>
          <p>Bitcoin</p>
          <span>Ethereum</span>
        </div>
      `;
      const result = detectCoins(container);
      
      const coinNames = result.map(d => d.name);
      expect(coinNames).toContain('Bitcoin');
      expect(coinNames).toContain('Ethereum');
    });

    it('should validate price range (too low)', () => {
      container.innerHTML = '<p>BTC $0.00001</p>';
      const result = detectCoins(container);
      
      const btcDetection = result.find(d => d.symbol === 'BTC');
      // Price too low should be filtered out
      expect(btcDetection?.price).toBeUndefined();
    });

    it('should validate price range (too high)', () => {
      container.innerHTML = '<p>BTC $2000000000</p>';
      const result = detectCoins(container);
      
      const btcDetection = result.find(d => d.symbol === 'BTC');
      // Price too high should be filtered out
      expect(btcDetection?.price).toBeUndefined();
    });

    it('should validate price range (valid)', () => {
      container.innerHTML = '<p>BTC $45000</p>';
      const result = detectCoins(container);
      
      const btcDetection = result.find(d => d.symbol === 'BTC');
      expect(btcDetection?.price).toBe(45000);
    });

    it('should handle empty text nodes', () => {
      container.innerHTML = '<p>   </p><p>Bitcoin</p>';
      const result = detectCoins(container);
      
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Bitcoin');
    });

    it('should handle complex HTML structure', () => {
      container.innerHTML = `
        <div class="coin-list">
          <div class="coin-item">
            <h3>Bitcoin</h3>
            <p>BTC $45,000</p>
          </div>
          <div class="coin-item">
            <h3>Ethereum</h3>
            <p>ETH $3,500</p>
          </div>
        </div>
      `;
      const result = detectCoins(container);
      
      expect(result.length).toBeGreaterThanOrEqual(2);
      const coinNames = result.map(d => d.name);
      expect(coinNames).toContain('Bitcoin');
      expect(coinNames).toContain('Ethereum');
    });

    it('should only match known coin symbols', () => {
      container.innerHTML = '<p>XYZ is not a known coin</p>';
      const result = detectCoins(container);
      
      // XYZ is not in COIN_SYMBOL_MAP, so it shouldn't be detected
      const xyzDetection = result.find(d => d.symbol === 'XYZ');
      expect(xyzDetection).toBeUndefined();
    });

    it('should handle prices with decimal places', () => {
      container.innerHTML = '<p>BTC $45,123.45</p>';
      const result = detectCoins(container);
      
      const btcDetection = result.find(d => d.symbol === 'BTC');
      expect(btcDetection?.price).toBe(45123.45);
    });

    it('should handle prices far from symbol', () => {
      container.innerHTML = '<p>BTC is trading at $45,000 today</p>';
      const result = detectCoins(container);
      
      const btcDetection = result.find(d => d.symbol === 'BTC');
      expect(btcDetection?.price).toBe(45000);
    });
  });

  describe('detectCoinsInDocument', () => {
    it('should detect coins in document.body', () => {
      document.body.innerHTML = '<p>Bitcoin is popular</p>';
      const result = detectCoinsInDocument();
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('Bitcoin');
    });

    it('should return empty array if document.body is empty', () => {
      document.body.innerHTML = '';
      const result = detectCoinsInDocument();
      
      expect(result).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle text with only symbols', () => {
      container.innerHTML = '<p>BTC ETH SOL</p>';
      const result = detectCoins(container);
      
      expect(result.length).toBeGreaterThanOrEqual(3);
      const symbols = result.map(d => d.symbol).filter(Boolean);
      expect(symbols).toContain('BTC');
      expect(symbols).toContain('ETH');
      expect(symbols).toContain('SOL');
    });

    it('should handle text with only names', () => {
      container.innerHTML = '<p>Bitcoin Ethereum Solana</p>';
      const result = detectCoins(container);
      
      expect(result.length).toBeGreaterThanOrEqual(3);
      const names = result.map(d => d.name);
      expect(names).toContain('Bitcoin');
      expect(names).toContain('Ethereum');
      expect(names).toContain('Solana');
    });

    it('should handle mixed content', () => {
      container.innerHTML = '<p>Bitcoin (BTC) $45,000 and Ethereum (ETH) $3,500</p>';
      const result = detectCoins(container);
      
      expect(result.length).toBeGreaterThanOrEqual(2);
      const btcDetection = result.find(d => d.symbol === 'BTC');
      const ethDetection = result.find(d => d.symbol === 'ETH');
      
      expect(btcDetection).toBeDefined();
      expect(btcDetection?.price).toBe(45000);
      expect(ethDetection).toBeDefined();
      expect(ethDetection?.price).toBe(3500);
    });

    it('should handle special characters in text', () => {
      container.innerHTML = '<p>Bitcoin (BTC) - $45,000!</p>';
      const result = detectCoins(container);
      
      expect(result.length).toBeGreaterThan(0);
      const btcDetection = result.find(d => d.symbol === 'BTC');
      expect(btcDetection).toBeDefined();
    });
  });
});

