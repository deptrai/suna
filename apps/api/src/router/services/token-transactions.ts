import { config } from '../../config';
import type { EvmChain } from '@epsilon/shared';

const TOKEN_TRANSACTIONS_TIMEOUT_MS = 2000;

interface EtherscanConfig {
  baseUrl: string;
  apiKeyProp: 'ETHERSCAN_API_KEY' | 'ARBISCAN_API_KEY' | 'BASESCAN_API_KEY' | 'POLYGONSCAN_API_KEY';
  sourceName: string;
}

const ETHERSCAN_CHAIN_MAP: Partial<Record<EvmChain, EtherscanConfig>> = {
  ethereum: { baseUrl: 'https://api.etherscan.io', apiKeyProp: 'ETHERSCAN_API_KEY', sourceName: 'etherscan' },
  arbitrum: { baseUrl: 'https://api.arbiscan.io', apiKeyProp: 'ARBISCAN_API_KEY', sourceName: 'arbiscan' },
  base: { baseUrl: 'https://api.basescan.org', apiKeyProp: 'BASESCAN_API_KEY', sourceName: 'basescan' },
  polygon: { baseUrl: 'https://api.polygonscan.com', apiKeyProp: 'POLYGONSCAN_API_KEY', sourceName: 'polygonscan' },
};

// Blockscout instances as keyless fallback (Etherscan-compatible API)
const BLOCKSCOUT_CHAIN_MAP: Partial<Record<EvmChain, string>> = {
  ethereum: 'https://eth.blockscout.com',
  base: 'https://base.blockscout.com',
  arbitrum: 'https://arbitrum.blockscout.com',
  polygon: 'https://polygon.blockscout.com',
  optimism: 'https://optimism.blockscout.com',
};

// Etherscan/Blockscout messages indicating "no transactions" (legitimate empty state).
const EMPTY_RESULT_MESSAGES = new Set(['no transactions found', 'no results', 'no transactions']);

export interface TransactionEntry {
  hash: string;
  from: string;
  to: string;
  value: string;
  value_decimal: number;
  timestamp: string;
  block_number: string;
  gas_used: string;
  type: 'transfer';
}

export interface TokenTransactionsSnapshot {
  transactions: TransactionEntry[];
  chain: string;
  address: string;
  checked_at: string;
  source: string;
}

export async function fetchTokenTransactions(
  address: string,
  chain: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<TokenTransactionsSnapshot> {
  if (chain === 'solana' || chain === 'sol') {
    throw new Error('Solana token transactions require paid tier (planned post-MVP)');
  }
  const scanConfig = ETHERSCAN_CHAIN_MAP[chain as EvmChain];
  if (!scanConfig) {
    throw new Error(`Unsupported chain for transactions: ${chain}`);
  }

  const apiKey = config[scanConfig.apiKeyProp] || config.ETHERSCAN_API_KEY || '';
  const blockscoutBase = BLOCKSCOUT_CHAIN_MAP[chain as EvmChain];
  const useBlockscout = !apiKey && !!blockscoutBase;

  const limit = Math.min(options.limit ?? 50, 100);
  const baseUrl = useBlockscout ? blockscoutBase! : scanConfig.baseUrl;
  const safeAddr = encodeURIComponent(address);
  const url = `${baseUrl}/api?module=account&action=tokentx&contractaddress=${safeAddr}&page=1&offset=${limit}&sort=desc${apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : ''}`;
  const sourceName = useBlockscout ? 'blockscout' : scanConfig.sourceName;

  const resp = await fetch(url, {
    signal: options.signal ?? AbortSignal.timeout(TOKEN_TRANSACTIONS_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`${sourceName} API error: ${resp.status}`);
  }
  let body: { status: string; message: string; result: any };
  try {
    body = await resp.json() as { status: string; message: string; result: any };
  } catch {
    throw new Error(`${sourceName} API returned non-JSON response`);
  }
  // Etherscan/Blockscout returns status="0" on error OR when there are no transactions.
  // `result` may also be a string error message (e.g. "Max rate limit reached").
  const resultIsArr = Array.isArray(body.result);
  const resultStr = !resultIsArr ? String(body.result ?? '') : '';
  const messageNorm = (body.message ?? '').toLowerCase();
  if (body.status === '0' && !EMPTY_RESULT_MESSAGES.has(messageNorm)) {
    const msgRaw = body.message || resultStr;
    const msg = String(msgRaw);
    if (msg.includes('Invalid API Key') || msg.includes('Missing/Invalid')) {
      throw new Error(`${sourceName} API key invalid — check ETHERSCAN_API_KEY in .env`);
    }
    if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('max calls')) {
      throw new Error(`${sourceName} rate-limited — try again shortly`);
    }
    if (msg === 'NOTOK') {
      throw new Error(`${sourceName} API key required — add ETHERSCAN_API_KEY to .env (free at etherscan.io)`);
    }
    throw new Error(`${sourceName} API error: ${msg || 'unknown'}`);
  }
  // Legitimate empty-result (status="0" + known empty-message) → empty transactions list.
  if (body.status === '0' && EMPTY_RESULT_MESSAGES.has(messageNorm)) {
    return { transactions: [], chain, address, checked_at: new Date().toISOString(), source: sourceName };
  }
  // Defensive: if result is unexpectedly a non-array non-error shape, throw rather than silently empty
  if (!resultIsArr) {
    throw new Error(`${sourceName} API returned non-array result: ${resultStr.slice(0, 100)}`);
  }
  const txs = body.result as any[];

  const transactions: TransactionEntry[] = txs
    .map((tx) => {
      const ts = Number(tx.timeStamp);
      if (!Number.isFinite(ts) || ts <= 0) return null;
      return {
        hash: String(tx.hash ?? ''),
        from: String(tx.from ?? ''),
        to: String(tx.to ?? ''),
        value: String(tx.value ?? '0'),
        value_decimal: (() => {
          if (tx.tokenDecimal == null || tx.tokenDecimal === '') return 18;
          const d = Number(tx.tokenDecimal);
          return Number.isFinite(d) && d >= 0 && d <= 36 ? d : 18;
        })(),
        timestamp: new Date(ts * 1000).toISOString(),
        block_number: String(tx.blockNumber ?? ''),
        gas_used: String(tx.gasUsed ?? ''),
        type: 'transfer' as const,
      };
    })
    .filter((tx): tx is TransactionEntry => tx !== null);

  return {
    transactions,
    chain,
    address,
    checked_at: new Date().toISOString(),
    source: sourceName,
  };
}
