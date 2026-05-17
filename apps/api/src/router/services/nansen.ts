/**
 * Nansen Smart Money / Token God Mode service wrapper (Story 2.3.1).
 *
 * Provider boundary: this file is the ONLY place that calls Nansen API directly.
 * - Authentication: `apikey` header (lowercase), per Nansen docs.
 * - Rate limits: 20 req/sec, 300 req/min per API key.
 * - Credit costs (Pro plan): Smart Money endpoints = 5 credits/call; TGM = 1 credit/call.
 * - Free plan consumes 10x credits for these endpoint classes.
 * - NANSEN_API_KEY must never appear in logs, errors, or responses returned to callers.
 */

import { config } from '../../config';
import { logger } from '../../lib/logger';

// ─── Supported chains ────────────────────────────────────────────────────────
// Nansen endpoint support varies by chain. Chains not in this set return
// `unsupported_chain` without making a provider call.
const NANSEN_SUPPORTED_CHAINS = new Set([
  'ethereum', 'base', 'arbitrum', 'polygon', 'solana',
  'bsc', 'avalanche', 'optimism', 'fantom', 'celo', 'cronos', 'gnosis',
]);

const NANSEN_TIMEOUT_MS = 12_000;

// ─── Error types ─────────────────────────────────────────────────────────────

export class NansenUnconfiguredError extends Error {
  constructor() { super('Nansen API key not configured'); this.name = 'NansenUnconfiguredError'; }
}

export class NansenForbiddenError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? 'Nansen API key invalid or missing' : 'Nansen API key forbidden for this endpoint');
    this.name = 'NansenForbiddenError';
  }
}

export class NansenPaymentRequiredError extends Error {
  constructor() { super('Nansen credit quota exceeded or subscription inactive'); this.name = 'NansenPaymentRequiredError'; }
}

export class NansenRateLimitError extends Error {
  constructor() { super('Nansen rate limit exceeded (20 req/s or 300 req/min)'); this.name = 'NansenRateLimitError'; }
}

export class NansenProviderError extends Error {
  constructor(public status: number, message: string) {
    super(`Nansen provider error ${status}: ${message}`);
    this.name = 'NansenProviderError';
  }
}

export class NansenUnsupportedChainError extends Error {
  constructor(public chain: string) {
    super(`Chain "${chain}" is not supported by Nansen endpoints`);
    this.name = 'NansenUnsupportedChainError';
  }
}

// ─── Response shape guards ────────────────────────────────────────────────────

export interface NansenHoldingsRow {
  address?: string;
  label?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  balance?: string | number;
  balanceChange24h?: string | number;
  balanceUsd?: string | number;
  balanceChangeUsd24h?: string | number;
}

export interface NansenNetflowRow {
  tokenAddress?: string;
  tokenSymbol?: string;
  chain?: string;
  netflowUsd?: string | number;
  inflowUsd?: string | number;
  outflowUsd?: string | number;
  walletCount?: number;
  timeWindow?: string;
}

export interface NansenWhoBoughtSoldRow {
  address?: string;
  label?: string;
  boughtVolumeUsd?: string | number;
  soldVolumeUsd?: string | number;
  netVolumeUsd?: string | number;
  txCount?: number;
}

export interface NansenFlowRow {
  label?: string;
  inflowUsd?: string | number;
  outflowUsd?: string | number;
  netflowUsd?: string | number;
  walletCount?: number;
  traderCount?: number;
  timeWindow?: string;
}

export interface NansenHoldingsResponse {
  data?: NansenHoldingsRow[];
  nextCursor?: string;
}

export interface NansenNetflowResponse {
  data?: NansenNetflowRow[];
  nextCursor?: string;
}

export interface NansenWhoBoughtSoldResponse {
  data?: NansenWhoBoughtSoldRow[];
  nextCursor?: string;
}

export interface NansenFlowsResponse {
  data?: NansenFlowRow[];
  nextCursor?: string;
}

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function nansenPost<T>(endpoint: string, body: unknown): Promise<T> {
  const apiKey = config.NANSEN_API_KEY;
  if (!apiKey) throw new NansenUnconfiguredError();

  const baseUrl = config.NANSEN_API_BASE_URL;
  const url = `${baseUrl}${endpoint}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apikey': apiKey, // lowercase per Nansen authentication docs
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(NANSEN_TIMEOUT_MS),
    });
  } catch (err: any) {
    // Sanitize: never expose URL or key in thrown message
    throw new NansenProviderError(0, err?.name === 'TimeoutError' ? 'Request timed out' : 'Network error');
  }

  if (res.status === 401 || res.status === 403) {
    throw new NansenForbiddenError(res.status as 401 | 403);
  }
  if (res.status === 402) {
    throw new NansenPaymentRequiredError();
  }
  if (res.status === 429) {
    throw new NansenRateLimitError();
  }
  if (!res.ok) {
    // Sanitize raw body — do not propagate potentially sensitive fields
    throw new NansenProviderError(res.status, `HTTP ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new NansenProviderError(res.status, 'Invalid JSON response');
  }

  if (typeof json !== 'object' || json === null) {
    throw new NansenProviderError(res.status, 'Unexpected response shape');
  }

  return json as T;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Aggregated smart money holdings and 24h balance changes.
 * Nansen credit cost: 5 credits/call (Pro plan).
 */
