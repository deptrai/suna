/**
 * Validation Utilities
 * 
 * Provides input validation functions for coin detection results
 * and other extension data.
 */

import type { CoinDetection } from './coin-detector';

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate coin detection result
 */
export function validateCoinDetection(detection: CoinDetection): boolean {
  // Validate name
  if (!detection.name || typeof detection.name !== 'string') {
    throw new ValidationError('Coin name is required và must be a string', 'name');
  }

  if (detection.name.length === 0 || detection.name.length > 100) {
    throw new ValidationError(
      `Coin name must be between 1 và 100 characters, got ${detection.name.length}`,
      'name'
    );
  }

  // Validate symbol (optional)
  if (detection.symbol !== undefined) {
    if (typeof detection.symbol !== 'string') {
      throw new ValidationError('Coin symbol must be a string', 'symbol');
    }

    if (detection.symbol.length < 2 || detection.symbol.length > 10) {
      throw new ValidationError(
        `Coin symbol must be between 2 và 10 characters, got ${detection.symbol.length}`,
        'symbol'
      );
    }

    // Symbol should be uppercase
    if (detection.symbol !== detection.symbol.toUpperCase()) {
      throw new ValidationError('Coin symbol should be uppercase', 'symbol');
    }
  }

  // Validate price (optional)
  if (detection.price !== undefined) {
    if (typeof detection.price !== 'number') {
      throw new ValidationError('Coin price must be a number', 'price');
    }

    if (isNaN(detection.price) || !isFinite(detection.price)) {
      throw new ValidationError('Coin price must be a valid number', 'price');
    }

    // Validate price range (0.0001 to 1,000,000,000)
    if (detection.price < 0.0001 || detection.price > 1000000000) {
      throw new ValidationError(
        `Coin price must be between 0.0001 và 1,000,000,000, got ${detection.price}`,
        'price'
      );
    }
  }

  // Validate element
  if (!detection.element) {
    throw new ValidationError('Element is required', 'element');
  }

  if (!(detection.element instanceof HTMLElement)) {
    throw new ValidationError('Element must be an HTMLElement', 'element');
  }

  return true;
}

/**
 * Validate và filter coin detections
 */
export function validateAndFilterDetections(detections: CoinDetection[]): CoinDetection[] {
  const validDetections: CoinDetection[] = [];

  for (const detection of detections) {
    try {
      if (validateCoinDetection(detection)) {
        validDetections.push(detection);
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        console.warn(`Invalid coin detection filtered out:`, error.message, detection);
      } else {
        console.error('Unexpected error validating detection:', error, detection);
      }
    }
  }

  return validDetections;
}

/**
 * Sanitize text content to prevent XSS
 */
export function sanitizeText(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  // Remove potentially dangerous characters
  // This is a simple sanitization - for production, consider using a library like DOMPurify
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .trim();
}

