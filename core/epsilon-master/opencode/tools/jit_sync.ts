import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";

const JIT_TOOL_TIMEOUT_MS = 3000;
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const EVM_ADDRESS = /^0x[a-f0-9]{40}$/;
const MAX_ADDRESS_LEN = 255;

type JitSyncProxyResponse =
  | {
      slug: string;
      name: string;
      success: true;
      snapshot: string;
      tvl_usd: number;
      tvl_change_24h_pct: number | null;
      apy_avg: number | null;
      chains: string[];
      stale: boolean;
      source: 'live' | 'cache_fresh' | 'cache_stale' | 'db_cache';
      fetched_at: string;
      cost: number;
    }
  | {
      slug: string;
      success: false;
      snapshot: string;
      error: string;
      stale: boolean;
      source: 'no_data';
      fetched_at: string;
      cost: number;
    };

interface OnChainItem {
  id: string;
  source: 'dune' | 'nansen';
  metricName: string;
  timestamp: string;
  walletAddress: string | null;
  tokenAddress: string | null;
}

interface OnChainResponse {
  success: boolean;
  items?: OnChainItem[];
  pagination?: { offset: number; limit: number; nextOffset: number | null };
  error?: string;
}

export default tool({
  description:
    "Fetch real-time crypto context from internal Epsilon services. " +
    "Two modes: " +
    "(1) Pass `protocol_slug` to fetch DeFiLlama protocol snapshot (TVL + chain data). " +
    "(2) Pass `address` (EVM 0x… or token/wallet identifier) to fetch pre-indexed on-chain " +
    "data from internal Dune/Nansen index — never calls external Dune/Nansen APIs directly. " +
    "Use BEFORE answering crypto queries to ensure data is current — your training data is stale. " +
    "Completes in <1.5s; falls back to cached data if upstream is slow. " +
    "For protocol slugs use defillama.com (e.g. 'uniswap', 'aave', 'curve-dex').",
  args: {
    protocol_slug: tool.schema
      .string()
      .optional()
      .describe("DeFiLlama protocol slug (lowercase, dashes — e.g. 'uniswap', 'aave-v3')"),
    chain: tool.schema
      .string()
      .optional()
      .describe("Filter by chain — 'ethereum', 'arbitrum', 'solana'. Omit for all chains."),
    address: tool.schema
      .string()
      .optional()
      .describe("Wallet or token address to look up in the on-chain index (Dune/Nansen). Pass instead of protocol_slug."),
  },
  async execute(args, _context) {
    const epsilonToken = getEnv("EPSILON_TOKEN");
    const epsilonApiUrl = getEnv("EPSILON_API_URL");

    if (!epsilonToken) return "Error: EPSILON_TOKEN not set.";
    if (!epsilonApiUrl) return "Error: EPSILON_API_URL not set.";
    if (!/^https?:\/\//.test(epsilonApiUrl)) {
      return "Error: EPSILON_API_URL must start with http:// or https://.";
    }

    const baseUrl = epsilonApiUrl.replace(/\/+$/, "");
    const address = args.address?.trim();

    if (address) {
      return executeOnChainLookup({ address, baseUrl, epsilonToken });
    }

    const slug = args.protocol_slug?.trim().toLowerCase();
    if (!slug) {
      return JSON.stringify(
        { success: false, error: "Either protocol_slug or address is required" },
        null,
        2,
      );
    }
    if (!SLUG_REGEX.test(slug)) {
      return JSON.stringify(
        {
          slug,
          success: false,
          error:
            "protocol_slug must be lowercase letters/numbers/dashes, no leading/trailing dash",
        },
        null,
        2,
      );
    }

    return executeProtocolSnapshot({ slug, chain: args.chain?.trim(), baseUrl, epsilonToken });
  },
});

async function executeProtocolSnapshot(opts: {
  slug: string;
  chain?: string;
  baseUrl: string;
  epsilonToken: string;
}): Promise<string> {
  const { slug, chain, baseUrl, epsilonToken } = opts;
  const proxyEndpoint = `${baseUrl}/v1/router/jit-sync`;
  const body: Record<string, unknown> = { protocol_slug: slug };
  if (chain) body.chain = chain;

  const startTime = Date.now();
  let response: Response;
  try {
    response = await fetch(proxyEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${epsilonToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(JIT_TOOL_TIMEOUT_MS),
    });
  } catch (e) {
    return JSON.stringify(
      { slug, success: false, error: `Network error: ${String(e)}` },
      null,
      2,
    );
  }

  if (response.status === 402) {
    return JSON.stringify(
      { slug, success: false, error: "Insufficient credits. Please top up to use JIT sync." },
      null,
      2,
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(unreadable)");
    return JSON.stringify(
      { slug, success: false, error: `Proxy error ${response.status}: ${errorBody.slice(0, 500)}` },
      null,
      2,
    );
  }

  let data: JitSyncProxyResponse;
  try {
    data = (await response.json()) as JitSyncProxyResponse;
  } catch (e) {
    return JSON.stringify(
      { slug, success: false, error: `Invalid JSON response from proxy: ${String(e)}` },
      null,
      2,
    );
  }

  const response_time_ms = Date.now() - startTime;
  return JSON.stringify({ ...data, response_time_ms }, null, 2);
}

async function executeOnChainLookup(opts: {
  address: string;
  baseUrl: string;
  epsilonToken: string;
}): Promise<string> {
  const { address, baseUrl, epsilonToken } = opts;
  if (address.length > MAX_ADDRESS_LEN) {
    return JSON.stringify(
      { address, success: false, error: `address must be ${MAX_ADDRESS_LEN} chars or less` },
      null,
      2,
    );
  }

  // EVM addresses are normalized to lowercase server-side, but the path is URL-encoded
  // here so non-EVM identifiers (Solana base58, Cosmos bech32) survive routing intact.
  const normalized = EVM_ADDRESS.test(address.toLowerCase()) ? address.toLowerCase() : address;
  const url = `${baseUrl}/v1/router/jit-sync/onchain/${encodeURIComponent(normalized)}`;
  const startTime = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${epsilonToken}` },
      signal: AbortSignal.timeout(JIT_TOOL_TIMEOUT_MS),
    });
  } catch (e) {
    return JSON.stringify(
      { address, success: false, error: `Network error: ${String(e)}` },
      null,
      2,
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(unreadable)");
    return JSON.stringify(
      {
        address,
        success: false,
        error: `Proxy error ${response.status}: ${errorBody.slice(0, 500)}`,
      },
      null,
      2,
    );
  }

  let data: OnChainResponse;
  try {
    data = (await response.json()) as OnChainResponse;
  } catch (e) {
    return JSON.stringify(
      { address, success: false, error: `Invalid JSON response: ${String(e)}` },
      null,
      2,
    );
  }

  const response_time_ms = Date.now() - startTime;
  return JSON.stringify({ address, ...data, response_time_ms }, null, 2);
}
