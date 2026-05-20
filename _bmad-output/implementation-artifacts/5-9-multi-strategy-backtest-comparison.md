# Story 5.9: Multi-Strategy Backtest Comparison

Status: done

**Epic:** 5 — Backtesting Sandbox
**Type:** P3 feature enhancement (UI surface + backend coordinator on top of existing single-strategy backtest)
**Created:** 2026-05-18
**Depends on:** Story 5.1 done (`POST /v1/router/vibe-trading/jobs` + `GET /runs/:jobId` + SSE `/runs/:jobId/stream`); Story 5.2 done (CodeMirror 6 strategy editor); Story 5.3 done (Result Visualizer + SSE migration); Story 5.5 done (MCP proxy billing parity for atomic deduction)
**Blocks:** Nothing critical — feature enhancement, not foundation
**FRs:** N/A. **NFRs:** NFR3 (sandbox timeout budget), NFR8 (atomic credit deduction).
**Estimated effort:** 2-3 days. **Owner:** TBD.

## Implementation Reality Check (Updated 2026-05-20)

- Story 5.9 is implemented in `apps/api` + `apps/web` and validated via manual UI test + API trace.
- Multi-strategy flow (`Run All`) is active in Backtest UI with SSE/poll lifecycle, comparison table, overlay chart, and heatmap.
- Post-implementation fixes applied to match production behavior:
  - SSE timeout budget increased from 60s to 180s (`apps/api/src/router/routes/vibe-trading.ts`).
  - UI fallback poll after SSE timeout to resolve final status before marking terminal (`apps/web/src/components/backtest/multi-strategy-editor.tsx`).
  - Payload normalization before multi-submit (`binance -> okx`, instrument/time-range normalization) to avoid VT config rejects.
  - KPI fallback derivation for missing backend fields (`cagr`, `max_loss`) from equity/trade data.
  - Overlay parser accepts multiple equity keys (`value/equity/balance/portfolio_value/account_value/total_equity/nav/close`).
  - `Cancel All` now visibly resets running rows to `idle` and shows feedback toast.
  - `Promote` now scrolls to `Single Strategy View` and shows confirmation toast.
  - Recharts runtime crash fixed (`dot` callback removed; no `undefined.length` error).
  - Overlay UX improved: legend + line styles + normalize toggle (`Normalize to % Return` / `Show Raw Equity`).

## ⚠️ Stack Decision (READ FIRST — same as Story 5.2)

**Spec epic viết "Monaco editor multi-tab" nhưng implementation phải dùng CodeMirror 6** — Story 5.2 đã document chi tiết tại [5-2-backtest-strategy-editor-monaco-editor.md §Stack Decision](5-2-backtest-strategy-editor-monaco-editor.md). Reuse `<CodeEditor>` từ [apps/web/src/components/file-editors/code-editor.tsx](apps/web/src/components/file-editors/code-editor.tsx). KHÔNG add Monaco.

## Story

As a Tier 2 trader trên Chainlens,
I want chạy 2-5 backtest strategies cùng lúc và xem so sánh side-by-side (KPI table + Equity Curve overlay + correlation heatmap),
so that tôi đánh giá nhanh strategy nào tốt nhất trước khi triển khai vốn thật.

## Context

**Why this story exists**: Story 5.1-5.3 ship single-strategy backtest pipeline. User feedback: "Tôi muốn thử 3-4 variant cùng lúc, không phải submit từng cái rồi memorize KPIs." Vibe-Trading platform đã sẵn sàng — `POST /jobs` accepts arbitrary number of parallel submissions, mỗi cái có job_id riêng. Chỉ thiếu (a) backend coordinator atomic-bill N jobs, (b) UI multi-tab editor + ComparisonVisualizer.

