/**
 * Coin Highlighting Module
 * Applies visual highlights to detected coins
 *
 * This module provides highlighting functionality for the extension content script.
 * It creates subtle visual feedback to help users identify detected coins.
 */

import { CoinDetection } from '../shared/coin-detector';

/**
 * Highlight Class Name
 * Unique class name for highlighted coin elements
 */
const HIGHLIGHT_CLASS_NAME = 'suna-coin-highlight';

/**
 * Highlighted Elements Tracking
 * Track which elements are currently highlighted to prevent duplicates
 */
const highlightedElements = new WeakSet<HTMLElement>();

/**
 * Configuration
 * Configurable settings for highlight behavior
 */
const CONFIG = {
  /** Remove highlight when button is clicked (set to false to keep highlight) */
  REMOVE_HIGHLIGHT_ON_CLICK: false, // Optional: keep highlight for better UX
} as const;

/**
 * Apply Highlight to Coin Element
 * Applies visual highlight to a detected coin element
 *
 * @param element HTML element containing the detected coin
 */
export function applyHighlight(element: HTMLElement): void {
  // Check if element is already highlighted
  if (highlightedElements.has(element)) {
    return;
  }

  // Check if highlight class already exists
  if (element.classList.contains(HIGHLIGHT_CLASS_NAME)) {
    highlightedElements.add(element);
    return;
  }

  // Apply highlight class
  element.classList.add(HIGHLIGHT_CLASS_NAME);
  highlightedElements.add(element);
}

/**
 * Remove Highlight from Coin Element
 * Removes visual highlight from a coin element
 *
 * @param element HTML element to remove highlight from
 */
export function removeHighlight(element: HTMLElement): void {
  if (!highlightedElements.has(element)) {
    return;
  }

  element.classList.remove(HIGHLIGHT_CLASS_NAME);
  // Note: Cannot remove from WeakSet, but element will be garbage collected
  // when removed from DOM, so this is acceptable
}

/**
 * Apply Highlights to Multiple Coins
 * Convenience function to apply highlights to multiple detected coins
 *
 * @param coins Array of coin detection results
 */
export function applyHighlights(coins: CoinDetection[]): void {
  for (const coin of coins) {
    applyHighlight(coin.element);
  }
}

/**
 * Remove All Highlights
 * Removes highlights from all highlighted elements on the page
 */
export function removeAllHighlights(): void {
  const highlighted = document.querySelectorAll(`.${HIGHLIGHT_CLASS_NAME}`);
  highlighted.forEach((element) => {
    if (element instanceof HTMLElement) {
      element.classList.remove(HIGHLIGHT_CLASS_NAME);
    }
  });
  // WeakSet will automatically clean up when elements are removed from DOM
}

/**
 * Check if Element is Highlighted
 * Checks if an element currently has the highlight class
 *
 * @param element HTML element to check
 * @returns true if element is highlighted, false otherwise
 */
export function isHighlighted(element: HTMLElement): boolean {
  return element.classList.contains(HIGHLIGHT_CLASS_NAME);
}

/**
 * Setup Highlight Removal on Button Click
 * Sets up event listeners to remove highlights when buttons are clicked
 * (Optional feature - can be enabled/disabled via CONFIG)
 */
export function setupHighlightRemoval(): void {
  if (!CONFIG.REMOVE_HIGHLIGHT_ON_CLICK) {
    return;
  }

  // Use event delegation to handle button clicks
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    
    // Check if clicked element is a Suna analyze button
    if (target && target.classList.contains('suna-analyze-btn')) {
      // Find the parent element that has the highlight
      // Button might be a sibling or child of highlighted element
      let highlightedElement: HTMLElement | null = null;

      // Check previous sibling
      const prevSibling = target.previousElementSibling as HTMLElement;
      if (prevSibling && isHighlighted(prevSibling)) {
        highlightedElement = prevSibling;
      }

      // Check parent
      if (!highlightedElement && target.parentElement) {
        const parent = target.parentElement;
        if (isHighlighted(parent)) {
          highlightedElement = parent;
        } else {
          // Check parent's previous sibling (button inserted after element)
          const parentPrevSibling = parent.previousElementSibling as HTMLElement;
          if (parentPrevSibling && isHighlighted(parentPrevSibling)) {
            highlightedElement = parentPrevSibling;
          }
        }
      }

      // Remove highlight if found
      if (highlightedElement) {
        removeHighlight(highlightedElement);
      }
    }
  }, { capture: false });
}

