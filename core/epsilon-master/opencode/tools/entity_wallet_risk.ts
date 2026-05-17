import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";
import { sanitizeUpstreamErr } from "./lib/sanitize";

const TOOL_TIMEOUT_MS = 5000;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export default tool({
  description:
    "Check entity and wallet risk using on-chain intelligence (Arkham). " +
    "Two modes: 'wallet' checks if a specific address belongs to a known risky entity (hacker, sanctioned, mixer, etc.); " +
    "'token_holders' analyzes the top holders of a token contract for concentration risk and known bad actors. " +
    "Returns risk_level (none/low/medium/high/critical), risk_score 0-100, and entity details. " +
    "Use when user asks who holds a token, whether a wallet is suspicious, or about holder concentration risk. " +
    "May return cache_status='pending' on first call for a new address — retry in 60s for live results.",
  args: {
    mode: tool.schema
      .string()
      .optional()
      .describe("'wallet' to check a single address, 'token_holders' to analyze top holders of a token. Default: wallet"),
    chain: tool.schema
      .string()
      .optional()
      .describe("Blockchain: 'ethereum', 'base', 'polygon', 'arbitrum', 'bsc'. Default: ethereum"),
    address: tool.schema
      .string()
      .optional()
      .describe("Wallet address to check (EVM: 0x... 40 hex chars). Required for wallet mode."),
    token_address: tool.schema
      .string()
      .optional()
      .describe("Token contract address (EVM 0x...). Required for token_holders mode."),
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

    const mode = (args.mode?.trim().toLowerCase() as 'wallet' | 'token_holders') ?? 'wallet';
    const chain = (args.chain?.trim().toLowerCase()) ?? 'ethereum';

    if (mode === 'wallet') {
      const address = args.address?.trim();
      if (!address) return JSON.stringify({ success: false, error: "address is required for wallet mode" }, null, 2);
      if (!EVM_ADDRESS.test(address)) return JSON.stringify({ success: false, error: "Invalid EVM address (must be 0x + 40 hex chars)" }, null, 2);
    } else {
      const tokenAddress = args.token_address?.trim();
      if (!tokenAddress) return JSON.stringify({ success: false, error: "token_address is required for token_holders mode" }, null, 2);
      if (!EVM_ADDRESS.test(tokenAddress)) return JSON.stringify({ success: false, error: "Invalid token_address EVM format" }, null, 2);
    }

    const baseUrl = epsilonApiUrl.replace(/\/+$/, "");
    const body: Record<string, unknown> = { mode, chain };
    if (args.address) body.address = args.address.trim();
    if (args.token_address) body.token_address = args.token_address.trim();
    if (args.session_id) body.session_id = args.session_id;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/router/entity-wallet-risk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${epsilonToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
      });
    } catch (e) {
      return JSON.stringify({ success: false, error: `Network error: ${String(e)}` }, null, 2);
    }

    if (response.status === 402) {
      return JSON.stringify({ success: false, error: "Insufficient credits for entity wallet risk check." }, null, 2);
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
