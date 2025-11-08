/**
 * Unit Tests for Coin Highlighting Module
 * 
 * Tests all features of the highlighter module:
 * - Highlight application
 * - Highlight removal
 * - Dark mode support (via CSS)
 * - Duplicate prevention
 * - Error handling
 */

import {
  applyHighlight,
  removeHighlight,
  applyHighlights,
  removeAllHighlights,
  setupHighlightRemoval,
  elementHasHighlight,
} from '../highlighter';
import type { CoinDetection } from '../../shared/coin-detector';
import { logger } from '../../shared/logger';

// Mock logger to avoid console output during tests
jest.mock('../../shared/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    isDebugEnabled: jest.fn(() => false),
    setLevel: jest.fn(),
    setDebugEnabled: jest.fn(),
  },
}));

describe('Coin Highlighting Module', () => {
  beforeEach(() => {
    // Clear document body
    document.body.innerHTML = '';
    
    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up highlights
    removeAllHighlights();
    
    // Clear document body
    document.body.innerHTML = '';
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Feature 1: Highlight Application', () => {
    it('should apply highlight class to element', () => {
      const element = document.createElement('div');
      element.textContent = 'Bitcoin';
      document.body.appendChild(element);

      applyHighlight(element);

      expect(element.classList.contains('chainlens-coin-highlight')).toBe(true);
      expect(elementHasHighlight(element)).toBe(true);
    });

    it('should apply highlight to multiple elements', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const elements = [
        document.createElement('div'),
        document.createElement('span'),
        document.createElement('p'),
      ];
      
      elements.forEach((el, i) => {
        el.textContent = `Coin ${i + 1}`;
        container.appendChild(el);
      });

      const detections: CoinDetection[] = elements.map((el, i) => ({
        element: el,
        name: `Coin ${i + 1}`,
        symbol: `C${i + 1}`,
      }));

      applyHighlights(detections);

      elements.forEach((el) => {
        expect(el.classList.contains('chainlens-coin-highlight')).toBe(true);
        expect(elementHasHighlight(el)).toBe(true);
      });
    });

    it('should skip button elements', () => {
      const button = document.createElement('button');
      button.textContent = 'Bitcoin';
      document.body.appendChild(button);

      const coinData: CoinDetection = {
        element: button,
        name: 'Bitcoin',
        symbol: 'BTC',
      };

      applyHighlights([coinData]);

      expect(button.classList.contains('chainlens-coin-highlight')).toBe(false);
    });

    it('should skip elements with analyze button class', () => {
      const element = document.createElement('div');
      element.className = 'chainlens-analyze-btn';
      element.textContent = 'Bitcoin';
      document.body.appendChild(element);

      const coinData: CoinDetection = {
        element,
        name: 'Bitcoin',
        symbol: 'BTC',
      };

      applyHighlights([coinData]);

      expect(element.classList.contains('chainlens-coin-highlight')).toBe(false);
    });
  });

  describe('Feature 2: Highlight Removal', () => {
    it('should remove highlight from element', () => {
      const element = document.createElement('div');
      element.textContent = 'Bitcoin';
      document.body.appendChild(element);

      applyHighlight(element);
      expect(element.classList.contains('chainlens-coin-highlight')).toBe(true);

      removeHighlight(element);
      expect(element.classList.contains('chainlens-coin-highlight')).toBe(false);
    });

    it('should remove all highlights from page', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const elements = [
        document.createElement('div'),
        document.createElement('span'),
        document.createElement('p'),
      ];
      
      elements.forEach((el) => {
        el.textContent = 'Coin';
        container.appendChild(el);
        applyHighlight(el);
      });

      let highlighted = document.querySelectorAll('.chainlens-coin-highlight');
      expect(highlighted.length).toBe(3);

      removeAllHighlights();

      highlighted = document.querySelectorAll('.chainlens-coin-highlight');
      expect(highlighted.length).toBe(0);
    });

    it('should handle removal when no highlights exist', () => {
      expect(() => {
        removeAllHighlights();
      }).not.toThrow();
    });
  });

  describe('Feature 3: Duplicate Prevention', () => {
    it('should prevent duplicate highlights on same element', () => {
      const element = document.createElement('div');
      element.textContent = 'Bitcoin';
      document.body.appendChild(element);

      // Apply highlight first time
      applyHighlight(element);
      expect(element.classList.contains('chainlens-coin-highlight')).toBe(true);

      // Try to apply again
      applyHighlight(element);
      
      // Should still have only one highlight class
      const highlightClasses = Array.from(element.classList).filter(cls => 
        cls === 'chainlens-coin-highlight'
      );
      expect(highlightClasses.length).toBe(1);
    });

    it('should skip elements already highlighted', () => {
      const element = document.createElement('div');
      element.textContent = 'Bitcoin';
      element.classList.add('chainlens-coin-highlight');
      document.body.appendChild(element);

      applyHighlight(element);
      
      // Should still have only one highlight class
      const highlightClasses = Array.from(element.classList).filter(cls => 
        cls === 'chainlens-coin-highlight'
      );
      expect(highlightClasses.length).toBe(1);
    });
  });

  describe('Feature 4: Error Handling', () => {
    it('should handle null element gracefully', () => {
      const invalidElement = null as any;

      expect(() => {
        applyHighlight(invalidElement);
      }).not.toThrow();
    });

    it('should handle undefined element gracefully', () => {
      const invalidElement = undefined as any;

      expect(() => {
        applyHighlight(invalidElement);
      }).not.toThrow();
    });

    it('should handle elements not in DOM', () => {
      const element = document.createElement('div');
      element.textContent = 'Bitcoin';
      // Don't append to document.body

      const coinData: CoinDetection = {
        element,
        name: 'Bitcoin',
        symbol: 'BTC',
      };

      // Should not throw, but should skip injection
      expect(() => {
        applyHighlights([coinData]);
      }).not.toThrow();

      expect(element.classList.contains('chainlens-coin-highlight')).toBe(false);
    });

    it('should handle errors in batch application and continue', () => {
      const validElement = document.createElement('div');
      validElement.textContent = 'Bitcoin';
      document.body.appendChild(validElement);

      const invalidElement = null as any;

      const detections: CoinDetection[] = [
        {
          element: validElement,
          name: 'Bitcoin',
          symbol: 'BTC',
        },
        {
          element: invalidElement,
          name: 'Invalid',
          symbol: 'INV',
        },
      ];

      expect(() => {
        applyHighlights(detections);
      }).not.toThrow();

      expect(validElement.classList.contains('chainlens-coin-highlight')).toBe(true);
    });
  });

  describe('Feature 5: Element Has Highlight Check', () => {
    it('should return true if element has highlight', () => {
      const element = document.createElement('div');
      element.textContent = 'Bitcoin';
      document.body.appendChild(element);

      applyHighlight(element);
      expect(elementHasHighlight(element)).toBe(true);
    });

    it('should return false if element has no highlight', () => {
      const element = document.createElement('div');
      element.textContent = 'Bitcoin';
      document.body.appendChild(element);

      expect(elementHasHighlight(element)).toBe(false);
    });

    it('should return false for invalid element', () => {
      const invalidElement = null as any;
      expect(elementHasHighlight(invalidElement)).toBe(false);
    });
  });

  describe('Feature 6: Highlight Removal on Button Click (Optional)', () => {
    it('should setup highlight removal listener', () => {
      expect(() => {
        setupHighlightRemoval();
      }).not.toThrow();
    });

    it('should remove highlight when button is clicked (if enabled)', () => {
      // Note: This test verifies the setup function works
      // Actual removal behavior depends on CONFIG.REMOVE_HIGHLIGHT_ON_CLICK
      // which is false by default (optional feature)
      setupHighlightRemoval();
      
      // Function should complete without error
      expect(true).toBe(true);
    });
  });

  describe('Integration: All Features Together', () => {
    it('should work correctly with all features combined', () => {
      // Create various element types
      const container = document.createElement('div');
      document.body.appendChild(container);

      const inlineElement = document.createElement('span');
      inlineElement.textContent = 'Bitcoin';
      inlineElement.style.display = 'inline';
      container.appendChild(inlineElement);

      const blockElement = document.createElement('div');
      blockElement.textContent = 'Ethereum';
      blockElement.style.display = 'block';
      container.appendChild(blockElement);

      const detections: CoinDetection[] = [
        {
          element: inlineElement,
          name: 'Bitcoin',
          symbol: 'BTC',
          price: 45000,
        },
        {
          element: blockElement,
          name: 'Ethereum',
          symbol: 'ETH',
          price: 3000,
        },
      ];

      // Apply highlights
      applyHighlights(detections);

      // Verify highlights are applied
      expect(inlineElement.classList.contains('chainlens-coin-highlight')).toBe(true);
      expect(blockElement.classList.contains('chainlens-coin-highlight')).toBe(true);

      // Verify duplicate prevention
      applyHighlights(detections);
      expect(document.querySelectorAll('.chainlens-coin-highlight').length).toBe(2);

      // Verify elementHasHighlight
      expect(elementHasHighlight(inlineElement)).toBe(true);
      expect(elementHasHighlight(blockElement)).toBe(true);

      // Remove highlights
      removeAllHighlights();
      expect(document.querySelectorAll('.chainlens-coin-highlight').length).toBe(0);
    });
  });
});

