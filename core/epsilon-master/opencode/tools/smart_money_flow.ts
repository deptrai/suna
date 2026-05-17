/**
 * Smart Money Flow Tool (Story 2.3.1) — Tier 2 only.
 *
 * Provider boundary: calls ONLY the Chainlens internal API.
 * NEVER uses NANSEN_API_KEY — that key stays in the backend.
 *
 * Cache-first: returns cache_fresh (cost=0) when data is fresh.
 * Live refresh requires credits and is capped server-side.
 */

import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";
import { sanitizeUpstreamErr } from "./lib/sanitize";

const TOOL_TIMEOUT_MS = 10_000;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SUPPORTED_CHAINS = new Set(['ethereum', 'base', 'arbitrum', 'polygon', 'solana', 'bsc', 'avalanche', 'optimism']);

export default tool({
  description:
    "Analyze smart money and whale activity for a token using Nansen data (Tier 2 only). " +
    "Modes: 'token_god_mode' (full TGM analysis), 'smart_money_netflow' (net buy/sell flows), " +
    "'top_buyers' (top wallets buying), 'top_sellers' (top wallets selling), 'exchange_flows' (CEX in/outflows). " +
    "Returns risk_level, smart money signal, top buyers/sellers, exchange flows, and cache status. " +
    "cache_status='cache_fresh' means cost=0. 'queued' means data is being fetched — retry in 30s. " +
    "Use when user asks about smart money, whales, institutional buying/selling, or 'who is buying/selling X token?'.",
  args: {
    chain: tool.schema
      .string()
      .optional()
      .describe("Blockchain: 'ethereum', 'base', 'arbitrum', 'polygon', 'solana', 'bsc'. Default: ethereum"),
    token_address: tool.schema
      .string()
      .optional()
      .describe("Token contract address. Required for TGM modes (top_buyers, top_sellers, exchange_flows, token_god_mode)."),
    token_symbol: tool.schema
      .string()
      .optional()
      .describe("Token symbol hint (e.g. 'USDC'). Optional."),
    mode: tool.schema
      .string()
      .optional()
      .describe("'token_god_mode' (default), 'smart_money_netflow', 'top_buyers', 'top_sellers', 'exchange_flows'"),
    lookback_hours: tool.schema
      .string()
      .optional()
      .describe("Lookback window in hours (1–168). Default: 1"),
    limit: tool.schema
      .string()
      .optional()
      .describe("Max wallets to return (1–100). Default: 20"),
    session_id: tool.schema
      .string()
      .optional()
      .describe("Session ID for billing tracking"),
  },
  async execute(args, _context) {
    const epsilonToken = getEnv("EPSILON_TOKEN");
    const epsilonApiUrl = getEnv("EPSILON_API_URL");

    if (!epsilonToken) return JSON.stringify({ success: false, error: "EPSILON_TOKEN not set." }, null, 2);
    if (!epsilonApiUrl) return JSON.stringify({ success: false, error: "EPSILON_API_URL not set." }, null, 2);

    const chain = (args.chain?.trim().toLowerCase()) ?? 'ethereum';
    const token_address = args.token_address?.trim();
    const mode = (args.mode?.trim() ?? 'token_god_mode') as string;
    const lookback_hours = Math.min(168, Math.max(1, parseInt(args.lookback_hours ?? '1', 10) || 1));
    const limit = Math.min(100, Math.max(1, parseInt(args.limit ?? '20', 10) || 20));

    // Validate chain allowlist — prevent wasted calls for unsupported chains
    if (!SUPPORTED_CHAINS.has(chain)) {
      return JSON.stringify({ success: false, error: `Unsupported chain: ${chain}. Supported: ${[...SUPPORTED_CHAINS].join(', ')}` }, null, 2);
    }

    if (!token_address) {
      return JSON.stringify({ success: false, error: "token_address is required" }, null, 2);
    }

    // Validate address format (EVM or Solana)
    if (chain !== 'solana' && !EVM_ADDRESS.test(token_address)) {
      return JSON.stringify({ success: false, error: `Invalid EVM token address for chain ${chain}` }, null, 2);
    }
    if (chain === 'solana' && !SOLANA_ADDRESS.test(token_address)) {
      return JSON.stringify({ success: false, error: "Invalid Solana token address" }, null, 2);
    }

    const validModes = ['token_god_mode', 'smart_money_netflow', 'top_buyers', 'top_sellers', 'exchange_flows'];
    if (!validModes.includes(mode)) {
      return JSON.stringify({ success: false, error: `Invalid mode: ${mode}. Valid: ${validModes.join(', ')}` }, null, 2);
    }

    const body: Record<string, unknown> = {
      chain,
      token_address,
      mode,
      lookback_hours,
      limit,
    };
    if (args.token_symbol) body.token_symbol = args.token_symbol.trim().slice(0, 32);
    if (args.session_id) body.session_id = args.session_id.slice(0, 128);

    try {
      const res = await fetch(`${epsilonApiUrl}/router/smart-money-flow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${epsilonToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return JSON.stringify({ success: false, error: sanitizeUpstreamErr(`HTTP ${res.status}: ${errText}`) }, null, 2);
      }

      const data = await res.json();
      return JSON.stringify(data, null, 2);
    } catch (err: any) {
      return JSON.stringify({
        success: false,
        error: err?.name === "TimeoutError" ? "Request timed out" : sanitizeUpstreamErr(String(err)),
      }, null, 2);
    }
  },
});
