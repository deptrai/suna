# Story 5.5: Vibe-Trading MCP Proxy — Full 21-Tool Unlock

Status: ready-for-dev

**Depends on**: [Story 5.0](5-0-vibe-trading-platform-foundation.md) done (VT service deployed,
sandbox egress whitelist active), [Story 5.0.1](5-0-1-shadow-account-volume-hotfix.md) done
(shadow volumes).

<!-- Created 2026-05-12 (v3 — MCP proxy approach). Replaces archived HTTP-extension stories.
     Architecture: 1 epsilon-api proxy route intercepts MCP JSON-RPC tool calls for billing,
     then forwards to vibe-trading-mcp Streamable HTTP endpoint. 21 tools unlocked via ~180 LOC. -->

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

## Story

As a Tier 2 user trên Chainlens,
I want Epsilon agent có thể dùng toàn bộ 21 Vibe-Trading MCP tools (market data, options,
patterns, factor analysis, Shadow Account, swarm presets, finance skills, web search, file I/O),
so that tôi có một research toolkit hoàn chỉnh mà không cần tool bên ngoài.

## Acceptance Criteria

### AC1 — VT MCP Streamable HTTP service deployed

**Given** `Vibe-Trading/agent/mcp_server.py` supports `--transport sse --port 8900` (FastMCP 2.x
also supports Streamable HTTP at `/mcp` path)
**When** Story 5.5 ships
**Then** add new service `vibe-trading-mcp` to `scripts/compose/docker-compose.yml`:

```yaml
vibe-trading-mcp:
  image: ${COMPOSE_PROJECT_NAME:-chainlens}_vibe-trading  # reuse existing build
  command: python agent/mcp_server.py --transport sse --port 8900
  networks:
    - ${SANDBOX_NETWORK:-epsilon-network}
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
**And** health check: `curl http://vibe-trading-mcp:8900/mcp` returns valid MCP response
**And** NO new ports exposed to host (internal network only)

### AC2 — epsilon-api MCP proxy route with per-tool billing

**Given** sandbox → epsilon-api is the only allowed network path (NFR10)
**When** Story 5.5 ships
**Then** add proxy route `apps/api/src/router/routes/vibe-trading-mcp.ts`:

```
ALL /v1/router/vibe-trading-mcp/*  →  http://vibe-trading-mcp:8900/*
```

**Proxy behavior:**
1. Auth: `combinedAuth` (parity existing `/vibe-trading/*` routes)
2. For non-JSON-RPC requests (SSE connection, health): passthrough unmodified
3. For JSON-RPC `tools/call` requests:
   - Parse `params.name` from request body → lookup tool name
   - `checkCredits(accountId)` → 402 if insufficient
   - Log `[TIER-BYPASS-SUSPECT] mcp_tool=${toolName} account=${accountId}`
   - Forward to VT MCP server
   - On success: `deductToolCredits(accountId, toolName, ...)` ATOMIC before returning response
   - `sanitizeUpstreamErr` on VT errors
