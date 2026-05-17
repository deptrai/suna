import { config } from '../../config';

export type MempoolAlertType =
  | 'large_swap'
  | 'sandwich_suspect'
  | 'frontrun_suspect'
  | 'unknown_large_tx';

export interface PendingMempoolTx {
  hash: string;
  from: string;
  to: string | null;
  input: string;
  value: string;
  chain: string;
  gas?: string | null;        // AC4: gas limit
  chainId?: string | null;    // AC4: chainId (hex string)
  gasPrice?: string | null;
  maxFeePerGas?: string | null;
  maxPriorityFeePerGas?: string | null;
  raw: Record<string, unknown>;
}

export interface MempoolAlertCandidate {
  txHash: string;
  chain: string;
  routerAddress: string | null;
  methodSelector: string | null;
  alertType: MempoolAlertType;
  estimatedValueUsd: number | null;
  nativeValueWei: string;
  tokenIn: string | null;
  tokenOut: string | null;
}

const SWAP_SELECTORS = new Set<string>([
  '0x38ed1739', // swapExactTokensForTokens
  '0x7ff36ab5', // swapExactETHForTokens
  '0x18cbafe5', // swapExactTokensForETH
  '0x414bf389', // exactInputSingle
  '0xc04b8d59', // exactInput
]);

// Per-chain router watchlists. Chains in this map can produce `large_swap` /
// `sandwich_suspect` / `frontrun_suspect` classifications. Chains absent here
// (e.g. arbitrum/polygon today) fall through to `unknown_large_tx` only.
const WATCHED_ROUTERS: Record<string, Set<string>> = {
  ethereum: new Set([
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2 Router
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Universal Router
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap V3 SwapRouter
  ]),
  base: new Set([
    '0x2626664c2603336e57b271c5c0b26f421741e481', // Uniswap V3 SwapRouter02 on Base
    '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24', // Uniswap V2 Router 02 on Base
  ]),
  bsc: new Set([
    '0x10ed43c718714eb63d5aa57b78b54704e256024e', // PancakeSwap V2 Router
  ]),
};

// Approximate native-token USD floor (Q2 2026). Operator can override per chain
// via MEMPOOL_NATIVE_USD_* env. Live price feed deferred post-MVP.
const NATIVE_USD_DEFAULTS: Record<string, number> = {
  ethereum: 3000,
  base: 3000,
  bsc: 600,
};

function nativeUsdFor(chain: string): number | null {
  switch (chain) {
    case 'ethereum': return config.MEMPOOL_NATIVE_USD_ETHEREUM ?? NATIVE_USD_DEFAULTS.ethereum;
    case 'base':     return config.MEMPOOL_NATIVE_USD_BASE ?? NATIVE_USD_DEFAULTS.base;
    case 'bsc':      return config.MEMPOOL_NATIVE_USD_BSC ?? NATIVE_USD_DEFAULTS.bsc;
    default:         return null;
  }
}

// Upper bound to fit numeric(20,4) without overflow (max ~10^16).
const USD_CAP = 1e15;

function normalizeHex(value: string | null | undefined): string {
  return (value || '').toLowerCase();
}

