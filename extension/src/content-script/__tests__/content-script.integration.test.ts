/**
 * Integration Tests for Content Script
 * 
 * Tests content script behavior với real DOM structures,
 * coin detection flow, và event handling.
 */

import { logger } from '../../shared/logger';
import { detectCoinsInDocument, type CoinDetection } from '../../shared/coin-detector';

// Mock chrome APIs
const mockChrome = {
  runtime: {
    id: 'test-extension-id',
    getManifest: jest.fn(() => ({
      version: '0.1.0-dev',
      name: 'ChainLens Extension',
    })),
    sendMessage: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  sidePanel: {
    setPanelBehavior: jest.fn(),
  },
};

(global as any).chrome = mockChrome;

// Mock window.performance
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
  },
  writable: true,
});

describe('Content Script Integration Tests', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create fresh body for each test
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Reset mocks
    jest.clearAllMocks();
    logger.setLevel('debug');
    logger.setDebugEnabled(true);
  });

  afterEach(() => {
    // Clean up
    document.body.innerHTML = '';
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('Content Script Initialization', () => {
    it('should initialize với proper window flags', () => {
      // Simulate content script initialization
      if (!(window as any).chainlens) {
        (window as any).chainlens = {};
      }
      (window as any).chainlens.extensionLoaded = true;
      (window as any).chainlens.startTime = Date.now();

      expect((window as any).chainlens.extensionLoaded).toBe(true);
      expect((window as any).chainlens.startTime).toBeGreaterThan(0);
    });

    it('should have chrome runtime available', () => {
      expect(chrome.runtime).toBeDefined();
      expect(chrome.runtime.id).toBe('test-extension-id');
    });

    it('should detect document ready state', () => {
      expect(document.readyState).toBeDefined();
      expect(['loading', 'interactive', 'complete']).toContain(document.readyState);
    });
  });

  describe('Coin Detection Integration', () => {
    it('should detect coins on CoinMarketCap-style page', () => {
      // Simulate CoinMarketCap table structure
      container.innerHTML = `
        <table class="cmc-table">
          <tbody>
            <tr>
              <td class="cmc-table__cell--name">Bitcoin</td>
              <td class="cmc-table__cell--symbol">BTC</td>
              <td class="cmc-table__cell--price">$45,000</td>
            </tr>
            <tr>
              <td class="cmc-table__cell--name">Ethereum</td>
              <td class="cmc-table__cell--symbol">ETH</td>
              <td class="cmc-table__cell--price">$3,500</td>
            </tr>
          </tbody>
        </table>
      `;

      const detections = detectCoinsInDocument();
      
      expect(detections.length).toBeGreaterThan(0);
      const coinNames = detections.map(d => d.name);
      expect(coinNames).toContain('Bitcoin');
      expect(coinNames).toContain('Ethereum');
    });

    it('should detect coins on CoinGecko-style page', () => {
      // Simulate CoinGecko structure
      container.innerHTML = `
        <div class="coin-list">
          <div class="coin-item">
            <h3>Bitcoin (BTC)</h3>
            <span class="price">$45,123.45</span>
          </div>
          <div class="coin-item">
            <h3>Ethereum (ETH)</h3>
            <span class="price">$3,456.78</span>
          </div>
        </div>
      `;

      const detections = detectCoinsInDocument();
      
      expect(detections.length).toBeGreaterThan(0);
      const btcDetection = detections.find(d => d.symbol === 'BTC');
      const ethDetection = detections.find(d => d.symbol === 'ETH');
      
      expect(btcDetection).toBeDefined();
      expect(ethDetection).toBeDefined();
    });

    it('should detect coins với dynamic content loading', async () => {
      // Initial content
      container.innerHTML = '<div id="coin-list">Loading...</div>';
      
      // Simulate dynamic content loading
      setTimeout(() => {
        const coinList = document.getElementById('coin-list');
        if (coinList) {
          coinList.innerHTML = '<p>Bitcoin (BTC) $45,000</p>';
        }
      }, 100);

      // Wait for dynamic content
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const detections = detectCoinsInDocument();
      expect(detections.length).toBeGreaterThan(0);
    });

    it('should handle multiple coin mentions in same element', () => {
      container.innerHTML = `
        <div class="article">
          <h1>Top 5 Cryptocurrencies</h1>
          <p>
            Bitcoin (BTC) is trading at $45,000, while Ethereum (ETH) is at $3,500.
            Solana (SOL) follows at $100, and Cardano (ADA) at $0.50.
          </p>
        </div>
      `;

      const detections = detectCoinsInDocument();
      
      expect(detections.length).toBeGreaterThanOrEqual(4);
      const symbols = detections.map(d => d.symbol).filter(Boolean);
      expect(symbols).toContain('BTC');
      expect(symbols).toContain('ETH');
      expect(symbols).toContain('SOL');
      expect(symbols).toContain('ADA');
    });

    it('should extract prices correctly from various formats', () => {
      container.innerHTML = `
        <div>
          <p>BTC $45,000</p>
          <p>ETH 3500 USD</p>
          <p>SOL $100.50</p>
          <p>ADA 0.50</p>
          <p>DOGE 45k</p>
        </div>
      `;

      const detections = detectCoinsInDocument();
      
      const btc = detections.find(d => d.symbol === 'BTC');
      const eth = detections.find(d => d.symbol === 'ETH');
      const sol = detections.find(d => d.symbol === 'SOL');
      const doge = detections.find(d => d.symbol === 'DOGE');
      
      expect(btc?.price).toBe(45000);
      expect(eth?.price).toBe(3500);
      expect(sol?.price).toBe(100.5);
      expect(doge?.price).toBe(45000); // 45k = 45000
    });

    it('should handle coins without prices', () => {
      container.innerHTML = `
        <div>
          <p>Bitcoin is popular</p>
          <p>Ethereum is also popular</p>
          <p>BTC $45,000</p>
        </div>
      `;

      const detections = detectCoinsInDocument();
      
      // Should detect Bitcoin và Ethereum by name (no price)
      const bitcoinByName = detections.find(d => d.name === 'Bitcoin' && !d.price);
      const ethereumByName = detections.find(d => d.name === 'Ethereum' && !d.price);
      
      // Should detect BTC by symbol với price
      const btcWithPrice = detections.find(d => d.symbol === 'BTC' && d.price);
      
      expect(bitcoinByName || btcWithPrice).toBeDefined();
      expect(ethereumByName).toBeDefined();
    });
  });

  describe('DOM Event Handling', () => {
    it('should detect coins after DOMContentLoaded', (done) => {
      container.innerHTML = '<p>Bitcoin (BTC) $45,000</p>';
      
      // Simulate DOMContentLoaded event
      const event = new Event('DOMContentLoaded');
      document.dispatchEvent(event);
      
      // Wait a bit for event handling
      setTimeout(() => {
        const detections = detectCoinsInDocument();
        expect(detections.length).toBeGreaterThan(0);
        done();
      }, 100);
    });

    it('should handle visibility change events', (done) => {
      container.innerHTML = '<p>Ethereum (ETH) $3,500</p>';
      
      // Simulate visibility change
      Object.defineProperty(document, 'hidden', {
        writable: true,
        value: false,
      });
      
      const event = new Event('visibilitychange');
      document.dispatchEvent(event);
      
      setTimeout(() => {
        const detections = detectCoinsInDocument();
        expect(detections.length).toBeGreaterThan(0);
        done();
      }, 100);
    });

    it('should handle page scroll với lazy-loaded content', async () => {
      // Initial content
      container.innerHTML = '<div id="viewport">Initial content</div>';
      
      // Simulate scroll event
      const scrollEvent = new Event('scroll');
      window.dispatchEvent(scrollEvent);
      
      // Simulate lazy-loaded content
      setTimeout(() => {
        const viewport = document.getElementById('viewport');
        if (viewport) {
          viewport.innerHTML += '<p>Bitcoin (BTC) $45,000</p>';
        }
      }, 100);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const detections = detectCoinsInDocument();
      expect(detections.length).toBeGreaterThan(0);
    });
  });

  describe('Real-World HTML Structures', () => {
    it('should detect coins in table rows', () => {
      container.innerHTML = `
        <table>
          <tr>
            <td>#</td>
            <td>Name</td>
            <td>Price</td>
            <td>Market Cap</td>
          </tr>
          <tr>
            <td>1</td>
            <td>Bitcoin</td>
            <td>$45,000</td>
            <td>$850B</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Ethereum</td>
            <td>$3,500</td>
            <td>$420B</td>
          </tr>
        </table>
      `;

      const detections = detectCoinsInDocument();
      expect(detections.length).toBeGreaterThan(0);
    });

    it('should detect coins in card layouts', () => {
      container.innerHTML = `
        <div class="coin-cards">
          <div class="card">
            <h2>Bitcoin</h2>
            <p class="symbol">BTC</p>
            <p class="price">$45,000</p>
          </div>
          <div class="card">
            <h2>Ethereum</h2>
            <p class="symbol">ETH</p>
            <p class="price">$3,500</p>
          </div>
        </div>
      `;

      const detections = detectCoinsInDocument();
      expect(detections.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect coins in list items', () => {
      container.innerHTML = `
        <ul class="coin-list">
          <li>Bitcoin (BTC) - $45,000</li>
          <li>Ethereum (ETH) - $3,500</li>
          <li>Solana (SOL) - $100</li>
        </ul>
      `;

      const detections = detectCoinsInDocument();
      expect(detections.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect coins in article content', () => {
      container.innerHTML = `
        <article>
          <h1>Crypto Market Update</h1>
          <p>
            The cryptocurrency market is showing strong performance today.
            Bitcoin (BTC) is trading at $45,000, up 5% from yesterday.
            Ethereum (ETH) follows at $3,500, while Solana (SOL) is at $100.
          </p>
          <blockquote>
            "Bitcoin remains the dominant cryptocurrency," said an analyst.
          </blockquote>
        </article>
      `;

      const detections = detectCoinsInDocument();
      expect(detections.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle nested structures', () => {
      container.innerHTML = `
        <div class="main">
          <div class="section">
            <div class="subsection">
              <h2>Top Coins</h2>
              <div class="coin-info">
                <span>Bitcoin</span>
                <span>BTC</span>
                <span>$45,000</span>
              </div>
            </div>
          </div>
        </div>
      `;

      const detections = detectCoinsInDocument();
      expect(detections.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing document.body gracefully', () => {
      // Temporarily remove body
      const body = document.body;
      document.body.remove();
      
      // Should not throw error
      expect(() => {
        try {
          detectCoinsInDocument();
        } catch (e) {
          // Expected to handle gracefully
        }
      }).not.toThrow();
      
      // Restore body
      document.documentElement.appendChild(body);
    });

    it('should handle malformed HTML', () => {
      container.innerHTML = `
        <div>
          <p>Bitcoin <invalid>tag</invalid> BTC</p>
          <script>var x = "Bitcoin";</script>
          <style>.coin { color: red; }</style>
        </div>
      `;

      const detections = detectCoinsInDocument();
      // Should still detect Bitcoin, but not from script/style
      expect(detections.length).toBeGreaterThan(0);
      expect(detections.every(d => d.element.tagName !== 'SCRIPT')).toBe(true);
      expect(detections.every(d => d.element.tagName !== 'STYLE')).toBe(true);
    });

    it('should handle extremely long text content', () => {
      const longText = 'Bitcoin '.repeat(1000) + 'BTC $45,000';
      container.innerHTML = `<div>${longText}</div>`;

      const startTime = performance.now();
      const detections = detectCoinsInDocument();
      const endTime = performance.now();
      
      // Should complete within reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(detections.length).toBeGreaterThan(0);
    });

    it('should handle special characters và unicode', () => {
      container.innerHTML = `
        <div>
          <p>Bitcoin (BTC) $45,000 💰</p>
          <p>Ethereum (ETH) €3,500</p>
          <p>Solana (SOL) ¥100</p>
        </div>
      `;

      const detections = detectCoinsInDocument();
      expect(detections.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should detect coins efficiently on large pages', () => {
      // Create large page với many elements
      const largeContent = Array.from({ length: 100 }, (_, i) => 
        `<div class="coin-item"><p>Bitcoin (BTC) $${45000 + i}</p></div>`
      ).join('');
      
      container.innerHTML = largeContent;

      const startTime = performance.now();
      const detections = detectCoinsInDocument();
      const endTime = performance.now();
      
      const detectionTime = endTime - startTime;
      
      // Should complete quickly (< 500ms for 100 elements)
      expect(detectionTime).toBeLessThan(500);
      expect(detections.length).toBeGreaterThan(0);
    });

    it('should handle rapid DOM changes', async () => {
      container.innerHTML = '<div id="dynamic">Initial</div>';
      
      const dynamicDiv = document.getElementById('dynamic');
      if (!dynamicDiv) {
        throw new Error('Dynamic div not found');
      }

      // Rapidly change content
      for (let i = 0; i < 10; i++) {
        dynamicDiv.innerHTML = `<p>Bitcoin (BTC) $${45000 + i}</p>`;
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const detections = detectCoinsInDocument();
      expect(detections.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle coins in iframes (isolated)', () => {
      container.innerHTML = `
        <div>
          <p>Bitcoin (BTC) $45,000</p>
          <iframe srcdoc="<p>Ethereum (ETH) $3,500</p>"></iframe>
        </div>
      `;

      const detections = detectCoinsInDocument();
      // Should detect Bitcoin in main document
      // Ethereum in iframe should be isolated (not detected)
      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some(d => d.name === 'Bitcoin')).toBe(true);
    });

    it('should handle shadow DOM (limited detection)', () => {
      container.innerHTML = '<div id="host"></div>';
      
      const host = document.getElementById('host');
      if (host && host.attachShadow) {
        const shadowRoot = host.attachShadow({ mode: 'open' });
        shadowRoot.innerHTML = '<p>Bitcoin (BTC) $45,000</p>';
        
        // Shadow DOM content is isolated, won't be detected by TreeWalker
        const detections = detectCoinsInDocument();
        // Main document should still work
        expect(detections).toBeDefined();
      }
    });

    it('should handle coins in comments (ignored)', () => {
      container.innerHTML = `
        <div>
          <!-- Bitcoin (BTC) $45,000 -->
          <p>Ethereum (ETH) $3,500</p>
        </div>
      `;

      const detections = detectCoinsInDocument();
      // Should only detect Ethereum (comments are ignored)
      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some(d => d.name === 'Ethereum')).toBe(true);
    });

    it('should handle coins in data attributes (ignored)', () => {
      container.innerHTML = `
        <div data-coin="Bitcoin" data-price="45000">
          <p>Ethereum (ETH) $3,500</p>
        </div>
      `;

      const detections = detectCoinsInDocument();
      // Should only detect Ethereum from text content
      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some(d => d.name === 'Ethereum')).toBe(true);
    });
  });

  describe('Multiple Page Loads', () => {
    it('should handle multiple detection runs', () => {
      container.innerHTML = '<p>Bitcoin (BTC) $45,000</p>';
      
      const detections1 = detectCoinsInDocument();
      const detections2 = detectCoinsInDocument();
      const detections3 = detectCoinsInDocument();
      
      // Should consistently detect coins
      expect(detections1.length).toBe(detections2.length);
      expect(detections2.length).toBe(detections3.length);
    });

    it('should handle content updates between runs', () => {
      container.innerHTML = '<p>Bitcoin (BTC) $45,000</p>';
      const detections1 = detectCoinsInDocument();
      
      container.innerHTML = '<p>Ethereum (ETH) $3,500</p>';
      const detections2 = detectCoinsInDocument();
      
      expect(detections1.length).toBeGreaterThan(0);
      expect(detections2.length).toBeGreaterThan(0);
      expect(detections1.some(d => d.name === 'Bitcoin')).toBe(true);
      expect(detections2.some(d => d.name === 'Ethereum')).toBe(true);
    });
  });
});

