import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";
import { sanitizeUpstreamErr } from "./lib/sanitize";

const SIM_TOOL_TIMEOUT_MS = 10000;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HEX_DATA = /^0x[a-fA-F0-9]*$/;

export default tool({
  description:
    "Simulate an EVM transaction to estimate gas cost and expected outcome without broadcasting on-chain. " +
    "Uses Tenderly Simulator when configured, falls back to eth_estimateGas via RPC. " +
    "Use when user asks 'what happens if I swap X for Y' or 'how much gas does this cost'. " +
    "Returns gas estimate (USD + native), expected outcome, slippage, and simulation URL. " +
    "Completes in <10s (Tenderly inherently slower than read-only calls).",
  args: {
    from: tool.schema
      .string()
      .describe("Sender wallet address (0x + 40 hex chars)"),
    to: tool.schema
      .string()
      .describe("Contract address to call (0x + 40 hex chars)"),
    data: tool.schema
      .string()
      .optional()
      .describe("Hex-encoded calldata (0x...). Leave empty for plain ETH transfer."),
    value: tool.schema
      .string()
      .optional()
      .describe("ETH value in wei as hex string (e.g. '0xDE0B6B3A7640000' for 1 ETH). Default: 0"),
    chain: tool.schema
      .string()
      .optional()
      .describe("Blockchain: 'ethereum', 'arbitrum', 'base', 'polygon'. Default: ethereum"),
    action: tool.schema
      .string()
      .optional()
      .describe("Short human-readable description of the transaction (e.g. 'Swap 1 ETH for USDC on Uniswap V3'). Used as Sandbox tab title."),
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

    const from = args.from?.trim();
    const to = args.to?.trim();
    if (!from || !EVM_ADDRESS.test(from)) {
      return JSON.stringify({ success: false, error: "Invalid from address (must be 0x + 40 hex chars)" }, null, 2);
    }
    if (!to || !EVM_ADDRESS.test(to)) {
      return JSON.stringify({ success: false, error: "Invalid to address (must be 0x + 40 hex chars)" }, null, 2);
    }
    const data = args.data?.trim() ?? '0x';
    if (!HEX_DATA.test(data)) {
      return JSON.stringify({ success: false, error: "data must be hex calldata (0x...)" }, null, 2);
    }

    const baseUrl = epsilonApiUrl.replace(/\/+$/, "");
    const body: Record<string, unknown> = { from, to, data };
    if (args.value) body.value = args.value;
    if (args.chain) body.chain = args.chain;
    if (args.action) body.action = args.action;
    if (args.session_id) body.session_id = args.session_id;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/router/tx-simulator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${epsilonToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SIM_TOOL_TIMEOUT_MS),
      });
    } catch (e) {
      return JSON.stringify({ success: false, error: `Network error: ${String(e)}` }, null, 2);
    }

    if (response.status === 402) {
      return JSON.stringify({ success: false, error: "Insufficient credits for transaction simulation." }, null, 2);
    }
    if (!response.ok) {
      const errBody = await response.text().catch(() => "(unreadable)");
      return JSON.stringify({ success: false, error: `Proxy error ${response.status}: ${sanitizeUpstreamErr(errBody)}` }, null, 2);
    }

    let data_: unknown;
    try {
      data_ = await response.json();
    } catch (e) {
      return JSON.stringify({ success: false, error: `Invalid JSON from proxy: ${String(e)}` }, null, 2);
    }

    return JSON.stringify(data_, null, 2);
  },
});