function parseWei(value: string): bigint | null {
  if (!value || value === '0x' || value === '0X') return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function selectorFromInput(input: string): string | null {
  const normalized = normalizeHex(input);
  if (!normalized.startsWith('0x') || normalized.length < 10) return null;
  return normalized.slice(0, 10);
}

function estimateNativeUsd(chain: string, nativeValueWei: bigint): number | null {
  const nativePrice = nativeUsdFor(chain);
  if (!nativePrice) return null;
  // Use BigInt math for the wei→native split so we keep precision for whale txs
  // (>2^53 wei). Number() only happens on the small native-units side.
  const weiPerNative = 10n ** 18n;
  const wholeNative = Number(nativeValueWei / weiPerNative);
  const fracNative = Number(nativeValueWei % weiPerNative) / Number(weiPerNative);
  const valueNative = wholeNative + fracNative;
  if (!Number.isFinite(valueNative) || valueNative <= 0) return null;
  const usd = valueNative * nativePrice;
  if (!Number.isFinite(usd)) return null;
  // Cap to numeric(20,4) ceiling — extreme upstream values must not poison the queue.
  return Math.min(usd, USD_CAP);
}

export function classifyPendingTx(
  tx: PendingMempoolTx,
  minValueUsd: number,
): MempoolAlertCandidate | null {
  const to = normalizeHex(tx.to);
  const selector = selectorFromInput(tx.input);
  const isRouter = !!(to && WATCHED_ROUTERS[tx.chain]?.has(to));
  const isSwapMethod = !!(selector && SWAP_SELECTORS.has(selector));

  const wei = parseWei(tx.value);
  // Parse failure: drop silently (malformed upstream).
  if (wei === null) return null;
  // Zero-value tx (ERC-20 swap or contract call with no native transfer): can't be
  // valued without token-amount decoding. Defer to Story 2.x. Log+skip per AC4.
  if (wei === 0n) {
    if (isSwapMethod) {
      // ERC-20 swap detected but value=0 — out of MVP scope (would need calldata decode).
      console.debug('[mempool] skip zero-value swap', { chain: tx.chain, hash: tx.hash, reason: 'erc20_swap_unsupported' });
    }
    return null;
  }

  const estimatedUsd = estimateNativeUsd(tx.chain, wei);
  if (!Number.isFinite(minValueUsd)) return null;
  if (estimatedUsd == null || estimatedUsd < minValueUsd) return null;

  // AC4 classification (resolved 2026-05-17 D2):
  //   router + swap selector  → sandwich_suspect (router-mediated swap, prime sandwich target)
  //   no router + swap selector → frontrun_suspect (pending swap with no known router context)
  //   router + no swap selector → unknown_large_tx (router call we don't recognize)
  //   else                    → unknown_large_tx
  let alertType: MempoolAlertType = 'unknown_large_tx';
  if (isRouter && isSwapMethod) {
    alertType = 'sandwich_suspect';
  } else if (isSwapMethod) {
    alertType = 'frontrun_suspect';
  } else if (isRouter) {
    // Router-only large tx (e.g. add-liquidity, multicall) — keep as large_swap signal.
    alertType = 'large_swap';
  }

  return {
    txHash: tx.hash.toLowerCase(),
    chain: tx.chain,
    routerAddress: isRouter ? to : null,
    methodSelector: selector,
    alertType,
    estimatedValueUsd: estimatedUsd,
    nativeValueWei: wei.toString(),
    tokenIn: null,
    tokenOut: null,
  };
}

// Coerce provider fields that may arrive as either hex strings or raw numbers.
function coerceHexish(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return '0x' + Math.trunc(v).toString(16);
  return null;
}

export function toPendingMempoolTx(input: {
  tx: Record<string, unknown>;
  chain: string;
}): PendingMempoolTx | null {
  const tx = input.tx ?? {};
  const hash = typeof tx.hash === 'string' ? tx.hash : null;
  const from = typeof tx.from === 'string' ? tx.from : null;
  const inputData = typeof tx.input === 'string' ? tx.input : '0x';
  const value = coerceHexish(tx.value) ?? '0x0';
  if (!hash || !from) return null;
  // Guard tx_hash length before downstream DB insert (varchar(100)).
  if (hash.length > 100) return null;

  return {
    hash,
    from,
    to: typeof tx.to === 'string' ? tx.to : null,
    input: inputData,
    value,
    chain: input.chain,
    gas: coerceHexish(tx.gas),
    chainId: coerceHexish(tx.chainId),
    gasPrice: coerceHexish(tx.gasPrice),
    maxFeePerGas: coerceHexish(tx.maxFeePerGas),
    maxPriorityFeePerGas: coerceHexish(tx.maxPriorityFeePerGas),
    raw: tx,
  };
}
