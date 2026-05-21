# Story 5.9.1: Conversational Multi-Strategy Backtest — Agent-Driven UX

Status: in-progress

**Epic:** 5 — Backtesting Sandbox
**Type:** P2 UX redesign — chat-native backtest creation (replaces deferred 5.9 AC7 discoverability)
**Created:** 2026-05-21
**Depends on:** Story 5.9 done (`POST /v1/router/vibe-trading/backtest-multi`, `ComparisonVisualizer`, `MultiBacktestStrategyEditorClient`, tier gate). System-managed LLM proxy at `apps/api/src/router` (no per-user keys).
**Blocks:** Nothing — additive surface
**FRs:** N/A. **NFRs:** NFR3 (sandbox timeout budget), NFR8 (atomic credit deduction — inherited from 5.9 route).
**Estimated effort:** 2-3 days. **Owner:** TBD.

## Context — why this exists

Story 5.9 ships the multi-strategy backtest pipeline behind two surfaces:
1. **Dashboard page** `/dashboard/backtest` — user writes JSON5 in CodeMirror tabs by hand
2. **Contextual modal** — user pastes JSON5 code block in chat, hovers, clicks "Review & Run Backtest"

Both surfaces assume the user **already knows the backtest schema** and can author valid JSON5 (`simulation_environment`, `risk_management`, `context_rules`, `execution_flags`). For users without that knowledge — the majority — backtest is invisible.

User feedback (2026-05-21, verbatim Vietnamese): *"hiện tại quá phức tạp, phải bắt user làm quá nhiều. Tôi muốn mọi thứ agent phải gần như quyết định hết, user chỉ cần bảo agent 'hãy tạo cho tôi multi strategy cho đồng coin nào đó' là agent tự tạo và bảo user duyệt, user duyệt xong thì run, run xong hiển thị kết quả thật đẹp cho user."*

**Translation of intent**: zero JSON5 authoring required. User says "tạo 3 strategy backtest cho BTC", agent generates proposals, user reviews via simple UI (tweak a number, approve or ask for change), runs, sees `ComparisonVisualizer` inline. System-managed end-to-end — no LLM key configuration, no schema lookup.

## What gets dropped from the previous 5.9.1 draft

The earlier discoverability scope (sidebar nav entry, command palette deeplink, `?mode=multi` URL param) is **not the priority**. Those add ways to reach the existing JSON5 surface; this story replaces the JSON5 surface with a conversational one for chat-originated requests. Sidebar/palette can be a follow-up (5.9.2) if still wanted after this lands.

## Story

As a user on Chainlens (any tier can **propose**; **running** requires Tier 2 per existing 5.9 policy),
I want to ask the agent in chat to create multi-strategy backtests for an asset (e.g. "tạo 3 strategy cho BTC") and have the agent generate, propose, edit, and execute the backtests for me,
so that I see comparison results without ever opening a JSON5 editor or knowing the backtest schema. Tier 1 users can preview proposals (free) and see what running would unlock at Tier 2.

## End-to-end flow (target UX)

```
[User in chat] "Tạo cho tôi 3 multi-strategy backtest cho BTC, mix conservative + trend-following + breakout"
       │
       ▼
[Agent decides to use new tool] propose_backtest_multi({asset: "BTC-USDT", count: 3, hint: "mix conservative/trend/breakout"})
       │
       ▼
[Backend POST /propose-multi → service generates 3 valid VibeTradingJobSchema-shaped proposals + summaries]
       │
       ▼
[Chat renders OcProposeBacktestMultiToolView with 3 proposal cards]
       │  ┌──────────────────────────────────────────────────┐
       │  │ Strategy 1: Conservative SMA crossover           │
       │  │ Capital: [10000] · Range: [90d] · Position: [10%]│
       │  │ Stop loss: [3%] · Take profit: [8%]              │
       │  │ Indicators: SMA_50, SMA_200                      │
       │  │ [Approve] [Reject] [Ask agent to change…]        │
       │  ├──────────────────────────────────────────────────┤
       │  │ Strategy 2: Trend-following EMA                  │
       │  │ ...                                              │
       │  ├──────────────────────────────────────────────────┤
       │  │ Strategy 3: Breakout                             │
       │  │ ...                                              │
       │  ├──────────────────────────────────────────────────┤
       │  │ [Run All Approved (3)]    Total cost: 3 credits  │
       │  └──────────────────────────────────────────────────┘
       │
       │  User clicks "Approve" on all → clicks "Run All Approved"
       ▼
[FE calls existing submitBacktestMulti() → SSE stream per strategy]
       │
       ▼
[Tool view transitions to running state; per-card status badges; SSE drives ComparisonVisualizer inline]
       │
       ▼
[ComparisonVisualizer renders KPI table + Equity Curve overlay + Correlation Heatmap]
```

Iterative refinement (parallel flow):
```
[User] "Strategy 2 quá rủi ro, làm bảo thủ hơn đi"
   │
   ▼
[Agent calls propose_backtest_multi({revise_tab_id: "strat-2", hint: "more conservative"})]
   │
   ▼
[Backend returns single revised proposal]
   │
   ▼
[Tool view merges revised card; strategy 1 + 3 approval state preserved]
```

## Acceptance Criteria