export async function fetchSmartMoneyHoldings(
  chains: string[],
  filters?: { tokenAddress?: string; tokenSymbol?: string },
  pagination?: { limit?: number; cursor?: string },
): Promise<NansenHoldingsResponse> {
  for (const chain of chains) {
    if (!NANSEN_SUPPORTED_CHAINS.has(chain)) throw new NansenUnsupportedChainError(chain);
  }
  const body: Record<string, unknown> = { chains };
  if (filters?.tokenAddress) body.tokenAddress = filters.tokenAddress;
  if (filters?.tokenSymbol) body.tokenSymbol = filters.tokenSymbol;
  if (pagination?.limit) body.limit = pagination.limit;
  if (pagination?.cursor) body.cursor = pagination.cursor;

  logger.info('[nansen] fetchSmartMoneyHoldings', { chains, hasToken: !!filters?.tokenAddress });
  return nansenPost<NansenHoldingsResponse>('/smart-money/holdings', body);
}

/**
 * Smart Money token net flows.
 * Nansen credit cost: 5 credits/call (Pro plan).
 */
export async function fetchSmartMoneyNetflow(
  chains: string[],
  filters?: { tokenAddress?: string; timeWindow?: string },
  pagination?: { limit?: number; cursor?: string },
): Promise<NansenNetflowResponse> {
  for (const chain of chains) {
    if (!NANSEN_SUPPORTED_CHAINS.has(chain)) throw new NansenUnsupportedChainError(chain);
  }
  const body: Record<string, unknown> = { chains };
  if (filters?.tokenAddress) body.tokenAddress = filters.tokenAddress;
  if (filters?.timeWindow) body.timeWindow = filters.timeWindow;
  if (pagination?.limit) body.limit = pagination.limit;
  if (pagination?.cursor) body.cursor = pagination.cursor;

  logger.info('[nansen] fetchSmartMoneyNetflow', { chains, hasToken: !!filters?.tokenAddress });
  return nansenPost<NansenNetflowResponse>('/smart-money/netflow', body);
}

/**
 * Token God Mode — top buyers or sellers over a date range.
 * Nansen credit cost: 1 credit/call (Pro plan).
 */
export async function fetchTgmWhoBoughtSold(
  chain: string,
  tokenAddress: string,
  buyOrSell: 'buy' | 'sell',
  dateRange: { from: string; to: string },
  pagination?: { limit?: number; cursor?: string },
  filters?: { minVolumeUsd?: number },
): Promise<NansenWhoBoughtSoldResponse> {
  if (!NANSEN_SUPPORTED_CHAINS.has(chain)) throw new NansenUnsupportedChainError(chain);
  const body: Record<string, unknown> = {
    chain,
    tokenAddress,
    type: buyOrSell,
    from: dateRange.from,
    to: dateRange.to,
  };
  if (pagination?.limit) body.limit = pagination.limit;
  if (pagination?.cursor) body.cursor = pagination.cursor;
  if (filters?.minVolumeUsd) body.minVolumeUsd = filters.minVolumeUsd;

  logger.info('[nansen] fetchTgmWhoBoughtSold', { chain, tokenAddress, buyOrSell });
  return nansenPost<NansenWhoBoughtSoldResponse>('/tgm/who-bought-sold', body);
}

/**
 * Token God Mode — token flow trends by label (smart_money, exchange, etc.).
 * Nansen credit cost: 1 credit/call (Pro plan).
 */
export async function fetchTgmFlows(
  chain: string,
  tokenAddress: string,
  label: string,
  dateRange: { from: string; to: string },
  pagination?: { limit?: number; cursor?: string },
  filters?: Record<string, unknown>,
): Promise<NansenFlowsResponse> {
  if (!NANSEN_SUPPORTED_CHAINS.has(chain)) throw new NansenUnsupportedChainError(chain);
  const body: Record<string, unknown> = {
    chain,
    tokenAddress,
    label,
    from: dateRange.from,
    to: dateRange.to,
    ...filters,
  };
  if (pagination?.limit) body.limit = pagination.limit;
  if (pagination?.cursor) body.cursor = pagination.cursor;

  logger.info('[nansen] fetchTgmFlows', { chain, tokenAddress, label });
  return nansenPost<NansenFlowsResponse>('/tgm/flows', body);
}

/** Returns true only if a Nansen API key is configured and the chain is supported. */
export function canCallNansen(chain?: string): boolean {
  if (!config.NANSEN_API_KEY) return false;
  if (chain && !NANSEN_SUPPORTED_CHAINS.has(chain)) return false;
  return true;
}

export { NANSEN_SUPPORTED_CHAINS };
