# Story 5.6: Shadow Account + Swarm Teams UI Pages

Status: ready-for-dev

**Depends on**: [Story 5.5](5-5-vibe-trading-mcp-proxy.md) done (MCP proxy unlocks all 21 tools).

<!-- Created 2026-05-12 (v3). With MCP proxy (5.5) handling all tool routing + billing,
     this story is PURE FRONTEND — 2 dashboard pages that drive VT MCP tools via AI Chat. -->

## Context

Story 5.5 gives the Tier 2 agent access to all 21 VT MCP tools. This story adds 2 dashboard
pages so users can trigger the flagship features without manually typing prompts:

1. **Shadow Account** (`/dashboard/shadow-account`) — upload broker CSV → AI runs 5-step loop
2. **Swarm Teams** (`/dashboard/swarm-teams`) — browse 29 presets → AI runs multi-agent team

Both pages are thin UI shells that dispatch pre-filled prompts to the existing AI Chat.
No new backend routes needed — tools are already available via MCP proxy.

## Story

As a Tier 2 user trên Chainlens,
I want dedicated pages cho Shadow Account analysis và Swarm Teams execution,
so that tôi trigger các flagship features bằng 1 click thay vì phải biết tên tools.

## Acceptance Criteria

### AC1 — Shadow Account page `/dashboard/shadow-account`

**Given** Tier 2 user truy cập page
**When** page loads
**Then**:
- Drag-and-drop CSV upload zone (`.csv`, `.xlsx`, `.xls`, max 10MB)
- Supported formats listed: 同花顺, 东财, 富途, generic
- On upload: file sent via MCP `write_file` tool to VT workspace (or via existing file upload mechanism)
- "Analyze with AI" button dispatches pre-filled prompt to Chat:
  ```
  Analyze my trade journal at {file_path}. Run the full Shadow Account loop:
  1) analyze_trade_journal, 2) extract_shadow_strategy, 3) run_shadow_backtest for 1 year,
  4) render_shadow_report, 5) scan_shadow_signals. Explain each step briefly.
  ```
- Agent runs 5-step loop via MCP tools, streams progress in Chat

**Given** Tier 1 user truy cập
**When** page loads
**Then** upgrade prompt "Shadow Account requires Tier 2" + pricing link

### AC2 — Swarm Teams page `/dashboard/swarm-teams`

**Given** Tier 2 user truy cập page
**When** page loads
**Then**:
- Preset grid fetched via MCP `list_swarm_presets` (agent call or direct API)
- Each card: team name, description, agent count, required variables
- Click preset → config modal with dynamic form for preset variables
- "Run" button dispatches pre-filled prompt to Chat:
  ```
  Run swarm team "{preset_name}" with variables: {vars_json}. Poll status and show the final report when done.
  ```
- If user has no OpenAI key configured → toast: "Configure your OpenAI key in Settings → AI Keys"

**Given** Tier 1 user
**When** page loads
**Then** upgrade prompt

### AC3 — Shadow report delivery

**Given** agent calls MCP `render_shadow_report` → returns `shadow_id`
**When** report is ready
**Then** agent response includes link to view report
**And** epsilon-api needs 1 passthrough route for report retrieval:
  `GET /v1/router/vibe-trading/shadow-reports/:shadowId` → VT `GET /shadow-reports/:shadowId`
  (existing VT endpoint at [api_server.py:1654](Vibe-Trading/agent/api_server.py#L1654))
**And** route validates `shadowId` matches `/^shadow_[0-9a-f]{8}$/`
**And** auth: `combinedAuth`
**And** no billing (report already billed at render time via MCP proxy)

### AC4 — Tests

- UI tests: Shadow page renders upload zone (Tier 2), upgrade prompt (Tier 1) — 2 tests
- UI tests: Swarm page renders preset grid (Tier 2), upgrade prompt (Tier 1) — 2 tests
- Route test: shadow-reports passthrough validates shadowId format — 2 tests
- TypeScript clean

## Tasks

### Task 1 — Shadow Account page

- [ ] `apps/web/src/app/(dashboard)/shadow-account/page.tsx` (server component, tier check)
- [ ] `apps/web/src/components/shadow-account/shadow-account-client.tsx` ("use client")
  - Upload zone + "Analyze with AI" button
  - On click: navigate to Chat with pre-filled message

### Task 2 — Swarm Teams page

- [ ] `apps/web/src/app/(dashboard)/swarm-teams/page.tsx` (server component, tier check)
- [ ] `apps/web/src/components/swarm-teams/preset-grid.tsx` ("use client")
  - Fetch presets via API (or initial server-side fetch)
  - Config modal + "Run" button → dispatch to Chat

### Task 3 — Shadow report passthrough route

- [ ] Add `GET /shadow-reports/:shadowId` to `apps/api/src/router/routes/vibe-trading.ts`
- [ ] Passthrough to `${VT_URL}/shadow-reports/${shadowId}?format=${format}`
- [ ] Stream binary response (HTML/PDF)

### Task 4 — Tests + docs

## Dev Notes

### File upload approach

Check existing file upload patterns in the codebase. Options:
1. Use MCP `write_file` tool — agent writes CSV to VT workspace
2. Use existing VT `POST /upload` endpoint via epsilon-api passthrough (if needed, add 1 route)
3. Frontend uploads to a temp endpoint, returns path — simplest for drag-drop UX

### Source Tree Components to Touch

**NEW files:**
- `apps/web/src/app/(dashboard)/shadow-account/page.tsx`
- `apps/web/src/components/shadow-account/shadow-account-client.tsx`
- `apps/web/src/app/(dashboard)/swarm-teams/page.tsx`
- `apps/web/src/components/swarm-teams/preset-grid.tsx`

**Modified files:**
- `apps/api/src/router/routes/vibe-trading.ts` — add shadow-reports passthrough

### References

- [Story 5.5](5-5-vibe-trading-mcp-proxy.md) — MCP proxy provides all tools
- [VT shadow-reports endpoint](Vibe-Trading/agent/api_server.py#L1654)
- [VT SKILL.md](Vibe-Trading/agent/SKILL.md) — Shadow Account + Swarm docs