### AC1 — Agent tool: `propose_backtest_multi`

**Given** the user asks the chat agent to create multi-strategy backtest variants
**When** the agent calls `propose_backtest_multi(args)`

**Then** a new OpenCode tool at [core/epsilon-master/opencode/tools/propose_backtest_multi.ts](core/epsilon-master/opencode/tools/propose_backtest_multi.ts) exists with:
- Args (Zod-shaped via `tool.schema`):
  - `asset: string` — e.g. `"BTC-USDT"`, `"ETH-USDT"`, `"AAPL"` (same format docs as `vibe_trading_backtest`)
  - `count?: number` — default 3, min 2, max 5 (parity Story 5.9 hard cap)
  - `hint?: string` — natural-language description of desired variety (e.g. "mix conservative + breakout")
  - `revise_tab_id?: string` — when set, return a single revised proposal for that tab (iterative refinement). When unset, return `count` fresh proposals.
  - `timeframe?: string` — default `"4h"`; agent picks based on user hint
  - `session_id: string` — **REQUIRED** (not optional). The merge contract (AC5) keys on `session_id + tab_id`. Optional would silently break merge when the agent forgets to pass it. If the agent does not have a session_id, validation fails fast at tool boundary.
- Posts to new backend route `POST /v1/router/vibe-trading/propose-multi` via `${EPSILON_API_URL}/v1/router/...` with `Bearer ${EPSILON_TOKEN}` (parity Story 5.9 tool pattern).
- Returns **string** (JSON) with shape:
  ```json
  {
    "success": true,
    "proposals": [
      {
        "tab_id": "strat-1",
        "summary": "Conservative SMA crossover on 4h candles, 10% position sizing, 3% stop loss",
        "strategy_family": "trend_following",
        "payload": { ...VibeTradingJobSchema-shaped... }
      },
      ...
    ]
  }
  ```
- On error: `{ success: false, error: "..." }` (no stack traces; sanitized).
- Timeout (right-sized for fast failure):
  - Phase 1 (templates only): `AbortSignal.timeout(5_000)` — template generation is <100ms server-side; 5s is generous margin for network.
  - Phase 2 (LLM-augmented, behind flag): `AbortSignal.timeout(15_000)` — single Claude call with structured output.
  - Never set to 28s: that masks server slowness behind misleading "client patience".

### AC2 — Backend route + service: proposal generation

**Given** the OpenCode tool calls `POST /v1/router/vibe-trading/propose-multi`
**When** the request hits apps/api

**Then** a new route at [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts) exists with:
- `combinedAuth` middleware (parity existing /backtest-multi)
- `proposeMultiBacktestSchema` Zod schema validating: `{ asset, count?: 2-5, hint?, revise_tab_id?, timeframe?, session_id }` (session_id required per AC1)
- **Tier policy (DISCOVERABILITY-FRIENDLY)**:
  - **Tier 1**: ALLOWED to propose (route returns 200). Proposals are free; tier1 can preview what running would do.
  - **Tier 2/3**: ALLOWED to propose AND to run (existing `/backtest-multi` enforces tier2 at execution time).
  - The proposal route itself does **NOT** 403 tier1. The Run gate stays where it already lives. Tool view surfaces "Tier 2 required to Run All" inline when caller tier is 1.
  - Implementation: `const tier = await resolveAccountTier(accountId);` is called only to **include `caller_tier` in the response** (the FE renders the Tier 2 upgrade hint accordingly). No 403 from this route on tier basis.
- Calls new service `proposeBacktestStrategies()` at [apps/api/src/router/services/vibe-trading.ts](apps/api/src/router/services/vibe-trading.ts)
- **Billing**: this route is FREE (no credit deduction). Cost lands when user clicks "Run All Approved" → calls existing `/backtest-multi`.
- **Rate limit (CRITICAL for LLM Phase 2)**: per-account in-memory throttle: max **10 calls/minute** per accountId. Required before flipping `BACKTEST_PROPOSAL_LLM_REFINE_ENABLED` to true. Implemented in [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts) as a simple `Map<accountId, timestamps[]>` (parity existing in-memory caches like `jit-cache.ts`). When exceeded, return 429 with `Retry-After`.
- Returns proposals JSON; 503 on LLM/service failure

