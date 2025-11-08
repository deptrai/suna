/**
 * Coin Detection Algorithm
 * 
 * Detects cryptocurrency coin names, symbols, và prices trên web pages
 * using pattern matching và DOM traversal.
 * 
 * @module coin-detector
 */

import { validateAndFilterDetections } from './validation';

/**
 * Coin detection result interface
 */
export interface CoinDetection {
  element: HTMLElement;
  name: string;
  symbol?: string;
  price?: number;
}

/**
 * Coin symbol to name mapping
 * Maps common cryptocurrency symbols to their full names
 */
const COIN_SYMBOL_MAP: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  ADA: 'Cardano',
  MATIC: 'Polygon',
  AVAX: 'Avalanche',
  DOT: 'Polkadot',
  LINK: 'Chainlink',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  ALGO: 'Algorand',
  NEAR: 'NEAR Protocol',
  FTM: 'Fantom',
  TRX: 'Tron',
  XRP: 'Ripple',
  LTC: 'Litecoin',
  BCH: 'Bitcoin Cash',
  XLM: 'Stellar',
  EOS: 'EOS',
  XMR: 'Monero',
  DASH: 'Dash',
  ZEC: 'Zcash',
  DOGE: 'Dogecoin',
  SHIB: 'Shiba Inu',
  AAVE: 'Aave',
  COMP: 'Compound',
  MKR: 'Maker',
  SNX: 'Synthetix',
  SUSHI: 'SushiSwap',
  CRV: 'Curve',
  YFI: 'Yearn Finance',
  SAND: 'The Sandbox',
  MANA: 'Decentraland',
  AXS: 'Axie Infinity',
  ENJ: 'Enjin',
  CHZ: 'Chiliz',
  FLOW: 'Flow',
};

/**
 * Common cryptocurrency names
 */
const COMMON_COIN_NAMES = [
  'Bitcoin',
  'Ethereum',
  'Solana',
  'Cardano',
  'Polygon',
  'Avalanche',
  'Polkadot',
  'Chainlink',
  'Uniswap',
  'Cosmos',
  'Algorand',
  'NEAR Protocol',
  'Fantom',
  'Tron',
  'Ripple',
  'Litecoin',
  'Bitcoin Cash',
  'Stellar',
  'EOS',
  'Monero',
  'Dash',
  'Zcash',
  'Dogecoin',
  'Shiba Inu',
  'Aave',
  'Compound',
  'Maker',
  'Synthetix',
  'SushiSwap',
  'Curve',
  'Yearn Finance',
  'The Sandbox',
  'Decentraland',
  'Axie Infinity',
  'Enjin',
  'Chiliz',
  'Flow',
];

/**
 * Creates a regex pattern for coin name matching
 * Escapes special regex characters và adds word boundaries
 * 
 * NOTE: Pattern is cached for performance - created once và reused
 */
