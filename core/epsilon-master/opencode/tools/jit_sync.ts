import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";

const JIT_TOOL_TIMEOUT_MS = 3000;
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

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
      source: 'live' | 'cache_fresh' | 'cache_stale';
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

export default tool({
  description:
    "Fetch real-time crypto protocol snapshot from DeFiLlama (TVL + chain data). " +
    "Use BEFORE answering crypto queries to ensure data is current — your training data is stale. " +
    "Returns formatted markdown snapshot ready to inject into your reasoning. " +
    "Completes in <1.5s; falls back to cached data if DeFiLlama is slow. " +
    "APY/yield data not yet available (planned in a future release). " +
    "Use protocol slug from defillama.com (e.g. 'uniswap', 'aave', 'curve-dex').",
  args: {
    protocol_slug: tool.schema
      .string()
      .describe("DeFiLlama protocol slug (lowercase, dashes — e.g. 'uniswap', 'aave-v3')"),
    chain: tool.schema
      .string()
      .optional()
      .describe("Filter by chain — 'ethereum', 'arbitrum', 'solana'. Omit for all chains."),
  },
  async execute(args, _context) {
    const epsilonToken = getEnv("EPSILON_TOKEN");
    const epsilonApiUrl = getEnv("EPSILON_API_URL");

    if (!epsilonToken) return "Error: EPSILON_TOKEN not set.";
    if (!epsilonApiUrl) return "Error: EPSILON_API_URL not set.";
    if (!/^https?:\/\//.test(epsilonApiUrl)) {
      return "Error: EPSILON_API_URL must start with http:// or https://.";
    }

    const slug = args.protocol_slug?.trim().toLowerCase();
    if (!slug) return JSON.stringify({ success: false, error: "protocol_slug is required" }, null, 2);
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

    const proxyEndpoint = `${epsilonApiUrl.replace(/\/+$/, "")}/v1/router/jit-sync`;

    const body: Record<string, unknown> = { protocol_slug: slug };
    const chainArg = args.chain?.trim();
    if (chainArg) body.chain = chainArg;

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

    return JSON.stringify(
      {
        ...data,
        response_time_ms,
      },
      null,
      2,
    );
  },
});
