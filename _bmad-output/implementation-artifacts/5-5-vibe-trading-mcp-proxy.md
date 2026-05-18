# Story 5.5: Vibe-Trading MCP Proxy — Full 22-Tool Unlock

Status: done

**Depends on**: [Story 5.0](5-0-vibe-trading-platform-foundation.md) done (VT service deployed,
sandbox egress whitelist active), [Story 5.0.1](5-0-1-shadow-account-volume-hotfix.md) done
(shadow volumes).

<!-- Created 2026-05-12 (v3 — MCP proxy approach). Replaces archived HTTP-extension stories.
     Architecture: 1 epsilon-api proxy route intercepts MCP JSON-RPC tool calls for billing,
     then forwards to vibe-trading-mcp SSE endpoint at /sse. 22 tools unlocked via ~180 LOC.
     Revised 2026-05-15 (post-VS validate): transport=sse + path=/sse (mcp_server.py argparse
     hard-codes choices=["stdio","sse"] at line 706 — Streamable HTTP `/mcp` would require
     submodule patch). Tier gate moved to backend proxy because OpenCode permission system
     does NOT cover MCP tools (verified — see Architecture Decision below). -->

## Architecture Decision — MCP Proxy over HTTP Extension (READ FIRST)

**Previous approach (archived):** Wrap each of 22 MCP tools individually as OpenCode tool →
epsilon-api Hono route → VT FastAPI endpoint. ~1500 dòng, 5 stories, 4-6 tuần.

**This approach:** Run `vibe-trading-mcp` as Streamable HTTP service (port 8900). epsilon-api
acts as a thin proxy that intercepts MCP `tools/call` JSON-RPC messages for billing, then
forwards to VT MCP server. OpenCode connects via remote MCP config (same pattern as `context7`).

**Why this is better:**

| Aspect | HTTP extension (archived) | MCP proxy (this story) |
|---|---|---|
| Lines of code | ~1500 (15 tools × ~100 LOC each) | ~180 total |
| Stories needed | 5 (5.5-5.9) | 2 (5.5 + 5.6 UI) |
| Ship time | 4-6 weeks | 1-2 weeks |
| New tool onboarding | 80 LOC per tool | 0 LOC (auto-discovered) |
| NFR8 billing | ✅ per-route deductToolCredits | ✅ proxy intercepts tools/call |
| NFR10 egress | ✅ sandbox → epsilon-api only | ✅ sandbox → epsilon-api only |
| VT submodule patches | ~225 dòng (15 endpoints) | 0 dòng |

**What stays the same:**
- `vibe_trading_backtest` OpenCode tool (Story 5.1) kept for heavy Celery backtest + SSE streaming
- Sandbox egress whitelist unchanged — sandbox still only calls epsilon-api
- Billing tracked via `deductToolCredits` pattern

**Coexistence with Story 5.1 (audit L1, 2026-05-18)**:
The repo ships **two distinct VT integration paths** by design — they are NOT competing/duplicate:

| Path | Story | Port | Use case |
|---|---|---|---|
| `/v1/router/vibe-trading/*` (REST) | 5.1 | `vibe-trading:8899` | Heavy backtest jobs (Celery, SSE streaming, equity curve, Phase A/B state machine) + shadow-reports file serving (5.6 AC3) |
| `/v1/router/vibe-trading-mcp/*` (MCP/SSE) | 5.5 | `vibe-trading-mcp:8900` | 22 lightweight tools (market data, options, factor analysis, swarm presets, Shadow Account ops, finance skills, file I/O) |

Both authenticated via `combinedAuth`; both billed via `deductToolCredits`; both share the same `epsilon.sandboxes.config.serviceKey` (token sync per Story 5.0.2). Do NOT consolidate.

## Story

As a Tier 2 user trên Chainlens,
I want Epsilon agent có thể dùng toàn bộ 22 Vibe-Trading MCP tools (market data, options,
patterns, factor analysis, Shadow Account, swarm presets, finance skills, web search, file I/O),
so that tôi có một research toolkit hoàn chỉnh mà không cần tool bên ngoài.

