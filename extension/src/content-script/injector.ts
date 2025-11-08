/**
 * Button Injection Module
 * Injects "Analyze with Suna" buttons next to detected coins
 *
 * This module provides button injection functionality for the extension content script.
 * It creates non-intrusive buttons that allow users to trigger coin analysis.
 */

import { CoinDetection } from '../shared/coin-detector';

/**
 * Button Class Name
 * Unique class name for injected buttons (used for duplicate prevention)
 */
const BUTTON_CLASS_NAME = 'suna-analyze-btn';

/**
 * Button Data Attribute
 * Data attribute to identify injected buttons
 */
const BUTTON_DATA_ATTR = 'data-suna-btn';

/**
 * Injected Elements Tracking
 * Track which elements have already had buttons injected to prevent duplicates
 */
const injectedElements = new WeakSet<HTMLElement>();

/**
 * Inject Analysis Button
 * Injects an "Analyze with Suna" button next to a detected coin element
 *
 * @param element HTML element containing the detected coin
 * @param coinData Coin detection data (name, symbol, optional price)
 */
export function injectAnalysisButton(
  element: HTMLElement,
  coinData: CoinDetection
): void {
  // CRITICAL: Check if this element has already been processed (prevents infinite loops)
  if (injectedElements.has(element)) {
    return;
  }
  
  // Check if button already exists (duplicate prevention)
  // Button can be:
  // 1. Inside the element (for table cells)
  // 2. As a sibling next to the element (for inline/block elements)
  
  // Check inside element
  const existingButtonInside = element.querySelector(`.${BUTTON_CLASS_NAME}`);
  if (existingButtonInside) {
    injectedElements.add(element); // Mark as processed
    return;
  }
  
  // Check as next sibling
  const nextSibling = element.nextSibling;
  if (nextSibling && nextSibling instanceof HTMLElement) {
    if (nextSibling.classList.contains(BUTTON_CLASS_NAME)) {
      injectedElements.add(element); // Mark as processed
      return;
    }
  }
  
  // Check parent's children for button near this element
  if (element.parentNode) {
    const siblings = Array.from(element.parentNode.children);
    const elementIndex = siblings.indexOf(element);
    // Check next 2 siblings (button might be inserted after element)
    for (let i = elementIndex + 1; i < Math.min(elementIndex + 3, siblings.length); i++) {
      const sibling = siblings[i] as HTMLElement;
      if (sibling && sibling.classList.contains(BUTTON_CLASS_NAME)) {
        injectedElements.add(element); // Mark as processed
        return;
      }
    }
  }

  // Create button element
  const button = document.createElement('button');
  button.className = BUTTON_CLASS_NAME;
  button.setAttribute(BUTTON_DATA_ATTR, 'true');
  button.textContent = 'Analyze with Suna';
  button.type = 'button'; // Prevent form submission

  // Add click event listener
  button.addEventListener('click', (event) => {
    // Prevent event propagation (stop event bubbling)
    event.stopPropagation();
    event.preventDefault();

    // Send message to background worker
    chrome.runtime
      .sendMessage({
        type: 'ANALYZE_COIN',
        coin: coinData.name,
        symbol: coinData.symbol,
        price: coinData.price,
      })
      .then((response) => {
        // Handle response (optional)
        if (response && response.success) {
          console.log('[Suna Extension] Analysis started for:', coinData.name);
        } else {
          console.error(
            '[Suna Extension] Analysis request failed:',
            response?.error || 'Unknown error'
          );
        }
      })
      .catch((error) => {
        console.error('[Suna Extension] Message send error:', error);
      });
  });

  // Position button next to coin element
  // Handle different element types (inline, block, table cell, list item, etc.)
  const elementStyle = window.getComputedStyle(element);
  const display = elementStyle.display;
  const isInline = display === 'inline' || display === 'inline-block';
  const isBlock = display === 'block' || display === 'flex' || display === 'grid';
  const isTableCell = display === 'table-cell';
  const isListItem = element.tagName === 'LI';

  // Insert button after element (works for most cases)
  if (element.parentNode) {
    // For inline elements, insert directly after
    if (isInline) {
      element.parentNode.insertBefore(button, element.nextSibling);
    }
    // For block elements, insert as sibling
    else if (isBlock) {
      element.parentNode.insertBefore(button, element.nextSibling);
    }
    // For table cells, insert inside cell (after content)
    else if (isTableCell) {
      element.appendChild(button);
    }
    // For list items, insert after list item
    else if (isListItem) {
      element.parentNode.insertBefore(button, element.nextSibling);
    }
    // Default: insert after element
    else {
      element.parentNode.insertBefore(button, element.nextSibling);
    }
  }
  
  // Mark element as processed to prevent duplicate injection
  injectedElements.add(element);
}

/**
 * Inject Buttons for Multiple Coins
 * Convenience function to inject buttons for multiple detected coins
 *
 * @param coins Array of coin detection results
 */
export function injectAnalysisButtons(coins: CoinDetection[]): void {
  for (const coin of coins) {
    injectAnalysisButton(coin.element, coin);
  }
}

/**
 * Remove All Injected Buttons
 * Removes all injected buttons from the page (useful for cleanup)
 * Note: This does NOT clear the injectedElements WeakSet as it will be garbage collected
 */
export function removeAllInjectedButtons(): void {
  const buttons = document.querySelectorAll(`.${BUTTON_CLASS_NAME}`);
  buttons.forEach((button) => {
    button.remove();
  });
  // Note: WeakSet will automatically clean up when elements are removed from DOM
}

/**
 * Check if Button Exists for Element
 * Checks if a button already exists for a given element
 *
 * @param element HTML element to check
 * @returns true if button exists, false otherwise
 */
export function hasButtonForElement(element: HTMLElement): boolean {
  return element.querySelector(`.${BUTTON_CLASS_NAME}`) !== null;
}

