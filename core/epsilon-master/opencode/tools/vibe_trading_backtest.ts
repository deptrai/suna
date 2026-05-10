import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";
import { sanitizeUpstreamErr } from "./lib/sanitize";

const TOOL_TIMEOUT_MS = 30_000;
const FETCH_TIMEOUT_MS = 2_000;
const POLL_INTERVAL_MS = 1_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default tool({
  description:
    "Submit a backtest job to Vibe-Trading and wait for completion (Tier 2 only). " +
    "Phase A (current): returns data_summary after OHLCV data load from Binance/exchange. " +
    "Phase B (after VT Epic 2.3 done): returns Sharpe ratio, max drawdown, equity curve, trade log. " +
    "Total time budget: 30 seconds. For longer backtests, reduce historical_range or disable Monte Carlo. " +
    "Job continues in background after timeout — retrieve later via job_id.",
  args: {
    simulation_environment: tool.schema.object({
      exchange: tool.schema.string().describe('Exchange name, e.g. "binance"'),
      instrument_type: tool.schema.string().describe('"SPOT" or "PERPETUAL" (NOT "FUTURES")'),
      initial_capital: tool.schema.string().describe('Decimal string, e.g. "15000"'),
      historical_range: tool.schema.number().describe("Days of history (1–3650, default 730)"),
      trading_fees: tool.schema.string().optional(),
      slippage_tolerance: tool.schema.string().optional(),
      gas_fee_model: tool.schema.string().optional(),
      track_impermanent_loss: tool.schema.boolean().optional(),
    }),
    risk_management: tool.schema.object({
      max_drawdown_percentage: tool.schema.string().describe("Decimal string, e.g. \"0.15\" (15%)"),
      position_sizing: tool.schema.string().describe('Decimal string, e.g. "0.2" (20% per position)'),
      leverage: tool.schema.string().optional().describe('Decimal string. SPOT must be "1.0"'),
      stop_loss: tool.schema.string().optional(),
      take_profit: tool.schema.string().optional(),
    }),
    context_rules: tool.schema.object({
      assets: tool.schema.array(tool.schema.string()).describe('e.g. ["BTC-USDT", "ETH-USDT"]'),
      timeframe: tool.schema.string().describe('Regex /^\\d+[mhdwM]$/, e.g. "1m", "4h", "1d", "1w"'),
      indicators: tool.schema.array(tool.schema.string()).optional(),
      natural_language_rules: tool.schema.string().optional(),
    }),
    execution_flags: tool.schema
      .object({
        enable_monte_carlo_stress_test: tool.schema.boolean().optional(),
        enable_rl_optimization: tool.schema.boolean().optional(),
      })
      .optional(),
    session_id: tool.schema.string().optional(),
  },
  async execute(args, _ctx) {
    const epsilonToken = getEnv("EPSILON_TOKEN");
    const epsilonApiUrl = getEnv("EPSILON_API_URL");

    if (!epsilonToken) return JSON.stringify({ success: false, error: "EPSILON_TOKEN not set." });
    if (!epsilonApiUrl) return JSON.stringify({ success: false, error: "EPSILON_API_URL not set." });

    const baseUrl = epsilonApiUrl.replace(/\/+$/, "");
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${epsilonToken}`,
    };

    // Step 1: submit job via epsilon-api proxy (billing + tier-bypass log happen there)
    let jobId: string;
    try {
      const resp = await fetch(`${baseUrl}/v1/router/vibe-trading/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (resp.status === 402) {
        return JSON.stringify({ success: false, error: "Insufficient credits." });
      }
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "(unreadable)");
        return JSON.stringify({
          success: false,
          error: `Submit failed ${resp.status}: ${sanitizeUpstreamErr(errBody)}`,
        });
      }
      const body = (await resp.json()) as { status: string; job_id: string };
      jobId = body.job_id;
    } catch (e) {
      return JSON.stringify({
        success: false,
        error: `Submit network error: ${String(e).slice(0, 200)}`,
      });
    }

    // Step 2: poll for results.
    // Status enum: "success" | "failed" | "aborted" | "unknown" — verified api_server.py:103.
    // Phase A (VT 2.3 in-progress): status="unknown" + data_summary present → return phase:"A"
    // Phase B (VT 2.3 done): status="success" + metrics populated → return phase:"B"
    // 404 expected first 1-2 polls (worker creates run dir async).
    const startTime = Date.now();
    let lastDataSummary: unknown = null;

    while (Date.now() - startTime < TOOL_TIMEOUT_MS - FETCH_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      try {
        const resp = await fetch(`${baseUrl}/v1/router/vibe-trading/runs/${jobId}`, {
          headers,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!resp.ok) continue; // 404 expected (worker not yet started) or transient error

        const run = (await resp.json()) as {
          status: string;
          reason?: string;
          metrics?: unknown;
          equity_curve?: unknown;
          trade_log?: unknown;
          data_summary?: unknown;
        };

        // Phase B: full backtest results available (VT 2.3+ done)
        if (run.status === "success" && run.metrics) {
          return JSON.stringify({
            success: true,
            phase: "B",
            run_id: jobId,
            ...run,
            duration_ms: Date.now() - startTime,
          });
        }

        if (run.status === "failed" || run.status === "aborted") {
          return JSON.stringify({
            success: false,
            run_id: jobId,
            error: run.reason ?? `Backtest ${run.status}`,
          });
        }

        // Phase A: 2-poll confirmation to avoid race (worker writes CSV first, state.json second)
        if (run.status === "unknown" && run.data_summary) {
          if (
            lastDataSummary !== null &&
            JSON.stringify(lastDataSummary) === JSON.stringify(run.data_summary)
          ) {
            return JSON.stringify({
              success: true,
              phase: "A",
              run_id: jobId,
              status: "data_loaded",
              data_summary: run.data_summary,
              message:
                "Data loaded successfully. Full backtest metrics pending Vibe-Trading Epic 2.3 (Results Persistence). " +
                "Track at Vibe-Trading/_bmad-output/implementation-artifacts/sprint-status.yaml.",
              duration_ms: Date.now() - startTime,
            });
          }
          lastDataSummary = run.data_summary;
        }
        // status is "pending"/"running"/"unknown" without data_summary — continue polling
      } catch {
        // poll fetch failed — keep trying until budget exhausted
      }
    }

    return JSON.stringify({
      success: false,
      run_id: jobId,
      error:
        "Backtest exceeded 30s timeout. Try smaller historical_range (e.g. 90 days) or disable Monte Carlo. " +
        "Job continues in background — retrieve later via job_id.",
    });
  },
});
