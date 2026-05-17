import { and, desc, eq } from 'drizzle-orm';
import { onchainFactChecks, projectWalletWatchlist } from '@epsilon/db';
import { db } from '../../shared/db';
import { config } from '../../config';
import { logger } from '../../lib/logger';

type FactCheckStatus =
  | 'passed'
  | 'flagged'
  | 'insufficient_wallet_context'
  | 'provider_unavailable'
  | 'skipped';

type ArticleSentiment = 'positive' | 'neutral' | 'negative' | 'unknown';
type Severity = 'low' | 'medium' | 'high' | 'critical';

type WalletRole = 'dev' | 'treasury' | 'team' | 'foundation' | 'market_maker' | 'exchange' | 'unknown';

interface WatchWallet {
  walletAddress: string;
  walletRole: WalletRole;
  label: string | null;
}

export interface WalletTransferMetrics {
  walletAddress: string;
  walletRole: WalletRole;
  label: string | null;
  outgoingRaw: bigint;
  incomingRaw: bigint;
  netOutflowRaw: bigint;
  currentBalanceRaw: bigint | null;
  previousBalanceRaw: bigint | null;
  walletOutflowPct: number | null;
  transferCount: number;
  basis: 'full' | 'transfer_only';
}

interface RiskFactor {
  code: string;
  label: string;
  severity: Severity;
}

export interface OnchainFactCheckResult {
  status: FactCheckStatus;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical' | 'alpha';
  riskFactors: RiskFactor[];
  netOutflowPct: number | null;
  largestWalletOutflowPct: number | null;
  walletsChecked: number;
  transferCount: number;
  source: 'quicknode' | 'etherscan' | 'blockscout' | 'mixed' | 'db_cache';
  checkedAt: string;
  evidence: Record<string, unknown>;
}

export interface OnchainFactCheckInput {
  chain: string;
  tokenAddress: string;
  tokenSymbol?: string;
  discoverFeedId?: string;
  articleTitle?: string;
  articleSentiment?: ArticleSentiment;
  forceRefresh?: boolean;
}

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ROLE_SET = new Set<WalletRole>(['dev', 'treasury', 'team', 'foundation', 'market_maker', 'exchange', 'unknown']);
const FACT_CHECK_CACHE_MS = Math.max(config.ONCHAIN_FACT_CHECK_LOOKBACK_HOURS, 1) * 60 * 60 * 1000;
const ETHERSCAN_BASE_URLS: Record<string, string> = {
  ethereum: 'https://api.etherscan.io',
  base: 'https://api.basescan.org',
  arbitrum: 'https://api.arbiscan.io',
  polygon: 'https://api.polygonscan.com',
};
function getEtherscanApiKey(chain: string): string {
  if (chain === 'base') return config.BASESCAN_API_KEY || config.ETHERSCAN_API_KEY || '';
  if (chain === 'arbitrum') return config.ARBISCAN_API_KEY || config.ETHERSCAN_API_KEY || '';
  if (chain === 'polygon') return config.POLYGONSCAN_API_KEY || config.ETHERSCAN_API_KEY || '';
  return config.ETHERSCAN_API_KEY || '';
}
const BLOCKSCOUT_CHAIN_MAP: Record<string, string> = {
  ethereum: 'https://eth.blockscout.com',
  base: 'https://base.blockscout.com',
  arbitrum: 'https://arbitrum.blockscout.com',
  polygon: 'https://polygon.blockscout.com',
};

const AVG_BLOCK_SECONDS: Record<string, number> = {
  ethereum: 12,
  base: 2,
  arbitrum: 1,
  polygon: 2,
};

function toLowerAddress(addr: string): string {
  return addr.toLowerCase();
}

function rpcUrlForChain(chain: string): string {
  const lower = chain.toLowerCase();
  if (lower === 'ethereum') return config.ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM;
  if (lower === 'base') return config.ONCHAIN_FACT_CHECK_RPC_URL_BASE;
  if (lower === 'polygon') return config.ONCHAIN_FACT_CHECK_RPC_URL_POLYGON;
  if (lower === 'arbitrum') return config.ONCHAIN_FACT_CHECK_RPC_URL_ARBITRUM;
  return '';
}

function sanitizeProviderError(input: unknown): string {
  const raw = input instanceof Error ? input.message : String(input);
  return raw.slice(0, 280).replace(config.DUNE_API_KEY || '__none__', '[redacted]');
}

