import { describe, expect, test } from 'bun:test';
import { classifyPendingTx, toPendingMempoolTx } from '../../router/services/mempool';

const UNISWAP_V2_ROUTER = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
const NON_ROUTER = '0x2222222222222222222222222222222222222222';
const SWAP_SELECTOR_INPUT = '0x38ed17390000'; // swapExactTokensForTokens
const NON_SWAP_INPUT = '0xdeadbeef00000000';

describe('mempool parser/classifier', () => {
  test('above-threshold + router + swap selector → sandwich_suspect (D2 resolution)', () => {
    const candidate = classifyPendingTx(
      {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        to: UNISWAP_V2_ROUTER,
        input: SWAP_SELECTOR_INPUT,
        value: '0x1bc16d674ec80000', // 2 ETH
        chain: 'ethereum',
        raw: {},
      },
      1000,
    );
    expect(candidate?.alertType).toBe('sandwich_suspect');
  });

  test('above-threshold + swap selector + non-router → frontrun_suspect', () => {
    const candidate = classifyPendingTx(
      {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        to: NON_ROUTER,
        input: SWAP_SELECTOR_INPUT,
        value: '0x1bc16d674ec80000', // 2 ETH
        chain: 'ethereum',
        raw: {},
      },
      1000,
    );
    expect(candidate?.alertType).toBe('frontrun_suspect');
  });

  test('above-threshold + router + non-swap selector → large_swap', () => {
    const candidate = classifyPendingTx(
      {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        to: UNISWAP_V2_ROUTER,
        input: NON_SWAP_INPUT,
        value: '0x1bc16d674ec80000',
        chain: 'ethereum',
        raw: {},
      },
      1000,
    );
    expect(candidate?.alertType).toBe('large_swap');
  });

  test('above-threshold + no router + no swap selector → unknown_large_tx', () => {
    const candidate = classifyPendingTx(
      {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        to: NON_ROUTER,
        input: NON_SWAP_INPUT,
        value: '0x1bc16d674ec80000',
        chain: 'ethereum',
        raw: {},
      },
      1000,
    );
    expect(candidate?.alertType).toBe('unknown_large_tx');
  });

  test('above default threshold (500k USD) returns null at 2 ETH', () => {
    const candidate = classifyPendingTx(
      {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        to: UNISWAP_V2_ROUTER,
        input: SWAP_SELECTOR_INPUT,
        value: '0x1bc16d674ec80000',
        chain: 'ethereum',
        raw: {},
      },
      500000,
    );
    expect(candidate).toBeNull();
  });

  test('zero native value drops silently (D3 resolution)', () => {
    const candidate = classifyPendingTx(
      {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        to: UNISWAP_V2_ROUTER,
        input: SWAP_SELECTOR_INPUT,
        value: '0x0',
        chain: 'ethereum',
        raw: {},
      },
      1,
    );
    expect(candidate).toBeNull();
  });

  test('malformed value (0x empty hex) returns null', () => {
    const candidate = classifyPendingTx(
      {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        to: UNISWAP_V2_ROUTER,
        input: SWAP_SELECTOR_INPUT,
        value: '0x',
        chain: 'ethereum',
        raw: {},
      },
      1,
    );
    expect(candidate).toBeNull();
  });

  test('USD cap protects against numeric(20,4) overflow', () => {
    const candidate = classifyPendingTx(
      {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        to: UNISWAP_V2_ROUTER,
        input: SWAP_SELECTOR_INPUT,
        // uint256 ~ max: triggers extreme native value
        value: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        chain: 'ethereum',
        raw: {},
      },
      1,
    );
    expect(candidate).not.toBeNull();
    expect(candidate!.estimatedValueUsd).toBeLessThanOrEqual(1e15);
    expect(Number.isFinite(candidate!.estimatedValueUsd!)).toBe(true);
  });

  test('non-numeric MEMPOOL_MIN_VALUE_USD (NaN) returns null instead of passing all', () => {
    const candidate = classifyPendingTx(
      {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        to: UNISWAP_V2_ROUTER,
        input: SWAP_SELECTOR_INPUT,
        value: '0x1bc16d674ec80000',
        chain: 'ethereum',
        raw: {},
      },
      NaN,
    );
    expect(candidate).toBeNull();
  });

  test('coerceHexish: numeric tx.value coerced to hex (provider variance)', () => {
    const tx = toPendingMempoolTx({
      chain: 'ethereum',
      tx: {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        // raw number, not hex string
        value: 2_000_000_000_000_000_000,
      },
    });
    expect(tx).not.toBeNull();
    expect(tx!.value.startsWith('0x')).toBe(true);
  });

  test('hash longer than 100 chars rejected by parser', () => {
    const longHash = '0x' + 'a'.repeat(120);
    const tx = toPendingMempoolTx({
      chain: 'ethereum',
      tx: { hash: longHash, from: '0x1111111111111111111111111111111111111111' },
    });
    expect(tx).toBeNull();
  });

  test('returns null for malformed input', () => {
    const tx = toPendingMempoolTx({
      chain: 'ethereum',
      tx: { hash: 123, from: null },
    });
    expect(tx).toBeNull();
  });

  test('toPendingMempoolTx parses gas + chainId (AC4)', () => {
    const tx = toPendingMempoolTx({
      chain: 'ethereum',
      tx: {
        hash: '0xabc',
        from: '0x1111111111111111111111111111111111111111',
        gas: '0x5208',
        chainId: '0x1',
        value: '0x0',
      },
    });
    expect(tx?.gas).toBe('0x5208');
    expect(tx?.chainId).toBe('0x1');
  });
});
