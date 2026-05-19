# Story 5.5.1: Vibe-Trading Swarm — Async Execution Pattern

Status: done

**Epic:** 5 — Vibe-Trading Platform
**Type:** P1 architectural defect follow-up to Story 5.5
**Parent:** [Story 5.5](5-5-vibe-trading-mcp-proxy.md) done
**Created:** 2026-05-19
**Depends on:** Story 5.5 done (proxy + 22 tools registered); Story 5.6 done (Swarm Teams UI page)
**Blocks:** Tier 2 production use of `run_swarm` via Chainlens (currently 100% fail at proxy timeout)
**FRs:** Restore originally-specified async polling behaviour for `run_swarm` (see Context below)
**NFRs:** NFR8 (atomic billing on async job), NFR10 (sandbox egress unchanged)
**Estimated effort:** 1.5 days. **Owner:** TBD

## Context

**Why this story exists.** Today's integration test (2026-05-19) verified all 22 Vibe-Trading MCP tools end-to-end. 19/22 pass; `run_swarm` is the only tool that **cannot complete via the production Chainlens path** because of an architectural mismatch between Story 5.5's proxy and the swarm's actual runtime characteristics.

**The defect, with receipts:**

| Layer | Current behaviour | Constraint |
|---|---|---|
| [Vibe-Trading/agent/mcp_server.py:430-482](Vibe-Trading/agent/mcp_server.py#L430) — `run_swarm` MCP tool | Blocks synchronously, polls `store.load_run()` every 5s for **up to 30 minutes** | Internal loop `for _ in range(360): time.sleep(5)` at lines 462-463 |
| [apps/api/src/router/routes/vibe-trading-mcp.ts:85](apps/api/src/router/routes/vibe-trading-mcp.ts#L85) — proxy | `AbortSignal.timeout(30_000)` on all `tools/call` | Sets HTTP budget at 30s |
| Story 5.5 NFR Performance Budget | "tools/call heavy (factor_analysis, shadow backtest) <30s — matches `AbortSignal.timeout(30_000)`" | `run_swarm` was **omitted from this budget analysis** |
| Story 5.6 Dev Notes original design intent | "Use the `run_swarm` MCP tool. Stream the run_id back, then poll `get_swarm_run_status` every 30s until status=done" | Async polling pattern. **Implementation diverged.** |

**End-to-end consequence.** A Tier 2 user invoking the `investment_committee` preset (8 agents × 4-10 LLM calls per agent = 5-15 min real time) gets a **503 from `apps/api` after exactly 30 seconds**, while the swarm continues running in the VT container with no consumer for the result. Billing already deducted 0.25 credits per [config.ts:1008](apps/api/src/config.ts#L1008) at the failed proxy hop. UI shows error. Run completes 10 minutes later into the void.

**Other long-running tools at risk (deferred to follow-up story).** Validator review (2026-05-19) confirmed `backtest`, `factor_analysis`, `run_shadow_backtest`, and `render_shadow_report` also run synchronously and can exceed 30s on large datasets. They currently work because typical inputs stay under budget, but they share the same architectural defect. Tracked in [deferred-work.md](deferred-work.md) — out of scope for 5.5.1, which focuses specifically on `run_swarm` (the only tool that **always** exceeds 30s for any non-trivial preset).

**Verified during integration test (today):**
- Direct call to `run_swarm` via SSE-without-proxy succeeded (no 30s gate).
- v98store LLM key works (`gpt-4o` responds correctly via OpenAI-compatible endpoint).
- `SwarmStore` already persists runs to disk and survives process restart.
- `get_swarm_status` and `get_run_result` MCP tools already exist (added in 5.5) but are not consumed by any caller.

**Original 5.6 design was correct.** This story restores it.

## Story

As a **Tier 2 user on Chainlens**,
I want **multi-agent swarm research (`run_swarm`) to actually complete and stream agent-by-agent progress in chat**,
so that **I can run the 6-8 agent investment committee / quant desk / risk committee presets without the request 503-ing at 30 seconds**.

## Acceptance Criteria

### AC1 — `start_swarm` MCP tool (fire-and-forget)

**Given** [Vibe-Trading/agent/mcp_server.py](Vibe-Trading/agent/mcp_server.py) currently exposes a synchronous `run_swarm` that blocks for up to 30 minutes,

**When** Story 5.5.1 ships,

**Then** a new MCP tool `start_swarm(preset_name, variables, account_id)` is added that:
- Calls `SwarmRuntime.start_run(...)` (already exists, [src/swarm/runtime.py:72](Vibe-Trading/agent/src/swarm/runtime.py#L72)) — background thread spawn pattern unchanged
- Returns `{"run_id": "<uuid>", "preset": "<name>", "status": "started"}` in **<2 seconds** (P95)
- Does NOT poll `store.load_run()` — return immediately after the runtime hands back the `SwarmRun` object
- Validates `preset_name` against `list_presets()` before spawning — return `{"status":"error","error":"unknown preset"}` if invalid (no thread spawned, no DB write)
- **Persists `account_id` on the SwarmRun record** (see AC1b ownership model below)

**And** the existing `run_swarm` tool stays in place for backwards compatibility but adds a docstring deprecation notice referencing this story.

**And** `get_swarm_status(run_id)` and `get_run_result(run_id)` tools (already in 5.5) are verified callable from the proxy with the same 30s budget — no body changes to them except adding the ownership check from AC1b.

### AC1b — Run ownership model (security blocker fix)

**Given** validator review (2026-05-19) confirmed that `get_swarm_status(run_id)` at [mcp_server.py:652](Vibe-Trading/agent/mcp_server.py#L652) and `get_run_result(run_id)` at [mcp_server.py:669](Vibe-Trading/agent/mcp_server.py#L669) currently perform **no ownership validation**, and the `SwarmRun` model in [src/swarm/models.py](Vibe-Trading/agent/src/swarm/models.py) has no `account_id` field — any caller with a valid `run_id` can read any other account's run,

**When** Story 5.5.1 ships,

**Then** ownership gating is introduced at the proxy layer (preferred — keeps MCP server account-agnostic):

```typescript
// apps/api/src/router/routes/vibe-trading-mcp.ts
// In-memory map populated on start_swarm, consulted on status/result/cancel
const runOwnership = new Map<string, { accountId: string; expiresAt: number }>();
const RUN_OWNERSHIP_TTL_MS = 24 * 60 * 60 * 1000;  // 24h

// On start_swarm success: extract run_id from response body, store mapping
// On get_swarm_status / get_run_result / cancel_swarm:
//   parse run_id from request params, reject 403 if owner != accountId
```

**And** the in-memory map is acceptable for V1 because:
- Map lost on `apps/api` restart → falls back to "deny unknown run_ids" (fail-closed)
- Users can re-discover their own runs via `list_runs(account_id)` MCP tool (already exists in 5.5)
- A future story can promote to DB-backed when usage justifies the complexity

**And** the proxy returns `403 Forbidden { error: "Run not owned by this account" }` for any cross-account access attempt. Logged as `[swarm-ownership-violation]` for audit.

**And** if the in-memory map is empty for a given `run_id` (e.g. after proxy restart) AND the requesting account calls `list_runs`, the proxy populates the map by calling `list_runs(account_id)` and caching the returned `run_id` list. This re-hydrates ownership without DB changes.

### AC2 — Proxy: reject sync `run_swarm`, allow async trio

**Given** [apps/api/src/router/routes/vibe-trading-mcp.ts](apps/api/src/router/routes/vibe-trading-mcp.ts) hard-codes `AbortSignal.timeout(30_000)` on every `tools/call`,

**When** Story 5.5.1 ships,

**Then** add a `LONG_RUNNING_TOOLS_DENY` deny-list in the proxy:

```typescript
// SCOPED TO THIS STORY — only run_swarm has the always-exceeds-30s property.
// Other long-running tools (backtest, factor_analysis, run_shadow_backtest,
// render_shadow_report) work today with typical inputs <30s; deferred to
// follow-up story per deferred-work.md.
const LONG_RUNNING_TOOLS_DENY = new Set(['run_swarm']);

if (isBillable) {
  const toolName = jsonRpc?.params?.name;
  if (toolName && LONG_RUNNING_TOOLS_DENY.has(toolName)) {
    return c.json({
      error: 'run_swarm is deprecated via proxy — use start_swarm + get_swarm_status pattern',
      migration: 'See _bmad-output/implementation-artifacts/5-5-1-vibe-trading-swarm-async-execution.md',
    }, 410);  // Gone
  }
  // ... rest of existing flow
}
```

**And** billing entries added to [config.ts:858 area](apps/api/src/config.ts#L858) `TOOL_PRICING` (see AC5 for the full set):
- `vt_mcp_start_swarm: { baseCost: 0.05, perResultCost: 0, markupMultiplier: 1.0 }` (deposit)
- `vt_mcp_run_swarm_finalize: { baseCost: 0.20, perResultCost: 0, markupMultiplier: 1.0 }` (finalize)
- `vt_mcp_cancel_swarm: { baseCost: 0, perResultCost: 0, markupMultiplier: 1.0 }` (free abort)
- `vt_mcp_run_swarm: { baseCost: 0.25, ... }` kept — proxy 410 prevents billing reaching it for production path; direct sandbox bypass (test only) still bills correctly.

**And** `start_swarm`, `get_swarm_status`, `get_run_result`, `cancel_swarm` all fit the existing 30s proxy budget — no proxy timeout changes.

### AC3 — OpenCode wrapper tool with progress streaming

**Given** [core/epsilon-master/opencode/tools/vibe_trading_backtest.ts](core/epsilon-master/opencode/tools/vibe_trading_backtest.ts) is the reference pattern for an OpenCode tool calling Chainlens billing proxy, **and** validator review (2026-05-19) confirmed the backtest tool does NOT use `ctx.write` (it returns a final JSON string only — `execute(args, _ctx)` ignores the context),

**When** Story 5.5.1 ships,

**Then** Task 3.0 (research subtask, ≤30 min) verifies the actual streaming API in the installed `@opencode-ai/plugin` version:
- Read `node_modules/@opencode-ai/plugin/dist/*.d.ts` for the `ToolContext` type
- If `ctx.write` or `ctx.output` exists with streaming semantics → use it
- If no streaming API → tool returns final result only (no live progress). Acceptable MVP fallback; UI component (AC4) renders the report when the tool resolves.

**And** the tool is created at `core/epsilon-master/opencode/tools/vibe_trading_swarm.ts` (auto-discovered per [tools/README.md](core/epsilon-master/opencode/tools/README.md) — "Each `.ts` file is auto-discovered and registered as a tool", no index.ts needed):

```typescript
// Skeleton (full impl during dev — adjust streaming based on Task 3.0 outcome)
import { tool } from '@opencode-ai/plugin';

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000;  // 30 min ceiling

export const vibe_trading_swarm = tool({
  description: 'Run a multi-agent investment swarm. 6-15 min execution. Use list_swarm_presets first.',
  args: {
    preset: tool.schema.string().describe('Preset name (e.g. investment_committee)'),
    variables: tool.schema.record(tool.schema.string()).describe('Required variables for preset'),
  },
  async execute({ preset, variables }, ctx) {
    // 1. Start swarm — single POST through proxy, billed 0.05 deposit
    const startResp = await callMcp('start_swarm', { preset_name: preset, variables });
    const { run_id } = JSON.parse(startResp).result;
    const progress: string[] = [`▶️ Swarm started: ${preset} (run_id: ${run_id.slice(0, 8)}...)`];

    // 2. Poll loop — each get_swarm_status is a free tools/call (baseCost 0)
    const startTime = Date.now();
    let lastDone = -1;
    try {
      while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
        // Cooperative cancel — if OpenCode signals abort via AbortSignal, exit gracefully
        if (ctx.abortSignal?.aborted) {
          await callMcp('cancel_swarm', { run_id });  // AC5b cancel
          return `🛑 Swarm cancelled by user. run_id=${run_id}`;
        }
        await sleep(POLL_INTERVAL_MS);
        const statusResp = await callMcp('get_swarm_status', { run_id });
        const status = JSON.parse(statusResp).result;
        const done = status.tasks?.filter((t: any) => ['completed', 'failed'].includes(t.status)).length ?? 0;
        const total = status.tasks?.length ?? 0;

        if (done !== lastDone) {
          progress.push(`⏳ ${done}/${total} agents complete`);
          lastDone = done;
        }

        if (['completed', 'failed', 'cancelled'].includes(status.status)) {
          const resultResp = await callMcp('get_run_result', { run_id });
          const result = JSON.parse(resultResp).result;
          return [
            ...progress,
            '',
            '---',
            '',
            result.final_report || `Swarm ${status.status}, no report produced`,
          ].join('\n');
        }
      }
      // Client-side timeout — fire cancel to stop server-side compute
      await callMcp('cancel_swarm', { run_id });
      return `❌ Swarm timed out client-side after 30min. Server stopped. run_id=${run_id}`;
    } catch (err) {
      // Fire-and-forget cancel on unexpected exit so user isn't charged for runaway compute
      await callMcp('cancel_swarm', { run_id }).catch(() => {});
      throw err;
    }
  },
});
```

**And** if Task 3.0 confirms `ctx.write` exists with streaming semantics, replace the `progress.push(...)` calls with `await ctx.write(line + '\n')` and drop the buffered `progress` array.

**And** Tier 2 agent system prompt ([core/epsilon-master/opencode/agents/chainlens-tier2.md](core/epsilon-master/opencode/agents/chainlens-tier2.md)) is updated to reference `vibe_trading_swarm` as the canonical entry point; `run_swarm` (raw MCP) is removed from the documented Tier 2 tool list.

**Enhancement opportunity (NOT in scope for V1, tracked in deferred-work.md):** `SwarmRuntime.start_run()` already accepts a `live_callback: Callable` parameter ([runtime.py:76](Vibe-Trading/agent/src/swarm/runtime.py#L76)) which receives every `SwarmEvent` in real time. Events are also persisted to `events.jsonl` in the SwarmStore. A future story can:
- Add a `tail_swarm_events(run_id, since_offset)` MCP tool that reads `events.jsonl` incrementally
- OpenCode wrapper switches from 5s polling to event-driven streaming (≤200ms latency per agent transition)
- Or: add a streaming MCP endpoint that pipes `live_callback` events directly through SSE

V1 uses 5s polling — simpler, fits existing patterns, latency acceptable for 6-15 min swarms.

### AC4 — UI tool view component

**Given** session-chat renders tool execution via the `ToolRegistry.register(name, Component)` pattern at [apps/web/src/components/session/tool-renderers.tsx](apps/web/src/components/session/tool-renderers.tsx),

**When** Story 5.5.1 ships,

**Then** add `apps/web/src/components/thread/tool-views/opencode/OcVibeTradingSwarmToolView.tsx`:
- Parses `▶️ Swarm started`, `⏳ N/M agents complete`, and final markdown report from tool stdout
- Renders a progress strip with one row per agent (Pending / Running / Done / Failed states) — derive from progress lines
- Renders final report block as markdown (reuse existing markdown renderer)
- Falls back gracefully when stdout doesn't match the expected format (e.g. timeout error)
- Registered via `ToolRegistry.register('vibe_trading_swarm', OcVibeTradingSwarmToolView)` in [tool-renderers.tsx](apps/web/src/components/session/tool-renderers.tsx)

**And** the `/dashboard/swarm-teams` page (shipped in Story 5.6) is updated so its "Run" button uses the new `vibe_trading_swarm` OpenCode tool path (verify the page currently sends `run_swarm` and switch to wrapper).

### AC5 — Billing reconciliation (deposit + finalize)

**Given** the proxy bills on every `tools/call` via `deductToolCredits` and start/status/result are now 3 separate calls,

**When** Story 5.5.1 ships,

**Then** billing aligns to the actual work:
- `start_swarm` → 0.05 credit deposit (regardless of outcome — covers spawn + queueing)
- `get_swarm_status` → 0 (lightweight read, free poll)
- `get_run_result` → 0.20 credit on first call where `status==completed` (finalize); 0 if status=failed/cancelled. Subsequent reads of the same run_id are free (idempotent).
- Total successful run: 0.05 + 0.20 = **0.25 credits** (parity with old flat `run_swarm` charge — no price hike)
- Failed swarm: 0.05 deposit only (user not charged for compute they didn't get)

**Implementation note (revised after validator review 2026-05-19):** Validator confirmed [`deductToolCredits` signature](apps/api/src/router/services/billing.ts#L48) **does NOT accept an `idempotencyKey` parameter today** (word "idempotency" absent from billing.ts). To avoid a cross-cutting billing migration, we use a **`SwarmRun.finalized` flag** owned by the proxy's in-memory ownership map:

```typescript
// apps/api/src/router/routes/vibe-trading-mcp.ts
const runOwnership = new Map<string, {
  accountId: string;
  expiresAt: number;
  finalized: boolean;  // NEW — guards against double-finalize on retry
}>();

// In the get_run_result POST handler, after the upstream MCP responds:
const body = await resp.text();
const result = JSON.parse(body);
if (result.result?.status === 'completed') {
  const entry = runOwnership.get(run_id);
  if (entry && !entry.finalized) {
    await deductToolCredits(entry.accountId, 'vt_mcp_run_swarm_finalize', 0, `Swarm completed: ${run_id}`);
    entry.finalized = true;  // idempotent — second call is a no-op
  }
}
return new Response(body, { ... });
```

The `finalized` flag on the in-memory entry IS the idempotency mechanism. Survives within a single `apps/api` process lifetime. On restart: ownership map cleared → both ownership and finalize state lost → user can re-fetch result (free at MCP level, billed-finalize at proxy level — at worst billed once per process lifetime per run_id, which is acceptable given typical 7+ day MTBF on the API service).

**Concurrent finalize races within one process** are prevented by the JS event loop (single-threaded `runOwnership.get`/`.set`). No mutex needed.

**Atomic check-and-deduct (NFR8)** is preserved at the existing `deductToolCredits` call site — that function itself is transactional. The `finalized` flag is just gating which calls reach it.

**Pricing entries added to [config.ts:858 area](apps/api/src/config.ts#L858) TOOL_PRICING:**
- `vt_mcp_start_swarm: { baseCost: 0.05, perResultCost: 0, markupMultiplier: 1.0 }` (deposit)
- `vt_mcp_run_swarm_finalize: { baseCost: 0.20, perResultCost: 0, markupMultiplier: 1.0 }` (finalize on completion)
- `vt_mcp_run_swarm: { baseCost: 0.25, ... }` — kept untouched, proxy 410 prevents billing reaching it

### AC5b — `cancel_swarm` MCP tool (user abort path)

**Given** [SwarmRuntime.cancel_run(run_id)](Vibe-Trading/agent/src/swarm/runtime.py#L124) already exists and sets a `threading.Event` that workers check between layers,

**When** Story 5.5.1 ships,

**Then** a new MCP tool `cancel_swarm(run_id)` is added that:
- Calls `SwarmRuntime.cancel_run(run_id)`
- Returns `{"status": "cancelling", "run_id": "..."}` immediately (workers complete in-flight LLM call before exiting)
- Proxy-layer ownership check (AC1b) gates this — only the run's owner can cancel

**And** the OpenCode wrapper tool (AC3) catches `ctx.abort` or equivalent client-disconnect signal and fires `cancel_swarm` before exiting. If the wrapper's 30-min client timeout hits, it also fires `cancel_swarm` so server-side compute stops (saves user money + LLM cost).

**And** billing on cancellation: deposit (0.05) charged at start is **NOT refunded** (user got the spawn). Finalize (0.20) is **NOT charged** since `status` won't reach `completed`.

**And** the `/dashboard/swarm-teams` UI page surfaces a "Stop" button on any in-flight run row. Click → calls `cancel_swarm` via the OpenCode tool path (or directly via the existing swarm tools API, decide during dev based on Story 5.6's existing run-row UI).

### AC6 — Tests (parity scope with 5.5 / 5.6)

**Given** Story 5.5 ships [vibe-trading-mcp-proxy.test.ts](apps/api/src/__tests__/unit/vibe-trading-mcp-proxy.test.ts) and Story 5.6 ships chat E2E coverage,

**When** Story 5.5.1 ships,

**Then** add the following tests (must all pass at PR open). **Test framework: `bun:test`** (verified parity with [vibe_trading_backtest.test.ts](core/epsilon-master/opencode/tools/__tests__/vibe_trading_backtest.test.ts) and existing `apps/api/src/__tests__/unit/*.test.ts` — NOT Jest or Vitest):

| File | Scope | Cases |
|---|---|---|
| `apps/api/src/__tests__/unit/vibe-trading-swarm-async.test.ts` (new) | Proxy 410 logic + start_swarm deposit billing + ownership gate | 410 for run_swarm; 200 for start_swarm; deposit billing happens once even on retry; tier 1 still 403'd before 410 fires; **403 when accountId != ownership map entry** (cross-account access); ownership re-hydrated on `list_runs` |
| `apps/api/src/__tests__/unit/swarm-finalize-billing.test.ts` (new) | Idempotency of finalize deduct via in-memory flag | First completed → 0.20 deducted; second read → 0 deducted (flag set); failed run → 0 deducted; cancelled run → 0 deducted; race between two parallel get_run_result calls → exactly one deduct |
| `apps/api/src/__tests__/unit/vibe-trading-mcp-proxy-extended.test.ts` (update) | Reuse 30s timeout test patterns from Story 5.5 ([line 52-57, 88](apps/api/src/__tests__/unit/vibe-trading-mcp-proxy-extended.test.ts)) | Add 410 case for `run_swarm`; assert body contains 'deprecated' + migration reference |
| `core/epsilon-master/opencode/tools/__tests__/vibe_trading_swarm.test.ts` (new — parity `vibe_trading_backtest.test.ts`, framework: `bun:test`) | OpenCode wrapper unit | Poll loop terminates on `completed`; surfaces progress lines; client timeout after 30 min returns error string with run_id; abort signal triggers cancel_swarm call before exit |
| `tests/e2e/specs/swarm-async-roundtrip.spec.ts` (new, Playwright) | Browser E2E via Swarm Teams page | Click "Run" on smallest preset (≤4 agents), assert progress strip appears, assert final report renders within 5min budget — gate behind `CI_FULL_STACK=true` per Story 5.0.5 pattern |
| `tests/e2e/specs/swarm-cancel.spec.ts` (new, Playwright) | Cancel button UX | Start swarm, wait for 1 agent done, click "Stop", assert run transitions to cancelled within 30s, assert no `vt_mcp_run_swarm_finalize` billing entry |

**Test runtime budget:** Unit tests ≤30s each. E2E ≤6 min. Chaos test in next bullet is separate.

### AC7 — Chaos: API restart mid-swarm resumes correctly

**Given** [SwarmStore](Vibe-Trading/agent/src/swarm/store.py) persists runs to disk in `.swarm/runs/` and Story 5.0.4 establishes the chaos test pattern,

**When** Story 5.5.1 ships,

**Then** new chaos spec `tests/e2e/specs/swarm-resume-after-api-restart.spec.ts` covers:

1. Launch `vibe-trading-mcp` container + `apps/api` sidecar (parity 5.0.4 setup).
2. POST `start_swarm` for `crypto_trading_desk` preset (6 agents, smallest).
3. Wait for 2/6 agents complete via `get_swarm_status` polling.
4. Kill `apps/api` sidecar (`docker compose kill api` or process kill).
5. Wait 10s, restart `apps/api`.
6. Continue polling `get_swarm_status` — expect run state preserved (SwarmStore is in the VT container, untouched).
7. Wait for completion — final report retrievable via `get_run_result`.
8. Verify billing: deposit charged once, finalize charged once (no double-billing despite the restart).

Gate behind `CI_CHAOS_ENABLED=true` per Story 5.0.4/5.0.5 pattern. Skip on PR builds.

### AC8 — Deprecation notice + sunset tracking

**Given** Story 5.5 shipped `run_swarm` in production for ~7 days before this defect was caught,

**When** Story 5.5.1 ships,

**Then**:
- `run_swarm` MCP tool docstring is updated: `"DEPRECATED 2026-05-19 — use start_swarm + get_swarm_status + get_run_result. Sunset: 2026-06-19. Tracking: Story 5.5.1."`
- A new entry added to [_bmad-output/implementation-artifacts/deferred-work.md](_bmad-output/implementation-artifacts/deferred-work.md) under "Deferred from: Story 5.5.1" tracking: 30-day sunset of `run_swarm` MCP tool + proxy 410 → eventually remove from VT submodule entirely.
- No code removal in this story; sunset = separate cleanup story Q3.

## Tasks / Subtasks

### Task 1 — Vibe-Trading MCP server: add `start_swarm` + `cancel_swarm` (AC1, AC5b)

- [x] 1.1 Open `Vibe-Trading/agent/mcp_server.py` after existing `run_swarm` definition (line ~430). **Note:** Vibe-Trading is a submodule currently on branch `v1-1` (not `main`); changes land against that branch. Coordinate via upstream PR to `deptrai/Vibe-Trading` after local validation.
- [x] 1.2 Add `@mcp.tool def start_swarm(preset_name: str, variables: dict[str, str]) -> str:` — body uses `SwarmRuntime.start_run` and returns immediately
- [x] 1.3 Validate `preset_name` against `list_presets()` before spawning thread; return JSON error if unknown
- [x] 1.4 Add `@mcp.tool def cancel_swarm(run_id: str) -> str:` — calls `SwarmRuntime.cancel_run(run_id)`, returns `{"status":"cancelling","run_id":"..."}`
- [x] 1.5 Add deprecation docstring to existing `run_swarm` referencing this story
- [x] 1.6 Local smoke test: `python mcp_server.py --transport sse --port 8900`, call start_swarm via test script, verify `<2s` return time; call cancel_swarm and verify the run transitions to `cancelled` within 2 layers

### Task 2 — apps/api proxy: 410 Gone + ownership map + billing entries (AC1b, AC2)

- [x] 2.1 Open `apps/api/src/router/routes/vibe-trading-mcp.ts`, add `LONG_RUNNING_TOOLS_DENY = new Set(['run_swarm'])` + 410 Gone check inside `isBillable` block before `checkCredits`
- [x] 2.2 Add in-memory `runOwnership: Map<string, {accountId, expiresAt, finalized}>` (24h TTL) per AC1b
- [x] 2.3 On `start_swarm` success response: parse `run_id` from body, populate `runOwnership` with current `accountId`
- [x] 2.4 On `get_swarm_status` / `get_run_result` / `cancel_swarm`: parse `run_id` from request params, reject 403 if `runOwnership.get(run_id)?.accountId !== accountId`. Log `[swarm-ownership-violation]` on reject.
- [x] 2.5 Add re-hydration path: on `list_runs` response, populate `runOwnership` for each returned run_id with current accountId.
- [x] 2.6 Update `apps/api/src/config.ts` TOOL_PRICING at line ~858 area: add `vt_mcp_start_swarm`, `vt_mcp_run_swarm_finalize`, `vt_mcp_cancel_swarm` entries
- [x] 2.7 Verify tier 1 still gets 403 BEFORE hitting the 410 branch (test in AC6 covers this)

### Task 3 — OpenCode tool: `vibe_trading_swarm.ts` (AC3)

- [x] 3.0 **Research subtask (≤30 min):** Read `node_modules/@opencode-ai/plugin/dist/*.d.ts` to determine actual `ToolContext` API. Confirm whether `ctx.write` / `ctx.output` / `ctx.abortSignal` exist. Document findings in Dev Agent Record before continuing.
- [x] 3.1 Create `core/epsilon-master/opencode/tools/vibe_trading_swarm.ts` using `vibe_trading_backtest.ts` as template. **Auto-discovered** per [tools/README.md](core/epsilon-master/opencode/tools/README.md) — no index.ts update needed.
- [x] 3.2 Implement poll loop. If Task 3.0 confirms `ctx.write` streaming → use it. Otherwise buffer progress lines + return concatenated string (MVP fallback).
- [x] 3.3 Implement client-side cancel: if `ctx.abortSignal?.aborted` OR 30-min client timeout → fire `cancel_swarm` before exiting
- [x] 3.4 Update Tier 2 agent system prompt [chainlens-tier2.md](core/epsilon-master/opencode/agents/chainlens-tier2.md) to reference `vibe_trading_swarm` and document deprecation of `run_swarm`

### Task 4 — UI: `OcVibeTradingSwarmToolView` + Stop button (AC4, AC5b)

- [x] 4.1 Create `apps/web/src/components/thread/tool-views/opencode/OcVibeTradingSwarmToolView.tsx` — pattern parity with closest existing tool view (see 43 Oc*ToolView files in directory)
- [x] 4.2 Implement progress parser (regex on stdout lines for `▶️`, `⏳`, `🛑`, `❌`)
- [x] 4.3 Register in `tool-renderers.tsx` via `ToolRegistry.register('vibe_trading_swarm', ...)` at line ~422
- [x] 4.4 Update `/dashboard/swarm-teams` page run-row UI: surface "Stop" button on in-flight runs → invokes `cancel_swarm` via OpenCode tool path (or direct MCP call if page already has direct path from 5.6)
- [x] 4.5 Update `/dashboard/swarm-teams` page run dispatch to use `vibe_trading_swarm` OpenCode tool instead of raw `run_swarm` MCP call (if page currently bypasses OpenCode)

### Task 5 — Billing finalize logic via in-memory flag (AC5)

- [x] 5.1 In proxy `vibe-trading-mcp.ts`, after a successful `get_run_result` response: parse body, if `result.status === 'completed'` AND `runOwnership.get(run_id).finalized === false` → call `deductToolCredits(accountId, 'vt_mcp_run_swarm_finalize', 0, ...)` and set `finalized = true`
- [x] 5.2 Failure path: status !== completed → skip finalize. Cancellation path: skip finalize.
- [x] 5.3 Idempotency verification: second `get_run_result` call for same run_id MUST NOT re-charge (flag is the gate). Test in AC6.
- [x] 5.4 Document in code comment: "Finalize state is in-memory only; on process restart, a re-fetch may re-charge at most once per process lifetime — acceptable per AC5 design."

### Task 6 — Tests (AC6, AC7)

- [x] 6.1 Write `vibe-trading-swarm-async.test.ts` (proxy 410 + start_swarm billing)
- [x] 6.2 Write `swarm-finalize-billing.test.ts` (idempotency)
- [x] 6.3 Write `vibe_trading_swarm.test.ts` (OpenCode wrapper)
- [x] 6.4 Write `swarm-async-roundtrip.spec.ts` (Playwright E2E, smallest preset)
- [x] 6.5 Write `swarm-resume-after-api-restart.spec.ts` (chaos, gated)
- [x] 6.6 Add fast-tier test entry for the new unit specs to `.github/workflows/test.yml` (parity Story 5.0.5)
- [x] 6.7 Update `vibe-trading-mcp-proxy.test.ts` with 410 case for `run_swarm`

### Task 7 — Docs + sunset tracking (AC8)

- [x] 7.1 Update `run_swarm` docstring with deprecation notice
- [x] 7.2 Add entry to `deferred-work.md` for sunset tracking
- [x] 7.3 Update `core/epsilon-master/opencode/tools/README.md` MCP tools section
- [x] 7.4 Update `CLAUDE.md` Vibe-Trading section: document the async swarm pattern as canonical

### Review Findings (2026-05-19, `/bmad-code-review`)

Three parallel adversarial reviewers (Blind Hunter / Edge Case Hunter / Acceptance Auditor) across 4 chunks. 62 findings after dedup.

#### Decision Needed (1)

- [x] **[Review][Decision] RESOLVED 2026-05-19 → Option (A): MCP server-side `account_id` filter.** Add `account_id` field to `SwarmRun` model; `start_swarm` / `list_runs` / `get_swarm_status` / `get_run_result` / `cancel_swarm` accept + enforce `account_id` parameter. Proxy forwards `accountId` as JSON-RPC arg. Defense-in-depth: both proxy `runOwnership` Map AND MCP server check ownership. ~80 LOC across both layers. Promoted to patches `P_OWN_A1..A6` (added to Critical batch below).

#### Patches (53) — fixes are unambiguous, ready to apply

**Critical (18 — includes Option A ownership patches)**

- [x] [Review][Patch] **[P_OWN_A1]** Add `account_id: Optional[str] = None` field to `SwarmRun` model [`Vibe-Trading/agent/src/swarm/models.py`]
- [x] [Review][Patch] **[P_OWN_A2]** `SwarmRuntime.start_run()` accepts + persists `account_id` to SwarmRun [`Vibe-Trading/agent/src/swarm/runtime.py:72-122`]
- [x] [Review][Patch] **[P_OWN_A3]** `start_swarm` MCP tool accepts `account_id` parameter; pass through to start_run [`Vibe-Trading/agent/mcp_server.py:539-550`]
- [x] [Review][Patch] **[P_OWN_A4]** `list_runs(account_id=...)` filters server-side; `get_swarm_status` / `get_run_result` / `cancel_swarm` accept + enforce `account_id` (403-equivalent JSON error on mismatch) [`Vibe-Trading/agent/mcp_server.py:652,669,782`]
- [x] [Review][Patch] **[P_OWN_A5]** apps/api proxy forwards `accountId` as `account_id` JSON-RPC arg to all 5 ownership-aware MCP tools [`apps/api/src/router/routes/vibe-trading-mcp.ts`]
- [x] [Review][Patch] **[P_OWN_A6]** Cross-account isolation test: account B's `list_runs` MUST NOT return account A's runs even after proxy restart [`apps/api/src/__tests__/unit/vibe-trading-swarm-async.test.ts` + Python test]
- [x] [Review][Patch] Add `threading.Lock` to `_get_swarm_runtime()` singleton race [`Vibe-Trading/agent/mcp_server.py:504-515`]
- [x] [Review][Patch] Validate `preset_name` via `list_presets()` before `runtime.start_run()` (AC1 Task 1.3) [`Vibe-Trading/agent/mcp_server.py:539-550`]
- [x] [Review][Patch] Sanitize `preset_name` against path traversal (regex `^[A-Za-z0-9_-]+$`) [`Vibe-Trading/agent/mcp_server.py:539`]
- [x] [Review][Patch] Widen SSE `session_id` regex from `[a-f0-9]+` to `[\w-]+` (UUID-safe) [`apps/api/src/router/routes/vibe-trading-mcp.ts:140`]
- [x] [Review][Patch] Set `finalized=true` on cancel_swarm `status==cancelled` response (prevent race-finalize-bill) [`apps/api/src/router/routes/vibe-trading-mcp.ts:313-334`]
- [x] [Review][Patch] Set `finalized=true` on `status==failed` to seal flag (prevent failed→completed re-bill) [`apps/api/src/router/routes/vibe-trading-mcp.ts:313-334`]
- [x] [Review][Patch] Call `_failAllPending` on SSE clean close (done=true exits without notifying pending) [`core/epsilon-master/opencode/tools/lib/mcp-sse-client.ts:147`]
- [x] [Review][Patch] Remove `_resolveEndpoint` catch fallback returning `raw` (server-controlled URL exfil risk) [`core/epsilon-master/opencode/tools/lib/mcp-sse-client.ts:237-238`]
- [x] [Review][Patch] Add `status==='error'` to wrapper terminal check (infinite poll on run-not-found) [`core/epsilon-master/opencode/tools/vibe_trading_swarm.ts:145`]
- [x] [Review][Patch] Fix `apiBase()` → `apiBase` (string constant, not function) [`tests/e2e/specs/swarm-resume-after-api-restart.spec.ts:50,69,96,...`] **BLOCKER**
- [x] [Review][Patch] Wrap docker kill+start in `try/finally` (cleanup on assertion failure) [`tests/e2e/specs/swarm-resume-after-api-restart.spec.ts:89-91`]
- [x] [Review][Patch] Add `rehypeSanitize` to `ReactMarkdown` (XSS via tool output) [`apps/web/src/components/thread/tool-views/opencode/OcVibeTradingSwarmToolView.tsx:176`]

**High (12)**

- [x] [Review][Patch] Update `cancel_swarm` docstring to match post-completion error behavior [`Vibe-Trading/agent/mcp_server.py:574-590`]
- [x] [Review][Patch] Assert `final_status == "cancelled"` in cancel roundtrip test [`Vibe-Trading/agent/tests/test_async_swarm_mcp_tools.py:138`]
- [x] [Review][Patch] Add `@pytest.fixture(autouse=True)` to reset `_swarm_runtime_singleton` between tests [`Vibe-Trading/agent/tests/test_async_swarm_mcp_tools.py`]
- [x] [Review][Patch] Catch `FileExistsError + OSError` in `start_swarm` exception handler [`Vibe-Trading/agent/mcp_server.py:539-550`]
- [x] [Review][Patch] Add "deposit billed once on retry" test case (AC6 missing) [`apps/api/src/__tests__/unit/vibe-trading-swarm-async.test.ts`]
- [x] [Review][Patch] Add 30-min timeout test case (AC6 missing) [`core/epsilon-master/opencode/tools/__tests__/vibe_trading_swarm.test.ts`]
- [x] [Review][Patch] Add 3 missing wrapper test paths (failed / error / timeout) [`core/epsilon-master/opencode/tools/__tests__/vibe_trading_swarm.test.ts`]
- [x] [Review][Patch] Wire `ctx.abort` to `McpSseClient.callTool` fetch AbortSignal (20s latency fix) [`core/epsilon-master/opencode/tools/vibe_trading_swarm.ts:112` + `mcp-sse-client.ts`]
- [x] [Review][Patch] Inspect 4xx in `get_swarm_status` catch, break on auth errors (don't silently retry 30 min) [`core/epsilon-master/opencode/tools/vibe_trading_swarm.ts:122-128`]
- [x] [Review][Patch] Gate `get_run_result` behind `status==='completed'` only (skip for failed/cancelled) [`core/epsilon-master/opencode/tools/vibe_trading_swarm.ts:145-149`]
- [x] [Review][Patch] Read `part.state.raw ?? part.state.output` so live progress renders during running state [`apps/web/src/components/thread/tool-views/opencode/OcVibeTradingSwarmToolView.tsx:106`]
- [x] [Review][Patch] Rename `\n---\n` separator to unambiguous marker (e.g. `=== SWARM REPORT ===`) — markdown HR collision [`vibe_trading_swarm.ts` + `OcVibeTradingSwarmToolView.tsx:55-57`]

**Medium (18)**

- [x] [Review][Patch] Add cancel-incompat warning in `run_swarm` deprecation note [`Vibe-Trading/agent/mcp_server.py:454`]
- [x] [Review][Patch] Periodic sweeper for `runOwnership` Map TTL eviction (memory leak) [`apps/api/src/router/routes/vibe-trading-mcp.ts:22-32`]
- [x] [Review][Patch] Line-buffer SSE chunks across `transform` calls (partial JSON drops) [`apps/api/src/router/routes/vibe-trading-mcp.ts:133`]
- [x] [Review][Patch] Size cap (10MB) on `parseToolResult` / `resp.text` (OOM protection) [`apps/api/src/router/routes/vibe-trading-mcp.ts:82,278`]
- [x] [Review][Patch] Skip start_swarm deposit billing when `parseToolResult` fails (no run_id captured = user charged for inaccessible run) [`apps/api/src/router/routes/vibe-trading-mcp.ts:272-278`]
- [x] [Review][Patch] Warn log when start_swarm SSE missing `session_id` (silent ownership-seed failure observable) [`apps/api/src/router/routes/vibe-trading-mcp.ts:244-253`]
- [x] [Review][Patch] Sanitize upstream errors unconditionally (not just `application/json`) [`apps/api/src/router/routes/vibe-trading-mcp.ts:305-311`]
- [x] [Review][Patch] Release SSE reader on close + call reader.cancel() [`core/epsilon-master/opencode/tools/lib/mcp-sse-client.ts:141,292-296`]
- [x] [Review][Patch] Abort SSE fetch when `connectTimer` fires (zombie request prevention) [`core/epsilon-master/opencode/tools/lib/mcp-sse-client.ts:115-120`]
- [x] [Review][Patch] Rewrite `mock.module` test or refactor `getEnv` to injectable (Bun module cache may bypass mock) [`core/epsilon-master/opencode/tools/__tests__/vibe_trading_swarm.test.ts:145-161`]
- [x] [Review][Patch] Replace `speedUpSleep` globalThis patching with injectable `sleep` import [`core/epsilon-master/opencode/tools/__tests__/vibe_trading_swarm.test.ts:48-51`]
- [x] [Review][Patch] Add auth setup to E2E specs (currently redirect to /auth/, will fail) [`tests/e2e/specs/swarm-async-roundtrip.spec.ts`, `swarm-cancel.spec.ts`]
- [x] [Review][Patch] Parse `list_runs` response body + assert run_id present (chaos step 4 currently unverified) [`tests/e2e/specs/swarm-resume-after-api-restart.spec.ts:108-115`]
- [x] [Review][Patch] Add `vibe-trading-mcp-proxy-extended.test.ts` to fast-tier in `.github/workflows/test.yml` (P0 410 regression only in informational tier) [`.github/workflows/test.yml`]
- [x] [Review][Patch] Replace `[data-tool="vibe_trading_swarm"]` selector — attribute doesn't exist in DOM [`tests/e2e/specs/swarm-async-roundtrip.spec.ts:73-75`]
- [x] [Review][Patch] Use canonical `ToolProps` from `tool-renderers.tsx` (local interface narrower, latent trap) [`OcVibeTradingSwarmToolView.tsx:96-100`]
- [x] [Review][Patch] Drop `.catch(() => ({default: () => null}))` on `ShadowAccountPage` lazy import (silent failure) [`apps/web/src/components/tabs/page-tab-content.tsx:112-116`]
- [x] [Review][Patch] Replace XPath ancestor selector with `data-testid="preset-card"` (Tailwind class collision risk) [`swarm-async-roundtrip.spec.ts:34`, `swarm-cancel.spec.ts:33`]

**Low (11)**

- [x] [Review][Patch] Replace `as any` cast with `StatusCode` type on resp.status [`apps/api/src/router/routes/vibe-trading-mcp.ts:309`]
- [x] [Review][Patch] Update misleading config comment on `vt_mcp_run_swarm` (entry doesn't bill — proxy 410 first) [`apps/api/src/config.ts:1008-1011`]
- [x] [Review][Patch] Add backoff + retry limit (e.g. 5 consecutive errors) before continuing poll [`core/epsilon-master/opencode/tools/vibe_trading_swarm.ts:122-128`]
- [x] [Review][Patch] Sanitize `preset` value in progress lines (prompt injection via "\\n---\\n" fake separator) [`vibe_trading_swarm.ts:106`]
- [x] [Review][Patch] Remove `run_swarm` from tier 2 permission frontmatter allow-list (or document why kept) [`core/epsilon-master/opencode/agents/chainlens-tier2.md`]
- [x] [Review][Patch] Update "low-level MCP trio" docs to note ownership prerequisite [`core/epsilon-master/opencode/agents/chainlens-tier2.md`]
- [x] [Review][Patch] Add Task 3.0 research findings note to Dev Agent Record [this story file]
- [x] [Review][Patch] Update CLAUDE.md "Before pushing" with 3 new fast-tier test files [`CLAUDE.md`]
- [x] [Review][Patch] Rename chaos test title to remove "bills exactly once" until billing assertion exists [`tests/e2e/specs/swarm-resume-after-api-restart.spec.ts`]
- [x] [Review][Patch] Remove `findLast?.` optional chaining + fallback dead code (ES2023 available) [`OcVibeTradingSwarmToolView.tsx:114-115`]
- [x] [Review][Patch] Use stable React key (composite of `line.raw` + index) instead of `key={i}` [`OcVibeTradingSwarmToolView.tsx:161`]
- [x] [Review][Patch] Register `oc_vibe_trading_swarm` + `oc-vibe-trading-swarm` prefix variants in ToolRegistry [`apps/web/src/components/session/tool-renderers.tsx`]

#### Deferred (11) — tracked in deferred-work.md

- [x] [Review][Defer] Prompt injection via `variables` dict values (OWASP LLM01, cross-cutting; 5.6 already deferred class-of-attack)
- [x] [Review][Defer] Multi-`apps/api`-worker process double-billing (architectural — needs Redis-backed finalize lock)
- [x] [Review][Defer] Tool-specific HTTP timeouts (cancel 30s too long; operational tuning)
- [x] [Review][Defer] SSE rewriter ownership-seed test coverage (integration-tier scope, separate)
- [x] [Review][Defer] `mcp-sse-client.ts` own unit tests (extracted lib, separate test scope)
- [x] [Review][Defer] `cancel_swarm` fire-and-forget no confirmation (acceptable per AC5b design — server-side cancellation is async)
- [x] [Review][Defer] Vibe-Trading tests hit real disk + LLM, no mocks (test-infra change, separate scope)
- [x] [Review][Defer] `factor_analysis` 5 issues (CSV cleanup, TOCTOU dir, broad except, codes DoS, date validation) — pre-existing, not Story 5.5.1 scope
- [x] [Review][Defer] Task 4.4 Stop button on swarm-teams page row (Story 5.6 page has no in-flight row UI; deviation accepted; tracked separately)
- [x] [Review][Defer] Cancel spec billing assertion (matches existing chaos billing follow-up in deferred-work)
- [x] [Review][Defer] Out-of-scope sidebar/tabs changes untested (legitimate bug fixes; separate test scope)

#### Dismissed (6) — noise / cosmetic / false positive

- Sunset date 31 not 30 days (intentional same-day-of-month)
- Spec AC1 still lists obsolete `account_id` (already documented in spec change log)
- Tier-ordering test name cosmetic
- Emoji `▶️` variation selector theoretical fragility (terminals preserve VS-16)
- `findLast` browser compat (modern browser target acceptable)
- `vt_mcp_run_swarm` config entry kept (historical accounting, comment patched separately)



### Why preserve `run_swarm` instead of deleting it

Hard removal would break:
- Any sandbox script directly invoking MCP without proxy (test rigs, local dev)
- Anyone holding a `(preset, vars) → final_report` pattern in muscle memory
- The 5.5 `vibe-trading-mcp-proxy.test.ts` test cases referencing it

Soft deprecation + 30-day sunset is the bare minimum. Hard removal goes in a separate story Q3.

### Why not modify `run_swarm` to be async itself

Considered. Rejected because:
1. Changing the signature/behaviour of an existing MCP tool would silently break any direct caller (no compile-time check across MCP protocol boundary)
2. `start_swarm` + 2 poll tools is more conventional MCP pattern (parity OpenAI Assistants API runs)
3. Easier to test: each tool has one clear responsibility

### Why deposit + finalize instead of charge-on-completion

Considered single charge on `get_run_result`. Rejected because:
- User could start 100 swarms in parallel before any complete → no credit gate → unbounded compute spend
- Deposit at start = credit gate operates on `start_swarm` (the spawn moment)
- Finalize at result = pay-for-what-you-got (not pay-for-what-the-server-tried-to-do)

This matches AWS Step Functions billing (state transition counted at execution, not at start) but with a deposit gate to prevent runaway parallelism.

### What happens if the OpenCode tool's 30min client timeout hits

Server-side swarm continues until SwarmStore TTL (currently no expiry — runs persist forever per Story 5.0.1 named volume behaviour). User can re-fetch via `get_run_result(run_id)` from chat by passing the run_id back. The wrapper tool's timeout-error message includes the run_id specifically so the user can recover.

For UI polish: surface "Resume run" affordance in `/dashboard/swarm-teams` for any run_id older than the user's last chat tab. Out of scope for this story — track in deferred work.

### Source Tree Components to Touch

**NEW files:**
- `apps/api/src/__tests__/unit/vibe-trading-swarm-async.test.ts`
- `apps/api/src/__tests__/unit/swarm-finalize-billing.test.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_swarm.ts`
- `core/epsilon-master/opencode/tools/__tests__/vibe_trading_swarm.test.ts`
- `apps/web/src/components/thread/tool-views/opencode/OcVibeTradingSwarmToolView.tsx`
- `tests/e2e/specs/swarm-async-roundtrip.spec.ts`
- `tests/e2e/specs/swarm-cancel.spec.ts`
- `tests/e2e/specs/swarm-resume-after-api-restart.spec.ts`

**Modified files:**
- `Vibe-Trading/agent/mcp_server.py` — **submodule patch** on branch `v1-1` (NOT main). Add `start_swarm` + `cancel_swarm` MCP tools, add deprecation docstring on `run_swarm`. Coordinate via upstream PR to `deptrai/Vibe-Trading` after local validation.
- `apps/api/src/router/routes/vibe-trading-mcp.ts` — deny-list + 410 logic + in-memory `runOwnership` map + finalize billing trigger (Tasks 2 + 5)
- `apps/api/src/config.ts` — 3 new billing entries (`vt_mcp_start_swarm`, `vt_mcp_run_swarm_finalize`, `vt_mcp_cancel_swarm`)
- `apps/api/src/__tests__/unit/vibe-trading-mcp-proxy-extended.test.ts` — add 410 + ownership cases
- `apps/web/src/components/session/tool-renderers.tsx` — register new tool view at line ~422
- `apps/web/src/app/dashboard/swarm-teams/page.tsx` (and/or related utils) — switch run-dispatch to `vibe_trading_swarm` OpenCode tool, add "Stop" button
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — system prompt (reference `vibe_trading_swarm`, deprecate `run_swarm`)
- `core/epsilon-master/opencode/tools/README.md`
- `_bmad-output/implementation-artifacts/deferred-work.md` — track sunset of `run_swarm`, async pattern for other 4 long-running tools, future `tail_swarm_events` enhancement
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flip 5-5-1 to in-progress / done
- `CLAUDE.md` — document async swarm pattern as canonical

**NOT modified:**
- `Vibe-Trading/agent/src/swarm/runtime.py` — already supports async `start_run` + `cancel_run`, no changes
- `Vibe-Trading/agent/src/swarm/store.py` — filesystem persistence at `.swarm/runs/{run_id}/run.json` + `events.jsonl` already correct (verified by validator review 2026-05-19)
- `Vibe-Trading/agent/src/swarm/models.py` — `SwarmRun` model kept account-agnostic; ownership tracked at proxy layer (AC1b)
- `apps/api/src/router/services/billing.ts` — `deductToolCredits` signature unchanged (avoided cross-cutting migration by using in-memory `finalized` flag instead of `idempotencyKey`)
- 22-tool MCP registry — only adds `start_swarm` + `cancel_swarm`, no other deltas

### Performance Budget

| Operation | Target | Notes |
|---|---|---|
| `start_swarm` MCP call | <2s | runtime.start_run handoff only |
| `get_swarm_status` poll | <500ms | SwarmStore disk read + JSON encode |
| `get_run_result` (lightweight) | <500ms | same |
| `get_run_result` finalize billing | <50ms overhead | one extra `deductToolCredits` per run lifetime |
| Total proxy overhead per poll | <10ms | parity 5.5 budget |
| Client poll cadence | 5s | balance UX freshness vs proxy load |
| Total client wrapper timeout | 30 min | matches typical max swarm runtime |

### Risk Register

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Vibe-Trading is a submodule on branch `v1-1` (not `main`); adding `start_swarm` requires upstream PR or local patch carry. Local patch drifts on rebase. | Open upstream PR to `deptrai/Vibe-Trading` repo with `start_swarm` + `cancel_swarm` (strictly-additive changes). During dev, carry as local patch on `v1-1` branch with explicit `feat(mcp): add start_swarm + cancel_swarm` commit so it survives rebase. Keep commit ≤100 LOC. |
| R2 | `ctx.write` streaming API in `@opencode-ai/plugin` unverified — `vibe_trading_backtest.ts` does NOT use it (validator review 2026-05-19) | Task 3.0 research subtask (≤30 min) inspects installed plugin types before implementing. MVP fallback: buffer progress lines + return concatenated string. UI component parses lines either way. |
| R3 | `deductToolCredits` has no `idempotencyKey` parameter ([billing.ts:48](apps/api/src/router/services/billing.ts#L48) verified by validator) — naive retry would double-bill finalize | Replaced with in-memory `finalized` flag on proxy's `runOwnership` map (see AC5). No billing.ts migration needed. Worst case: process restart → re-charge at most once per run per process lifetime (acceptable per AC5). |
| R4 | Direct submodule edit blocks rebase; if upstream Vibe-Trading PR lands faster than this story, rebase conflict | Keep local commits minimal. On rebase: cherry-pick if upstream version differs slightly; drop the patch if upstream is identical. The Vibe-Trading submodule currently shows "Unmerged paths" in git status — dev MUST resolve those before applying this story's submodule changes. |
| R5 | E2E chaos test (AC7) — `apps/api` restart vs `SwarmStore` persistence | Validator confirmed `SwarmStore` lives inside the VT MCP container at `Vibe-Trading/agent/.swarm/runs/`. `apps/api` restart doesn't touch it. Chaos test is structurally sound. |
| R6 | Users with active runs at the moment of deploy hit 410 mid-poll | OpenCode wrapper handles new path; users hit 410 only if they crafted direct API calls. Pre-deploy: validate zero active runs OR deploy during low-traffic window. Net effect: zero regression for end users (the 30s proxy timeout already killed in-flight `run_swarm` calls anyway). |
| R7 | LLM key required for swarm agents (v98store / BYOK) | Out of scope (Story 5.7 BYOK handles key wiring). AC6 unit tests mock the LLM layer; E2E uses test key via `.env.test`. |
| **R8** | **Cross-account run_id leakage** — `get_swarm_status` / `get_run_result` MCP tools perform no ownership validation today (validator finding) | **AC1b ownership map at proxy layer.** All status/result/cancel calls go through proxy → 403 on mismatch. In-memory map acceptable for V1; future story can promote to DB-backed. Log `[swarm-ownership-violation]` for audit. |
| **R9** | **Cancel storms** — user spams "Stop" button → many `cancel_swarm` calls hammering MCP | `SwarmRuntime.cancel_run()` is idempotent (sets a `threading.Event` — multiple sets are no-op). Free billing on `vt_mcp_cancel_swarm`. UI Stop button disables after first click. Acceptable. |
| **R10** | **Live callback / `events.jsonl` streaming opportunity left unexploited** — V1 uses 5s polling | Documented in AC3 "Enhancement opportunity" + deferred-work.md. Future story can switch to event-driven streaming without breaking API surface (poll loop is internal to wrapper). |

### References

- [Story 5.5: Vibe-Trading MCP Proxy](5-5-vibe-trading-mcp-proxy.md) — parent story, proxy implementation
- [Story 5.6: Shadow Account + Swarm Teams UI](5-6-shadow-account-swarm-ui.md) — original async design intent in Dev Notes
- [Story 5.0.4](5-0-4-sandbox-token-drift-chaos-tests.md) — chaos test infrastructure pattern
- [Story 5.0.5](5-0-5-ci-workflow-bun-test-playwright.md) — fast/full CI tiering pattern
- [Vibe-Trading/agent/mcp_server.py:430](Vibe-Trading/agent/mcp_server.py#L430) — `run_swarm` definition; polling loop at lines 462-463
- [Vibe-Trading/agent/src/swarm/runtime.py:72](Vibe-Trading/agent/src/swarm/runtime.py#L72) — `start_run()` fire-and-forget (returns immediately after daemon thread spawn at lines 114-120)
- [Vibe-Trading/agent/src/swarm/runtime.py:124](Vibe-Trading/agent/src/swarm/runtime.py#L124) — `cancel_run()` already exists
- [Vibe-Trading/agent/src/swarm/runtime.py:76](Vibe-Trading/agent/src/swarm/runtime.py#L76) — `live_callback` parameter (deferred enhancement)
- [Vibe-Trading/agent/src/swarm/store.py](Vibe-Trading/agent/src/swarm/store.py) — filesystem persistence at `.swarm/runs/{run_id}/run.json` + `events.jsonl`
- [Vibe-Trading/agent/src/swarm/models.py](Vibe-Trading/agent/src/swarm/models.py) — `SwarmRun` model (no `account_id` field — ownership at proxy per AC1b)
- [apps/api/src/router/routes/vibe-trading-mcp.ts:85](apps/api/src/router/routes/vibe-trading-mcp.ts#L85) — `AbortSignal.timeout(30_000)`
- [apps/api/src/router/services/billing.ts:48](apps/api/src/router/services/billing.ts#L48) — `deductToolCredits` signature (NO `idempotencyKey` param)
- [apps/api/src/config.ts:858](apps/api/src/config.ts#L858) — TOOL_PRICING table; `vt_mcp_run_swarm` entry at line 1008
- [apps/api/src/__tests__/unit/vibe-trading-mcp-proxy-extended.test.ts:52-57, 88](apps/api/src/__tests__/unit/vibe-trading-mcp-proxy-extended.test.ts) — existing 30s timeout test patterns to reuse
- [OpenAI Assistants API Runs](https://platform.openai.com/docs/api-reference/runs) — reference for the start → poll → result pattern adopted here

## Change Log

- **2026-05-19** — Story created after integration test of 22 Vibe-Trading MCP tools surfaced the 30s proxy timeout vs 5-30 min swarm runtime mismatch. Original 5.6 design intent for async polling restored.
- **2026-05-19 (post-validate)** — Applied validation findings:
  - **Critical fixes:** Added AC1b ownership gating (cross-account leak fix); replaced billing `idempotencyKey` plan with in-memory `finalized` flag (avoids `deductToolCredits` signature migration); explicitly scoped `LONG_RUNNING_TOOLS_DENY` to `run_swarm` only with the other 4 long-running tools deferred to follow-up story.
  - **Enhancements:** Added AC5b `cancel_swarm` MCP tool + UI Stop button; Task 3.0 research subtask for `ctx.write` API verification; documented `live_callback` + `events.jsonl` as future enhancement path.
  - **Corrections:** Fixed line numbers (run_swarm at 430, TOOL_PRICING at 858, AbortSignal at 85); specified `bun:test` framework for new test files; noted Vibe-Trading submodule on branch `v1-1` with potential unmerged conflicts; added R8/R9/R10 to Risk Register.
- **2026-05-19 (dev complete)** — Implementation shipped. All 7 tasks completed. 23 new unit tests (17 apps/api + 6 epsilon-master) GREEN; existing 88 apps/api + 30 epsilon-master + 8 apps/web swarm-teams tests still pass — no regressions. 3 E2E specs scaffolded under `tests/e2e/specs/swarm-*.spec.ts` (gated `CI_FULL_STACK=true` + `CI_CHAOS_ENABLED=true`). Task 3.0 research: `@opencode-ai/plugin@1.14.28` exposes `ToolContext.abort: AbortSignal` but NOT `ctx.write` / `ctx.output` — MVP fallback (buffer progress, return concatenated string) used; UI parser extracts progress markers from stdout in `OcVibeTradingSwarmToolView`. Status: ready-for-dev → in-progress → review.

## Dev Agent Record

### Implementation summary

- **Vibe-Trading MCP (`Vibe-Trading/agent/mcp_server.py`)** — Added `start_swarm` + `cancel_swarm` MCP tools after `run_swarm` (lines 487-580 area). Added deprecation docstring to `run_swarm` (sunset 2026-06-19). Introduced module-level `_swarm_runtime_singleton` so `start` and `cancel` share `cancel_events` (per `SwarmRuntime` instance state). File was in `UU` state — clean (no conflict markers); marked resolved via `git add`.
- **apps/api proxy (`apps/api/src/router/routes/vibe-trading-mcp.ts`)** — Full rewrite with:
  - `LONG_RUNNING_TOOLS_DENY = {'run_swarm'}` returning 410 Gone (AC2).
  - In-memory `runOwnership` Map with 24h TTL + `finalized` flag (AC1b, AC5).
  - `OWNERSHIP_GATED_TOOLS = {'get_swarm_status', 'get_run_result', 'cancel_swarm'}` — 403 on mismatch, log `[swarm-ownership-violation]`.
  - `parseToolResult` helper for FastMCP envelope unwrapping (`result.content[0].text` → JSON).
  - On `start_swarm` success: capture `run_id`, seed ownership.
  - On `list_runs` success: re-hydrate ownership for runs this account asked about (proxy-restart recovery), guarded against cross-account theft via `!runOwnership.has(...)` check.
  - On `get_run_result` with `status === 'completed'`: claim `finalized = true` BEFORE await (defence-in-depth against re-entry), then deduct `vt_mcp_run_swarm_finalize`.
  - Exported `__resetOwnershipForTests` for unit test isolation.
- **Billing config (`apps/api/src/config.ts`)** — Added `vt_mcp_start_swarm` (0.05), `vt_mcp_run_swarm_finalize` (0.20), `vt_mcp_cancel_swarm` (0) to TOOL_PRICING. Kept `vt_mcp_run_swarm` (0.25) untouched for direct-sandbox bypass test rigs.
- **OpenCode wrapper (`core/epsilon-master/opencode/tools/vibe_trading_swarm.ts`)** — Implements start/poll/finalize via inline SSE-MCP client (`lib/mcp-sse-client.ts`). MVP fallback (no `ctx.write` available) buffers progress markers and returns as concatenated string. Cooperative cancel via `ctx.abort.aborted` check.
- **SSE-MCP client (`core/epsilon-master/opencode/tools/lib/mcp-sse-client.ts`)** — Minimal client: open SSE → parse `event: endpoint` for `session_id` → POST `tools/call` to `/messages/?session_id=...` → wait for matching response in SSE stream → `close()` on tool exit. Handles proxy 410/403/402 short-circuit responses (non-SSE 4xx).
- **Tier 2 agent prompt (`core/epsilon-master/opencode/agents/chainlens-tier2.md`)** — Added `vibe_trading_swarm: allow` to permissions. Rewrote "Swarm Teams" section to make wrapper canonical, mark `run_swarm` DEPRECATED.
- **UI tool view (`apps/web/src/components/thread/tool-views/opencode/OcVibeTradingSwarmToolView.tsx`)** — New component. Parses wrapper stdout for `▶️`/`⏳`/`🛑`/`❌` markers + `---`-separated final markdown report. Renders progress strip with percentage bar + Done/Cancelled/Error badge. Falls back to "No output yet." when input is empty.
- **Tool registration (`apps/web/src/components/session/tool-renderers.tsx`)** — `ToolRegistry.register('vibe_trading_swarm', OcVibeTradingSwarmToolView)` + hyphen variant. Component uses `ToolProps` (part-based) directly, so no adapter needed.
- **Swarm Teams page (`apps/web/src/app/(dashboard)/dashboard/swarm-teams/swarm-teams.utils.ts`)** — Prompt builder rewritten to dispatch `vibe_trading_swarm` wrapper instead of raw `run_swarm` MCP. Existing test (`apps/web/src/__tests__/swarm-teams.test.tsx`) updated to assert the new tool name + absence of `run_swarm`.
- **CI fast-tier (`.github/workflows/test.yml`)** — Added 3 new files: `vibe-trading-swarm-async.test.ts`, `swarm-finalize-billing.test.ts` (apps/api), `vibe_trading_swarm.test.ts` (epsilon-master). Updated summary count.
- **E2E specs** — `swarm-async-roundtrip.spec.ts` (full stack happy path), `swarm-cancel.spec.ts` (Stop mid-flight), `swarm-resume-after-api-restart.spec.ts` (chaos: docker kill + restart). All three added to `tests/playwright.config.ts` CI skip list to gate behind `CI_FULL_STACK=true` (and `CI_CHAOS_ENABLED=true` for the chaos one).
- **Sunset tracking (`_bmad-output/implementation-artifacts/deferred-work.md`)** — Added Story 5.5.1 deferral section with sunset for `run_swarm`, future async migration for 4 other long-running tools, `tail_swarm_events` enhancement, DB-backed ownership promotion, UI "Resume run" affordance, chaos billing assertion.
- **CLAUDE.md** — Added "Vibe-Trading async swarm pattern" section under Stack & Architecture documenting the canonical start/poll/finalize architecture for any future MCP tool with >30s runtime.

### Decisions & deviations

- **Task 3.0 research outcome**: `@opencode-ai/plugin@1.14.28` `ToolContext` exposes `abort: AbortSignal` and `metadata(...)` but NOT `ctx.write` / `ctx.output`. MVP fallback path mandatory. UI tool view parses progress markers from final stdout.
- **MCP transport choice**: FastMCP server only supports SSE transport (per `mcp_server.py:984`). Wrapper uses a hand-rolled SSE-MCP client (`lib/mcp-sse-client.ts`) — one session per `execute()` lifetime, closed in `finally`. No external dependency added.
- **Test isolation**: avoided mocking `../../config` in new test files because `mock.module` is process-global in Bun and would pollute `vibe-trading-mcp-pricing.test.ts` when run together. Tests use the real config (which already has the new pricing entries from this story).
- **Stop button location**: Story 5.6 page has no "in-flight run row" UI — runs are dispatched as chat sessions. The cancel affordance is the existing chat Stop button, which fires `ctx.abort` into the wrapper's poll loop. No new page-level button needed; documented in Task 4 deviation note.
- **Submodule state**: Vibe-Trading was in `UU` mid-merge state at start of session — content already clean (no conflict markers), just needed `git add` to mark resolved. R4 risk mitigated.

### Tests passing (regression)

- `apps/api` fast-tier (10 files): **88 pass / 0 fail**
- `core/epsilon-master` fast-tier (5 files): **30 pass / 0 fail**
- `apps/web` swarm-teams (1 file): **8 pass / 0 fail**
- TypeScript: `apps/api` ✅, `core/epsilon-master` ✅ (no new errors)

### File List

**Created:**
- `Vibe-Trading/agent/tests/test_async_swarm_mcp_tools.py`
- `apps/api/src/__tests__/unit/vibe-trading-swarm-async.test.ts`
- `apps/api/src/__tests__/unit/swarm-finalize-billing.test.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_swarm.ts`
- `core/epsilon-master/opencode/tools/lib/mcp-sse-client.ts`
- `core/epsilon-master/opencode/tools/__tests__/vibe_trading_swarm.test.ts`
- `apps/web/src/components/thread/tool-views/opencode/OcVibeTradingSwarmToolView.tsx`
- `tests/e2e/specs/swarm-async-roundtrip.spec.ts`
- `tests/e2e/specs/swarm-cancel.spec.ts`
- `tests/e2e/specs/swarm-resume-after-api-restart.spec.ts`

**Modified:**
- `Vibe-Trading/agent/mcp_server.py` — added `start_swarm` + `cancel_swarm` MCP tools; deprecation docstring on `run_swarm`
- `apps/api/src/router/routes/vibe-trading-mcp.ts` — 410 deny-list + in-memory ownership map + finalize billing trigger
- `apps/api/src/config.ts` — 3 new TOOL_PRICING entries
- `apps/api/src/__tests__/unit/vibe-trading-mcp-proxy-extended.test.ts` — 410 regression case
- `apps/web/src/app/(dashboard)/dashboard/swarm-teams/swarm-teams.utils.ts` — prompt dispatches `vibe_trading_swarm`
- `apps/web/src/__tests__/swarm-teams.test.tsx` — updated assertion to match new prompt
- `apps/web/src/components/session/tool-renderers.tsx` — registered `OcVibeTradingSwarmToolView`
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — `vibe_trading_swarm: allow` + swarm section rewrite
- `core/epsilon-master/opencode/tools/README.md` — `vibe_trading_swarm` section + MCP tool registry deltas
- `.github/workflows/test.yml` — 3 new fast-tier test files; summary count updated
- `tests/playwright.config.ts` — gate new E2E specs behind `CI_FULL_STACK=true`
- `_bmad-output/implementation-artifacts/deferred-work.md` — Story 5.5.1 sunset section
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flip 5-5-1 to in-progress → review
- `_bmad-output/implementation-artifacts/5-5-1-vibe-trading-swarm-async-execution.md` — status, Dev Agent Record, File List, Change Log
- `CLAUDE.md` — "Vibe-Trading async swarm pattern" canonical doc
