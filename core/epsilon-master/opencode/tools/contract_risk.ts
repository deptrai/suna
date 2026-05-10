import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";
import { sanitizeUpstreamErr } from "./lib/sanitize";

const CONTRACT_RISK_TIMEOUT_MS = 3000;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default tool({
  description:
    "Check smart contract security risk level via GoPlus (EVM) and RugCheck (Solana). " +
    "Returns risk level (LOW/MEDIUM/HIGH/CRITICAL), risk score 0-100, and top 3 risk factors. " +
    "Use when user pastes a contract address or asks about a token's safety. " +
    "Completes in <3s; falls back to cached data if upstream is slow.",
  args: {
    address: tool.schema
      .string()
      .describe("Smart contract address (EVM: 0x... 40 hex chars, or Solana base58 address)"),
    chain: tool.schema
      .string()
      .optional()
      .describe("Blockchain: 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base', 'solana'. Default: ethereum"),
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

    const address = args.address?.trim();
    if (!address) {
      return JSON.stringify({ success: false, error: "address is required" }, null, 2);
    }
    const chain = (args.chain?.trim().toLowerCase()) ?? 'ethereum';
    const isSolana = chain === 'solana' || chain === 'sol';
    if (!isSolana && !EVM_ADDRESS.test(address)) {
      return JSON.stringify({ success: false, error: "Invalid EVM address (must be 0x + 40 hex chars)" }, null, 2);
    }
    if (isSolana && !SOL_ADDRESS.test(address)) {
      return JSON.stringify({ success: false, error: "Invalid Solana address" }, null, 2);
    }

    const baseUrl = epsilonApiUrl.replace(/\/+$/, "");
    const body: Record<string, unknown> = { address, chain };
    if (args.session_id) body.session_id = args.session_id;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/router/contract-risk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${epsilonToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CONTRACT_RISK_TIMEOUT_MS),
      });
    } catch (e) {
      return JSON.stringify({ success: false, error: `Network error: ${String(e)}` }, null, 2);
    }

    if (response.status === 402) {
      return JSON.stringify({ success: false, error: "Insufficient credits for contract risk check." }, null, 2);
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
