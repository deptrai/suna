/**
 * Browser Compatibility Utilities
 * 
 * Provides browser-agnostic APIs và compatibility checks.
 * Story 14.4: Cross-Browser Testing & Final Polish
 */

// Firefox browser API compatibility
// eslint-disable-next-line no-var
declare var browser: typeof chrome | undefined;

/**
 * Get browser runtime API (chrome or browser)
 */
export function getBrowserRuntime(): any {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return chrome.runtime;
  }
  // @ts-ignore - browser is a global in Firefox
  if (typeof browser !== 'undefined' && browser && browser.runtime) {
    // @ts-ignore
    return browser.runtime;
  }
  throw new Error('Browser runtime API not available');
}

/**
 * Get browser storage API (chrome.storage or browser.storage)
 */
export function getBrowserStorage(): any {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome.storage;
  }
  // @ts-ignore - browser is a global in Firefox
  if (typeof browser !== 'undefined' && browser && browser.storage) {
    // @ts-ignore
    return browser.storage;
  }
  throw new Error('Browser storage API not available');
}

/**
 * Get browser tabs API (chrome.tabs or browser.tabs)
 */
export function getBrowserTabs(): any {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    return chrome.tabs;
  }
  // @ts-ignore - browser is a global in Firefox
  if (typeof browser !== 'undefined' && browser && browser.tabs) {
    // @ts-ignore
    return browser.tabs;
  }
  return undefined;
}

/**
 * Get browser sidePanel API (chrome.sidePanel or browser.sidePanel)
 */
export function getBrowserSidePanel(): any {
  if (typeof chrome !== 'undefined' && chrome.sidePanel) {
    return chrome.sidePanel;
  }
  // @ts-ignore - browser is a global in Firefox
  if (typeof browser !== 'undefined' && browser && browser.sidePanel) {
    // @ts-ignore
    return browser.sidePanel;
  }
  return undefined;
}

/**
 * Check if browser supports requestIdleCallback
 */
export function supportsRequestIdleCallback(): boolean {
  return typeof requestIdleCallback !== 'undefined';
}

/**
 * Check if browser is Chrome
 */
export function isChrome(): boolean {
  return typeof chrome !== 'undefined' && 
         chrome.runtime !== undefined &&
         navigator.userAgent.includes('Chrome') &&
         !navigator.userAgent.includes('Edg');
}

/**
 * Check if browser is Edge
 */
export function isEdge(): boolean {
  return typeof chrome !== 'undefined' && 
         chrome.runtime !== undefined &&
         navigator.userAgent.includes('Edg');
}

/**
 * Check if browser is Firefox
 */
export function isFirefox(): boolean {
  // @ts-ignore - browser is a global in Firefox
  return typeof browser !== 'undefined' && 
         // @ts-ignore
         browser !== undefined &&
         // @ts-ignore
         browser.runtime !== undefined &&
         navigator.userAgent.includes('Firefox');
}

/**
 * Get browser name
 */
export function getBrowserName(): 'chrome' | 'edge' | 'firefox' | 'unknown' {
  if (isChrome()) return 'chrome';
  if (isEdge()) return 'edge';
  if (isFirefox()) return 'firefox';
  return 'unknown';
}

/**
 * Check if browser supports Manifest V3
 */
export function supportsManifestV3(): boolean {
  // Chrome và Edge support Manifest V3
  if (isChrome() || isEdge()) {
    return true;
  }
  // Firefox has limited Manifest V3 support (check version)
  if (isFirefox()) {
    // Firefox 109+ has Manifest V3 support
    const firefoxVersion = navigator.userAgent.match(/Firefox\/(\d+)/);
    if (firefoxVersion && parseInt(firefoxVersion[1]) >= 109) {
      return true;
    }
  }
  return false;
}

/**
 * Log browser compatibility info
 */
export function logBrowserInfo(): void {
  const browserName = getBrowserName();
  const supportsV3 = supportsManifestV3();
  const supportsIdle = supportsRequestIdleCallback();
  
  console.log('[Browser Compatibility]', {
    browser: browserName,
    manifestV3: supportsV3,
    requestIdleCallback: supportsIdle,
    userAgent: navigator.userAgent,
  });
}

