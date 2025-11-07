/**
 * Coin Detection Algorithm
 * Detects cryptocurrency coin names, symbols, and prices trên web pages
 * 
 * This module provides coin detection functionality for the extension content script.
 * It uses pattern matching via regex to identify coins trong page content.
 */

/**
 * Coin Detection Result
 * Represents a detected coin với element reference, name, optional symbol, và optional price
 */
export interface CoinDetection {
  /** HTML element containing the detected coin */
  element: HTMLElement;
  /** Coin name (required) */
  name: string;
  /** Coin symbol (optional, e.g., "BTC", "ETH") */
  symbol?: string;
  /** Coin price (optional, parsed as number) */
  price?: number;
}

/**
 * Coin Symbol to Name Mapping
 * Maps common cryptocurrency symbols to their full names
 */
const COIN_SYMBOL_MAP: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  ADA: 'Cardano',
  MATIC: 'Polygon',
  DOT: 'Polkadot',
  AVAX: 'Avalanche',
  LINK: 'Chainlink',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  ALGO: 'Algorand',
  XRP: 'Ripple',
  LTC: 'Litecoin',
  BCH: 'Bitcoin Cash',
  DOGE: 'Dogecoin',
  XLM: 'Stellar',
  TRX: 'Tron',
  EOS: 'EOS',
  XTZ: 'Tezos',
  FIL: 'Filecoin',
  AAVE: 'Aave',
  MKR: 'Maker',
  COMP: 'Compound',
  SNX: 'Synthetix',
  CRV: 'Curve',
  YFI: 'Yearn Finance',
  SUSHI: 'SushiSwap',
  SAND: 'The Sandbox',
  MANA: 'Decentraland',
  AXS: 'Axie Infinity',
  ENJ: 'Enjin',
  FLOW: 'Flow',
  NEAR: 'NEAR Protocol',
  APT: 'Aptos',
  SUI: 'Sui',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  BASE: 'Base',
};

/**
 * Common Coin Names
 * List of common cryptocurrency names for pattern matching
 */
const COMMON_COIN_NAMES = [
  'Bitcoin',
  'Ethereum',
  'Solana',
  'Cardano',
  'Polygon',
  'Polkadot',
  'Avalanche',
  'Chainlink',
  'Uniswap',
  'Cosmos',
  'Algorand',
  'Ripple',
  'Litecoin',
  'Bitcoin Cash',
  'Dogecoin',
  'Stellar',
  'Tron',
  'EOS',
  'Tezos',
  'Filecoin',
  'Aave',
  'Maker',
  'Compound',
  'Synthetix',
  'Curve',
  'Yearn Finance',
  'SushiSwap',
  'The Sandbox',
  'Decentraland',
  'Axie Infinity',
  'Enjin',
  'Flow',
  'NEAR Protocol',
  'Aptos',
  'Sui',
  'Arbitrum',
  'Optimism',
  'Base',
];

/**
 * Coin Name Pattern
 * Regex pattern to match coin names (case-insensitive)
 */
function createCoinNamePattern(): RegExp {
  // Escape special regex characters in coin names and join with |
  const escapedNames = COMMON_COIN_NAMES.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const names = escapedNames.join('|');
  // Match coin names as whole words (with word boundaries)
  return new RegExp(`\\b(${names})\\b`, 'gi');
}

/**
 * Coin Symbol Pattern
 * Regex pattern to match coin symbols (BTC, ETH, etc.)
 * Matches symbols with or without currency prefix ($BTC, BTC)
 */
const COIN_SYMBOL_PATTERN = /\b\$?([A-Z]{2,10})\b/g;

/**
 * Price Pattern
 * Regex pattern to match price formats:
 * - $45,000
 * - 45,000 USD
 * - €40,000
 * - 45k
 * - 45,000.50
 */
const PRICE_PATTERNS = [
  // Format: $45,000 or $45,000.50
  /\$\s*([\d,]+(?:\.\d+)?)/g,
  // Format: 45,000 USD or 45,000.50 USD
  /([\d,]+(?:\.\d+)?)\s*(?:USD|USDT|USDC)/gi,
  // Format: €40,000 or €40,000.50
  /€\s*([\d,]+(?:\.\d+)?)/g,
  // Format: 45k or 45.5k
  /([\d,]+(?:\.\d+)?)\s*k\b/gi,
  // Format: 45,000 or 45,000.50 (standalone number near coin symbol)
  /\b([\d,]+(?:\.\d+)?)\b/g,
];

/**
 * Match Coin Name trong Text
 * @param text Text content to search
 * @returns Array of matched coin names
 */
function matchCoinNames(text: string): string[] {
  const pattern = createCoinNamePattern();
  const matches: string[] = [];
  let match;
  
  // Reset regex lastIndex
  pattern.lastIndex = 0;
  
  while ((match = pattern.exec(text)) !== null) {
    const coinName = match[1];
    if (!matches.includes(coinName)) {
      matches.push(coinName);
    }
  }
  
  return matches;
}

