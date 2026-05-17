import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";

const TOOL_TIMEOUT_MS = 5000;

export default tool({
  description:
    "Query pre-indexed mempool alerts from epsilon-api. " +
    "This tool reads DB-backed alerts only and never opens provider WebSockets. " +
    "Use for large swaps and MEV-suspect lookups by chain/alert_type/time window.",
  args: {
    chain: tool.schema.string().optional().describe("Optional chain filter: ethereum, bsc, base"),
    alert_type: tool.schema.string().optional().describe("Optional alert type: large_swap, sandwich_suspect, frontrun_suspect, unknown_large_tx"),
    min_value_usd: tool.schema.number().optional().describe("Minimum estimated USD value"),
    limit: tool.schema.number().int().optional().describe("Max rows to return (clamped to 100)"),
    since_minutes: tool.schema.number().int().optional().describe("Lookback window in minutes (clamped to 1440)"),
  },
  async execute(args, _context) {
    const epsilonToken = getEnv("EPSILON_TOKEN");
    const epsilonApiUrl = getEnv("EPSILON_API_URL");
    if (!epsilonToken) return JSON.stringify({ success: false, error: "EPSILON_TOKEN not set" }, null, 2);
    if (!epsilonApiUrl) return JSON.stringify({ success: false, error: "EPSILON_API_URL not set" }, null, 2);

    const baseUrl = epsilonApiUrl.replace(/\/+$/, "");
    const params = new URLSearchParams();
    if (args.chain) params.set("chain", args.chain.toLowerCase());
    if (args.alert_type) params.set("alert_type", args.alert_type);
    if (typeof args.min_value_usd === "number") params.set("min_value_usd", String(args.min_value_usd));
    if (typeof args.limit === "number") params.set("limit", String(Math.max(1, Math.min(100, args.limit))));
    if (typeof args.since_minutes === "number") params.set("since_minutes", String(Math.max(1, Math.min(1440, args.since_minutes))));

    const url = `${baseUrl}/v1/router/mempool-alerts${params.toString() ? `?${params.toString()}` : ""}`;
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${epsilonToken}` },
        signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "(unreadable)");
        return JSON.stringify(
          { success: false, error: `Proxy error ${response.status}: ${body.slice(0, 500)}` },
          null,
          2,
        );
      }

      const data = (await response.json()) as Record<string, unknown>;
      return JSON.stringify(
        { ...data, response_time_ms: Date.now() - start },
        null,
        2,
      );
    } catch (e) {
      return JSON.stringify(
        { success: false, error: `Network error: ${String(e)}` },
        null,
        2,
      );
    }
  },
});