function createCoinNamePattern(): RegExp {
  const escapedNames = COMMON_COIN_NAMES.map(name => 
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return new RegExp(`\\b(?:${escapedNames.join('|')})\\b`, 'gi');
}

// Cache regex pattern for performance (created once, reused)
const COIN_NAME_PATTERN = createCoinNamePattern();

/**
 * Regex pattern for matching coin symbols
 * Only matches known symbols from COIN_SYMBOL_MAP to avoid false positives
 */
const KNOWN_SYMBOLS = Object.keys(COIN_SYMBOL_MAP);
const COIN_SYMBOL_PATTERN = new RegExp(
  `(?:\\$)?\\b(${KNOWN_SYMBOLS.join('|')})\\b`,
  'gi'
);

/**
 * Price pattern matching regexes
 * Supports multiple formats: $45,000, 45,000 USD, €40,000, 45k, etc.
 */
const PRICE_PATTERNS = [
  /\$[\d,]+\.?\d*/g,                    // $45,000 or $45,000.50
  /[\d,]+\.?\d*\s*(?:USD|usd)/g,        // 45,000 USD
  /€[\d,]+\.?\d*/g,                     // €40,000
  /\b[\d,]+\.?\d*k\b/gi,                // 45k or 45K
  /[\d,]+\.?\d*\s*(?:EUR|eur)/g,        // 45,000 EUR
];

/**
 * Matches coin names trong text content
 * Uses cached regex pattern for performance
 * 
 * @param text - Text content to search
 * @returns Array of matched coin names
 */
function matchCoinNames(text: string): string[] {
  const matches: string[] = [];
  let match;
  
  // Reset regex lastIndex (important for global regex)
  COIN_NAME_PATTERN.lastIndex = 0;
  
  while ((match = COIN_NAME_PATTERN.exec(text)) !== null) {
    const coinName = match[0];
    // Normalize case - handle multi-word names correctly
    const normalizedName = coinName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    if (!matches.includes(normalizedName)) {
      matches.push(normalizedName);
    }
  }
  
  return matches;
}

/**
 * Matches coin symbols trong text content
 * 
 * @param text - Text content to search
 * @returns Array of matched coin symbols với their names
 */
function matchCoinSymbols(text: string): Array<{ symbol: string; name: string }> {
  const matches: Array<{ symbol: string; name: string }> = [];
  let match;
  
  // Reset regex lastIndex
  COIN_SYMBOL_PATTERN.lastIndex = 0;
  
  while ((match = COIN_SYMBOL_PATTERN.exec(text)) !== null) {
    const symbol = match[1].toUpperCase();
    const coinName = COIN_SYMBOL_MAP[symbol];
    
    if (coinName && !matches.some(m => m.symbol === symbol)) {
      matches.push({ symbol, name: coinName });
    }
  }
  
  return matches;
}

/**
 * Extracts price từ text near a coin symbol
 * Validates price range to avoid false positives
 * 
 * @param text - Text content to search
 * @param symbolPosition - Position of coin symbol trong text
 * @returns Extracted price value hoặc null
 */
function extractPriceNearSymbol(text: string, symbolPosition: number): number | null {
  // Dynamic search window: search within reasonable distance after symbol
  // Increased to 100 characters to catch prices further away
  const searchStart = symbolPosition;
  const searchEnd = Math.min(symbolPosition + 100, text.length);
  const searchText = text.substring(searchStart, searchEnd);
  
  for (const pattern of PRICE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(searchText);
    
    if (match) {
      let priceStr = match[0];
      
      // Remove currency symbols và suffixes
      priceStr = priceStr.replace(/[$€]/g, '');
      priceStr = priceStr.replace(/\s*(?:USD|EUR|usd|eur)/gi, '');
      
      // Handle "k" suffix (45k = 45000)
      if (/\d+k/gi.test(priceStr)) {
        priceStr = priceStr.replace(/k/gi, '');
        const num = parseFloat(priceStr.replace(/,/g, ''));
        if (!isNaN(num) && num > 0) {
          const price = num * 1000;
          // Validate price range (0.0001 to 1,000,000,000)
          if (price >= 0.0001 && price <= 1000000000) {
            return price;
          }
        }
      }
      
      // Parse numeric value (handle commas)
      const num = parseFloat(priceStr.replace(/,/g, ''));
      if (!isNaN(num) && num > 0) {
        // Validate price range (0.0001 to 1,000,000,000)
        if (num >= 0.0001 && num <= 1000000000) {
          return num;
        }
      }
    }
  }
  
  return null;
}

/**
 * Main coin detection function
 * Uses TreeWalker để efficiently traverse DOM và detect coins
 * Includes input validation và sanitization
 * 
 * @param root - Root element to search from (typically document.body)
 * @returns Array of validated coin detection results
 */
export function detectCoins(root: HTMLElement): CoinDetection[] {
  if (!root || !(root instanceof HTMLElement)) {
    console.warn('detectCoins: Invalid root element provided');
    return [];
  }

  const detections: CoinDetection[] = [];
  const seenDetections = new Map<string, CoinDetection>();
  
  // Create TreeWalker để traverse text nodes
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip script và style elements
        const parent = node.parentElement;
        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Skip empty text nodes
        if (!node.textContent || node.textContent.trim().length === 0) {
          return NodeFilter.FILTER_REJECT;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  
  let textNode;
  while ((textNode = walker.nextNode()) !== null) {
    // Sanitize text content to prevent XSS
    const rawText = textNode.textContent || '';
    const text = rawText.trim();
    
    // Skip empty text
    if (!text) continue;
    
    const parentElement = textNode.parentElement;
    
    if (!parentElement || !(parentElement instanceof HTMLElement)) continue;
    
    // Match coin names
    const coinNames = matchCoinNames(text);
    for (const coinName of coinNames) {
      const key = `${parentElement.tagName}-${coinName}`;
      if (!seenDetections.has(key)) {
        const detection: CoinDetection = {
          element: parentElement,
          name: coinName,
        };
        detections.push(detection);
        seenDetections.set(key, detection);
      }
    }
    
    // Match coin symbols
    const coinSymbols = matchCoinSymbols(text);
    for (const { symbol, name } of coinSymbols) {
      // Find symbol position trong text
      const symbolIndex = text.toUpperCase().indexOf(symbol);
      if (symbolIndex === -1) continue;
      
      // Extract price near symbol
      const price = extractPriceNearSymbol(text, symbolIndex);
      
      const key = `${parentElement.tagName}-${symbol}`;
      if (!seenDetections.has(key)) {
        const detection: CoinDetection = {
          element: parentElement,
          name,
          symbol,
          price: price || undefined,
        };
        detections.push(detection);
        seenDetections.set(key, detection);
      } else {
        // Update existing detection với price if found
        const existing = seenDetections.get(key);
        if (existing && price && !existing.price) {
          existing.price = price;
        }
      }
    }
  }
  
  // Validate và filter detections before returning
  return validateAndFilterDetections(detections);
}

/**
 * Convenience function to detect coins trong entire document
 * 
 * @returns Array of coin detection results
 */
export function detectCoinsInDocument(): CoinDetection[] {
  return detectCoins(document.body);
}

