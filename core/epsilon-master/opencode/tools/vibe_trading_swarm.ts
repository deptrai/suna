/**
 * vibe_trading_swarm — async swarm execution wrapper (Story 5.5.1).
 *
 * Calls the Vibe-Trading MCP server's `start_swarm` + poll `get_swarm_status`
 * + `get_run_result` trio so the LLM can run multi-agent investment swarms
 * (6-15 min real runtime) without tripping the proxy's 30s budget.
 *
 * Why this exists: the original `run_swarm` MCP tool blocks for up to 30 min,
 * which is incompatible with the proxy's 30s AbortSignal. This wrapper does
 * the polling itself, surfacing progress lines so the UI can render them
 * (parsed by `OcVibeTradingSwarmToolView`).
 *
 * Cancellation: if `ctx.abort` fires (user clicks Stop in chat) OR the 30-min
 * client-side ceiling hits, we issue `cancel_swarm` before returning so
 * server-side compute stops.
 */

import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";
import { McpSseClient } from "./lib/mcp-sse-client";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000; // 30 min
const SSE_CONNECT_TIMEOUT_MS = 8_000;
const TOOLS_CALL_TIMEOUT_MS = 15_000;

// Mutable hooks for tests to inject deterministic implementations without
// monkey-patching globalThis or relying on Bun's `mock.module` cache
// (which is unreliable across re-imports — Story 5.5.1 review findings
// M5 + M6).
export const __testHooks: {
  sleep: (ms: number) => Promise<void>;
  maxPollDurationMs: number;
  getEnv: (key: string) => string | undefined;
} = {
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  maxPollDurationMs: MAX_POLL_DURATION_MS,
  getEnv: (key: string) => getEnv(key),
};
const sleep = (ms: number) => __testHooks.sleep(ms);

interface StartResult {
  run_id?: string;
  preset?: string;
  status?: string;
  error?: string;
}

interface StatusResult {
  status?: string;
  tasks?: Array<{ status?: string; agent_id?: string }>;
  final_report?: string;
  error?: string;
}

