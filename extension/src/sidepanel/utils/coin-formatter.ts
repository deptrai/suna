/**
 * Coin Formatter Utilities
 * 
 * Helper functions for formatting coin information.
 * Story 15.2: Coin Context Integration
 */

export interface CoinInfo {
  name: string;
  symbol?: string;
  price?: number;
}

/**
 * Format coin info into a prompt string
 */
export function formatCoinPrompt(coinInfo: CoinInfo): string {
  const coinContext = `Analyze ${coinInfo.name}${coinInfo.symbol ? ` (${coinInfo.symbol})` : ''}`;
  const priceContext = coinInfo.price
    ? ` - Current price: $${formatPrice(coinInfo.price)}`
    : '';
  return `${coinContext}${priceContext}`;
}

/**
 * Format price with commas and proper decimals
 */
export function formatPrice(price: number): string {
  // Format with commas for thousands and 2 decimal places
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format coin info for display in header
 */
export function formatCoinDisplay(coinInfo: CoinInfo): string {
  const display = `${coinInfo.name}${coinInfo.symbol ? ` (${coinInfo.symbol})` : ''}`;
  const priceDisplay = coinInfo.price ? ` - $${formatPrice(coinInfo.price)}` : '';
  return `${display}${priceDisplay}`;
}




