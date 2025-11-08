/**
 * Button Injection Module
 * 
 * Injects "Analyze with ChainLens" buttons next to detected coin elements.
 * Handles button creation, positioning, styling, và message passing.
 * 
 * Story 11.3: Analysis Button Injection
 */

import type { CoinDetection } from '../shared/coin-detector';
import { logger } from '../shared/logger';

/**
 * CSS class name for injected buttons
 */
const BUTTON_CLASS_NAME = 'chainlens-analyze-btn';

/**
 * Data attribute name for coin information
 */
const BUTTON_DATA_COIN_NAME = 'data-chainlens-coin';
const BUTTON_DATA_COIN_SYMBOL = 'data-chainlens-symbol';

/**
 * Track injected elements to prevent duplicates
 * Using WeakSet for automatic garbage collection
 */
const injectedElements = new WeakSet<HTMLElement>();

/**
 * Message type for opening side panel với coin info
 */
interface OpenSidePanelMessage {
  type: 'OPEN_SIDE_PANEL_WITH_COIN';
  coinInfo: {
    name: string;
    symbol?: string;
    price?: number;
  };
}

/**
 * Legacy message type for backward compatibility
 */
interface AnalyzeCoinMessage {
  type: 'ANALYZE_COIN';
  coin: string;
  symbol?: string;
  price?: number;
}

/**
 * Check if button already exists for an element (internal function)
 */