**Vibe-Trading capability check (verified at spec-write time)**:
- [Vibe-Trading/agent/SKILL.md:4](Vibe-Trading/agent/SKILL.md#L4): "7 backtesting engines + benchmark comparison panel" — supported via Celery worker
- [Vibe-Trading/agent/src/worker.py:25](Vibe-Trading/agent/src/worker.py#L25): `@celery_app.task(name="src.worker.run_backtest_job", ...)` — accepts isolated jobs, can run concurrent
- [Vibe-Trading/agent/mcp_server.py:115](Vibe-Trading/agent/mcp_server.py#L115): `backtest(run_dir)` synchronous tool (NOT used by 5.9 — use existing `submitBacktestJob` async path)
- **Implication**: Story 5.9 does NOT add Python/Celery code in Vibe-Trading. Existing `submitBacktestJob` per-job endpoint scales horizontally — apps/api just fans out N concurrent calls.

**Existing infrastructure to reuse**:
- Backend submit/run/stream: [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts) (lines 69-117 POST, 119-134 GET, 262-332 SSE)
- Backend service layer: [apps/api/src/router/services/vibe-trading.ts](apps/api/src/router/services/vibe-trading.ts) `submitBacktestJob` + `getBacktestRun`
- Frontend submit/stream client: [apps/web/src/lib/backtest-api.ts](apps/web/src/lib/backtest-api.ts) `submitBacktest` + `streamRun`
- Strategy editor: [apps/web/src/components/backtest/strategy-editor.tsx](apps/web/src/components/backtest/strategy-editor.tsx) `BacktestStrategyEditorClient`
- Result visualizer: [apps/web/src/components/backtest/result-visualizer.tsx](apps/web/src/components/backtest/result-visualizer.tsx)

## Acceptance Criteria

### AC1 — Multi-tab strategy editor (max 5 tabs, hard cap)

**Given** user mở `/dashboard/backtest`
**When** user click "+ Add Strategy" button bên cạnh tabs

**Then** tab list expand thêm 1 tab (max 5 tabs total — hard cap để giữ NFR3 sandbox-timeout budget × N ≤ 2 phút wall-clock).
- Each tab có index 1-5 và editable label (default "Strategy 1", "Strategy 2", ...).
- Click tab switch active editor; editor state per tab maintained in component state, **NOT** unmounted (CodeMirror state preservation: keep editor mounted, only toggle visibility via CSS hidden — KHÔNG conditionally-mount với `{activeTab === i && <CodeEditor>}` because remount loses cursor position + undo history).
- Removing a tab requires confirmation dialog (parity Reset dialog at [strategy-editor.tsx:588](apps/web/src/components/backtest/strategy-editor.tsx#L588)). Cannot remove last tab (always at least 1).

**And** state per tab serialize vào `sessionStorage` key `chainlens:backtest:multi-draft:${accountId}` (separate key from single-strategy `chainlens:backtest:draft:` to avoid collision):
- Format: `{ tabs: Array<{id: string, label: string, content: string}>, activeTabId: string, savedAt: number }`
- Debounce 500ms (parity Story 5.2 `DEBOUNCE_MS`)
- 7-day TTL (parity `DRAFT_TTL_MS`)
- Quota-exceeded handling: silent fallback (no toast spam), warn once per session (parity 5.2 `quotaWarnedRef`)

**And** UI affordance:
- "Single Strategy" toggle at top to revert to Story 5.2 single-tab UX (preserves existing localStorage draft via separate key)
- "Run All" button replaces "Run Backtest" when multi-tab mode active; disabled when ANY tab has invalid JSON5
- Per-tab status badge: idle / running / done / failed

### AC2 — Atomic billing for N parallel jobs

**Given** user has N strategies (2 ≤ N ≤ 5) all with valid JSON5
**When** user click "Run All"

**Then** frontend calls new endpoint `POST /v1/router/vibe-trading/backtest-multi` with body:
```json
{
  "strategies": [
    { "tab_id": "strat-1", "payload": <VibeTradingJobSchema-shape> },
    { "tab_id": "strat-2", "payload": <...> },
    ...
  ]
}
```

**And** backend handler in [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts):
- Validates `strategies.length` ∈ [2, 5] — return 400 "between 2 and 5 strategies required" otherwise
- Validates each `payload` against existing `VibeTradingJobSchema` (line 22) — return 400 with which-tab-failed if any invalid
- Computes total cost: `N × getToolCost('vibe_trading_backtest', 0)` ([apps/api/src/config.ts:980](apps/api/src/config.ts#L980))
- Calls `checkCredits(accountId)` — if `credit.balance < totalCost` → return 402 "Insufficient credits for N strategies (need X, have Y)" (DO NOT partial-submit)
- Pre-deducts total cost in **single atomic call** to `deductToolCredits(accountId, 'vibe_trading_backtest', 0, "Multi-strategy backtest: N × <asset list>", session_id)` BEFORE any VT submit (parity Story 5.5 atomic billing pattern)
- Concurrent fan-out: `Promise.allSettled(strategies.map(s => submitBacktestJob(s.payload)))` (NOT `Promise.all` — partial failure must NOT abort siblings)
- For each settled result:
  - **Success** (got `job_id`): include in response array
  - **Failure** (any error): mark that strategy as `submit_failed`, do NOT refund (charged for failed compute attempts per epic spec line 1251)
- Returns:
  ```json
  {
    "success": true,
    "cost": <totalCost>,
    "submissions": [
      { "tab_id": "strat-1", "status": "accepted", "job_id": "...", "run_id": "..." },
      { "tab_id": "strat-2", "status": "submit_failed", "error": "..." },
      ...
    ]
  }
  ```

**And** if `submitBacktestJob` throws BEFORE atomic deduction (e.g., VT IP whitelist 403, auth 401): return 503 with `cost: 0`, **DO NOT** charge user (deduction must happen AFTER first successful VT submit OR rollback strategy — see Implementation Notes below).

**And** tier-bypass log emitted per submit (parity existing route line 88): `[TIER-BYPASS-SUSPECT] vibe_trading_backtest_multi account=${accountId} count=${N} ua="..."`

### AC3 — Concurrent SSE streams + ComparisonVisualizer

**Given** backend returns N submission results
**When** frontend receives response

**Then** frontend opens N parallel SSE streams using existing `streamRun` from [backtest-api.ts](apps/web/src/lib/backtest-api.ts):
- Each stream identified by `tab_id` so result lands on correct tab
- Per-stream lifecycle: `data_loading` → `phase_a` → `phase_b | failed | timeout` (per Story 5.3 event taxonomy)
- New component `<ComparisonVisualizer>` at [apps/web/src/components/backtest/comparison-visualizer.tsx](apps/web/src/components/backtest/comparison-visualizer.tsx) (NEW):
  - Props: `{ submissions: Submission[], onRetry: (tabId: string) => void }`
  - Internal state: `Record<tab_id, RunResponse | null>` — updated as each SSE phase_b event arrives
  - Renders 3 panels (lazy-render per panel based on data availability):
    1. **KPI Table** — side-by-side rows per strategy, columns: Sharpe / Max Drawdown / CAGR / Win Rate / Max Loss. Per-column statistical winner highlighted with green border + tooltip "Best Sharpe" etc. Use existing `result-visualizer.utils.ts` formatters for parity. Loading state per row while SSE in `data_loading` / `phase_a`.
    2. **Equity Curve overlay** — single Recharts `LineChart` (NOT `AreaChart` — multiple overlays) with N lines + 1 benchmark line. Use distinct hex colors per strategy from a fixed palette (5 colors max). Hover tooltip shows all strategies' values at the same timestamp.
    3. **Correlation heatmap** — N×N matrix computed client-side from `equity_curve` arrays (Pearson correlation of per-tick returns). Color scale: -1 (red) → 0 (white) → +1 (blue). Diagonal always 1.0. Show numeric value in each cell.

**And** "Promote to single view" button per row in KPI table — clicking switches user back to Story 5.3 `<BacktestResultVisualizer>` for that tab's RunResponse. State preserved in component, not lost on switch.

**And** N concurrent SSE connections must NOT race for AbortController — each stream has its own `AbortController` stored in `Map<tab_id, AbortController>`. Unmount cleanup closes all.

### AC4 — Partial timeout handling (NFR3 budget × N ≤ 2 min wall-clock)

**Given** total wall-clock approaches 2 minutes (NFR3 single-strategy budget × max-5)
**When** any individual SSE stream emits `timeout` event (Story 5.3 stream budget now 180s server-side)

**Then** that strategy's KPI row shows "Timeout — backtest still running on backend" with retry button + job_id displayed for manual SSE reconnect.

**And** if ALL streams timeout, comparison view shows banner "X of N completed in time. Charged: full Y credits per atomic billing policy." (epic line 1251 explicit).

**And** "Cancel All" button at top — calls `AbortController.abort()` on all open streams and local pollers, immediately flips in-flight tab statuses from `running` -> `idle`, and shows user feedback toast. Per Story 5.3 SSE behavior, server-side computation can still continue (no VT cancel API) — UI stops listening only.

### AC5 — Tests

**Unit (backend):**
- [apps/api/src/__tests__/unit/vibe-trading-backtest-multi-route.test.ts](apps/api/src/__tests__/unit/vibe-trading-backtest-multi-route.test.ts) (NEW):
  - `validates strategies.length within [2, 5] returning 400` — assert source contains length check + error message
  - `pre-deducts total cost atomically before VT submit` — assert source contains single `deductToolCredits` call with `N × cost` calculation
  - `Promise.allSettled fan-out preserves partial failures` — assert source uses `allSettled` (not `all`)
  - `submit_failed status returned for individual VT errors without aborting siblings` — assert response shape
  - `402 returned with insufficient credit message before any VT call`
  - Pattern: source-inspection (parity 5.0.3 `admin-rotate-sandbox-token.test.ts`) — full HTTP-layer integration tests are out of scope for this story per Story 5.0.4 testing convention.

**Unit (frontend):**
- [apps/web/src/components/backtest/__tests__/comparison-visualizer.test.tsx](apps/web/src/components/backtest/__tests__/comparison-visualizer.test.tsx) (NEW):
  - Renders KPI table with N rows when N submissions provided
  - Highlights best Sharpe (max value) and best Max Drawdown (closest to 0) per column
  - Computes Pearson correlation correctly for 2 sample equity curves (use known input/output)
  - Skeleton state per row while RunResponse is null
  - "Promote" button calls callback with correct tab_id

**E2E (Playwright):**
- [tests/e2e/specs/multi-strategy-backtest.spec.ts](tests/e2e/specs/multi-strategy-backtest.spec.ts) (NEW):
  - Add 3 strategies → Run All → all 3 succeed → KPI table + Equity Curve + heatmap visible
  - Gate behind `BACKTEST_E2E_ENABLED=true` (parity Story 5.0.4 chaos gating) since requires VT backend live

### AC6 — Multi-Strategy available directly in Chat

**Given** user is in chat/contextual backtest flow
**When** user requests multi-strategy compare (or provides multiple strategy variants)
**Then** chat can launch multi-strategy execution (same backend endpoint `/v1/router/vibe-trading/backtest-multi`) instead of only single-run.

**And** chat surface must support:
- multi payload collection (2-5 strategies),
- per-strategy run status (`idle/running/done/failed/timeout`),
- comparison summary render (reuse ComparisonVisualizer patterns; compact mode acceptable).

**And** existing single-strategy chat flow remains backward-compatible (no regression).

### AC7 — Backtest discoverability UX

**Given** user does not know where backtest lives
**When** user explores product navigation/chat
**Then** there are clear entry points to Backtest:
- persistent `Backtest` navigation item,
- command palette intents (`Backtest`, `Multi Backtest`),
- chat quick action/CTA (e.g. `Run Backtest`, `Run Multi Backtest`).

**And** UX copy must not route users to deprecated user-managed LLM/API-key setup for this feature (system-managed model/provider policy).

## Tasks / Subtasks

- [x] **Task 1: Backend coordinator route** (AC2)
  - [x] 1.1 Add new route `POST /backtest-multi` to [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts) — same `vibeTrading` Hono instance, inherits `combinedAuth`
  - [x] 1.2 Define new Zod schema `VibeTradingMultiBacktestSchema` — wraps `z.array(z.object({ tab_id: z.string(), payload: VibeTradingJobSchema })).min(2).max(5)`. Reuse existing `VibeTradingJobSchema` (line 22) — KHÔNG duplicate.
  - [x] 1.3 Implement handler:
    - Validate body
    - Compute `totalCost = N × getToolCost('vibe_trading_backtest', 0)` (use existing `getToolCost` from [config.ts:1022](apps/api/src/config.ts#L1022))
    - `checkCredits` — return 402 if insufficient (include needed/available in message)
    - **Atomic billing decision**: Try `submitBacktestJob` for ALL N first via `Promise.allSettled`; only call `deductToolCredits` AFTER at least 1 successful submit. If ALL fail (e.g., VT down) → return 503, no charge. If ≥1 succeeds → charge full N × cost (per epic line 1251 "failed jobs vẫn được charge credit nếu computation thực sự đã chạy"). Document the policy in route comment.
    - Tier-bypass log
  - [x] 1.4 Mount route — already auto-mounted via existing `vibeTrading` export, no changes to router/index.ts needed
  - [x] 1.5 Write unit tests per AC5 backend section

- [x] **Task 2: Frontend backtest-api client extension** (AC2)
  - [x] 2.1 Add `submitBacktestMulti(strategies: Array<{tab_id, payload}>, signal?: AbortSignal): Promise<MultiSubmitResponse>` to [apps/web/src/lib/backtest-api.ts](apps/web/src/lib/backtest-api.ts)
  - [x] 2.2 Define `MultiSubmitResponse` interface (parity `SubmitResponse` shape per AC2)
  - [x] 2.3 Reuse `BacktestError` class for 400/401/402/403/503 — same error taxonomy as single submit
  - [x] 2.4 DEV-mode 401 bypass — return mock response with N fake job_ids (parity existing line 67-70 single submit)

- [x] **Task 3: Multi-tab strategy editor UI** (AC1)
  - [x] 3.1 Refactor [strategy-editor.tsx](apps/web/src/components/backtest/strategy-editor.tsx) to support multi-tab mode behind a feature flag (`isMultiTab` prop, default `false`).
    - Single-tab path: existing UX preserved verbatim (regression-critical)
    - Multi-tab path: implemented via dedicated wrapper component `multi-strategy-editor.tsx` with `<CodeEditor>` instances kept mounted via CSS hidden
  - [x] 3.2 Add tab management state: `tabs: Tab[]`, `activeTabId: string`. Each Tab has `{id, label, content}`.
  - [x] 3.3 Add "+ Add Strategy" button (disabled when `tabs.length >= 5`)
  - [x] 3.4 Add per-tab close button + confirmation dialog
  - [x] 3.5 Add label edit inline (double-click label → input → blur to save)
  - [x] 3.6 Persist tabs to sessionStorage with separate key `chainlens:backtest:multi-draft:`
  - [x] 3.7 Per-tab JSON5 validation status badge (idle/valid/error)
  - [x] 3.8 "Single Strategy" toggle button at top — switches back to existing single-tab UX

- [x] **Task 4: ComparisonVisualizer component** (AC3 + AC4)
  - [x] 4.1 Create [apps/web/src/components/backtest/comparison-visualizer.tsx](apps/web/src/components/backtest/comparison-visualizer.tsx) (NEW)
  - [x] 4.2 Sub-component `<KPIComparisonTable>`:
    - Computes best/worst per column from `submissions[].metrics`
    - Reuse formatters from [result-visualizer.utils.ts](apps/web/src/components/backtest/result-visualizer.utils.ts) — KHÔNG duplicate sharpe/drawdown formatting
  - [x] 4.3 Sub-component `<EquityCurveOverlay>`:
    - Recharts `LineChart` with multiple `<Line>` (one per submission)
    - Fixed palette: `['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c']` (Tailwind blue-600/red-600/green-600/purple-600/orange-600)
    - Custom tooltip shows all strategies' values at same X
  - [x] 4.4 Sub-component `<CorrelationHeatmap>`:
    - Compute Pearson correlation matrix client-side from per-strategy `equity_curve` returns
    - Render as N×N grid with color interpolation
    - Pure utility function `computeCorrelationMatrix(curves: EquityCurve[]): number[][]` — separate file `comparison-visualizer.utils.ts` for testability
  - [x] 4.5 "Promote to single view" button per row — calls `onPromote(tabId)` callback
  - [x] 4.6 Loading skeleton per panel while `submissions[].metrics` is null
  - [x] 4.7 Timeout banner when any submission has timeout flag
  - [x] 4.8 "Cancel All" button — calls `onCancelAll()` callback

- [x] **Task 5: Wire it up + concurrent SSE management** (AC3 + AC4)
  - [x] 5.1 In [strategy-editor.tsx](apps/web/src/components/backtest/strategy-editor.tsx) (or new wrapper component), implement `handleRunAll()`:
    - Parse JSON5 for each tab, collect into strategies array
    - Call `submitBacktestMulti`

- [ ] **Task 8: Chat multi-strategy integration** (AC6)
  - [ ] 8.1 Extend contextual chat backtest entry to support multi-mode launch (not only `BacktestStrategyEditorClient` single mode).
  - [ ] 8.2 Add multi-strategy payload assembly in chat flow (2-5 strategies) and call `submitBacktestMulti`.
  - [ ] 8.3 Add per-strategy progress/status in chat UI; reuse existing SSE handling and status taxonomy.
  - [ ] 8.4 Add regression tests: single chat backtest unchanged + multi chat path works.

- [ ] **Task 9: Discoverability UX uplift** (AC7)
  - [ ] 9.1 Expose persistent Backtest entry point in navigation surfaces used by target users.
  - [ ] 9.2 Add command palette aliases/intents for single + multi backtest.
  - [ ] 9.3 Add chat-level CTA/quick actions to open backtest directly.
  - [ ] 9.4 Remove/replace stale copy that instructs users to configure per-user LLM/API keys for backtest.
    - For each successful submission, open `streamRun` and store handle in `Map<tab_id, StreamHandle>`
    - On each `phase_b` event, update component state with that tab's RunResponse
  - [x] 5.2 Open N concurrent SSE streams — each with own `AbortController` stored in ref Map
  - [x] 5.3 On unmount, close ALL streams + abort ALL controllers
  - [x] 5.4 Implement `handleCancelAll` and `handleRetry(tabId)`

- [x] **Task 6: Tests** (AC5)
  - [x] 6.1 Backend unit tests per AC5
  - [x] 6.2 Frontend unit tests per AC5 (use existing test infrastructure: bun test or node --test)
  - [x] 6.3 Add Pearson correlation utility test with known input/output (golden numbers)
  - [x] 6.4 E2E spec gated behind `BACKTEST_E2E_ENABLED=true` — defer to Story 5.0.5 CI integration
  - [x] 6.5 Verify Story 5.2 + 5.3 single-strategy flow regression — existing tests at [strategy-editor.test.tsx](apps/web/src/components/backtest/__tests__/strategy-editor.test.tsx) still pass after refactor

- [ ] **Task 7: Docs**
  - [ ] 7.1 Update Story 5.3 visualizer comment if any cross-reference needed
  - [ ] 7.2 Brief operator note: feature does not require VT backend changes; just apps/api + apps/web

## Dev Notes

### Critical brownfield guardrails

- **DO NOT** add Monaco editor. Reuse `<CodeEditor>` (CodeMirror 6) per Story 5.2 §Stack Decision.
- **DO NOT** unmount CodeMirror editors when switching tabs — remount destroys cursor + undo. Use CSS visibility (`hidden` class on inactive tabs).
- **DO NOT** modify Vibe-Trading Python code. Existing `submitBacktestJob` per-job endpoint is sufficient. The 7 engines are auto-selected by VT based on `simulation_environment.exchange + instrument_type` per [Vibe-Trading/agent/SKILL.md](Vibe-Trading/agent/SKILL.md). No multi-engine API to add at apps/api layer.
- **DO NOT** call `Promise.all` for fan-out — use `Promise.allSettled`. One failed submit must NOT abort siblings.
- **DO NOT** charge user before first successful VT submit (auth/IP errors must be free). The atomic-billing pattern: `allSettled → if any success then deduct full N×cost else return 503 with cost:0`.
- **DO NOT** use raw `EventSource` for SSE — use existing `createSSEStream` ([apps/web/src/lib/utils/sse-stream.ts](apps/web/src/lib/utils/sse-stream.ts)) per Story 5.3 AC2 (auth header injection).
- **DO NOT** break Story 5.2 single-strategy flow. Multi-tab is OPTIONAL — single-tab UX must remain default.
- **DO NOT** exceed 5 tabs. NFR3 budget = 2 min wall-clock; single-strategy 60s × 5 concurrent ≈ 5 min worst case if VT serializes — soft limit at 5 prevents pathological queueing.
- **DO** treat `submit_failed` status as terminal for that tab (no retry button until user manually re-runs from editor). Surfacing the error inline beats silent retry loops.
- **DO** preserve all existing 5.2/5.3 test infrastructure. Single-tab tests at [strategy-editor.test.tsx](apps/web/src/components/backtest/__tests__/strategy-editor.test.tsx) and [result-visualizer.test.ts](apps/web/src/components/backtest/__tests__/result-visualizer.test.ts) MUST still pass after refactor.

### Existing helpers TO REUSE

| Helper | Location | Use for |
|---|---|---|
| `submitBacktestJob` | [apps/api/src/router/services/vibe-trading.ts:86](apps/api/src/router/services/vibe-trading.ts#L86) | Task 1.3 — per-strategy fan-out (don't reimplement VT submit) |
| `VibeTradingJobSchema` | [apps/api/src/router/routes/vibe-trading.ts:22](apps/api/src/router/routes/vibe-trading.ts#L22) | Task 1.2 — wrap inside multi-schema, KHÔNG duplicate validation |
| `checkCredits` + `deductToolCredits` | [apps/api/src/router/services/billing.ts] | Task 1.3 — atomic billing pattern (parity Story 5.5) |
| `getToolCost('vibe_trading_backtest', 0)` | [apps/api/src/config.ts:980](apps/api/src/config.ts#L980) | Task 1.3 — DO NOT hardcode cost |
| `streamRun` + `createSSEStream` | [apps/web/src/lib/backtest-api.ts](apps/web/src/lib/backtest-api.ts), [apps/web/src/lib/utils/sse-stream.ts](apps/web/src/lib/utils/sse-stream.ts) | Task 5.1 — N concurrent streams (don't roll your own) |
| `BacktestError` class + 401/402/403/503 taxonomy | [apps/web/src/lib/backtest-api.ts:26](apps/web/src/lib/backtest-api.ts#L26) | Task 2.3 — same error semantics |
| `<BacktestResultVisualizer>` | [apps/web/src/components/backtest/result-visualizer.tsx](apps/web/src/components/backtest/result-visualizer.tsx) | Task 4.5 — single-strategy "promote" view target |
| `<CodeEditor>` | [apps/web/src/components/file-editors/code-editor.tsx](apps/web/src/components/file-editors/code-editor.tsx) | Task 3.1 — multi-tab editor instances |
| `JSON5.parse` | npm `json5` (already in apps/web) | Task 3.7 — per-tab validation parity Story 5.2 |

### Files this story will UPDATE

| Path | What changes | What MUST be preserved |
|---|---|---|
| [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts) | ADD new route `POST /backtest-multi` after existing routes | Existing `POST /jobs`, `GET /runs/:jobId`, `GET /runs/:jobId/stream`, `GET /shadow-reports/:shadowId` unchanged. Existing `VibeTradingJobSchema` reused, NOT modified |
| [apps/web/src/lib/backtest-api.ts](apps/web/src/lib/backtest-api.ts) | ADD `submitBacktestMulti` + `MultiSubmitResponse` type | Existing `submitBacktest`, `pollRun`, `streamRun`, `BacktestError` unchanged |
| [apps/web/src/components/backtest/strategy-editor.tsx](apps/web/src/components/backtest/strategy-editor.tsx) | ADD multi-tab mode behind `isMultiTab` prop (default false) | Single-tab UX is the default and unchanged. ALL existing AC1-AC5 from Story 5.2 + 5.3 still hold |
| [apps/web/src/app/(dashboard)/dashboard/backtest/backtest-client.tsx](apps/web/src/app/(dashboard)/dashboard/backtest/backtest-client.tsx) | ADD toggle to enter multi-tab mode | Default route still renders single-strategy editor |

### Files this story will CREATE

```
apps/web/src/components/backtest/comparison-visualizer.tsx                         (NEW — Task 4)
apps/web/src/components/backtest/comparison-visualizer.utils.ts                    (NEW — Task 4.4 Pearson correlation)
apps/web/src/components/backtest/__tests__/comparison-visualizer.test.tsx          (NEW — Task 6)
apps/api/src/__tests__/unit/vibe-trading-backtest-multi-route.test.ts              (NEW — Task 6.1)
tests/e2e/specs/multi-strategy-backtest.spec.ts                                    (NEW — Task 6.4 — gated)
```

### Implementation Notes

#### Atomic billing policy (decision per AC2)

Two patterns possible:
1. **Optimistic**: deduct first, refund on total failure. Risk: race with VT submit timing, refund logic complex.
2. **Pessimistic** (chosen): submit first, deduct only if ≥1 succeeded. Reasoning: matches epic line 1251 ("failed jobs vẫn được charge credit nếu computation thực sự đã chạy") — failed submits are NOT charged because no compute ran. Successful submits + later failures (timeout, RL convergence fail) ARE charged because compute consumed real resources.

```ts
// Pseudo-code for Task 1.3 handler
const submitResults = await Promise.allSettled(
  strategies.map(s => submitBacktestJob(s.payload))
);
const successes = submitResults.filter(r => r.status === 'fulfilled');
if (successes.length === 0) {
  return c.json({ success: false, error: 'All VT submits failed', cost: 0 }, 503);
}
// At least one compute will run — charge full N × cost per epic policy
const totalCost = N * getToolCost(TOOL, 0);
await deductToolCredits(accountId, TOOL, 0, `Multi-strategy backtest: ${N} × ${assets}`, sessionId);
// Build response array preserving tab_id ordering
return c.json({ success: true, cost: totalCost, submissions: [...] });
```

#### Pearson correlation utility

Use a pure function for testability:

```ts
// comparison-visualizer.utils.ts
export function pearsonCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = a.reduce((s, x) => s + x, 0) / a.length;
  const meanB = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, denomA = 0, denomB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  return denom === 0 ? 0 : num / denom;
}

export function returnsFromEquityCurve(curve: Array<{ value: number }>): number[] {
  // Convert price levels to per-tick log returns
  const out: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i-1].value > 0) out.push(Math.log(curve[i].value / curve[i-1].value));
  }
  return out;
}

export function computeCorrelationMatrix(curves: Array<Array<{value: number}>>): number[][] {
  const returns = curves.map(returnsFromEquityCurve);
  const n = returns.length;
  return Array.from({length: n}, (_, i) =>
    Array.from({length: n}, (_, j) =>
      i === j ? 1 : pearsonCorrelation(returns[i], returns[j])
    )
  );
}
```

#### Tab id strategy

Use `crypto.randomUUID()` for tab IDs (browser-supported in modern browsers, parity with existing patterns elsewhere in apps/web). Stable across renames; do NOT key by tab index because rename + reorder would conflate tabs.

### Latest tech information

- **Recharts** (already in apps/web): supports multiple `<Line>` overlays via `dataKey` prop. Custom tooltip via `<Tooltip content={<CustomTooltip />} />` — see existing patterns in [result-visualizer.tsx](apps/web/src/components/backtest/result-visualizer.tsx).
- **JSON5** (already in apps/web): used by Story 5.2 for comment-friendly JSON. Re-use `JSON5.parse()` per-tab.
- **Vibe-Trading concurrent submits**: VT Celery worker is multi-process (default 4 workers per [worker.py:13](Vibe-Trading/agent/src/worker.py#L13)). Submitting 5 jobs concurrently is safe — they queue + process in parallel up to worker count. Single tenant should not exceed 5 concurrent to avoid starving other users.

### Previous story intelligence

- **Story 5.1 (done)**: Established `submitBacktestJob` + `getBacktestRun` service layer with distinct error classes (`VibeTradingAuthError`, `VibeTradingForbiddenError`, `VibeTradingNotFoundError`, `VibeTradingDownstreamError`). Re-use as-is — **DO NOT** duplicate error taxonomy.
- **Story 5.2 (done)**: CodeMirror 6 editor pattern + JSON5 + 7-day localStorage draft TTL + dual-language UX. Multi-tab inherits all of these per-tab.
- **Story 5.3 (done)**: SSE migration with event taxonomy `data_loading | phase_a | phase_b | failed | timeout | heartbeat`. 60s server-side budget. Heartbeat every 15s. Story 5.9 reuses `streamRun` and event handlers verbatim.
- **Story 5.5 (done)**: MCP proxy atomic billing — `checkCredits` before any side-effect, `deductToolCredits` after success or rollback on failure. Multi-strategy AC2 follows same pattern at the coordinator level.
- **Story 5.0.3 + 5.0.5 (recent baseline lessons)**: bun:test mock-module conflicts when multiple test files mock same module — write the new test files as source-inspection (parity 5.0.3 admin-rotate-sandbox-token.test.ts), not as runtime tests with mocks.

### Git intelligence summary

Recent epic-5 commits confirm patterns:
- `5237e36bc2 test(sandbox): drift chaos & regression tests` — source-inspection test pattern that 5.9 follows
- `9d811d08e9 fix(api,epsilon): 5.0.2 code-review patches` — atomic-billing tx-aware pattern
- `4f5ef9bf86 feat: add provisioning key support` — Hono route handler pattern in vibe-trading.ts is direct parity

### Project context reference

- [_bmad-output/implementation-artifacts/5-1-vibe-trading-api-integration-in-sandbox.md](5-1-vibe-trading-api-integration-in-sandbox.md) — backend submit/run pipeline
- [_bmad-output/implementation-artifacts/5-2-backtest-strategy-editor-monaco-editor.md](5-2-backtest-strategy-editor-monaco-editor.md) — Stack decision (CodeMirror 6 not Monaco) + editor patterns
- [_bmad-output/implementation-artifacts/5-3-backtest-results-visualizer.md](5-3-backtest-results-visualizer.md) — SSE migration + visualizer prerequisites
- [_bmad-output/implementation-artifacts/5-5-vibe-trading-mcp-proxy.md](5-5-vibe-trading-mcp-proxy.md) — atomic billing parity reference
- [_bmad-output/project-context.md](../project-context.md) — CodeMirror 6, Bun, Hono conventions

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.9] — epic spec (lines 1216-1260) with AC + tasks (lines 1253-1258 high-level)
- [Source: apps/api/src/router/routes/vibe-trading.ts] — existing routes (POST /jobs, GET /runs/:jobId, SSE)
- [Source: Vibe-Trading/agent/src/worker.py:25] — Celery task definition (no changes needed)
- [Source: Vibe-Trading/agent/SKILL.md:4] — 7-engines capability
- [Source: apps/web/src/components/backtest/result-visualizer.tsx] — single-strategy visualizer (promote target)

### Review Findings

_Generated 2026-05-20 by `/bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor) on diff `99551a58dc..HEAD`._

#### Decision-needed (resolve first)

- [x] [Review][Decision] Race window in `checkCredits` snapshot vs `deductToolCredits` for concurrent multi-backtest — **resolved 2026-05-20: option (b) atomic deduct up-front + refund (parity Story 5.5)**. Original concern: `checkCredits(accountId)` uses default `minimumRequired=0.01`, balance read is a snapshot, deduction is non-atomic with the pre-check. Two concurrent `POST /backtest-multi` for same account with balance ≈ totalCost can both pass the gate. [apps/api/src/router/routes/vibe-trading.ts:158-198](apps/api/src/router/routes/vibe-trading.ts#L158-L198)

#### Patch (fixable, no human input needed)

- [ ] [Review][Patch] Atomic billing rewrite — call `deductToolCredits(N × cost)` BEFORE `Promise.allSettled`; on all-fail (`successCount === 0`) call `addCredits(N × cost, refund)` to roll back. Parity Story 5.5 atomic billing pattern; aligns with spec AC2 body "Pre-deducts BEFORE any VT submit" and NFR8. Removes the snapshot race entirely. [apps/api/src/router/routes/vibe-trading.ts:158-198](apps/api/src/router/routes/vibe-trading.ts#L158-L198)

- [ ] [Review][Patch] Multi-backtest broken in local dev mode — `checkCredits` returns `balance=0` when no DB; `available < totalCost` always fires for non-zero cost → 402. `/jobs` route only checks `hasCredits`. [apps/api/src/router/routes/vibe-trading.ts:158-168](apps/api/src/router/routes/vibe-trading.ts#L158-L168)
- [ ] [Review][Patch] "Run All" double-charge race — `setExecuting(false)` runs in `finally` after `submitBacktestMulti` resolves, before SSE streams complete; user clicking "Run All" again triggers second `deductToolCredits` for same strategies. Fix: keep `executing=true` until all streams reach terminal state (or disable button while any `statuses[id] === 'running'`). [apps/web/src/components/backtest/multi-strategy-editor.tsx:156-203](apps/web/src/components/backtest/multi-strategy-editor.tsx#L156-L203)
- [ ] [Review][Patch] AC5 frontend tests missing — only utils tested; spec requires KPI table render with N rows, best-highlight per column, per-row skeleton state, Promote callback test. Source-scanning route test gives false confidence (cannot catch logic regressions). [apps/web/src/components/backtest/__tests__/comparison-visualizer.test.tsx](apps/web/src/components/backtest/__tests__/comparison-visualizer.test.tsx); [apps/api/src/__tests__/unit/vibe-trading-backtest-multi-route.test.ts](apps/api/src/__tests__/unit/vibe-trading-backtest-multi-route.test.ts)
- [ ] [Review][Patch] AC3 violation: Equity Curve uses default Recharts `<Tooltip />` — spec requires "Hover tooltip shows all strategies' values at the same timestamp"; default tooltip only shows hovered series. [apps/web/src/components/backtest/comparison-visualizer.tsx:139](apps/web/src/components/backtest/comparison-visualizer.tsx#L139)
- [ ] [Review][Patch] AC4 violation: Timeout row missing `job_id` for manual SSE reconnect — `job_id` is in state but never rendered. Spec: "shows 'Timeout — backtest still running on backend' with retry button + job_id displayed for manual SSE reconnect". [apps/web/src/components/backtest/comparison-visualizer.tsx:116-121](apps/web/src/components/backtest/comparison-visualizer.tsx#L116-L121)
- [ ] [Review][Patch] Duplicate `tab_id` in request orphans AbortController + leaks SSE stream — `VibeTradingMultiBacktestSchema` has no uniqueness `.refine()`. Both backend (no validation) and frontend (`abortRefs.current.set(tab_id, ...)` overwrites silently) accept duplicates. Add `.refine((s) => new Set(s.map(x => x.tab_id)).size === s.length)` on backend schema. [apps/api/src/router/routes/vibe-trading.ts:65-76](apps/api/src/router/routes/vibe-trading.ts#L65-L76); [apps/web/src/components/backtest/multi-strategy-editor.tsx:170-193](apps/web/src/components/backtest/multi-strategy-editor.tsx#L170-L193)
- [ ] [Review][Patch] `pearsonCorrelation` truncates longer series — `Math.min(a.length, b.length)` produces correlation across mismatched time windows when strategies have different `historical_range`. Either align by timestamp before truncation, or refuse to compute (return NaN/null) when lengths differ and surface "incomparable" in UI. [apps/web/src/components/backtest/comparison-visualizer.utils.ts](apps/web/src/components/backtest/comparison-visualizer.utils.ts)
- [ ] [Review][Patch] `removeTab` calls `confirm()` inside `setTabs` updater — violates React updater purity contract; React 18 StrictMode invokes updaters twice in dev, fires dialog twice. Move `confirm()` outside `setTabs`. [apps/web/src/components/backtest/multi-strategy-editor.tsx:125-135](apps/web/src/components/backtest/multi-strategy-editor.tsx#L125-L135)
- [ ] [Review][Patch] `streamRun` handle stored after async gap — `streamRun(...).then(s => streamRefs.current.set(...))` runs as microtask; if SSE phase_b/failed events fire synchronously from buffered server data, the stream handle is never registered → `closeAllStreams` cannot close it → SSE leak. Either `await` the `streamRun` Promise inside the loop, or store the stream in a sync setter exposed by `createSSEStream`. [apps/web/src/components/backtest/multi-strategy-editor.tsx:172-196](apps/web/src/components/backtest/multi-strategy-editor.tsx#L172-L196)
- [ ] [Review][Patch] `setStatuses` on unmounted component — fire-and-forget `streamRun(...).catch(() => setStatuses(...))` runs even after unmount cleanup. Add a mounted-ref guard or clear callbacks in cleanup. [apps/web/src/components/backtest/multi-strategy-editor.tsx:194-196](apps/web/src/components/backtest/multi-strategy-editor.tsx#L194-L196)

#### Defer (real but lower priority)

- [x] [Review][Defer] AC2: per-tab Zod error message uses array index, not `tab_id` — functional equivalent for client; spec wants explicit `tab_id` in error string. [apps/api/src/router/routes/vibe-trading.ts:137-143](apps/api/src/router/routes/vibe-trading.ts#L137-L143) — deferred, polish item
- [x] [Review][Defer] AC1: `quotaWarnedRef` "warn once per session" toast not implemented — silent fallback works; only the user-facing notice is missing. [apps/web/src/components/backtest/multi-strategy-editor.tsx:81-87](apps/web/src/components/backtest/multi-strategy-editor.tsx#L81-L87) — deferred, polish item
- [x] [Review][Defer] AC4: Timeout banner shows for any timeout, spec says only on ALL-timeout — current behavior arguably more informative; spec ambiguity. [apps/web/src/components/backtest/comparison-visualizer.tsx:84](apps/web/src/components/backtest/comparison-visualizer.tsx#L84) — deferred, behavior judgment call
- [x] [Review][Defer] AC2: outer `session_id` not forwarded into per-job payload — observability gap for VT-side session tracking; not user-visible. [apps/api/src/router/routes/vibe-trading.ts:170-172](apps/api/src/router/routes/vibe-trading.ts#L170-L172) — deferred, observability polish
- [x] [Review][Defer] AC2: response shape missing `run_id` per submission — spec mentions field but service-layer `SubmitJobResponse` only returns `{status, job_id}`; frontend has `run_id?` already optional. [apps/api/src/router/routes/vibe-trading.ts:200-214](apps/api/src/router/routes/vibe-trading.ts#L200-L214) — deferred, requires service-layer change

### Review Findings (2026-05-21)

_Generated by `/bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor) on diff `3f038072ae^..HEAD` (~1727 lines, 9 files). This pass verifies the post-2026-05-20 implementation + chat integration + e2e hardening commits._

#### Decision-needed (all resolved 2026-05-21)

- [x] [Review][Decision] **Refund policy on partial submit_failed** — **Resolved: option (c) `addCredits` refund only on all-fail**. Closes orphan loophole, respects spec line 1251 (partial failures still charged), parity Story 5.5 atomic billing. → converted to Patch P1 below.
- [x] [Review][Decision] **AC7 Discoverability scope** — **Resolved: option (b) defer to follow-up story 5.9.1**. Discoverability touches nav/command-palette/chat-CTA across multiple surfaces; separate concern from multi-strategy core. AC7 dropped from this story's acceptance, tasks 9.1-9.4 moved to 5.9.1 backlog.
- [x] [Review][Decision] **Dev-mode 401 mock in `submitBacktestMulti`** — **Resolved: option (b) remove mock entirely**. Mock `job_id`s 401 on SSE anyway → fake success creates worse UX than loud auth failure. → converted to Patch P2 below.
- [x] [Review][Decision] **AC6 Chat parity completeness** — **Resolved: option (a) patch now**. Forward `initialAsset`/`initialTimeframe` to multi child + add Task 8.4 single-flow regression test. → converted to Patch P3 + P4 below.

#### Patch (fixable, no human input needed)

- [x] [Review][Patch][APPLIED 2026-05-21] **Recharts crash risk — no `Array.isArray` guard on `equity_curve`** — Type cast only; if VT returns malformed payload (string/null) the `LineChart` will throw `undefined.length` (same class of bug as previously fixed). Add runtime `Array.isArray(run.equity_curve)` check before `pickEquityValue` loop. [apps/web/src/components/backtest/comparison-visualizer.tsx:166-203](apps/web/src/components/backtest/comparison-visualizer.tsx#L166-L203)
- [x] [Review][Patch][APPLIED 2026-05-21] **`submit_failed` rows show forever-spinning skeleton** — `row.run ? formatKpi : <skeleton/>` — `submit_failed` items never get a `run` object, so KPI table pulses indefinitely with no error label/tooltip. Render `submissions[].error` inline for `submit_failed` rows + add a "Submission failed" state distinct from `submitting`. [apps/web/src/components/backtest/comparison-visualizer.tsx:236-251](apps/web/src/components/backtest/comparison-visualizer.tsx#L236-L251)
- [x] [Review][Patch][APPLIED 2026-05-21] **`tab_id` echoed unsanitized into 400 error message** — `tabIdHint = ' [tab=${tabId}]'` reads raw body before schema validation; tab_id can contain `\r\n<script>` etc. Sanitize same as `ua`: `.replace(/[\r\n\t]/g, ' ').slice(0, 64)`. [apps/api/src/router/routes/vibe-trading.ts:142-156](apps/api/src/router/routes/vibe-trading.ts#L142-L156)
- [x] [Review][Patch][APPLIED 2026-05-21] **`runAll` doesn't reset `submissions` state** — `setRuns({})` + `setStatuses(...)` reset, but `setSubmissions([])` missing → previous `submit_failed` rows persist while new `submitBacktestMulti` is in flight; `ComparisonVisualizer` shows stale rows for removed tabs. Add `setSubmissions([])` at start of `runAll`. [apps/web/src/components/backtest/multi-strategy-editor.tsx](apps/web/src/components/backtest/multi-strategy-editor.tsx) (handleRunAll)
- [x] [Review][Patch][APPLIED 2026-05-21] **`setActiveTabId` + `persist` called inside `setTabs` updater (`addTab`, `removeTab`)** — React 18 StrictMode invokes updaters twice in dev → double `setActiveTabId` + double `persist`. Hoist side-effects outside the updater. [apps/web/src/components/backtest/multi-strategy-editor.tsx:1127-1148](apps/web/src/components/backtest/multi-strategy-editor.tsx#L1127-L1148)
- [x] [Review][Patch][APPLIED 2026-05-21] **`onTimeout` IIFE can clobber re-run state** — Polling fallback runs for up to 180s; if user cancels then immediately re-runs, the orphaned IIFE's `markTerminal` + `safeSetRuns` mutates the new run's state. Track a per-run cancel token (incremented on `runAll`) and bail in the IIFE when token has advanced. [apps/web/src/components/backtest/multi-strategy-editor.tsx:271-298](apps/web/src/components/backtest/multi-strategy-editor.tsx#L271-L298)
- [x] [Review][Patch][APPLIED 2026-05-21] **SSE `onError` may fire before `streamRefs.current.set(...)`** — `streamRun` returns AFTER `stream.connect()` runs synchronously inside; if connect throws synchronously, onError dispatches before the handle is registered. Unmount cleanup then misses this stream → orphan reconnects. Register the controller/handle synchronously BEFORE `await streamRun`. [apps/web/src/components/backtest/multi-strategy-editor.tsx:309-325](apps/web/src/components/backtest/multi-strategy-editor.tsx#L309-L325)
- [x] [Review][Patch][APPLIED 2026-05-21] **Test asserts wrong identifier — CI green is misleading** — `vibe-trading-backtest-multi-route.test.ts:31` checks `indexOf('await deductToolCredits(')`. Route uses `deductCreditsRepo` not `deductToolCredits` → `deductIdx === -1` → assertion `toBeGreaterThan(-1)` should fail. Either CI is not running this file, or identifier was renamed post-test. Update test to match actual identifier. [apps/api/src/__tests__/unit/vibe-trading-backtest-multi-route.test.ts:31-39](apps/api/src/__tests__/unit/vibe-trading-backtest-multi-route.test.ts#L31-L39)
- [x] [Review][Patch][APPLIED 2026-05-21] **`binance → okx` silent payload rewrite** — `normalizePayload` swaps exchange names without user notification. Backtest runs on different exchange than what user wrote → misleading results. Add toast on first rewrite per session: "Coerced binance→okx (engine compatibility)". [apps/web/src/components/backtest/multi-strategy-editor.tsx:35-52](apps/web/src/components/backtest/multi-strategy-editor.tsx#L35-L52)
- [x] [Review][Patch][APPLIED 2026-05-21] **Timeout banner fires on `any` timeout, not `all` (AC4 deviation)** — Spec AC4: "if ALL streams timeout, comparison view shows banner". Code condition `timeoutCount > 0` shows banner if any single stream times out. Change to `timeoutCount === submissions.length`. [apps/web/src/components/backtest/comparison-visualizer.tsx:582](apps/web/src/components/backtest/comparison-visualizer.tsx#L582)
- [x] [Review][Patch][APPLIED 2026-05-21] **`amountDeducted ?? totalCost` reports intended cost on partial deduction** — If `deductCreditsRepo` returns `success: true` with `amountDeducted` less than requested, route reports the requested `totalCost` back to client. Use `result.amountDeducted` directly (no fallback) and surface the discrepancy. [apps/api/src/router/routes/vibe-trading.ts:219](apps/api/src/router/routes/vibe-trading.ts#L219)
- [x] [Review][Patch][APPLIED 2026-05-21] **`pearsonCorrelation` returns NaN when one curve has any non-positive equity point** — `returnsFromEquityCurve` drops returns where `prev <= 0 || curr <= 0`, producing different-length arrays for two curves run on same time range. Then `pearsonCorrelation` returns NaN. Heatmap silently shows '—' instead of warning user about incomparable data. Either align by index (preserve NaN/null in returns) or surface "incomparable: missing/zero equity points" inline. [apps/web/src/components/backtest/comparison-visualizer.utils.ts:739-782](apps/web/src/components/backtest/comparison-visualizer.utils.ts#L739-L782)
- [x] [Review][Patch][APPLIED 2026-05-21] **`pickEquityValue` candidate list includes `point.close` (OHLC field)** — Semantic ambiguity: if equity_curve ever embeds price data with `close`, chart plots price not equity. Drop `close` from candidate list (keep `value/equity/balance/portfolio_value/account_value/total_equity/nav` only). [apps/web/src/components/backtest/comparison-visualizer.tsx:445-462](apps/web/src/components/backtest/comparison-visualizer.tsx#L445-L462)
- [x] [Review][Patch][APPLIED 2026-05-21] **`quotaWarnedRef` warn-once toast still not implemented (AC1 deviation)** — Spec required "warn once per session (parity 5.2 `quotaWarnedRef`)" for sessionStorage quota exceeded; current `catch {}` is fully silent. Add ref + toast on first failure. [apps/web/src/components/backtest/multi-strategy-editor.tsx:1099](apps/web/src/components/backtest/multi-strategy-editor.tsx#L1099)
- [x] [Review][Patch][APPLIED 2026-05-21] **A11y violation — nested interactive elements in tab pill** — `<button><span role="button" onClick={removeTab}>×</span></button>` is invalid HTML; screen readers can't reach the close action. Refactor: outer `<div>` + inner sibling `<button>`s. [apps/web/src/components/backtest/multi-strategy-editor.tsx:380-391](apps/web/src/components/backtest/multi-strategy-editor.tsx#L380-L391)
- [x] [Review][Patch][APPLIED 2026-05-21] **`pollRun` aborted error silently swallowed** — Outer `catch {}` in fallback IIFE makes cancel-during-poll undebugging. Add `console.warn('[multi-backtest] poll aborted for tab=', tabId)` for ops visibility. [apps/web/src/components/backtest/multi-strategy-editor.tsx:282](apps/web/src/components/backtest/multi-strategy-editor.tsx#L282)

#### Defer (real but lower priority / out of scope)

- [x] [Review][Defer] **AC5 FE render tests** — adding component-render tests requires `@testing-library/react` dependency (not currently installed in apps/web). Tracked for a future test-infra story; utils are unit-tested. [apps/web/src/components/backtest/__tests__/comparison-visualizer.test.tsx](apps/web/src/components/backtest/__tests__/comparison-visualizer.test.tsx) — deferred, dep upgrade required
- [x] [Review][Defer] **No per-account multi-backtest rate limit** — User can fire 4 sequential `/backtest-multi` calls × 5 strategies = 20 concurrent VT submissions. Same class as `/jobs` single-route abuse. Track as separate hardening task. [apps/api/src/router/routes/vibe-trading.ts:136-269](apps/api/src/router/routes/vibe-trading.ts#L136-L269) — deferred, system-wide rate-limit story needed
- [x] [Review][Defer] **`pollRun` storm during all-timeout** — 5 concurrent strategies × 180s budget × 2.5s interval = ~360 auth'd fetches in 3min. Backend rate-limit / coordinated backoff needed but acceptable given current scale. — deferred, observe in prod
- [x] [Review][Defer] **sessionStorage 7-day TTL is dead code** — `TTL_MS = 7 days` but sessionStorage clears per tab/session. Either change to `localStorage` (intent: cross-session) or document why TTL is set. Cosmetic. [apps/web/src/components/backtest/multi-strategy-editor.tsx:977-985](apps/web/src/components/backtest/multi-strategy-editor.tsx#L977-L985) — deferred, doc/cleanup
- [x] [Review][Defer] **`STREAM_BUDGET_MS` tripled (60s → 180s)** — Intentional per spec § "Implementation Reality Check"; consider load impact under high concurrency in future capacity review. — deferred, intentional change
- [x] [Review][Defer] **`bestByKey` arbitrary "winner" when all rows have same value (e.g., all-zero drawdown)** — First row wins arbitrarily; cosmetic only (no functional impact). [apps/web/src/components/backtest/comparison-visualizer.tsx:471-474](apps/web/src/components/backtest/comparison-visualizer.tsx#L471-L474) — deferred, cosmetic edge case
- [x] [Review][Defer] **Stream-open loop uses `Promise.all` (each iteration has own try/catch)** — Optical violation of "DO NOT call Promise.all for fan-out" guardrail, but per-iteration try/catch makes it semantically equivalent to `allSettled`. [apps/web/src/components/backtest/multi-strategy-editor.tsx:1211](apps/web/src/components/backtest/multi-strategy-editor.tsx#L1211) — deferred, no behavior diff

#### Dismissed as noise (8)

- `useMemo` deps include array literal `rows` → memo never caches — false alarm, `rows` IS computed via `useMemo` (verified).
- `confirm()` blocks render queue — acceptable for destructive action, parity Reset dialog.
- `TIER-BYPASS-SUSPECT` log on happy path — same pattern as single `/jobs` route, intentional.
- `sub.job_id as string` cast — safe given outer `if (!sub.job_id) return` guard.
- O(N²) `firstValid` inside forEach — N ≤ 5, micro-optimization.
- Cross-tab state leak via sessionStorage — sessionStorage IS per-tab, not shared.
- Server intra-request `tab_id` uniqueness only — designed scope (per-request correlator).
- `streamRefs.set` after `await` race — already noted as decision_needed via Patch #7 (consolidated).

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- 2026-05-19 audit: verified commit `cc17cc03be` does not contain `backtest-multi` route/client/visualizer/tests implementation. No Story 5.9 AC code shipped yet.
- 2026-05-19 implementation pass: added `POST /backtest-multi` backend coordinator with `allSettled` fan-out + conditional atomic charge policy (charge only when >=1 submit accepted), frontend `submitBacktestMulti` client, multi-editor/toggle scaffolding, and comparison utility/component foundation with unit tests.
- 2026-05-21 `/bmad-code-review` second pass applied 19 patches (1 deferred — `@testing-library/react` dep): refund-on-all-fail via `atomic_add_credits` (`refundCredits` repo helper added), removed dev-mode 401 mock, forwarded `initialAsset`/`initialTimeframe` to multi editor, added Task 8.4 single-flow regression e2e, Recharts `Array.isArray` guard, `submit_failed` row UX with inline error, sanitized `tab_id` echo (log injection fix), `runAll` resets `submissions`, hoisted side-effects out of `setTabs` updaters, added monotonic `runIdRef` cancel token for stale onTimeout IIFEs, sync controller registration before `await streamRun`, A11y refactor of tab pill (nested-button removal), `quotaWarnedRef` warn-once toast, `normalize → okx` user warning, banner condition tightened to `all-timeout`, removed misleading `?? totalCost` fallback, dropped `point.close` from equity field candidates, fixed test asserting wrong identifier. Fast-tier API tests 59/59 pass; FE utils 20/20 pass. AC7 (discoverability) deferred to follow-up story 5.9.1.

### File List
