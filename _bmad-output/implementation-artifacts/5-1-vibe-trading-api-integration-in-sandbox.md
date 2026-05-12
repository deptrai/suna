# Story 5.1: Vibe-Trading Backend Proxy + OpenCode Tool

Status: review

**Depends on**: [Story 5.0 (VT Platform Foundation)](5-0-vibe-trading-platform-foundation.md) — must be done first. 5.0 deploys VT/worker/Redis services + sandbox egress whitelist + pool env injection. Story 5.1 builds backend route + OpenCode tool ON TOP.

<!-- Created 2026-05-10 (revised). Split from original 913-line spec into 5.0 (infra) + 5.1 (app).
     5.1 covers: Hono proxy route + OpenCode tool + tier permissions + tests + docs.
     Phase A/B logic lives here (tool response handling). -->

## ⚠️ Vibe-Trading Dependency Notice (READ FIRST)

Vibe-Trading is **still under active development** (currently at Story 2.3 in-progress in [VT sprint-status.yaml](Vibe-Trading/_bmad-output/implementation-artifacts/sprint-status.yaml)). Story 5.1's tool implementation must be **resilient to VT's partial completion**.

**VT capability matrix** (verified):

| VT Capability | VT Story | Status | Phase |
|---|---|---|---|
| Bearer + IP auth, /jobs accepts payload | 1.1, 1.2 | ✅ done | A |
| `/preview` strategy summary | 1.3 | ✅ done | A |
| Async Celery queue, /jobs returns job_id | 2.1 | ✅ done | A |
| OHLCV data load (CCXT/Binance) → CSV in `runs/` | 2.2 | ✅ done | A |
| Worker writes `state.json`, `metrics.csv`, equity_curve, trade_log | **2.3** | 🟡 **in-progress** | **B** (auto-upgrade) |
| Monte Carlo, DeFi Sim, Perp Futures, RL, WFA, Generative Copilot | 2.4-6.1 | 🔴 backlog | Separate Chainlens stories (5.4+) |

**Phase A (this story now)**: Tool returns whatever `/runs/{job_id}` gives. Currently: `{status: "unknown", data_summary: {...}}` after data load. Tool detects this and returns `phase: "A"` success with data summary.

**Phase B (auto-upgrade when VT 2.3 done)**: `/runs/{job_id}` returns `{status: "success", metrics, equity_curve, trade_log}`. Tool detects and returns `phase: "B"` success with full snapshot. **No code change** — only Zod schema tightening + add Phase B test (already written in Task 5).

## Story

As a Tier 2 user trên Chainlens,
I want OpenCode agent trong sandbox của tôi gọi được `vibe_trading_backtest` tool để submit backtest jobs (asset config + risk params) và **progressively** lấy kết quả khi Vibe-Trading hoàn thiện engine,
so that tôi iterate trên trading strategy mà không cần tự deploy Python backtest infra hay tự cung cấp historical data — Vibe-Trading lo Binance/exchange data + simulation engine.

