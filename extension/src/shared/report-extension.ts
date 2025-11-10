/**
 * Report Generation for Extension
 * 
 * Functions for generating report URLs và opening reports.
 * Story 14.1: Report Generation Integration
 */

import { getAuthToken } from './api-extension';
import { logger } from './logger';

/**
 * Get base URL for reports
 */
async function getReportBaseUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['frontendUrl'], (result) => {
      if (result.frontendUrl) {
        resolve(result.frontendUrl);
      } else {
        // Default to production, can detect localhost
        const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
        resolve(isLocalhost ? 'http://localhost:3000' : 'https://chainlens.so');
      }
    });
  });
}

/**
 * Generate report URL với coin context
 * 
 * @param coinInfo - Coin information (name, symbol, price)
 * @returns Report URL với coin context as query parameters
 */
export async function generateReportUrl(coinInfo: {
  name: string;
  symbol?: string;
  price?: number;
}): Promise<string> {
  const baseUrl = await getReportBaseUrl();
  const reportPath = '/reports';
  
  const url = new URL(reportPath, baseUrl);
  
  // Add coin context as query parameters
  url.searchParams.set('coinName', coinInfo.name);
  if (coinInfo.symbol) {
    url.searchParams.set('symbol', coinInfo.symbol);
  }
  if (coinInfo.price) {
    url.searchParams.set('price', coinInfo.price.toString());
  }
  
  return url.toString();
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Generate report via API (if API endpoint exists)
 * 
 * For now, this constructs the URL locally.
 * In the future, this could call an API endpoint to generate a report
 * và return a report URL với report ID.
 * 
 * @param coinInfo - Coin information
 * @returns Report URL
 */
export async function generateReportViaApi(coinInfo: {
  name: string;
  symbol?: string;
  price?: number;
}): Promise<string> {
  try {
    // Check authentication
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Not authenticated. Please sign in to generate reports.');
    }

    // For now, generate URL locally
    // In the future, this could call an API endpoint like:
    // const apiUrl = await getApiUrl();
    // const response = await fetch(`${apiUrl}/reports/generate`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${token}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({ coinInfo }),
    // });
    // const data = await response.json();
    // return data.reportUrl;

    const reportUrl = await generateReportUrl(coinInfo);
    
    // Validate URL
    if (!validateUrl(reportUrl)) {
      throw new Error('Invalid report URL generated');
    }

    return reportUrl;
  } catch (error) {
    logger.error('Error generating report URL:', error);
    throw error;
  }
}

/**
 * Open report in new tab
 * 
 * @param reportUrl - Report URL to open
 * @returns Promise resolving when tab is opened
 */
export async function openReportInNewTab(reportUrl: string): Promise<void> {
  try {
    // Validate URL before opening
    if (!validateUrl(reportUrl)) {
      throw new Error('Invalid report URL');
    }

    // Try using chrome.tabs.create() first
    try {
      await chrome.tabs.create({
        url: reportUrl,
        active: true,
      });
      logger.info('Report opened in new tab:', reportUrl);
    } catch (error) {
      // Fallback to window.open() if chrome.tabs.create() fails
      logger.warn('chrome.tabs.create() failed, using window.open() fallback:', error);
      if (typeof window !== 'undefined') {
        window.open(reportUrl, '_blank');
      } else {
        throw new Error('Cannot open tab: window is not available');
      }
    }
  } catch (error) {
    logger.error('Error opening report tab:', error);
    throw error;
  }
}

