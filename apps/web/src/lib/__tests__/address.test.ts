import { describe, test, expect } from 'bun:test';
import { detectChain, normalizeAddress, EVM_ADDRESS, SOL_ADDRESS } from '@epsilon/shared';

describe('@epsilon/shared address utilities (smoke tests from web app)', () => {
  test('detectChain identifies EVM address', () => {
    expect(detectChain('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe('evm');
  });

  test('detectChain identifies Solana address', () => {
    expect(detectChain('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe('solana');
  });

  test('detectChain returns unknown for garbage input', () => {
    expect(detectChain('not-valid')).toBe('unknown');
  });

  test('normalizeAddress lowercases EVM', () => {
    const addr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    expect(normalizeAddress(addr, 'ethereum')).toBe(addr.toLowerCase());
  });

  test('normalizeAddress preserves Solana case', () => {
    const addr = 'So11111111111111111111111111111111111111112';
    expect(normalizeAddress(addr, 'solana')).toBe(addr);
  });

  test('EVM_ADDRESS regex is exported and functional', () => {
    expect(EVM_ADDRESS.test('0x0000000000000000000000000000000000000000')).toBe(true);
    expect(EVM_ADDRESS.test('invalid')).toBe(false);
  });

  test('SOL_ADDRESS regex is exported and functional', () => {
    expect(SOL_ADDRESS.test('So11111111111111111111111111111111111111112')).toBe(true);
    expect(SOL_ADDRESS.test('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(false);
  });
});