/**
 * Match Coin Symbols trong Text
 * @param text Text content to search
 * @returns Array of { symbol, name } objects
 */
function matchCoinSymbols(text: string): Array<{ symbol: string; name: string }> {
  const matches: Array<{ symbol: string; name: string }> = [];
  let match;
  
  // Reset regex lastIndex
  COIN_SYMBOL_PATTERN.lastIndex = 0;
  
  while ((match = COIN_SYMBOL_PATTERN.exec(text)) !== null) {
    const symbol = match[1].toUpperCase();
    
    // Check if symbol is in our mapping
    if (COIN_SYMBOL_MAP[symbol]) {
      // Avoid duplicates
      if (!matches.some(m => m.symbol === symbol)) {
        matches.push({
          symbol,
          name: COIN_SYMBOL_MAP[symbol],
        });
      }
    }
  }
  
  return matches;
}

/**
 * Extract Price Near Symbol
 * Extracts price từ text that appears near a coin symbol
 * Looks for prices within reasonable distance (e.g., "BTC $45,000" or "ETH 3,500 USD")
 * 
 * @param text Text content to search
 * @param symbolIndex Index of symbol trong text
 * @returns Parsed price as number, or null if not found
 */
function extractPriceNearSymbol(text: string, symbolIndex: number): number | null {
  // Search for price within 50 characters after symbol
  const searchStart = Math.max(0, symbolIndex);
  const searchEnd = Math.min(text.length, symbolIndex + 50);
  const searchText = text.substring(searchStart, searchEnd);
  
  // Try each price pattern
  for (const pattern of PRICE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(searchText);
    
    if (match) {
      let priceStr = match[1].replace(/,/g, ''); // Remove commas
      
      // Handle "k" suffix (e.g., 45k = 45000)
      const kMatch = searchText.match(new RegExp(`${priceStr.replace(/\./g, '\\.')}\\s*k\\b`, 'i'));
      if (kMatch) {
        const price = parseFloat(priceStr);
        if (!isNaN(price) && price > 0) {
          return price * 1000;
        }
      }
      
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }
  }
  
  return null;
}

/**
 * Detect Coins trong Element
 * Main detection function that scans an HTMLElement for coin names, symbols, và prices
 * 
 * @param element Root element to scan for coins
 * @returns Array of CoinDetection results
 */
export function detectCoins(element: HTMLElement): CoinDetection[] {
  const results: CoinDetection[] = [];
  const processedElements = new Set<HTMLElement>();
  
  // Create coin name pattern once (optimization: avoid recreating in loop)
  const coinNamePattern = createCoinNamePattern();
  
  // Use TreeWalker to traverse text nodes
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip script and style elements
        const parent = node.parentElement;
        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  
  let textNode;
  while ((textNode = walker.nextNode()) !== null) {
    const text = textNode.textContent || '';
    if (!text.trim()) continue;
    
    const parentElement = textNode.parentElement;
    if (!parentElement || processedElements.has(parentElement)) continue;
    
    // Match coin names (reuse pattern created outside loop)
    coinNamePattern.lastIndex = 0;
    let nameMatch;
    while ((nameMatch = coinNamePattern.exec(text)) !== null) {
      const name = nameMatch[1];
      results.push({
        element: parentElement,
        name,
      });
    }
    
    // Match coin symbols và associate prices
    COIN_SYMBOL_PATTERN.lastIndex = 0;
    let symbolMatch;
    while ((symbolMatch = COIN_SYMBOL_PATTERN.exec(text)) !== null) {
      const symbol = symbolMatch[1].toUpperCase();
      
      // Check if symbol is in our mapping
      if (COIN_SYMBOL_MAP[symbol]) {
        const symbolIndex = symbolMatch.index;
        // Extract price from text near symbol
        const price = extractPriceNearSymbol(text, symbolIndex);
        
        results.push({
          element: parentElement,
          name: COIN_SYMBOL_MAP[symbol],
          symbol,
          price: price || undefined,
        });
      }
    }
    
    // Mark element as processed
    processedElements.add(parentElement);
  }
  
  // Deduplicate results (same element + name + symbol combination)
  // Optimization: Use Map với element reference for efficient deduplication
  const uniqueResults: CoinDetection[] = [];
  const seen = new Map<HTMLElement, Set<string>>();
  
  for (const result of results) {
    // Get or create set for this element
    if (!seen.has(result.element)) {
      seen.set(result.element, new Set());
    }
    const elementKeys = seen.get(result.element)!;
    
    // Create unique key based on name và symbol for this element
    const key = `${result.name}-${result.symbol || ''}`;
    if (!elementKeys.has(key)) {
      elementKeys.add(key);
      uniqueResults.push(result);
    }
  }
  
  return uniqueResults;
}

/**
 * Detect Coins trong Entire Document
 * Convenience function to detect coins trong entire document body
 * 
 * @returns Array of CoinDetection results
 */
export function detectCoinsInDocument(): CoinDetection[] {
  return detectCoins(document.body);
}