**Architectural intent** (per [VT architecture.md:14-26](Vibe-Trading/_bmad-output/planning-artifacts/architecture.md#L14)): Chainlens = Orchestrator (NLP extraction → strict `VibeTradingJobPayload`); Vibe-Trading = Stateless-ish Execution Engine (1 LLM call total — Chainlens Tier 2 LLM only, no double-LLM cost from sessions/agent path).

## Acceptance Criteria

1. **AC1 — OpenCode tool `vibe_trading_backtest` submit job + poll, handle Phase A/B response shapes**
   - **Given** Tier 2 agent có permission `vibe_trading_backtest: allow`
   - **When** agent invoke tool với payload (parity [verify_api.py:18-30](Vibe-Trading/verify_api.py#L18) example shape):
     ```json
     {
       "simulation_environment": { "exchange": "binance", "instrument_type": "SPOT", "initial_capital": "15000", "historical_range": 365 },
       "risk_management": { "max_drawdown_percentage": "0.15", "position_sizing": "0.2" },
       "context_rules": { "assets": ["BTC-USDT", "ETH-USDT"], "timeframe": "4h" },
       "execution_flags": { "enable_monte_carlo_stress_test": true }
     }
     ```
   - **Then** tool implementation trong `core/epsilon-master/opencode/tools/vibe_trading_backtest.ts`:
     - Step 1: `POST {EPSILON_API_URL}/v1/router/vibe-trading/jobs` với payload + `Authorization: Bearer ${EPSILON_TOKEN}` → backend proxies to `http://vibe-trading:8899/jobs` với **`Authorization: Bearer ${VIBE_TRADING_API_KEY}`** (HTTPBearer, NOT `X-API-Key` — verified [api_server.py:281](Vibe-Trading/agent/api_server.py#L281)) → returns `{ status: "accepted", job_id }` (verified [api_server.py:1200](Vibe-Trading/agent/api_server.py#L1200))
     - Step 2: Poll `GET {EPSILON_API_URL}/v1/router/vibe-trading/runs/{job_id}` mỗi 1s. **Note**: `job_id` (Celery task.id) ≡ `run_id` (filesystem dir name) — verified [worker.py:121](Vibe-Trading/agent/src/worker.py#L121). First 1-2 polls có thể trả 404 (worker hasn't created run dir yet) → tool MUST treat as "still pending, retry".
     - Step 3: Loop until **`status === "success"`** + `metrics` populated (Phase B), hoặc **`status === "unknown"`** + `data_summary` present (Phase A), hoặc **`status === "failed"|"aborted"`** (failure), hoặc total elapsed >= 30s (timeout). **CRITICAL**: status enum thật là `"success" | "failed" | "aborted"`, KHÔNG phải `"completed"` — verified [api_server.py:103](Vibe-Trading/agent/api_server.py#L103).
   - **And** **Phase A response handling** (current VT behavior — only stories 1.x + 2.1 + 2.2 done):
     - VT worker writes `runs/{job_id}/{symbol}.csv` + `metadata.json` only — KHÔNG có `state.json`, `artifacts/metrics.csv`, `equity_curve` (verified [worker.py:130-153](Vibe-Trading/agent/src/worker.py#L130)).
     - `_build_response_from_run_dir` returns `status="unknown"` + `metrics=null` + `equity_curve=null` + `trade_log=null`.
     - Tool MUST treat this as **Phase A success**: return `{ success: true, phase: "A", run_id, status: "data_loaded", data_summary: {...from metadata.json}, message: "Data loaded; full backtest pending VT Epic 2.3 (Results Persistence)" }`.
     - **Detection rule**: if `status === "unknown"` AND `data_summary` field present trong response, treat as Phase A complete after 2 consecutive polls confirm same shape.
   - **And** **Phase B response handling** (auto-upgrade khi VT 2.3+ done):
     - VT worker will write `state.json` (status=success) + `artifacts/metrics.csv` + equity/trades.
     - Tool detects `status === "success"` AND `metrics !== null` → return full snapshot `{ success: true, phase: "B", run_id, status, elapsed_seconds, metrics, equity_curve, trade_log, duration_ms }` (mirror `RunResponse` Pydantic at [api_server.py:100-132](Vibe-Trading/agent/api_server.py#L100)).
     - **No code change needed** to upgrade A → B: Zod schema (Task 1) marks Phase B fields `.optional()` so both shapes parse cleanly. Phase B test already written (Task 5).
   - **And** tool dùng `EPSILON_API_URL` + `EPSILON_TOKEN` (NOT direct `VIBE_TRADING_INTERNAL_URL` from sandbox) — go through epsilon-api proxy để billing track + tier-bypass log (parity Story 3.3 patches).

2. **AC2 — Backend proxy route + service layer**
   - **Given** sandboxes need to call Vibe-Trading via epsilon-api proxy (for billing + tier-bypass log)
   - **When** Story 5.1 implements backend
   - **Then** create `apps/api/src/router/services/vibe-trading.ts`:
     - `submitBacktestJob(payload, options)` → POST `${VIBE_TRADING_INTERNAL_URL}/jobs` with `Authorization: Bearer ${VIBE_TRADING_API_KEY}`
     - `getBacktestRun(jobId, options)` → GET `${VIBE_TRADING_INTERNAL_URL}/runs/{jobId}` with same Bearer
     - `AbortSignal.timeout(28_000)` (28s — leave 2s headroom under tool's 30s)
     - **404 handling**: return `{ status: 'pending', run_id: jobId }` instead of throw (worker may not have created run dir yet)
     - **403 handling**: distinct error "Vibe-Trading IP whitelist rejected request" — flag config drift (ALLOWED_IPS misconfigured by Story 5.0)
     - **401 handling**: distinct error "Invalid VIBE_TRADING_API_KEY" — flag deploy config drift
     - **Phase A enrichment**: when VT returns `status: "unknown"`, service forwards `data_summary` field from VT response so tool can detect Phase A state. Source: `submitBacktestJob` response includes `data_summary` per [worker.py:158-162](Vibe-Trading/agent/src/worker.py#L158); cache it server-side and merge into `getBacktestRun` response.
     - All Phase B fields (metrics, equity_curve, trade_log, etc.) typed as `.optional()` in Zod — Phase A returns null, Phase B returns populated.
   - **And** create `apps/api/src/router/routes/vibe-trading.ts` (Hono):
     - 2 sub-routes: `POST /jobs` + `GET /runs/:jobId`
     - Zod schema validates `VibeTradingJobPayload` shape mirroring [api_models.py:45-56](Vibe-Trading/agent/src/api_models.py#L45) Pydantic (constraints documented in code template below)
     - `combinedAuth` middleware (set in `router/index.ts`) — accept cả `epsilon_*` token (sandbox-originated) lẫn Supabase JWT (admin/dashboard direct calls), parity Story 3.3 routes post-patches
     - **Tier-bypass log on POST `/jobs`**: `console.log('[TIER-BYPASS-SUSPECT] vibe_trading hit account=${accountId} ...')` parity Story 3.3 tx-simulator
     - `checkCredits(accountId)` ATOMIC trước fetch
     - **Atomic billing**: `await deductToolCredits(accountId, 'vibe_trading_backtest', 0, 'Backtest job: ...', session_id)` BEFORE response (parity Story 3.3 patches — KHÔNG queueMicrotask)
     - `widget-cache` NOT applicable (jobs are stateful)
     - Response: `{ success: true, cost, ...service_response }`

3. **AC3 — Tier 2 permission gate (frontend agent permission + backend log)**
   - **Given** OpenCode permission system enforces tool access per agent
   - **When** Story 5.1 ships
   - **Then** update agent frontmatter:
     - `core/epsilon-master/opencode/agents/chainlens-tier1.md` add `vibe_trading_backtest: deny`
     - `core/epsilon-master/opencode/agents/chainlens-tier2.md` add `vibe_trading_backtest: allow`
     - `core/epsilon-master/opencode/agents/chainlens-tier3.md` (if exists) add `allow`
   - **And** backend route logs `[TIER-BYPASS-SUSPECT]` khi receive direct call (parity Story 3.3 tx-simulator post-patches at `apps/api/src/router/routes/tx-simulator.ts`) — vì tier introspection ở backend chưa có, agent permission là primary gate.

4. **AC4 — 30s timeout là PROCESS-level (tool abort), KHÔNG container-level kill**
   - **Given** backtest job có thể chạy lâu (Monte Carlo stress test với 365-day window có thể >>30s)
   - **When** tool execute exceeds 30s wall-clock
   - **Then** tool's `AbortSignal.timeout(30_000)` fires → tool return `{ success: false, error: "Backtest exceeded 30s timeout. Try smaller historical_range or disable Monte Carlo. Job continues in background — retrieve later via job_id.", run_id: jobId }` (parity Story 3.3 simulate_transaction 10s pattern)
   - **And** sandbox container KHÔNG bị kill — user vẫn có thể retry trong cùng session với reduced params
   - **And** Vibe-Trading job vẫn chạy tiếp ở backend (Celery worker won't be cancelled mid-flight — acceptable: results persisted at `/runs/{job_id}` for later retrieval).

## Tasks / Subtasks

### Task 1 — Backend proxy route + service layer (AC2)

- [x] Create `apps/api/src/router/services/vibe-trading.ts`:
  - Export `submitBacktestJob(payload, options)` per AC2
  - Export `getBacktestRun(jobId, options)` per AC2
  - Distinct error classes: `VibeTradingAuthError` (401), `VibeTradingForbiddenError` (403), `VibeTradingNotFoundError` (404), `VibeTradingDownstreamError` (5xx)
  - Pydantic source of truth: [api_models.py:45](Vibe-Trading/agent/src/api_models.py#L45), [api_server.py:100](Vibe-Trading/agent/api_server.py#L100)

- [x] Create `apps/api/src/router/routes/vibe-trading.ts` (Hono):
  - 2 sub-routes per AC2
  - Zod schema (mirror Pydantic constraints):
    - `simulation_environment.instrument_type`: `z.enum(['SPOT', 'PERPETUAL'])` — NOT 'FUTURES' (api_models.py:7-9)
    - `simulation_environment.historical_range`: `z.number().int().min(1).max(3650)` — Pydantic `Field(730, ge=1, le=3650)`
    - `risk_management.max_drawdown_percentage`: string Decimal, `ge=0.01, le=1.0`
    - `context_rules.timeframe`: regex `/^\d+[mhdwM]$/` — accepts 1m/2h/1w/1M (api_models.py:30)
    - `context_rules.assets`: array min 1, no upper bound
    - Cross-field validator: SPOT + leverage>1.0 forbidden (api_models.py:51-56)
    - Phase B fields (`metrics`, `equity_curve`, `trade_log`, `planner_output`, `strategy_spec`, etc.) marked `.optional()`
  - **session_id charset/length validation**: `z.string().max(128).regex(/^[A-Za-z0-9_-]+$/).optional()` (parity Story 3.3 patches)

- [x] Update `apps/api/src/router/index.ts`:
  - Register `router.use('/vibe-trading/*', combinedAuth)`
  - `router.route('/vibe-trading', vibeTrading)`

- [x] Update `apps/api/src/config.ts`:
  - Add to TOOL_PRICING:
    ```ts
    vibe_trading_backtest: { baseCost: 1.00, perResultCost: 0, markupMultiplier: 1.0 },
    ```
  - Pricing rationale: backtest expensive (CPU-heavy Celery worker, full Monte Carlo) — $1.00 baseline parity với high-cost simulate_transaction ($0.50) + worker compute markup
  - Note: `VIBE_TRADING_API_KEY` + `VIBE_TRADING_INTERNAL_URL` envSchema entries already added by Story 5.0.

### Task 2 — OpenCode tool `vibe_trading_backtest` (AC1)

- [x] Create `core/epsilon-master/opencode/tools/vibe_trading_backtest.ts`:
  - Pattern parity với `core/epsilon-master/opencode/tools/token_info.ts`:
    - Import `tool` from `@opencode-ai/plugin`
    - Import `getEnv` from `./lib/get-env`
    - Import `sanitizeUpstreamErr` from `./lib/sanitize` (Story 3.3 patch)
  - Tool description: clear, mention Tier 2 + 30s budget + Phase A/B response shapes
  - Args schema (mirror Vibe-Trading Pydantic, see code template below)
  - `execute()` flow per AC1 + Phase A/B detection logic per code template
  - **Total tool budget** = 30s (tool-level). Individual fetches use 2s timeout.

### Task 3 — Agent permission gate (AC3)

- [x] Update `core/epsilon-master/opencode/agents/chainlens-tier1.md` frontmatter:
  ```yaml
  permission:
    vibe_trading_backtest: deny
  ```
- [x] Update `core/epsilon-master/opencode/agents/chainlens-tier2.md`:
  ```yaml
  permission:
    vibe_trading_backtest: allow
  ```
- [x] Verify Tier 3 file exists. If yes, add `vibe_trading_backtest: allow` (Tier 3 inherits Tier 2 capabilities, parity Story 3.3 patch decision).

### Task 4 — Phase A/B response detection robustness (AC1)

- [x] In `vibe_trading_backtest.ts`, implement two-poll Phase A confirmation: only return Phase A success after **2 consecutive polls** show `status="unknown"` + same `data_summary` (avoids race where worker writes data CSV first then state.json second).
- [x] In service layer, add response-shape Phase B detection helper: `isPhaseBResponse(response)` returns true iff `status === "success"` AND `metrics !== null` AND `metrics.sharpe !== undefined`.
- [x] Document upgrade procedure in `apps/api/src/router/services/vibe-trading.ts` JSDoc: "When VT 2.3 marked done, tighten Zod `metrics`/`equity_curve`/`trade_log` from `.optional()` → required for success path. Add Phase B integration test."

### Task 5 — Tests

- [x] Backend service unit tests (`apps/api/src/__tests__/unit/vibe-trading-api-client.test.ts`):
  - submitBacktestJob happy path → returns `{ status: "accepted", job_id }`
  - submitBacktestJob 503 (Redis unavailable) → throws `VibeTradingDownstreamError`
  - submitBacktestJob 401 → throws `VibeTradingAuthError` with config-drift hint
  - submitBacktestJob 403 → throws `VibeTradingForbiddenError` with IP-whitelist hint
  - submitBacktestJob network error → throws with sanitized message
  - getBacktestRun status transitions: 404 → unknown+data_summary → success+metrics
  - getBacktestRun unknown response → service forwards data_summary
  - (≥6 tests)

- [x] Backend route unit tests (`apps/api/src/__tests__/unit/vibe-trading-route.test.ts`) — Hono `app.request()`:
  - 200 success on POST /jobs với valid payload
  - 200 success on GET /runs/:jobId
  - 400 on invalid payload (missing simulation_environment)
  - 400 on `instrument_type: "FUTURES"` (must be 'SPOT' or 'PERPETUAL')
  - 400 on `timeframe: "1century"` (regex mismatch)
  - 400 on SPOT + leverage>1.0 (cross-field validator)
  - 402 on insufficient credits
  - 503 on Vibe-Trading downstream failure
  - Tier-bypass log emitted (capture console.log)
  - (≥8 tests)

- [x] OpenCode tool unit tests (`core/epsilon-master/opencode/tools/__tests__/vibe_trading_backtest.test.ts`):
  - **Phase A — MANDATORY tests** (current VT state):
    - Mock fetch: POST returns job_id, GET returns 404 twice, then `{status: "unknown", data_summary: {...}}` twice → tool returns `{success: true, phase: "A", status: "data_loaded", data_summary: {...}}`
    - Mock fetch: GET returns `{status: "unknown"}` (no data_summary) for full 30s → tool returns timeout error (Phase A detection requires data_summary signal)
    - Mock fetch: 1 poll shows data_summary, next poll shows different shape → tool waits for 2-poll confirmation (no premature Phase A return)
  - **Phase B — MANDATORY tests** (write now, will pass once VT 2.3 lands):
    - Mock fetch: POST returns job_id, polling returns 404 → 'unknown' → `{status: "success", metrics: {sharpe: 1.5, max_drawdown: 0.12}, equity_curve: [...], trade_log: [...]}` → tool returns `{success: true, phase: "B", metrics, equity_curve, trade_log}`
    - Mock fetch: GET returns `{status: "success", metrics: null}` → tool MUST NOT mistake for Phase B; falls through to Phase A handling
  - **Failure paths**:
    - 'failed' status propagates with `reason` field
    - 'aborted' status returns failure
    - 30s timeout → returns timeout error with retry hint + run_id (so user can fetch later)
    - 401 from upstream → distinct error "Invalid VIBE_TRADING_API_KEY"
    - 403 from upstream → distinct error "IP whitelist rejected"
  - (≥10 tests total)

- [x] **Story 3.3 regression check** (mandatory): run full Story 3.3 backend tests after Task 1 (`combinedAuth` switch) — block merge nếu Story 3.3 tests fail.

- [x] TypeScript: `bunx tsc --noEmit` không introduce new errors trong files đã đụng.

### Task 6 — Documentation

- [x] Add tool usage docs tới `core/epsilon-master/opencode/tools/README.md` (or wherever existing tool docs live):
  - `vibe_trading_backtest` tool: arg schema + Phase A/B response shapes + 30s timeout caveat + "Phase A returns data summary; full backtest results unlock when VT Epic 2.3 lands"
- [x] Update Story 3.3 `Change Log` section trong story file:
  - Note: "Story 5.1 reuses Tier-bypass log pattern + atomic billing pattern + sanitizeUpstreamErr from Story 3.3 review patches"

## Dev Notes

### Reference Patterns

**OpenCode tool template** (parity `token_info.ts`, with Phase A/B handling):

```ts
// core/epsilon-master/opencode/tools/vibe_trading_backtest.ts
import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";
import { sanitizeUpstreamErr } from "./lib/sanitize";

const TOOL_TIMEOUT_MS = 30_000;     // overall budget
const FETCH_TIMEOUT_MS = 2_000;     // per-fetch budget
const POLL_INTERVAL_MS = 1_000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default tool({
  description:
    "Submit a backtest job to Vibe-Trading and wait for completion (Tier 2 only). " +
    "Phase A (current): returns data_summary after OHLCV load. " +
    "Phase B (after VT Epic 2.3 done): returns Sharpe ratio, max drawdown, equity curve. " +
    "Total time budget: 30 seconds. For longer backtests, reduce historical_range or disable Monte Carlo.",
  args: {
    simulation_environment: tool.schema.object({
      exchange: tool.schema.string().describe('e.g. "binance"'),
      instrument_type: tool.schema.string().describe('"SPOT" or "PERPETUAL" (NOT "FUTURES")'),
      initial_capital: tool.schema.string().describe('Decimal string, e.g. "15000"'),
      historical_range: tool.schema.number().describe('Days of history (1-3650, default 730)'),
    }),
    risk_management: tool.schema.object({
      max_drawdown_percentage: tool.schema.string(),
      position_sizing: tool.schema.string(),
      leverage: tool.schema.string().optional().describe('Decimal string. SPOT must be 1.0'),
    }),
    context_rules: tool.schema.object({
      assets: tool.schema.array(tool.schema.string()).describe('e.g. ["BTC-USDT", "ETH-USDT"]'),
      timeframe: tool.schema.string().describe('Regex /^\\d+[mhdwM]$/, e.g. "1m", "4h", "1d"'),
      indicators: tool.schema.array(tool.schema.string()).optional(),
      natural_language_rules: tool.schema.string().optional(),
    }),
    execution_flags: tool.schema.object({
      enable_monte_carlo_stress_test: tool.schema.boolean().optional(),
    }).optional(),
    session_id: tool.schema.string().optional(),
  },
  async execute(args, _ctx) {
    const epsilonToken = getEnv("EPSILON_TOKEN");
    const epsilonApiUrl = getEnv("EPSILON_API_URL");
    if (!epsilonToken || !epsilonApiUrl) {
      return JSON.stringify({ success: false, error: "EPSILON_TOKEN/URL not set." });
    }
    const baseUrl = epsilonApiUrl.replace(/\/+$/, "");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${epsilonToken}` };

    // Step 1: submit job
    let jobId: string;
    try {
      const resp = await fetch(`${baseUrl}/v1/router/vibe-trading/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (resp.status === 402) return JSON.stringify({ success: false, error: "Insufficient credits." });
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "(unreadable)");
        return JSON.stringify({ success: false, error: `Submit failed ${resp.status}: ${sanitizeUpstreamErr(errBody)}` });
      }
      const body = await resp.json() as { status: string; job_id: string };
      jobId = body.job_id;
    } catch (e) {
      return JSON.stringify({ success: false, error: `Submit network error: ${String(e).slice(0, 200)}` });
    }

    // Step 2: poll. Phase A vs Phase B detection.
    // Status enum: "success" | "failed" | "aborted" | "unknown" — verified api_server.py:103,802-813.
    // Phase A (VT 2.3 in-progress): status="unknown" + data_summary present → return phase:"A"
    // Phase B (VT 2.3 done): status="success" + metrics populated → return phase:"B"
    // 404 expected first 1-2 polls (worker async creates run dir).
    const startTime = Date.now();
    let lastDataSummary: unknown = null;
    while (Date.now() - startTime < TOOL_TIMEOUT_MS - FETCH_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      try {
        const resp = await fetch(`${baseUrl}/v1/router/vibe-trading/runs/${jobId}`, {
          headers,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!resp.ok) continue;  // 404 expected (worker not yet started) or transient error
        const run = await resp.json() as {
          status: string;
          reason?: string;
          metrics?: unknown;
          equity_curve?: unknown;
          trade_log?: unknown;
          data_summary?: unknown;
        };

        // Phase B: full backtest results available
        if (run.status === "success" && run.metrics) {
          return JSON.stringify({ success: true, phase: "B", run_id: jobId, ...run, duration_ms: Date.now() - startTime });
        }
        if (run.status === "failed" || run.status === "aborted") {
          return JSON.stringify({ success: false, run_id: jobId, error: run.reason ?? `Backtest ${run.status}` });
        }

        // Phase A: 2-poll confirmation to avoid race (worker writes CSV first, state.json second)
        if (run.status === "unknown" && run.data_summary) {
          if (lastDataSummary && JSON.stringify(lastDataSummary) === JSON.stringify(run.data_summary)) {
            return JSON.stringify({
              success: true,
              phase: "A",
              run_id: jobId,
              status: "data_loaded",
              data_summary: run.data_summary,
              message: "Data loaded successfully. Full backtest metrics pending Vibe-Trading Epic 2.3 (Results Persistence). Track at Vibe-Trading/_bmad-output/implementation-artifacts/sprint-status.yaml.",
              duration_ms: Date.now() - startTime,
            });
          }
          lastDataSummary = run.data_summary;
        }
        // status is "pending"/"running" — continue polling
      } catch {
        // poll fetch failed — keep trying until budget exhausted
      }
    }
    return JSON.stringify({
      success: false,
      run_id: jobId,
      error: `Backtest exceeded 30s timeout. Try smaller historical_range (e.g. 90 days) or disable Monte Carlo. Job continues in background — retrieve later via job_id.`,
    });
  },
});
```

**Backend route template** (parity Story 3.3 post-patches):

```ts
// apps/api/src/router/routes/vibe-trading.ts
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { submitBacktestJob, getBacktestRun } from '../services/vibe-trading';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'vibe_trading_backtest';
const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/).optional();

const VibeTradingJobSchema = z.object({
  simulation_environment: z.object({
    exchange: z.string().min(1),  // Pydantic accepts any str (default "binance")
    instrument_type: z.enum(['SPOT', 'PERPETUAL']),  // NOT 'FUTURES' — verified api_models.py:7-9
    initial_capital: z.string(),
    trading_fees: z.string().optional(),
    slippage_tolerance: z.string().optional(),
    historical_range: z.number().int().min(1).max(3650),  // Pydantic ge=1, le=3650
    gas_fee_model: z.string().optional(),
    track_impermanent_loss: z.boolean().optional(),
  }),
  risk_management: z.object({
    max_drawdown_percentage: z.string(),
    stop_loss: z.string().optional(),
    take_profit: z.string().optional(),
    position_sizing: z.string(),
    leverage: z.string().optional(),
  }),
  context_rules: z.object({
    assets: z.array(z.string()).min(1),  // No upper bound (Pydantic min_length=1 only)
    timeframe: z.string().regex(/^\d+[mhdwM]$/),  // Pydantic pattern
    indicators: z.array(z.string()).optional(),
    natural_language_rules: z.string().max(10000).optional(),
    executable_code: z.string().max(50000).optional(),
  }),
  execution_flags: z.object({
    enable_monte_carlo_stress_test: z.boolean().optional(),
    enable_rl_optimization: z.boolean().optional(),
  }).optional(),
  session_id: SESSION_ID,
})
.refine(
  (d) => !(d.simulation_environment.instrument_type === 'SPOT' && d.risk_management.leverage && Number(d.risk_management.leverage) > 1.0),
  { message: 'Leverage greater than 1.0 is not supported for SPOT instruments.' },
);

export const vibeTrading = new Hono<{ Variables: AppContext }>();

vibeTrading.post('/jobs', async (c) => {
  const accountId = c.get('accountId');
  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON' });
  const parsed = VibeTradingJobSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });

  const { session_id, ...payload } = parsed.data;

  // Tier-bypass log (parity Story 3.3 tx-simulator)
  console.log(
    `[TIER-BYPASS-SUSPECT] vibe_trading_backtest hit account=${accountId} ua="${(c.req.header('user-agent') ?? '').slice(0, 80)}"`,
  );

  const credit = await checkCredits(accountId);
  if (!credit.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let result;
  try {
    result = await submitBacktestJob(payload);
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : 'Vibe-Trading unavailable', cost: 0 }, 503);
  }

  const cost = getToolCost(TOOL, 0);
  try {
    await deductToolCredits(accountId, TOOL, 0, `Backtest job: ${payload.context_rules.assets.join(',')}`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e}`);
  }

  return c.json({ success: true, cost, ...result });
});

vibeTrading.get('/runs/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) throw new HTTPException(400, { message: 'Invalid job_id format' });
  try {
    const run = await getBacktestRun(jobId);
    return c.json({ success: true, ...run });
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) throw new HTTPException(404, { message: 'Job not found' });
    return c.json({ success: false, error: err instanceof Error ? err.message : 'Run query failed' }, 503);
  }
});
```

### Verified Assumptions

| Assumption | Verification | Result |
|---|---|---|
| Auth scheme HTTPBearer (not X-API-Key) | [api_server.py:281](Vibe-Trading/agent/api_server.py#L281) | ✅ `_security = HTTPBearer(auto_error=False)` |
| Run status enum values | [api_server.py:103](Vibe-Trading/agent/api_server.py#L103) | ✅ `"success" \| "failed" \| "aborted"` (NOT "completed") |
| job_id ↔ run_id linkage | [worker.py:121](Vibe-Trading/agent/src/worker.py#L121) | ✅ Celery `task.id` ≡ filesystem `run_id` |
| First poll race (404 expected) | [worker.py:117-130](Vibe-Trading/agent/src/worker.py#L117) | ⚠️ Worker creates dir async — first 1-2 polls return 404 |
| Pydantic InstrumentType enum | [api_models.py:7-9](Vibe-Trading/agent/src/api_models.py#L7) | ⚠️ `SPOT \| PERPETUAL` (NOT `FUTURES`) |
| Pydantic timeframe regex | [api_models.py:30](Vibe-Trading/agent/src/api_models.py#L30) | ⚠️ `^\d+[mhdwM]$` (accepts 1m/2h/1w/1M) |
| historical_range bounds | [api_models.py:17](Vibe-Trading/agent/src/api_models.py#L17) | ⚠️ `1-3650` (NOT max 730) |
| SPOT cross-field validator | [api_models.py:51-56](Vibe-Trading/agent/src/api_models.py#L51) | ⚠️ Leverage>1.0 forbidden for SPOT |
| VT current capability (Phase A) | [VT sprint-status.yaml](Vibe-Trading/_bmad-output/implementation-artifacts/sprint-status.yaml) | ✅ Story 2.3 in-progress — only data load works now |
| Tier 2 enforcement mechanism | Story 3.3 patches review | ✅ Agent permission frontmatter primary; backend log audit |
| Tool pattern template | `core/epsilon-master/opencode/tools/token_info.ts` | ✅ Established pattern |
| Backend route auth strategy | Story 3.3 post-patches | ✅ `combinedAuth` cho routes consumed by both OpenCode + admin |

### Architecture Constraints

- **OpenCode tool MUST go through epsilon-api proxy** (NOT direct call to vibe-trading from sandbox) — for billing tracking + tier-bypass log + sanitize-on-error.
- **Tier 2 gate**: agent permission frontmatter là primary; backend log là audit.
- **30s timeout**: process-level (tool's `AbortSignal`), NOT container-level kill. Sandbox session preserves.
- **`combinedAuth` for routes** (parity Story 3.3 post-patches) — accept cả epsilon_* tokens (sandbox-originated) lẫn Supabase JWT (admin direct calls).
- **Phase A/B logic in tool, not service**: service stays thin (1:1 proxy with auth). Tool decides A vs B based on response shape.
- **No widget-cache**: jobs are stateful (different per submission), cache layer not applicable.

### VT Dependency Tracking & Phase Upgrade Procedure

Story 5.1 is **architecturally complete** at merge but functionally limited until VT finishes Epic 2.

**Trigger**: monitor `Vibe-Trading/_bmad-output/implementation-artifacts/sprint-status.yaml` for `2-3-2-year-lookback-constraint-results-persistence: done`.

**Phase B upgrade steps** (estimated 2-4 hours dev work):
1. Verify VT 2.3 done by running an actual backtest end-to-end và confirming `runs/{job_id}/state.json` + `runs/{job_id}/artifacts/metrics.csv` exist.
2. Tighten Zod schema: remove `.optional()` on `metrics`/`equity_curve`/`trade_log` for the success path response.
3. Add Phase B integration test (placeholder already in Task 5) — run against live VT instance with deterministic test payload.
4. Update Chainlens Tier 2 agent prompt to expect full metrics in tool response.
5. Re-run code review (`/bmad-code-review 5.1`) to verify Phase B path covered.

**Per-feature unlock matrix** (each VT story done → Chainlens unlocks new tool capability with ZERO architectural change):

| VT Story Done | Chainlens unlocks | Action needed in 5.1 |
|---|---|---|
| VT 2.3 (Results Persistence) | Sharpe/drawdown/equity/trades | Tighten Zod schema (above) |
| VT 2.4 (Monte Carlo) | `enable_monte_carlo_stress_test` flag | Add Zod field + 1 test |
| VT 2.5 (DeFi Sim) | DEX strategies với Gas/AMM/IL | Add `gas_fee_model` + IL fields tests |
| VT 2.6 (Perp Futures) | Leverage > 1 + funding rates | Relax SPOT-only validator |
| VT 3.4 (WFA) | `wfa_config` field validation | Add Zod nested object |
| VT 3.1 (RL Optimize) | New tool `vibe_trading_optimize` | **Separate Chainlens story** (5.4) |
| VT 6.1 (Generative Copilot) | `executable_code` field | **Separate Chainlens story** (5.5) |

**Hard rule**: NEVER bundle VT Epic 3+ features into Chainlens 5.1. Each = separate Chainlens story để decoupling timeline.

### Source Tree Components to Touch

**NEW files:**
- `apps/api/src/router/services/vibe-trading.ts`
- `apps/api/src/router/routes/vibe-trading.ts`
- `apps/api/src/__tests__/unit/vibe-trading-service.test.ts`
- `apps/api/src/__tests__/unit/vibe-trading-route.test.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_backtest.ts`
- `core/epsilon-master/opencode/tools/__tests__/vibe_trading_backtest.test.ts`

**Modified files:**
- `apps/api/src/router/index.ts` — register `/vibe-trading/*` route with `combinedAuth`
- `apps/api/src/config.ts` — add TOOL_PRICING entry (envSchema entries already added by 5.0)
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` — `vibe_trading_backtest: deny`
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — `vibe_trading_backtest: allow`
- `core/epsilon-master/opencode/tools/README.md` — tool docs
- `_bmad-output/implementation-artifacts/3-3-generative-ai-chat-widgets.md` — Change Log carry-forward note

**NOT modified (intentionally):**
- `Vibe-Trading/agent/api_server.py` — black-box dependency (VT's own roadmap handles Epic 2.3+)
- `apps/api/src/platform/providers/local-docker.ts` — sandbox infra is Story 5.0 scope
- `scripts/compose/docker-compose.yml` — service deployment is Story 5.0 scope
- `core/docker/init-scripts/95-egress-whitelist.sh` — egress is Story 5.0 scope

### Testing Standards

- **Bun test runner** (parity Story 3.3): `bun test`
- **Test location**: backend `apps/api/src/__tests__/unit/`, OpenCode tool tests `core/epsilon-master/opencode/tools/__tests__/`
- **Coverage**: ≥24 tests (6 service + 8 route + 10 tool)
- **Mandatory regression checks**:
  - Run all Story 3.3 backend tests after Task 1 (`combinedAuth` switch SHOULD already be done by Story 3.4, verify) — 21 tests must stay green
  - Run Vibe-Trading's existing `verify_api.py` against deployed instance (Story 5.0 deployment) to confirm shape compat
- **TypeScript**: `bunx tsc --noEmit` không introduce new errors
- **Phase B tests written upfront**: will pass auto when VT 2.3 done; serve as regression contract

### Dev Notes from Story 3.3 (Carry-forward)

Story 3.3 review surfaced these patterns — apply preventively:

1. **Atomic billing**: `await deductToolCredits` from start (NOT `queueMicrotask`)
2. **Tier-bypass log**: emit `[TIER-BYPASS-SUSPECT]` on backend route to audit direct API calls
3. **session_id charset/length**: `z.string().max(128).regex(/^[A-Za-z0-9_-]+$/)`
4. **`sanitizeUpstreamErr`**: applied to all upstream error bodies forwarded to LLM
5. **`combinedAuth` for shared data routes**: accept cả epsilon_* và Supabase JWT
6. **Pure-function test extraction**: nếu Bun không render React, extract pure helpers (less relevant cho 5.1 vì backend-heavy)

### Performance Budget

| Metric | Target | Implementation |
|---|---|---|
| Backtest job submit (POST /jobs) | <500ms | Vibe-Trading async job queue (Celery enqueues immediately) |
| Backtest poll latency | 1s interval, 30s budget | Tool-side `setTimeout(1000)` + total `AbortSignal.timeout(30000)` |
| Service-layer fetch timeout | 28s | `AbortSignal.timeout(28_000)` |
| Per-fetch tool timeout | 2s | Each individual fetch in poll loop |
| Phase A 2-poll confirmation overhead | +1s | Required to avoid race condition |

### Security & UX Guardrails

- **`sanitizeUpstreamErr`**: applied tới Vibe-Trading error response forwarding to LLM (parity Story 3.3 — prompt injection prevention)
- **Session_id charset/length**: max 128 chars, alphanumeric/dash/underscore only (parity Story 3.3 patches)
- **Job payload size limit**: enforced by Hono request body limit (default 1MB). Backtest payloads typically ≤10KB
- **Polling rate**: 1s interval — slower than typical APIs (which can poll 100ms) to reduce load on Vibe-Trading + epsilon-api
- **Tier-bypass log**: all `/v1/router/vibe-trading/*` calls logged with accountId + UA. Defense-in-depth audit
- **Atomic billing**: `await deductToolCredits` BEFORE response (parity Story 3.3 patches). Bound user balance

### References

- [Source: Story 5.0 (VT Platform Foundation)](5-0-vibe-trading-platform-foundation.md) — prerequisite
- [Source: epics.md#Epic 5 Story 5.1](_bmad-output/planning-artifacts/epics.md)
- [Source: VT PRD](Vibe-Trading/_bmad-output/planning-artifacts/prd.md)
- [Source: VT Architecture](Vibe-Trading/_bmad-output/planning-artifacts/architecture.md)
- [Source: VT Sprint Status](Vibe-Trading/_bmad-output/implementation-artifacts/sprint-status.yaml) — current VT story progress (Phase A/B trigger)
- [Source: Story 3.3 token-info tool template](core/epsilon-master/opencode/tools/token_info.ts) — backend tool reference pattern
- [Source: Story 3.3 token-info route post-patches](apps/api/src/router/routes/token-info.ts) — atomic billing, combinedAuth, tier-bypass log
- [Source: Vibe-Trading FastAPI service](Vibe-Trading/agent/api_server.py) — auth at line 281, endpoints at lines 1180-1700+
- [Source: Vibe-Trading Pydantic models](Vibe-Trading/agent/src/api_models.py) — payload schema source of truth
- [Source: Vibe-Trading payload example](Vibe-Trading/verify_api.py) — job request shape

## Dev Agent Record

### Implementation Notes

- Service layer (`vibe-trading.ts`): thin 1:1 proxy with auth. `isPhaseBResponse()` helper exported for tool use. `data_summary` cached in-memory Map keyed by job_id for Phase A enrichment.
- Route layer: Zod schema mirrors Pydantic exactly (instrument_type enum, historical_range 1-3650, timeframe regex, SPOT+leverage cross-field refine). `combinedAuth` middleware registered in `router/index.ts`.
- Tool layer: Phase A/B detection logic lives here (not service). 2-poll confirmation for Phase A avoids race where worker writes CSV before state.json. `mockDateNowTimeout()` helper in tests simulates 30s timeout without real wait.
- Test isolation: Bun v1.3.x shares mock registry across all test files in same process. Route test restructured to use `globalThis.fetch` mocking instead of `mock.module()` for the vibe-trading service — avoids polluting the registry for the api-client test. Service test renamed to `vibe-trading-api-client.test.ts` and uses dynamic imports in `beforeAll`.
- Tier 3 agent file does not exist — only Tier 1 and Tier 2 updated.

### Completion Notes

All 6 tasks complete. 32 tests pass (11 api-client service + 10 route + 11 tool). TypeScript clean. Story 3.3 regression: 21 tests pass (verified separately). Phase B tests written and passing against mock data — will auto-validate when VT 2.3 lands.

### File List

**New files:**
- `apps/api/src/router/services/vibe-trading.ts`
- `apps/api/src/router/routes/vibe-trading.ts`
- `apps/api/src/__tests__/unit/vibe-trading-api-client.test.ts` (renamed from vibe-trading-service.test.ts — Bun mock isolation)
- `apps/api/src/__tests__/unit/vibe-trading-route.test.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_backtest.ts`
- `core/epsilon-master/opencode/tools/__tests__/vibe_trading_backtest.test.ts`
- `core/epsilon-master/opencode/tools/README.md`

**Modified files:**
- `apps/api/src/router/index.ts`
- `apps/api/src/config.ts`
- `core/epsilon-master/opencode/agents/chainlens-tier1.md`
- `core/epsilon-master/opencode/agents/chainlens-tier2.md`

### Change Log

- 2026-05-10: Story 5.1 split from original 913-line spec. Story 5.0 (NEW) takes infra scope (deploy services + egress + pool env). Story 5.1 (this file, revised ~500 lines) takes application scope (backend route + OpenCode tool + tier permissions + tests + docs). Phase A/B logic concentrated in tool layer.
- 2026-05-10 (post-source-review fixes carried forward from original spec):
  1. Auth header `X-API-Key` → `Authorization: Bearer` (HTTPBearer scheme, [api_server.py:281](Vibe-Trading/agent/api_server.py#L281))
  2. Status enum: `"completed"` → `"success" \| "failed" \| "aborted"` ([api_server.py:103](Vibe-Trading/agent/api_server.py#L103))
  3. InstrumentType enum: `FUTURES` → `PERPETUAL` ([api_models.py:7-9](Vibe-Trading/agent/src/api_models.py#L7))
  4. historical_range max: `730` → `3650` matching Pydantic
  5. timeframe: enum → regex `^\d+[mhdwM]$`
  6. assets max(20): removed (no Pydantic upper bound)
  7. SPOT cross-field validator ported to Zod refine
  8. job_id ↔ run_id linkage confirmed ([worker.py:121](Vibe-Trading/agent/src/worker.py#L121))
  9. 404-on-first-poll handling added
  10. Service-layer 401/403/404 distinct error handling for deploy-time config drift detection
- 2026-05-10 (Phase A/B split): Tool returns `phase: "A"` (data_summary only, current VT state) or `phase: "B"` (full metrics, after VT 2.3 done). 2-poll confirmation in Phase A detection avoids race. Drop-in upgrade A → B requires only Zod schema tightening + Phase B test (no architectural rework).
- 2026-05-11 (implementation complete): All 6 tasks done. 32 tests pass. Route test restructured to use fetch mocking (not mock.module) to avoid Bun v1.3.x shared mock registry leakage. Story 5.1 reuses tier-bypass log + atomic billing + sanitizeUpstreamErr patterns from Story 3.3 review patches.

Status: review