function topicAddress(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

function parseHexBigInt(hex: string | undefined | null): bigint {
  if (!hex || !hex.startsWith('0x')) return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

function parseDataBigInt(data: string | undefined | null): bigint {
  if (!data || !data.startsWith('0x')) return 0n;
  try {
    return BigInt(data);
  } catch {
    return 0n;
  }
}

function pct(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) return null;
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return (n / d) * 100;
}

function walletRole(value: string | null): WalletRole {
  if (!value) return 'unknown';
  const lower = value.toLowerCase() as WalletRole;
  return ROLE_SET.has(lower) ? lower : 'unknown';
}

function promotionalSentiment(title?: string, sentiment?: ArticleSentiment): ArticleSentiment {
  if (sentiment) return sentiment;
  const text = (title ?? '').toLowerCase();
  if (!text) return 'unknown';
  if (/(partnership|listing|launch|funding|mainnet|integration|exchange listing)/.test(text)) return 'positive';
  return 'unknown';
}

async function jsonRpc<T>(chain: string, method: string, params: unknown[]): Promise<T> {
  const rpc = rpcUrlForChain(chain);
  if (!rpc) throw new Error(`Missing QuickNode RPC URL for chain ${chain}`);
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`QuickNode ${method} ${res.status}`);
  }
  const body = await res.json() as { result?: T; error?: { message?: string } };
  if (body.error) {
    throw new Error(`QuickNode ${method}: ${body.error.message ?? 'unknown error'}`);
  }
  if (body.result == null) throw new Error(`QuickNode ${method}: missing result`);
  return body.result;
}

async function getQuickNodeMetrics(
  chain: string,
  tokenAddress: string,
  wallet: WatchWallet,
  lookbackHours: number,
): Promise<WalletTransferMetrics> {
  const latest = await jsonRpc<string>(chain, 'eth_blockNumber', []);
  const latestBlock = Number(parseHexBigInt(latest));
  const avgBlockSec = AVG_BLOCK_SECONDS[chain] ?? 12;
  const lookbackBlocks = Math.max(1, Math.floor((lookbackHours * 3600) / avgBlockSec));
  const fromBlock = Math.max(0, latestBlock - lookbackBlocks);

  const baseFilter = {
    address: tokenAddress,
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: 'latest',
    topics: [TRANSFER_TOPIC],
  };

  const outgoingLogs = await jsonRpc<Array<{ data?: string }>>(chain, 'eth_getLogs', [
    { ...baseFilter, topics: [TRANSFER_TOPIC, topicAddress(wallet.walletAddress)] },
  ]);
  const incomingLogs = await jsonRpc<Array<{ data?: string }>>(chain, 'eth_getLogs', [
    { ...baseFilter, topics: [TRANSFER_TOPIC, null, topicAddress(wallet.walletAddress)] },
  ]);

  const outgoingSlice = outgoingLogs.slice(0, Math.max(config.ONCHAIN_FACT_CHECK_MAX_TRANSFERS_PER_WALLET, 1));
  const incomingSlice = incomingLogs.slice(0, Math.max(config.ONCHAIN_FACT_CHECK_MAX_TRANSFERS_PER_WALLET, 1));
  const outgoingRaw = outgoingSlice.reduce((acc, log) => acc + parseDataBigInt(log.data), 0n);
  const incomingRaw = incomingSlice.reduce((acc, log) => acc + parseDataBigInt(log.data), 0n);
  const netOutflowRaw = outgoingRaw - incomingRaw;

  const walletHex = wallet.walletAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const balanceCallData = `0x70a08231${walletHex}`;
  let currentBalanceRaw: bigint | null = null;
  try {
    const current = await jsonRpc<string>(chain, 'eth_call', [{ to: tokenAddress, data: balanceCallData }, 'latest']);
    currentBalanceRaw = parseHexBigInt(current);
  } catch {
    currentBalanceRaw = null;
  }

  const previousBalanceRaw = currentBalanceRaw != null ? currentBalanceRaw + netOutflowRaw : null;
  const walletOutflowPct = previousBalanceRaw != null && previousBalanceRaw > 0n
    ? pct(netOutflowRaw > 0n ? netOutflowRaw : 0n, previousBalanceRaw)
    : null;

  return {
    walletAddress: wallet.walletAddress,
    walletRole: wallet.walletRole,
    label: wallet.label,
    outgoingRaw,
    incomingRaw,
    netOutflowRaw,
    currentBalanceRaw,
    previousBalanceRaw,
    walletOutflowPct,
    transferCount: outgoingSlice.length + incomingSlice.length,
    basis: previousBalanceRaw == null ? 'transfer_only' : 'full',
  };
}

