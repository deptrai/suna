import { config } from '../../config';

const RPC_TIMEOUT_MS = 4000;
const ERC20_BALANCE_OF_SELECTOR = '0x70a08231'; // balanceOf(address)

// Per-chain RPC URL lookup — strictly backend-only, never forwarded to OpenCode.
export function getRpcUrlForChain(chain: string): string | null {
  switch (chain.toLowerCase()) {
    case 'ethereum': return config.ENTITY_WALLET_RPC_URL_ETHEREUM || null;
    case 'base': return config.ENTITY_WALLET_RPC_URL_BASE || null;
    case 'polygon': return config.ENTITY_WALLET_RPC_URL_POLYGON || null;
    case 'arbitrum': return config.ENTITY_WALLET_RPC_URL_ARBITRUM || null;
    case 'bsc': return config.ENTITY_WALLET_RPC_URL_BSC || null;
    default: return null;
  }
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result;
}

/** Verify ERC-20 token balance for a wallet via eth_call. Returns null if RPC not configured. */
export async function verifyErc20Balance(
  chain: string,
  tokenAddress: string,
  walletAddress: string,
): Promise<{ balanceHex: string; hasTokens: boolean } | null> {
  const rpcUrl = getRpcUrlForChain(chain);
  if (!rpcUrl) return null;

  // ABI-encode balanceOf(address) call data: selector + zero-padded address
  const paddedAddr = walletAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const callData = `${ERC20_BALANCE_OF_SELECTOR}${paddedAddr}`;

  const result = await rpcCall(rpcUrl, 'eth_call', [
    { to: tokenAddress, data: callData },
    'latest',
  ]);
  const balanceHex = typeof result === 'string' ? result : '0x0';
  const hasTokens = BigInt(balanceHex || '0x0') > 0n;
  return { balanceHex, hasTokens };
}

/** Fetch latest block number for a chain. Returns null if RPC not configured. */
export async function getLatestBlockNumber(chain: string): Promise<number | null> {
  const rpcUrl = getRpcUrlForChain(chain);
  if (!rpcUrl) return null;
  const result = await rpcCall(rpcUrl, 'eth_blockNumber', []);
  return typeof result === 'string' ? parseInt(result, 16) : null;
}