## Acceptance Criteria

### AC1 — VT MCP SSE service deployed

**Given** `Vibe-Trading/agent/mcp_server.py` argparse hard-codes `choices=["stdio", "sse"]` at
[mcp_server.py:706](Vibe-Trading/agent/mcp_server.py#L706) — Streamable HTTP would require a
submodule patch (out of scope for this story; tracked as future migration in Risk Register)
**When** Story 5.5 ships
**Then** add new service `vibe-trading-mcp` to `scripts/compose/docker-compose.yml`:

```yaml
vibe-trading-mcp:
  image: chainlens-vibe-trading:latest  # reuse existing build (verified line 42 of compose file)
  command: python agent/mcp_server.py --transport sse --port 8900
  networks:
    - ${SANDBOX_NETWORK:-sandbox-network}  # verified default at compose line 121
  environment:
    - PYTHONPATH=/app/agent
  depends_on:
    - vibe-trading
  restart: unless-stopped
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 512M
```

**And** service resolves via Docker DNS: `http://vibe-trading-mcp:8900`
**And** SSE endpoint path is **`/sse`** (FastMCP 2.x default for `--transport sse` per
`fastmcp.settings.sse_path = "/sse"`). Streamable HTTP path `/mcp` is NOT used in this story.
**And** health check: `curl http://vibe-trading-mcp:8900/sse` opens SSE stream (returns
`text/event-stream` headers); for liveness probe use `curl -I` and check 200/SSE Content-Type.
**And** NO new ports exposed to host (internal network only)

### AC2 — epsilon-api MCP proxy route with per-tool billing + tier gate

**Given** sandbox → epsilon-api is the only allowed network path (NFR10)
**When** Story 5.5 ships
**Then** add proxy route `apps/api/src/router/routes/vibe-trading-mcp.ts`:

```
ALL /v1/router/vibe-trading-mcp/*  →  http://vibe-trading-mcp:8900/*
```

**Proxy behavior:**
1. Auth: `combinedAuth` (parity existing `/vibe-trading/*` routes). NOTE: only the
   `epsilon_*` token path of `combinedAuth` sets `accountId` on context (verified
   [middleware/auth.ts:158-236](apps/api/src/middleware/auth.ts#L158)). Supabase JWT
   path sets `userId` only — proxy MUST guard `c.get('accountId')` and 401 if missing,
   so admin/dashboard direct calls do not slip through with broken billing.
2. **Tier gate (CRITICAL):** OpenCode's per-agent permission system DOES NOT cover MCP
   tools — they bypass agent permission filtering entirely (verified — see Risk
   Register R5). Therefore the ONLY enforcement point for Tier 1 vs Tier 2 access is
   this proxy. On `tools/call`, resolve account tier (via existing tier-resolution
   helper used by other Tier 2 routes; if none exists, add one keyed off
   `accountId → billing tier`) and `403` Tier 1 with `{ error: "Tier 2 required" }`
   before forwarding. `tools/list` and `initialize` remain free for all tiers.
3. For non-JSON-RPC requests (SSE connection — i.e. `GET /sse`, health checks):
   passthrough unmodified.
4. For JSON-RPC `tools/call` requests (POST):
   - Parse `params.name` from request body → tool name
   - **Tier check** (per step 2)
   - `checkCredits(accountId)` → 402 if insufficient
   - Log `[TIER-BYPASS-SUSPECT] mcp_tool=${toolName} account=${accountId} ua="${ua}"`
   - Forward to VT MCP server
   - On success: `deductToolCredits(accountId, \`vt_mcp_${toolName}\`, 0, \`MCP: ${toolName}\`)` ATOMIC before returning response
   - **`sanitizeUpstreamErr`** applied ONLY when response Content-Type is JSON (not
     SSE). For SSE streams, pass through `resp.body` unchanged — chunk-level sanitize
     would break the stream. Document this trade-off; SSE error frames remain
     unsanitized.
5. For other JSON-RPC methods (initialize, tools/list, resources/*): passthrough
   (free, no billing).
6. **Billing fail-open hardening:** if request body parses as JSON-RPC `tools/call`
   but `params.name` is missing/empty/non-string, REJECT with 400 — do NOT
   passthrough as free. This closes the malformed-payload free-ride vector.

**Implementation reference (~120 dòng core logic):**

```ts
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { checkCredits, deductToolCredits } from '../services/billing';
import { sanitizeUpstreamErr } from '../services/sanitize';
import { getToolCost, config } from '../../config';
import type { AppContext } from '../../types';

// VT MCP base URL. Reuses VIBE_TRADING_INTERNAL_URL host with port 8900,
// or override via dedicated VIBE_TRADING_MCP_URL (added to envSchema in Task 2).
const MCP_BASE = () => (config.VIBE_TRADING_MCP_URL ?? 'http://vibe-trading-mcp:8900').replace(/\/+$/, '');

const BILLABLE_METHODS = new Set(['tools/call']);

export const vibeTradingMcp = new Hono<{ Variables: AppContext }>();

// Catch-all proxy
vibeTradingMcp.all('/*', async (c) => {
  const accountId = c.get('accountId');
  if (!accountId) throw new HTTPException(401, { message: 'accountId required (epsilon_* token only)' });

  const targetPath = c.req.path.replace(/^\/v1\/router\/vibe-trading-mcp/, '');
  const targetUrl = `${MCP_BASE()}${targetPath || '/'}`;

  // Non-POST = SSE stream or health — passthrough
  if (c.req.method !== 'POST') {
    const resp = await fetch(targetUrl, {
      method: c.req.method,
      headers: { 'Accept': c.req.header('accept') ?? '*/*' },
    });
    return new Response(resp.body, { status: resp.status, headers: resp.headers });
  }

  // POST — may be JSON-RPC tools/call
  const rawBody = await c.req.text();
  let jsonRpc: { method?: string; params?: { name?: string } } | null = null;
  try { jsonRpc = JSON.parse(rawBody); } catch { /* not JSON-RPC, passthrough */ }

  const isBillable = jsonRpc?.method && BILLABLE_METHODS.has(jsonRpc.method);
  if (isBillable) {
    const toolName = jsonRpc?.params?.name;
    if (!toolName || typeof toolName !== 'string') {
      // Closes fail-open: malformed tools/call must not get free passthrough
      return c.json({ error: 'Missing or invalid params.name on tools/call' }, 400);
    }

    // Tier gate — Tier 1 forbidden (MCP tools bypass OpenCode permission)
    const tier = await resolveAccountTier(accountId);  // helper to add/reuse
    if (tier !== 'tier2' && tier !== 'tier3') {
      return c.json({ error: 'Tier 2 required for Vibe-Trading MCP tools' }, 403);
    }

    const credit = await checkCredits(accountId);
    if (!credit.hasCredits) return c.json({ error: 'Insufficient credits' }, 402);

    const ua = (c.req.header('user-agent') ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80);
    console.log(`[TIER-BYPASS-SUSPECT] mcp_tool=${toolName} account=${accountId} ua="${ua}"`);

    // Forward
    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
      signal: AbortSignal.timeout(30_000),
    });

    if (resp.ok) {
      try {
        await deductToolCredits(accountId, `vt_mcp_${toolName}`, 0, `MCP: ${toolName}`);
      } catch (e) {
        console.warn(`[EPSILON][billing-failure] mcp_tool=${toolName} err=${e}`);
      }
    }

    // sanitizeUpstreamErr: JSON only, never on SSE chunks
    const ct = resp.headers.get('content-type') ?? '';
    if (!resp.ok && ct.includes('application/json')) {
      const errText = await resp.text();
      return c.json({ error: sanitizeUpstreamErr(errText) }, resp.status as any);
    }
    return new Response(resp.body, { status: resp.status, headers: resp.headers });
  }

  // Non-billable JSON-RPC (initialize, tools/list) — passthrough free
  const resp = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
    signal: AbortSignal.timeout(30_000),
  });
  return new Response(resp.body, { status: resp.status, headers: resp.headers });
});
```

### AC3 — OpenCode remote MCP config

**Given** `opencode.jsonc` already has `context7` remote MCP entry (verified — uses
custom header key `CONTEXT7_API_KEY`, NOT `Authorization: Bearer`)
**When** Story 5.5 ships
**Then** add `vibe-trading` entry to `mcp` section:

```jsonc
"vibe-trading": {
  "type": "remote",
  "url": "{env:EPSILON_API_URL}/v1/router/vibe-trading-mcp/sse",
  "headers": {
    "Authorization": "Bearer {env:EPSILON_TOKEN}"
  },
  "enabled": true
}
```

**And** verify `combinedAuth` middleware accepts `Authorization: Bearer epsilon_*`
header forwarded by OpenCode MCP client (it does — verified
[middleware/auth.ts:158](apps/api/src/middleware/auth.ts#L158))
**And** all 22 VT MCP tools auto-discovered by OpenCode via MCP `tools/list`
**And** sandbox egress unchanged — MCP URL points to epsilon-api (already whitelisted)
**And** URL path is `/sse` (matching FastMCP SSE transport, AC1) — NOT `/mcp`

### AC4 — Tier 2 permission gate (BACKEND-enforced, not OpenCode)

**Given** OpenCode's per-agent `permission:` system covers built-in tools (bash, read,
edit, webfetch) but **does NOT filter MCP tools** — they bypass agent permission
filtering entirely (verified — see Risk Register R5).
**When** Story 5.5 ships
**Then** the ONLY tier-gate enforcement point is the backend proxy `tools/call`
handler (per AC2 step 2). OpenCode `opencode.jsonc` controls only on/off via
`"enabled": true/false` per server.
**And** OpenCode agent files do NOT need new `permission:` entries for the 22
`vt_mcp_*` tools — adding them would be misleading because they have no effect.
- `chainlens-tier2.md` and `chainlens-tier1.md` frontmatter: NO change required
  for MCP tools. Existing per-tool permissions for built-in OpenCode tools
  (bash/read/edit/etc.) remain unchanged.
- `chainlens-tier2.md` system prompt body MUST be updated (per AC6) to inform Tier 2
  agent about the 22 MCP tools.
- `chainlens-tier1.md` system prompt body should NOT advertise MCP tools (Tier 1
  will receive 403 from proxy if it tries to call them).
**And** `run_swarm` requires user's OpenAI key in sandbox env (Story 5.7). Without
key, VT returns error gracefully — proxy still bills (the call did execute) but
returns the upstream error.

### AC5 — Pricing tier per MCP tool (22 tools)

**Given** proxy intercepts `tools/call` and bills per `params.name`
**When** Story 5.5 ships
**Then** add to `apps/api/src/config.ts` `TOOL_PRICING` (defined at line 686):

```ts
// VT MCP tools — prefix vt_mcp_ to distinguish from OpenCode tools
vt_mcp_list_skills:              { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_load_skill:               { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_get_market_data:          { baseCost: 0.05, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_analyze_options:          { baseCost: 0.02, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_pattern_recognition:      { baseCost: 0.05, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_factor_analysis:          { baseCost: 0.30, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_backtest:                 { baseCost: 0.50, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_analyze_trade_journal:    { baseCost: 0.10, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_extract_shadow_strategy:  { baseCost: 0.15, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_run_shadow_backtest:      { baseCost: 0.50, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_render_shadow_report:     { baseCost: 0.10, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_scan_shadow_signals:      { baseCost: 0.05, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_web_search:               { baseCost: 0.01, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_read_url:                 { baseCost: 0.02, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_read_document:            { baseCost: 0.10, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_write_file:               { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_read_file:                { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_list_swarm_presets:       { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_run_swarm:                { baseCost: 0.25, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_get_swarm_status:         { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_get_run_result:           { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_list_runs:                { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
```

**And** unknown tool names (future VT additions) fall through to default
`getToolCost` = $0.01 — verified default at
[apps/api/src/config.ts:811](apps/api/src/config.ts#L811) (safe default, not free)

### AC6 — Agent system prompt updated

**Given** `chainlens-tier2.md` currently has wrong MCP refs from previous drafts
**When** Story 5.5 ships
**Then** update system prompt with:
- "Vibe-Trading MCP server provides 22 tools automatically — use them directly by name"
- Tool selection guidance: when to use `vibe_trading_backtest` (Story 5.1 HTTP tool, heavy async + UI integration) vs MCP `backtest` (quick vectorized, immediate result)
- Shadow Account loop sequence (5 steps)
- Swarm Teams: `run_swarm` requires user's OpenAI key, guide to Settings → AI Keys
- Web research disambiguation: prefer `web_search` (Perplexity) over MCP `web_search` (DuckDuckGo)
- Supported asset formats table

### AC7 — Tests

- **Proxy route tests** (`apps/api/src/__tests__/unit/vibe-trading-mcp-proxy.test.ts`):
  - JSON-RPC tools/call → billing triggered (≥3 tests)
  - Non-billable methods (tools/list, initialize) → passthrough free (≥2 tests)
  - Insufficient credits → 402 (≥1 test)
  - Tier 1 calling tools/call → 403 with "Tier 2 required" (≥1 test)
  - Missing accountId (JWT-only path) → 401 (≥1 test)
  - Malformed tools/call (missing params.name) → 400, NOT free passthrough (≥1 test)
  - Non-POST (SSE/GET) → passthrough (≥1 test)
  - Unknown tool name → default pricing $0.01 (≥1 test)
  - sanitizeUpstreamErr applied to JSON error response, NOT to SSE chunks (≥1 test)
  - Total: ≥12 tests

- **Integration test** (gated `RUN_INTEGRATION_TESTS=1`):
  - Deploy → `curl http://vibe-trading-mcp:8900/sse` opens SSE stream (note: path is
    `/sse` per FastMCP `--transport sse`, NOT `/mcp`)
  - Proxy route → MCP `tools/list` returns 22+ tools

- **TypeScript**: `bunx tsc --noEmit` clean

### AC8 — Existing `vibe_trading_backtest` unchanged

**Given** Story 5.1 HTTP tool integrated with Backtest UI (SSE streaming, Phase A/B, equity curve)
**When** Story 5.5 ships
**Then** `vibe_trading_backtest` tool + route + service remain 100% unchanged
**And** both coexist: HTTP tool for UI-driven backtest, MCP `backtest` for agent-driven quick backtest

## Tasks / Subtasks

### Task 1 — VT MCP service in docker-compose (AC1)

- [x] Add `vibe-trading-mcp` service to `scripts/compose/docker-compose.yml`
- [x] Reuse existing `vibe-trading` image (same Python runtime, same code)
- [x] Command: `python agent/mcp_server.py --transport sse --port 8900`
- [x] Same network, resource limits, depends_on
- [x] Verify: `docker compose up -d vibe-trading-mcp` → `curl http://localhost:8900/mcp` or internal DNS

### Task 2 — epsilon-api MCP proxy route (AC2)

- [x] Create `apps/api/src/router/routes/vibe-trading-mcp.ts` (~140 LOC per AC2 template)
- [x] Register in `apps/api/src/router/index.ts`: `router.use('/vibe-trading-mcp/*', combinedAuth)` + `router.route('/vibe-trading-mcp', vibeTradingMcp)` (parity existing `/vibe-trading/*` registration at [router/index.ts:41-62](apps/api/src/router/index.ts#L41))
- [x] Add `VIBE_TRADING_MCP_URL` to `apps/api/src/config.ts` envSchema (optional, default `http://vibe-trading-mcp:8900`) — envSchema defined at [config.ts:58](apps/api/src/config.ts#L58)
- [x] Add or reuse `resolveAccountTier(accountId): 'tier1'|'tier2'|'tier3'` helper for AC2 step 2 tier gate. Verify against existing tier-resolution pattern (search `services/billing.ts` first; if not present, document where to add)

### Task 3 — OpenCode MCP config (AC3)

- [x] Edit `core/epsilon-master/opencode/opencode.jsonc` — add `vibe-trading` MCP entry with URL path `/sse` (NOT `/mcp`)

### Task 4 — Tier permissions (AC4) — NO OpenCode frontmatter changes

- [x] **NO change** to `chainlens-tier1.md` / `chainlens-tier2.md` `permission:` block
  for MCP tools (OpenCode permission system does not cover MCP tools — verified).
  Tier gate is enforced backend-only per AC2 step 2.
- [x] Update `chainlens-tier2.md` system prompt body per AC6 (separate from
  permission block).
- [x] Update `chainlens-tier1.md` system prompt body to NOT advertise MCP tools (Tier
  1 will receive 403 if it tries).

### Task 5 — Pricing (AC5)

- [x] Add 22 TOOL_PRICING entries to `apps/api/src/config.ts` (existing
  `vibe_trading_backtest` entry stays; 22 new `vt_mcp_*` entries appended)

### Task 6 — Agent system prompt (AC6)

- [x] Rewrite "Vibe-Trading Research Tools" section in `chainlens-tier2.md` body
  (note: 22 tools, NOT 21)

### Task 7 — Tests (AC7)

- [x] Create `apps/api/src/__tests__/unit/vibe-trading-mcp-proxy.test.ts` (13 tests — ≥12 required)
- [x] Integration test (gated) — verify `/sse` path, NOT `/mcp`
- [x] TypeScript clean

### Task 8 — Documentation

- [x] Update `core/docker/README.md` — new service section
- [x] Update `core/epsilon-master/opencode/tools/README.md` — "VT MCP tools now auto-discovered"

## Dev Notes

### MCP JSON-RPC format reference

FastMCP Streamable HTTP endpoint at `/mcp` receives JSON-RPC 2.0:

```json
// tools/list (free, no billing)
{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}

// tools/call (billable)
{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_market_data", "arguments": {"codes": ["BTC-USDT"], "start_date": "2025-01-01", "end_date": "2026-01-01"}}}
```

Proxy parses `method` + `params.name` to determine billing. All other fields forwarded as-is.

### Billing fallback for unknown tools

VT may add tools in future updates. Proxy uses:
```ts
const cost = getToolCost(`vt_mcp_${toolName}`, 0);
// getToolCost returns 0.01 for unknown tools (existing default at config.ts:811)
```

This means new VT tools auto-work at $0.01/call until pricing table is updated. Safe default.

### `deductToolCredits` signature note

Real signature (verified [services/billing.ts:45](apps/api/src/router/services/billing.ts#L45)):
```ts
deductToolCredits(
  accountId: string,
  toolName: string,
  resultCount: number = 0,   // NOTE: parameter name is `resultCount`, not `count`
  description?: string,
  sessionId?: string,
  options?: { skipDevCheck?: boolean }
)
```
Pass `0` for `resultCount` (MCP tools are flat-priced, not per-result). Spec template uses arg
order correctly.

### SSE streaming through proxy

MCP Streamable HTTP uses SSE for server→client streaming. Proxy must forward SSE responses
correctly. Bun's `fetch` returns a `ReadableStream` body — proxy returns it directly:
```ts
return new Response(resp.body, { status: resp.status, headers: resp.headers });
```

This preserves SSE chunked encoding. Verified: existing `streamVibeTradingSSE` in vibe-trading.ts
uses same pattern for backtest SSE.

### Why separate `vibe-trading-mcp` container (not co-hosted)

Could add `--transport sse --port 8900` to existing `vibe-trading` FastAPI container. But:
1. Different Python entry point (`mcp_server.py` vs `api_server.py`)
2. Independent resource limits (MCP is lightweight read-only; FastAPI handles Celery queue)
3. Independent restart (MCP crash doesn't kill FastAPI and vice versa)
4. Docker image is SHARED (no extra build) — just different CMD

### Source Tree Components to Touch

**NEW files:**
- `apps/api/src/router/routes/vibe-trading-mcp.ts` (~140 LOC)
- `apps/api/src/__tests__/unit/vibe-trading-mcp-proxy.test.ts`

**Modified files:**
- `scripts/compose/docker-compose.yml` — add `vibe-trading-mcp` service (image:
  `chainlens-vibe-trading:latest`, network: `${SANDBOX_NETWORK:-sandbox-network}`)
- `apps/api/src/router/index.ts` — register proxy route (parity existing
  `/vibe-trading/*` registration at line 41-62)
- `apps/api/src/config.ts` — add `VIBE_TRADING_MCP_URL` to envSchema (line 58 area)
  + 22 TOOL_PRICING entries (line 686 area)
- `core/epsilon-master/opencode/opencode.jsonc` — add remote MCP entry, URL ends in `/sse`
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — system prompt body
  ONLY (AC6); no permission frontmatter changes for MCP tools
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` — system prompt body
  ONLY (AC4); no permission frontmatter changes for MCP tools
- `core/docker/README.md` — service documentation
- `core/epsilon-master/opencode/tools/README.md` — MCP tools section

**NOT modified:**
- `Vibe-Trading/` — ZERO submodule patches
- `core/epsilon-master/opencode/tools/vibe_trading_backtest.ts` — untouched
- `apps/api/src/router/routes/vibe-trading.ts` — existing HTTP routes untouched
- `core/init-scripts/95-egress-whitelist.sh` — egress unchanged
- `core/docker/Dockerfile` — no Python in sandbox

### Performance Budget

| Operation | Target | Notes |
|---|---|---|
| MCP service startup | <5s | Python + FastMCP cold start |
| `tools/list` (via proxy) | <500ms | **OPTIONAL: cache 5min TTL via in-memory Map keyed by upstream URL — every sandbox session calls this at least once on init. Implementation parity with existing JIT cache (services/jit-cache.ts).** |
| `tools/call` lightweight (list_skills, options) | <1s | |
| `tools/call` heavy (factor_analysis, shadow backtest) | <30s | matches `AbortSignal.timeout(30_000)` in proxy |
| Proxy overhead per request | <10ms | parse JSON-RPC + tier lookup + billing lookup |

### Risk Register

| ID | Risk | Mitigation |
|---|---|---|
| R1 | FastMCP 3.x is now GA. SSE transport is **NOT removed** in 3.x — risk is rather that 2.x enters maintenance-only mode and bug-fix lag. | `Vibe-Trading/agent/requirements.txt` and `pyproject.toml` currently pin `fastmcp>=2.0.0` (no upper bound — verified). Decision: defer migration to 3.x to a follow-up VT story. Story 5.5 stays on 2.x SSE. |
| R2 | Billing parse failure (malformed JSON-RPC) | Proxy now REJECTS `tools/call` without valid `params.name` (400) per AC2 step 6 — closes the fail-open free-ride vector. Other malformed JSON passes through and VT MCP server errors out (free, but blocked at VT layer). |
| R3 | VT MCP adds tool that should be expensive | Default $0.01 pricing. Review monthly. |
| R4 | SSE streaming through Hono middleware | Use Bun native `Response(resp.body)` bypass (parity `streamVibeTradingSSE` pattern at [vibe-trading.ts:254-341](apps/api/src/router/routes/vibe-trading.ts#L254)). Do NOT add Hono compression middleware to this route — would buffer SSE. |
| R5 | **OpenCode permission system does not cover MCP tools** — they bypass agent permission filtering. Tier 1 user could call MCP tools if proxy weren't gated. | Tier gate enforced at backend proxy ONLY (AC2 step 2). Verified: OpenCode docs + source — `permission:` only filters built-in tools. |
| R6 | Streamable HTTP migration (future) | `mcp_server.py` argparse hard-codes `choices=["stdio","sse"]` ([line 706](Vibe-Trading/agent/mcp_server.py#L706)). Future migration to Streamable HTTP requires VT submodule patch + path change `/sse → /mcp` in `opencode.jsonc` + AC1 health check. Tracked as separate VT story; out of scope for 5.5. |
| R7 | `combinedAuth` Supabase JWT path doesn't set `accountId` ([middleware/auth.ts:158-236](apps/api/src/middleware/auth.ts#L158)) | Proxy 401s any request without `accountId` (AC2 step 1). Admin/dashboard direct calls must use `epsilon_*` token (or extend `combinedAuth` to resolve `userId → accountId` — out of scope). |

### References

- [OpenCode MCP config](core/epsilon-master/opencode/opencode.jsonc) — `context7` remote MCP reference (uses custom header key `CONTEXT7_API_KEY`, not `Authorization: Bearer` — but both patterns work)
- [VT MCP server](Vibe-Trading/agent/mcp_server.py) — 22 tools, FastMCP 2.x, argparse `choices=["stdio","sse"]` at [line 706](Vibe-Trading/agent/mcp_server.py#L706)
- [VT SKILL.md](Vibe-Trading/agent/SKILL.md) — capability inventory (22 tools)
- [Story 5.1](5-1-vibe-trading-api-integration-in-sandbox.md) — HTTP backtest tool (coexists)
- [Story 5.0](5-0-vibe-trading-platform-foundation.md) — egress whitelist foundation
- [FastMCP docs](https://gofastmcp.com/deployment/http) — SSE + Streamable HTTP transports
- [combinedAuth middleware](apps/api/src/middleware/auth.ts) — auth context provider
- [billing.ts](apps/api/src/router/services/billing.ts) — `checkCredits` + `deductToolCredits`

## Change Log

- **2026-05-15 (post-VS validate review):** Applied 15 fixes after running
  `/bmad-create-story validate` skill. Critical changes:
  - **C1 — Transport/path conflict:** Spec used `--transport sse` but URL/health-check
    pointed to `/mcp` (Streamable HTTP path). FastMCP 2.x `--transport sse` exposes
    `/sse`, NOT `/mcp`. Submodule `mcp_server.py` argparse hard-codes
    `choices=["stdio","sse"]` so we can't switch to `streamable-http` without a
    submodule patch. Fixed by aligning all paths to `/sse` and tracking Streamable
    HTTP migration as Risk R6.
  - **C2 — OpenCode MCP permission:** Spec assumed `vibe-trading: allow` in agent
    frontmatter would gate Tier 2 access. Verified OpenCode permission system does
    NOT cover MCP tools. Tier gate moved to backend proxy `tools/call` handler
    (AC2 step 2). Risk R5 added.
  - **C3 — accountId on JWT path:** `combinedAuth` only sets `accountId` for the
    `epsilon_*` token path. Proxy now 401s if `accountId` missing. Risk R7 added.
  - **C4 — docker-compose values:** image was `chainlens-vibe-trading:latest`
    (hardcoded), network default was `sandbox-network` (not `epsilon-network`).
    Fixed in AC1 + Source Tree.
  - **C5 — Tool count:** 22 tools (not 21 as title/AC5 said). Added
    `vt_mcp_list_runs` to pricing table. All 22 names verified against
    `mcp_server.py` `@mcp.tool` decorators.
  - **E1 — `getToolCost` line:** corrected from line 783 to line 811.
  - **E2 — FastMCP version pin:** acknowledged that `fastmcp>=2.0.0` has no upper
    bound; spec no longer asserts `<3.0.0` is in place.
  - **E4 — FastMCP 3.x SSE:** corrected risk register — SSE is NOT removed in 3.x;
    real risk is 2.x maintenance lag.
  - **E6 — sanitizeUpstreamErr:** template now applies sanitize ONLY to JSON error
    responses, never to SSE chunks.
  - **O1 — Billing fail-open:** malformed `tools/call` (missing `params.name`) now
    returns 400, not free passthrough.
  - **L1 — Missing import:** template now imports `config` from `../../config`
    alongside `getToolCost`.