async function getEtherscanMetrics(
  chain: string,
  tokenAddress: string,
  wallet: WatchWallet,
  lookbackHours: number,
): Promise<WalletTransferMetrics> {
  const baseUrl = ETHERSCAN_BASE_URLS[chain];
  const apiKey = getEtherscanApiKey(chain);
  if (!baseUrl || !apiKey) throw new Error(`Etherscan key missing for chain ${chain}`);
  const lookbackFrom = Date.now() - lookbackHours * 3600 * 1000;
  const url = `${baseUrl}/api?module=account&action=tokentx&contractaddress=${encodeURIComponent(tokenAddress)}&address=${encodeURIComponent(wallet.walletAddress)}&page=1&offset=${Math.max(config.ONCHAIN_FACT_CHECK_MAX_TRANSFERS_PER_WALLET, 1)}&sort=desc&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const body = await res.json() as { status?: string; result?: Array<Record<string, string>>; message?: string };
  if (body.status === '0' && !Array.isArray(body.result)) throw new Error(`Etherscan error: ${body.message ?? 'unknown'}`);
  const rows = Array.isArray(body.result) ? body.result : [];
  const filtered = rows.filter((r) => {
    const ts = Number(r.timeStamp ?? '0') * 1000;
    return Number.isFinite(ts) && ts >= lookbackFrom;
  });
  let outgoingRaw = 0n;
  let incomingRaw = 0n;
  for (const row of filtered) {
    const val = BigInt(row.value ?? '0');
    if ((row.from ?? '').toLowerCase() === wallet.walletAddress.toLowerCase()) outgoingRaw += val;
    if ((row.to ?? '').toLowerCase() === wallet.walletAddress.toLowerCase()) incomingRaw += val;
  }
  const netOutflowRaw = outgoingRaw - incomingRaw;
  return {
    walletAddress: wallet.walletAddress,
    walletRole: wallet.walletRole,
    label: wallet.label,
    outgoingRaw,
    incomingRaw,
    netOutflowRaw,
    currentBalanceRaw: null,
    previousBalanceRaw: null,
    walletOutflowPct: null,
    transferCount: filtered.length,
    basis: 'transfer_only',
  };
}

async function getBlockscoutMetrics(
  chain: string,
  tokenAddress: string,
  wallet: WatchWallet,
  lookbackHours: number,
): Promise<WalletTransferMetrics> {
  const base = BLOCKSCOUT_CHAIN_MAP[chain];
  if (!base) throw new Error(`Blockscout unsupported chain ${chain}`);
  const lookbackFrom = Date.now() - lookbackHours * 3600 * 1000;
  const url = `${base}/api?module=account&action=tokentx&contractaddress=${encodeURIComponent(tokenAddress)}&address=${encodeURIComponent(wallet.walletAddress)}&page=1&offset=${Math.max(config.ONCHAIN_FACT_CHECK_MAX_TRANSFERS_PER_WALLET, 1)}&sort=desc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}`);
  const body = await res.json() as { result?: Array<Record<string, string>> };
  const rows = Array.isArray(body.result) ? body.result : [];
  const filtered = rows.filter((r) => {
    const ts = Number(r.timeStamp ?? '0') * 1000;
    return Number.isFinite(ts) && ts >= lookbackFrom;
  });
  let outgoingRaw = 0n;
  let incomingRaw = 0n;
  for (const row of filtered) {
    const val = BigInt(row.value ?? '0');
    if ((row.from ?? '').toLowerCase() === wallet.walletAddress.toLowerCase()) outgoingRaw += val;
    if ((row.to ?? '').toLowerCase() === wallet.walletAddress.toLowerCase()) incomingRaw += val;
  }
  const netOutflowRaw = outgoingRaw - incomingRaw;
  return {
    walletAddress: wallet.walletAddress,
    walletRole: wallet.walletRole,
    label: wallet.label,
    outgoingRaw,
    incomingRaw,
    netOutflowRaw,
    currentBalanceRaw: null,
    previousBalanceRaw: null,
    walletOutflowPct: null,
    transferCount: filtered.length,
    basis: 'transfer_only',
  };
}

export function computeRiskForWallets(
  articleSentiment: ArticleSentiment,
  walletMetrics: WalletTransferMetrics[],
): Pick<OnchainFactCheckResult, 'status' | 'riskLevel' | 'riskFactors' | 'netOutflowPct' | 'largestWalletOutflowPct' | 'transferCount' | 'walletsChecked' | 'evidence'> {
  const walletsChecked = walletMetrics.length;
  const transferCount = walletMetrics.reduce((acc, w) => acc + w.transferCount, 0);
  const includedRoles = new Set(['dev', 'treasury', 'team', 'foundation']);
  const scoped = walletMetrics.filter((w) => includedRoles.has(w.walletRole));
  const totalNetOutflow = scoped.reduce((acc, w) => acc + (w.netOutflowRaw > 0n ? w.netOutflowRaw : 0n), 0n);
  const totalPreviousKnown = scoped.reduce((acc, w) => acc + (w.previousBalanceRaw && w.previousBalanceRaw > 0n ? w.previousBalanceRaw : 0n), 0n);
  const netOutflowPct = totalPreviousKnown > 0n ? pct(totalNetOutflow, totalPreviousKnown) : null;
  const largestWalletOutflowPct = scoped.reduce<number | null>((max, w) => {
    if (w.walletOutflowPct == null) return max;
    if (max == null) return w.walletOutflowPct;
    return w.walletOutflowPct > max ? w.walletOutflowPct : max;
  }, null);
  const transferOnlyCount = walletMetrics.filter((w) => w.basis === 'transfer_only').length;

  const riskFactors: RiskFactor[] = [];
  let status: FactCheckStatus = 'passed';
  let riskLevel: OnchainFactCheckResult['riskLevel'] = 'none';
  if (articleSentiment === 'positive' && netOutflowPct != null && netOutflowPct > config.ONCHAIN_FACT_CHECK_DUMP_THRESHOLD_PCT) {
    status = 'flagged';
    riskLevel = 'high';
    riskFactors.push({
      code: 'dev_wallet_dump_gt_threshold',
      label: 'High Risk: Insider Selling Detected',
      severity: 'high',
    });
  }
  if (transferOnlyCount > 0) {
    riskFactors.push({
      code: 'transfer_only_confidence',
      label: 'Some wallets could only be evaluated from transfer history',
      severity: 'medium',
    });
    if (status === 'flagged') {
      riskLevel = 'medium';
    } else if (riskLevel === 'none') {
      riskLevel = 'low';
    }
  }

  return {
    status,
    riskLevel,
    riskFactors,
    netOutflowPct,
    largestWalletOutflowPct,
    transferCount,
    walletsChecked,
    evidence: {
      lookback_hours: config.ONCHAIN_FACT_CHECK_LOOKBACK_HOURS,
      threshold_pct: config.ONCHAIN_FACT_CHECK_DUMP_THRESHOLD_PCT,
      wallets: walletMetrics.map((w) => ({
        wallet_address: w.walletAddress,
        wallet_role: w.walletRole,
        label: w.label,
        transfer_count: w.transferCount,
        basis: w.basis,
        wallet_outflow_pct: w.walletOutflowPct,
      })),
      missing_inputs: transferOnlyCount > 0 ? ['current_balance_unavailable'] : [],
      confidence: transferOnlyCount > 0 ? 0.6 : 0.9,
    },
  };
}

async function loadWatchlist(chain: string, tokenAddress: string): Promise<WatchWallet[]> {
  const rows = await db
    .select({
      walletAddress: projectWalletWatchlist.walletAddress,
      walletRole: projectWalletWatchlist.walletRole,
      label: projectWalletWatchlist.label,
    })
    .from(projectWalletWatchlist)
    .where(and(
      eq(projectWalletWatchlist.chain, chain),
      eq(projectWalletWatchlist.tokenAddress, tokenAddress),
      eq(projectWalletWatchlist.active, true),
    ))
    .limit(Math.max(config.ONCHAIN_FACT_CHECK_MAX_WALLETS_PER_TOKEN, 1));
  return rows.map((r) => ({
    walletAddress: toLowerAddress(r.walletAddress),
    walletRole: walletRole(r.walletRole),
    label: r.label,
  }));
}

export async function getLatestFactCheck(chain: string, tokenAddress: string): Promise<(typeof onchainFactChecks.$inferSelect) | null> {
  const [row] = await db
    .select()
    .from(onchainFactChecks)
    .where(and(
      eq(onchainFactChecks.chain, chain),
      eq(onchainFactChecks.tokenAddress, tokenAddress),
    ))
    .orderBy(desc(onchainFactChecks.checkedAt))
    .limit(1);
  return row ?? null;
}

export async function runOnchainFactCheck(input: OnchainFactCheckInput): Promise<OnchainFactCheckResult> {
  const chain = input.chain.toLowerCase();
  const tokenAddress = input.tokenAddress.toLowerCase();
  const sentiment = promotionalSentiment(input.articleTitle, input.articleSentiment);
  const watched = await loadWatchlist(chain, tokenAddress);
  const nowIso = new Date().toISOString();

  if (watched.length === 0) {
    return {
      status: 'insufficient_wallet_context',
      riskLevel: 'none',
      riskFactors: [{ code: 'insufficient_wallet_context', label: 'No watched project wallets configured', severity: 'low' }],
      netOutflowPct: null,
      largestWalletOutflowPct: null,
      walletsChecked: 0,
      transferCount: 0,
      source: 'db_cache',
      checkedAt: nowIso,
      evidence: {
        lookback_hours: config.ONCHAIN_FACT_CHECK_LOOKBACK_HOURS,
        threshold_pct: config.ONCHAIN_FACT_CHECK_DUMP_THRESHOLD_PCT,
        missing_inputs: ['project_wallet_watchlist'],
      },
    };
  }

  let walletMetrics: WalletTransferMetrics[] = [];
  const _cfgProvider = config.ONCHAIN_FACT_CHECK_PROVIDER;
  let source: OnchainFactCheckResult['source'] = _cfgProvider === 'etherscan' ? 'etherscan' : _cfgProvider === 'blockscout' ? 'blockscout' : 'quicknode';
  let lastErr: string | null = null;
  for (const wallet of watched) {
    try {
      if (config.ONCHAIN_FACT_CHECK_PROVIDER === 'quicknode') {
        walletMetrics.push(await getQuickNodeMetrics(chain, tokenAddress, wallet, config.ONCHAIN_FACT_CHECK_LOOKBACK_HOURS));
        source = source === 'quicknode' ? 'quicknode' : 'mixed';
      } else if (config.ONCHAIN_FACT_CHECK_PROVIDER === 'etherscan') {
        walletMetrics.push(await getEtherscanMetrics(chain, tokenAddress, wallet, config.ONCHAIN_FACT_CHECK_LOOKBACK_HOURS));
        source = source === 'etherscan' ? 'etherscan' : 'mixed';
      } else {
        walletMetrics.push(await getBlockscoutMetrics(chain, tokenAddress, wallet, config.ONCHAIN_FACT_CHECK_LOOKBACK_HOURS));
        source = source === 'blockscout' ? 'blockscout' : 'mixed';
      }
    } catch (err) {
      lastErr = sanitizeProviderError(err);
      if (config.ONCHAIN_FACT_CHECK_PROVIDER !== 'quicknode') continue;
      try {
        walletMetrics.push(await getEtherscanMetrics(chain, tokenAddress, wallet, config.ONCHAIN_FACT_CHECK_LOOKBACK_HOURS));
        source = source === 'quicknode' ? 'mixed' : source;
      } catch {
        try {
          walletMetrics.push(await getBlockscoutMetrics(chain, tokenAddress, wallet, config.ONCHAIN_FACT_CHECK_LOOKBACK_HOURS));
          source = source === 'quicknode' ? 'mixed' : source;
        } catch {
          // swallow and evaluate remaining wallets
        }
      }
    }
  }

  if (walletMetrics.length === 0) {
    return {
      status: 'provider_unavailable',
      riskLevel: 'low',
      riskFactors: [{ code: 'provider_rate_limited', label: 'Provider unavailable for all watched wallets', severity: 'medium' }],
      netOutflowPct: null,
      largestWalletOutflowPct: null,
      walletsChecked: watched.length,
      transferCount: 0,
      source: 'quicknode',
      checkedAt: nowIso,
      evidence: {
        lookback_hours: config.ONCHAIN_FACT_CHECK_LOOKBACK_HOURS,
        threshold_pct: config.ONCHAIN_FACT_CHECK_DUMP_THRESHOLD_PCT,
        provider_error: lastErr,
      },
    };
  }

  const scored = computeRiskForWallets(sentiment, walletMetrics);
  return {
    ...scored,
    source,
    checkedAt: nowIso,
  };
}

export async function cacheFirstOnchainFactCheck(input: OnchainFactCheckInput): Promise<{ cacheStatus: 'cache_fresh' | 'live'; result: OnchainFactCheckResult }> {
  const chain = input.chain.toLowerCase();
  const tokenAddress = input.tokenAddress.toLowerCase();
  if (!input.forceRefresh) {
    const latest = await getLatestFactCheck(chain, tokenAddress);
    if (latest && latest.checkedAt && Date.now() - latest.checkedAt.getTime() <= FACT_CHECK_CACHE_MS) {
      return {
        cacheStatus: 'cache_fresh',
        result: {
          status: latest.status as FactCheckStatus,
          riskLevel: latest.riskLevel,
          riskFactors: Array.isArray(latest.riskFactors)
            ? latest.riskFactors
                .map((rf) => ({
                  code: typeof (rf as Record<string, unknown>).code === 'string' ? (rf as Record<string, unknown>).code as string : 'unknown',
                  label: typeof (rf as Record<string, unknown>).label === 'string' ? (rf as Record<string, unknown>).label as string : 'Unknown risk factor',
                  severity: ((): Severity => {
                    const value = (rf as Record<string, unknown>).severity;
                    if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
                    return 'low';
                  })(),
                }))
            : [],
          netOutflowPct: latest.netOutflowPct != null ? Number(latest.netOutflowPct) : null,
          largestWalletOutflowPct: latest.largestWalletOutflowPct != null ? Number(latest.largestWalletOutflowPct) : null,
          walletsChecked: latest.walletsChecked,
          transferCount: latest.transferCount,
          source: 'db_cache',
          checkedAt: latest.checkedAt.toISOString(),
          evidence: (latest.evidence ?? {}) as Record<string, unknown>,
        },
      };
    }
  }

  const result = await runOnchainFactCheck(input);
  await db.insert(onchainFactChecks).values({
    discoverFeedId: input.discoverFeedId ?? null,
    chain,
    tokenAddress,
    tokenSymbol: input.tokenSymbol ?? null,
    articleTitle: input.articleTitle ?? null,
    articleSentiment: input.articleSentiment ?? 'unknown',
    status: result.status,
    walletsChecked: result.walletsChecked,
    netOutflowPct: result.netOutflowPct != null ? String(result.netOutflowPct) : null,
    largestWalletOutflowPct: result.largestWalletOutflowPct != null ? String(result.largestWalletOutflowPct) : null,
    transferCount: result.transferCount,
    riskLevel: result.riskLevel,
    riskFactors: result.riskFactors as unknown as Record<string, unknown>[],
    evidence: {
      ...result.evidence,
      provider_source: result.source,
      provider: config.ONCHAIN_FACT_CHECK_PROVIDER,
    },
    checkedAt: new Date(result.checkedAt),
    updatedAt: new Date(),
  });

  return { cacheStatus: 'live', result };
}

export function extractReliableTokenAddress(text?: string): string | null {
  if (!text) return null;
  const m = text.match(/\b0x[a-fA-F0-9]{40}\b/);
  return m ? m[0].toLowerCase() : null;
}

export function isPromotionalArticle(text?: string): boolean {
  if (!text) return false;
  return /(partnership|listing|launch|funding|mainnet|integration|exchange listing)/i.test(text);
}

export function canStartFactCheckWorker(prefix = '[onchain-fact-check]'): boolean {
  if (!config.ONCHAIN_FACT_CHECK_WORKER_ENABLED) {
    logger.info(`${prefix} worker disabled (ONCHAIN_FACT_CHECK_WORKER_ENABLED=false)`);
    return false;
  }
  const chains = config.ONCHAIN_FACT_CHECK_CHAINS.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  const configured = chains.filter((chain) => Boolean(rpcUrlForChain(chain)));
  if (configured.length === 0 && config.ONCHAIN_FACT_CHECK_PROVIDER === 'quicknode') {
    logger.info(`${prefix} startup skipped — no ONCHAIN_FACT_CHECK_RPC_URL_<CHAIN> configured for ONCHAIN_FACT_CHECK_CHAINS`, {
      chains,
      provider: config.ONCHAIN_FACT_CHECK_PROVIDER,
    });
    return false;
  }
  return true;
}