**And** the service has this contract:
- Input: `{ asset, count, hint?, revise_tab_id?, timeframe? }`
- Output: `{ proposals: ProposalItem[], unit_cost_credits: number, caller_tier: 'tier1' | 'tier2' | 'tier3' }` where:
  - Each `ProposalItem.payload` validates against existing `VibeTradingJobSchema` (line 22 of vibe-trading.ts).
  - **Uniqueness guarantee**: `proposals[].strategy_family` MUST be unique within one response. When hint-keyword scoring would pick the same family twice (e.g., hint="conservative" matches both `conservative_dca` and `trend_sma` if we re-weight), the service rotates to the next-best UNUSED family. `count=5` therefore returns exactly the 5 hand-crafted families.
  - `unit_cost_credits` mirrors `getToolCost('vibe_trading_backtest', 0)` — FE displays "Total cost: N × unit" without a separate endpoint roundtrip (resolves architect's open trade-off T1).
  - `caller_tier` lets the FE render the "Tier 2 required to Run All" hint inline when value is `'tier1'`.
- Implementation: **template-first, LLM-augmented**:
  - **Phase 1 (must ship)**: hand-crafted template library at [apps/api/src/router/services/backtest-proposal-templates.ts](apps/api/src/router/services/backtest-proposal-templates.ts) — N=5 baseline strategies (trend-following SMA, trend-following EMA, mean-reversion RSI, breakout, conservative DCA). Service picks `count` templates that best match `hint` (simple keyword scoring) and fills in `asset` + `timeframe`. Always returns valid payloads. No LLM call.
  - **Phase 2 (nice-to-have, this story OR follow-up)**: LLM refinement via existing apps/api Anthropic proxy. Sends template + hint to Claude with structured-output JSON mode; validates result against `VibeTradingJobSchema`; falls back to template on validation failure. Behind feature flag `BACKTEST_PROPOSAL_LLM_REFINE_ENABLED`.

### AC3 — Tool view: `OcProposeBacktestMultiToolView`

**Given** the agent's tool call returns proposals
**When** the chat renders the tool result

**Then** a new component at [apps/web/src/components/thread/tool-views/opencode/OcProposeBacktestMultiToolView.tsx](apps/web/src/components/thread/tool-views/opencode/OcProposeBacktestMultiToolView.tsx) parses the JSON and renders:
- One **proposal card** per item with:
  - `summary` (human-readable, prominent)
  - Inline-editable numeric fields for the most-tweaked params (NO JSON editor, NO code view):
    - `initial_capital` (number input)
    - `historical_range` (number input, days, 1-730)
    - `position_sizing` (percentage slider 0-100%, displayed/sent as decimal 0-1)
    - `stop_loss` (percentage input, optional)
    - `take_profit` (percentage input, optional)
    - `timeframe` (select: 1m/5m/15m/1h/4h/1d/1w)
  - Read-only display of:
    - `assets`, `indicators`, `natural_language_rules`, `strategy_family`
  - Per-card buttons: **Approve** (checkbox-style toggle) / **Reject** (removes card, locally only — re-running propose tool replaces it) / **"Ask agent to change…"** (focuses chat input with prefix `Revise strategy "<label>": ` — user types the hint, hits Enter. Transparent + editable + reuses existing chat dispatch with no auto-send magic). Do NOT auto-send a hidden turn — user must see and confirm the message they're sending.
- Footer row with:
  - **"Run All Approved (N)"** button — disabled when fewer than 2 cards are approved
  - Total estimated cost: `N × unitCost` displayed (read `getToolCost('vibe_trading_backtest', 0)` via small public endpoint, or hard-code mirror from server)
  - "Cancel All" button (visible only when running)
- Visual states: `idle` (unrun) / `running` (per-card status badges from SSE) / `done` (results visible)

**And** clicking "Run All Approved":
- Calls existing `submitBacktestMulti(approvedPayloads)` from [apps/web/src/lib/backtest-api.ts](apps/web/src/lib/backtest-api.ts)
- Opens N SSE streams via existing `streamRun` (reuse the lifecycle, cancel-token, and mountedRef plumbing from [multi-strategy-editor.tsx](apps/web/src/components/backtest/multi-strategy-editor.tsx) — extract shared hook `useBacktestMultiRun()` to avoid duplication)
- Updates per-card status; on `phase_b` per stream, populates the inline `ComparisonVisualizer` (reused, NOT reimplemented)

### AC4 — Result display matches `/dashboard/backtest` quality

**Given** at least one SSE stream reaches `phase_b`
**When** the tool view transitions to results state

**Then** [apps/web/src/components/backtest/comparison-visualizer.tsx](apps/web/src/components/backtest/comparison-visualizer.tsx) renders inline (or in a slide-down panel beneath the proposal cards):
- KPI table with best-per-column highlighting (existing behavior)
- Equity Curve overlay with multi-strategy tooltip (existing)
- Correlation Heatmap (existing)
- "Promote to single view" button per row — opens promoted view inline OR in a modal (consistent with `/dashboard/backtest` UX)

**And** layout is responsive; on narrow chat panel widths (<800px), the KPI table is horizontally scrollable (already supported via existing `overflow-x-auto`).

### AC5 — Iterative refinement preserves other cards (Zustand store)

**Given** the user has approved cards 1 and 3 of three proposals
**When** the user asks the agent to revise card 2 ("làm bảo thủ hơn")
**And** the agent calls `propose_backtest_multi({ revise_tab_id: "strat-2", hint: "more conservative", session_id })`

**Then** the response contains exactly one proposal with `tab_id === "strat-2"`.
**And** the merged state (card 1 approval, card 2 revised summary+payload, card 3 approval) is reflected in the latest tool view render. Cards 1 and 3 retain their approval state, inline edits, and identities.

**Architectural decision (resolved 2026-05-21 architect review)**: OpenCode tool results are immutable thread messages. We pick model **(b) thread-scoped Zustand store keyed by `session_id`** over (a) "scan adjacent messages" because (a) is fragile to thread reorderings and intervening agent messages. Concretely:

- Create [apps/web/src/components/thread/tool-views/opencode/proposal-store.ts](apps/web/src/components/thread/tool-views/opencode/proposal-store.ts) — a small Zustand store with shape:
  ```ts
  interface ProposalStore {
    // keyed by session_id
    bySession: Record<string, {
      proposals: ProposalItem[];          // canonical merged stack
      approved: Record<string, boolean>;  // tab_id → approved
      edits: Record<string, Partial<Payload>>; // tab_id → user inline edits
      run: { submissions, statuses, runStates, executing } | null;
    }>;
    mergeFreshStack(sessionId, proposals): void; // replaces stack
    mergeRevisedProposal(sessionId, item): void; // merge by tab_id, preserve approved/edits for other tabs
    setApproved(sessionId, tabId, val): void;
    setEdit(sessionId, tabId, patch): void;
    reset(sessionId): void;
  }
  ```
- When `OcProposeBacktestMultiToolView` renders, it reads/subscribes to `bySession[session_id]`:
  - If `revise_tab_id` was set in the tool args (read from the tool message metadata) → call `mergeRevisedProposal(sessionId, proposals[0])`.
  - Otherwise → call `mergeFreshStack(sessionId, proposals)` (replaces the whole stack; previous approve/edits cleared).
- Two simultaneous tool views in the same session render the SAME canonical state — visually they look like one merged stack regardless of which tool message is on screen.
- **Race condition (revise during run)**: if `bySession[session_id].run !== null && run.statuses[revise_tab_id] === 'running'`, `mergeRevisedProposal` SKIPS the merge and toasts *"Cannot revise strategy while it's running — cancel first"*. Resolves architect's R-extra concern about race.

**Helper functions to unit-test (Task 7)**: `mergeRevisedProposal(state, item)`, `mergeFreshStack(state, proposals)`, `buildApprovedPayloads(state)`, `isRunAllReady(state)`. All pure — no React, no Zustand reference required for testing.

**Refresh behavior (resolved 2026-05-21)**: store is in-memory. After page reload, the store is empty; the tool message still exists in the thread. User must re-prompt agent OR click a "Restore from thread" affordance (the tool view, on mount, hydrates the store from the most recent `propose_backtest_multi` tool result message in the same session if `bySession[session_id]` is empty). Approve/edits across reload are lost — acceptable v1 limitation. Document this in the tool view's empty-store handler.

### AC6 — System-managed messaging (no BYOK leakage)

**Given** the user is using the agent-driven backtest flow
**When** the user reads any copy in: proposal cards, chat messages from the agent, error messages from the tool, or the rendered ComparisonVisualizer

**Then** there is ZERO mention of:
- "Configure your Anthropic / OpenAI / xAI API key"
- "Add ANTHROPIC_API_KEY / OPENAI_API_KEY"
- "Bring your own keys" / "BYOK"
- "Set up your LLM provider"

**And** the agent's system prompt for backtest interactions instructs: "You have system-managed access to LLM and Vibe-Trading. Never tell users they need to configure keys."

**And** any error originating from the proposal route is rewritten before surfacing — e.g., an Anthropic 401 from the LLM refinement path becomes `"Strategy generation temporarily unavailable; please try again in a moment"`, NOT `"Configure your API key"`.

### AC7 — Backward compatibility

**Given** the existing surfaces from Story 5.9
**When** Story 5.9.1 ships

**Then** the following remain unchanged and pass their existing tests:
- `/dashboard/backtest` single-strategy editor (Story 5.2)
- `/dashboard/backtest` multi-tab editor (Story 5.9 AC1)
- `ContextualBacktestModal` chat code-block flow (Story 5.9 AC6)
- `submitBacktestMulti` route + atomic billing semantics (Story 5.9 AC2, including the refund-on-all-fail patched 2026-05-21)
- `ComparisonVisualizer` render output (Story 5.9 AC3 + 2026-05-21 patches)

**And** the new agent-driven flow does NOT modify the backtest route, the editor, the visualizer, or the billing path — it only ADDS a proposal layer.

### AC8 — Tests

**Unit (backend):**
- [apps/api/src/__tests__/unit/vibe-trading-propose-multi-route.test.ts](apps/api/src/__tests__/unit/vibe-trading-propose-multi-route.test.ts) (NEW), source-inspection pattern (parity Story 5.9 backend test):
  - Validates `count` within `[2, 5]` returning 400
  - **session_id is required** (assert schema contains `session_id: z.string().min(1)`, not `.optional()`)
  - **No tier 403** on this route (assert route source does NOT contain `tier !== 'tier2'` 403 pattern)
  - Route does NOT call `deductCreditsRepo` / `deductToolCredits` (proposal is free)
  - Service module export present + imported
  - `revise_tab_id` branch returns single proposal (assert source contains the conditional)
  - Rate limit Map declared + 60s window + 10-call threshold (source assertions)
  - 429 response path with `Retry-After` header
- [apps/api/src/__tests__/unit/backtest-proposal-templates.test.ts](apps/api/src/__tests__/unit/backtest-proposal-templates.test.ts) (NEW):
  - Each template produces a payload that passes `VibeTradingJobSchema.safeParse` (module-load assertion mirror)
  - Hint keyword scoring picks the expected template for known hints ("conservative", "trend", "breakout", "mean reversion", "DCA")
  - Asset + timeframe substitution works correctly
  - `count=5` returns 5 unique strategy families (uniqueness guarantee)
  - When hint scoring would pick the same family twice, service rotates to next-best unused family

**Unit (frontend):**
- Existing utility tests at [comparison-visualizer.test.tsx](apps/web/src/components/backtest/__tests__/comparison-visualizer.test.tsx) remain unchanged — they cover the result rendering helpers that this story reuses.
- New lifecycle test at [apps/web/src/components/backtest/__tests__/multi-strategy-editor-lifecycle.test.ts](apps/web/src/components/backtest/__tests__/multi-strategy-editor-lifecycle.test.ts) (Task 4.0 safety net):
  - `runIdRef` increments per run; stale `onTimeout` IIFEs bail
  - `closeAllStreams` aborts all controllers
  - SSE callbacks no-op after unmount (mountedRef guard)
  - Behavior identical before and after Task 4.1 hook extraction
- New tests at [apps/web/src/components/thread/tool-views/opencode/__tests__/proposal-store.test.ts](apps/web/src/components/thread/tool-views/opencode/__tests__/proposal-store.test.ts):
  - `mergeFreshStack` replaces previous proposals and clears approve/edits for that session
  - `mergeRevisedProposal` replaces only the matching `tab_id`; other tabs' approve/edits preserved
  - `mergeRevisedProposal` short-circuits when target tab is running (status='running')
  - `buildApprovedPayloads` returns only approved tabs, with user edits applied
  - `isRunAllReady` true only when ≥2 cards approved AND no card currently running
  - Pattern: pure helpers (no Zustand instance needed for testing) — keep render-layer tests deferred until `@testing-library/react` lands (parity Story 5.9 AC5 carry-over)

**E2E (Playwright):**
- New spec at [tests/e2e/specs/chat-multi-backtest-agent.spec.ts](tests/e2e/specs/chat-multi-backtest-agent.spec.ts) (NEW) gated `BACKTEST_E2E_ENABLED=true`:
  - User types in chat: "Tạo 3 multi-strategy backtest cho BTC"
  - Verify proposal cards render (3 cards visible, each with editable position_sizing input)
  - Click Approve on all 3 cards
  - Click "Run All Approved" → wait for status badges to leave "running"
  - Assert `ComparisonVisualizer` heading + Equity Curve + Heatmap visible

## Tasks / Subtasks

- [ ] **Task 1: Backend service + templates** (AC2)
  - [x] 1.1 Create [apps/api/src/router/services/backtest-proposal-templates.ts](apps/api/src/router/services/backtest-proposal-templates.ts) with 5 hand-crafted templates: `trend_sma`, `trend_ema`, `mean_reversion_rsi`, `breakout`, `conservative_dca`. Each is a function `(asset, timeframe) => VibeTradingJobSchema-shaped payload`.
  - [x] 1.2 Implement `proposeBacktestStrategies(args)` in [apps/api/src/router/services/vibe-trading.ts](apps/api/src/router/services/vibe-trading.ts) — hint-to-template keyword scoring, count slicing, tab_id generation (`strat-${nanoid(6)}`), summary string generation per template. **Service must guarantee `strategy_family` uniqueness within one response** (rotate to next-best UNUSED family when scoring picks a duplicate).
  - [x] 1.3 Single-proposal revision path: when `revise_tab_id` is set, pick the template best matching the new hint (or rotate to next family) and return one proposal with the existing `tab_id`.
  - [ ] 1.4 Validate every returned payload against `VibeTradingJobSchema` at **module load time** (one assertion per template at module init) — a template regression fails the dev build, not the user request.
  - [x] 1.5 Service response shape includes `unit_cost_credits` (mirror `getToolCost('vibe_trading_backtest', 0)`) and `caller_tier` (passed from route).

- [x] **Task 2: Backend route + rate limit** (AC2 + AC6 + AC7)
  - [x] 2.1 Add `POST /propose-multi` to [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts) with `combinedAuth` + Zod schema (`session_id` required). NO tier 403 — tier1 allowed to propose. Pass tier to service for `caller_tier` response field.
  - [x] 2.2 Implement per-account rate limit: `Map<accountId, number[]>` of recent timestamps; window 60s, max 10 calls. Exceeded → 429 with `Retry-After` header. Map cleanup on each call (drop entries older than 60s). Pattern parity with [jit-cache.ts](apps/api/src/router/services/jit-cache.ts).
  - [x] 2.3 Add tier-bypass log (parity existing routes; sanitize all string inputs that get echoed into logs/responses with `.replace(/[\r\n\t]/g, ' ').slice(0, 64)`).
  - [x] 2.4 NO billing call (proposal is free).
  - [x] 2.5 Error normalization: any internal LLM/Anthropic error path returns generic "Strategy generation temporarily unavailable" — never leaks "API key" / "Anthropic" verbiage to client.
  - [x] 2.6 Write source-inspection unit tests per AC8 backend section (assertions include: no `deductCreditsRepo` call, rate-limit Map exists, no tier403).

- [ ] **Task 3: OpenCode tool wrapper** (AC1 + AC6)
  - [x] 3.1 Create [core/epsilon-master/opencode/tools/propose_backtest_multi.ts](core/epsilon-master/opencode/tools/propose_backtest_multi.ts) following [vibe_trading_backtest.ts](core/epsilon-master/opencode/tools/vibe_trading_backtest.ts) shape (description, args, execute) — calls the new `/propose-multi` route, returns JSON string.
  - [x] 3.2 Description block must include: tier requirement, asset format docs (mirror existing), and a strong CRITICAL EXECUTION POLICY: "When user asks for multi-strategy backtest in natural language, call this tool BEFORE writing any JSON. Never instruct user to configure LLM/API keys."
  - [x] 3.3 Add timeout `AbortSignal.timeout(28_000)`; sanitize upstream errors via existing `sanitizeUpstreamErr` lib.
  - [x] 3.4 Add unit test at [core/epsilon-master/opencode/tools/__tests__/propose_backtest_multi.test.ts](core/epsilon-master/opencode/tools/__tests__/propose_backtest_multi.test.ts) — mock fetch, verify the tool returns valid JSON, surfaces upstream errors, respects timeout.

- [ ] **Task 4: Extract shared backtest-run hook** (AC3 + AC7)
  - [x] 4.0 **Safety net FIRST (mandatory)**: write a unit test for the existing `multi-strategy-editor.tsx` SSE lifecycle BEFORE extraction. Mock `submitBacktestMulti` and `streamRun`, assert: (a) `setExecuting(true)` fires before submit; (b) `runIdRef` increments per `runAll` call; (c) `closeAllStreams` aborts all controllers; (d) `onTimeout` IIFE bails when `runIdRef` advances. Save as [apps/web/src/components/backtest/__tests__/multi-strategy-editor-lifecycle.test.ts](apps/web/src/components/backtest/__tests__/multi-strategy-editor-lifecycle.test.ts). Pure-helper style (no `@testing-library/react`).
  - [x] 4.1 Extract the multi-strategy submit + SSE + cancel-token + status-map logic from [multi-strategy-editor.tsx](apps/web/src/components/backtest/multi-strategy-editor.tsx) into a reusable hook [apps/web/src/components/backtest/use-multi-backtest-run.ts](apps/web/src/components/backtest/use-multi-backtest-run.ts). This MUST NOT change behavior of the existing editor — re-run the Task 4.0 tests after extraction; all must still pass.
  - [x] 4.2 Hook returns: `{ run, cancelAll, retry, submissions, statuses, runStates, executing }`.
  - [ ] 4.3 Wire the existing `multi-strategy-editor.tsx` to use the new hook (replaces inline lifecycle). Re-run all 5.9 fast-tier tests + the e2e spec locally; assert green.

- [ ] **Task 5: Tool view component + proposal store** (AC3 + AC4 + AC5 + AC6)
  - [x] 5.0 **First**: create [apps/web/src/components/thread/tool-views/opencode/proposal-store.ts](apps/web/src/components/thread/tool-views/opencode/proposal-store.ts) — Zustand store per AC5 shape spec. Export pure helpers `mergeRevisedProposal`, `mergeFreshStack`, `buildApprovedPayloads`, `isRunAllReady` separately from the store (helpers take state as arg, return new state — testable without Zustand).
  - [x] 5.1 Create [OcProposeBacktestMultiToolView.tsx](apps/web/src/components/thread/tool-views/opencode/OcProposeBacktestMultiToolView.tsx).
  - [ ] 5.2 Parse the tool result JSON (defensive: validate shape with Zod; show error card on malformed).
  - [x] 5.3 On mount, read tool args from message metadata; dispatch `mergeFreshStack` (no revise_tab_id) or `mergeRevisedProposal` (revise_tab_id set). If store is empty AND multiple `propose_backtest_multi` results exist in the thread, hydrate from the most recent.
  - [ ] 5.4 Render proposal cards from `bySession[session_id].proposals`. Read approval/edits from same store. Inline numeric edits dispatch `setEdit`. Approve toggle dispatches `setApproved`. Show "Tier 2 required to Run All" hint when `caller_tier === 'tier1'`.
  - [x] 5.5 Wire "Run All Approved" → reads `buildApprovedPayloads(state)` → calls `useMultiBacktestRun().run(payloads)` from Task 4. Updates per-card status as SSE arrives.
  - [ ] 5.6 Disable revise merge when target tab is running: `mergeRevisedProposal` checks `bySession[session_id].run?.statuses[revise_tab_id] === 'running'` and short-circuits with a toast.
  - [x] 5.7 On `phase_b`, render `<ComparisonVisualizer>` inline (passed `submissions`, `runStates`, `tabLabels`).
  - [x] 5.8 Register in [apps/web/src/components/session/tool-renderers.tsx](apps/web/src/components/session/tool-renderers.tsx): `propose_backtest_multi`, `propose-backtest-multi`, `oc_propose_backtest_multi`, `oc-propose-backtest-multi` (parity Story 5.5 swarm registration).

- [x] **Task 6: Agent system-prompt update** (AC1 + AC6)
  - [x] 6.1 Identify the agent(s) that handle backtest requests (likely the tier 2 sub-agent + chainlens main agent). Search [core/epsilon-master/opencode/agents/](core/epsilon-master/opencode/agents/) for backtest-related prompt sections.
  - [x] 6.2 Add (or update) a prompt section instructing the agent to prefer `propose_backtest_multi` when the user request is multi-strategy or vague-strategy. Single-strategy direct execution still uses `vibe_trading_backtest`.
  - [x] 6.3 Add the explicit "never mention API keys / LLM provider configuration" instruction.

- [ ] **Task 7: Frontend pure-helper tests** (AC8)
  - [x] 7.1 Unit-test `mergeRevisedProposal`, `buildApprovedPayloads`, `isRunAllReady` helpers in the tool view module.
  - [ ] 7.2 If `@testing-library/react` is installed by a future story, also add render tests (current story leaves render tests out per Story 5.9 deferred-item carry-over).

- [ ] **Task 8: E2E spec** (AC8)
  - [x] 8.1 Create [tests/e2e/specs/chat-multi-backtest-agent.spec.ts](tests/e2e/specs/chat-multi-backtest-agent.spec.ts) — gate behind `BACKTEST_E2E_ENABLED=true`.
  - [x] 8.2 Use existing helpers from [tests/e2e/helpers/auth.ts](tests/e2e/helpers/auth.ts).

- [ ] **Task 9: Docs**
  - [ ] 9.1 Brief update in epic 5 retrospective: chat-native backtest flow shipped via 5.9.1.
  - [x] 9.2 Note in CLAUDE.md `## Stack & Architecture` that backtest agent uses platform-managed LLM (parity existing convention).

## Dev Notes

### Critical guardrails

- **DO NOT** add `@testing-library/react` as a dep solely for this story — frontend test strategy stays pure-helper + e2e (parity Story 5.9 deferred item).
- **DO NOT** modify the backtest route, billing path, atomic deduction logic, or `ComparisonVisualizer` rendering — this story ADDS a proposal layer; downstream is unchanged.
- **DO NOT** call an LLM at proposal time in Phase 1 of Task 1 — templates are deterministic. LLM refinement is Phase 2 behind a flag.
- **DO NOT** flip `BACKTEST_PROPOSAL_LLM_REFINE_ENABLED=true` in any environment without the per-account rate limit (AC2 — 10 calls/min) already deployed and verified. LLM cost amplification is the worst-case failure mode of this story.
- **DO NOT** 403 tier1 from the proposal route. Tier1 can preview; running gates at `/backtest-multi` (existing). This preserves discoverability intent.
- **DO NOT** mention API keys, LLM provider names, or BYOK anywhere in the new code or copy (AC6). Audit the agent prompt + every error string.
- **DO NOT** auto-send hidden chat turns from "Ask agent to change…" — only prefill the user input. Hidden turns make the chat opaque.
- **DO NOT** extract `useMultiBacktestRun()` without writing the Task 4.0 lifecycle test first. The existing editor is the safety net.
- **DO NOT** allow `session_id` to be optional in the tool args. AC5 merge contract depends on it; optional fields silently break merge.
- **DO NOT** attempt to merge a revised proposal into a tab whose backtest is currently running — the proposal store skips and toasts.
- **DO** validate every template's payload against `VibeTradingJobSchema` at module load time (run-once assertion) so a template bug fails the build, not the user.
- **DO** keep the existing `/dashboard/backtest` page available — the new chat flow is additive, not a replacement. Some users may still prefer JSON5 authoring.
- **DO** reuse `useMultiBacktestRun()` (Task 4 extraction) in BOTH the existing editor and the new tool view to avoid drift.
- **DO** include `unit_cost_credits` and `caller_tier` in every `/propose-multi` response (resolves currency-display and tier-hint UX without extra endpoints).
- **DO** guarantee `proposals[].strategy_family` uniqueness within one response (AC2 service contract).

### Existing helpers to reuse

- `VibeTradingJobSchema` ([vibe-trading.ts:22](apps/api/src/router/routes/vibe-trading.ts#L22)) — strict shape for proposal payloads
- `submitBacktestMulti` ([backtest-api.ts:114](apps/web/src/lib/backtest-api.ts#L114)) — never reimplement
- `streamRun` ([backtest-api.ts:270](apps/web/src/lib/backtest-api.ts#L270)) — SSE lifecycle
- `ComparisonVisualizer` — render unchanged
- `combinedAuth`, `resolveAccountTier` — existing tier policy
- `sanitizeUpstreamErr` ([core/epsilon-master/opencode/tools/lib/sanitize.ts](core/epsilon-master/opencode/tools/lib/sanitize.ts)) — error normalization

### Out of scope

- Saving proposals as named templates / "my strategies" library — separate story
- Backtest history page — separate story
- Sidebar / command palette entry for `/dashboard/backtest` — separate (could be 5.9.2)
- LLM-augmented proposal generation (Phase 2 of Task 1) — gated behind feature flag, not required to ship
- Onboarding tour / first-run tooltips — separate UX story
- Mobile chat layout polish — out of scope; desktop chat first

## References

- [Source: _bmad-output/implementation-artifacts/5-9-multi-strategy-backtest-comparison.md] — parent story (multi-strategy core)
- [Source: core/epsilon-master/opencode/tools/vibe_trading_backtest.ts] — tool wrapper pattern reference
- [Source: apps/api/src/router/routes/vibe-trading.ts] — existing route patterns (`/jobs`, `/backtest-multi`, tier gate)
- [Source: apps/web/src/components/backtest/multi-strategy-editor.tsx] — submit + SSE lifecycle (Task 4 source)
- [Source: apps/web/src/components/thread/tool-views/opencode/OcVibeTradingSwarmToolView.tsx] — tool view pattern with progress + cancel (closest parallel)
- [Source: CLAUDE.md § Vibe-Trading async swarm pattern] — async start/poll/finalize convention (proposal route is sync; backtest run path is the async one)

## Architect Review (2026-05-21, Winston)

Spec passed architect review on second pass. Eight resolved items recorded for traceability:

- **R1 — AC5 merge contract**: resolved as Zustand store keyed by `session_id` (option b). `mergeRevisedProposal` is a pure helper, testable without React. Race-condition rule explicit: skip merge when target tab is running.
- **R2 — Tier gate**: split across routes. Tier1 CAN propose (free, discoverability-friendly). Tier2 required at `/backtest-multi` (existing). Proposal response includes `caller_tier` for FE upgrade-hint rendering.
- **R3 — LLM Phase 2 cost amplification**: Phase 2 cannot be enabled without per-account rate limit (10/min) shipped. Guardrail explicit; rate-limit work moved INTO this story (Task 2.2).
- **R4 — Tool timeouts**: 28s collapsed to 5s (templates) / 15s (LLM). Faster failure = better UX.
- **R5 — `session_id`**: required (not optional). Validation fails at tool boundary if missing.
- **R6 — Hook extraction safety net**: Task 4.0 mandates writing lifecycle tests BEFORE extraction. Same tests must pass post-extraction.
- **R7 — "Ask agent to change" UX**: pick (a) focus + prefix. No hidden auto-send.
- **R8 — `strategy_family` uniqueness**: lifted from test-only assertion into the service contract.
- **Plus**: `unit_cost_credits` + `caller_tier` returned by `/propose-multi` (resolves currency-display trade-off without extra endpoint); refresh behavior documented as v1 acceptable with hydrate-from-thread on mount.

Open items deferred to follow-up (acknowledged, not blocking):
- Localization of `summary` field (English server-side; agent paraphrases in chat per session locale)
- "Append 1 more strategy" UX (out of scope; user starts a fresh stack)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex (CLI)

### Debug Log References
- `bun test src/__tests__/unit/vibe-trading-propose-multi-route.test.ts src/__tests__/unit/backtest-proposal-templates.test.ts` (pass)
- `bun test __tests__/propose_backtest_multi.test.ts` in `core/epsilon-master/opencode/tools` (pass)
- `bun test src/components/thread/tool-views/opencode/__tests__/proposal-store.test.ts` in `apps/web` (pass)
- `bun test src/components/backtest/__tests__/multi-strategy-editor-lifecycle.test.ts src/components/thread/tool-views/opencode/__tests__/proposal-store.test.ts` in `apps/web` (pass)

### Completion Notes List
- Added backend proposal template library with 5 strategy families and hint ranking.
- Added `proposeBacktestStrategies()` service contract with caller tier + unit cost output.
- Added `POST /v1/router/vibe-trading/propose-multi` route with 10 calls/min/account rate limit and 429 `Retry-After`.
- Added OpenCode tool `propose_backtest_multi` with required `session_id` and sanitized upstream error handling.
- Added new FE proposal store + helper tests and registered tool renderer aliases.
- Extracted shared run lifecycle hook `useMultiBacktestRun()` and rewired `multi-strategy-editor.tsx` to it.
- Wired tool view "Run All Approved" to shared run hook and inline `ComparisonVisualizer`.
- Added Playwright E2E spec skeleton for chat-native proposal flow, gated by `BACKTEST_E2E_ENABLED=true`.
- Updated tier agent prompts to allow/provide proposal flow without user key-setup language.
- Remaining work: Task 1.4 strict `VibeTradingJobSchema` module-load validation, Task 4.3 full fast-tier/e2e verification, Task 5.2 + 5.4 + 5.6 polish, Task 9.1 retrospective note.

### File List
- apps/api/src/router/services/backtest-proposal-templates.ts
- apps/api/src/router/services/vibe-trading.ts
- apps/api/src/router/routes/vibe-trading.ts
- apps/api/src/__tests__/unit/vibe-trading-propose-multi-route.test.ts
- apps/api/src/__tests__/unit/backtest-proposal-templates.test.ts
- core/epsilon-master/opencode/tools/propose_backtest_multi.ts
- core/epsilon-master/opencode/tools/__tests__/propose_backtest_multi.test.ts
- apps/web/src/components/thread/tool-views/opencode/proposal-store.ts
- apps/web/src/components/thread/tool-views/opencode/__tests__/proposal-store.test.ts
- apps/web/src/components/thread/tool-views/opencode/OcProposeBacktestMultiToolView.tsx
- apps/web/src/components/backtest/use-multi-backtest-run.ts
- apps/web/src/components/backtest/__tests__/multi-strategy-editor-lifecycle.test.ts
- apps/web/src/components/session/tool-renderers.tsx
- tests/e2e/specs/chat-multi-backtest-agent.spec.ts
- CLAUDE.md
- core/epsilon-master/opencode/agents/chainlens-tier1.md
- core/epsilon-master/opencode/agents/chainlens-tier2.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
