import { describe, test, expect } from 'bun:test';
import {
  EVM_ADDRESS,
  SOL_ADDRESS,
  ALLOWED_EVM_CHAINS,
  detectChain,
  normalizeAddress,
} from '../address';

describe('EVM_ADDRESS regex', () => {
  test('matches valid EVM address', () => {
    expect(EVM_ADDRESS.test('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(true);
    expect(EVM_ADDRESS.test('0x0000000000000000000000000000000000000000')).toBe(true);
  });

  test('rejects invalid EVM addresses', () => {
    expect(EVM_ADDRESS.test('0xshort')).toBe(false);
    expect(EVM_ADDRESS.test('A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(false);
    expect(EVM_ADDRESS.test('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB4')).toBe(false); // 39 chars
    expect(EVM_ADDRESS.test('')).toBe(false);
  });
});

describe('SOL_ADDRESS regex', () => {
  test('matches valid Solana addresses', () => {
    expect(SOL_ADDRESS.test('So11111111111111111111111111111111111111112')).toBe(true);
    expect(SOL_ADDRESS.test('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true);
  });

  test('rejects invalid Solana addresses', () => {
    expect(SOL_ADDRESS.test('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(false);
    expect(SOL_ADDRESS.test('short')).toBe(false);
  });
});

describe('ALLOWED_EVM_CHAINS', () => {
  test('contains expected chains', () => {
    expect(ALLOWED_EVM_CHAINS).toContain('ethereum');
    expect(ALLOWED_EVM_CHAINS).toContain('arbitrum');
    expect(ALLOWED_EVM_CHAINS).toContain('base');
    expect(ALLOWED_EVM_CHAINS).toContain('polygon');
    expect(ALLOWED_EVM_CHAINS).toContain('bsc');
    expect(ALLOWED_EVM_CHAINS).toContain('avalanche');
    expect(ALLOWED_EVM_CHAINS).toContain('optimism');
  });
});

describe('detectChain', () => {
  test('detects EVM address', () => {
    expect(detectChain('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe('evm');
  });

  test('detects Solana address', () => {
    expect(detectChain('So11111111111111111111111111111111111111112')).toBe('solana');
    expect(detectChain('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe('solana');
  });

  test('returns unknown for unrecognized address', () => {
    expect(detectChain('not-an-address')).toBe('unknown');
    expect(detectChain('')).toBe('unknown');
    expect(detectChain('0xshort')).toBe('unknown');
  });
});

describe('normalizeAddress', () => {
  test('lowercases EVM addresses', () => {
    expect(normalizeAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum')).toBe(
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    );
  });

  test('preserves Solana address case', () => {
    const solAddr = 'So11111111111111111111111111111111111111112';
    expect(normalizeAddress(solAddr, 'solana')).toBe(solAddr);
  });

  test('lowercases for any non-solana chain', () => {
    expect(normalizeAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12', 'base')).toBe(
      '0xabcdef1234567890abcdef1234567890abcdef12',
    );
  });
});
