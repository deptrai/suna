import { describe, expect, test } from 'bun:test';
import { detectTicker as detectDexTicker, parseDexPath } from './dexscreener';
import { detectTicker as detectCmcTicker, expectedTickerFromSlug, parseCmcSlug } from './coinmarketcap';

describe('DexScreener parser helpers', () => {
  test('parses trusted contract address from URL', () => {
    const out = parseDexPath('/ethereum/0x1234567890123456789012345678901234567890');
    expect(out.trusted).toBe('0x1234567890123456789012345678901234567890');
    expect(out.slug).toBeNull();
  });

  test('parses slug when URL token is not an address', () => {
    const out = parseDexPath('/solana/bonk');
    expect(out.trusted).toBeNull();
    expect(out.slug).toBe('BONK');
  });

  test('extracts uppercase ticker from text', () => {
    expect(detectDexTicker('BONK / SOL')).toBe('BONK');
  });
});

describe('CoinMarketCap parser helpers', () => {
  test('parses currency slug from URL', () => {
    expect(parseCmcSlug('/currencies/bitcoin/')).toBe('bitcoin');
  });

  test('maps known slug to canonical ticker', () => {
    expect(expectedTickerFromSlug('bitcoin')).toBe('BTC');
    expect(expectedTickerFromSlug('usd-coin')).toBe('USDC');
  });

  test('falls back to first slug segment for unknown assets', () => {
    expect(expectedTickerFromSlug('pepe-coin')).toBe('PEPE');
  });

  test('extracts ticker from header text', () => {
    expect(detectCmcTicker('BTC Price Live Data')).toBe('BTC');
  });
});