4. For other JSON-RPC methods (initialize, tools/list, resources/*): passthrough (free, no billing)

**Implementation reference (~120 dòng core logic):**

```ts
import { Hono } from 'hono';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import { config } from '../../config';
import type { AppContext } from '../../types';

const MCP_BASE = () => (config.VIBE_TRADING_INTERNAL_URL ?? 'http://vibe-trading-mcp:8900').replace(/\/+$/, '');

const BILLABLE_METHODS = new Set(['tools/call']);

export const vibeTradingMcp = new Hono<{ Variables: AppContext }>();

// Catch-all proxy
vibeTradingMcp.all('/*', async (c) => {
  const accountId = c.get('accountId');
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
  const toolName = jsonRpc?.params?.name ?? 'unknown';

  if (isBillable) {
    const credit = await checkCredits(accountId);
    if (!credit.hasCredits) return c.json({ error: 'Insufficient credits' }, 402);

    const ua = (c.req.header('user-agent') ?? '').slice(0, 80);
    console.log(`[TIER-BYPASS-SUSPECT] mcp_tool=${toolName} account=${accountId} ua="${ua}"`);
  }

  // Forward to VT MCP
  const resp = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
    signal: AbortSignal.timeout(30_000),
  });

  if (isBillable && resp.ok) {
    const cost = getToolCost(`vt_mcp_${toolName}`, 0);
    try {
      await deductToolCredits(accountId, `vt_mcp_${toolName}`, 0, `MCP: ${toolName}`);
    } catch (e) {
      console.warn(`[EPSILON][billing-failure] mcp_tool=${toolName} err=${e}`);
    }
  }

  return new Response(resp.body, { status: resp.status, headers: resp.headers });
});
```

### AC3 — OpenCode remote MCP config

**Given** `opencode.jsonc` already has `context7` remote MCP entry
**When** Story 5.5 ships
**Then** add `vibe-trading` entry to `mcp` section:

```jsonc
"vibe-trading": {
  "type": "remote",
  "url": "{env:EPSILON_API_URL}/v1/router/vibe-trading-mcp/mcp",
  "headers": {
    "Authorization": "Bearer {env:EPSILON_TOKEN}"
  },
  "enabled": true
}
```

**And** all 21 VT MCP tools auto-discovered by OpenCode via MCP `tools/list`
**And** sandbox egress unchanged — MCP URL points to epsilon-api (already whitelisted)

### AC4 — Tier 2 permission gate

**Given** OpenCode permission system per agent frontmatter
**When** Story 5.5 ships
**Then**:
- `chainlens-tier2.md`: add `vibe-trading: allow` (MCP server wildcard — all tools)
- `chainlens-tier1.md`: add `vibe-trading: deny`
- Note: `run_swarm` tool available at MCP level but requires user's OpenAI key in sandbox env (Story 5.7). Without key, VT returns error gracefully — no need for per-tool deny at OpenCode level.

### AC5 — Pricing tier per MCP tool

**Given** proxy intercepts `tools/call` and bills per `params.name`
**When** Story 5.5 ships
**Then** add to `apps/api/src/config.ts` TOOL_PRICING:

```ts
// VT MCP tools — prefix vt_mcp_ to distinguish from OpenCode tools
vt_mcp_list_skills:              { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_load_skill:               { baseCost: 0,    perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_get_market_data:          { baseCost: 0.05, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_analyze_options:          { baseCost: 0.02, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_pattern_recognition:     { baseCost: 0.05, perResultCost: 0, markupMultiplier: 1.0 },
vt_mcp_factor_analysis:         { baseCost: 0.30, perResultCost: 0, markupMultiplier: 1.0 },
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
```

**And** unknown tool names (future VT additions) fall through to default `getToolCost` = $0.01 (safe default, not free)

### AC6 — Agent system prompt updated

**Given** `chainlens-tier2.md` currently has wrong MCP refs from previous drafts
**When** Story 5.5 ships
**Then** update system prompt with:
- "Vibe-Trading MCP server provides 21 tools automatically — use them directly by name"
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
  - Non-POST (SSE/GET) → passthrough (≥1 test)
  - Unknown tool name → default pricing (≥1 test)
  - Total: ≥8 tests

- **Integration test** (gated `RUN_INTEGRATION_TESTS=1`):
  - Deploy → `curl http://vibe-trading-mcp:8900/mcp` returns MCP response
  - Proxy route → MCP tools/list returns 21+ tools

- **TypeScript**: `bunx tsc --noEmit` clean

### AC8 — Existing `vibe_trading_backtest` unchanged

**Given** Story 5.1 HTTP tool integrated with Backtest UI (SSE streaming, Phase A/B, equity curve)
**When** Story 5.5 ships
**Then** `vibe_trading_backtest` tool + route + service remain 100% unchanged
**And** both coexist: HTTP tool for UI-driven backtest, MCP `backtest` for agent-driven quick backtest

## Tasks / Subtasks

### Task 1 — VT MCP service in docker-compose (AC1)

- [ ] Add `vibe-trading-mcp` service to `scripts/compose/docker-compose.yml`
- [ ] Reuse existing `vibe-trading` image (same Python runtime, same code)
- [ ] Command: `python agent/mcp_server.py --transport sse --port 8900`
- [ ] Same network, resource limits, depends_on
- [ ] Verify: `docker compose up -d vibe-trading-mcp` → `curl http://localhost:8900/mcp` or internal DNS

### Task 2 — epsilon-api MCP proxy route (AC2)

- [ ] Create `apps/api/src/router/routes/vibe-trading-mcp.ts` (~120 LOC per AC2 template)
- [ ] Register in `apps/api/src/router/index.ts`: `router.use('/vibe-trading-mcp/*', combinedAuth)` + `router.route('/vibe-trading-mcp', vibeTradingMcp)`
- [ ] Add `VIBE_TRADING_MCP_URL` to `apps/api/src/config.ts` envSchema (optional, default `http://vibe-trading-mcp:8900`)

### Task 3 — OpenCode MCP config (AC3)

- [ ] Edit `core/epsilon-master/opencode/opencode.jsonc` — add `vibe-trading` MCP entry

### Task 4 — Tier permissions (AC4)

- [ ] `chainlens-tier2.md` frontmatter: `vibe-trading: allow`
- [ ] `chainlens-tier1.md` frontmatter: `vibe-trading: deny`

### Task 5 — Pricing (AC5)

- [ ] Add 21 TOOL_PRICING entries to `apps/api/src/config.ts`

### Task 6 — Agent system prompt (AC6)

- [ ] Rewrite "Vibe-Trading Research Tools" section in `chainlens-tier2.md` body

### Task 7 — Tests (AC7)

- [ ] Create `apps/api/src/__tests__/unit/vibe-trading-mcp-proxy.test.ts` (≥8 tests)
- [ ] Integration test (gated)
- [ ] TypeScript clean

### Task 8 — Documentation

- [ ] Update `core/docker/README.md` — new service section
- [ ] Update `core/epsilon-master/opencode/tools/README.md` — "VT MCP tools now auto-discovered"

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
// getToolCost returns 0.01 for unknown tools (existing default at config.ts:783)
```

This means new VT tools auto-work at $0.01/call until pricing table is updated. Safe default.

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
- `apps/api/src/router/routes/vibe-trading-mcp.ts` (~120 LOC)
- `apps/api/src/__tests__/unit/vibe-trading-mcp-proxy.test.ts`

**Modified files:**
- `scripts/compose/docker-compose.yml` — add `vibe-trading-mcp` service
- `apps/api/src/router/index.ts` — register proxy route
- `apps/api/src/config.ts` — add `VIBE_TRADING_MCP_URL` env + 21 TOOL_PRICING entries
- `core/epsilon-master/opencode/opencode.jsonc` — add remote MCP entry
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — permissions + system prompt
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` — deny permission
- `core/docker/README.md` — service documentation
- `core/epsilon-master/opencode/tools/README.md` — MCP tools section

**NOT modified:**
- `Vibe-Trading/` — ZERO submodule patches
- `core/epsilon-master/opencode/tools/vibe_trading_backtest.ts` — untouched
- `apps/api/src/router/routes/vibe-trading.ts` — existing HTTP routes untouched
- `core/init-scripts/95-egress-whitelist.sh` — egress unchanged
- `core/docker/Dockerfile` — no Python in sandbox

### Performance Budget

| Operation | Target |
|---|---|
| MCP service startup | <5s (Python + FastMCP WASM) |
| tools/list (via proxy) | <500ms |
| tools/call lightweight (list_skills, options) | <1s |
| tools/call heavy (factor_analysis, shadow backtest) | <30s |
| Proxy overhead per request | <10ms (parse JSON-RPC + billing lookup) |

### Risk Register

| Risk | Mitigation |
|---|---|
| FastMCP SSE deprecated in v3 | Pin `fastmcp>=2.0.0,<3.0.0` in VT requirements. Streamable HTTP is the upgrade path — same proxy works. |
| Billing parse failure (malformed JSON-RPC) | Passthrough as free (fail-open for billing — better than blocking user). Log warning. |
| VT MCP adds tool that should be expensive | Default $0.01 pricing. Review monthly. |
| SSE streaming through Hono middleware | Use Bun native `Response(resp.body)` bypass (parity `streamVibeTradingSSE` pattern). |

### References

- [OpenCode MCP config](core/epsilon-master/opencode/opencode.jsonc) — `context7` remote MCP reference
- [VT MCP server](Vibe-Trading/agent/mcp_server.py) — 22 tools, FastMCP 2.x
- [VT SKILL.md](Vibe-Trading/agent/SKILL.md) — capability inventory
- [Story 5.1](5-1-vibe-trading-api-integration-in-sandbox.md) — HTTP backtest tool (coexists)
- [Story 5.0](5-0-vibe-trading-platform-foundation.md) — egress whitelist foundation
- [FastMCP docs](https://gofastmcp.com/deployment/http) — Streamable HTTP transport
