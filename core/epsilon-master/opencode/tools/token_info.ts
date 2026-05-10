import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";
import { sanitizeUpstreamErr } from "./lib/sanitize";

const TOKEN_TOOL_TIMEOUT_MS = 2000;

export default tool({
  description:
    "Fetch real-time token price, market cap, and 24h volume from CoinGecko via internal Epsilon services. " +
    "Use BEFORE answering token price questions — your training data is stale. " +
    "Pass the CoinGecko token ID (e.g. 'bitcoin', 'ethereum', 'solana') as slug. " +
    "Completes in <1.5s; falls back to cached data if upstream is slow.",
  args: {
    slug: tool.schema
      .string()
      .describe("CoinGecko token ID (lowercase, e.g. 'bitcoin', 'ethereum', 'solana', 'uniswap')"),
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
    if (!/^https?:\/\//.test(epsilonApiUrl)) {
      return JSON.stringify({ success: false, error: "EPSILON_API_URL must start with http:// or https://." }, null, 2);
    }

    const slug = args.slug?.trim().toLowerCase();
    if (!slug) {
      return JSON.stringify({ success: false, error: "slug is required" }, null, 2);
    }

    const baseUrl = epsilonApiUrl.replace(/\/+$/, "");
    const body: Record<string, unknown> = { slug };
    if (args.session_id) body.session_id = args.session_id;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/router/token-info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${epsilonToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TOKEN_TOOL_TIMEOUT_MS),
      });
    } catch (e) {
      return JSON.stringify({ success: false, error: `Network error: ${String(e)}` }, null, 2);
    }

    if (response.status === 402) {
      return JSON.stringify({ success: false, error: "Insufficient credits. Please top up to use token info." }, null, 2);
    }
    if (!response.ok) {
      const errBody = await response.text().catch(() => "(unreadable)");
      return JSON.stringify({ success: false, error: `Proxy error ${response.status}: ${sanitizeUpstreamErr(errBody)}` }, null, 2);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (e) {
      return JSON.stringify({ success: false, error: `Invalid JSON from proxy: ${String(e)}` }, null, 2);
    }

    return JSON.stringify(data, null, 2);
  },
});
