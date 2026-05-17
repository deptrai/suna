# Story 5.6: Shadow Account + Swarm Teams UI Pages

Status: review

**Epic:** 5 — Backtesting Sandbox
**Created:** 2026-05-12 (v3 — MCP proxy approach)
**Updated:** 2026-05-18 (context-engineered rewrite — verified patterns in code, exact file paths)
**Depends on:** [Story 5.5](5-5-vibe-trading-mcp-proxy.md) `done` (MCP proxy unlocks all 21 VT tools at `/v1/router/vibe-trading-mcp/*`).
**Blocks:** Nothing.
**FRs:** FR3 (Vibe-Trading platform integration)
**NFRs:** NFR8 (atomic billing — already enforced in MCP proxy), NFR10 (sandbox egress unchanged)
**ARs:** AR1, AR8

## Context

Story 5.5 routes ALL 21 Vibe-Trading MCP tools (Shadow Account, Swarm presets, market data, options, factor analysis, finance skills, file I/O) through `apps/api/src/router/routes/vibe-trading-mcp.ts` with per-tool billing (`vt_mcp_*` pricing) + Tier-2 gate at the proxy ([vibe-trading-mcp.ts:67-71](apps/api/src/router/routes/vibe-trading-mcp.ts#L67-L71)).

This story is **pure frontend** — 2 dashboard pages that build a pre-filled prompt and dispatch it to the existing AI Chat. The agent (running in sandbox via OpenCode + remote MCP) executes the tools. **No new tool wrappers, no new MCP plumbing.**

**Only one new backend route** is required: a passthrough for `GET /v1/router/vibe-trading/shadow-reports/:shadowId` because the report is served by `vibe-trading:8899` (HTTP API) — NOT by `vibe-trading-mcp:8900` (MCP server). Verified at [Vibe-Trading/agent/api_server.py:1654](Vibe-Trading/agent/api_server.py#L1654).

## Story

As a Tier 2 user trên Chainlens,
I want dedicated dashboard pages cho Shadow Account analysis và Swarm Teams browsing,
so that tôi trigger flagship features bằng 1 click thay vì phải biết tên tools hay cú pháp prompt.

## Acceptance Criteria

### AC1 — Shadow Account page `/dashboard/shadow-account`

**Given** a Tier 2/3 user opens the page
**When** the page renders
**Then** show:
- Page header (`PageHeader` from `@/components/ui/page-header`, parity với Backtest page)
- Drag-and-drop zone using a native `<input type="file" accept=".csv,.xlsx,.xls">` (codebase has NO `react-dropzone` — use the same pattern as `session-chat.tsx` file drop)
- Format hints: 同花顺, 东财, 富途 broker exports + generic CSV; max 10MB
- After drop/select: call `uploadFile(file, '/workspace/uploads')` from [apps/web/src/features/files/api/opencode-files.ts:273](apps/web/src/features/files/api/opencode-files.ts#L273) → returns `{ path }`
- "Analyze with AI" button enabled when a file is uploaded

**Given** a file uploaded (returned path = `/workspace/uploads/<filename>`)
**When** user clicks "Analyze with AI"
**Then** dispatch a new chat session with the prompt below using the **canonical sessionStorage handoff** (see Dev Notes → Chat Dispatch Pattern):

```
Analyze my trade journal at /workspace/uploads/<filename>.csv using the Vibe-Trading Shadow Account loop. Run these MCP tools in order, stream a brief explanation after each:

1. analyze_trade_journal(journal_path="/workspace/uploads/<filename>.csv")
2. extract_shadow_strategy(journal_path=..., min_support=3, max_rules=5)
3. run_shadow_backtest(shadow_id=..., markets=["us","crypto","hk","china_a"])
4. render_shadow_report(shadow_id=..., include_today_signals=true)
5. scan_shadow_signals(shadow_id=..., per_market=3)

After step 4, share the report viewer URL: https://<host>/v1/router/vibe-trading/shadow-reports/<shadow_id>?format=html
```

**And** the agent must be set to `chainlens-tier2` via `opencode_pending_options:<sessionId>` so the MCP proxy tier check passes (proxy returns 403 if account is not Tier 2/3).

**Given** a Tier 1/free user opens the page
**When** the page renders
**Then** render an inline upgrade prompt instead of the upload UI (page MUST still render — do NOT redirect or 404)
**And** include a primary CTA "Upgrade to Tier 2" that calls `usePricingModalStore.getState().openPricingModal({ isAlert: true, alertTitle: 'Shadow Account requires Tier 2' })` from [apps/web/src/stores/pricing-modal-store.ts:15](apps/web/src/stores/pricing-modal-store.ts#L15).

### AC2 — Swarm Teams page `/dashboard/swarm-teams`

**Given** a Tier 2/3 user opens the page
**When** the page renders
**Then** show a preset grid sourced from the static catalog (see Dev Notes → Swarm presets) — DO NOT fetch from MCP at page load (would burn credits + auth complexity); the catalog is small and stable

**Given** a user clicks a preset card
**When** the config modal opens
**Then** render a dynamic form (one input per `required_variable` — preset metadata from catalog) with placeholder examples
**And** "Run" dispatches a new chat session with prompt:

```
Run the Vibe-Trading swarm preset "<preset_name>" with these variables:
<variables_json_indented>

Use the run_swarm MCP tool. Stream the run_id back, then poll get_swarm_run_status every 30s until status=done. Show the final report.
```

**And** if `accountState.subscription.tier_key === 'free' | 'none' | undefined` (Tier 1) → render upgrade prompt instead of grid (same pattern as Shadow page).

**Given** the agent calls `run_swarm` and the preset requires user OpenAI key (e.g. `investment_committee`)
**When** key is missing
**Then** the agent surface an error (not this story's concern — Story 5.7 BYOK handles key wiring); show a banner on this page: "Some swarm presets require your OpenAI key — Settings → AI Keys" linking to `/dashboard/settings` (Tier 1+ awareness, no hard gate).

### AC3 — Shadow report passthrough route

**Given** the Shadow agent calls `render_shadow_report` (a Python tool inside the VT runtime, not a Chainlens API)
**When** report rendering completes
**Then** the report file lives at VT host `~/.vibe-trading/shadow_reports/<shadow_id>.{html,pdf}`, served by VT REST API at `GET /shadow-reports/{shadow_id}?format={html|pdf}` (existing endpoint, see [api_server.py:1654](Vibe-Trading/agent/api_server.py#L1654))

**When** Story 5.6 ships
**Then** add a new route to [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts):

```
GET /v1/router/vibe-trading/shadow-reports/:shadowId?format=html|pdf
```

**Behavior:**
- Auth: `combinedAuth` (already on `/vibe-trading/*` per [router/index.ts:54](apps/api/src/router/index.ts#L54))
- Validate `shadowId` matches `/^shadow_[0-9a-f]{8}$/` (parity with VT's own validation at [api_server.py:1651](Vibe-Trading/agent/api_server.py#L1651)) — return 400 if invalid
- Validate `format` in `['html', 'pdf']` (default `html`)
- Forward to `${config.VIBE_TRADING_INTERNAL_URL}/shadow-reports/${shadowId}?format=${format}` with VT auth header (parity existing `/vibe-trading/jobs` calls — see [services/vibe-trading.ts](apps/api/src/router/services/vibe-trading.ts))
- Stream the binary response back with `Content-Type` and `Content-Disposition: inline; filename="<shadow_id>.<format>"`
- Map VT 401/403/404 to typed errors (parity `VibeTradingAuthError/Forbidden/NotFound` already exported from `services/vibe-trading.ts`)
- **No billing** — render already billed at MCP `vt_mcp_render_shadow_report` time; this is just file delivery

### AC4 — Sidebar nav entries

**Given** the existing sidebar at [apps/web/src/components/sidebar/sidebar-left.tsx:1615-1630](apps/web/src/components/sidebar/sidebar-left.tsx#L1615) registers "Markets" via `openTabAndNavigate({ id: 'page:/markets', title: 'Markets', type: 'page', href: '/markets' })`

**When** Story 5.6 ships
**Then** insert TWO new entries directly after the "Markets" `<Button>` (around line 1630):
- `{ id: 'page:/dashboard/shadow-account', title: 'Shadow Account', type: 'page', href: '/dashboard/shadow-account' }` with icon `Activity` from `lucide-react`
- `{ id: 'page:/dashboard/swarm-teams', title: 'Swarm Teams', type: 'page', href: '/dashboard/swarm-teams' }` with icon `Users` from `lucide-react`
- Both use `variant="sidebar"` and `className="rounded-lg"` (parity Markets entry)
- Add the corresponding `import { Activity, Users } from 'lucide-react'` at the top of the file (likely already partially imported — check existing imports first, do NOT duplicate)

### AC5 — Tests

- Page render tests (Bun test, web app uses `bun test src/...`):
  - `shadow-account.test.tsx`: renders upload zone for Tier 2, renders upgrade prompt for Tier 1, click "Analyze" calls `createSession.mutateAsync` + writes sessionStorage with expected prompt
  - `swarm-teams.test.tsx`: renders preset grid for Tier 2, renders upgrade prompt for Tier 1, click preset opens modal, "Run" dispatches with vars
- Backend route test (Bun test apps/api):
  - `shadow-reports-route.test.ts`: rejects invalid shadowId (400), rejects invalid format (400), proxies valid request, propagates 404 from VT
- TypeScript: `bun run --cwd apps/api typecheck` and `bun run --cwd apps/web typecheck` clean (existing baseline failures untouched)
- DO NOT run new tests in CI batches that share `../../config` mock module — see Story 2.3.2 dev note about Bun test isolation pattern

## Tasks / Subtasks

- [ ] **Task 1 — Shadow report passthrough route (AC3, AC5)**
  - [x] 1.1 Add `GET /shadow-reports/:shadowId` handler to [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts) (do not create a new file — keep parity with `/jobs`, `/runs/:id` already there)
  - [x] 1.2 Validate `shadowId` regex + `format` enum; throw `HTTPException(400)` on failure
  - [x] 1.3 Forward request via `fetch(${VIBE_TRADING_INTERNAL_URL}/shadow-reports/...)` with VT auth header (extract auth pattern from existing `getBacktestRun` helper)
  - [x] 1.4 Stream response body with original `Content-Type` and `Content-Disposition: inline; filename="<shadow_id>.<ext>"`
  - [x] 1.5 Add unit test `apps/api/src/__tests__/unit/shadow-reports-route.test.ts` (3 cases: invalid id 400, invalid format 400, happy 200; mock `fetch` similar to `vibe-trading-mcp` tests)
  - [x] 1.6 Confirm route is mounted (no router/index.ts change needed — `/vibe-trading` already mounted at [router/index.ts:73](apps/api/src/router/index.ts#L73))

- [ ] **Task 2 — Shadow Account page (AC1, AC4, AC5)**
  - [x] 2.1 Create `apps/web/src/app/(dashboard)/dashboard/shadow-account/page.tsx` (server-rendered shell, parity with `dashboard/backtest/page.tsx` — re-export `metadata` + render client component)
  - [x] 2.2 Create `apps/web/src/app/(dashboard)/dashboard/shadow-account/shadow-account-client.tsx` (`'use client'`, parity with `backtest-client.tsx`)
  - [x] 2.3 Implement tier gate: `useSubscriptionStore((s) => s.accountState)` → `tier_key in ['free','none', undefined]` → render `<TierGateBanner>` instead of upload zone (the banner is a small inline component for this story; see Dev Notes → Tier gate)
  - [x] 2.4 Implement upload zone: native `<input type="file" accept=".csv,.xlsx,.xls">` + drag-and-drop handlers. On `change` / `drop`, call `uploadFile(file, '/workspace/uploads')`. Show progress + uploaded path.
  - [x] 2.5 Implement "Analyze with AI" button: build the prompt string (literal template above, substitute `<filename>`); call `useCreateOpenCodeSession()` → `mutateAsync()`; write `sessionStorage[opencode_pending_prompt:${sessionId}] = promptText`; write `sessionStorage[opencode_pending_options:${sessionId}] = JSON.stringify({ agent: 'chainlens-tier2' })`; call `openTabAndNavigate({ id: session.id, title: 'Shadow Account analysis', type: 'session', href: '/sessions/${session.id}', serverId: useServerStore.getState().activeServerId })`
  - [x] 2.6 Sidebar nav entry (AC4): edit [sidebar-left.tsx:1630](apps/web/src/components/sidebar/sidebar-left.tsx#L1630)
  - [x] 2.7 Test (AC5)

- [ ] **Task 3 — Swarm Teams page (AC2, AC4, AC5)**
  - [x] 3.1 Create `apps/web/src/app/(dashboard)/dashboard/swarm-teams/page.tsx` (server shell)
  - [x] 3.2 Create `apps/web/src/app/(dashboard)/dashboard/swarm-teams/swarm-teams-client.tsx`
  - [x] 3.3 Define preset catalog as a typed const: `apps/web/src/components/swarm-teams/preset-catalog.ts` — see Dev Notes → Swarm presets for the source list. Each entry: `{ name, displayName, description, agentCount, requiredVars: { name, label, placeholder }[] }`
  - [x] 3.4 Tier gate (same pattern as shadow page)
  - [x] 3.5 Preset grid: card per preset (use existing `<Card>` from `@/components/ui/card` — no new design)
  - [x] 3.6 Config modal: `<Dialog>` from `@/components/ui/dialog`. Generate `<Input>` per `requiredVars`. Validate all filled before "Run".
  - [x] 3.7 "Run" button: build `promptText` (template above, JSON-stringify vars with 2-space indent), dispatch via the same sessionStorage handoff as Task 2.5
  - [x] 3.8 Optional banner: if account has no `user_ai_keys` configured (Story 5.7 will surface this — for Story 5.6, just static link "Configure OpenAI key in Settings" — do NOT block the action)
  - [x] 3.9 Sidebar nav entry (AC4)
  - [x] 3.10 Test (AC5)

- [ ] **Task 4 — Verification + docs**
  - [ ] 4.1 Run `bun run --cwd apps/web typecheck` and `bun run --cwd apps/api typecheck`; confirm no new errors in files this story touches (pre-existing baseline failures may remain)
  - [ ] 4.2 Manual smoke (UI): start dev (`cd apps/web && bunx next dev --turbopack --port 3000`), open both new pages, verify Tier 1 / Tier 2 paths render correctly, click-through to chat dispatches a session
  - [ ] 4.3 Manual smoke (backend): with VT running, `curl -H "Authorization: Bearer <epsilon_token>" http://localhost:8008/v1/router/vibe-trading/shadow-reports/shadow_deadbeef?format=html` returns 404 (not 500) when no such report; valid shadow_id returns 200 + HTML
  - [ ] 4.4 No README/docs updates needed (sidebar self-documents)

### Review Findings

_Generated 2026-05-18 by `/bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor); patches applied 2026-05-18._

**Decision-needed (resolved → patch):**

- [x] [Review][Patch] **Ownership check on shadow-reports route** — Implemented TOFU (Trust-On-First-Use) ownership: migration `0010_shadow_account_ownership.sql`, `claimOrAssertShadowOwnership()` helper at [apps/api/src/router/services/shadow-ownership.ts](apps/api/src/router/services/shadow-ownership.ts), called before VT fetch in [vibe-trading.ts:155](apps/api/src/router/routes/vibe-trading.ts#L155). 4 unit tests in `shadow-ownership.test.ts`. Mismatched account → 403.
- [x] [Review][Patch] **Typed VT errors** — Refactored route to use `VibeTradingAuthError/Forbidden/NotFound/Downstream` for diagnostic message; kept `HTTPException` wrapper for HTTP status mapping (parity `/runs/:jobId`).

**Patch (applied):**

- [x] [Review][Patch] **`isTier1` import từ tier-gate-banner.tsx broken** — fixed: import directly from `@/components/tier-gate.utils` in both client files.
- [x] [Review][Patch] **`uploadFile` returns array** — fixed: `Array.isArray(result) ? result[0]?.path : undefined` with empty-result guard.
- [x] [Review][Patch] **`VibeTradingDownstreamError` không catch — 500 thay vì 503** — fixed: now `return c.json({ ... }, 503)` parity `/runs/:jobId`.
- [x] [Review][Patch] **Swarm `runPreset` thiếu `catch`** — fixed: added `error` state + `catch (e) { setError(...) }` + render in dialog.
- [x] [Review][Patch] **Test thiếu case 401 cho missing accountId** — fixed: added `'401 when accountId missing'` test.
- [x] [Review][Patch] **`shadow-account.test.tsx` chỉ test logic, không render component** — expanded to 9 logic tests (tier gate full coverage, prompt template, dispatch with serverId, error propagation). Render tests deferred (no `@testing-library/react` in codebase) — see Deviations.
- [x] [Review][Patch] **`swarm-teams.test.tsx` chỉ test logic** — expanded to 8 logic tests (catalog assertion, tier gate, prompt build, dispatch). Same deviation.
- [x] [Review][Patch] **Zero-byte file upload không reject** — fixed: `if (file.size === 0) { setError('File is empty.'); return; }`.
- [x] [Review][Patch] **Drag-drop không validate MIME/extension** — fixed: extension regex check at top of `handleFile`.
- [x] [Review][Patch] **Multi-file drop silent discard** — fixed: `if (files.length > 1) { setError('Drop one file at a time.'); return; }`.
- [x] [Review][Patch] **`VIBE_TRADING_API_KEY` empty silent 401** — fixed: explicit guard `if (!config.VIBE_TRADING_API_KEY) return 503` with descriptive error.
- [x] [Review][Patch] **Test `process.env` mutation pollute worker** — fixed: capture original env in const, restore in `afterAll`.
- [x] [Review][Patch] **`mock.restore()` undo billing mock** — fixed: replaced with explicit `globalThis.fetch = ORIGINAL_FETCH` reset in `beforeEach`.

**Deviations from spec (acknowledged):**

- AC5 render tests refactored to expanded logic tests because `@testing-library/react` is not a dependency in `apps/web` (no precedent in codebase). Logic tests cover handler wiring, prompt content, sessionStorage keys, error propagation. Adding render tests requires `@testing-library/react` + `happy-dom` + `bunfig.toml` preload — tracked as future enhancement, not this story.
- AC3 typed errors map: route still throws `HTTPException` for HTTP status (global error handler does not catch typed errors); typed error classes provide diagnostic `.message` only. Functional behavior matches spec; pattern deviation documented here.

**Defer (3):**

- [x] [Review][Defer] **`sessionStorage.setItem` không try/catch — QuotaExceededError** [shadow-account.utils.ts, swarm-teams.utils.ts] — deferred, edge case quota tràn rất hiếm và `session-chat.tsx` đã có retry loop hấp thụ một phần.
- [x] [Review][Defer] **Double-click "Analyze" có thể fire 2 lần** [shadow-account-client.tsx:56-73] — deferred, React state guard sufficient cho normal user; thêm `useRef` lock optional, không phải bug functional rõ rệt.
- [x] [Review][Defer] **Prompt injection qua `vars` / `uploadedPath`** [shadow-account.utils.ts, swarm-teams.utils.ts] — deferred, prompt-side injection là class-of-attack rộng hơn 1 story; cần policy chung cho LLM input sanitization (OWASP LLM01) — track ở roadmap NFR/security.

**Test isolation note**: `shadow-reports-route.test.ts` and `shadow-ownership.test.ts` mock `../../config` differently — must run in separate `bun test` invocations (parity Story 2.3.2 dev note). Both pass when isolated; only fail when batched.

**Test results (2026-05-18 post-patch)**:
- `apps/api`: `shadow-reports-route.test.ts` 6/6 pass, `shadow-ownership.test.ts` 4/4 pass.
- `apps/web`: `shadow-account.test.tsx` 9/9 pass, `swarm-teams.test.tsx` 8/8 pass.

**New files added by review patches**:
- `packages/db/drizzle/0010_shadow_account_ownership.sql`
- `apps/api/src/router/services/shadow-ownership.ts`
- `apps/api/src/__tests__/unit/shadow-ownership.test.ts`

**Schema export added**: `shadowAccountOwnership` in `packages/db/src/schema/epsilon.ts` + re-exported from `packages/db/src/index.ts`.

## Dev Notes

### Critical brownfield guardrails

- **DO NOT** create a new OpenCode tool. Story 5.5 made tools auto-discoverable via MCP. The agent already sees them.
- **DO NOT** call MCP tools from the frontend. The frontend's only job is to dispatch a prompt; the agent calls tools.
- **DO NOT** add a frontend dependency on `react-dropzone` or any new file-upload library. Use the existing native `<input type="file">` pattern (parity `session-chat.tsx`).
- **DO NOT** redirect Tier 1 users away from the page. The spec says "show upgrade prompt" — the page must still render.
- **DO NOT** fetch swarm presets from MCP at page load — adds auth complexity, slows TTFB. Static catalog is fine; refresh quarterly when VT adds presets.
- **DO NOT** modify [vibe-trading-mcp.ts](apps/api/src/router/routes/vibe-trading-mcp.ts) — the MCP proxy is correct as-is.
- **DO NOT** add billing logic to the new shadow-reports route — billing already happened at MCP `render_shadow_report` time.

### Chat dispatch pattern (CANONICAL — verified in code)

The dashboard home and workspace page both use this exact 3-step handoff. **Use it verbatim.** Reference: [dashboard-content.tsx:103-149](apps/web/src/components/dashboard/dashboard-content.tsx#L103-L149).

```ts
'use client';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';

const createSession = useCreateOpenCodeSession();

async function dispatch(promptText: string, title: string) {
  const session = await createSession.mutateAsync();
  sessionStorage.setItem(`opencode_pending_prompt:${session.id}`, promptText);
  sessionStorage.setItem(
    `opencode_pending_options:${session.id}`,
    JSON.stringify({ agent: 'chainlens-tier2' }),
  );
  openTabAndNavigate({
    id: session.id,
    title,
    type: 'session',
    href: `/sessions/${session.id}`,
    serverId: useServerStore.getState().activeServerId,
  });
}
```

The session-page mount effect (in `session-chat.tsx`) drains the sessionStorage keys and fires the prompt with the agent options. There is no `?prompt=` URL param — the handoff is exclusively sessionStorage.

### File upload pattern

Reference: [opencode-files.ts:273-300](apps/web/src/features/files/api/opencode-files.ts#L273). The function `uploadFile(file: File, targetPath: string): Promise<UploadResult>` POSTs `multipart/form-data` to `${openCodeUrl}/file/upload` and returns `{ path }`. Use it directly — do NOT bypass through the sandbox proxy.

```ts
import { uploadFile } from '@/features/files/api/opencode-files';

async function handleFile(file: File) {
  const result = await uploadFile(file, '/workspace/uploads');
  setUploadedPath(result.path); // e.g. "/workspace/uploads/journal.csv"
}
```

The agent reads the uploaded file via the standard MCP tools (`analyze_trade_journal` accepts an absolute path).

### Tier gate pattern (verified in code)

There is **NO** existing `<TierGate>` component in the codebase (verified). For this story, build a small inline component:

```tsx
'use client';
import { useSubscriptionStore } from '@/stores/subscription-store';
import { usePricingModalStore } from '@/stores/pricing-modal-store';
import { Button } from '@/components/ui/button';

export function TierGateBanner({ feature }: { feature: string }) {
  const accountState = useSubscriptionStore((s) => s.accountState);
  const tierKey = accountState?.subscription?.tier_key;
  const isTier1 = !tierKey || tierKey === 'free' || tierKey === 'none';
  if (!isTier1) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/40 p-8 text-center space-y-4">
      <h2 className="text-xl font-semibold">{feature} requires Tier 2</h2>
      <p className="text-muted-foreground">Upgrade to unlock advanced research tools.</p>
      <Button onClick={() => usePricingModalStore.getState().openPricingModal({
        isAlert: true,
        alertTitle: `${feature} requires Tier 2`,
      })}>Upgrade to Tier 2</Button>
    </div>
  );
}
```

Place at `apps/web/src/components/tier-gate-banner.tsx`. Both pages use it. Reference: [subscription-store.tsx:200-215](apps/web/src/stores/subscription-store.tsx#L200), [pricing-modal-store.ts:15-28](apps/web/src/stores/pricing-modal-store.ts#L15).

**Verified pattern**: backtest page currently has `// TODO(Epic 7): add Tier 2 gate` ([backtest-client.tsx:14](apps/web/src/app/(dashboard)/dashboard/backtest/backtest-client.tsx#L14)) — Story 5.6 introduces the reusable component that Backtest can adopt later (parallel work).

### Swarm preset catalog

Source of truth: [Vibe-Trading/agent/SKILL.md](Vibe-Trading/agent/SKILL.md) and `Vibe-Trading/src/swarm/presets/` directory. As of 2026-05, the canonical 4 production-ready presets are:

| `name` | displayName | description | agentCount | requiredVars |
|---|---|---|---|---|
| `investment_committee` | Investment Committee | Bull analyst, bear analyst, neutral synthesizer debate a target | 3 | `target` (e.g. AAPL.US), `market` (us\|hk\|china_a\|crypto) |
| `quant_strategy_desk` | Quant Strategy Desk | Factor analyst, risk modeler, portfolio constructor | 3 | `universe`, `lookback_days` |
| `crypto_due_diligence` | Crypto Due Diligence | On-chain analyst, narrative analyst, tokenomics auditor | 3 | `token_address`, `chain` |
| `macro_regime_scout` | Macro Regime Scout | Macro economist, rates strategist, equity strategist | 3 | `region`, `horizon_months` |

Encode this as a const in `apps/web/src/components/swarm-teams/preset-catalog.ts` so it ships with the app. **DO NOT** call `list_swarm_presets` at runtime for this story (defer to v2 if VT adds presets faster than we ship UI updates).

### Source tree — files to CREATE

```
apps/web/src/app/(dashboard)/dashboard/shadow-account/page.tsx                  [server shell]
apps/web/src/app/(dashboard)/dashboard/shadow-account/shadow-account-client.tsx [client UI]
apps/web/src/app/(dashboard)/dashboard/swarm-teams/page.tsx                     [server shell]
apps/web/src/app/(dashboard)/dashboard/swarm-teams/swarm-teams-client.tsx       [client UI]
apps/web/src/components/swarm-teams/preset-catalog.ts                           [const data]
apps/web/src/components/tier-gate-banner.tsx                                    [shared, used by both pages]
apps/web/src/__tests__/shadow-account.test.tsx                                  [3 tests]
apps/web/src/__tests__/swarm-teams.test.tsx                                     [3 tests]
apps/api/src/__tests__/unit/shadow-reports-route.test.ts                        [3 tests]
```

### Source tree — files to UPDATE

| Path | What changes | What must be preserved |
|---|---|---|
| [apps/web/src/components/sidebar/sidebar-left.tsx:1630](apps/web/src/components/sidebar/sidebar-left.tsx#L1630) | Add 2 `<Button>` entries after "Markets"; add `Activity, Users` to lucide imports | All other nav entries unchanged. Collapsed icon-rail rendering uses the same nav state — make sure the new buttons render in the collapsed view too (reuse the existing pattern, don't fork). |
| [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts) | Add `GET /shadow-reports/:shadowId` handler. NEW imports: nothing new — `Hono`, `HTTPException`, `z`, `config`, types already imported. | Existing `/jobs`, `/runs/:id`, `/runs/:id/stream` routes UNCHANGED. Existing error classes (`VibeTradingNotFoundError` etc.) reused, not duplicated. |

### Previous story intelligence (Story 5.5)

From [5-5-vibe-trading-mcp-proxy.md](5-5-vibe-trading-mcp-proxy.md):

- The MCP proxy backend tier check is **enforced at proxy** ([vibe-trading-mcp.ts:67-71](apps/api/src/router/routes/vibe-trading-mcp.ts#L67-L71)). Tier 1 users hitting MCP tools get 403 from backend. Story 5.6's frontend tier gate is a UX courtesy — **do not rely on it for security**, the proxy is the real gate.
- `accountId` is only set by `epsilon_*` token path of `combinedAuth`, not Supabase JWT path. New shadow-reports route MUST guard `c.get('accountId')` and 401 if missing — admin/dashboard direct calls don't slip through.
- Tool naming convention: MCP tools billed as `vt_mcp_<toolName>` ([vibe-trading-mcp.ts:94](apps/api/src/router/routes/vibe-trading-mcp.ts#L94)). The Shadow Account 5-step loop will trigger 5 separate `deductToolCredits` calls — `vt_mcp_analyze_trade_journal`, `vt_mcp_extract_shadow_strategy`, `vt_mcp_run_shadow_backtest`, `vt_mcp_render_shadow_report`, `vt_mcp_scan_shadow_signals`. Pricing fallback `$0.01` if not in `TOOL_PRICING`. Operator may want to add explicit pricing later — not required for this story.

### Project context reference

From [_bmad-output/project-context.md](_bmad-output/project-context.md):
- Strict TypeScript, `interface` for objects / `type` for unions/primitives, no `any`
- React 18 (apps/web is React 18, NOT 19 despite project-context citing 19) — verify `package.json` if introducing React features
- TailwindCSS only — no inline styles, no CSS modules
- Use App Router; `'use client'` only at the leaf where interactivity is needed (page.tsx stays server)
- Bun test for `apps/web` and `apps/api` unit tests
- Never log secrets

From [CLAUDE.md](CLAUDE.md):
- Backend URL from FE: `getEnv().BACKEND_URL` already includes `/v1` — do NOT prepend `/v1/` again when fetching
- Endpoints prefix `/v1/` on backend; route this story adds is `GET /v1/router/vibe-trading/shadow-reports/:id`

### Testing notes

- For UI tests, the existing pattern uses Bun test with `@testing-library/react` (look at any existing `*.test.tsx` in `apps/web/src/__tests__/` for setup imports — reuse them; do NOT introduce Jest or Vitest)
- Mock `useSubscriptionStore` for tier scenarios; mock `useCreateOpenCodeSession` for dispatch assertions
- Mock `globalThis.fetch` for the route test (parity Story 2.3.2 service test pattern in [apps/api/src/__tests__/unit/token-terminal-service.test.ts](apps/api/src/__tests__/unit/token-terminal-service.test.ts))
- Use `bun test src/<path>` (single file or directory). Multi-file batches that share `../../config` mocks may collide — see Story 2.3.2 dev note. Run shadow-reports route test in isolation if it shares config mocks with other route tests.

### Latest technical information checked (2026-05-18)

- VT MCP server still uses `--transport sse` (not Streamable HTTP) per Story 5.5 architecture decision — does not affect this story (MCP is server-to-server).
- VT shadow report endpoint location: [api_server.py:1654-1676](Vibe-Trading/agent/api_server.py#L1654) returns `FileResponse` with `Content-Disposition: inline` so browsers render in-place. Path validation regex: `^shadow_[0-9a-f]{8}$`. Format whitelist: `html | pdf`. Auth required via `Depends(require_auth)`.
- Next.js 15 App Router (Turbopack) — server components are default; only mark `'use client'` where needed.
- Subscription store tier_key sentinels: `'free' | 'none' | undefined` are all Tier 1; explicit `'tier2'` / `'tier3'` (or product equivalents) gate the feature.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.6]
- [Source: _bmad-output/implementation-artifacts/5-5-vibe-trading-mcp-proxy.md]
- [Source: apps/api/src/router/routes/vibe-trading-mcp.ts] — existing MCP proxy (read-only for this story)
- [Source: apps/api/src/router/routes/vibe-trading.ts] — file to UPDATE
- [Source: apps/web/src/components/dashboard/dashboard-content.tsx#L103] — chat dispatch pattern
- [Source: apps/web/src/components/sidebar/sidebar-left.tsx#L1615] — sidebar nav pattern
- [Source: apps/web/src/features/files/api/opencode-files.ts#L273] — uploadFile helper
- [Source: apps/web/src/stores/subscription-store.tsx#L200] — tier check
- [Source: apps/web/src/stores/pricing-modal-store.ts] — upgrade modal
- [Source: Vibe-Trading/agent/api_server.py#L1654] — shadow report VT endpoint
- [Source: Vibe-Trading/agent/mcp_server.py#L580-L700] — Shadow Account MCP tools
- [Source: Vibe-Trading/agent/mcp_server.py#L311-L370] — Swarm preset MCP tools

## Dev Agent Record

### Agent Model Used

GPT-5 Codex (CLI)

### Debug Log References

- Added backend shadow report passthrough route in `apps/api/src/router/routes/vibe-trading.ts` with `shadowId` and `format` validation plus downstream status mapping (401/403/404 passthrough, generic upstream error as 503).
- Added unit test `apps/api/src/__tests__/unit/shadow-reports-route.test.ts` and ran it in isolation (`bun test ...shadow-reports-route.test.ts`) to avoid cross-file Bun mock collisions.
- Implemented FE pages and client components for Shadow Account and Swarm Teams under `apps/web/src/app/(dashboard)/dashboard/...` using canonical sessionStorage handoff with `agent: chainlens-tier2`.
- Added shared tier gate utility/component and static Swarm preset catalog; inserted Sidebar entries for Markets-adjacent navigation.
- Added FE tests `apps/web/src/__tests__/shadow-account.test.tsx` and `apps/web/src/__tests__/swarm-teams.test.tsx`, both passing.
- `bun run --cwd apps/web typecheck` could not run because script is missing in `apps/web/package.json`.
- `bun run --cwd apps/api typecheck` runs but currently fails with many pre-existing workspace errors not introduced by this story.

### Completion Notes List

- Implemented AC3 backend passthrough route: `GET /v1/router/vibe-trading/shadow-reports/:shadowId?format=html|pdf`.
- Implemented AC1 page shell/client for Shadow Account with Tier 1 upgrade banner, native file upload UX, and one-click AI analysis dispatch to new session.
- Implemented AC2 page shell/client for Swarm Teams with static preset catalog, dynamic modal inputs, non-blocking key-awareness banner, and one-click dispatch.
- Implemented AC4 sidebar entries: Shadow Account + Swarm Teams.
- Added AC5 tests for backend route and FE prompt/tier behaviors; all new tests pass in isolation.
- Remaining verification tasks are manual smoke checks and full typecheck baseline cleanup outside this story scope.

### File List

- apps/api/src/router/routes/vibe-trading.ts
- apps/api/src/router/services/shadow-ownership.ts
- apps/api/src/__tests__/unit/shadow-reports-route.test.ts
- apps/api/src/__tests__/unit/shadow-ownership.test.ts
- apps/web/src/components/sidebar/sidebar-left.tsx
- apps/web/src/components/tier-gate-banner.tsx
- apps/web/src/components/tier-gate.utils.ts
- apps/web/src/components/swarm-teams/preset-catalog.ts
- apps/web/src/app/(dashboard)/dashboard/shadow-account/page.tsx
- apps/web/src/app/(dashboard)/dashboard/shadow-account/shadow-account-client.tsx
- apps/web/src/app/(dashboard)/dashboard/shadow-account/shadow-account.utils.ts
- apps/web/src/app/(dashboard)/dashboard/swarm-teams/page.tsx
- apps/web/src/app/(dashboard)/dashboard/swarm-teams/swarm-teams-client.tsx
- apps/web/src/app/(dashboard)/dashboard/swarm-teams/swarm-teams.utils.ts
- apps/web/src/__tests__/shadow-account.test.tsx
- apps/web/src/__tests__/swarm-teams.test.tsx
- packages/db/drizzle/0010_shadow_account_ownership.sql
- packages/db/src/schema/epsilon.ts (added `shadowAccountOwnership` table)
- packages/db/src/index.ts (re-exported `shadowAccountOwnership`)



## Change Log

- 2026-05-18: Implemented Story 5.6 core functionality (backend passthrough + Shadow/Swarm FE + sidebar + tests). Story remains in-progress pending manual smoke/typecheck gates.
- 2026-05-18: Code review complete (16 patches applied, 3 deferred). Added TOFU shadow-ownership map (migration 0010 + service + tests), refactored to typed VT errors, fixed broken `isTier1` import + `uploadFile` array unpack, added zero-byte/MIME/multi-file guards, added 503 fallback for empty API key + downstream errors. Status moved to `review`.
