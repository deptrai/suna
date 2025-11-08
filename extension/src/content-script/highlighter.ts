/**
 * Coin Highlighting Module
 * 
 * Applies visual highlights to detected coin elements.
 * Handles highlight application, removal, và dark mode support.
 * 
 * Story 11.4: Coin Highlighting & Visual Feedback
 */

import type { CoinDetection } from '../shared/coin-detector';
import { logger } from '../shared/logger';

/**
 * CSS class name for coin highlights
 */
const HIGHLIGHT_CLASS_NAME = 'chainlens-coin-highlight';

/**
 * Configuration for highlight behavior
 */
const CONFIG = {
  /**
   * Remove highlight when button is clicked (optional)
   * Default: false to keep highlight visible for better UX
   */
  REMOVE_HIGHLIGHT_ON_CLICK: false,
} as const;

/**
 * Track highlighted elements to prevent duplicates
 * Using WeakSet for automatic garbage collection
 */
const highlightedElements = new WeakSet<HTMLElement>();

/**
 * Apply highlight to a single coin element
 * 
 * @param element - The HTML element to highlight
 */
export function applyHighlight(element: HTMLElement): void {
  // Validate element
  if (!element || !(element instanceof HTMLElement)) {
    logger.warn('Invalid element provided to applyHighlight');
    return;
  }

  // Skip if already highlighted
  if (highlightedElements.has(element)) {
    logger.debug('Element already highlighted');
    return;
  }

  // Skip if element already has highlight class
  if (element.classList.contains(HIGHLIGHT_CLASS_NAME)) {
    logger.debug('Element already has highlight class');
    highlightedElements.add(element);
    return;
  }

  try {
    // Apply highlight class
    element.classList.add(HIGHLIGHT_CLASS_NAME);
    
    // Mark as highlighted
    highlightedElements.add(element);
    
    logger.debug(`Highlight applied to element: ${element.tagName}`);
  } catch (error) {
    logger.error('Error applying highlight:', error);
  }
}

/**
 * Remove highlight from a single coin element
 * 
 * @param element - The HTML element to remove highlight from
 */
export function removeHighlight(element: HTMLElement): void {
  if (!element || !(element instanceof HTMLElement)) {
    return;
  }

  try {
    // Remove highlight class
    element.classList.remove(HIGHLIGHT_CLASS_NAME);
    
    // Note: WeakSet doesn't have delete(), but element will be garbage collected
    // when removed from DOM, so we don't need to manually remove from WeakSet
    
    logger.debug(`Highlight removed from element: ${element.tagName}`);
  } catch (error) {
    logger.error('Error removing highlight:', error);
  }
}

/**
 * Apply highlights to multiple coin elements
 * 
 * @param detections - Array of coin detections
 */
export function applyHighlights(detections: CoinDetection[]): void {
  if (!detections || detections.length === 0) {
    return;
  }

  logger.debug(`Applying highlights to ${detections.length} coin(s)...`);

  let highlightedCount = 0;
  for (const detection of detections) {
    try {
      // Skip if element is invalid
      if (!detection.element || !(detection.element instanceof HTMLElement)) {
        continue;
      }

      // Check if element is still in DOM
      if (!document.body.contains(detection.element)) {
        continue;
      }

      // Skip if element is a button (don't highlight buttons)
      if (detection.element.tagName === 'BUTTON' || 
          detection.element.classList.contains('chainlens-analyze-btn')) {
        continue;
      }

      applyHighlight(detection.element);
      highlightedCount++;
    } catch (error) {
      logger.error('Error applying highlight for detection:', error, detection);
    }
  }

  logger.info(`Highlight application completed: ${highlightedCount}/${detections.length} elements highlighted`);
}

/**
 * Remove all highlights from page
 */
export function removeAllHighlights(): void {
  const highlighted = document.querySelectorAll(`.${HIGHLIGHT_CLASS_NAME}`);
  let removedCount = 0;

  for (const element of highlighted) {
    try {
      if (element instanceof HTMLElement) {
        element.classList.remove(HIGHLIGHT_CLASS_NAME);
        removedCount++;
      }
    } catch (error) {
      logger.error('Error removing highlight:', error);
    }
  }

  // Note: WeakSet will automatically clean up when elements are removed from DOM

  logger.debug(`Removed ${removedCount} highlight(s)`);
}

/**
 * Setup highlight removal on button click (optional)
 * Uses event delegation for efficient event handling
 */
export function setupHighlightRemoval(): void {
  if (!CONFIG.REMOVE_HIGHLIGHT_ON_CLICK) {
    logger.debug('Highlight removal on click is disabled (CONFIG.REMOVE_HIGHLIGHT_ON_CLICK: false)');
    return;
  }

  // Use event delegation to handle button clicks
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    
    // Check if clicked element is an analyze button
    if (!target || !target.classList.contains('chainlens-analyze-btn')) {
      return;
    }

    try {
      // Find the coin element associated with this button
      // Button is either next to the element or inside it
      const button = target;
      const parent = button.parentElement;
      
      if (!parent) {
        return;
      }

      // Try to find highlighted element near the button
      // Check previous sibling
      let coinElement: HTMLElement | null = null;
      const prevSibling = button.previousSibling;
      if (prevSibling && prevSibling instanceof HTMLElement) {
        if (prevSibling.classList.contains(HIGHLIGHT_CLASS_NAME)) {
          coinElement = prevSibling;
        }
      }

      // If not found, check parent
      if (!coinElement && parent.classList.contains(HIGHLIGHT_CLASS_NAME)) {
        coinElement = parent;
      }

      // If still not found, check parent's children
      if (!coinElement) {
        const highlightedChild = parent.querySelector(`.${HIGHLIGHT_CLASS_NAME}`);
        if (highlightedChild instanceof HTMLElement) {
          coinElement = highlightedChild;
        }
      }

      // Remove highlight if found
      if (coinElement) {
        removeHighlight(coinElement);
        logger.debug('Highlight removed on button click');
      }
    } catch (error) {
      logger.error('Error removing highlight on button click:', error);
    }
  }, { capture: false });

  logger.debug('Highlight removal on click enabled');
}

/**
 * Check if element has highlight
 * 
 * @param element - The HTML element to check
 * @returns true if element has highlight, false otherwise
 */
export function elementHasHighlight(element: HTMLElement): boolean {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  return highlightedElements.has(element) || element.classList.contains(HIGHLIGHT_CLASS_NAME);
}

