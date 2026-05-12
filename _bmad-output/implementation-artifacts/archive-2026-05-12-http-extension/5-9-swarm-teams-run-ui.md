# Story 5.9: Swarm Teams Execution UI

Status: backlog

**Depends on**: [Story 5.7](5-7-web-file-tools-and-swarm-readonly.md) done (read-only swarm tools
shipped), [Story 5.8](5-8-user-llm-key-management.md) done (LLM key infrastructure).

<!-- Created 2026-05-12 by Winston. Split from unified 5.8 spec. This story
     consumes the key management primitive (5.8) to enable Swarm Teams execution. -->

## Context

Vibe-Trading ships 29 pre-built multi-agent research teams via the MCP `run_swarm` tool
(Investment Committee, Quant Strategy Desk, Crypto Trading Desk, Risk Committee, etc.).
Each team runs a DAG of specialized LLM agents that collaborate on complex research.

Story 5.7 shipped read-only swarm tools (`list_swarm_presets`, `list_swarm_runs`). This story
adds the **execution** path + UI.

**Key constraint**: `run_swarm` spawns internal LLM workers using an LLM API key. Chainlens
policy (per Story 5.8 Product Decision 2): this key is the **user's own**, billed directly by
the LLM provider (OpenAI/Anthropic) on the user's account. Chainlens charges only a separate
*orchestration fee* in internal credits.

## Story

As a Tier 2 analyst trên Chainlens,
I want chạy 29 pre-built Swarm Teams (Investment Committee, Quant Desk, Crypto Trading Desk, ...)
trên một symbol và nhận báo cáo đa chiều từ multiple specialized agents,
so that tôi có được research thorough mà không phải tự orchestrate nhiều AI agents.

## Acceptance Criteria

### AC1 — 3 Swarm run OpenCode tools + routes

**Given** Story 5.7 read-only swarm tools đã ship
**When** Story 5.9 ships
**Then** thêm 3 OpenCode tools + 3 epsilon-api sub-routes:

| Tool | VT endpoint | Timeout |
|---|---|---|
| `vibe_trading_run_swarm.ts` | `POST /swarm/runs` ([existing at api_server.py:1801](Vibe-Trading/agent/api_server.py#L1801)) | 5s (async — returns run_id immediately) |
| `vibe_trading_get_swarm_status.ts` | `GET /swarm/runs/:id` ([existing:1838](Vibe-Trading/agent/api_server.py#L1838)) | 3s |
| `vibe_trading_get_swarm_result.ts` | `GET /swarm/runs/:id` (same endpoint, filters for `final_report`) | 3s |

**And** epsilon-api sub-routes:
```
POST /v1/router/vibe-trading/swarm/runs                      → create run
GET  /v1/router/vibe-trading/swarm/runs/:runId               → status + final_report
GET  /v1/router/vibe-trading/swarm/runs/:runId/events        → SSE stream (optional)
POST /v1/router/vibe-trading/swarm/runs/:runId/cancel        → cancel run
```

**And** `vibe_trading_run_swarm` tool NON-BLOCKING:
- Returns `{run_id, status: 'pending'}` immediately after VT accepts job
- Does NOT poll internally (unlike MCP version which blocks 30min)
- Agent polls `get_swarm_status` separately, decides when to fetch final report

**And** pre-flight check: before calling VT, service layer checks user has `openai` key
configured (query `user_ai_keys`) — if missing, return:
```json
{ "success": false, "error": "Configure your OpenAI API key in Settings → AI Keys to run Swarm Teams", "action_url": "/dashboard/settings/ai-keys" }
```

### AC2 — Sandbox env already has user's OpenAI key (from Story 5.8)

**Given** Story 5.8 pool env-injector decrypts + injects user AI keys at session spawn
**When** Tier 2 user with OpenAI key starts session
**Then** sandbox env already contains `OPENAI_API_KEY` (no extra work here)
**And** VT container ALSO needs key — epsilon-api service layer passes `OPENAI_API_KEY` from
user's AI keys into VT `POST /swarm/runs` request body via new field `user_openai_key`:

```python
# VT api_server.py extension (Story 5.9 Task 1)
class SwarmRunPayload(BaseModel):
    preset_name: str
    user_vars: dict
    user_openai_key: str | None = None  # NEW — injected per-request, not container env

@app.post("/swarm/runs", ...)
async def create_swarm_run(payload: SwarmRunPayload):
    if payload.user_openai_key:
        os.environ["OPENAI_API_KEY"] = payload.user_openai_key  # process-local, not global
    # ... existing logic
```

**Security note**: Key passed per-request not stored in VT. Container-level `OPENAI_API_KEY`
env is NOT set — prevents key leak if one user's request logs env dump.

### AC3 — Swarm Teams page `/dashboard/swarm-teams`

**Given** Tier 2 user truy cập `/dashboard/swarm-teams`
**When** page loads
**Then**:
- Preset grid: card per team (icon, name, description, agent count, required variables schema)
- Data fetched from `GET /v1/router/vibe-trading/swarm/presets` (via Story 5.7 read-only tool)
- Click preset → config modal opens with dynamic form based on preset's `required_variables`
- "Run" button:
  - If user has NO OpenAI key → redirect to `/dashboard/settings/ai-keys` với toast "Configure your OpenAI key to run Swarm Teams"
  - Otherwise POST `/v1/router/vibe-trading/swarm/runs` → navigate to `/dashboard/swarm-teams/runs/:id`
- Tier gate: Tier 1 sees upgrade prompt (Swarm Teams Tier 2-only; this is DIFFERENT from Story 5.8 Settings page which is all-tier)

**And** run detail page `/dashboard/swarm-teams/runs/:runId`:
- Status badge (pending / running / completed / failed / cancelled)
- Task timeline (per-agent progress from `tasks` array in run detail)
- Final report (Markdown rendered from `final_report` field)
- "Cancel" button if status=running → POST `/swarm/runs/:id/cancel`
- Token usage: `total_input_tokens` + `total_output_tokens` with estimated cost disclaimer

### AC4 — Billing: orchestration fee only, LLM billed by provider

**Given** Product Decision 2 (Story 5.8): Chainlens charges orchestration fee only
**When** `POST /v1/router/vibe-trading/swarm/runs` called
**Then**:
- `checkCredits(accountId)` → 402 nếu thiếu
- `deductToolCredits(accountId, 'vibe_trading_run_swarm', 0, 'Swarm: ${preset_name}', session_id)` ATOMIC
- Pricing: `vibe_trading_run_swarm = $0.25` orchestration fee (one-time per run)
- Other swarm tools (status, result, cancel) = $0 (read/control only)

**And** Swarm Teams page UI displays disclaimer above "Run" button:
> "This feature uses your OpenAI API key. LLM token costs are billed directly by OpenAI to
> your account. Chainlens charges a one-time $0.25 orchestration fee per run."

**And** run detail page shows after completion:
- Chainlens orchestration fee: $0.25
- Estimated LLM cost: ~$X (calculated from token usage × provider pricing — best effort, link to OpenAI billing for authoritative)

### AC5 — Tier gate on Swarm Teams execution

**Given** Swarm Teams UI is Tier 2+ (distinct from Story 5.8 Settings page which is all-tier)
**When** Tier 1 user truy cập `/dashboard/swarm-teams`
**Then** hiển thị upgrade prompt "Swarm Teams is a Tier 2 feature" + link to pricing
**And** agent frontmatter:
- `chainlens-tier1.md`: 3 new swarm tools `deny`
- `chainlens-tier2.md`: 3 new swarm tools `allow`

### AC6 — Tests

- Pre-flight key check test (happy + missing key) — 2 tests
- Swarm run tool tests: per-tool happy + 1 error (≥6 tests)
- Route tests: 3 happy + 3 missing-key + 3 402 + cancel flow (≥10 tests)
- UI tests: page renders, preset click, run flow with missing key, run detail (≥6 tests)
- VT integration test (gated): `test_swarm_run_with_user_key.py` — verify key injection works
- TypeScript clean

## Tasks / Subtasks

### Task 1 — VT FastAPI: user_openai_key injection (AC2)

- [ ] Edit `Vibe-Trading/agent/api_server.py`:
  - Extend `POST /swarm/runs` payload with optional `user_openai_key` field
  - Inject via `os.environ` at request start, restore or unset at request end
  - DO NOT log key value; log only "key injected (length=N)" if needed
- [ ] Test: swarm run with injected key succeeds; without key falls back to container env or errors per existing behavior

### Task 2 — epsilon-api routes (AC1, AC4)

- [ ] Extend `apps/api/src/router/services/vibe-trading.ts` với 3 functions:
  - `createSwarmRun(payload, userOpenAiKey)` — POST with key injection
  - `getSwarmRun(runId)` — GET run detail
  - `cancelSwarmRun(runId)` — POST cancel
- [ ] Extend `apps/api/src/router/routes/vibe-trading.ts`:
  - `POST /swarm/runs` — pre-flight key check + atomic billing + VT call
  - `GET /swarm/runs/:runId` — passthrough
  - `POST /swarm/runs/:runId/cancel` — passthrough
- [ ] Pre-flight service `apps/api/src/router/services/ai-keys.ts` function:
  - `getDecryptedKey(userId, keyType): Promise<string | null>` — decrypt on demand
- [ ] Pricing: add `vibe_trading_run_swarm = $0.25` to TOOL_PRICING

### Task 3 — 3 OpenCode tools (AC1)

- [ ] Create 3 tool files per Story 5.5 template
- [ ] Update agent permissions in tier1/tier2 frontmatter
- [ ] Update tier2 system prompt with swarm execution guidance

### Task 4 — Swarm Teams page UI (AC3, AC5)

- [ ] Create `apps/web/src/app/(dashboard)/swarm-teams/page.tsx` (server component with tier gate)
- [ ] Create `apps/web/src/app/(dashboard)/swarm-teams/runs/[runId]/page.tsx`
- [ ] Create `apps/web/src/components/swarm-teams/preset-grid.tsx`
- [ ] Create `apps/web/src/components/swarm-teams/preset-config-modal.tsx`
- [ ] Create `apps/web/src/components/swarm-teams/run-detail.tsx`
- [ ] Component tests

### Task 5 — Documentation

- [ ] Update `core/epsilon-master/opencode/tools/README.md` — Swarm Teams section
- [ ] Add user-facing help article stub for Swarm Teams (future docs work)

## Dev Notes

### Why per-request key injection (not container env)

Story 5.0 noted LLM API keys MUST NOT live as container env if multiple users share the container.
`vibe-trading` + `vibe-trading-worker` are shared across all users. Per-request injection via
payload is the clean boundary:

- Key lives in process env ONLY for duration of that single request
- `user_openai_key` field omitted from request logs (Pydantic `SecretStr` pattern)
- No persistence, no cross-user leak

### Cost estimation (AC4)

Token cost estimation is best-effort. OpenAI pricing varies by model; use conservative estimates:
- `gpt-4o` input: $2.50/1M, output: $10/1M
- `gpt-4o-mini` input: $0.15/1M, output: $0.60/1M

Display as range: "Estimated LLM cost: $0.10–$0.40 (actual billed by OpenAI)". Link to
`https://platform.openai.com/usage` for authoritative.

### Source Tree Components to Touch

**NEW files:**
- `core/epsilon-master/opencode/tools/vibe_trading_run_swarm.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_get_swarm_status.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_get_swarm_result.ts`
- `apps/web/src/app/(dashboard)/swarm-teams/page.tsx`
- `apps/web/src/app/(dashboard)/swarm-teams/runs/[runId]/page.tsx`
- `apps/web/src/components/swarm-teams/preset-grid.tsx`
- `apps/web/src/components/swarm-teams/preset-config-modal.tsx`
- `apps/web/src/components/swarm-teams/run-detail.tsx`
- component test files

**Modified files:**
- `Vibe-Trading/agent/api_server.py` — extend `/swarm/runs` payload with `user_openai_key`
- `apps/api/src/router/services/vibe-trading.ts` — +3 swarm functions
- `apps/api/src/router/routes/vibe-trading.ts` — +3 swarm sub-routes with key pre-flight
- `apps/api/src/router/services/ai-keys.ts` — add `getDecryptedKey` helper (from 5.8)
- `apps/api/src/config.ts` — add `vibe_trading_run_swarm` pricing
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` — 3 tools deny
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — 3 tools allow + swarm prompt section
- `core/epsilon-master/opencode/tools/README.md`

### Testing Standards

- `bun test` across all files
- Manual E2E: configure OpenAI key → navigate Swarm Teams page → select "investment_committee" → enter target=AAPL.US → run → verify completes with final_report

### Performance Budget

| Operation | Target |
|---|---|
| POST /swarm/runs (create) | <500ms (async enqueue only) |
| GET /swarm/runs/:id | <200ms |
| Key decryption per-request | <5ms |
| Swarm run wall-clock (server-side) | 30s–30min depending on preset |

### Risk Register

| Risk | Mitigation |
|---|---|
| Key leak in VT logs | Pydantic SecretStr + inspect VT logging before ship |
| User's OpenAI rate limit hit mid-run | VT run fails gracefully, show error + link to OpenAI rate limits |
| Orchestration cost surprise (multiple quick reruns) | UI rate limits "Run" button to once per 30s per user |
| User cancels mid-run — OpenAI tokens already spent | Document: Chainlens refunds orchestration fee ($0.25), OpenAI tokens NOT refundable |

### References

- [Story 5.7](5-7-web-file-tools-and-swarm-readonly.md) — read-only swarm tools
- [Story 5.8](5-8-user-llm-key-management.md) — key management primitive
- [VT swarm endpoints](Vibe-Trading/agent/api_server.py) — lines 1794-1904 (existing, extended in Task 1)
- [VT SKILL.md Swarm section](Vibe-Trading/agent/SKILL.md) — 29 preset inventory