export default tool({
  description:
    "Run a multi-agent Vibe-Trading swarm (investment_committee, quant_strategy_desk, " +
    "risk_committee, crypto_trading_desk, etc.) and wait for the final report. " +
    "Tier 2 only. 6-15 minute runtime depending on preset. Use list_swarm_presets first " +
    "to see preset names and required variables. Returns progress markers (▶️ ⏳) plus " +
    "the final markdown report.",
  args: {
    preset: tool.schema
      .string()
      .describe("Swarm preset name, e.g. 'investment_committee' or 'crypto_trading_desk'."),
    variables: tool.schema
      .record(tool.schema.string(), tool.schema.string())
      .describe('Required variables for the preset, e.g. {"target": "AAPL.US", "market": "US"}.'),
  },
  async execute({ preset, variables }, ctx) {
    const epsilonToken = __testHooks.getEnv("EPSILON_TOKEN");
    const epsilonApiUrl = __testHooks.getEnv("EPSILON_API_URL");
    if (!epsilonToken) return JSON.stringify({ success: false, error: "EPSILON_TOKEN not set." });
    if (!epsilonApiUrl) return JSON.stringify({ success: false, error: "EPSILON_API_URL not set." });

    const baseUrl = `${epsilonApiUrl.replace(/\/+$/, "")}/v1/router/vibe-trading-mcp`;
    const client = new McpSseClient({
      baseUrl,
      token: epsilonToken,
      connectTimeoutMs: SSE_CONNECT_TIMEOUT_MS,
      callTimeoutMs: TOOLS_CALL_TIMEOUT_MS,
    });

    const progress: string[] = [];
    let runId: string | null = null;
    const startTime = Date.now();

    try {
      // ── Step 1: start the swarm (single fire-and-forget call) ──────────
      let startRaw: string;
      try {
        startRaw = await client.callTool("start_swarm", { preset_name: preset, variables }, ctx?.abort);
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: `start_swarm failed: ${(e as Error).message.slice(0, 300)}`,
        });
      }

      let start: StartResult;
      try {
        start = JSON.parse(startRaw) as StartResult;
      } catch {
        return JSON.stringify({
          success: false,
          error: `start_swarm returned non-JSON: ${startRaw.slice(0, 200)}`,
        });
      }

      if (start.status !== "started" || typeof start.run_id !== "string" || start.run_id.length === 0) {
        return JSON.stringify({
          success: false,
          error: start.error ?? `start_swarm did not succeed: ${startRaw.slice(0, 200)}`,
        });
      }

      runId = start.run_id;
      // Sanitize preset value before splicing into progress — prevents a
      // malicious caller from injecting `\n=== END ===\n` and tricking the
      // UI parser. (Story 5.5.1 review finding L4 / Blind#13.)
      const safePreset = String(preset).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60);
      progress.push(`▶️ Swarm started: ${safePreset} (run_id: ${runId.slice(0, 8)}...)`);

      // ── Step 2: poll status until terminal ──────────────────────────────
      let lastDone = -1;
      let consecutiveStatusErrors = 0;
      const MAX_CONSECUTIVE_STATUS_ERRORS = 5;
      while (Date.now() - startTime < __testHooks.maxPollDurationMs) {
        // Cooperative cancel — fire cancel_swarm and exit if the user aborted.
        if (ctx?.abort?.aborted) {
          await client.callTool("cancel_swarm", { run_id: runId }).catch(() => undefined);
          return [
            ...progress,
            `🛑 Cancelled by user. run_id=${runId}`,
          ].join("\n");
        }

        await sleep(POLL_INTERVAL_MS);

        let statusRaw: string;
        try {
          statusRaw = await client.callTool("get_swarm_status", { run_id: runId }, ctx?.abort);
          consecutiveStatusErrors = 0;
        } catch (e) {
          // Inspect the error class — a 403/401/410 means the proxy permanently
          // rejected this caller (ownership lost after restart, deprecated, etc).
          // Don't silently retry for 30 minutes (Story 5.5.1 review finding H1).
          const msg = (e as Error).message ?? "";
          if (/(\b|status[= ])(401|403|410)\b/.test(msg)) {
            return [
              ...progress,
              "",
              `❌ Swarm access denied: ${msg.slice(0, 200)}. run_id=${runId}`,
            ].join("\n");
          }
          consecutiveStatusErrors++;
          if (consecutiveStatusErrors >= MAX_CONSECUTIVE_STATUS_ERRORS) {
            return [
              ...progress,
              "",
              `❌ Swarm status polling failed ${consecutiveStatusErrors} times in a row; aborting. Last error: ${msg.slice(0, 200)}. run_id=${runId}`,
            ].join("\n");
          }
          // Transient — keep polling.
          continue;
        }

        let status: StatusResult;
        try {
          status = JSON.parse(statusRaw) as StatusResult;
        } catch {
          continue;
        }

        // MCP-level errors surface as {status: "error", error: "..."} (e.g.
        // run not found after server restart). These are terminal — don't
        // poll forever (Story 5.5.1 review finding C3).
        if ((status as { status?: string; error?: string }).status === "error") {
          return [
            ...progress,
            "",
            `❌ Swarm not accessible: ${(status as { error?: string }).error ?? "unknown error"}. run_id=${runId}`,
          ].join("\n");
        }

        const tasks = status.tasks ?? [];
        const done = tasks.filter((t) => t?.status === "completed" || t?.status === "failed").length;
        const total = tasks.length;
        if (done !== lastDone && total > 0) {
          progress.push(`⏳ ${done}/${total} agents complete`);
          lastDone = done;
        }

        if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
          // Failed/cancelled — return the run summary inline; no need to
          // fetch get_run_result (which would trigger the proxy's finalize
          // billing check; harmless but wasted call). (Story 5.5.1 review H3.)
          if (status.status !== "completed") {
            return [
              ...progress,
              "",
              `❌ Swarm ${status.status}. run_id=${runId}`,
            ].join("\n");
          }

          // ── Step 3: fetch final result (only for completed runs) ────────
          let resultRaw: string;
          try {
            resultRaw = await client.callTool("get_run_result", { run_id: runId }, ctx?.abort);
          } catch (e) {
            return [
              ...progress,
              "",
              `❌ get_run_result failed: ${(e as Error).message.slice(0, 200)}`,
            ].join("\n");
          }

          let result: StatusResult;
          try {
            result = JSON.parse(resultRaw) as StatusResult;
          } catch {
            return [...progress, "", `❌ get_run_result returned non-JSON: ${resultRaw.slice(0, 200)}`].join("\n");
          }

          const report =
            result.final_report ?? `Swarm ${result.status ?? "unknown"} — no report produced`;
          // Use an unambiguous separator that markdown horizontal rules cannot
          // collide with (Story 5.5.1 review finding H1 / Blind#5).
          return [
            ...progress,
            "",
            "=== SWARM REPORT ===",
            "",
            report,
          ].join("\n");
        }
      }

      // ── Client-side timeout: cancel server-side compute too ────────────
      await client.callTool("cancel_swarm", { run_id: runId }).catch(() => undefined);
      return [
        ...progress,
        "",
        `❌ Swarm timed out client-side after 30min. Server stopped. run_id=${runId}`,
      ].join("\n");
    } catch (err) {
      // Unknown error — fire cancel so the user isn't charged for runaway compute.
      if (runId) {
        await client.callTool("cancel_swarm", { run_id: runId }).catch(() => undefined);
      }
      return JSON.stringify({
        success: false,
        error: `swarm execution error: ${(err as Error).message.slice(0, 300)}`,
      });
    } finally {
      client.close();
    }
  },
});
