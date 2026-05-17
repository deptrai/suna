# OpenCode Custom Tools

Custom tools for the Epsilon OpenCode plugin. Each `.ts` file is auto-discovered and registered as a tool.

All tools call the epsilon-api proxy (`EPSILON_API_URL/v1/router/{tool}`) — they do NOT call external APIs directly.

## vibe_trading_backtest

**Tier**: Tier 2 only (`chainlens-tier2.md` — `vibe_trading_backtest: allow`)

Submits a backtest job to Vibe-Trading and polls for completion within a 30-second budget.

### Phases

| Phase | Condition | Returns |
|-------|-----------|---------|
| A (current) | `status="unknown"` + `data_summary` present (2-poll confirmation) | `phase:"A"`, `status:"data_loaded"`, `data_summary` |
| B (after VT Epic 2.3) | `status="success"` + `metrics.sharpe` populated | `phase:"B"`, `metrics`, `equity_curve`, `trade_log` |

Phase A confirms data load from Binance/exchange. Phase B returns full backtest results.

### Key constraints (mirrored from Pydantic)

- `instrument_type`: `"SPOT"` or `"PERPETUAL"` — NOT `"FUTURES"`
- `historical_range`: 1–3650 days
- `timeframe`: regex `/^\d+[mhdwM]$/` — e.g. `"1m"`, `"4h"`, `"1d"`, `"1w"`, `"1M"`
- SPOT + `leverage > 1.0` → rejected

### Timeout behavior

Job continues in background after the 30-second budget. The tool returns `{ success: false, run_id, error: "...timeout...job_id..." }` so the agent can retry via `run_id`.

### Backend route

`POST /v1/router/vibe-trading/jobs` → `GET /v1/router/vibe-trading/runs/:jobId`

Billing: 1.00 credit per job submission (`vibe_trading_backtest` in `TOOL_PRICING`).

## mempool_alerts

**Tier**: Tier 2 only (`chainlens-tier2.md` — `mempool_alerts: allow`, Tier 1 denied)

Reads pre-indexed mempool alert data from the internal route.

### Backend route

`GET /v1/router/mempool-alerts`

Query parameters: `chain` (string), `alert_type` (enum: `large_swap`/`sandwich_suspect`/`frontrun_suspect`/`unknown_large_tx`), `min_value_usd` (number, finite), `limit` (1–100, default 50), `since_minutes` (1–1440, default 60).

### Billing

0.05 credit baseline per query (`mempool_alerts` in `TOOL_PRICING`). Billing is `combinedAuth` + atomic `checkCredits` → `deductToolCredits` (NFR8 parity with `token-info`/`token-holders`).

### Default behaviour

If the tool omits `since_minutes`, the route default of 60 minutes applies. The tool currently only forwards `since_minutes` when the LLM provides a numeric value — adjust both ends if defaults are ever tightened.

### Key constraints

- Tool only queries epsilon-api/DB cache (no upstream WebSocket).
- Tool does not connect to QuickNode/Blocknative or open any mempool WebSocket.
- Continuous sniffing is handled by the background worker (`mempool-worker`) only.

---

## entity_wallet_risk

**File**: `entity_wallet_risk.ts`

**Tier**: Tier 2 only (`chainlens-tier2.md` — `entity_wallet_risk: allow`, Tier 1 denied)

**Purpose**: Check if a wallet address belongs to a known risky entity (hacker, sanctioned, mixer, etc.) or analyze the top holders of a token contract for concentration risk and known bad actors. Uses Arkham Intelligence labels cached in the `entity_wallet_labels` and `token_holder_entity_risks` DB tables.

### Modes

- **wallet**: Checks a single address against `entity_wallet_labels`. Returns entity info + risk classification.
- **token_holders**: Analyzes `token_holder_entity_risks` for a token contract. Returns holder count, risky holder count, and risk factors.

### Backend route

`POST /v1/router/entity-wallet-risk`

Body: `{ mode, chain, address?, token_address?, session_id? }`

### Key constraints

- Tool calls epsilon-api only (`EPSILON_API_URL/v1/router/entity-wallet-risk`). Never calls Arkham or QuickNode directly.
- Arkham API key stays strictly backend-only (`apps/api`). Never exposed to OpenCode or frontend.
- `raw_response` column is never included in tool responses (provider ToS risk).
- First call for an unknown token address triggers a BullMQ job (`analyze-token-holders`) and returns `cache_status: 'pending'`. Retry after 60s.
- Worker only runs if `ARKHAM_WORKER_ENABLED=true` and `ARKHAM_API_KEY` is set.

