/**
 * Unit Tests for Validation Utilities
 * 
 * Tests input validation, sanitization, và error handling
 */

import {
  validateCoinDetection,
  validateAndFilterDetections,
  sanitizeText,
  ValidationError,
} from '../validation';
import type { CoinDetection } from '../coin-detector';

describe('Validation Utilities', () => {
  describe('validateCoinDetection', () => {
    const createValidDetection = (): CoinDetection => ({
      element: document.createElement('div'),
      name: 'Bitcoin',
      symbol: 'BTC',
      price: 45000,
    });

    it('should validate a valid coin detection', () => {
      const detection = createValidDetection();
      expect(() => validateCoinDetection(detection)).not.toThrow();
      expect(validateCoinDetection(detection)).toBe(true);
    });

    it('should throw error for missing name', () => {
      const detection = createValidDetection();
      delete (detection as any).name;
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
      expect(() => validateCoinDetection(detection)).toThrow('Coin name is required');
    });

    it('should throw error for empty name', () => {
      const detection = createValidDetection();
      detection.name = '';
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for name too long', () => {
      const detection = createValidDetection();
      detection.name = 'A'.repeat(101);
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for invalid name type', () => {
      const detection = createValidDetection();
      (detection as any).name = 123;
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should validate symbol (optional)', () => {
      const detection = createValidDetection();
      delete detection.symbol;
      
      expect(() => validateCoinDetection(detection)).not.toThrow();
    });

    it('should throw error for symbol too short', () => {
      const detection = createValidDetection();
      detection.symbol = 'B';
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for symbol too long', () => {
      const detection = createValidDetection();
      detection.symbol = 'BTCBTCBTCBTCBTC'; // 15 characters
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for lowercase symbol', () => {
      const detection = createValidDetection();
      detection.symbol = 'btc';
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for invalid symbol type', () => {
      const detection = createValidDetection();
      (detection as any).symbol = 123;
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should validate price (optional)', () => {
      const detection = createValidDetection();
      delete detection.price;
      
      expect(() => validateCoinDetection(detection)).not.toThrow();
    });

    it('should throw error for price too low', () => {
      const detection = createValidDetection();
      detection.price = 0.00001;
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for price too high', () => {
      const detection = createValidDetection();
      detection.price = 2000000000;
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for invalid price type', () => {
      const detection = createValidDetection();
      (detection as any).price = '45000';
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for NaN price', () => {
      const detection = createValidDetection();
      detection.price = NaN;
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for Infinity price', () => {
      const detection = createValidDetection();
      detection.price = Infinity;
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should validate valid price range', () => {
      const detection = createValidDetection();
      detection.price = 0.0001; // Minimum valid
      
      expect(() => validateCoinDetection(detection)).not.toThrow();
      
      detection.price = 1000000000; // Maximum valid
      expect(() => validateCoinDetection(detection)).not.toThrow();
    });

    it('should throw error for missing element', () => {
      const detection = createValidDetection();
      delete (detection as any).element;
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });

    it('should throw error for invalid element type', () => {
      const detection = createValidDetection();
      (detection as any).element = 'div';
      
      expect(() => validateCoinDetection(detection)).toThrow(ValidationError);
    });
  });

  describe('validateAndFilterDetections', () => {
    it('should return valid detections', () => {
      const detections: CoinDetection[] = [
        {
          element: document.createElement('div'),
          name: 'Bitcoin',
          symbol: 'BTC',
          price: 45000,
        },
        {
          element: document.createElement('div'),
          name: 'Ethereum',
          symbol: 'ETH',
          price: 3500,
        },
      ];
      
      const result = validateAndFilterDetections(detections);
      expect(result.length).toBe(2);
      expect(result[0].name).toBe('Bitcoin');
      expect(result[1].name).toBe('Ethereum');
    });

    it('should filter out invalid detections', () => {
      const detections: CoinDetection[] = [
        {
          element: document.createElement('div'),
          name: 'Bitcoin',
          symbol: 'BTC',
          price: 45000,
        },
        {
          element: document.createElement('div'),
          name: '', // Invalid: empty name
          symbol: 'ETH',
          price: 3500,
        },
        {
          element: document.createElement('div'),
          name: 'Ethereum',
          symbol: 'ETH',
          price: 2000000000, // Invalid: price too high
        },
      ];
      
      const result = validateAndFilterDetections(detections);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Bitcoin');
    });

    it('should return empty array for all invalid detections', () => {
      const detections: CoinDetection[] = [
        {
          element: document.createElement('div'),
          name: '', // Invalid
          symbol: 'BTC',
          price: 45000,
        },
      ];
      
      const result = validateAndFilterDetections(detections);
      expect(result).toEqual([]);
    });

    it('should handle empty array', () => {
      const result = validateAndFilterDetections([]);
      expect(result).toEqual([]);
    });

    it('should handle detections without price', () => {
      const detections: CoinDetection[] = [
        {
          element: document.createElement('div'),
          name: 'Bitcoin',
          symbol: 'BTC',
        },
      ];
      
      const result = validateAndFilterDetections(detections);
      expect(result.length).toBe(1);
      expect(result[0].price).toBeUndefined();
    });

    it('should handle detections without symbol', () => {
      const detections: CoinDetection[] = [
        {
          element: document.createElement('div'),
          name: 'Bitcoin',
        },
      ];
      
      const result = validateAndFilterDetections(detections);
      expect(result.length).toBe(1);
      expect(result[0].symbol).toBeUndefined();
    });
  });

  describe('sanitizeText', () => {
    it('should sanitize text with script tags', () => {
      const text = 'Bitcoin <script>alert("XSS")</script> is popular';
      const result = sanitizeText(text);
      
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert("XSS")');
      expect(result).toContain('Bitcoin');
    });

    it('should sanitize text with style tags', () => {
      const text = 'Ethereum <style>.coin { color: red; }</style> is popular';
      const result = sanitizeText(text);
      
      expect(result).not.toContain('<style>');
      expect(result).not.toContain('.coin');
      expect(result).toContain('Ethereum');
    });

    it('should trim whitespace', () => {
      const text = '   Bitcoin   ';
      const result = sanitizeText(text);
      
      expect(result).toBe('Bitcoin');
    });

    it('should handle empty string', () => {
      const result = sanitizeText('');
      expect(result).toBe('');
    });

    it('should handle non-string input', () => {
      const result = sanitizeText(null as any);
      expect(result).toBe('');
    });

    it('should handle text with multiple script tags', () => {
      const text = 'Bitcoin <script>alert("1")</script> and <script>alert("2")</script> Ethereum';
      const result = sanitizeText(text);
      
      expect(result).not.toContain('<script>');
      expect(result).toContain('Bitcoin');
      expect(result).toContain('Ethereum');
    });

    it('should preserve valid text content', () => {
      const text = 'Bitcoin (BTC) is trading at $45,000';
      const result = sanitizeText(text);
      
      expect(result).toBe('Bitcoin (BTC) is trading at $45,000');
    });
  });

  describe('ValidationError', () => {
    it('should create ValidationError with message', () => {
      const error = new ValidationError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ValidationError');
    });

    it('should create ValidationError with field', () => {
      const error = new ValidationError('Test error', 'name');
      expect(error.field).toBe('name');
    });

    it('should be instance of Error', () => {
      const error = new ValidationError('Test error');
      expect(error instanceof Error).toBe(true);
    });
  });
});