function checkButtonExists(element: HTMLElement): boolean {
  // Check if element already has a button
  if (injectedElements.has(element)) {
    return true;
  }

  // Check if button exists inside element
  if (element.querySelector(`.${BUTTON_CLASS_NAME}`)) {
    return true;
  }

  // Check if button exists as next sibling
  const nextSibling = element.nextSibling;
  if (nextSibling && nextSibling instanceof HTMLElement) {
    if (nextSibling.classList.contains(BUTTON_CLASS_NAME)) {
      return true;
    }
  }

  // Check parent's children for button với same coin data
  const parent = element.parentElement;
  if (parent) {
    const existingButtons = parent.querySelectorAll(`.${BUTTON_CLASS_NAME}`);
    for (const button of existingButtons) {
      if (button instanceof HTMLElement) {
        const coinName = button.getAttribute(BUTTON_DATA_COIN_NAME);
        const coinSymbol = button.getAttribute(BUTTON_DATA_COIN_SYMBOL);
        if (
          coinName === element.textContent?.trim() ||
          (coinSymbol && coinSymbol === element.textContent?.trim())
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Handle button click - send message to background worker
 */
function handleButtonClick(coinData: CoinDetection, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();

  try {
    // Send message to background worker với coin info
    // Use OPEN_SIDE_PANEL_WITH_COIN format (preferred) for Story 13.4 integration
    const message: OpenSidePanelMessage = {
      type: 'OPEN_SIDE_PANEL_WITH_COIN',
      coinInfo: {
        name: coinData.name,
        symbol: coinData.symbol,
        price: coinData.price,
      },
    };

    logger.debug('Sending message to background worker:', message);

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        logger.error('Error sending message to background worker:', chrome.runtime.lastError);
        return;
      }

      if (response) {
        logger.debug('Background worker response:', response);
      }
    });
  } catch (error) {
    logger.error('Error handling button click:', error);
  }
}

/**
 * Get computed display style for element
 */
function getElementDisplayType(element: HTMLElement): string {
  const computedStyle = window.getComputedStyle(element);
  return computedStyle.display || 'inline';
}

/**
 * Position button next to coin element based on element type
 */
function positionButton(button: HTMLButtonElement, element: HTMLElement): void {
  const displayType = getElementDisplayType(element);
  const parent = element.parentElement;

  if (!parent) {
    logger.warn('Cannot position button: element has no parent');
    return;
  }

  try {
    // Handle different display types
    if (displayType === 'table-cell' || element.tagName === 'TD' || element.tagName === 'TH') {
      // For table cells, append button to cell
      element.appendChild(button);
    } else if (displayType === 'list-item' || element.tagName === 'LI') {
      // For list items, append button to list item
      element.appendChild(button);
    } else if (displayType === 'inline' || displayType === 'inline-block') {
      // For inline elements, insert button after element
      if (element.nextSibling) {
        parent.insertBefore(button, element.nextSibling);
      } else {
        parent.appendChild(button);
      }
    } else {
      // For block elements, append button to element
      element.appendChild(button);
    }
  } catch (error) {
    logger.error('Error positioning button:', error);
    // Fallback: append to parent
    parent.appendChild(button);
  }
}

/**
 * Inject analysis button next to detected coin element
 * 
 * @param element - The HTML element containing the coin
 * @param coinData - Coin detection data (name, symbol, price)
 */
export function injectAnalysisButton(
  element: HTMLElement,
  coinData: CoinDetection
): void {
  // Validate element
  if (!element || !(element instanceof HTMLElement)) {
    logger.warn('Invalid element provided to injectAnalysisButton');
    return;
  }

  // Skip if element is already a button (avoid injecting buttons into buttons)
  if (element.tagName === 'BUTTON' || element.classList.contains(BUTTON_CLASS_NAME)) {
    return;
  }

  // Check for duplicate injection
  if (checkButtonExists(element)) {
    logger.debug(`Button already exists for element với coin: ${coinData.name}`);
    return;
  }

  try {
    // Create button element
    const button = document.createElement('button');
    button.type = 'button'; // Prevent form submission
    button.className = BUTTON_CLASS_NAME;
    button.textContent = 'Analyze with ChainLens';
    
    // Add data attributes for identification
    button.setAttribute(BUTTON_DATA_COIN_NAME, coinData.name);
    if (coinData.symbol) {
      button.setAttribute(BUTTON_DATA_COIN_SYMBOL, coinData.symbol);
    }

    // Add click handler
    button.addEventListener('click', (event) => {
      handleButtonClick(coinData, event);
    });

    // Position button next to element
    positionButton(button, element);

    // Mark element as injected
    injectedElements.add(element);

    logger.debug(`Button injected for coin: ${coinData.name}${coinData.symbol ? ` (${coinData.symbol})` : ''}`);
  } catch (error) {
    logger.error('Error injecting button:', error);
  }
}

/**
 * Inject analysis buttons for multiple coin detections
 * 
 * @param detections - Array of coin detections
 */
export function injectAnalysisButtons(detections: CoinDetection[]): void {
  if (!detections || detections.length === 0) {
    return;
  }

  logger.debug(`Injecting buttons for ${detections.length} coin(s)...`);

  let injectedCount = 0;
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

      injectAnalysisButton(detection.element, detection);
      injectedCount++;
    } catch (error) {
      logger.error('Error injecting button for detection:', error, detection);
    }
  }

  logger.info(`Button injection completed: ${injectedCount}/${detections.length} buttons injected`);
}

/**
 * Remove all injected buttons from page
 */
export function removeAllInjectedButtons(): void {
  const buttons = document.querySelectorAll(`.${BUTTON_CLASS_NAME}`);
  let removedCount = 0;

  for (const button of buttons) {
    try {
      if (button instanceof HTMLElement && button.parentElement) {
        button.parentElement.removeChild(button);
        removedCount++;
      }
    } catch (error) {
      logger.error('Error removing button:', error);
    }
  }

  // Clear WeakSet (elements will be garbage collected)
  // Note: WeakSet doesn't have clear() method, but references will be cleared automatically

  logger.debug(`Removed ${removedCount} injected button(s)`);
}

/**
 * Check if element has an injected button (exported for external use)
 * 
 * @param element - The HTML element to check
 * @returns true if element has an injected button, false otherwise
 */
export function elementHasButton(element: HTMLElement): boolean {
  return checkButtonExists(element);
}