---

## smart_money_flow

**File**: `smart_money_flow.ts`

**Tier**: Tier 2 only (`chainlens-tier2.md` — `smart_money_flow: allow`, Tier 1 denied)

**Purpose**: Analyze smart money and whale activity for a token using Nansen data. Modes: `token_god_mode` (full TGM analysis), `smart_money_netflow` (net buy/sell flows), `top_buyers`, `top_sellers`, `exchange_flows`.

### Cache behavior

| `cache_status` | Meaning | Cost |
|---|---|---|
| `cache_fresh` | Returned from DB cache within TTL | 0 |
| `cache_stale` | Returned from expired cache (provider rate-limited) | 0 |
| `live` | Freshly fetched from Nansen | credits deducted |
| `queued` | No cache; background job enqueued — retry in 30s | 0 |

### Provider boundary

- Tool calls epsilon-api only (`EPSILON_API_URL/v1/router/smart-money-flow`). **Never uses `NANSEN_API_KEY` directly.**
- `NANSEN_API_KEY` stays strictly backend-only (`apps/api/src/router/services/nansen.ts`). Never forwarded to OpenCode, frontend, or error responses.

### Backend route

`POST /v1/router/smart-money-flow`

Body: `{ chain, token_address, mode, lookback_hours?, limit?, force_refresh?, session_id? }`

### Supported chains

`ethereum`, `base`, `arbitrum`, `polygon`, `solana`, `bsc`, `avalanche`, `optimism`

### Billing

0.20 credit per live provider fetch (`smart_money_flow` in `TOOL_PRICING`). Cache hits cost 0.

### Key constraints

- Worker only runs if `NANSEN_SMART_MONEY_WORKER_ENABLED=true` and `NANSEN_API_KEY` is set.
- Worker uses `Promise.allSettled` — partial TGM data (some calls fail) is committed with `status: 'partial'`.
- `attribution: 'Powered by Nansen API'` must be shown to users per provider ToS.

---

## protocol_valuation

**File**: `protocol_valuation.ts`

**Tier**: Tier 2 only (`chainlens-tier2.md` — `protocol_valuation: allow`, Tier 1 denied)

**Purpose**: Cache-first protocol fundamentals and valuation matrix (fees/revenue/earnings/users/devs + P/S/P/F/P/E) sourced from Token Terminal data cached by backend worker.

### Backend route

`POST /v1/router/protocol-valuation`

Body: `{ mode, project_id?, symbol?, token_address?, sector?, peer_project_ids?, metrics?, force_refresh?, session_id? }`

### Provider boundary

- Tool calls epsilon-api only (`EPSILON_API_URL/v1/router/protocol-valuation`).
- Tool never sees or uses `TOKEN_TERMINAL_API_KEY`.
- `TOKEN_TERMINAL_API_KEY` remains strictly backend-only.

### Cache and billing behavior

- `cache_status: cache_fresh` => DB cache hit, cost `0`.
- `cache_status: live` => explicit live refresh path, credits deducted (`protocol_valuation` in `TOOL_PRICING`).
- If worker/provider is unconfigured, route returns actionable `unconfigured/no_data` response.

---

## Vibe-Trading MCP Tools (Story 5.5)

22 tools are auto-discovered via the `vibe-trading` remote MCP server configured in
`opencode.jsonc`. They do NOT have individual OpenCode tool files — the MCP protocol handles
discovery automatically.

**Tier**: Tier 2 only — enforced at the epsilon-api proxy (`/v1/router/vibe-trading-mcp/*`).
OpenCode's `permission:` system does NOT cover MCP tools; the backend proxy is the only gate.

**Billing**: Each `tools/call` is intercepted by the proxy, which calls `checkCredits` and
`deductToolCredits` with the `vt_mcp_<toolName>` key. Pricing is in `TOOL_PRICING` in `config.ts`.
Unknown future tools default to $0.01/call.

**SSE transport**: The `vibe-trading-mcp` container runs FastMCP 2.x with `--transport sse`.
The SSE endpoint is at `/sse` (NOT `/mcp` which is Streamable HTTP). The `opencode.jsonc` URL
ends in `/sse` accordingly.

**Coexistence**: `vibe_trading_backtest` (HTTP tool, Story 5.1) remains unchanged. Use it for
UI-driven backtests with equity curve streaming. Use MCP `backtest` for quick agent-driven
signal validation.
